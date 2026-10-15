import { spawnSync } from 'node:child_process';
const configuredUrl = process.env.DATABASE_URL;
if (!configuredUrl || new URL(configuredUrl).protocol !== 'mysql:') throw new Error('Set a MySQL DATABASE_URL matching the existing Prisma schema.');
// Historical PostgreSQL migrations must never run against this MySQL database.
const script = process.argv.includes('--apply') ? 'scripts/ensure-mysql-operations.mjs' : 'scripts/check-database.mjs';
if (process.argv.includes('--dry-run')) { console.log(`MySQL deployment plan: ${script}; no changes executed.`); process.exit(0); }
const result = spawnSync(process.execPath, [script], { env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
