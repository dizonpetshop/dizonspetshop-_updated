import {ensureReservationReceipts} from './ensure-reservation-receipts.mjs';
import {ensureLoyaltyPolicy} from "./ensure-loyalty-policy.mjs";
import {ensureReviews} from "./ensure-reviews.mjs";
import {ensureGoogleAuth} from "./ensure-google-auth.mjs";
import {ensureReservationCheckout} from "./ensure-reservation-checkout.mjs";
import {ensureProductExpiry} from "./ensure-product-expiry.mjs";
import { PrismaClient } from "@prisma/client";
import { ensureAttendance } from "./ensure-attendance.mjs";
import { ensureMessaging } from "./ensure-messaging.mjs";

const prisma = new PrismaClient();
const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");

async function rows(sql, ...values) {
  return prisma.$queryRawUnsafe(sql, ...values);
}

async function tableExists(table) {
  const result = await rows(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
    databaseName,
    table,
  );
  return result.length > 0;
}

async function columnExists(table, column) {
  const result = await rows(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1",
    databaseName,
    table,
    column,
  );
  return result.length > 0;
}

async function indexExists(table, index) {
  const result = await rows(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1",
    databaseName,
    table,
    index,
  );
  return result.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`Added ${table}.${column}`);
}

async function addIndex(table, index, columns) {
  if (await indexExists(table, index)) return;
  await prisma.$executeRawUnsafe(`CREATE INDEX \`${index}\` ON \`${table}\` (${columns})`);
  console.log(`Added ${table}.${index}`);
}

try {
  await ensureMessaging(prisma);
  await ensureAttendance(prisma);
  if (!databaseName) throw new Error("DATABASE_URL must include a database name.");
  if (!(await tableExists("revoked_sessions"))) {
    await prisma.$executeRawUnsafe("CREATE TABLE revoked_sessions (session_id VARCHAR(64) PRIMARY KEY, expires_at DATETIME(3) NOT NULL, INDEX revoked_sessions_expires_at_idx (expires_at)) ENGINE=InnoDB");
    console.log("Created revoked_sessions");
  }
  await addColumn("pets", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn("pets", "age_dob", "VARCHAR(100) NULL");
  await addColumn("pets", "gender", "VARCHAR(10) NULL");
  await addColumn("grooming_appointments", "reminder_email_sent_at", "DATETIME(3) NULL");
  await prisma.$executeRawUnsafe("ALTER TABLE pets MODIFY photo_path LONGTEXT NULL");
  if (!(await tableExists("appointment_addons"))) {
    const appointmentColumns = await rows("SELECT column_type FROM information_schema.columns WHERE table_schema = ? AND table_name = 'grooming_appointments' AND column_name = 'appointment_id'", databaseName);
    const addonColumns = await rows("SELECT column_type FROM information_schema.columns WHERE table_schema = ? AND table_name = 'grooming_addons' AND column_name = 'addon_id'", databaseName);
    const appointmentType = appointmentColumns[0]?.column_type;
    const addonType = addonColumns[0]?.column_type;
    if (![appointmentType, addonType].every((type) => /^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type))) throw new Error("Unsupported parent identifier types for appointment add-ons.");
    await prisma.$executeRawUnsafe(`CREATE TABLE appointment_addons (
      appointment_id ${appointmentType} NOT NULL,
      addon_id ${addonType} NOT NULL,
      price_at_booking DECIMAL(10,2) NOT NULL,
      PRIMARY KEY (appointment_id, addon_id),
      FOREIGN KEY (appointment_id) REFERENCES grooming_appointments(appointment_id) ON DELETE CASCADE,
      FOREIGN KEY (addon_id) REFERENCES grooming_addons(addon_id)
    ) ENGINE=InnoDB`);
    console.log("Created appointment_addons");
  }

  await addColumn("customers", "loyalty_stamps", "INT NOT NULL DEFAULT 0");
  await addColumn("customers", "reward_available", "TINYINT(1) NOT NULL DEFAULT 0");
  await addColumn("customers", "reward_redeemed_at", "DATETIME(3) NULL");
  await addColumn("groomers", "contact_number", "VARCHAR(20) NULL");
  await addColumn("groomers", "profile_image", "TEXT NULL");
  await addColumn("grooming_appointments", "contact_name", "VARCHAR(150) NULL");
  await addColumn("grooming_appointments", "contact_number", "VARCHAR(20) NULL");
  await addColumn("product_reservations", "customer_name", "VARCHAR(150) NULL");
  await addColumn("product_reservations", "contact_number", "VARCHAR(20) NULL");
  await addColumn("product_reservations", "delivery_address", "TEXT NULL");

  await prisma.$executeRawUnsafe(`
    UPDATE grooming_appointments AS appointment
    INNER JOIN customers AS customer ON customer.id = appointment.customer_id
    SET appointment.contact_name = COALESCE(appointment.contact_name, customer.customer_name),
        appointment.contact_number = COALESCE(appointment.contact_number, customer.phone)
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE product_reservations AS reservation
    INNER JOIN customers AS customer ON customer.id = reservation.customer_id
    SET reservation.customer_name = COALESCE(reservation.customer_name, customer.customer_name),
        reservation.contact_number = COALESCE(reservation.contact_number, customer.phone),
        reservation.delivery_address = COALESCE(reservation.delivery_address, customer.address)
  `);

  await prisma.$executeRawUnsafe("UPDATE product_reservations SET status = 'Approved' WHERE status = 'Confirmed'");
  await prisma.$executeRawUnsafe("UPDATE product_reservations SET status = 'Completed' WHERE status = 'Claimed'");
  await prisma.$executeRawUnsafe("ALTER TABLE product_reservations MODIFY status ENUM('Pending','Approved','Ready for Pickup','Completed','Rejected','Cancelled') NOT NULL DEFAULT 'Pending'");
  await prisma.$executeRawUnsafe("ALTER TABLE grooming_appointments MODIFY status ENUM('Pending','Confirmed','Completed','Rejected','Cancelled','Checked In','In Progress','Cancelled - No Show') NOT NULL DEFAULT 'Pending'");

  if (!(await tableExists("notifications"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE notifications (
        notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        recipient_id INT NOT NULL,
        event_key VARCHAR(120) NOT NULL,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        related_type VARCHAR(50) NULL,
        related_id VARCHAR(50) NULL,
        link VARCHAR(255) NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY notifications_recipient_id_event_key_key (recipient_id, event_key),
        CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log("Created notifications");
  }

  if (!(await tableExists("audit_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE audit_logs (
        audit_log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        action VARCHAR(80) NOT NULL,
        module VARCHAR(80) NOT NULL,
        record_id VARCHAR(80) NULL,
        description TEXT NOT NULL,
        ip_address VARCHAR(64) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log("Created audit_logs");
  }

  if (!(await tableExists("loyalty_transactions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE loyalty_transactions (
        transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        changed_by_id INT NOT NULL,
        change_amount INT NOT NULL,
        balance_after INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT loyalty_transactions_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
    console.log("Created loyalty_transactions");
  }

  if (!(await tableExists("system_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE system_settings (
        \`key\` VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB
    `);
    console.log("Created system_settings");
  }

  await prisma.$executeRawUnsafe("INSERT IGNORE INTO system_settings (`key`, value) VALUES ('loyalty_reward_label', 'VIP / Reward Available')");
  await addIndex("grooming_appointments", "grooming_appointments_appointment_date_status_idx", "appointment_date, status");
  await addIndex("grooming_appointments", "groomer_schedule_idx", "groomer_id, appointment_date, appointment_time");
  await addIndex("product_reservations", "product_reservations_created_at_status_idx", "created_at, status");
  await addIndex("notifications", "notifications_recipient_id_is_read_created_at_idx", "recipient_id, is_read, created_at");
  await addIndex("audit_logs", "audit_logs_created_at_idx", "created_at");
  await addIndex("audit_logs", "audit_logs_user_id_action_module_idx", "user_id, action, module");
  await addIndex("loyalty_transactions", "loyalty_transactions_customer_id_created_at_idx", "customer_id, created_at");

  await ensureLoyaltyPolicy(prisma);
  await ensureProductExpiry(prisma);
  await ensureReviews(prisma);
  await ensureGoogleAuth(prisma);
  await ensureReservationCheckout(prisma);
  await ensureReservationReceipts(prisma);
  console.log("MySQL operations schema is ready.");
} finally {
  await prisma.$disconnect();
}
