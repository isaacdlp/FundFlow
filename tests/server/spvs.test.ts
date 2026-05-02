import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("/api/spvs", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });
  const spvA = fixtures.spv({ id: 100, organizationId: 10 });
  const spvB = fixtures.spv({ id: 101, organizationId: 11 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/spvs", () => {
    it("admin sees every SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAllSpvs.mockResolvedValue([spvA, spvB]);
      const res = await agent.get("/api/spvs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getSpvIdsForAccount).not.toHaveBeenCalled();
    });

    it("non-admin sees only SPVs they're entitled to", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAllSpvs.mockResolvedValue([spvA, spvB]);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([spvA.id]);
      const res = await agent.get("/api/spvs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(spvA.id);
    });
  });

  describe("GET /api/organizations/:id/spvs", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/spvs`);
      expect(res.status).toBe(403);
    });

    it("member of org can list its SPVs", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getSpvs.mockResolvedValue([spvA]);
      const res = await agent.get(`/api/organizations/${orgA.id}/spvs`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("GET /api/spvs/:id", () => {
    it("returns 400 on invalid id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/spvs/abc");
      expect(res.status).toBe(400);
    });

    it("non-admin not on SPV gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/spvs/${spvA.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 when SPV missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(null);
      const res = await agent.get(`/api/spvs/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can fetch any SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      const res = await agent.get(`/api/spvs/${spvA.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(spvA.id);
    });
  });

  describe("POST /api/organizations/:id/spvs", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/spvs`)
        .send({ legalName: "X", displayName: "X" });
      expect(res.status).toBe(403);
    });

    it("returns 404 when org missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/spvs`)
        .send({ legalName: "X", displayName: "X" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when zod validation fails (missing legal/display name)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/spvs`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("organizer can create SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createSpv.mockResolvedValue(spvA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/spvs`)
        .send({ legalName: "Test SPV LLC", displayName: "Test SPV" });
      expect(res.status).toBe(201);
      expect(mockStorage.createSpv).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgA.id }),
      );
    });
  });

  describe("PATCH /api/spvs/:id", () => {
    it("non-admin not on SPV gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([]);
      const res = await agent.patch(`/api/spvs/${spvA.id}`).send({ displayName: "X" });
      expect(res.status).toBe(403);
    });

    it("admin can update any SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateSpv.mockResolvedValue({ ...spvA, displayName: "Renamed" });
      const res = await agent.patch(`/api/spvs/${spvA.id}`).send({ displayName: "Renamed" });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("Renamed");
    });

    it("returns 404 when SPV missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateSpv.mockResolvedValue(undefined);
      const res = await agent.patch(`/api/spvs/9999`).send({ displayName: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/spvs/:id (admin only)", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      const res = await agent.delete(`/api/spvs/${spvA.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteSpv.mockResolvedValue(true);
      const res = await agent.delete(`/api/spvs/${spvA.id}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when SPV missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteSpv.mockResolvedValue(false);
      const res = await agent.delete(`/api/spvs/9999`);
      expect(res.status).toBe(404);
    });
  });
});
