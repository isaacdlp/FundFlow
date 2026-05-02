import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Invites", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
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

    it("returns 400 when neither accountId nor new account fields supplied", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      const res = await request(app).post("/api/invites/t/accept").send({});
      expect(res.status).toBe(400);
    });

    it("accepts invite for an existing account", async () => {
      mockStorage.getInviteByToken.mockResolvedValue(fixtures.invite());
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending", inviteId: 50 }),
      );
      const res = await request(app)
        .post("/api/invites/test-invite-token/accept")
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(200);
      expect(mockStorage.useInvite).toHaveBeenCalledWith(
        "test-invite-token",
        fixtures.memberAccount.id,
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
  });

  describe("GET /api/organizations/:id/invites (auth)", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(403);
    });

    it("organizer can list invites", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
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
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createInvite.mockResolvedValue(fixtures.invite());
      const res = await agent.post(`/api/organizations/${orgA.id}/invites`);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
    });
  });
});
