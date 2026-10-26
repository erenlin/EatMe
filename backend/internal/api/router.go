package api

import (
	"net/http"

	"eatme/internal/api/handlers"
	"eatme/internal/store"
)

// NewRouter creates the HTTP router for the app.
func NewRouter(dataStore *store.Store) http.Handler {
	mux := http.NewServeMux()

	healthHandler := handlers.NewHealthHandler()
	// userHandler := handlers.NewUserHandler(dataStore)
	authHandler := handlers.NewAuthHandler()

	mux.Handle("/health", healthHandler)
	// mux.HandleFunc("/users", userHandler.ListUsers)
	// mux.HandleFunc("/users/create", userHandler.CreateUser)

	mux.HandleFunc("/login", authHandler.Login)
    mux.HandleFunc("/me", authHandler.RequireAuth(authHandler.Me))

	return mux
}
