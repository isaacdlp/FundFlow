import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";

const mockStorage = makeMockStorage();

vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("auth routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when email or password missing", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
    });

    it("returns 401 when account not found", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(null);
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@test.local", password: "x" });
      expect(res.status).toBe(401);
    });

    it("returns 401 when password is invalid", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.memberAccount);
      mockStorage.verifyPassword.mockResolvedValue(false);
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: fixtures.memberAccount.email, password: "wrong" });
      expect(res.status).toBe(401);
    });

    it("returns the account (without passwordHash) on success", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.memberAccount);
      mockStorage.verifyPassword.mockResolvedValue(true);
      mockStorage.getAccount.mockResolvedValue(fixtures.memberAccount);

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: fixtures.memberAccount.email, password: "right" });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(fixtures.memberAccount.email);
      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 when no session", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns the authenticated account after login", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.adminAccount);
      mockStorage.verifyPassword.mockResolvedValue(true);
      mockStorage.getAccount.mockResolvedValue(fixtures.adminAccount);

      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: fixtures.adminAccount.email, password: "x" })
        .expect(200);

      const res = await agent.get("/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixtures.adminAccount.id);
      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the session", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.memberAccount);
      mockStorage.verifyPassword.mockResolvedValue(true);
      mockStorage.getAccount.mockResolvedValue(fixtures.memberAccount);

      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: fixtures.memberAccount.email, password: "x" })
        .expect(200);

      await agent.post("/api/auth/logout").expect(200);

      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(401);
    });
  });
});
