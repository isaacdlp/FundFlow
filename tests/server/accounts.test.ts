import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("/api/accounts", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("POST /api/accounts (public)", () => {
    it("creates an account with valid data", async () => {
      mockStorage.createAccount.mockResolvedValue({
        ...fixtures.memberAccount,
        passwordHash: "hashed-secret",
      });

      const res = await request(app)
        .post("/api/accounts")
        .send({
          email: "new@test.local",
          password: "secret123",
          firstName: "New",
          lastName: "User",
        });

      expect(res.status).toBe(201);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("returns 400 on invalid body (zod)", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .send({ email: "no-password@test.local" });
      expect(res.status).toBe(400);
    });

    it("returns 409 when email already exists", async () => {
      mockStorage.createAccount.mockRejectedValue(new Error("duplicate key value"));
      const res = await request(app)
        .post("/api/accounts")
        .send({
          email: "dup@test.local",
          password: "secret123",
          firstName: "Dup",
          lastName: "User",
        });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/accounts", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).get("/api/accounts");
      expect(res.status).toBe(401);
    });

    it("admin sees all accounts and supports search", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccounts.mockResolvedValue([
        fixtures.adminAccount,
        fixtures.memberAccount,
      ]);

      const res = await agent.get("/api/accounts?search=foo");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getAccounts).toHaveBeenCalledWith("foo");
      expect(res.body[0].passwordHash).toBeUndefined();
    });

    it("non-admin sees only their own account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get("/api/accounts");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(fixtures.memberAccount.id);
      expect(mockStorage.getAccounts).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/accounts/:id", () => {
    it("returns 400 on invalid id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/accounts/abc");
      expect(res.status).toBe(400);
    });

    it("non-admin can fetch own record", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAccount.mockResolvedValue(fixtures.memberAccount);
      const res = await agent.get(`/api/accounts/${fixtures.memberAccount.id}`);
      expect(res.status).toBe(200);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("non-admin gets 403 fetching another account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get(`/api/accounts/${fixtures.adminAccount.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can fetch any account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.memberAccount.id ? fixtures.memberAccount : fixtures.adminAccount,
      );
      const res = await agent.get(`/api/accounts/${fixtures.memberAccount.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixtures.memberAccount.id);
    });

    it("returns 404 when account does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : null,
      );
      const res = await agent.get("/api/accounts/9999");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/accounts/:id", () => {
    it("non-admin can update own personal info", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.updateAccount.mockResolvedValue({
        ...fixtures.memberAccount,
        firstName: "Updated",
      });
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ firstName: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe("Updated");
    });

    it("non-admin gets 403 updating someone else", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent
        .patch(`/api/accounts/${fixtures.adminAccount.id}`)
        .send({ firstName: "Nope" });
      expect(res.status).toBe(403);
    });

    it("non-admin gets 403 trying to change roles", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ roles: ["admin"] });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/admins/i);
    });

    it("admin can change roles", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue({
        ...fixtures.memberAccount,
        roles: [{ id: 2, name: "gp", description: "" }],
      });
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ roles: ["gp"] });
      expect(res.status).toBe(200);
    });

    it("returns 409 on duplicate email", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockRejectedValue(new Error("duplicate key"));
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ email: "taken@test.local" });
      expect(res.status).toBe(409);
    });

    it("returns 400 on invalid zod body (e.g. wrong birthdate type)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ birthdate: 12345 });
      expect(res.status).toBe(400);
    });

    it("returns 404 when target does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue(undefined);
      const res = await agent
        .patch(`/api/accounts/9999`)
        .send({ firstName: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/accounts/:id", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.delete(`/api/accounts/${fixtures.memberAccount.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete an account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteAccount.mockResolvedValue(true);
      const res = await agent.delete(`/api/accounts/${fixtures.memberAccount.id}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when account does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteAccount.mockResolvedValue(false);
      const res = await agent.delete(`/api/accounts/9999`);
      expect(res.status).toBe(404);
    });
  });
});
