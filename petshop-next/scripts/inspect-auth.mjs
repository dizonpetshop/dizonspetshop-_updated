import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const url = new URL(process.env.DATABASE_URL);
  console.log('Authentication database:', url.hostname, url.pathname);
  const rows = await prisma.user.findMany({ orderBy: { id: 'desc' } });
  console.log(JSON.stringify(rows.map(u => ({ id: u.id, role: u.role, status: u.accountStatus, verified: !!u.emailVerifiedAt, failedAttempts: u.failedAttempts, locked: !!u.lockoutTime && u.lockoutTime.getTime() + 900000 > Date.now(), hashFormat: u.password.slice(0, 4), hashLength: u.password.length, normalizedEmail: u.email === u.email.trim().toLowerCase(), createdAt: u.createdAt })), null, 2));
  console.log(JSON.stringify(await prisma.$queryRawUnsafe('SHOW COLUMNS FROM users'), null, 2));
  for (const port of [3000, 3001]) {
    try {
      const r = await fetch(`http://localhost:${port}/client/login`, { signal: AbortSignal.timeout(10000) });
      console.log('Login page', port, r.status, (await r.text()).includes('CUSTOMER LOGIN'));
      const response = await fetch(`http://localhost:${port}/api/auth/client-login`, { method: 'POST', headers: { Origin: `http://localhost:${port}` }, body: new URLSearchParams({ email: 'nonexistent-auth-probe@audit.invalid', password: 'Invalid1!' }), redirect: 'manual' });
      console.log('Nonexistent account POST', response.status, response.headers.get('location'), response.status === 403 ? await response.text() : '');
    } catch { console.log('No responding login page on', port); }
  }
} finally { await prisma.$disconnect(); }
