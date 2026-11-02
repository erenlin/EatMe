package store

import (
	"context"
	_ "embed"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Grant struct {
	ID               int        `json:"grant_id"`
	GranteeUserID    int        `json:"grantee_user_id"`
	GranteeFirstName string     `json:"grantee_first_name"`
	GranteeLastName  string     `json:"grantee_last_name"`
	GranteeEmail     string     `json:"grantee_email"`
	GrantedAt        time.Time  `json:"granted_at"`
	RevokedAt        *time.Time `json:"revoked_at"` // null if active
	IsActive         bool       `json:"is_active"`
}

var (
	ErrUserExists   = errors.New("user already exists")
	ErrUserNotFound = errors.New("user not found")
)

var createUserSQL string

var getPasswordHashSQL string

// Store is the Postgres-backed data layer.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) CreateUser(ctx context.Context, first, last, email, passwordHash, dob, gender string) (int, error) {
	var id int
	err := s.pool.QueryRow(ctx,
		`select returned_user_id
		 from kitchen.usp_new_user($1, $2, $3, $4, $5, $6::date, $7::kitchen.gender)`,
		first, last, email, passwordHash, "", dob, gender,
	).Scan(&id)
	return id, err
}

// FetchUser calls usp_fetch_user. Returns ErrUserNotFound when the email isn't registered.
func (s *Store) FetchUser(ctx context.Context, email string) (int, string, error) {
	var id int
	var hash string
	err := s.pool.QueryRow(ctx,
		`select returned_user_id, returned_password_hash from usp_fetch_user($1)`,
		email,
	).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", ErrUserNotFound
	}
	return id, hash, err
}

func (s *Store) ListGrants(ctx context.Context, userID int) ([]Grant, error) {
	rows, err := s.pool.Query(ctx, `
		select returned_grant_id, returned_grantee_user_id,
		       returned_grantee_first_name, returned_grantee_last_name,
		       returned_grantee_email, returned_granted_at,
		       returned_revoked_at, returned_is_active
		from kitchen.usp_list_grants($1)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grants := []Grant{} // empty list, not nil, so JSON is [] and not null
	for rows.Next() {
		var g Grant
		if err := rows.Scan(&g.ID, &g.GranteeUserID, &g.GranteeFirstName,
			&g.GranteeLastName, &g.GranteeEmail, &g.GrantedAt,
			&g.RevokedAt, &g.IsActive); err != nil {
			return nil, err
		}
		g.GrantedAt = g.GrantedAt.UTC()
		if g.RevokedAt != nil {
			t := g.RevokedAt.UTC()
			g.RevokedAt = &t
		}
		grants = append(grants, g)
	}
	return grants, rows.Err()
}