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

// Item represents a grocery item returned by the database.
type Item struct {
	ItemID      int    `json:"item_id"`
	ItemName    string `json:"item_name"`
	OwnerUserID int    `json:"owner_user_id"`
}

// LookupItems searches for grocery items belonging to the user.
// When shared is true, it also includes accessible shared items.
func (s *Store) LookupItems(ctx context.Context, userID int, query string, shared bool) ([]Item, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT item_id, item_name, owner_user_id
         FROM kitchen.usp_item_lookup($1, $2, $3)`,
		userID, query, shared,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Item{}

	for rows.Next() {
		var item Item

		if err := rows.Scan(
			&item.ItemID,
			&item.ItemName,
			&item.OwnerUserID,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

// ItemVariant represents a variant returned by the database.
type ItemVariant struct {
	VariantID          int       `json:"variant_id"`
	VariantName        string    `json:"variant_name"`
	TypicalWeightGrams int       `json:"typical_weight_grams"`
	ServingGrams       int       `json:"serving_grams"`
	CountingMethod     string    `json:"counting_method"`
	DefaultStoreMode   string    `json:"default_store_mode"`
	IconPNG            []byte    `json:"icon_png"`
	CreatedAt          time.Time `json:"created_at"`
	OwnerUserID        int       `json:"owner_user_id"`
}

// LookupVariants searches variants for a particular item.
func (s *Store) LookupVariants(
	ctx context.Context,
	userID int,
	itemID int,
	query string,
	shared bool,
) ([]ItemVariant, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT variant_id, variant_name, typical_weight_grams,
                serving_grams, counting_method, default_store_mode,
                icon_png, created_at, owner_user_id
         FROM kitchen.usp_variant_lookup($1, $2, $3, $4)`,
		userID, itemID, query, shared,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	variants := []ItemVariant{}

	for rows.Next() {
		var variant ItemVariant

		if err := rows.Scan(
			&variant.VariantID,
			&variant.VariantName,
			&variant.TypicalWeightGrams,
			&variant.ServingGrams,
			&variant.CountingMethod,
			&variant.DefaultStoreMode,
			&variant.IconPNG,
			&variant.CreatedAt,
			&variant.OwnerUserID,
		); err != nil {
			return nil, err
		}

		variants = append(variants, variant)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return variants, nil
}

// CreatedItem represents a newly created grocery item.
type CreatedItem struct {
	ItemID    int       `json:"item_id"`
	ItemName  string    `json:"item_name"`
	CreatedAt time.Time `json:"created_at"`
}

// AddItem creates a new grocery item for the specified user.
func (s *Store) AddItem(
	ctx context.Context,
	userID int,
	itemName string,
) (CreatedItem, error) {
	var item CreatedItem

	err := s.pool.QueryRow(ctx,
		`SELECT item_id, item_name, created_at
         FROM kitchen.usp_item_add($1, $2)`,
		userID, itemName,
	).Scan(
		&item.ItemID,
		&item.ItemName,
		&item.CreatedAt,
	)

	return item, err
}

// AddVariantParams contains the data needed to create a variant.
type AddVariantParams struct {
	UserID             int
	ItemID             int
	VariantName        string
	TypicalWeightGrams int
	ServingGrams       int
	DefaultExpiryDays  int
	CountingMethod     string
	DefaultStoreMode   string
	IconPNG            []byte
}

// CreatedVariant represents the database response.
type CreatedVariant struct {
	VariantID          int       `json:"variant_id"`
	ItemID             int       `json:"item_id"`
	VariantName        string    `json:"variant_name"`
	TypicalWeightGrams int       `json:"typical_weight_grams"`
	ServingGrams       int       `json:"serving_grams"`
	CountingMethod     string    `json:"counting_method"`
	DefaultStoreMode   string    `json:"default_store_mode"`
	CreatedAt          time.Time `json:"created_at"`
}

// AddVariant creates a variant using the existing PostgreSQL function.
func (s *Store) AddVariant(
	ctx context.Context,
	params AddVariantParams,
) (CreatedVariant, error) {
	var variant CreatedVariant

	err := s.pool.QueryRow(ctx,
		`SELECT variant_id, item_id, variant_name,
                typical_weight_grams, serving_grams,
                counting_method, default_store_mode, created_at
         FROM kitchen.usp_variant_add(
             $1, $2, $3, $4, $5, $6,
             $7::kitchen.counting,
             $8::kitchen.store,
             $9
         )`,
		params.UserID,
		params.ItemID,
		params.VariantName,
		params.TypicalWeightGrams,
		params.ServingGrams,
		params.DefaultExpiryDays,
		params.CountingMethod,
		params.DefaultStoreMode,
		params.IconPNG,
	).Scan(
		&variant.VariantID,
		&variant.ItemID,
		&variant.VariantName,
		&variant.TypicalWeightGrams,
		&variant.ServingGrams,
		&variant.CountingMethod,
		&variant.DefaultStoreMode,
		&variant.CreatedAt,
	)

	return variant, err
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