package store

import (
	"context"
	"fmt"
)

// VariantExpiry represents one storage mode's shelf life.
type VariantExpiry struct {
	VariantID  int    `json:"variant_id"`
	StoreMode  string `json:"store_mode"`
	ExpiryDays *int16 `json:"expiry_days"`
}

// GetVariantExpiry implements B3a.
func (s *Store) GetVariantExpiry(
	ctx context.Context,
	userID, variantID int,
) ([]VariantExpiry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT variant_id, store_mode, expiry_days
		 FROM kitchen.usp_variant_get_expiry($1, $2)`,
		userID, variantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	expiries := make([]VariantExpiry, 0)
	for rows.Next() {
		var expiry VariantExpiry
		if err := rows.Scan(
			&expiry.VariantID,
			&expiry.StoreMode,
			&expiry.ExpiryDays,
		); err != nil {
			return nil, err
		}
		expiries = append(expiries, expiry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return expiries, nil
}

// SetVariantExpiry implements B3b.
func (s *Store) SetVariantExpiry(
	ctx context.Context,
	userID, variantID int,
	storeMode string,
	expiryDays int,
) (VariantExpiry, error) {
	var expiry VariantExpiry

	err := s.pool.QueryRow(ctx,
		`SELECT variant_id, store_mode, expiry_days
		 FROM kitchen.usp_variant_set_expiry(
		     $1, $2, $3::kitchen.store, $4
		 )`,
		userID, variantID, storeMode, expiryDays,
	).Scan(
		&expiry.VariantID,
		&expiry.StoreMode,
		&expiry.ExpiryDays,
	)

	return expiry, err
}

// DeleteVariantExpiry implements B3c.
func (s *Store) DeleteVariantExpiry(
	ctx context.Context,
	userID, variantID int,
	storeMode string,
) (VariantExpiry, error) {
	var expiry VariantExpiry

	err := s.pool.QueryRow(ctx,
		`SELECT variant_id, store_mode, expiry_days
		 FROM kitchen.usp_variant_del_expiry(
		     $1, $2, $3::kitchen.store
		 )`,
		userID, variantID, storeMode,
	).Scan(
		&expiry.VariantID,
		&expiry.StoreMode,
		&expiry.ExpiryDays,
	)

	if err != nil {
		return VariantExpiry{}, fmt.Errorf(
			"delete variant expiry: %w", err,
		)
	}

	return expiry, nil
}
