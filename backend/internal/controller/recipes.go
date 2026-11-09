package controller

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"eatme/internal/store"
)

type RecipeController struct {
	store *store.Store
}

func NewRecipeController(s *store.Store) *RecipeController {
	return &RecipeController{store: s}
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
// Query params (all optional): include_shared, shared, weighted (true/false), page (1 or more).
// The user id comes from the token, never the request.
func (c *RecipeController) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	includeShared, err1 := boolParam(r, "include_shared")
	shared, err2 := boolParam(r, "shared")
	weighted, err3 := boolParam(r, "weighted")
	if err1 != nil || err2 != nil || err3 != nil {
		http.Error(w, "include_shared, shared and weighted must be true or false", http.StatusBadRequest)
		return
	}

	page := 1
	if v := r.URL.Query().Get("page"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p < 1 {
			http.Error(w, "page must be 1 or more", http.StatusBadRequest)
			return
		}
		page = p
	}

	recipes, err := c.store.GetRecipes(r.Context(), userID, includeShared, shared, weighted, page)
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
