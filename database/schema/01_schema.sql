--  ================================================================================================================  --
--    -. QUERY INITIALIZATION                                                                                         --
--  ================================================================================================================  --

drop schema if exists kitchen cascade;
create schema kitchen;
set search_path = kitchen, public;

--  ================================================================================================================  --
--    -. MODULES                                                                                                      --
--  ================================================================================================================  --

create extension if not exists pgcrypto;

--  ================================================================================================================  --
--    SECTION A -. ADMINISTRATION TABLES                                                                              --
--  ================================================================================================================  --

create type gender as enum ('Male', 'Female', 'Others');

create table if not exists users
(
    id                  integer generated always as identity primary key,
    first_name          varchar not null,
    last_name           varchar not null,

    email               varchar not null unique,
    password_hash       text not null,

    phone_number        varchar default null,
    date_of_birth       date not null,
    user_gender         gender not null,

    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);


create table if not exists users_share
(
    id              integer generated always as identity primary key,
    grantor_user_id integer     not null
        references users (id) on delete cascade,
    grantee_user_id integer     not null
        references users (id) on delete cascade,

    created_at      timestamptz not null default now(),
    revoked_at      timestamptz          default null,

    -- Cannot grant self access
    constraint chk_users_share_not_self
        check (grantor_user_id != grantee_user_id),

    -- Defensive; cannot have revoke date < creation
    constraint chk_users_share_revoked_after_created
        check (revoked_at is null or revoked_at >= created_at)
);

-- only one active copy of a grant
create unique index if not exists uq_users_share_active
    on users_share (grantor_user_id, grantee_user_id)
    where revoked_at is null;


create table if not exists user_settings
(
    id      integer generated always as identity primary key,
    user_id integer not null
        references users (id) on delete cascade,

    key     text    not null,
    value   text    not null,

    -- ensures one setting per user
    constraint uq_user_settings_user_key
        unique (user_id, key)
);


create table if not exists items
(
    id         integer generated always as identity primary key,
    user_id    integer     not null
        references users (id) on delete cascade,
    item_name  varchar     not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_items_user_name unique (user_id, item_name)
);


create table if not exists users
(
    id            serial primary key,
    first_name    varchar     not null,
    last_name     varchar     not null,

    email         varchar     not null unique,
    password_hash text        not null,

    phone_number  varchar,
    date_of_birth date        not null,
    user_gender   gender      not null,

    created_at    timestamptz not null default now(),
    modified_at   timestamptz not null default now()
);


create table if not exists users_share
(
    id              serial primary key,
    grantor_user_id integer     not null
        references users (id) on delete cascade,
    grantee_user_id integer     not null
        references users (id) on delete cascade,

    created_at      timestamptz not null default now(),
    revoked_at      timestamptz          default null,

    -- Cannot grant self access
    constraint chk_users_share_not_self
        check (grantor_user_id != grantee_user_id),

    -- Defensive; cannot have revoke date < creation
    constraint chk_users_share_revoked_after_created
        check (revoked_at is null or revoked_at >= created_at)
);

-- only one active copy of a grant
create unique index if not exists uq_users_share_active
    on users_share (grantor_user_id, grantee_user_id)
    where revoked_at is null;


create table if not exists user_settings
(
    id      serial primary key,
    user_id integer not null
        references users (id) on delete cascade,

    key     text    not null,
    value   text    not null,

    -- ensures one setting per user
    constraint uq_user_settings_user_key
        unique (user_id, key)
);


--  ================================================================================================================  --
--    SECTION B -. PERMANENT INVENTORY TABLES                                                                         --
--  ================================================================================================================  --

create type storage as enum ('room', 'fridge', 'freezer');
create type counting as enum ('divisible', 'numerable');
create type barcode as enum ('gtin', 'qr', 'code128');

create table if not exists items
(
    id         integer generated always as identity primary key,
    user_id    integer     not null
        references users (id) on delete cascade,
    item_name  varchar     not null,
    created_at timestamptz not null default now(),

    constraint uq_items_user_name unique (user_id, item_name)
);


create table if not exists item_variants
(
    id                     integer generated always as identity primary key,

    item_id                integer     not null
        references items (id) on delete cascade,
    variant_name           varchar     not null,

    typical_serving        smallint    not null check (typical_serving > 0),
    typical_weight_grams   smallint    not null check (typical_weight_grams > 0),

    average_days_to_expire smallint    not null check (average_days_to_expire > 0),
    default_storage_mode   storage     not null default 'room',
    counting_method        counting    not null,

    icon_png               bytea                default null,
    created_at             timestamptz not null default now(),

    -- unique item-variant pair
    constraint uq_item_variants_item_name
        unique (item_id, variant_name),

    -- icon size must be small
    constraint chk_icon_size
        check (icon_png is null or octet_length(icon_png) <= 100000),

    -- reject any non .png file
    constraint chk_icon_is_png
        check (icon_png is null or substring(icon_png from 1 for 8) = '\x89504e470d0a1a0a'::bytea)
);


create table if not exists expiry
(
    variant_id   integer     not null
        references item_variants (id) on delete cascade,
    storage_mode storage     not null,
    expiry_days  smallint    not null check (expiry_days > 0),
    created_at   timestamptz not null default current_timestamp,

    primary key (variant_id, storage_mode)
);


create table if not exists barcodes
(
    id         integer generated always as identity primary key,
    variant_id integer     not null
        references item_variants (id) on delete cascade,
    symbology  barcode     not null default 'gtin',
    code       text        not null,
    created_at timestamptz not null default current_timestamp,

    -- a variant can't list the same barcode twice
    constraint uq_barcodes_variant_code
        unique (variant_id, symbology, code)
);


--  ================================================================================================================  --
--    NUTRITION TABLES                                                                                                --
--  ================================================================================================================  --

create table if not exists nutrition
(
    variant_id      integer primary key references item_variants (id) on delete cascade,
    calories_kcal   numeric(7, 2) not null check (calories_kcal >= 0),

    carbohydrate_g  numeric(6, 2) not null default 0 check (carbohydrate_g >= 0),
    sugar_g         numeric(6, 2) check (sugar_g >= 0),
    fiber_g         numeric(6, 2) check (fiber_g >= 0),

    fat_g           numeric(6, 2) not null default 0 check (fat_g >= 0),
    saturated_fat_g numeric(6, 2) check (saturated_fat_g >= 0),

    protein_g       numeric(6, 2) not null default 0 check (protein_g >= 0),

    sodium_mg       numeric(8, 2) check (sodium_mg >= 0),
    created_at      timestamptz   not null default now(),

    -- subcomponents can't exceed their parent
    constraint chk_nutrition_sugar_within_carbs
        check (sugar_g is null or sugar_g <= carbohydrate_g),
    constraint chk_nutrition_sat_fat_within_fat
        check (saturated_fat_g is null or saturated_fat_g <= fat_g)
);

--  ================================================================================================================  --
--    EPHEMERAL INVENTORY TABLES                                                                                      --
--  ================================================================================================================  --

do
$$
    begin
        create type consumption as enum ('consumed', 'discarded', 'expired');
    exception
        when duplicate_object then null;
    end
$$;

create table if not exists item_instances
(
    id                 integer generated always as identity primary key,
    variant_id         integer     not null references item_variants (id) on delete cascade,
    storage_mode       storage     not null default 'room',
    quantity           integer     not null default 1 check (quantity > 0),
    added_at           timestamptz not null default now(),
    expiry_modifier    smallint    not null default 0,
    servings_consumed  smallint    not null default 0 check (servings_consumed >= 0),
    consumption_reason consumption          default null,
    icon_png           bytea                default null,
    created_at         timestamptz not null default now(),
    removed_at         timestamptz          default null,

    -- icon size must be small
    constraint chk_item_instances_icon_size
        check (icon_png is null or octet_length(icon_png) <= 100000),

    -- reject any non .png file
    constraint chk_item_instances_icon_is_png
        check (icon_png is null or substring(icon_png from 1 for 8) = '\x89504e470d0a1a0a'::bytea),

    -- a reason is given exactly when the instance is removed
    constraint chk_item_instances_removed_consistent
        check ((removed_at is null) = (consumption_reason is null)),

    -- cannot be removed before it was added
    constraint chk_item_instances_removed_after_added
        check (removed_at is null or removed_at >= added_at)
);


--  ================================================================================================================  --
--    RECIPE TABLES                                                                                                   --
--  ================================================================================================================  --

create table if not exists recipe
(
    id           integer generated always as identity primary key,
    user_id      integer     not null references users (id) on delete cascade,
    recipe_name  varchar     not null,
    servings     smallint    not null check (servings > 0),
    instructions text,
    created_at   timestamptz not null default now(),

    -- a user can't have two recipes with the same name
    constraint uq_recipe_user_name
        unique (user_id, recipe_name)
);

create table if not exists recipe_ingredients
(
    id         integer generated always as identity primary key,
    recipe_id  integer  not null references recipe (id) on delete cascade,
    variant_id integer  not null references item_variants (id) on delete restrict,
    quantity   smallint not null check (quantity > 0),
    position   smallint not null default 0,

    -- ensures one copy of ingredient per recipe
    constraint uq_recipe_ingredients_recipe_variant
        unique (recipe_id, variant_id)
);


--  ================================================================================================================  --
--    SECTION Z -. LOGGING                                                                                             --
--  ================================================================================================================  --

create type log_action as enum ('insert', 'update', 'delete', 'login', 'share','revoke');
create type table_name as enum ('users', 'users_share');

create table logs
(
    id                  integer generated always as identity primary key,
    logged_at           timestamptz not null default now(),

    user_id             integer references users (id) on delete set null,
    action              log_action not null,
    table_name          table_name not null,

    row_id              integer,
    successful          boolean not null default true,
    details             jsonb
);

create index ix_logs_table_row on logs (table_name, row_id);
create index ix_logs_logged_at on logs (logged_at);

--  ================================================= END OF FILE ==================================================  --
