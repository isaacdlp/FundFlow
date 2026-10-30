import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendRegistrationEmail: vi.fn().mockResolvedValue(true),
}));

const { createTestApp } = await import("./setup/test-app");
const { sendRegistrationEmail } = await import("../../server/email");

describe("Invites", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    vi.mocked(sendRegistrationEmail).mockClear().mockResolvedValue(true);
    app = await createTestApp();
  });

  describe("GET /api/invites/:token (public)", () => {
    it("returns 404 when token unknown", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(null);
      const res = await request(app).get("/api/invites/missing");
      expect(res.status).toBe(404);
    });

    it("returns 410 when invite already used", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite({ used: true }));
      const res = await request(app).get("/api/invites/used");
      expect(res.status).toBe(410);
    });

    it("returns 404 when org missing", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await request(app).get("/api/invites/token");
      expect(res.status).toBe(404);
    });

    it("returns invite + sanitized org info", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getOrganization.mockResolvedValue({
        ...orgA,
        organizers: [{ accountId: 1 }],
      });
      const res = await request(app).get("/api/invites/test-invite-token");
      expect(res.status).toBe(200);
      expect(res.body.invite.token).toBe("test-invite-token");
      expect(res.body.organization.organizers).toBeUndefined();
    });
  });

  describe("POST /api/invites/:token/accept (public)", () => {
    it("returns 404 when token unknown", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(null);
      const res = await request(app).post("/api/invites/missing/accept").send({});
      expect(res.status).toBe(404);
    });

    it("returns 410 when invite already used", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite({ used: true }));
      const res = await request(app)
        .post("/api/invites/used/accept")
        .send({ accountId: 2 });
      expect(res.status).toBe(410);
    });

    it("returns 400 when anonymous and no new account fields supplied", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      const res = await request(app).post("/api/invites/t/accept").send({});
      expect(res.status).toBe(400);
    });

    it("ignores a client-supplied accountId from an anonymous caller", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(400);
      expect(mockStorage.useInvite).not.toHaveBeenCalled();
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("accepts invite for the logged-in account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending", inviteId: 50 }),
      );
      const res = await agent.post("/api/invites/test-invite-token/accept").send({});
      expect(res.status).toBe(200);
      expect(mockStorage.useInvite).toHaveBeenCalledWith(
        "test-invite-token",
        fixtures.memberAccount.id,
      );
    });

    it("uses the logged-in account even if another accountId is supplied", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending", inviteId: 50 }),
      );
      const res = await agent
        .post("/api/invites/test-invite-token/accept")
        .send({ accountId: fixtures.outsiderAccount.id });
      expect(res.status).toBe(200);
      expect(mockStorage.useInvite).toHaveBeenCalledWith(
        "test-invite-token",
        fixtures.memberAccount.id,
      );
      expect(mockStorage.useInvite).not.toHaveBeenCalledWith(
        "test-invite-token",
        fixtures.outsiderAccount.id,
      );
    });

    it("creates a new account on accept and 409s on duplicate email", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createAccount.mockRejectedValue(new Error("duplicate key"));
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({
          email: "exists@test.local",
          password: "secret123",
          firstName: "Ex",
          lastName: "Ists",
        });
      expect(res.status).toBe(409);
      // Critical: when account creation fails the invite must NOT be marked
      // used and no member request should be created — otherwise the invite
      // would be burned without producing a usable account.
      expect(mockStorage.useInvite).not.toHaveBeenCalled();
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("creates a new account and accepts the invite", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createAccount.mockResolvedValue({
        ...fixtures.memberAccount,
        id: 50,
      });
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending", inviteId: 50, accountId: 50 }),
      );
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({
          email: "new@test.local",
          password: "secret123",
          firstName: "New",
          lastName: "User",
        });
      expect(res.status).toBe(200);
      expect(mockStorage.useInvite).toHaveBeenCalled();
    });

    it("sends the new account a welcome email in their language, without the password", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, name: "Acme Capital" });
      mockStorage.createAccount.mockImplementation(async (data: any) => ({
        ...fixtures.memberAccount, id: 50, email: data.email, firstName: data.firstName, language: data.language,
      }));
      mockStorage.createMemberRequest.mockResolvedValue(fixtures.member({ accountId: 50 }));
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ email: "new@test.local", password: "secret123", firstName: "New", lastName: "User", language: "es" });
      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("sent");
      expect(mockStorage.createAccount).toHaveBeenCalledWith(expect.objectContaining({ language: "es" }));
      expect(sendRegistrationEmail).toHaveBeenCalledWith("new@test.local", "New", "Acme Capital", "es");
    });

    it("ignores an unknown language and still accepts when the welcome email fails", async () => {
      vi.mocked(sendRegistrationEmail).mockResolvedValue(false);
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createAccount.mockImplementation(async (data: any) => ({ ...fixtures.memberAccount, id: 50, language: data.language }));
      mockStorage.createMemberRequest.mockResolvedValue(fixtures.member({ accountId: 50 }));
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ email: "new@test.local", password: "secret123", firstName: "New", lastName: "User", language: "xx" });
      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("failed");
      expect(mockStorage.createAccount).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));
      expect(mockStorage.useInvite).toHaveBeenCalled();
    });

    it("409s before creating anything when the email already has an account", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getAccountByEmail.mockResolvedValue(fixtures.memberAccount);
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ email: fixtures.memberAccount.email, password: "secret123", firstName: "Ex", lastName: "Ists" });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already exists/);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
      expect(mockStorage.useInvite).not.toHaveBeenCalled();
    });

    it("409s (not 500) when the insert hits the unique email constraint, as Drizzle wraps it", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      const wrapped = new Error('Failed query: insert into "accounts" ... params: ...');
      (wrapped as any).cause = Object.assign(new Error("boom"), { code: "23505" });
      mockStorage.createAccount.mockRejectedValue(wrapped);
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ email: "race@test.local", password: "secret123", firstName: "Ra", lastName: "Ce" });
      expect(res.status).toBe(409);
      expect(res.body.message).not.toMatch(/Failed query/);
    });

    it("sends no welcome email when an existing account accepts", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createMemberRequest.mockResolvedValue(fixtures.member());
      const res = await agent.post("/api/invites/test-invite-token/accept").send({});
      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBeUndefined();
      expect(sendRegistrationEmail).not.toHaveBeenCalled();
    });

    it("leaves the invite usable when creating the membership fails", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createMemberRequest.mockRejectedValue(new Error("Failed to create membership"));
      const res = await agent.post("/api/invites/test-invite-token/accept").send({});
      expect(res.status).toBe(500);
      expect(mockStorage.useInvite).not.toHaveBeenCalled();
    });

    it("viewing an invite does not use it up", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.getOrganization.mockResolvedValue(orgA);
      await request(app).get("/api/invites/test-invite-token");
      const again = await request(app).get("/api/invites/test-invite-token");
      expect(again.status).toBe(200);
      expect(mockStorage.useInvite).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/organizations/:id/invites (auth)", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(403);
    });

    it("organizer can list invites", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getInvites.mockResolvedValue([fixtures.invite()]);
      const res = await agent.get(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/organizations/:id/invites (auth)", () => {
    it("returns 404 when org does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await agent.post(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(404);
    });

    it("organizer can create an invite", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createInvite.mockResolvedValue(fixtures.invite());
      const res = await agent.post(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
    });
  });

  describe("DELETE /api/organizations/:id/invites/:inviteId (auth)", () => {
    it("a plain member gets 403 and nothing is deleted", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent.delete(`/api/organizations/${orgA.id}/invites/50`);
      expect(res.status).toBe(403);
      expect(mockStorage.deleteInvite).not.toHaveBeenCalled();
    });

    it("organizer can delete an invite of their organization", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      const res = await agent.delete(`/api/organizations/${orgA.id}/invites/50`);
      expect(res.status).toBe(200);
      expect(mockStorage.deleteInvite).toHaveBeenCalledWith(orgA.id, 50);
    });

    it("returns 404 when the invite isn't in that organization", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteInvite.mockResolvedValue(false);
      const res = await agent.delete(`/api/organizations/${orgA.id}/invites/999`);
      expect(res.status).toBe(404);
    });

    it("returns 400 for a non-numeric invite id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.delete(`/api/organizations/${orgA.id}/invites/abc`);
      expect(res.status).toBe(400);
    });
  });
});
