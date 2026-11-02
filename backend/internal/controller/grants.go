package controller

import (
	"encoding/json"
	"log"
	"net/http"

	"eatme/internal/store"
)

type GrantController struct {
	store *store.Store
}

func NewGrantController(s *store.Store) *GrantController {
	return &GrantController{store: s}
}

// List returns the logged-in user's grants. The user id comes from the token, never the request.
func (g *GrantController) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	grants, err := g.store.ListGrants(r.Context(), userID)
	if err != nil {
		log.Printf("list grants failed: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(grants)
}