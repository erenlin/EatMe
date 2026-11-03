package controller

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"eatme/internal/store"
)

type InstanceController struct {
	store *store.Store
}

func NewInstanceController(s *store.Store) *InstanceController {
	return &InstanceController{store: s}
}

// List returns active instances of one of the logged-in user's variants.
// Use ?include_shared=true to add instances shared by grantors.
func (c *InstanceController) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	variantID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || variantID <= 0 {
		http.Error(w, "invalid variant id", http.StatusBadRequest)
		return
	}

	includeShared := false
	if v := r.URL.Query().Get("include_shared"); v != "" {
		includeShared, err = strconv.ParseBool(v)
		if err != nil {
			http.Error(w, "include_shared must be true or false", http.StatusBadRequest)
			return
		}
	}

	instances, err := c.store.GetInstances(r.Context(), userID, variantID, includeShared)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInvalidInput):
			http.Error(w, "invalid input", http.StatusBadRequest)
		case errors.Is(err, store.ErrVariantNotFound):
			http.Error(w, "variant not found", http.StatusNotFound)
		default:
			log.Printf("get instances failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(instances)
}
