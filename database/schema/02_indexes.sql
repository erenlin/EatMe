-- facilitate privilege share lookups
create index idx_users_share_grantee_active
    on users_share (grantee_user_id)
    where revoked_at is null;

-- current inventory lookups
create index if not exists idx_item_instances_variant_active
    on item_instances (variant_id)
    where removed_at is null;

-- "which recipes use this variant?"
create index if not exists idx_recipe_ingredients_variant
    on recipe_ingredients (variant_id);