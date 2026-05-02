import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";

const mockStorage = makeMockStorage();

vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

async function loginAs(app: any, account: any) {
  mockStorage.getAccountByEmail.mockResolvedValue(account);
  mockStorage.verifyPassword.mockResolvedValue(true);
  mockStorage.getAccount.mockResolvedValue(account);

  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email: account.email, password: "x" })
    .expect(200);
  return agent;
}

describe("organization permissions", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10, name: "Org A", slug: "org-a" });
  const orgB = fixtures.organization({ id: 11, name: "Org B", slug: "org-b" });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/organizations", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/organizations");
      expect(res.status).toBe(401);
    });

    it("returns ALL organizations for admins", async () => {
      const agent = await loginAs(app, fixtures.adminAccount);
      mockStorage.getOrganizations.mockResolvedValue([orgA, orgB]);

      const res = await agent.get("/api/organizations");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getOrganizationIdsForAccount).not.toHaveBeenCalled();
    });

    it("returns ONLY orgs the user is a member or organizer of (non-admin)", async () => {
      const agent = await loginAs(app, fixtures.memberAccount);
      mockStorage.getOrganizations.mockResolvedValue([orgA, orgB]);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);

      const res = await agent.get("/api/organizations");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(orgA.id);
    });
  });

  describe("GET /api/organizations/:id", () => {
    it("returns 403 when non-admin requests an org they don't belong to", async () => {
      const agent = await loginAs(app, fixtures.memberAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);

      const res = await agent.get(`/api/organizations/${orgB.id}`);
      expect(res.status).toBe(403);
    });

    it("returns the org when the user is a member", async () => {
      const agent = await loginAs(app, fixtures.memberAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);

      const res = await agent.get(`/api/organizations/${orgA.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orgA.id);
    });

    it("admin can fetch any org without membership check", async () => {
      const agent = await loginAs(app, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgB);

      const res = await agent.get(`/api/organizations/${orgB.id}`);
      expect(res.status).toBe(200);
      expect(mockStorage.getOrganizationIdsForAccount).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/organizations (admin only)", () => {
    it("returns 403 for non-admin", async () => {
      const agent = await loginAs(app, fixtures.memberAccount);
      const res = await agent
        .post("/api/organizations")
        .send({ name: "New", slug: "new" });
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/organizations/:id (admin only)", () => {
    it("returns 403 for non-admin", async () => {
      const agent = await loginAs(app, fixtures.memberAccount);
      const res = await agent.delete(`/api/organizations/${orgA.id}`);
      expect(res.status).toBe(403);
    });
  });
});
