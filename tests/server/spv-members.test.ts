import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

/**
 * canManageSpv requires admin OR org organizer.
 * Plain org members cannot mutate SPV investments.
 */
describe("SPV members", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const spvA = fixtures.spv({ id: 100, organizationId: 10 });

  function asOrganizerOf(orgId: number) {
    return fixtures.organization({
      id: orgId,
      organizers: [{ accountId: fixtures.organizerAccount.id }],
    });
  }

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/spvs/:id/members", () => {
    it("non-admin without SPV access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("admin lists all SPV members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([
        { id: 1, spvId: spvA.id, accountId: 2, entityId: null },
        { id: 2, spvId: spvA.id, accountId: null, entityId: 200 },
      ]);
      const res = await agent.get(`/api/spvs/${spvA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("POST /api/spvs/:id/members", () => {
    it("plain member of org cannot add (canManageSpv requires organizer/admin)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getOrganization.mockResolvedValue(asOrganizerOf(spvA.organizationId));
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: 2, initialValue: 1000 });
      expect(res.status).toBe(403);
    });

    it("returns 400 when both accountId and entityId provided", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: 2, entityId: 200 });
      expect(res.status).toBe(400);
    });

    it("returns 400 when neither accountId nor entityId provided", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ initialValue: 100 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on negative initialValue", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: 2, initialValue: -1 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on invalid purchaseDate", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: 2, purchaseDate: "not-a-date" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when SPV missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(null);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: 2 });
      expect(res.status).toBe(404);
    });

    it("rejects accountId when account is not an APPROVED member of the SPV's org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
      );
      mockStorage.getMember.mockResolvedValue(
        fixtures.member({ status: "pending" }),
      );
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: fixtures.memberAccount.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/approved member/i);
    });

    it("admin successfully adds an account investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
      );
      mockStorage.getMember.mockResolvedValue(
        fixtures.member({ status: "approved" }),
      );
      mockStorage.addSpvMember.mockResolvedValue({
        id: 1,
        spvId: spvA.id,
        accountId: fixtures.memberAccount.id,
        entityId: null,
      });
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, initialValue: 5000 });
      expect(res.status).toBe(201);
      expect(mockStorage.addSpvMember).toHaveBeenCalled();
    });

    it("admin can add an entity investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getEntity.mockResolvedValue(fixtures.entity());
      mockStorage.addSpvMember.mockResolvedValue({
        id: 2,
        spvId: spvA.id,
        accountId: null,
        entityId: 200,
      });
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ entityId: 200, initialValue: 2500 });
      expect(res.status).toBe(201);
    });

    it("returns 404 when entity does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvA);
      mockStorage.getEntity.mockResolvedValue(null);
      const res = await agent
        .post(`/api/spvs/${spvA.id}/members`)
        .send({ entityId: 9999 });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/spvs/:id/members/:memberId", () => {
    it("returns 404 when member not on the SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([]);
      const res = await agent
        .patch(`/api/spvs/${spvA.id}/members/9999`)
        .send({ currentValue: 100 });
      expect(res.status).toBe(404);
    });

    it("admin can update an account-investor's values", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([
        { id: 1, spvId: spvA.id, accountId: 2, entityId: null },
      ]);
      mockStorage.updateSpvMember.mockResolvedValue({
        id: 1,
        spvId: spvA.id,
        accountId: 2,
        entityId: null,
        currentValue: "200.00",
      });
      const res = await agent
        .patch(`/api/spvs/${spvA.id}/members/1`)
        .send({ currentValue: 200 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateSpvMember).toHaveBeenCalledWith(
        spvA.id,
        { accountId: 2 },
        { currentValue: "200.00" },
      );
    });

    it("admin can update an entity-investor's values", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([
        { id: 2, spvId: spvA.id, accountId: null, entityId: 200 },
      ]);
      mockStorage.updateSpvMember.mockResolvedValue({
        id: 2,
        spvId: spvA.id,
        accountId: null,
        entityId: 200,
      });
      const res = await agent
        .patch(`/api/spvs/${spvA.id}/members/2`)
        .send({ distributions: 50 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateSpvMember).toHaveBeenCalledWith(
        spvA.id,
        { entityId: 200 },
        { distributions: "50.00" },
      );
    });
  });

  describe("DELETE /api/spvs/:id/members/:memberId", () => {
    it("returns 404 when member not on the SPV", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([]);
      const res = await agent.delete(`/api/spvs/${spvA.id}/members/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can remove an account-investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvMembers.mockResolvedValue([
        { id: 1, spvId: spvA.id, accountId: 2, entityId: null },
      ]);
      mockStorage.removeSpvMember.mockResolvedValue(true);
      const res = await agent.delete(`/api/spvs/${spvA.id}/members/1`);
      expect(res.status).toBe(200);
      expect(mockStorage.removeSpvMember).toHaveBeenCalledWith(spvA.id, { accountId: 2 });
    });
  });
});
