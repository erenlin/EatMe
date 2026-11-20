# EatMe

EatMe is a web application that helps users organize their groceries, track expiration dates, and use food before it goes bad. Users can record purchased groceries, manage quantities, save food types, explore recipes based on available ingredients, and manage grocery-sharing permissions.

Developed by Group 4 for the University of Washington's CSE 403 Software Engineering course.

## Documentation

- **[Local Database Setup](docs/LOCAL_DATABASE_SETUP.md)** — Run EatMe locally with PostgreSQL and Docker, without access to the shared database.
- **[User Manual](docs/USER_MANUAL.md)** — Step-by-step instructions for creating an account, managing groceries, tracking freshness, using recipes, and managing sharing permissions.
- **[Coding Guidelines](coding-guidelines.md)** — Development conventions and guidelines for contributors.
- **[EatMe Living Document (PDF)](https://docs.google.com/document/d/1vb92Mq4vGCpuq9xHpmhAjUwD85Nq22ePbZ-8fTMNtHc/export?format=pdf)** — Project requirements, architecture, design decisions, testing plans, and process documentation.

## Project Status

EatMe is currently in beta development. The application connects a React frontend, Go HTTP backend, and PostgreSQL database.

The features below are implemented in the current source code. Their presence does not mean every workflow has been independently verified end to end against the development database.

### Implemented Frontend Features

**Authentication**
- Account registration through an in-app signup form
- Login using email and password
- Authenticated sessions using JWTs
- Logout and session handling

**Grocery Management**
- View and search current grocery inventory
- Add previously saved foods to inventory
- Create a new food and add its purchased quantity in one workflow
- View grocery details, including quantities, storage location, and expiration dates
- Track remaining quantities by recording food usage
- Remove groceries from inventory
- View freshness indicators based on recorded expiration information

**Saved Foods and Types**
- Create and search saved foods
- Create specific types (variants) of each food
- Configure weights, serving sizes, counting methods, storage locations, and shelf-life values
- View inventory entries associated with a saved food type
- Add or consume inventory from a type's detail page

**Recipes**
- Browse and search recipes
- Create recipes with a name and serving count
- Add saved foods as recipe ingredients
- Compare ingredient requirements with recorded grocery quantities
- Adjust recipe serving multipliers
- View missing ingredients and copy a shopping list

**Sharing**
- View the current user's ID
- Create sharing permissions using another user's ID
- View active sharing permissions
- Revoke existing sharing permissions

The sharing interface currently manages permissions, but the Groceries page does not yet display another user's shared inventory.

### Implemented Backend Features

The Go backend provides authenticated HTTP endpoints for:

| Feature | Endpoints |
| --- | --- |
| Authentication | `POST /create`, `POST /login`, `GET /me` |
| Saved foods | `GET /items`, `POST /items` |
| Food types | `GET /variants`, `POST /variants` |
| Inventory | `GET /variants/{id}/instances`, `POST /instances`, `POST /instances/use` |
| Expiration settings | `GET`, `POST`, and `DELETE /variants/{id}/expiry` |
| Recipes | `GET /recipes`, `POST /recipes` |
| Recipe ingredients | `GET /recipes/{id}/ingredients`, `POST /recipes/{id}/ingredients` |
| Sharing | `GET /grants`, `POST /grants`, `POST /grants/{id}/revoke` |
| Health check | `GET /health` |

The frontend accesses these endpoints through its `/api` proxy during local development.

### Data Model

EatMe distinguishes between three main grocery concepts:

- **Item:** A general food category, such as Apple.
- **Variant:** A specific type of an item, such as Fuji.
- **Instance:** An actual quantity of a variant in a user's inventory, such as four Fuji apples.

Saving an item or variant does not automatically add it to a user's inventory. An inventory instance must be created to represent a purchase.

## Technology Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Go HTTP API
- **Database:** PostgreSQL, hosted for team development on DigitalOcean
- **Authentication:** JSON Web Tokens (JWT)
- **Testing:** Vitest, React Testing Library, Go testing tools
- **Continuous Integration:** GitHub Actions
- **Version Control and Issue Tracking:** GitHub

## Prerequisites

Before running EatMe locally, install or obtain:

- Git
- Node.js 22 and npm
- Go 1.26 or newer
- Docker Desktop or Docker Engine with Compose for local database setup, or approved access to an existing PostgreSQL database
- Optional: `psql`, the PostgreSQL command-line client

Docker provides a local PostgreSQL server without requiring access to the team's shared DigitalOcean development database.

Database access is required to run the backend and use database-dependent application features. It is not required simply to build the frontend or run frontend unit tests.

## Clone the Repository

```bash
git clone https://github.com/erenlin/EatMe.git
cd EatMe
```

Run the frontend and backend in separate terminals.

All commands below assume you begin at the repository root unless otherwise specified.

## Environment Configuration and Database Setup

### Local Database (Recommended)

For an isolated local PostgreSQL database, follow the [Local Database Setup Guide](docs/LOCAL_DATABASE_SETUP.md).

It explains how to start PostgreSQL with Docker Compose, configure `backend/.env`, and run the application. No shared database credentials are required.

### Backend Environment Variables

The backend uses the following environment variables:

| Variable | Description |
| --- | --- |
| `PORT` | HTTP server port; defaults to `8080` |
| `APP_ENV` | Application environment; defaults to `development` |
| `JWT_SECRET` | Secret used to sign and validate JWTs |
| `DATABASE_URL` | Required PostgreSQL connection information |
| `PGPASSWORD` | PostgreSQL password, when not included in the connection string |

**Important:** `DATABASE_URL` must be configured before starting the backend. The current backend does not automatically connect to a local default database when this variable is missing.

The backend also supports loading variables from a local `.env` file. Existing shell environment variables take precedence over values in that file.

### Connect to the Team's Development Database

1. Obtain the approved database host, port, database name, and your assigned database username from the database owner.
2. Obtain your corresponding database password through an approved private channel.
3. In a terminal, navigate to the backend directory and configure the environment:

```bash
cd backend

export PORT=8080
export APP_ENV=development
export JWT_SECRET="$(openssl rand -hex 32)"

export DATABASE_URL='host=<database-host> port=<database-port> user=<your-db-user> dbname=<database-name> sslmode=require'
```

Replace the placeholder values with the database connection details provided by the team. Use your assigned database account rather than another contributor's credentials.

On macOS using the default zsh shell, enter the database password without placing it directly in shell history:

```bash
read -rs 'PGPASSWORD?Database password: '
echo
export PGPASSWORD
```

The shared managed database uses SSL, so retain `sslmode=require` when connecting to that environment.

**Security notes:**
- Never commit database passwords, connection strings containing credentials, or JWT secrets.
- Keep credentials out of public GitHub issues, pull requests, and screenshots.
- Environment variables set in a terminal apply to that session. Configure them again when opening a new backend terminal.
- Use `unset PGPASSWORD` when you no longer need the password in the current shell.

The repository includes `backend/.env.example` for local development. Copy it to `backend/.env` and generate a unique JWT secret as described in the local setup guide.

### Reviewer database troubleshooting

Some reviewers received `defaultdb` instead of `testdb`, causing missing `kitchen` schema errors (#53, #58, #63). Confirm the correct database with its owner, or use the [local Docker setup](docs/LOCAL_DATABASE_SETUP.md). Never initialize the shared database yourself.

### Optional: Verify Database Access

The PostgreSQL command-line client can help verify that your connection details work.

On macOS, install it with Homebrew if needed:

```bash
brew install libpq
export PATH="$(brew --prefix libpq)/bin:$PATH"
psql --version
```

From a terminal where the database environment variables are configured, run:

```bash
psql "$DATABASE_URL"
```

A successful connection opens a PostgreSQL prompt.

Enter `\q` to exit.

The `psql` client is optional and is not required to run the application itself.

### Schema and Database Initialization

Database SQL source files are located in:

- `database/schema/`
- `database/functions/`

The team's shared development database is already provisioned by the database owner.

Fresh local database initialization is automated through `compose.local.yaml` and `scripts/init-local-db.sh`. The scripts install the schema and application SQL functions when Docker creates a new database volume.

The initialization scripts do not automatically rerun when an existing database volume is restarted. See the [Local Database Setup Guide](docs/LOCAL_DATABASE_SETUP.md) for reset instructions.

**Warning: Do not run `database/schema/01_schema.sql` against the shared development database.** It drops and recreates the `kitchen` schema, potentially deleting existing data.

## Build

### Frontend

From the repository root:

```bash
cd frontend
npm ci
npm run build
```

This installs frontend dependencies and runs the TypeScript and Vite production build.

### Backend

From the repository root in a separate terminal:

```bash
cd backend
go mod download
go build ./...
```

This downloads Go dependencies and compiles the backend packages.

A successful build does not, by itself, verify the application's connection to the database.

## Run

### Start the Backend

In the backend terminal where the database environment variables are configured, run:

```bash
go run ./cmd/server
```

The backend normally listens at:

```text
http://localhost:8080
```

Verify the health endpoint from another terminal:

```bash
curl -i http://localhost:8080/health
```

A successful response returns HTTP status `200` and a JSON response containing:

```json
{"status":"ok"}
```

The health endpoint confirms that the HTTP server is responding. It does not, by itself, verify every database-backed operation.

Keep the backend terminal running while using EatMe.

### Start the Frontend

From the repository root in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the URL displayed by Vite, normally:

```text
http://localhost:5173
```

The Vite development server proxies requests beginning with `/api` to the Go backend on `http://localhost:8080`.

The frontend and backend should both remain running during testing.

## Create a Test EatMe Account

### Register Through the Frontend

The current frontend includes an account registration form.

1. Open EatMe in your browser.
2. Click **Create an account** on the login screen.
3. Enter the requested personal details, email address, and password.
4. Confirm your password and click **Create account**.

Passwords must contain at least 8 characters. The signup form also validates required fields, email format, password confirmation, and date of birth.

After registration, the frontend attempts to sign in automatically. If automatic login fails, use the login screen to sign in with the newly created account.

### Alternative: Register Through the Backend API

Developers may also create test accounts directly through the backend's `POST /create` endpoint.

Send a JSON POST request to:

```text
http://localhost:8080/create
```

Example request body:

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

Replace the example values with appropriate test data and a unique email address. The password placeholder is not intended to be used literally.

Successful account creation returns HTTP status `201 Created`.

Afterward, sign in using the EatMe account's email and password, not the PostgreSQL database credentials.

Use temporary credentials created specifically for testing, and avoid including passwords in shell history or logs.

## Manual Smoke Testing

After starting the frontend and backend and signing in, the following steps can be used to check the current interface.

These are **suggested checks**, not a claim that every workflow has already passed end-to-end testing.

### Grocery Management

1. Open **Groceries** and click **+ Add**.
2. Search for a saved food. If it exists, enter a purchased quantity and click **Add**.
3. If it does not exist, choose the option to add a new food.
4. Enter the food name, size, storage location, shelf-life estimate, and quantity.
5. Click **Add to groceries**.
6. Verify that the grocery appears in your inventory.
7. Refresh the page to check whether the entry persists.
8. Search for the grocery and open its detail page.
9. Record a small amount of usage and verify that the remaining quantity changes.

### Saved Foods and Types

1. Open **Settings → Saved foods**.
2. Create a food, such as Apple.
3. Open the food and create a type, such as Fuji.
4. Configure its weight, serving size, storage location, and shelf-life information.
5. Open the type to view its details and associated inventory entries.

### Recipes

1. Open **Recipes**.
2. Create a recipe with a name and serving count.
3. Open the recipe and add ingredients from Saved foods.
4. Check whether the ingredient availability information matches the groceries recorded in your inventory.
5. If ingredients are missing, review the shopping list and try **Copy list**.

### Sharing Permissions

1. Open **Settings → Sharing**.
2. Confirm that your user ID is displayed.
3. If another approved test account is available, create a sharing permission using that account's user ID.
4. Verify that the permission appears under **Sharing with**.
5. Revoke the permission and verify that it is no longer listed as active.

The sharing screen currently manages access permissions, but the main Groceries page does not yet display another user's shared inventory.

For more detailed feature instructions, see the [User Manual](docs/USER_MANUAL.md).

## Historical Beta Verification

### November 3, 2026: Authentication and Item Management

During beta preparation, the team reported manually verifying an earlier grocery-management workflow against the shared development database.

The documented test involved:

1. Creating a test account through the backend registration endpoint.
2. Logging in through the frontend.
3. Adding a food item such as Apple.
4. Confirming that the item appeared in the application's list.
5. Refreshing the page and verifying that the saved item persisted.
6. Searching for the item and confirming that a matching result appeared.

The team reported that authenticated requests successfully traveled through the React frontend, Go API, and PostgreSQL database, and that the item remained available after refreshing.

**This is a historical test result.** It reflects the application and workflow tested on November 3, 2026, not the full set of features currently implemented.

Since that test, the frontend's grocery-management workflow and navigation have changed. The manual smoke tests above describe the newer interface and should be executed again before claiming additional end-to-end verification.

## Testing

### Frontend

From the repository root:

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build
```

These commands perform the following checks:

- `npm ci` — Install dependencies from the lockfile.
- `npm run lint` — Run ESLint.
- `npm test` — Run Vitest tests.
- `npm run build` — Run TypeScript validation and the Vite production build.

### Backend

From the repository root:

```bash
cd backend
go mod download
go vet ./...
go test ./...
go build ./...
```

These commands download dependencies, check for common Go issues, run tests, and compile the backend.

The team previously reported testing backend operations for authentication, items, variants, and inventory instances during beta preparation. The C1b/C1c inventory endpoints were also reported to have passed 13 scenarios in Apidog.

Those results are historical testing records and should not be treated as proof that every new frontend workflow has been verified against the latest database state.

## Continuous Integration

EatMe uses GitHub Actions for continuous integration.

The workflow is defined in:

```text
.github/workflows/ci.yml
```

It runs on:

- Pushes to `main`
- Pull requests targeting `main`

### Frontend CI

The frontend job uses Node.js 22 and runs:

```bash
npm ci
npm run lint
npm test
npm run build
```

### Backend CI

The backend job uses the Go version declared in `backend/go.mod` and provisions a PostgreSQL 16 service for its test environment.

It runs:

```bash
go vet ./...
go build ./...
go test -race -coverprofile=coverage.out ./...
```

The workflow then generates a coverage summary using:

```bash
go tool cover -func=coverage.out | tail -1
```

This provides automated linting, tests, builds, race detection, and backend coverage information.

However, these checks do not replace manual end-to-end testing of the entire frontend, backend, and development database workflow.

## Version Control and Bug Tracking

EatMe uses GitHub for source control, collaboration, pull requests, continuous integration, and issue tracking.

Contributors should develop changes on separate branches and submit pull requests targeting `main`.

Before opening a pull request:

1. Review the changes for correctness and unintended modifications.
2. Run the relevant lint, test, and build commands.
3. Verify that no credentials or secrets are included.
4. Describe the changes and reference any related GitHub issues.

Report reproducible bugs through [GitHub Issues](https://github.com/erenlin/EatMe/issues).

A useful bug report should include:

- A descriptive title and the affected feature
- Steps to reproduce the problem
- Expected behavior
- Actual behavior
- Relevant screenshots or error messages, with sensitive information removed

## Known Limitations

EatMe is still in development, and several planned features are not yet available as complete user-facing workflows.

- **Public deployment:** A publicly accessible production website is not currently documented.
- **Shared inventory:** The frontend supports creating and revoking sharing permissions, but the current Groceries screen does not request or display another user's shared inventory.
- **Barcode scanning:** Automatic grocery entry using barcodes is not currently implemented as a user-facing workflow.
- **Photo identification:** Automatic identification of groceries from photos is not currently available through the interface.
- **Expiration notifications:** The app displays expiration information, but automated expiration reminders are not currently implemented.
- **Shelf-life estimates:** The new-food form uses general starting values rather than food-specific shelf-life recommendations. Users should review and adjust them.
- **Database provisioning:** Docker Compose supports isolated local development; managed database environments still require approved credentials and provisioning.
- **End-to-end validation:** Automated linting, tests, and builds are available, but complete browser-to-database workflows still require additional verification.

Expiration information is intended to support grocery organization. It should not be relied upon as a guarantee that food is safe to eat.

## Project Documentation and Support

Additional project resources:

- [EatMe User Manual](docs/USER_MANUAL.md)
- [Coding Guidelines](coding-guidelines.md)
- [EatMe Living Document (PDF)](https://docs.google.com/document/d/1vb92Mq4vGCpuq9xHpmhAjUwD85Nq22ePbZ-8fTMNtHc/export?format=pdf)
- [GitHub Issues](https://github.com/erenlin/EatMe/issues)

For questions about database access or development environment configuration, contact the appropriate team member or database owner through an approved team communication channel.