import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  sendAccountSetupEmail: vi.fn().mockResolvedValue(true),
}));

const { createTestApp } = await import("./setup/test-app");
const { sendWelcomeEmail, sendAccountSetupEmail } = await import("../../server/email");
const { ACCOUNT_SETUP_TTL_MS } = await import("../../shared/schema");

describe("/api/accounts", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("POST /api/accounts (admin-only)", () => {
    const validBody = {
      email: "new@test.local",
      password: "secret123",
      firstName: "New",
      lastName: "User",
    };

    it("returns 401 when unauthenticated (no self-signup)", async () => {
      const res = await request(app).post("/api/accounts").send(validBody);
      expect(res.status).toBe(401);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("rejects an anonymous caller trying to self-assign admin", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .send({ ...validBody, roles: ["admin"] });
      expect(res.status).toBe(401);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("returns 403 for a non-admin", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/accounts").send({ ...validBody, roles: ["admin"] });
      expect(res.status).toBe(403);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("admin creates an account with valid data", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue({
        ...fixtures.memberAccount,
        passwordHash: "hashed-secret",
      });

      const res = await agent.post("/api/accounts").send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("sends a welcome email with credentials by default", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue({ ...fixtures.memberAccount, language: "es" });
      vi.mocked(sendWelcomeEmail).mockClear();

      const res = await agent.post("/api/accounts").send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.welcomeEmail).toBe("sent");
      expect(sendWelcomeEmail).toHaveBeenCalledWith(
        fixtures.memberAccount.email,
        fixtures.memberAccount.firstName,
        validBody.password,
        "es",
      );
    });

    it("does not send a welcome email when welcome_email is false", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendWelcomeEmail).mockClear();

      const res = await agent.post("/api/accounts").send({ ...validBody, welcome_email: false });

      expect(res.status).toBe(201);
      expect(res.body.welcomeEmail).toBe("skipped");
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it("without a password, sends an account-setup link (7-day token) instead of credentials", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue({ ...fixtures.memberAccount, language: "fr" });
      mockStorage.createPasswordResetToken.mockResolvedValue("setup-token");
      vi.mocked(sendWelcomeEmail).mockClear();
      vi.mocked(sendAccountSetupEmail).mockClear();

      const { password: _omit, ...noPassword } = validBody;
      const res = await agent.post("/api/accounts").send(noPassword);

      expect(res.status).toBe(201);
      expect(mockStorage.createAccount).toHaveBeenCalledWith(
        expect.not.objectContaining({ password: expect.anything() }),
      );
      expect(mockStorage.createPasswordResetToken).toHaveBeenCalledWith(
        fixtures.memberAccount.id,
        ACCOUNT_SETUP_TTL_MS,
      );
      expect(sendAccountSetupEmail).toHaveBeenCalledWith(
        fixtures.memberAccount.email,
        fixtures.memberAccount.firstName,
        "setup-token",
        "fr",
      );
      expect(res.body.welcomeEmail).toBe("sent");
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it("with a password, sends credentials and no setup link", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendAccountSetupEmail).mockClear();

      const res = await agent.post("/api/accounts").send(validBody);

      expect(res.status).toBe(201);
      expect(sendAccountSetupEmail).not.toHaveBeenCalled();
      expect(mockStorage.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it("reports welcomeEmail 'failed' (still 201) when the credentials email fails", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendWelcomeEmail).mockResolvedValueOnce(false);

      const res = await agent.post("/api/accounts").send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.welcomeEmail).toBe("failed");
      expect(res.body.id).toBe(fixtures.memberAccount.id);
    });

    it("reports welcomeEmail 'failed' (still 201) when the setup email fails", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendAccountSetupEmail).mockResolvedValueOnce(false);
      const { password: _omit, ...noPassword } = validBody;

      const res = await agent.post("/api/accounts").send(noPassword);

      expect(res.status).toBe(201);
      expect(res.body.welcomeEmail).toBe("failed");
    });

    it("returns 400 when there is no password and welcome_email is false", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const { password: _omit, ...noPassword } = validBody;

      const res = await agent.post("/api/accounts").send({ ...noPassword, welcome_email: false });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password/i);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("returns 400 on an empty-string password", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post("/api/accounts").send({ ...validBody, password: "" });
      expect(res.status).toBe(400);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid body (zod)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post("/api/accounts")
        .send({ email: "no-names@test.local" });
      expect(res.status).toBe(400);
    });

    it("returns 409 when email already exists", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createAccount.mockRejectedValue(new Error("duplicate key value"));
      const res = await agent.post("/api/accounts").send(validBody);
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

    it("non-admin trying to change roles has them silently stripped", async () => {
      // Documented behaviour: `roles` is dropped (not rejected) for non-admins,
      // and the rest of the update still applies.
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);
      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ roles: ["admin"], firstName: "Still Applied" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateAccount).toHaveBeenCalledWith(
        fixtures.memberAccount.id,
        expect.objectContaining({ firstName: "Still Applied" }),
      );
      const [, data] = mockStorage.updateAccount.mock.calls[0];
      expect(data).not.toHaveProperty("roles");
    });

    it("admin setting a password reports welcomeEmail 'sent'", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendWelcomeEmail).mockClear();

      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ password: "newpass123", welcome_email: true });

      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("sent");
      expect(mockStorage.updatePassword).toHaveBeenCalledWith(fixtures.memberAccount.id, "newpass123");
      expect(sendWelcomeEmail).toHaveBeenCalled();
    });

    it("admin setting a password reports welcomeEmail 'failed' when the email fails", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendWelcomeEmail).mockResolvedValueOnce(false);

      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ password: "newpass123", welcome_email: true });

      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("failed");
      expect(mockStorage.updatePassword).toHaveBeenCalled();
    });

    it("admin setting a password without welcome_email reports 'skipped'", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);
      vi.mocked(sendWelcomeEmail).mockClear();

      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ password: "newpass123" });

      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("skipped");
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it("profile edits without a password omit welcomeEmail", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);

      const res = await agent
        .patch(`/api/accounts/${fixtures.memberAccount.id}`)
        .send({ firstName: "Renamed" });

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("welcomeEmail");
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
