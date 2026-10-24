package config

import "os"

// Config contains the basic application configuration.
type Config struct {
	Port        string
	Environment string
}

// Load returns configuration values from environment variables.
func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	environment := os.Getenv("APP_ENV")
	if environment == "" {
		environment = "development"
	}

	return Config{
		Port:        port,
		Environment: environment,
	}
}
