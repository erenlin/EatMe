package controller

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"eatme/internal/store"

	"github.com/jackc/pgx/v5/pgconn"
)

type ExpiryController struct {
	store *store.Store
}

func NewExpiryController(s *store.Store) *ExpiryController {
	return &ExpiryController{store: s}
}

type SetExpiryRequest struct {
	StoreMode  *string `json:"store_mode"`
	ExpiryDays *int    `json:"expiry_days"`
}

type DeleteExpiryRequest struct {
	StoreMode *string `json:"store_mode"`
}

// expiryIDs extracts the authenticated user ID and variant ID.
func expiryIDs(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID <= 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return 0, 0, false
	}

	variantID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || variantID <= 0 {
		http.Error(w, "invalid variant_id", http.StatusBadRequest)
		return 0, 0, false
	}

	return userID, variantID, true
}

// expiryError maps PostgreSQL errors to HTTP responses.
func expiryError(w http.ResponseWriter, err error, operation string) {
	var pgErr *pgconn.PgError

	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23502", "22P02", "22003":
			http.Error(w, "invalid expiry data", http.StatusBadRequest)
			return

		case "23514":
			if operation == "delete" {
				http.Error(
					w,
					"cannot delete default store mode expiry",
					http.StatusConflict,
				)
			} else {
				http.Error(
					w,
					"invalid expiry_days",
					http.StatusBadRequest,
				)
			}
			return

		case "P0002":
			if operation == "delete" && pgErr.Detail == "store_mode" {
				http.Error(
					w,
					"expiry not found for store mode",
					http.StatusNotFound,
				)
			} else {
				http.Error(
					w,
					"variant not found",
					http.StatusNotFound,
				)
			}
			return
		}
	}

	log.Printf("%s variant expiry failed: %v", operation, err)
	http.Error(w, "server error", http.StatusInternalServerError)
}

// Get handles GET /variants/{id}/expiry.
func (c *ExpiryController) Get(w http.ResponseWriter, r *http.Request) {
	userID, variantID, ok := expiryIDs(w, r)
	if !ok {
		return
	}

	expiries, err := c.store.GetVariantExpiry(
		r.Context(), userID, variantID,
	)
	if err != nil {
		expiryError(w, err, "get")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(expiries)
}

// Set handles POST /variants/{id}/expiry.
func (c *ExpiryController) Set(w http.ResponseWriter, r *http.Request) {
	userID, variantID, ok := expiryIDs(w, r)
	if !ok {
		return
	}

	var req SetExpiryRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.StoreMode == nil || req.ExpiryDays == nil {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	mode := *req.StoreMode
	if mode != "room" && mode != "fridge" && mode != "freezer" {
		http.Error(w, "invalid store_mode", http.StatusBadRequest)
		return
	}

	if *req.ExpiryDays < 1 || *req.ExpiryDays > 3650 {
		http.Error(w, "expiry_days must be between 1 and 3650", http.StatusBadRequest)
		return
	}

	expiry, err := c.store.SetVariantExpiry(
		r.Context(), userID, variantID, mode, *req.ExpiryDays,
	)
	if err != nil {
		expiryError(w, err, "set")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(expiry)
}

// Delete handles DELETE /variants/{id}/expiry.
func (c *ExpiryController) Delete(w http.ResponseWriter, r *http.Request) {
	userID, variantID, ok := expiryIDs(w, r)
	if !ok {
		return
	}

	var req DeleteExpiryRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.StoreMode == nil || strings.TrimSpace(*req.StoreMode) == "" {
		http.Error(w, "missing store_mode", http.StatusBadRequest)
		return
	}

	mode := *req.StoreMode
	if mode != "room" && mode != "fridge" && mode != "freezer" {
		http.Error(w, "invalid store_mode", http.StatusBadRequest)
		return
	}

	expiry, err := c.store.DeleteVariantExpiry(
		r.Context(), userID, variantID, mode,
	)
	if err != nil {
		expiryError(w, err, "delete")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(expiry)
}
