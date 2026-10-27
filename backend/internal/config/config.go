package config

import "os"

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

// Load returns configuration values from environment variables.
func Load() Config {
	return Config{
		Port:        getenv("PORT", "8080"),
		Environment: getenv("APP_ENV", "development"),
		JWTSecret:   getenv("JWT_SECRET", "dev-secret-change-me"),
		DatabaseURL: getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/eatme?sslmode=disable"),
	}
}
