USE petshop_db;

CREATE TABLE IF NOT EXISTS groomers (
    groomer_id INT NOT NULL AUTO_INCREMENT,
    groomer_name VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (groomer_id),
    UNIQUE KEY uq_groomers_name (groomer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO groomers (groomer_name) VALUES ('Jaycee'), ('Joshua');

CREATE TABLE IF NOT EXISTS groomer_availability (
    availability_id INT NOT NULL AUTO_INCREMENT,
    groomer_id INT NOT NULL,
    day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday, 6=Saturday',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (availability_id),
    UNIQUE KEY uq_groomer_day (groomer_id, day_of_week),
    CONSTRAINT fk_availability_groomer FOREIGN KEY (groomer_id)
        REFERENCES groomers (groomer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO groomer_availability (groomer_id, day_of_week, start_time, end_time)
SELECT groomer_id, days.day_number, '09:00:00', '17:00:00'
FROM groomers
CROSS JOIN (
    SELECT 0 AS day_number UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
    SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) AS days;

CREATE TABLE IF NOT EXISTS grooming_appointments (
    appointment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reservation_code VARCHAR(24) NOT NULL,
    customer_id INT NOT NULL,
    pet_id INT NOT NULL,
    grooming_style_id INT NOT NULL,
    groomer_id INT NOT NULL,
    booking_type ENUM('Salon', 'Home Service') NOT NULL DEFAULT 'Salon',
    service_address TEXT NULL,
    pet_size VARCHAR(50) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    special_instructions TEXT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
    cancelled_at DATETIME NULL,
    active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'Cancelled' THEN NULL ELSE 1 END) STORED,
    confirmation_email_sent_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (appointment_id),
    UNIQUE KEY uq_reservation_code (reservation_code),
    UNIQUE KEY uq_groomer_slot (groomer_id, appointment_date, appointment_time, active_slot),
    KEY idx_customer_appointments (customer_id, appointment_date),
    KEY idx_pet_appointments (pet_id),
    CONSTRAINT fk_appointment_customer FOREIGN KEY (customer_id)
        REFERENCES customers (id),
    CONSTRAINT fk_appointment_pet FOREIGN KEY (pet_id)
        REFERENCES pets (id),
    CONSTRAINT fk_appointment_style FOREIGN KEY (grooming_style_id)
        REFERENCES grooming_styles (style_id),
    CONSTRAINT fk_appointment_groomer FOREIGN KEY (groomer_id)
        REFERENCES groomers (groomer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS appointment_addons (
    appointment_id BIGINT UNSIGNED NOT NULL,
    addon_id INT NOT NULL,
    price_at_booking DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (appointment_id, addon_id),
    CONSTRAINT fk_appointment_addons_appointment FOREIGN KEY (appointment_id)
        REFERENCES grooming_appointments (appointment_id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_addons_addon FOREIGN KEY (addon_id)
        REFERENCES grooming_addons (addon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
