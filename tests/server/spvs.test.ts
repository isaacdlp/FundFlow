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

    it("entity manager sees SPVs their managed entity is invested in", async () => {
      // storage.getSpvIdsForAccount now includes managed-entity memberships;
      // this test verifies the route filters by whatever it returns.
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAllSpvs.mockResolvedValue([spvA, spvB]);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([spvB.id]);
      const res = await agent.get("/api/spvs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(spvB.id);
    });
  });

  describe("GET /api/organizations/:id/spvs", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/spvs`);
      expect(res.status).toBe(403);
    });

    it("member of org sees only SPVs they invest in", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const spvA2 = fixtures.spv({ id: 102, organizationId: 10 });
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getSpvs.mockResolvedValue([spvA, spvA2]);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([spvA.id]);
      const res = await agent.get(`/api/organizations/${orgA.id}/spvs`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(spvA.id);
    });

    it("entity manager sees SPVs their managed entity is invested in", async () => {
      // getSpvIdsForAccount (storage layer) includes managed entities' SPVs —
      // this test verifies the route honours whatever that method returns.
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const spvA2 = fixtures.spv({ id: 102, organizationId: 10 });
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getSpvs.mockResolvedValue([spvA, spvA2]);
      // Storage returns spvA because the managed entity is a member there.
      mockStorage.getSpvIdsForAccount.mockResolvedValue([spvA.id]);
      const res = await agent.get(`/api/organizations/${orgA.id}/spvs`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(spvA.id);
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
        .send({ legalName: "Test SPV LLC", displayName: "Test SPV", dateEstablished: "2024-01-01" });
      expect(res.status).toBe(201);
      expect(mockStorage.createSpv).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgA.id }),
      );
    });
  });

  describe("GET /api/spvs/:id/members", () => {
    const me = fixtures.memberAccount;
    const otherMember = { id: 200, spvId: spvA.id, accountId: 999, entityId: null, investorType: "account", account: { id: 999, email: "x", firstName: "X", lastName: "Y" }, entity: null, currentValue: "0" };
    const myMember = { id: 201, spvId: spvA.id, accountId: me.id, entityId: null, investorType: "account", account: { id: me.id, email: me.email, firstName: me.firstName, lastName: me.lastName }, entity: null, currentValue: "0" };
    const myEntityMember = { id: 202, spvId: spvA.id, accountId: null, entityId: 50, investorType: "entity", account: null, entity: { id: 50, legalName: "MyCo" }, currentValue: "0" };

    it("admin sees all members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([otherMember, myMember, myEntityMember]);
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it("non-investor non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpvMembers.mockResolvedValue([otherMember]);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [] });
      mockStorage.getSpvIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("non-admin investor only sees their own tranches (own account + owned entities)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpvMembers.mockResolvedValue([otherMember, myMember, myEntityMember]);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [] });
      mockStorage.getSpvIdsForAccount.mockResolvedValue([spvA.id]);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([50]);
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const ids = res.body.map((m: any) => m.id).sort();
      expect(ids).toEqual([myMember.id, myEntityMember.id].sort());
    });

    it("organizer of the SPV's org sees all members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getSpvMembers.mockResolvedValue([otherMember, myMember]);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [{ accountId: fixtures.organizerAccount.id }] });
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
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
