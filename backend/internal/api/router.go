package api

import (
	"net/http"

	"eatme/internal/api/handlers"
	"eatme/internal/config"
	"eatme/internal/controller"
	"eatme/internal/store"
)

// NewRouter creates the HTTP router for the app.
func NewRouter(cfg config.Config, dataStore *store.Store) http.Handler {
	mux := http.NewServeMux()

	healthHandler := handlers.NewHealthHandler()
	authController := controller.NewAuthController(cfg, dataStore)

	mux.Handle("/health", healthHandler)
	mux.HandleFunc("/create", authController.Create)
	mux.HandleFunc("/login", authController.Login)
	mux.HandleFunc("/me", authController.RequireAuth(authController.Me))

	return mux
}
