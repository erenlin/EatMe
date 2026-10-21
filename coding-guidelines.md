# EatMe Coding Guidelines

## Frontend: React (TypeScript / JavaScript)

### Coding Guidelines

We will follow the [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) and its [React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react), supplemented by the [TypeScript Deep Dive Style Guide](https://basarat.gitbook.io/typescript/styleguide) for TypeScript-specific conventions.

### Why We Chose These Guidelines

We chose these guidelines because they provide clear conventions for writing consistent and readable JavaScript, TypeScript, and React code. Since multiple team members will be working on the frontend, following these guidelines will help keep our code organized and easier to maintain.

### Enforcement

- **ESLint:** Check for common coding mistakes and enforce applicable style rules.
- **Prettier:** Keep code formatting consistent.
- **Code Reviews:** Review pull requests to ensure code follows the guidelines.
- **GitHub Actions:** Run automated linting and formatting checks before merging changes.

---

## Backend: Go

### Coding Guidelines

We use [Effective Go](https://go.dev/doc/effective_go) and the [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) as our coding guidelines. Effective Go is the Go project's official guide to writing idiomatic Go. Since it has not been updated significantly since 2022, we also follow the Go Code Review Comments for more practical and up-to-date guidance.

### Why We Chose These Guidelines

These are the official guidelines from the Go team, so most Go developers are expected to follow them. Using these guidelines makes our code consistent, easier to read, and easier for new contributors to understand. Tools like `gofmt` and Go linters can also check many of these rules automatically, saving time during code reviews.

### Enforcement

- **Formatting:** All Go code must use `gofmt` and `goimports`. CI checks formatting, and code cannot be merged if it fails.
- **Linting:** `golangci-lint` runs checks to find bugs and code issues.
- **Local Checks:** Developers can run `make lint` to check their code before pushing, including formatting and linting checks.
- **CI:** GitHub Actions runs formatting and lint checks on every pull request. All checks must pass before merging.
- **Code Reviews:** Reviewers check rules that tools cannot catch, such as naming, error handling, and comments.

---

## Database: PostgreSQL (PL/pgSQL)

### Coding Guidelines

We follow [Mazur's SQL Style Guide](https://github.com/mattm/sql-style-guide) by [Matt Mazur](https://mattmazur.com/2019/06/13/mazurs-sql-style-guide/).

### Why We Chose These Guidelines

Because we are writing all SQL by hand (no ORM), we need a guide with strong, explicit opinions on formatting, naming, and structure, not one that defers to generated code.

Mazur's guide provides clear rules for the areas that matter most in hand-written SQL: consistent use of `snake_case` for identifiers, uppercase reserved words, left-aligned keywords, explicit `AS` for aliases, and disciplined formatting of `JOIN`s and subqueries.

It is concise, widely adopted, and focused entirely on readability, which is critical since raw SQL will be reviewed manually by the backend team.

### Enforcement

- **Formatting and Linting:** SQLFluff (PostgreSQL dialect) is our formatter and linter. Our `.sqlfluff` configuration maps Mazur's rules (e.g., `capitalisation.keywords = upper`, `aliasing.column = explicit`). Developers run `sqlfluff fix` through a pre-commit hook.
- **SQL File Organization:** All SQL lives in `.sql` files (migrations and queries loaded with `//go:embed`). Inline SQL strings in Go are not allowed, so every query is lintable.
- **CI:** A GitHub Actions job runs `sqlfluff lint` on changed `.sql` files, and branch protection requires it to pass before merging.
- **Code Reviews:** Because there is no ORM, every SQL change requires a reviewer to check correctness, index usage, and other aspects that the linter cannot catch.