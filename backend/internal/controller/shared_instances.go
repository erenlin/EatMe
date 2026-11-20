package controller

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"eatme/internal/store"
)

// SharedInstanceReader allows the handler to be tested without a database.
type SharedInstanceReader interface {
	GetSharedInstances(context.Context, int) ([]store.SharedInstance, error)
}

type SharedInstancesController struct {
	reader SharedInstanceReader
}

func NewSharedInstancesController(reader SharedInstanceReader) *SharedInstancesController {
	return &SharedInstancesController{reader: reader}
}

// Shared handles GET /instances/shared.
// The authenticated user's ID comes from the token.
func (c *SharedInstancesController) Shared(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(int)
	if !ok || userID <= 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	instances, err := c.reader.GetSharedInstances(r.Context(), userID)
	if err != nil {
		log.Printf("list shared instances failed: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(instances)
}
