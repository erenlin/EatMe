--  ================================================================================================================  --
--    RECIPE TABLES                                                                                      --
--  ================================================================================================================  --

drop table if exists recipe;
drop table if exists recipe_ingredients;

--  ================================================================================================================  --
--    EPHEMERAL INVENTORY TABLES                                                                                      --
--  ================================================================================================================  --

drop table if exists item_instances;
drop type if exists consumption;


--  ================================================================================================================  --
--    PERMANENT INVENTORY TABLES                                                                                      --
--  ================================================================================================================  --

drop table if exists barcodes;
drop table if exists expiry;
drop table if exists item_variants;

drop table if exists items;
drop type if exists barcode;
drop type if exists counting;
drop type if exists storage;

--  ================================================================================================================  --
--    ADMINISTRATION TABLES                                                                                           --
--  ================================================================================================================  --

drop table if exists user_settings;

drop index if exists uq_users_share_active;


drop table if exists users_share;


drop table if exists users;

drop type if exists gender;


