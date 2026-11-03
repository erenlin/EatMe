
package controller

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"eatme/internal/store"

	"github.com/jackc/pgx/v5/pgconn"
)

type InstanceController struct {
	store *store.Store
}

func NewInstanceController(s *store.Store) *InstanceController {
	return &InstanceController{store: s}
}

type AddInstanceRequest struct {
	VariantID       int        `json:"variant_id"`
	Quantity        *int       `json:"quantity"`
	UnitWeightGrams *int       `json:"unit_weight_grams"`
	StoreMode       *string    `json:"store_mode"`
	ExpiryModifier  *int       `json:"expiry_modifier"`
	AddedAt         *time.Time `json:"added_at"`
}

// AddInstance handles POST /instances.
// This handler must be wrapped with RequireAuth.
func (c *InstanceController) AddInstance(w http.ResponseWriter, r *http.Request) {
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
			log.Printf("instance user lookup failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	var req AddInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.VariantID <= 0 {
		http.Error(w, "invalid variant_id", http.StatusBadRequest)
		return
	}

	quantity := 1
	if req.Quantity != nil {
		quantity = *req.Quantity
	}
	if quantity <= 0 {
		http.Error(w, "quantity must be positive", http.StatusBadRequest)
		return
	}

	if req.UnitWeightGrams != nil && *req.UnitWeightGrams <= 0 {
		http.Error(w, "unit_weight_grams must be positive", http.StatusBadRequest)
		return
	}

	expiryModifier := 0
	if req.ExpiryModifier != nil {
		expiryModifier = *req.ExpiryModifier
	}
	if expiryModifier < -3650 || expiryModifier > 3650 {
		http.Error(w, "invalid expiry_modifier", http.StatusBadRequest)
		return
	}

	if req.AddedAt != nil && req.AddedAt.After(time.Now()) {
		http.Error(w, "added_at cannot be in the future", http.StatusBadRequest)
		return
	}

	instance, err := c.store.AddInstance(r.Context(), store.AddInstanceParams{
		UserID:          userID,
		VariantID:       req.VariantID,
		Quantity:        quantity,
		UnitWeightGrams: req.UnitWeightGrams,
		StoreMode:       req.StoreMode,
		ExpiryModifier:  expiryModifier,
		AddedAt:         req.AddedAt,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23502", "23514", "22P02", "22003":
				http.Error(w, "invalid instance data", http.StatusBadRequest)
				return
			case "P0002":
				if pgErr.Detail == "store_mode" {
					http.Error(w, "expiry not configured for store mode", http.StatusConflict)
				} else {
					http.Error(w, "variant not found or not accessible", http.StatusNotFound)
				}
				return
			}
		}

		log.Printf("add instance failed: %v", err)
		http.Error(w, "could not create instance", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(instance)
}
