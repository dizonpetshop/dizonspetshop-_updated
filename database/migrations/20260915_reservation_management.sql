USE petshop_db;

ALTER TABLE grooming_appointments
    ADD COLUMN cancelled_at DATETIME NULL AFTER status;
