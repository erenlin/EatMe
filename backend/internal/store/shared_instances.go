package store

import (
	"context"
)

// SharedInstance is an inventory instance plus its owner's display name.
type SharedInstance struct {
	Instance
	OwnerName string `json:"owner_name"`
}

// GetSharedInstances returns all nonempty groceries shared with this user.
// Access is checked through active grants, not client-supplied owner IDs.
func (s *Store) GetSharedInstances(ctx context.Context, userID int) ([]SharedInstance, error) {
	rows, err := s.pool.Query(ctx, `
        SELECT
            inst.id,
            variant.user_id,
            variant.id,
            item.item_name,
            variant.variant_name,
            1.0::real AS match_score,
            inst.store_mode::text,
            inst.quantity,
            inst.unit_weight_grams,
            inst.quantity * inst.unit_weight_grams AS total_grams,
            used.grams_consumed,
            inst.quantity * inst.unit_weight_grams - used.grams_consumed AS grams_remaining,
            inst.expiry_modifier,
            inst.added_at,
            CASE
                WHEN shelf.expiry_days IS NULL THEN NULL
                ELSE inst.added_at + make_interval(
                    days => shelf.expiry_days::int + inst.expiry_modifier::int
                )
            END AS expires_at,
            concat_ws(' ', owner.first_name, owner.last_name) AS owner_name
        FROM kitchen.item_instances inst
        JOIN kitchen.item_variants variant ON variant.id = inst.variant_id
        JOIN kitchen.items item
            ON item.id = variant.item_id AND item.user_id = variant.user_id
        JOIN kitchen.users owner ON owner.id = variant.user_id
        LEFT JOIN kitchen.expiry shelf
            ON shelf.variant_id = variant.id
            AND shelf.store_mode = inst.store_mode
        CROSS JOIN LATERAL (
            SELECT COALESCE(SUM(c.grams), 0)::integer AS grams_consumed
            FROM kitchen.item_consumption c
            WHERE c.instance_id = inst.id
        ) used
        WHERE EXISTS (
            SELECT 1
            FROM kitchen.users_share share
            WHERE share.grantor_user_id = variant.user_id
              AND share.grantee_user_id = $1
              AND share.revoked_at IS NULL
        )
        AND used.grams_consumed < inst.quantity * inst.unit_weight_grams
        ORDER BY expires_at NULLS LAST, inst.added_at, inst.id
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []SharedInstance{}
	for rows.Next() {
		var entry SharedInstance
		err := rows.Scan(
			&entry.InstanceID,
			&entry.UserID,
			&entry.VariantID,
			&entry.ItemName,
			&entry.VariantName,
			&entry.MatchScore,
			&entry.StoreMode,
			&entry.Quantity,
			&entry.UnitWeightGrams,
			&entry.TotalGrams,
			&entry.GramsConsumed,
			&entry.GramsRemaining,
			&entry.ExpiryModifier,
			&entry.AddedAt,
			&entry.ExpiresAt,
			&entry.OwnerName,
		)
		if err != nil {
			return nil, err
		}

		entry.AddedAt = entry.AddedAt.UTC()
		if entry.ExpiresAt != nil {
			t := entry.ExpiresAt.UTC()
			entry.ExpiresAt = &t
		}
		result = append(result, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
