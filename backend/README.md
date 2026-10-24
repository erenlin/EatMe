# UseBy Backend

This is the initial Go backend for the UseBy application.

## Structure

- `cmd/server` - application entry point
- `internal/api` - HTTP routes and handlers
- `internal/config` - environment configuration
- `internal/domain` - core domain models
- `internal/store` - temporary in-memory data access layer

## Run locally

```bash
cd backend
go run ./cmd/server
```

## Endpoints

- `GET /health` - health check
- `GET /users` - list users
- `POST /users/create` - create a user
