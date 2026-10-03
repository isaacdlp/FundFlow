import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Organization members", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("POST /api/organizations/:id/members/request (authenticated)", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app)
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(401);
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("returns 400 when ID is invalid", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/organizations/abc/members/request").send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 when org missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await agent.post(`/api/organizations/${orgA.id}/members/request`).send({});
      expect(res.status).toBe(404);
    });

    it("returns existing membership when one exists", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const existing = fixtures.member({ status: "approved" });
      mockStorage.getMember.mockResolvedValue(existing);
      const res = await agent.post(`/api/organizations/${orgA.id}/members/request`).send({});
      expect(res.status).toBe(200);
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("creates a pending request for the logged-in account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getMember.mockResolvedValue(null);
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending" }),
      );
      const res = await agent.post(`/api/organizations/${orgA.id}/members/request`).send({});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("pending");
      expect(mockStorage.createMemberRequest).toHaveBeenCalledWith(orgA.id, fixtures.memberAccount.id, undefined, "pending");
    });

    it("treats the caller's own accountId as a normal (pending) self-request", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createMemberRequest.mockResolvedValue(fixtures.member({ status: "pending" }));
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(201);
      expect(mockStorage.createMemberRequest).toHaveBeenCalledWith(orgA.id, fixtures.memberAccount.id, undefined, "pending");
    });

    it("non-organizer gets 403 adding another account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.outsiderAccount.id });
      expect(res.status).toBe(403);
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("returns 400 on a non-numeric accountId", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: "abc" });
      expect(res.status).toBe(400);
    });

    it("organizer adds another account as an APPROVED member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getMember.mockResolvedValue(null);
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "approved", accountId: fixtures.outsiderAccount.id }),
      );
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.outsiderAccount.id });
      expect(res.status).toBe(201);
      expect(mockStorage.createMemberRequest).toHaveBeenCalledWith(orgA.id, fixtures.outsiderAccount.id, undefined, "approved");
    });

    it("admin adds another account to any org as an APPROVED member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getMember.mockResolvedValue(null);
      mockStorage.createMemberRequest.mockResolvedValue(fixtures.member({ status: "approved" }));
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(201);
      expect(mockStorage.createMemberRequest).toHaveBeenCalledWith(orgA.id, fixtures.memberAccount.id, undefined, "approved");
      expect(mockStorage.getOrganizationIdsAsOrganizer).not.toHaveBeenCalled();
    });

    it("organizer adding someone with a pending request approves it", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getMember.mockResolvedValue(fixtures.member({ status: "pending", accountId: fixtures.outsiderAccount.id }));
      mockStorage.updateMemberStatus.mockResolvedValue(fixtures.member({ status: "approved", accountId: fixtures.outsiderAccount.id }));
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.outsiderAccount.id });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
      expect(mockStorage.updateMemberStatus).toHaveBeenCalledWith(orgA.id, fixtures.outsiderAccount.id, "approved");
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("returns 404 when the account to add does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : undefined,
      );
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: 9999 });
      expect(res.status).toBe(404);
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/organizations/:id/members", () => {
    it("requires authentication", async () => {
      const res = await request(app).get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(401);
    });

    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("organizer can view members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getMembers.mockResolvedValue([fixtures.member()]);
      const res = await agent.get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("admin can view members of any org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getMembers.mockResolvedValue([fixtures.member(), fixtures.member({ id: 71 })]);
      const res = await agent.get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("PATCH /api/organizations/:id/members/:accountId", () => {
    it("returns 400 on invalid status value", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .patch(`/api/organizations/${orgA.id}/members/2`)
        .send({ status: "weird" });
      expect(res.status).toBe(400);
    });

    it("organizer can approve a member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.updateMemberStatus.mockResolvedValue(
        fixtures.member({ status: "approved" }),
      );
      const res = await agent
        .patch(`/api/organizations/${orgA.id}/members/2`)
        .send({ status: "approved" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
    });

    it("organizer can reject a member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.updateMemberStatus.mockResolvedValue(
        fixtures.member({ status: "rejected" }),
      );
      const res = await agent
        .patch(`/api/organizations/${orgA.id}/members/2`)
        .send({ status: "rejected" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("rejected");
    });

    it("returns 404 when member missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateMemberStatus.mockResolvedValue(undefined);
      const res = await agent
        .patch(`/api/organizations/${orgA.id}/members/9999`)
        .send({ status: "approved" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/organizations/:id/members/:accountId", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent.delete(`/api/organizations/${orgA.id}/members/2`);
      expect(res.status).toBe(403);
    });

    it("organizer can remove a member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.removeMember.mockResolvedValue(true);
      const res = await agent.delete(`/api/organizations/${orgA.id}/members/2`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when member not found", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeMember.mockResolvedValue(false);
      const res = await agent.delete(`/api/organizations/${orgA.id}/members/9999`);
      expect(res.status).toBe(404);
    });
  });
});
