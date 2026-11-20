set search_path = kitchen, public;

-- Speed up lookups of active sharing permissions.
create index if not exists idx_users_share_grantee_active
    on users_share (grantee_user_id)
    where revoked_at is null;

-- Speed up inventory lookups by food variant.
create index if not exists idx_item_instances_variant
    on item_instances (variant_id);

-- Speed up recipe ingredient lookups.
create index if not exists idx_recipe_ingredients_variant
    on recipe_ingredients (variant_id);

-- Speed up consumption history lookups.
create index if not exists ix_item_consumption_instance
    on item_consumption (instance_id);
