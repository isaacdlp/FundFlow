import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // `session` belongs to connect-pg-simple, not our schema: without this,
  // push offers to drop it or to "rename" it into a new table.
  tablesFilter: ["!session"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
