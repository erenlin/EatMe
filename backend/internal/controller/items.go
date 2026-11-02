package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"log"
	"net/http"
	"strconv"
	"strings"

	"eatme/internal/store"
)

// ItemController handles item-related API requests.
type ItemController struct {
	store *store.Store
}

func NewItemController(s *store.Store) *ItemController {
	return &ItemController{store: s}
}

// LookupItems handles GET requests for item searches.
// This handler must be wrapped with RequireAuth.
func (c *ItemController) LookupItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Retrieve the email placed in context by RequireAuth.
	email, ok := r.Context().Value(usernameKey).(string)
	if !ok || email == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve the authenticated email to its database user ID.
	userID, _, err := c.store.FetchUser(r.Context(), email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		} else {
			log.Printf("item lookup user resolution failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	// Read the optional query and shared parameters.
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	query = strings.ReplaceAll(query, "%", "")
	query = strings.ReplaceAll(query, "_", "")

	sharedParam := r.URL.Query().Get("shared")
	if sharedParam != "" && sharedParam != "true" && sharedParam != "false" {
		http.Error(w, "shared must be true or false", http.StatusBadRequest)
		return
	}
	shared := sharedParam == "true"

	items, err := c.store.LookupItems(r.Context(), userID, query, shared)
	if err != nil {
		log.Printf("item lookup failed: %v", err)
		http.Error(w, "could not retrieve items", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// LookupVariants handles GET requests for item variant searches.
// This handler must be wrapped with RequireAuth.
func (c *ItemController) LookupVariants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Retrieve the authenticated user's email.
	email, ok := r.Context().Value(usernameKey).(string)
	if !ok || email == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve the authenticated email to its database user ID.
	userID, _, err := c.store.FetchUser(r.Context(), email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		} else {
			log.Printf("variant lookup user resolution failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	// Parse and validate the required item_id.
	itemID, err := strconv.Atoi(r.URL.Query().Get("item_id"))
	if err != nil || itemID <= 0 {
		http.Error(w, "invalid item_id", http.StatusBadRequest)
		return
	}

	// Read the optional search parameters.
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	query = strings.ReplaceAll(query, "%", "")
	query = strings.ReplaceAll(query, "_", "")

	sharedParam := r.URL.Query().Get("shared")
	if sharedParam != "" && sharedParam != "true" && sharedParam != "false" {
		http.Error(w, "shared must be true or false", http.StatusBadRequest)
		return
	}
	shared := sharedParam == "true"

	// Retrieve matching variants from PostgreSQL.
	variants, err := c.store.LookupVariants(
		r.Context(), userID, itemID, query, shared,
	)
	if err != nil {
		log.Printf("variant lookup failed: %v", err)
		http.Error(w, "could not retrieve variants", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(variants)
}

type AddItemRequest struct {
	ItemName string `json:"item_name"`
}

// AddItem handles POST requests to create grocery items.
// This handler must be wrapped with RequireAuth.
func (c *ItemController) AddItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Retrieve the authenticated user's email.
	email, ok := r.Context().Value(usernameKey).(string)
	if !ok || email == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve the email to the database user ID.
	userID, _, err := c.store.FetchUser(r.Context(), email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		} else {
			log.Printf("add item user lookup failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	// Decode and validate the request body.
	var req AddItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	req.ItemName = strings.TrimSpace(req.ItemName)
	if req.ItemName == "" {
		http.Error(w, "item_name is required", http.StatusBadRequest)
		return
	}

	// Create the item in PostgreSQL.
	item, err := c.store.AddItem(r.Context(), userID, req.ItemName)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23505":
				http.Error(w, "item already exists", http.StatusConflict)
				return
			case "23502":
				http.Error(w, "invalid item data", http.StatusBadRequest)
				return
			case "23503":
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}

		log.Printf("add item failed: %v", err)
		http.Error(w, "could not create item", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(item)
}

type AddVariantRequest struct {
	ItemID             int    `json:"item_id"`
	VariantName        string `json:"variant_name"`
	TypicalWeightGrams int    `json:"typical_weight_grams"`
	ServingGrams       int    `json:"serving_grams"`
	DefaultExpiryDays  int    `json:"default_expiry_days"`
	CountingMethod     string `json:"counting_method"`
	DefaultStoreMode   string `json:"default_store_mode"`
	IconPNG            []byte `json:"icon_png"`
}

// AddVariant handles POST requests to create item variants.
// This handler must be wrapped with RequireAuth.
func (c *ItemController) AddVariant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	email, ok := r.Context().Value(usernameKey).(string)
	if !ok || email == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID, _, err := c.store.FetchUser(r.Context(), email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		} else {
			log.Printf("add variant user lookup failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	// Decode and validate the request.
	var req AddVariantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	req.VariantName = strings.TrimSpace(req.VariantName)

	if req.ItemID <= 0 || req.VariantName == "" ||
		req.TypicalWeightGrams <= 0 ||
		req.ServingGrams <= 0 ||
		req.DefaultExpiryDays <= 0 {
		http.Error(w, "invalid variant data", http.StatusBadRequest)
		return
	}

	// Apply defaults for optional fields.
	if req.CountingMethod == "" {
		req.CountingMethod = "divisible"
	}
	if req.DefaultStoreMode == "" {
		req.DefaultStoreMode = "room"
	}

	// Validate counting method and serving size.
	if req.CountingMethod != "divisible" && req.CountingMethod != "numerable" {
		http.Error(w, "invalid counting_method", http.StatusBadRequest)
		return
	}

	if req.CountingMethod == "divisible" &&
		req.ServingGrams > req.TypicalWeightGrams {
		http.Error(w, "serving size exceeds typical weight", http.StatusBadRequest)
		return
	}

	if req.CountingMethod == "numerable" &&
		req.ServingGrams < req.TypicalWeightGrams {
		http.Error(w, "invalid serving size for numerable item", http.StatusBadRequest)
		return
	}

	// Validate the optional PNG icon.
	if len(req.IconPNG) > 100000 {
		http.Error(w, "icon exceeds 100KB", http.StatusBadRequest)
		return
	}
	if len(req.IconPNG) > 0 &&
		(len(req.IconPNG) < 8 ||
			!bytes.Equal(req.IconPNG[:8],
				[]byte{137, 80, 78, 71, 13, 10, 26, 10})) {
		http.Error(w, "icon must be a PNG", http.StatusBadRequest)
		return
	}

	variant, err := c.store.AddVariant(r.Context(), store.AddVariantParams{
		UserID:             userID,
		ItemID:             req.ItemID,
		VariantName:        req.VariantName,
		TypicalWeightGrams: req.TypicalWeightGrams,
		ServingGrams:       req.ServingGrams,
		DefaultExpiryDays:  req.DefaultExpiryDays,
		CountingMethod:     req.CountingMethod,
		DefaultStoreMode:   req.DefaultStoreMode,
		IconPNG:            req.IconPNG,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23505":
				http.Error(w, "variant already exists", http.StatusConflict)
				return
			case "23502", "23514", "22P02":
				http.Error(w, "invalid variant data", http.StatusBadRequest)
				return
			case "P0002":
				http.Error(w, "item not found or not accessible", http.StatusNotFound)
				return
			}
		}

		log.Printf("add variant failed: %v", err)
		http.Error(w, "could not create variant", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(variant)
}
