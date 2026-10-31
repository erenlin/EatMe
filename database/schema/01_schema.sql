--  ================================================================================================================  --
--    -. QUERY INITIALIZATION                                                                                         --
--  ================================================================================================================  --

drop schema if exists kitchen cascade;
create schema kitchen;
set search_path = kitchen, public;

--  ================================================================================================================  --
--    -. MODULES                                                                                                      --
--  ================================================================================================================  --

create extension if not exists pgcrypto with schema public;
create extension if not exists pg_trgm  with schema public;

--  ================================================================================================================  --
--    SECTION A -. ADMINISTRATION TABLES                                                                              --
--  ================================================================================================================  --

create type gender as enum ('Male', 'Female', 'Others');

create table if not exists users (
    id                  integer         generated always as identity primary key,
    first_name          varchar         not null,
    last_name           varchar         not null,

    email               varchar         not null unique,
    password_hash       text            not null,

    phone_number        varchar         default null,
    date_of_birth       date            not null,
    user_gender         gender          not null,

    created_at          timestamptz     not null default now(),
    updated_at          timestamptz     not null default now()
);


create table if not exists users_share (
    id                  integer     generated always as identity primary key,
    grantor_user_id     integer     not null
        references users (id) on delete cascade,
    grantee_user_id     integer     not null
        references users (id) on delete cascade,

    created_at          timestamptz not null default now(),
    revoked_at          timestamptz default null,

    -- Cannot grant self access
    constraint chk_users_share_not_self
        check (grantor_user_id != grantee_user_id),

    -- Cannot have revoke date < creation
    constraint chk_users_share_revoked_after_created
        check (revoked_at is null or revoked_at >= created_at)
);

-- Only one active copy of a grant at any one time
create unique index if not exists uq_users_share_active
    on users_share (grantor_user_id, grantee_user_id)
    where revoked_at is null;


create type unit_system as enum ('metric', 'imperial');
create type app_theme   as enum ('system', 'light', 'dark');

create table if not exists user_settings (
    user_id             integer primary key
        references users (id) on delete cascade,

    unit_system         unit_system     not null default 'metric',
    theme               app_theme       not null default 'system',
    expiry_warning_days smallint        not null default 3
        check (expiry_warning_days between 0 and 30),

    updated_at          timestamptz     not null default now()
);


--  ================================================================================================================  --
--    SECTION B -. PERMANENT INVENTORY TABLES                                                                         --
--  ================================================================================================================  --

create type store    as enum ('room', 'fridge', 'freezer');
create type counting as enum ('divisible', 'numerable');
create type barcode  as enum ('gtin', 'qr', 'code128');

create table if not exists items (
    id                  integer         generated always as identity primary key,
    user_id             integer         not null
        references users (id) on delete cascade,
    item_name           varchar         not null,
    created_at          timestamptz     not null default now(),
    updated_at          timestamptz     not null default now(),

    -- A user cannot own 2 items with same name
    constraint uq_items_user_name
        unique (user_id, item_name),

    -- Redundant with PK, but lets variants FK on (id, user_id) to enforce same owner relationship
    constraint uq_items_id_user
        unique (id, user_id)
);


create table if not exists item_variants (
    id                      integer         generated always as identity primary key,
    item_id                 integer         not null,
    user_id                 integer         not null,
    variant_name            varchar         not null,

    -- Typical weight of one unit (one apple, one grape, one carton)
    typical_weight_grams    integer         not null check (typical_weight_grams > 0),

    -- Weight of one serving; the app presents it per counting_method:
    --   divisible: typical_weight_grams / serving_grams = servings per unit
    --   numerable: serving_grams / typical_weight_grams = units per serving
    serving_grams           integer         not null check (serving_grams > 0),
    counting_method         counting        not null default 'divisible',

    default_store_mode      store           not null default 'room',


    icon_png                bytea           default null,
    created_at              timestamptz     not null default now(),

    -- Variant must belong to the same user as its item
    constraint fk_item_variants_item
        foreign key (item_id, user_id)
            references items (id, user_id) on delete cascade,

    -- Target for recipe_ingredients' composite FK
    constraint uq_item_variants_id_user
        unique (id, user_id),

    -- A divisible unit splits into servings - a numerable serving is made of whole units
    constraint chk_item_variants_serving_fits_counting
        check (
            (counting_method = 'divisible' and serving_grams <= typical_weight_grams) or
            (counting_method = 'numerable' and serving_grams >= typical_weight_grams)
            ),

    -- Unique item-variant pair
    constraint uq_item_variants_item_name
        unique (item_id, variant_name),

    -- Icon size must be small
    constraint chk_item_variants_icon_size
        check (icon_png is null or octet_length(icon_png) <= 100000),

    -- Reject any non .png file
    constraint chk_item_variants_icon_is_png
        check (icon_png is null or substring(icon_png from 1 for 8) = '\x89504e470d0a1a0a'::bytea)
);


create table if not exists expiry (

    -- Shelf life per variant per storage mode. Only the default_store_mode row is guaranteed,
    -- if an instance's store_mode has no row, the app prompts for one and saves it.
    variant_id      integer         not null
      references item_variants (id) on delete cascade,
    store_mode      store           not null,

    -- Default shelf life in days - starting point for the instance's expiry slider
    expiry_days     smallint        not null check (expiry_days > 0),
    created_at      timestamptz     not null default now(),

    -- One expiry value per variant per storage mode
    primary key (variant_id, store_mode)
);


-- Every variant must have an expiry row for its default storage mode.
-- Must be added after expiry because the two tables reference each other;
-- deferred so the variant and its expiry row can be inserted in the same transaction.
alter table item_variants
    add constraint fk_item_variants_default_expiry
        foreign key (id, default_store_mode)
            references expiry (variant_id, store_mode)
            deferrable initially deferred;

create unique index if not exists uq_item_variants_item_name_ci
    on item_variants (item_id, lower(variant_name));


create table if not exists barcodes (
    id              integer         generated always as identity primary key,
    variant_id      integer         not null
        references item_variants (id) on delete cascade,
    symbology       barcode         not null default 'gtin',
    code            text            not null,
    created_at      timestamptz     not null default now(),

    -- A variant cannot list the same barcode twice
    constraint uq_barcodes_variant_code
        unique (variant_id, symbology, code)
);



--  ================================================================================================================  --
--    SECTION C -. EPHEMERAL INVENTORY TABLES                                                                         --
--  ================================================================================================================  --

create type consumption as enum ('consumed', 'discarded', 'expired');

create table if not exists item_instances (
    id                  integer         generated always as identity primary key,
    variant_id          integer         not null
      references item_variants (id) on delete cascade,

    store_mode          store           not null default 'room',
    quantity            integer         not null default 1 check (quantity > 0),

    -- Actual weight per unit - snapshot from the variant's typical weight, editable per purchase
    unit_weight_grams   integer         not null check (unit_weight_grams > 0),
    added_at            timestamptz     not null default now(),

    -- Days added to or subtracted from the computed expiry. Negative means staler.
    expiry_modifier     smallint        not null default 0,

    -- Consumption tracked in grams; servings and units are converted in the app
    grams_consumed      integer         not null default 0 check (grams_consumed >= 0),
    consumption_reason  consumption     default null,
    created_at          timestamptz     not null default now(),
    removed_at          timestamptz     default null,

    -- Cannot consume more than the instance holds
    constraint chk_item_instances_grams_within_total
      check (grams_consumed <= quantity * unit_weight_grams),

    -- A reason is given exactly when the instance is removed
    constraint chk_item_instances_removed_consistent
      check ((removed_at is null) = (consumption_reason is null)),

    -- Cannot be removed before it was added
    constraint chk_item_instances_removed_after_added
      check (removed_at is null or removed_at >= added_at)
);


--  ================================================================================================================  --
--    SECTION D -. RECIPE TABLES                                                                                      --
--  ================================================================================================================  --

create table if not exists recipe (
    id              integer         generated always as identity primary key,
    user_id         integer         not null
        references users (id) on delete cascade,

    recipe_name     varchar         not null,
    servings        smallint        not null check (servings > 0),
    instructions    text,
    created_at      timestamptz     not null default now(),

    -- Redundant with PK, but lets ingredients FK on (id, user_id) to enforce same owner
    constraint uq_recipe_id_user
        unique (id, user_id),

    -- A user cannot have two recipes with the same name
    constraint uq_recipe_user_name
        unique (user_id, recipe_name)
);


create table if not exists recipe_ingredients (
    id              integer     generated always as identity primary key,
    recipe_id       integer     not null,
    variant_id      integer     not null,
    user_id         integer     not null,

    -- Amount of this ingredient used by the recipe, in grams
    grams           integer     not null check (grams > 0),

    -- Display order within recipe
    position        smallint    not null default 0,

    -- Ingredient row belongs to its recipe's owner - deleting the recipe removes its ingredients
    constraint fk_recipe_ingredients_recipe
        foreign key (recipe_id, user_id)
            references recipe (id, user_id) on delete cascade,

    -- Shared user_id forces the variant to have the same owner as the recipe
    constraint fk_recipe_ingredients_variant
        foreign key (variant_id, user_id)
            references item_variants (id, user_id),

    -- A recipe cannot list the same variant twice
    constraint uq_recipe_ingredients_recipe_variant
        unique (recipe_id, variant_id)
);


--  ================================================================================================================  --
--    SECTION E -. NUTRITION TABLES                                                                                   --
--  ================================================================================================================  --

create table if not exists nutrition (
    variant_id          integer         primary key
        references item_variants (id) on delete cascade,

    -- All nutrition values are per 100g
    calories_kcal       numeric(7, 2)   not null check (calories_kcal >= 0),

    carbohydrate_g      numeric(6, 2)   not null default 0 check (carbohydrate_g >= 0),
    sugar_g             numeric(6, 2)   check (sugar_g >= 0),
    fiber_g             numeric(6, 2)   check (fiber_g >= 0),

    fat_g               numeric(6, 2)   not null default 0 check (fat_g >= 0),
    saturated_fat_g     numeric(6, 2)   check (saturated_fat_g >= 0),

    protein_g           numeric(6, 2)   not null default 0 check (protein_g >= 0),

    sodium_mg           numeric(8, 2)   check (sodium_mg >= 0),
    created_at          timestamptz     not null default now(),

    -- Sugar is a subset of carbohydrate
    constraint chk_nutrition_sugar_within_carbs
        check (sugar_g is null or sugar_g <= carbohydrate_g),

    -- Saturated fat is a subset of total fat
    constraint chk_nutrition_sat_fat_within_fat
        check (saturated_fat_g is null or saturated_fat_g <= fat_g)
);


--  ================================================================================================================  --
--    SECTION F -. LOGGING                                                                                            --
--  ================================================================================================================  --

create type log_action as enum ('insert', 'update', 'delete', 'login', 'share','revoke');
create type table_name as enum ('users', 'users_share', 'items', 'item_variants');

create table if not exists logs (
    id              integer         generated always as identity primary key,
    logged_at       timestamptz     not null default now(),

    user_id         integer
        references users (id) on delete set null,

    action          log_action      not null,
    table_name      table_name      not null,

    row_id          integer,
    successful      boolean         not null default true,
    details         jsonb
);

create index ix_logs_table_row on logs (table_name, row_id);
create index ix_logs_logged_at on logs (logged_at);

--  ================================================= END OF FILE ==================================================  --
