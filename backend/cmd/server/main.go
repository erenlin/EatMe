package main

import (
	"errors"
	"log"
	"net/http"
	"time"

	"eatme/internal/api"
	"eatme/internal/config"
	"eatme/internal/store"
)

func main() {
	cfg := config.Load()
	dataStore := store.NewStore()
	httpHandler := api.NewRouter(dataStore)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpHandler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("UseBy backend started on http://localhost:%s", cfg.Port)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server failed: %v", err)
	}
}
