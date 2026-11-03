
package store

import (
	"context"
	"time"
)

// AddInstanceParams contains the inputs for creating a pantry instance.
type AddInstanceParams struct {
	UserID          int
	VariantID       int
	Quantity        int
	UnitWeightGrams *int
	StoreMode       *string
	ExpiryModifier  int
	AddedAt         *time.Time
}

// CreatedInstance represents the newly created pantry instance.
type CreatedInstance struct {
	InstanceID      int       `json:"instance_id"`
	VariantID       int       `json:"variant_id"`
	Quantity        int       `json:"quantity"`
	UnitWeightGrams int       `json:"unit_weight_grams"`
	TotalGrams      int       `json:"total_grams"`
	StoreMode       string    `json:"store_mode"`
	ExpiryModifier  int       `json:"expiry_modifier"`
	AddedAt         time.Time `json:"added_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

// AddInstance calls the existing PostgreSQL function to add inventory.
func (s *Store) AddInstance(
	ctx context.Context,
	params AddInstanceParams,
) (CreatedInstance, error) {
	var instance CreatedInstance

	err := s.pool.QueryRow(ctx,
		`SELECT instance_id, variant_id, quantity,
		        unit_weight_grams, total_grams, store_mode,
		        expiry_modifier, added_at, expires_at
		 FROM kitchen.usp_instance_add(
		     $1, $2, $3, $4,
		     $5::kitchen.store, $6, $7
		 )`,
		params.UserID,
		params.VariantID,
		params.Quantity,
		params.UnitWeightGrams,
		params.StoreMode,
		params.ExpiryModifier,
		params.AddedAt,
	).Scan(
		&instance.InstanceID,
		&instance.VariantID,
		&instance.Quantity,
		&instance.UnitWeightGrams,
		&instance.TotalGrams,
		&instance.StoreMode,
		&instance.ExpiryModifier,
		&instance.AddedAt,
		&instance.ExpiresAt,
	)

	return instance, err
}


// UseInstanceParams contains the inputs for consuming inventory.
type UseInstanceParams struct {
	UserID     int
	InstanceID int
	Grams      int
}

// UsedInstance represents the result of consuming inventory.
type UsedInstance struct {
	ConsumptionID  int `json:"consumption_id"`
	InstanceID     int `json:"instance_id"`
	OwnerUserID    int `json:"owner_user_id"`
	GramsUsed      int `json:"grams_used"`
	GramsConsumed  int `json:"grams_consumed"`
	GramsRemaining int `json:"grams_remaining"`
}

// UseInstance records consumption using the PostgreSQL function.
func (s *Store) UseInstance(
	ctx context.Context,
	params UseInstanceParams,
) (UsedInstance, error) {
	var result UsedInstance

	err := s.pool.QueryRow(ctx,
		`SELECT consumption_id, instance_id, owner_user_id,
		        grams_used, grams_consumed, grams_remaining
		 FROM kitchen.usp_instance_use($1, $2, $3)`,
		params.UserID,
		params.InstanceID,
		params.Grams,
	).Scan(
		&result.ConsumptionID,
		&result.InstanceID,
		&result.OwnerUserID,
		&result.GramsUsed,
		&result.GramsConsumed,
		&result.GramsRemaining,
	)

	return result, err
}

