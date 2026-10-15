import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const p = new PrismaClient();
const base = 'http://localhost:3000';
// Explicit live-server diagnostic: creates and retains one named test account.
// Passwords stay in memory and are never printed or written to disk.
const email = `auth-check-${randomBytes(6).toString('hex')}@audit.invalid`;
const password = `Aa1!${randomBytes(16).toString('hex')}`;
const post = (path, fields, cookie = '') => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(fields) });
try {
  const r = await post('/api/auth/register', { firstName: 'Authentication', surname: 'Check', phone: '09123456789', email, password, confirmPassword: password });
  console.log('Register:', r.status, r.headers.get('location'));
  assert.equal(r.status, 303); assert.ok(r.headers.get('location')?.includes('registered=1'));
  const user = await p.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.role, 'User'); assert.equal(user.accountStatus, 'Active'); assert.ok(await compare(password, user.password));
  console.log('Saved bcrypt/role/status: PASS; diagnostic account id:', user.id);
  const login = await post('/api/auth/client-login', { email, password });
  console.log('Login:', login.status, login.headers.get('location'), 'Cookie issued:', !!login.headers.get('set-cookie'));
  assert.equal(login.status, 303); assert.equal(new URL(login.headers.get('location')).pathname, '/client/dashboard');
  const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  for (const path of ['/client/dashboard', '/client/dashboard?view=account', '/client/dashboard?view=pets']) {
    const page = await fetch(base + path, { redirect: 'manual', headers: { Cookie: cookie } });
    console.log(path, page.status, page.headers.get('location'));
    assert.equal(page.status, 200);
  }
  const logout = await post('/api/auth/logout', { destination: 'client' }, cookie);
  assert.equal(logout.status, 303);
  const replay = await fetch(base + '/client/dashboard', { redirect: 'manual', headers: { Cookie: cookie } });
  assert.equal(replay.status, 307);
  console.log('Logout and replay rejection: PASS. Diagnostic account retained; no existing accounts changed.');
} finally { await p.$disconnect(); }
