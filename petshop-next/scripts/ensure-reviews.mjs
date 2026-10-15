import {PrismaClient} from '@prisma/client';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export async function ensureReviews(db) {
  const type = async (table, field) => {
    const rows = await db.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\` WHERE Field='${field}'`);
    const value=rows[0]?.Type;
    if(!/^(?:big)?int(?:\(\d+\))?(?: unsigned)?$/i.test(value||'')) throw new Error('Unsupported review parent key type.');
    return value;
  };
  const user=await type('users','id'), customer=await type('customers','id'), appointment=await type('grooming_appointments','appointment_id');
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS grooming_reviews (
    review_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id ${user} NOT NULL,
    customer_id ${customer} NOT NULL,
    appointment_id ${appointment} NOT NULL UNIQUE,
    rating TINYINT NOT NULL,
    title VARCHAR(100) NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    moderation_reason VARCHAR(500) NULL,
    moderated_by ${user} NULL,
    moderated_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT grooming_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT grooming_reviews_status CHECK (status IN ('Pending','Approved','Rejected','Hidden','Removed')),
    INDEX reviews_public_idx(status,created_at),
    INDEX reviews_owner_idx(user_id,created_at),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY(appointment_id) REFERENCES grooming_appointments(appointment_id) ON DELETE RESTRICT,
    FOREIGN KEY(moderated_by) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const fields=await db.$queryRawUnsafe('SHOW COLUMNS FROM grooming_reviews');
  if(!fields.some(f=>f.Field==='product_reservation_id')){
    const reservation=await type('product_reservations','reservation_id');
    await db.$executeRawUnsafe(`ALTER TABLE grooming_reviews ADD COLUMN product_reservation_id ${reservation} NULL UNIQUE, ADD CONSTRAINT reviews_product_reservation_fk FOREIGN KEY(product_reservation_id) REFERENCES product_reservations(reservation_id) ON DELETE RESTRICT`);
  }
  if(fields.find(f=>f.Field==='appointment_id')?.Null==='NO')await db.$executeRawUnsafe(`ALTER TABLE grooming_reviews MODIFY appointment_id ${appointment} NULL`);
  const constraints=await db.$queryRawUnsafe("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='grooming_reviews' AND CONSTRAINT_NAME='reviews_one_target'");
  if(constraints.length){
    const version=await db.$queryRawUnsafe('SELECT VERSION() AS version');
    await db.$executeRawUnsafe(/mariadb/i.test(version[0].version)?'ALTER TABLE grooming_reviews DROP CONSTRAINT reviews_one_target':'ALTER TABLE grooming_reviews DROP CHECK reviews_one_target');
  }
  const relaxed=await db.$queryRawUnsafe("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='grooming_reviews' AND CONSTRAINT_NAME='reviews_optional_target'");
  if(!relaxed.length)await db.$executeRawUnsafe('ALTER TABLE grooming_reviews ADD CONSTRAINT reviews_optional_target CHECK (appointment_id IS NULL OR product_reservation_id IS NULL)');
  console.log('Grooming and product reviews schema ready. Existing records preserved; no reviews seeded.');
}
if(process.argv[1] && fileURLToPath(import.meta.url).toLowerCase()===resolve(process.argv[1]).toLowerCase()) {
  const db=new PrismaClient();try{await ensureReviews(db);}finally{await db.$disconnect();}
}
