import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("/api/organizations", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10, name: "Org A", slug: "org-a" });
  const orgB = fixtures.organization({ id: 11, name: "Org B", slug: "org-b" });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/organizations/by-slug/:slug (public)", () => {
    it("returns the organization with organizers stripped", async () => {
      mockStorage.getOrganizationBySlug.mockResolvedValue({
        ...orgA,
        organizers: [{ accountId: 1 }],
      });
      const res = await request(app).get("/api/organizations/by-slug/org-a");
      expect(res.status).toBe(200);
      expect(res.body.organizers).toBeUndefined();
      expect(res.body.slug).toBe("org-a");
    });

    it("returns 404 when slug is unknown", async () => {
      mockStorage.getOrganizationBySlug.mockResolvedValue(null);
      const res = await request(app).get("/api/organizations/by-slug/missing");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/organizations", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/organizations");
      expect(res.status).toBe(401);
    });

    it("returns ALL organizations for admins", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganizations.mockResolvedValue([orgA, orgB]);

      const res = await agent.get("/api/organizations");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getOrganizationIdsForAccount).not.toHaveBeenCalled();
    });

    it("returns ONLY orgs the user is a member or organizer of (non-admin)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizations.mockResolvedValue([orgA, orgB]);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);

      const res = await agent.get("/api/organizations");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(orgA.id);
    });

    it("returns empty array when non-admin has no memberships", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizations.mockResolvedValue([orgA, orgB]);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);

      const res = await agent.get("/api/organizations");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("GET /api/organizations/:id", () => {
    it("returns 400 on invalid id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/organizations/abc");
      expect(res.status).toBe(400);
    });

    it("returns 403 when non-admin requests an org they don't belong to", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      const res = await agent.get(`/api/organizations/${orgB.id}`);
      expect(res.status).toBe(403);
    });

    it("returns the org when the user is a member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const res = await agent.get(`/api/organizations/${orgA.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orgA.id);
    });

    it("admin can fetch any org without membership check", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgB);
      const res = await agent.get(`/api/organizations/${orgB.id}`);
      expect(res.status).toBe(200);
      expect(mockStorage.getOrganizationIdsForAccount).not.toHaveBeenCalled();
    });

    it("returns 404 when org does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await agent.get(`/api/organizations/9999`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/organizations (admin only)", () => {
    it("returns 403 for non-admin", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/organizations").send({ name: "New" });
      expect(res.status).toBe(403);
    });

    it("admin can create with valid body", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createOrganization.mockResolvedValue(orgA);
      const res = await agent
        .post("/api/organizations")
        .send({ name: "Org A", description: "" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(orgA.id);
    });

    it("returns 400 when zod validation fails", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post("/api/organizations").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/organizations/:id", () => {
    it("returns 403 for non-admin who isn't an organizer/member", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent
        .patch(`/api/organizations/${orgA.id}`)
        .send({ name: "Hacked" });
      expect(res.status).toBe(403);
    });

    it("organizer/member can update", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.updateOrganization.mockResolvedValue({ ...orgA, name: "Updated" });
      const res = await agent
        .patch(`/api/organizations/${orgA.id}`)
        .send({ name: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    it("returns 400 on invalid zod body", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .patch(`/api/organizations/${orgA.id}`)
        .send({ name: 12345 });
      expect(res.status).toBe(400);
    });

    it("admin can update any org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateOrganization.mockResolvedValue({ ...orgB, name: "Updated B" });
      const res = await agent
        .patch(`/api/organizations/${orgB.id}`)
        .send({ name: "Updated B" });
      expect(res.status).toBe(200);
      expect(mockStorage.getOrganizationIdsForAccount).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/organizations/:id (admin only)", () => {
    it("returns 403 for non-admin", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.delete(`/api/organizations/${orgA.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteOrganization.mockResolvedValue(true);
      const res = await agent.delete(`/api/organizations/${orgA.id}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when org does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteOrganization.mockResolvedValue(false);
      const res = await agent.delete(`/api/organizations/9999`);
      expect(res.status).toBe(404);
    });
  });
});
