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
	itemController := controller.NewItemController(dataStore)
	grantController := controller.NewGrantController(dataStore)
	instanceController := controller.NewInstanceController(dataStore)

	mux.Handle("/health", healthHandler)
	mux.HandleFunc("/create", authController.Create)
	mux.HandleFunc("/login", authController.Login)
	mux.HandleFunc("/me", authController.RequireAuth(authController.Me))
	mux.HandleFunc("/items", authController.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			itemController.LookupItems(w, r)
		case http.MethodPost:
			itemController.AddItem(w, r)
		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/variants", authController.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			itemController.LookupVariants(w, r)
		case http.MethodPost:
			itemController.AddVariant(w, r)
		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/grants", authController.RequireAuth(grantController.Handle))
	mux.HandleFunc("POST /grants/{id}/revoke", authController.RequireAuth(grantController.Revoke))
	mux.HandleFunc("POST /instances", authController.RequireAuth(instanceController.AddInstance))

	return mux
}
