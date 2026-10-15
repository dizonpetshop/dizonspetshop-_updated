USE petshop_db;

ALTER TABLE users
    ADD COLUMN account_status ENUM('Active', 'Suspended') NOT NULL DEFAULT 'Active' AFTER role;

ALTER TABLE products
    ADD COLUMN sku VARCHAR(40) NULL AFTER product_id,
    ADD COLUMN stock_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER price,
    ADD COLUMN reorder_level INT UNSIGNED NOT NULL DEFAULT 5 AFTER stock_quantity,
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER reorder_level,
    ADD UNIQUE KEY uq_products_sku (sku);

UPDATE products
SET sku = CONCAT('LEGACY-', LPAD(product_id, 4, '0'))
WHERE sku IS NULL;

UPDATE products SET stock_quantity = 24, reorder_level = 6 WHERE stock_quantity = 0;

CREATE TABLE product_reservations (
    reservation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reservation_code VARCHAR(24) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Confirmed', 'Ready for Pickup', 'Claimed', 'Cancelled') NOT NULL DEFAULT 'Pending',
    reserved_until DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_reservation_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

CREATE TABLE product_reservation_items (
    reservation_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT UNSIGNED NOT NULL,
    product_id INT NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_product_reservation FOREIGN KEY (reservation_id) REFERENCES product_reservations(reservation_id) ON DELETE CASCADE,
    CONSTRAINT fk_reserved_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB;

INSERT INTO products (sku, category, product_name, description, price, stock_quantity, reorder_level, image) VALUES
('DOG-FOOD-001', 'Dog Food', 'Adult Dog Food', 'Balanced everyday nutrition for adult dogs.', 320.00, 30, 8, 'TOP BREED ADULT.jpg'),
('DOG-TREAT-001', 'Dog Treats', 'Dental Chew Sticks', 'Daily dental chews that help reduce plaque.', 145.00, 24, 6, 'DENTA PRO.jpg'),
('DOG-HYGIENE-001', 'Dog Hygiene', 'Gentle Dog Shampoo', 'Mild cleansing shampoo for regular baths.', 189.00, 18, 5, NULL),
('DOG-HYGIENE-002', 'Dog Hygiene', 'Tick and Flea Soap', 'Everyday coat care for tick and flea protection.', 95.00, 20, 5, NULL),
('DOG-ACCESSORY-001', 'Dog Accessories', 'Adjustable Dog Collar', 'Comfortable adjustable collar for daily walks.', 160.00, 16, 4, NULL),
('DOG-ACCESSORY-002', 'Dog Accessories', 'Dog Leash', 'Durable leash with a secure metal clasp.', 220.00, 14, 4, NULL),
('DOG-TOY-001', 'Dog Toys', 'Durable Chew Ball', 'Textured enrichment toy for active dogs.', 135.00, 18, 5, NULL),
('DOG-CARE-001', 'Dog Care', 'Paw and Nose Balm', 'Moisturizing balm for dry paws and noses.', 175.00, 12, 4, NULL),
('CAT-FOOD-001', 'Cat Food', 'Adult Cat Food', 'Complete daily nutrition with essential taurine.', 250.00, 30, 8, 'ZOI CAT.jpg'),
('CAT-TREAT-001', 'Cat Treats', 'Creamy Cat Treats', 'Soft lickable treats for cats of all ages.', 120.00, 25, 6, NULL),
('CAT-HYGIENE-001', 'Cat Hygiene', 'Clumping Cat Litter', 'Fast-clumping litter with reliable odor control.', 285.00, 22, 6, NULL),
('CAT-HYGIENE-002', 'Cat Hygiene', 'Cat Grooming Wipes', 'Unscented wipes for quick coat and paw cleaning.', 150.00, 16, 4, NULL),
('CAT-ACCESSORY-001', 'Cat Accessories', 'Breakaway Cat Collar', 'Lightweight safety collar with a bell.', 125.00, 18, 5, NULL),
('CAT-ACCESSORY-002', 'Cat Accessories', 'Food and Water Bowl', 'Easy-clean feeding bowl for daily meals.', 180.00, 15, 4, NULL),
('CAT-TOY-001', 'Cat Toys', 'Feather Wand', 'Interactive teaser toy for exercise and bonding.', 110.00, 20, 5, NULL),
('CAT-CARE-001', 'Cat Care', 'Hairball Support Paste', 'Palatable supplement for routine hairball care.', 210.00, 12, 4, NULL)
ON DUPLICATE KEY UPDATE
    product_name = VALUES(product_name),
    category = VALUES(category),
    description = VALUES(description),
    price = VALUES(price),
    reorder_level = VALUES(reorder_level),
    image = VALUES(image);
