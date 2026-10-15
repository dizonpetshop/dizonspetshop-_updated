ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "loyalty_stamps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reward_available" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reward_redeemed_at" TIMESTAMP(3);

ALTER TABLE "groomers"
  ADD COLUMN IF NOT EXISTS "contact_number" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "profile_image" TEXT;

ALTER TABLE "grooming_appointments"
  ADD COLUMN IF NOT EXISTS "contact_name" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "contact_number" VARCHAR(20);

ALTER TABLE "product_reservations"
  ADD COLUMN IF NOT EXISTS "customer_name" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "contact_number" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;

UPDATE "grooming_appointments" AS appointment
SET "contact_name" = customer."customer_name",
    "contact_number" = customer."phone"
FROM "customers" AS customer
WHERE customer."id" = appointment."customer_id";

UPDATE "product_reservations" AS reservation
SET "customer_name" = customer."customer_name",
    "contact_number" = customer."phone",
    "delivery_address" = customer."address"
FROM "customers" AS customer
WHERE customer."id" = reservation."customer_id";

UPDATE "product_reservations" SET "status" = 'Approved' WHERE "status" = 'Confirmed';
UPDATE "product_reservations" SET "status" = 'Completed' WHERE "status" = 'Claimed';

CREATE TABLE IF NOT EXISTS "groomer_availability" (
  "availability_id" SERIAL PRIMARY KEY,
  "groomer_id" INTEGER NOT NULL REFERENCES "groomers"("groomer_id") ON DELETE CASCADE,
  "day_of_week" INTEGER NOT NULL CHECK ("day_of_week" BETWEEN 0 AND 6),
  "start_time" TIME(0) NOT NULL,
  "end_time" TIME(0) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "groomer_availability_valid_time" CHECK ("start_time" < "end_time"),
  CONSTRAINT "groomer_availability_groomer_id_day_of_week_key" UNIQUE ("groomer_id", "day_of_week")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "notification_id" BIGSERIAL PRIMARY KEY,
  "recipient_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_key" VARCHAR(120) NOT NULL,
  "title" VARCHAR(150) NOT NULL,
  "message" TEXT NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "related_type" VARCHAR(50),
  "related_id" VARCHAR(50),
  "link" VARCHAR(255) NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_recipient_id_event_key_key" UNIQUE ("recipient_id", "event_key")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "audit_log_id" BIGSERIAL PRIMARY KEY,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "user_name" VARCHAR(150) NOT NULL,
  "role" VARCHAR(50) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "record_id" VARCHAR(80),
  "description" TEXT NOT NULL,
  "ip_address" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "transaction_id" BIGSERIAL PRIMARY KEY,
  "customer_id" INTEGER NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "changed_by_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "change_amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL CHECK ("balance_after" BETWEEN 0 AND 10),
  "reason" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" VARCHAR(80) PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "system_settings" ("key", "value") VALUES
  ('loyalty_reward_label', 'VIP / Reward Available')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "groomers" ("groomer_name", "is_active") VALUES
  ('Jaycee', 1),
  ('Joshua', 1)
ON CONFLICT ("groomer_name") DO NOTHING;

CREATE INDEX IF NOT EXISTS "grooming_appointments_appointment_date_status_idx" ON "grooming_appointments"("appointment_date", "status");
CREATE INDEX IF NOT EXISTS "grooming_appointments_groomer_id_appointment_date_appointment_time_idx" ON "grooming_appointments"("groomer_id", "appointment_date", "appointment_time");
CREATE INDEX IF NOT EXISTS "product_reservations_created_at_status_idx" ON "product_reservations"("created_at", "status");
CREATE INDEX IF NOT EXISTS "groomer_availability_day_of_week_is_active_idx" ON "groomer_availability"("day_of_week", "is_active");
CREATE INDEX IF NOT EXISTS "notifications_recipient_id_is_read_created_at_idx" ON "notifications"("recipient_id", "is_read", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_action_module_idx" ON "audit_logs"("user_id", "action", "module");
CREATE INDEX IF NOT EXISTS "loyalty_transactions_customer_id_created_at_idx" ON "loyalty_transactions"("customer_id", "created_at");
