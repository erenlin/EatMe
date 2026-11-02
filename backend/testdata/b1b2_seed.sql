-- EatMe B1/B2 test data
-- Requires the test user to exist before running.

DO $$
DECLARE
    v_user_id integer;
    v_item_id integer;
BEGIN
    -- Find the test user without hardcoding its ID.
    SELECT id INTO v_user_id
    FROM kitchen.users
    WHERE email = 'eatme.b1b2.test2@example.com';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Test user not found. Create the test account first.';
    END IF;

    -- Create the test item.
    SELECT item_id INTO v_item_id
    FROM kitchen.usp_item_add(v_user_id, 'B2 Test Tomato');

    -- Create the variant with a 7-day default expiry.
    PERFORM kitchen.usp_variant_add(
        v_user_id,
        v_item_id,
        'Whole Tomato',
        150,
        150,
        7
    );
END $$;