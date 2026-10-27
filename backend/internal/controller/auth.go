package controller

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"eatme/internal/auth"
	"eatme/internal/config"
	"eatme/internal/model"
	"eatme/internal/store"
)

type ctxKey string

const usernameKey ctxKey = "username"

type AuthController struct {
	cfg   config.Config
	store *store.Store
}

func NewAuthController(cfg config.Config, s *store.Store) *AuthController {
	return &AuthController{cfg: cfg, store: s}
}

type CredentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

// Create hashes the password and saves username + hash.
func (c *AuthController) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req CredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	hash, err := model.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if err := c.store.CreateUser(r.Context(), req.Username, hash); err != nil {
		if errors.Is(err, store.ErrUserExists) {
			http.Error(w, "user already exists", http.StatusConflict)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	log.Printf("DEBUG saved user=%s hash=%s", req.Username, hash) // remove later
	w.WriteHeader(http.StatusCreated)
}

// Login verifies the password against the stored hash and issues a 23h JWT.
func (c *AuthController) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req CredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	hash, err := c.store.GetPasswordHash(r.Context(), req.Username)
	if err != nil || !model.CheckPassword(hash, req.Password) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	token, err := auth.IssueToken([]byte(c.cfg.JWTSecret), req.Username)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(LoginResponse{Token: token})
}

// Me returns the username from the validated token.
func (c *AuthController) Me(w http.ResponseWriter, r *http.Request) {
	username, ok := r.Context().Value(usernameKey).(string)
	if !ok || username == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"username": username})
}

// RequireAuth validates the bearer JWT and puts the username in the request context.
func (c *AuthController) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(r.Header.Get("Authorization"), " ")
		if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" {
			http.Error(w, "missing or invalid bearer token", http.StatusUnauthorized)
			return
		}
		username, err := auth.ParseToken([]byte(c.cfg.JWTSecret), parts[1])
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), usernameKey, username)
		next(w, r.WithContext(ctx))
	}
}