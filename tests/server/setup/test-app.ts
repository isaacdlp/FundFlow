import express, { type Express } from "express";
import session from "express-session";
import { createServer } from "http";
import { registerRoutes } from "../../../server/routes";

declare module "express-session" {
  interface SessionData {
    accountId: number;
  }
}

/**
 * Builds an isolated Express app for integration testing with supertest.
 *
 * Uses an in-memory session store (no Postgres dependency) and skips Vite/static
 * setup. Storage is expected to be mocked via `vi.mock("server/storage")` in
 * the calling test file.
 */
export async function createTestApp(): Promise<Express> {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );

  await registerRoutes(httpServer, app);
  return app;
}
