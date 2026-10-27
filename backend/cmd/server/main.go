package main

import (
	"context"
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

	dataStore, err := store.NewStore(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer dataStore.Close()

	httpHandler := api.NewRouter(cfg, dataStore)

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
