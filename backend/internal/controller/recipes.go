package controller

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"eatme/internal/store"
)

type AddRecipeRequest struct {
	RecipeName   string  `json:"recipe_name"`
	Servings     int     `json:"servings"`
	Instructions *string `json:"instructions"` // optional
}

type RestockRequest struct {
	Multiplier *int `json:"multiplier"` // optional, 1 or more; default 1
}

type AddIngredientRequest struct {
	VariantID int `json:"variant_id"`
	Grams     int `json:"grams"` // for the recipe's servings, not per serving
}

type recipeCookWriter interface {
	CookRecipe(
		ctx context.Context,
		userID int,
		recipeID int,
		lines []store.CookLine,
	) ([]store.CookResult, error)
}

type RecipeController struct {
	store      *store.Store
	cookWriter recipeCookWriter
}

func NewRecipeController(s *store.Store) *RecipeController {
	return &RecipeController{
		store:      s,
		cookWriter: s,
	}
}

// boolParam reads an optional true/false query parameter, defaulting to false.
func boolParam(r *http.Request, name string) (bool, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return false, nil
	}
	return strconv.ParseBool(v)
}

// List returns one page of the logged-in user's recipes, ranked by inventory coverage.
// Query params (all optional): include_shared, shared (true/false), page and multiplier (1 or more).
// The user id comes from the token, never the request.
func (c *RecipeController) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	includeShared, err1 := boolParam(r, "include_shared")
	shared, err2 := boolParam(r, "shared")
	if err1 != nil || err2 != nil {
		http.Error(w, "include_shared and shared must be true or false", http.StatusBadRequest)
		return
	}

	page, multiplier := 1, 1
	if v := r.URL.Query().Get("page"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p < 1 {
			http.Error(w, "page must be 1 or more", http.StatusBadRequest)
			return
		}
		page = p
	}
	if v := r.URL.Query().Get("multiplier"); v != "" {
		m, err := strconv.Atoi(v)
		if err != nil || m < 1 {
			http.Error(w, "multiplier must be 1 or more", http.StatusBadRequest)
			return
		}
		multiplier = m
	}

	recipes, err := c.store.GetRecipes(r.Context(), userID, includeShared, shared, page, multiplier)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid input", http.StatusBadRequest)
		case errors.Is(err, store.ErrSessionUserGone):
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		default:
			log.Printf("get recipes failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(recipes)
}

// Add creates a recipe header for the logged-in user. The user id comes from the token.
func (c *RecipeController) Add(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req AddRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.RecipeName)
	if name == "" || req.Servings < 1 || req.Servings > 3650 {
		http.Error(w, "recipe_name is required and servings must be 1 to 3650", http.StatusBadRequest)
		return
	}

	id, err := c.store.AddRecipe(r.Context(), userID, name, req.Servings, req.Instructions)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrRecipeExists):
			http.Error(w, "you already have a recipe with this name", http.StatusConflict)
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid recipe data", http.StatusBadRequest)
		case errors.Is(err, store.ErrSessionUserGone):
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		default:
			log.Printf("add recipe failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]int{"recipe_id": id})
}

// Ingredients lists a recipe's ingredients. The recipe must be the user's own, or a grantor's.
func (c *RecipeController) Ingredients(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	recipeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || recipeID <= 0 {
		http.Error(w, "invalid recipe id", http.StatusBadRequest)
		return
	}

	ingredients, err := c.store.GetIngredients(r.Context(), userID, recipeID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid input", http.StatusBadRequest)
		case errors.Is(err, store.ErrRecipeNotFound):
			http.Error(w, "recipe not found", http.StatusNotFound) // same for missing and inaccessible
		default:
			log.Printf("get ingredients failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ingredients)
}

// AddIngredient adds one of the user's variants to one of their own recipes.
// The user id comes from the token, never the request.
func (c *RecipeController) AddIngredient(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	recipeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || recipeID <= 0 {
		http.Error(w, "invalid recipe id", http.StatusBadRequest)
		return
	}

	var req AddIngredientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VariantID <= 0 || req.Grams <= 0 {
		http.Error(w, "variant_id and grams (1 or more) are required", http.StatusBadRequest)
		return
	}

	id, err := c.store.AddIngredient(r.Context(), userID, recipeID, req.VariantID, req.Grams)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid ingredient data", http.StatusBadRequest)
		case errors.Is(err, store.ErrRecipeNotFound):
			http.Error(w, "recipe not found", http.StatusNotFound)
		case errors.Is(err, store.ErrVariantNotFound):
			http.Error(w, "variant not found", http.StatusNotFound)
		case errors.Is(err, store.ErrAlreadyInRecipe):
			http.Error(w, "variant is already in this recipe", http.StatusConflict)
		case errors.Is(err, store.ErrNoFreePosition):
			http.Error(w, "recipe has no free positions left", http.StatusConflict)
		default:
			log.Printf("add ingredient failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]int{"ingredient_id": id})
}

// CookRecipe handles cooking a recipe using selected pantry instances.
// The user ID comes from the authenticated session, not the request.
func (c *RecipeController) CookRecipe(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID <= 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		RecipeID int              `json:"recipe_id"`
		Lines    []store.CookLine `json:"lines"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.RecipeID <= 0 || len(req.Lines) == 0 {
		http.Error(w, "recipe_id and at least one line are required", http.StatusBadRequest)
		return
	}

	for _, line := range req.Lines {
		if line.InstanceID <= 0 || line.Grams <= 0 {
			http.Error(w, "instance_id and grams must be positive", http.StatusBadRequest)
			return
		}
	}

	results, err := c.cookWriter.CookRecipe(
		r.Context(),
		userID,
		req.RecipeID,
		req.Lines,
	)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid cooking request", http.StatusBadRequest)

		case errors.Is(err, store.ErrUserNotFound):
			http.Error(w, "unauthorized", http.StatusUnauthorized)

		case errors.Is(err, store.ErrRecipeNotFound):
			http.Error(w, "recipe not found", http.StatusNotFound)

		case errors.Is(err, store.ErrInstanceNotFound):
			http.Error(w, "instance not found", http.StatusNotFound)

		case errors.Is(err, store.ErrInsufficientInventory):
			http.Error(w, "insufficient or expired inventory", http.StatusConflict)

		case errors.Is(err, store.ErrDuplicateInstance):
			http.Error(w, "duplicate instance", http.StatusConflict)

		default:
			log.Printf("cook recipe failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(results)
}

// Restock registers the recipe's ingredients as open demand on the user's own variants.
// The user id comes from the token, never the request.
func (c *RecipeController) Restock(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	recipeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || recipeID <= 0 {
		http.Error(w, "invalid recipe id", http.StatusBadRequest)
		return
	}

	// The body is optional: an empty body means multiplier 1.
	var req RestockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	multiplier := 1
	if req.Multiplier != nil {
		if *req.Multiplier < 1 {
			http.Error(w, "multiplier must be 1 or more", http.StatusBadRequest)
			return
		}
		multiplier = *req.Multiplier
	}

	lines, err := c.store.RestockRecipe(r.Context(), userID, recipeID, multiplier)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid input", http.StatusBadRequest)
		case errors.Is(err, store.ErrSessionUserGone):
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		case errors.Is(err, store.ErrRecipeNotFound):
			http.Error(w, "recipe not found", http.StatusNotFound)
		default:
			log.Printf("restock recipe failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(lines)
}
