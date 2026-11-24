# Local Database Setup

This guide explains how to run EatMe with a local PostgreSQL database using Docker. You do not need access to the team's shared DigitalOcean database.

## Prerequisites

- Docker Desktop (or Docker Engine with Compose)
- Go (see `backend/go.mod` for the required version)
- Node.js 22 and npm for the frontend
- Python 3 for the optional secret-generation command below

## 1. Start PostgreSQL

From the repository root:

```bash
docker compose -f compose.local.yaml up -d --wait
```

On the first startup, Docker creates the `eatme_local` database and automatically installs the schema, indexes, triggers, and SQL functions.

To check initialization:

```bash
docker compose -f compose.local.yaml logs db --tail=100
```

Look for:

```text
EatMe local database initialized successfully.
```

The local database uses:

- Host: `127.0.0.1`
- Port: `5433`
- Database: `eatme_local`
- Username: `eatme`

Its password is defined in `compose.local.yaml` and is intended only for isolated local development.

Sample user data is not loaded automatically.

## 2. Configure the Backend

From the repository root:

```bash
cp backend/.env.example backend/.env
```

Generate a random local JWT secret:

```bash
python3 - <<'PY'
from pathlib import Path
import secrets

path = Path("backend/.env")
text = path.read_text()
text = text.replace(
    "replace-with-a-random-local-secret",
    secrets.token_hex(32),
)
path.write_text(text)
PY
```

The example configuration connects to PostgreSQL on `127.0.0.1:5433`.

The `.env` file is ignored by Git. Never commit real database credentials or JWT secrets.

## 3. Start the Backend

In a terminal:

```bash
cd backend
go run ./cmd/server
```

The backend normally starts on `http://localhost:8080`.

Verify it in another terminal:

```bash
curl -i http://localhost:8080/health
```

Expected: HTTP `200 OK` with `{"status":"ok"}`.

If port 8080 is occupied, stop the conflicting local process or use another port. The frontend's Vite proxy must point to the same backend port.

## 4. Start the Frontend

In another terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite, normally `http://localhost:5173`.

You can now create an account and log in using the local database.

## 5. Stop the Database

From the repository root:

```bash
docker compose -f compose.local.yaml down
```

This stops the containers but preserves local database data.

To start again:

```bash
docker compose -f compose.local.yaml up -d --wait
```

## 6. Reset the Local Database

**Warning: The following command permanently deletes this Docker Compose project's local database volume and all data stored in it.**

Only use it when you intentionally want a fresh local database:

```bash
docker compose -f compose.local.yaml down -v
docker compose -f compose.local.yaml up -d --wait
```

The initialization script runs automatically when PostgreSQL starts with an empty data volume. Changes to SQL initialization files are not automatically applied to an existing database.

## Safety Notes

- This Docker setup is separate from the team's shared DigitalOcean database.
- Never run `database/schema/01_schema.sql` against the shared database. It drops and recreates the `kitchen` schema.
- The local Docker password is for development only and must not be reused in production.
- A successful health check does not guarantee that every application workflow works. Test relevant database-backed operations separately.
