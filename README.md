# EatMe

EatMe is a web application for managing groceries, tracking freshness, and helping users decide what food to use before it expires.

This project was developed by Group 4 for UW CSE 403.

## Beta Release Status

EatMe is currently in beta development.

### Operational Backend Features

The following backend functionality is currently implemented and tested:

- User registration
- User login with JWT authentication
- Authenticated user requests
- Item lookup
- Item creation
- Variant lookup
- Variant creation

### End-to-End Beta Use Case

**TODO before beta submission:** Update this section once the frontend integration is confirmed on `main`.

The planned beta flow is:

1. Register or log in through the EatMe frontend.
2. Perform an authenticated grocery/item action.
3. Send the request to the Go backend.
4. Read from or write to PostgreSQL.
5. Display the returned result in the frontend.

Only flows verified on `main` should be listed here as operational.

## Technology Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Go
- **Database:** PostgreSQL
- **Authentication:** JWT
- **Continuous Integration:** GitHub Actions
- **Deployment:** DigitalOcean

## Prerequisites

Before running EatMe locally, install:

- Git
- Node.js 22
- npm
- Go 1.26 or newer
- PostgreSQL

## Clone the Repository

```bash
git clone https://github.com/erenlin/EatMe.git
cd EatMe
```

## Environment Configuration

The backend reads the following environment variables:

- `PORT` — backend port; defaults to `8080`
- `APP_ENV` — application environment; defaults to `development`
- `JWT_SECRET` — secret used to sign JWTs
- `DATABASE_URL` — PostgreSQL connection string

Example local configuration:

```bash
export PORT=8080
export APP_ENV=development
export JWT_SECRET=<local-development-secret>
export DATABASE_URL=<postgresql-connection-string>
```

Do not commit real credentials, database passwords, or production secrets to the repository.

## Database Setup

**TODO: Confirm the exact current database setup procedure with the database owner before the beta submission.**

This section should include:

1. How to create or access the development database.
2. Which SQL/schema files must be executed.
3. The order in which those files must be executed.
4. Any required roles or permissions.
5. The `DATABASE_URL` format needed by the backend.

## Build

### Frontend

```bash
cd frontend
npm ci
npm run build
```

### Backend

```bash
cd backend
go mod download
go build ./...
```

## Run

The database must be available before starting the backend.

### Start the Backend

```bash
cd backend
go run ./cmd/server
```

By default, the backend runs on port `8080`.

### Start the Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Test

### Frontend

```bash
cd frontend
npm run lint
npm test
npm run build
```

### Backend

```bash
cd backend
go vet ./...
go test ./...
go build ./...
```

## Continuous Integration

EatMe uses GitHub Actions for continuous integration.

CI currently runs on:

- Pull requests targeting `main`
- Pushes to `main`

The workflow currently runs:

### Frontend

```bash
npm ci
npm run lint
npm test
```

### Backend

```bash
go vet ./...
go test ./...
```

All CI checks should pass before changes are merged into `main`.

## Bug Tracking

EatMe uses GitHub Issues to track reproducible bugs discovered during development and testing.

Bug reports should include:

- A descriptive title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Relevant screenshots or logs when useful
- Affected component

## Known Beta Limitations

EatMe is still under active development.

**TODO before submission:** Update this section based on the final state of `main`.

Potential remaining work includes:

- Remaining inventory workflows
- Freshness and expiration estimation
- Barcode-based food entry
- Image-based food identification
- Recipe recommendations
- Expanded integration and end-to-end testing

## Project Documentation

Full project requirements, architecture, design, testing plans, and process documentation are available in the team's living document:

https://docs.google.com/document/d/1nkdHh2kS-S4vA5Ra053JQUwF9P4YXe8gqIupyGCVNM4/edit?tab=t.aulzpil1dd96#heading=h.7nza7ykfonwm