import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function ensureMessaging(prisma) {
  const parentType = async table => {
    const rows = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\` WHERE Field='id'`);
    const type = rows[0]?.Type;
    if (!/^int(?:\(\d+\))?(?: unsigned)?$/i.test(type || '')) throw new Error('Unsupported messaging parent ID type.');
    return type;
  };
  const userType = await parentType('users'); const customerType = await parentType('customers');
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS support_conversations (
    conversation_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_user_id ${userType} NOT NULL UNIQUE,
    customer_id ${customerType} NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    INDEX support_conversations_updated_idx(updated_at),
    FOREIGN KEY(customer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS support_messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id ${userType} NOT NULL,
    sender_role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    request_key VARCHAR(32) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    read_at DATETIME(3) NULL,
    UNIQUE KEY support_messages_request_unique(sender_id,request_key),
    INDEX support_messages_conversation_idx(conversation_id,message_id),
    INDEX support_messages_unread_idx(conversation_id,sender_role,read_at),
    INDEX support_messages_rate_idx(sender_id,created_at),
    FOREIGN KEY(conversation_id) REFERENCES support_conversations(conversation_id) ON DELETE RESTRICT,
    FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS support_message_images (
    message_id BIGINT NOT NULL PRIMARY KEY,
    mime_type VARCHAR(40) NOT NULL,
    image_bytes MEDIUMBLOB NOT NULL,
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY(message_id) REFERENCES support_messages(message_id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log('Messaging tables and image attachments are available. Existing records were preserved.');
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const prisma = new PrismaClient();
  try { await ensureMessaging(prisma); } finally { await prisma.$disconnect(); }
}
