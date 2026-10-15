export function databaseConfigurationError(): string | null {
  const value = process.env.DATABASE_URL;
  if (!value) return "DATABASE_URL is missing.";
  try {
    const url = new URL(value);
    if (url.protocol !== "mysql:") {
      return "DATABASE_URL must use MySQL for the current Prisma schema.";
    }
    if (!url.hostname || !url.pathname || url.pathname === "/") {
      return "DATABASE_URL is incomplete.";
    }
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }
  return null;
}

export function logDatabaseFailure(context: string, error: unknown): void {
  const failure = error && typeof error === "object" ? error as { name?: string; code?: string } : {};
  console.error(`${context}: database request failed`, { name: failure.name, code: failure.code });
}
