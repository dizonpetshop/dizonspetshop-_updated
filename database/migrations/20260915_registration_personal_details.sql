USE petshop_db;

ALTER TABLE users
    MODIFY COLUMN username VARCHAR(100) NULL,
    ADD COLUMN surname VARCHAR(100) NULL AFTER username,
    ADD COLUMN first_name VARCHAR(100) NULL AFTER surname,
    ADD COLUMN middle_initial VARCHAR(2) NULL AFTER first_name,
    ADD COLUMN phone_number VARCHAR(20) NULL AFTER middle_initial;

UPDATE users
SET first_name = COALESCE(first_name, username)
WHERE first_name IS NULL;

ALTER TABLE pending_registrations
    DROP KEY idx_pending_registrations_username,
    DROP COLUMN username,
    ADD COLUMN surname VARCHAR(100) NOT NULL AFTER id,
    ADD COLUMN first_name VARCHAR(100) NOT NULL AFTER surname,
    ADD COLUMN middle_initial VARCHAR(2) NULL AFTER first_name,
    ADD COLUMN phone_number VARCHAR(20) NOT NULL AFTER middle_initial,
    ADD KEY idx_pending_registrations_name (surname, first_name);
