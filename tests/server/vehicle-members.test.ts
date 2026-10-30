import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

/**
 * canManageVehicle requires admin OR org organizer.
 * Plain org members cannot mutate Vehicle investments.
 */
describe("Vehicle members", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const vehicleA = fixtures.vehicle({ id: 100, organizationId: 10 });

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

  describe("GET /api/vehicles/:id/members", () => {
    it("non-admin without Vehicle access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("admin lists all Vehicle members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleMembers.mockResolvedValue([
        { id: 1, vehicleId: vehicleA.id, accountId: 2, entityId: null },
        { id: 2, vehicleId: vehicleA.id, accountId: null, entityId: 200 },
      ]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("POST /api/vehicles/:id/members", () => {
    it("plain member of org cannot add (canManageVehicle requires organizer/admin)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue(asOrganizerOf(vehicleA.organizationId));
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: 2, committed: 1000 });
      expect(res.status).toBe(403);
    });

    it("returns 400 when both accountId and entityId provided", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: 2, entityId: 200 });
      expect(res.status).toBe(400);
    });

    it("returns 400 when neither accountId nor entityId provided", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ committed: 100 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on negative committed", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: 2, committed: -1 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on invalid date", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: 2, date: "not-a-date" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when Vehicle missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(null);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: 2, date: "2025-01-15" });
      expect(res.status).toBe(404);
    });

    it("rejects accountId when account is not an APPROVED member of the Vehicle's org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
      );
      mockStorage.getMember.mockResolvedValue(
        fixtures.member({ status: "pending" }),
      );
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, date: "2025-01-15" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/approved member/i);
    });

    it("admin successfully adds an account investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
      );
      mockStorage.getMember.mockResolvedValue(
        fixtures.member({ status: "approved" }),
      );
      mockStorage.addVehicleMember.mockResolvedValue({
        id: 1,
        vehicleId: vehicleA.id,
        accountId: fixtures.memberAccount.id,
        entityId: null,
      });
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 5000, date: "2025-01-15" });
      expect(res.status).toBe(201);
      expect(mockStorage.addVehicleMember).toHaveBeenCalled();
    });

    it("ignores a code in the body: it's generated", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
      );
      mockStorage.getMember.mockResolvedValue(fixtures.member({ status: "approved" }));
      mockStorage.addVehicleMember.mockResolvedValue({ id: 1 });
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 5000, date: "2025-01-15", code: "AJNN-RLH4" });
      expect(res.status).toBe(201);
      expect(mockStorage.addVehicleMember.mock.calls[0][2]).not.toHaveProperty("code");
    });

    it("admin can add an entity investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getEntity.mockResolvedValue(fixtures.entity());
      mockStorage.addVehicleMember.mockResolvedValue({
        id: 2,
        vehicleId: vehicleA.id,
        accountId: null,
        entityId: 200,
      });
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ entityId: 200, committed: 2500, date: "2025-01-15" });
      expect(res.status).toBe(201);
    });

    it("returns 404 when entity does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getEntity.mockResolvedValue(null);
      const res = await agent
        .post(`/api/vehicles/${vehicleA.id}/members`)
        .send({ entityId: 9999, date: "2025-01-15" });
      expect(res.status).toBe(404);
    });
    describe("default fees", () => {
      async function addAs(body: Record<string, unknown>) {
        const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
        mockStorage.getVehicle.mockResolvedValue(vehicleA);
        mockStorage.getAccount.mockImplementation(async (id: number) =>
          id === fixtures.adminAccount.id ? fixtures.adminAccount : fixtures.memberAccount,
        );
        mockStorage.addVehicleMember.mockResolvedValue({ id: 1 });
        return agent.post(`/api/vehicles/${vehicleA.id}/members`).send({ date: "2025-01-15", ...body });
      }
      const values = () => mockStorage.addVehicleMember.mock.calls[0][2];

      it("applies the member's defaults to fees the investment doesn't state", async () => {
        mockStorage.getMember.mockResolvedValue(fixtures.member({ managementFeePercent: "5.00", successFeePercent: "20.00" }));
        expect((await addAs({ accountId: 2, committed: 100000 })).status).toBe(201);
        expect(values()).toMatchObject({ committed: "100000.00", managementFee: "5000.00", carry: "20.00" });
      });

      it("keeps fees the investment states, even zero", async () => {
        mockStorage.getMember.mockResolvedValue(fixtures.member({ managementFeePercent: "5.00", successFeePercent: "20.00" }));
        await addAs({ accountId: 2, committed: 100000, managementFee: 0, carry: 15 });
        expect(values()).toMatchObject({ managementFee: "0.00", carry: "15.00" });
      });

      it("leaves fees alone when the member has no defaults", async () => {
        mockStorage.getMember.mockResolvedValue(fixtures.member({ managementFeePercent: null, successFeePercent: null }));
        await addAs({ accountId: 2, committed: 100000 });
        expect(values().managementFee).toBeUndefined();
        expect(values().carry).toBeUndefined();
      });

      it("gives an entity the lowest of its managers' defaults in the organization", async () => {
        mockStorage.getEntity.mockResolvedValue(fixtures.entity({
          managers: [{ id: 1, accountId: 2, account: {} }, { id: 2, accountId: 3, account: {} }, { id: 3, accountId: 4, account: {} }],
        }));
        mockStorage.getMember.mockImplementation(async (_org: number, accountId: number) =>
          accountId === 2 ? fixtures.member({ accountId: 2, managementFeePercent: "5.00", successFeePercent: "20.00" })
          : accountId === 3 ? fixtures.member({ accountId: 3, managementFeePercent: "5.00", successFeePercent: "10.00" })
          : undefined); // account 4 isn't a member
        await addAs({ entityId: 200, committed: 2000 });
        expect(values()).toMatchObject({ managementFee: "100.00", carry: "10.00" });
      });
    });
  });

  describe("PATCH /api/vehicles/:id/members/:memberId", () => {
    it("returns 404 when member not on the Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleMemberById.mockResolvedValue(undefined);
      const res = await agent
        .patch(`/api/vehicles/${vehicleA.id}/members/9999`)
        .send({ totalCalled: 100 });
      expect(res.status).toBe(404);
    });

    it("admin can update an account-investor's values", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleMemberById.mockResolvedValue({
        id: 1,
        vehicleId: vehicleA.id,
        accountId: 2,
        entityId: null,
        totalCalled: "200.00",
      });
      const res = await agent
        .patch(`/api/vehicles/${vehicleA.id}/members/1`)
        .send({ totalCalled: 200 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleMemberById).toHaveBeenCalledWith(
        vehicleA.id,
        1,
        { totalCalled: "200.00" },
      );
    });

    it("ignores a code in the body: it's read-only", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleMemberById.mockResolvedValue({ id: 1, vehicleId: vehicleA.id, accountId: 2, entityId: null });
      const res = await agent
        .patch(`/api/vehicles/${vehicleA.id}/members/1`)
        .send({ totalCalled: 200, code: "AJNN-RLH4" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleMemberById).toHaveBeenCalledWith(vehicleA.id, 1, { totalCalled: "200.00" });
    });

    it("admin can update an entity-investor's values", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleMemberById.mockResolvedValue({
        id: 2,
        vehicleId: vehicleA.id,
        accountId: null,
        entityId: 200,
      });
      const res = await agent
        .patch(`/api/vehicles/${vehicleA.id}/members/2`)
        .send({ distributed: 50 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleMemberById).toHaveBeenCalledWith(
        vehicleA.id,
        2,
        { distributed: "50.00" },
      );
    });
  });

  describe("DELETE /api/vehicles/:id/members/:memberId", () => {
    it("returns 404 when member not on the Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeVehicleMemberById.mockResolvedValue(false);
      const res = await agent.delete(`/api/vehicles/${vehicleA.id}/members/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can remove an account-investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeVehicleMemberById.mockResolvedValue(true);
      const res = await agent.delete(`/api/vehicles/${vehicleA.id}/members/1`);
      expect(res.status).toBe(200);
      expect(mockStorage.removeVehicleMemberById).toHaveBeenCalledWith(vehicleA.id, 1);
    });
  });
});
