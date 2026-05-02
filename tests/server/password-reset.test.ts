import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
const sendPasswordResetEmail = vi.fn();

vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail }));

const { createTestApp } = await import("./setup/test-app");

describe("Password reset & change-password", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    sendPasswordResetEmail.mockReset();
    app = await createTestApp();
  });

  describe("POST /api/auth/forgot-password", () => {
    it("returns 400 when email missing", async () => {
      const res = await request(app).post("/api/auth/forgot-password").send({});
      expect(res.status).toBe(400);
    });

    it("returns 200 + does not send when account doesn't exist (no enumeration)", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(null);
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "missing@test.local" });
      expect(res.status).toBe(200);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("returns 200 and sends email when account exists", async () => {
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.memberAccount);
      mockStorage.createPasswordResetToken.mockResolvedValue("tok123");
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: fixtures.memberAccount.email });
      expect(res.status).toBe(200);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        fixtures.memberAccount.email,
        fixtures.memberAccount.firstName,
        "tok123",
      );
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("returns 400 when token or password missing", async () => {
      const r1 = await request(app).post("/api/auth/reset-password").send({});
      const r2 = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "x" });
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
    });

    it("returns 400 when password too short", async () => {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "x", password: "abc" });
      expect(res.status).toBe(400);
    });

    it("returns 400 on unknown / used / expired token", async () => {
      mockStorage.getPasswordResetToken.mockResolvedValueOnce(null);
      const r1 = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "missing", password: "secret123" });
      expect(r1.status).toBe(400);

      mockStorage.getPasswordResetToken.mockResolvedValueOnce({
        id: 1,
        accountId: 2,
        token: "used",
        used: true,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
      const r2 = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "used", password: "secret123" });
      expect(r2.status).toBe(400);

      mockStorage.getPasswordResetToken.mockResolvedValueOnce({
        id: 2,
        accountId: 2,
        token: "expired",
        used: false,
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
      });
      const r3 = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "expired", password: "secret123" });
      expect(r3.status).toBe(400);
    });

    it("succeeds with a valid token and updates password", async () => {
      mockStorage.getPasswordResetToken.mockResolvedValue({
        id: 3,
        accountId: 2,
        token: "good",
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "good", password: "newpassword" });
      expect(res.status).toBe(200);
      expect(mockStorage.updatePassword).toHaveBeenCalledWith(2, "newpassword");
      expect(mockStorage.usePasswordResetToken).toHaveBeenCalledWith("good");
    });
  });

  describe("POST /api/auth/change-password", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .send({ currentPassword: "a", newPassword: "abcdef" });
      expect(res.status).toBe(401);
    });

    it("returns 400 when fields missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/auth/change-password").send({});
      expect(res.status).toBe(400);
    });

    it("returns 400 when new password too short", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "old", newPassword: "abc" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when current password incorrect", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      // loginAs already consumed one verifyPassword call. Reset the default
      // so the change-password call sees an incorrect current password.
      mockStorage.verifyPassword.mockResolvedValue(false);
      const res = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "wrong", newPassword: "secret123" });
      expect(res.status).toBe(400);
    });

    it("succeeds when current password is correct", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.verifyPassword.mockResolvedValue(true);
      const res = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "old", newPassword: "secret123" });
      expect(res.status).toBe(200);
      expect(mockStorage.updatePassword).toHaveBeenCalledWith(
        fixtures.memberAccount.id,
        "secret123",
      );
    });
  });
});
