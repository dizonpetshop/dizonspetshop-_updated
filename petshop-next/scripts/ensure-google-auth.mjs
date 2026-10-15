import {PrismaClient} from '@prisma/client';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function ensureGoogleAuth(db){
  const fields=await db.$queryRawUnsafe("SHOW COLUMNS FROM users WHERE Field='id'");
  const type=fields[0]?.Type;if(!/^int(?:\(\d+\))?(?: unsigned)?$/i.test(type||''))throw new Error('Unsupported user ID type.');
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS google_identities (
    google_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    user_id ${type} NOT NULL UNIQUE,
    created_at DATETIME(3) NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('Google sign-in identity storage ready. Existing accounts preserved.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url).toLowerCase()===resolve(process.argv[1]).toLowerCase()){
  const db=new PrismaClient();try{await ensureGoogleAuth(db);}finally{await db.$disconnect();}
}
