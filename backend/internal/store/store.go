package store

import (
	"context"
	_ "embed"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

// ShareResult is the row returned by usp_grant_share.
type ShareResult struct {
	GrantID       int       `json:"grant_id"`
	GranteeUserID int       `json:"grantee_user_id"`
	GrantedAt     time.Time `json:"granted_at"`
}

type RevokeResult struct {
	GrantID       int       `json:"grant_id"`
	GranteeUserID int       `json:"grantee_user_id"`
	RevokedAt     time.Time `json:"revoked_at"`
}

// Instance is one row from usp_instance_get.
type Instance struct {
	InstanceID      int        `json:"instance_id"`
	UserID          int        `json:"user_id"` // owner, used for colour coding
	VariantID       int        `json:"variant_id"`
	ItemName        string     `json:"item_name"`
	VariantName     string     `json:"variant_name"`
	MatchScore      float32    `json:"match_score"`
	StoreMode       string     `json:"store_mode"`
	Quantity        int        `json:"quantity"`
	UnitWeightGrams int        `json:"unit_weight_grams"`
	TotalGrams      int        `json:"total_grams"`
	GramsConsumed   int        `json:"grams_consumed"`
	GramsRemaining  int        `json:"grams_remaining"`
	ExpiryModifier  int        `json:"expiry_modifier"`
	AddedAt         time.Time  `json:"added_at"`
	ExpiresAt       *time.Time `json:"expires_at"` // null if no expiry
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

// Recipe is one row from usp_recipe_get.
type Recipe struct {
	RecipeID        int       `json:"recipe_id"`
	UserID          int       `json:"user_id"`
	OwnerName       string    `json:"owner_name"`
	IsOwn           bool      `json:"is_own"`
	RecipeName      string    `json:"recipe_name"`
	Servings        int       `json:"servings"`
	Instructions    *string   `json:"instructions"`
	IngredientCount int       `json:"ingredient_count"`
	CoverageScore   *float32  `json:"coverage_score"`
	CreatedAt       time.Time `json:"created_at"`
	TotalCount      int       `json:"total_count"`
}

var (
	ErrUserExists      = errors.New("user already exists")
	ErrUserNotFound    = errors.New("user not found")
	ErrSelfGrant       = errors.New("grantee is the acting user")
	ErrGranteeNotFound = errors.New("grantee does not exist")
	ErrAlreadyShared   = errors.New("already shared")
	ErrGrantNotFound   = errors.New("grant not found")
	ErrAlreadyRevoked  = errors.New("grant already revoked")
	ErrInvalidInput    = errors.New("invalid input")
	ErrVariantNotFound = errors.New("variant not found")
	ErrSessionUserGone = errors.New("session user no longer exists")
	ErrRecipeExists    = errors.New("recipe already exists")
	ErrRecipeNotFound  = errors.New("recipe not found")
	ErrAlreadyInRecipe = errors.New("variant already in recipe")
	ErrNoFreePosition  = errors.New("recipe has no free positions")
)

var createUserSQL string
var getPasswordHashSQL string

const minMatchScore = 0.75

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

// Ingredient is one row from usp_recipe_ingredient_get.
type Ingredient struct {
	IngredientID       int    `json:"ingredient_id"`
	RecipeID           int    `json:"recipe_id"`
	VariantID          int    `json:"variant_id"` // a variant of the recipe's owner
	ItemName           string `json:"item_name"`
	VariantName        string `json:"variant_name"`
	Grams              int    `json:"grams"` // amount for the recipe's servings
	Position           int    `json:"ingredient_position"`
	CountingMethod     string `json:"counting_method"` // divisible | numerable
	TypicalWeightGrams int    `json:"typical_weight_grams"`
	ServingGrams       int    `json:"serving_grams"`
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

func (s *Store) GrantShare(ctx context.Context, grantorID, granteeID int) (ShareResult, error) {
	var out ShareResult
	err := s.pool.QueryRow(ctx,
		`select returned_grant_id, returned_grantee_user_id, returned_granted_at
		 from kitchen.usp_grant_share($1, $2)`,
		grantorID, granteeID,
	).Scan(&out.GrantID, &out.GranteeUserID, &out.GrantedAt)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23514":
			return ShareResult{}, ErrSelfGrant
		case "23503":
			return ShareResult{}, ErrGranteeNotFound
		case "23505":
			return ShareResult{}, ErrAlreadyShared
		}
	}
	out.GrantedAt = out.GrantedAt.UTC()
	return out, err
}

func (s *Store) RevokeShare(ctx context.Context, userID, grantID int) (RevokeResult, error) {
	var out RevokeResult
	err := s.pool.QueryRow(ctx,
		`select returned_grant_id, returned_grantee_user_id, returned_revoked_at
		 from kitchen.usp_revoke_share($1, $2)`,
		userID, grantID,
	).Scan(&out.GrantID, &out.GranteeUserID, &out.RevokedAt)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "P0002":
			return RevokeResult{}, ErrGrantNotFound
		case "55000":
			return RevokeResult{}, ErrAlreadyRevoked
		}
	}
	out.RevokedAt = out.RevokedAt.UTC()
	return out, err
}

// GetInstances lists active instances of the user's variant, optionally including shared ones.
func (s *Store) GetInstances(ctx context.Context, userID, variantID int, includeShared bool) ([]Instance, error) {
	rows, err := s.pool.Query(ctx, `
		select instance_id, user_id, variant_id, item_name, variant_name,
		       match_score, store_mode::text, quantity, unit_weight_grams,
		       total_grams, grams_consumed, grams_remaining,
		       expiry_modifier, added_at, expires_at
		from kitchen.usp_instance_get($1, $2, $3, $4::real)`,
		userID, variantID, includeShared, minMatchScore)
	if err != nil {
		return nil, mapInstanceErr(err)
	}
	defer rows.Close()

	out := []Instance{} // empty list, not nil, so JSON is [] and not null
	for rows.Next() {
		var in Instance
		if err := rows.Scan(&in.InstanceID, &in.UserID, &in.VariantID,
			&in.ItemName, &in.VariantName, &in.MatchScore, &in.StoreMode,
			&in.Quantity, &in.UnitWeightGrams, &in.TotalGrams,
			&in.GramsConsumed, &in.GramsRemaining, &in.ExpiryModifier,
			&in.AddedAt, &in.ExpiresAt); err != nil {
			return nil, mapInstanceErr(err)
		}
		in.AddedAt = in.AddedAt.UTC()
		if in.ExpiresAt != nil {
			t := in.ExpiresAt.UTC()
			in.ExpiresAt = &t
		}
		out = append(out, in)
	}
	return out, mapInstanceErr(rows.Err())
}

func mapInstanceErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23502", "23514":
			return ErrInvalidInput
		case "P0002":
			return ErrVariantNotFound
		}
	}
	return err
}

// GetRecipes returns one page (50 rows) of recipes, in the order the DB returns them.
func (s *Store) GetRecipes(ctx context.Context, userID int, includeShared, shared, weighted bool, page int) ([]Recipe, error) {
	rows, err := s.pool.Query(ctx, `
		select recipe_id, user_id, owner_name, is_own, recipe_name, servings,
		       instructions, ingredient_count, coverage_score, created_at, total_count
		from kitchen.usp_recipe_get(
			$1,
			p_include_shared := $2,
			p_shared := $3,
			p_weighted := $4,
			p_page := $5)`,
		userID, includeShared, shared, weighted, page)
	if err != nil {
		return nil, mapRecipeErr(err)
	}
	defer rows.Close()

	out := []Recipe{} // empty list, not nil, so JSON is [] and not null
	for rows.Next() {
		var r Recipe
		if err := rows.Scan(&r.RecipeID, &r.UserID, &r.OwnerName, &r.IsOwn,
			&r.RecipeName, &r.Servings, &r.Instructions, &r.IngredientCount,
			&r.CoverageScore, &r.CreatedAt, &r.TotalCount); err != nil {
			return nil, mapRecipeErr(err)
		}
		r.CreatedAt = r.CreatedAt.UTC()
		out = append(out, r)
	}
	return out, mapRecipeErr(rows.Err())
}

// AddRecipe creates a recipe header for the user and returns the new recipe id.
func (s *Store) AddRecipe(ctx context.Context, userID int, name string, servings int, instructions *string) (int, error) {
	var id int
	err := s.pool.QueryRow(ctx,
		`select kitchen.usp_recipe_add(
			$1,
			p_recipe_name := $2,
			p_servings := $3,
			p_instructions := $4)`,
		userID, name, servings, instructions,
	).Scan(&id)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // map by code, not detail
			return 0, ErrRecipeExists
		case "23502", "23514", "22P02", "22007":
			return 0, ErrInvalidInput
		case "P0002":
			return 0, ErrSessionUserGone
		}
	}
	return id, err
}

func mapRecipeErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23502", "23514", "22P02", "22003":
			return ErrInvalidInput
		case "P0002":
			return ErrSessionUserGone // the session's user no longer exists
		}
	}
	return err
}

// GetIngredients lists a recipe's ingredients in display order, as returned by the DB.
func (s *Store) GetIngredients(ctx context.Context, userID, recipeID int) ([]Ingredient, error) {
	rows, err := s.pool.Query(ctx, `
		select ingredient_id, recipe_id, variant_id, item_name, variant_name,
		       grams, ingredient_position, counting_method::text,
		       typical_weight_grams, serving_grams
		from kitchen.usp_recipe_ingredient_get($1, $2)`,
		userID, recipeID)
	if err != nil {
		return nil, mapIngredientErr(err)
	}
	defer rows.Close()

	out := []Ingredient{} // empty list, not nil, so JSON is [] and not null
	for rows.Next() {
		var in Ingredient
		if err := rows.Scan(&in.IngredientID, &in.RecipeID, &in.VariantID,
			&in.ItemName, &in.VariantName, &in.Grams, &in.Position,
			&in.CountingMethod, &in.TypicalWeightGrams, &in.ServingGrams); err != nil {
			return nil, mapIngredientErr(err)
		}
		out = append(out, in)
	}
	return out, mapIngredientErr(rows.Err())
}

func mapIngredientErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23502", "22P02", "22003":
			return ErrInvalidInput
		case "P0002":
			return ErrRecipeNotFound
		}
	}
	return err
}

// AddIngredient adds one of the user's variants to one of their recipes and returns the new ingredient id.
func (s *Store) AddIngredient(ctx context.Context, userID, recipeID, variantID, grams int) (int, error) {
	var id int
	err := s.pool.QueryRow(ctx,
		`select kitchen.usp_recipe_ingredient_add($1, $2, $3, $4)`,
		userID, recipeID, variantID, grams,
	).Scan(&id)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23502", "23514", "22P02", "22003":
			return 0, ErrInvalidInput
		case "23505":
			return 0, ErrAlreadyInRecipe
		case "54000":
			return 0, ErrNoFreePosition
		case "P0002":
			// detail names the missing thing: "recipe_id" or "variant_id"
			if strings.Contains(pgErr.Detail, "variant_id") {
				return 0, ErrVariantNotFound
			}
			return 0, ErrRecipeNotFound
		}
	}
	return id, err
}
