package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config contains the basic application configuration.
type Config struct {
	Port        string
	Environment string
	JWTSecret   string
	DatabaseURL string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load reads .env (if present), then returns configuration from the environment.
// Variables already set in the environment take precedence over .env.
func Load() Config {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: could not load .env: %v", err)
	}

	cfg := Config{
		Port:        getenv("PORT", "8080"),
		Environment: getenv("APP_ENV", "development"),
		JWTSecret:   getenv("JWT_SECRET", "dev-secret-change-me"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set — copy .env.example to .env and fill it in")
	}

	return cfg
}