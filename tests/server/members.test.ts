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

  describe("POST /api/organizations/:id/members/request (public)", () => {
    it("returns 400 when ID is invalid", async () => {
      const res = await request(app)
        .post("/api/organizations/abc/members/request")
        .send({ accountId: 1 });
      expect(res.status).toBe(400);
    });

    it("returns 400 when accountId missing", async () => {
      const res = await request(app)
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 when org missing", async () => {
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(404);
    });

    it("returns existing membership when one exists", async () => {
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const existing = fixtures.member({ status: "approved" });
      mockStorage.getMember.mockResolvedValue(existing);
      const res = await request(app)
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(200);
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });

    it("creates a new pending request", async () => {
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getMember.mockResolvedValue(null);
      mockStorage.createMemberRequest.mockResolvedValue(
        fixtures.member({ status: "pending" }),
      );
      const res = await request(app)
        .post(`/api/organizations/${orgA.id}/members/request`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("pending");
    });
  });

  describe("GET /api/organizations/:id/members", () => {
    it("requires authentication", async () => {
      const res = await request(app).get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(401);
    });

    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("organizer can view members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
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
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
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
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
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
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.delete(`/api/organizations/${orgA.id}/members/2`);
      expect(res.status).toBe(403);
    });

    it("organizer can remove a member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
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
