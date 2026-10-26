package handlers

import (
    "context"
    "encoding/json"
    "net/http"
    "os"
    "strings"
)

type AuthHandler struct{}

func NewAuthHandler() *AuthHandler {
    return &AuthHandler{}
}

type LoginRequest struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type LoginResponse struct {
    Token string `json:"token"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    // later: compare password against a stored hashed value
    fileA, err := os.ReadFile("fileA.txt")
    if err != nil {
        http.Error(w, "server error", http.StatusInternalServerError)
        return
    }

    fileB, err := os.ReadFile("fileB.txt")
    if err != nil {
        http.Error(w, "server error", http.StatusInternalServerError)
        return
    }

    if strings.TrimSpace(string(fileA)) != strings.TrimSpace(string(fileB)) {
        http.Error(w, "invalid credentials", http.StatusUnauthorized)
        return
    }

    // later: generate JWT here
    token := "replace-with-jwt-token"

    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(LoginResponse{Token: token})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
    username, ok := r.Context().Value("username").(string)
    if !ok || username == "" {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]string{
        "username": username,
    })
}

func (h *AuthHandler) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if authHeader == "" {
            http.Error(w, "missing bearer token", http.StatusUnauthorized)
            return
        }

        parts := strings.Split(authHeader, " ")
        if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" {
            http.Error(w, "invalid authorization header", http.StatusUnauthorized)
            return
        }

        // later: validate JWT and set username from token claims
        username := "placeholder-user"

        ctx := context.WithValue(r.Context(), "username", username)
        next(w, r.WithContext(ctx))
    }
}