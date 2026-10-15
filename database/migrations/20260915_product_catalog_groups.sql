USE petshop_db;

ALTER TABLE products
    ADD COLUMN product_group ENUM('Food', 'Shampoo', 'Other') NOT NULL DEFAULT 'Other' AFTER category;

UPDATE products
SET product_group = CASE
    WHEN product_name LIKE '%Shampoo%' THEN 'Shampoo'
    WHEN category LIKE '%Food%' THEN 'Food'
    ELSE 'Other'
END;

INSERT INTO products (sku, category, product_group, product_name, description, price, stock_quantity, reorder_level, image) VALUES
('DOG-SHAMPOO-002', 'Dog Hygiene', 'Shampoo', 'Oatmeal Dog Shampoo', 'Soothing oatmeal shampoo for sensitive skin and regular baths.', 215.00, 16, 5, NULL),
('CAT-SHAMPOO-001', 'Cat Hygiene', 'Shampoo', 'Waterless Cat Shampoo', 'No-rinse cleansing foam designed for gentle cat grooming.', 195.00, 14, 4, NULL)
ON DUPLICATE KEY UPDATE
    category = VALUES(category),
    product_group = VALUES(product_group),
    product_name = VALUES(product_name),
    description = VALUES(description),
    price = VALUES(price),
    reorder_level = VALUES(reorder_level);
