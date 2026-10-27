package store

import (
	"context"
	_ "embed"
	"errors"

	"github.com/jackc/pgx/v5"
	// "github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
		 from usp_new_user($1, $2, $3, $4, $5, $6::date, $7::gender)`,
		first, last, email, passwordHash, "", dob, gender,
	).Scan(&id)
	return id, err
}

func (s *Store) GetPasswordHash(ctx context.Context, username string) (string, error) {
	var hash string
	err := s.pool.QueryRow(ctx, getPasswordHashSQL, username).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUserNotFound
	}
	return hash, err
}