import { createHmac, timingSafeEqual } from "node:crypto";

const tokenVersion = "v1";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return value;
}

function digest(userId: number, email: string, code: string) {
  return createHmac("sha256", secret()).update(`password-reset:${userId}:${email}:${code}`).digest("hex");
}

export function createPasswordResetToken(userId: number, email: string, code: string) {
  return `${tokenVersion}.${Date.now()}.0.${digest(userId, email, code)}`;
}

export function readPasswordResetToken(token?: string | null) {
  if (!token) return null;
  const [version, issuedValue, attemptsValue, hash] = token.split(".");
  const issuedAt = Number(issuedValue);
  const attempts = Number(attemptsValue);
  if (version !== tokenVersion || !Number.isSafeInteger(issuedAt) || !Number.isInteger(attempts) || !/^[a-f0-9]{64}$/.test(hash)) return null;
  return { issuedAt, attempts, hash };
}

export function passwordResetCodeMatches(userId: number, email: string, code: string, hash: string) {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(digest(userId, email, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function withFailedAttempt(token: string, attempts: number) {
  const parsed = readPasswordResetToken(token);
  return parsed ? `${tokenVersion}.${parsed.issuedAt}.${attempts}.${parsed.hash}` : null;
}

export function isStrongPassword(password: string) {
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
