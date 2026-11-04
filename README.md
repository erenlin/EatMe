
# EatMe

EatMe is a web application for organizing groceries, tracking what is in the kitchen, and helping users use food before it expires.

Developed by Group 4 for UW CSE 403.

## Beta Release Status

EatMe is in beta development. Its working grocery-management flow connects the **React frontend**, **Go backend**, and **PostgreSQL database**.

### Implemented Features

**Frontend**
- Login and authenticated session handling
- My Groceries page with item listing, search, and creation
- Item selection: clicking a grocery item opens its variants page
- Variants page with variant listing, search, and creation controls

**Backend**
- Account registration (`POST /create`), login (`POST /login`), and authenticated user lookup (`GET /me`)
- Item lookup and creation (`GET /items`, `POST /items`)
- Variant lookup and creation (`GET /variants`, `POST /variants`)
- Inventory instance listing, creation, and consumption (`GET /variants/{id}/instances`, `POST /instances`, `POST /instances/use`)
- Sharing/grant operations (`/grants`, `POST /grants/{id}/revoke`)
- Health check (`GET /health`)

These backend endpoints have been implemented and tested separately by the team. Not every backend feature is available as a complete user-facing workflow yet.

### Verified End-to-End Beta Use Case

**Use case: Log in and manage grocery items.** Manually verified against the team's shared development database on November 3, 2026:

1. Create a test account through the backend's `POST /create` endpoint.
2. Open EatMe and log in through the frontend with that account.
3. Arrive at the **My Groceries** page.
4. Add a grocery item such as **Apple**.
5. See the item appear in the list.
6. Refresh the page and verify that Apple remains.
7. Search for **Apple** and confirm the matching item is returned.

**Result:** The application successfully sends authenticated requests from **React → Go API → PostgreSQL** and displays persisted results in React. Refreshing and searching confirmed the item was stored in the database rather than only in frontend state.

The connected variants page allows users to select an item and work with its specific types. That additional navigation is included in the beta frontend, but the manually verified end-to-end flow above is limited to authentication and item management.

**Data model:** An *item* is a category (for example, Apple), a *variant* is a specific type (Fuji), and an *instance* is an actual quantity in inventory (four Fuji apples).

## Technology Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Go HTTP API
- **Database:** PostgreSQL, hosted for development on DigitalOcean
- **Authentication:** JWT
- **Continuous integration:** GitHub Actions
- **Version control and issue tracking:** GitHub

## Prerequisites

- Git
- Node.js 22 and npm
- Go 1.26 or newer
- Access to a PostgreSQL database containing the EatMe schema and functions
- Optional: `psql`, the PostgreSQL command-line client

A local PostgreSQL server is **not required** if using the team's shared DigitalOcean development database. Database access is required to run the backend, but not to run the build and unit-test commands.

## Clone the Repository

```bash
git clone https://github.com/erenlin/EatMe.git
cd EatMe
```

Run the frontend and backend commands below in **separate terminals**, each starting at the repository root unless stated otherwise.

## Environment Configuration and Database Setup

The backend reads these environment variables:

- `PORT`: backend port (default `8080`)
- `APP_ENV`: application environment (default `development`)
- `JWT_SECRET`: secret used to sign JWTs
- `DATABASE_URL`: PostgreSQL connection information
- `PGPASSWORD`: database password, read by the PostgreSQL driver when the password is not included in `DATABASE_URL`

### Connect to the team's development database

1. Obtain the approved database host, port, database name, and **your assigned database username** from the database owner.
2. Obtain the corresponding password through an approved private channel.
3. In the terminal you will use for the backend, enter:

```bash
cd backend
export PORT=8080
export APP_ENV=development
export JWT_SECRET="$(openssl rand -hex 32)"
export DATABASE_URL='host=<database-host> port=<database-port> user=<your-db-user> dbname=<database-name> sslmode=require'
```

On macOS with the default **zsh** shell, enter the database password without putting it in shell history:

```bash
read -rs 'PGPASSWORD?Database password: '
echo
export PGPASSWORD
```

Replace the placeholder values in `DATABASE_URL` with the connection settings provided by the team. Use **your own** database username rather than another teammate's. The shared managed database uses SSL (`sslmode=require`).

The environment variables belong to the terminal session where they were set. Reconfigure them when opening a fresh backend terminal; use `unset PGPASSWORD` when finished. Do not commit credentials, passwords, or JWT secrets to GitHub.

**Important:** If `DATABASE_URL` is unset, the backend falls back to `localhost:5432/eatme`. A `connection refused` error may simply mean no local database is running.

### Optional: verify direct database access

On macOS, install the PostgreSQL client if needed:

```bash
brew install libpq
echo 'export PATH="$(brew --prefix libpq)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version
```

In a terminal with the database connection and password variables set:

```bash
psql "$DATABASE_URL"
```

A successful connection opens a PostgreSQL prompt. Enter `\q` to exit. `psql` is optional for running the application itself.

### Schema and initialization

The shared database is already provisioned by the database owner. SQL source lives in `database/schema/` and `database/functions/`. The repository does not yet provide a fully documented, reproducible fresh-database provisioning process, including roles and permissions; coordinate a separate database setup with the database owner.

**Do not run `database/schema/01_schema.sql` on the shared database.** It starts by dropping the `kitchen` schema and would remove existing data.

## Build

### Frontend

From the repository root:

```bash
cd frontend
npm ci
npm run build
```

### Backend

From the repository root in a different terminal:

```bash
cd backend
go mod download
go build ./...
```

## Run

### Start the backend

In the **backend terminal** where the database variables have already been set:

```bash
go run ./cmd/server
```

The backend normally listens at `http://localhost:8080`. In another terminal, verify that it responds:

```bash
curl -i http://localhost:8080/health
```

A successful response has HTTP status `200`. Keep the backend terminal running.

### Start the frontend

From the repository root in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite, usually `http://localhost:5173`. The Vite development server proxies frontend `/api` requests to the Go backend on port `8080`.

### Create a test EatMe account

The current frontend has a login page but no registration form. New accounts can be created by sending a JSON `POST` request to `http://localhost:8080/create` using an API client (such as Apidog) or an HTTP command-line tool.

Example JSON body (replace the example email and password with unique test values):

```json
{
  "first_name": "Beta",
  "last_name": "Tester",
  "email": "unique-beta-user@example.com",
  "password": "<new-temporary-test-password>",
  "date_of_birth": "2000-01-01",
  "gender": "Others"
}
```

Successful registration returns HTTP `201 Created`. Then log in through the frontend with the **EatMe account email and password**, not the PostgreSQL database credentials. Use a password reserved for this throwaway test account, and avoid exposing it in shell history or logs.

### Reproduce the verified beta flow

1. Log in through the frontend.
2. On **My Groceries**, add a new item such as `Apple`.
3. Confirm it appears in the list.
4. Refresh the page and confirm it persists.
5. Search for `Apple` and confirm the result appears.
6. Select `Apple` to open its **variants** page and view or add specific types of apple.

The first five steps were manually verified end to end on November 3. The sixth step reflects the completed item-to-variants navigation and should be smoke-tested on the final merged frontend before recording the demo.

## Test

### Frontend

From the repository root:

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build
```

### Backend

From the repository root:

```bash
cd backend
go mod download
go vet ./...
go test ./...
go build ./...
```

These commands passed locally during beta preparation. Team members also tested individual backend API operations, including authentication, item/variant endpoints, and inventory instance endpoints. The C1b/C1c instance endpoints passed 13 scenarios in Apidog.

The manual beta flow described above additionally verified data persistence through the actual frontend and shared database. Broader UI integration tests and a measured coverage report remain future work.

## Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on **pushes to `main`** and **pull requests targeting `main`**.

- Frontend: `npm ci`, `npm run lint`, `npm test`
- Backend: `go vet ./...`, `go test ./...`

Recent GitHub Actions runs passed for the beta branches and merges. Run the build commands above locally too; the current CI workflow does **not** include the frontend or backend build steps.

## Version Control and Bug Tracking

EatMe uses GitHub for source control, pull requests, continuous integration, and issue tracking. Team members develop changes on branches and merge completed work into `main`.

Reproducible bugs should be tracked in GitHub Issues with:

- A descriptive title and affected component
- Steps to reproduce
- Expected and actual behavior
- Relevant logs or screenshots, excluding credentials or secrets

## Known Beta Limitations

- The frontend supports login, but account registration still requires the backend API rather than an in-app sign-up form.
- The My Groceries → variants navigation is connected, and the variants page includes listing, search, and add controls; however, the full variant-to-inventory-instance workflow is not yet integrated and verified through the frontend.
- Backend C1 endpoints for listing, adding, and using inventory instances are implemented, but a complete UI for managing purchased quantities and consumption is still in progress.
- Automated freshness tracking and expiry notifications, barcode-based entry, image identification, and recipe recommendations are not complete end-to-end beta experiences.
- A public production web deployment was not part of the locally verified flow.
- Fresh-database initialization and role setup are not automated for a new developer.
- Automated test coverage can be expanded, especially for the full UI-to-database workflow.

## Project Documentation

Detailed requirements, architecture, design, testing plans, and process documentation are maintained in the team's [living document](https://docs.google.com/document/d/1nkdHh2kS-S4vA5Ra053JQUwF9P4YXe8gqIupyGCVNM4/edit?tab=t.aulzpil1dd96#heading=h.7nza7ykfonwm).