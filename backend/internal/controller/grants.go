package controller

import (
	"encoding/json"
	"log"
	"net/http"
	"errors"
	"strings"

	"eatme/internal/store"
)

type GrantController struct {
	store *store.Store
}

func NewGrantController(s *store.Store) *GrantController {
	return &GrantController{store: s}
}

// Handle routes /grants by method: GET lists, POST shares.
func (g *GrantController) Handle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		g.List(w, r)
	case http.MethodPost:
		g.Share(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
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

type ShareRequest struct {
	GranteeEmail string `json:"grantee_email"`
}

// Share gives another user (identified by email) access to the logged-in user's data.
func (g *GrantController) Share(w http.ResponseWriter, r *http.Request) {
	grantorID, ok := r.Context().Value(userIDKey).(int)
	if !ok || grantorID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.GranteeEmail) == "" {
		http.Error(w, "grantee_email is required", http.StatusBadRequest)
		return
	}

	// Look up the grantee id by email. No match gets the same 404 as an unknown id.
	email := strings.ToLower(strings.TrimSpace(req.GranteeEmail))
	granteeID, _, err := g.store.FetchUser(r.Context(), email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "grantee not found", http.StatusNotFound)
			return
		}
		log.Printf("grantee lookup failed: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	result, err := g.store.GrantShare(r.Context(), grantorID, granteeID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrSelfGrant):
			http.Error(w, "you cannot share with yourself", http.StatusBadRequest)
		case errors.Is(err, store.ErrGranteeNotFound):
			http.Error(w, "grantee not found", http.StatusNotFound)
		case errors.Is(err, store.ErrAlreadyShared):
			http.Error(w, "already shared with this user", http.StatusConflict)
		default:
			log.Printf("grant share failed: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}