/**
 * Runs automatically before `npm run db:push` (the `predb:push` script), so
 * renamed tables/columns keep their data instead of drizzle-kit offering to
 * drop and recreate them. Logic in server/db-renames.ts.
 */
import pg from "pg";
import { applyDbRenames } from "../server/db-renames";

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env"); } catch { /* no .env: rely on the environment */ }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await applyDbRenames(client);
} finally {
  await client.end();
}
