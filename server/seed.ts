import crypto from "crypto";

/**
 * Password for the seed admin account created on an empty database.
 * Production requires SEED_ADMIN_PASSWORD; development falls back to a
 * random password that is printed once to the console.
 */
export function resolveSeedAdminPassword(
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = console.warn,
): string {
  const configured = env.SEED_ADMIN_PASSWORD;
  if (configured) return configured;

  if (env.NODE_ENV === "production") {
    throw new Error("SEED_ADMIN_PASSWORD must be set to seed the admin account on an empty production database");
  }

  const generated = crypto.randomBytes(12).toString("base64url");
  log(`SEED_ADMIN_PASSWORD not set; seed admin password is: ${generated}`);
  return generated;
}
