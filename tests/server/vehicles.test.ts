import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("/api/vehicles", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });
  const vehicleA = fixtures.vehicle({ id: 100, organizationId: 10 });
  const vehicleB = fixtures.vehicle({ id: 101, organizationId: 11 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/vehicles", () => {
    it("admin sees every Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAllVehicles.mockResolvedValue([vehicleA, vehicleB]);
      const res = await agent.get("/api/vehicles");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getVehicleIdsForAccount).not.toHaveBeenCalled();
    });

    it("non-admin sees only Vehicles they're entitled to", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAllVehicles.mockResolvedValue([vehicleA, vehicleB]);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleA.id]);
      const res = await agent.get("/api/vehicles");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(vehicleA.id);
    });

    it("entity manager sees Vehicles their managed entity is invested in", async () => {
      // storage.getVehicleIdsForAccount now includes managed-entity memberships;
      // this test verifies the route filters by whatever it returns.
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAllVehicles.mockResolvedValue([vehicleA, vehicleB]);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleB.id]);
      const res = await agent.get("/api/vehicles");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(vehicleB.id);
    });
  });

  describe("GET /api/organizations/:id/vehicles", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/organizations/${orgA.id}/vehicles`);
      expect(res.status).toBe(403);
    });

    it("member of org sees only Vehicles they invest in", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const vehicleA2 = fixtures.vehicle({ id: 102, organizationId: 10 });
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getVehicles.mockResolvedValue([vehicleA, vehicleA2]);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleA.id]);
      const res = await agent.get(`/api/organizations/${orgA.id}/vehicles`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(vehicleA.id);
    });

    it("entity manager sees Vehicles their managed entity is invested in", async () => {
      // getVehicleIdsForAccount (storage layer) includes managed entities' Vehicles —
      // this test verifies the route honours whatever that method returns.
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const vehicleA2 = fixtures.vehicle({ id: 102, organizationId: 10 });
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
      mockStorage.getVehicles.mockResolvedValue([vehicleA, vehicleA2]);
      // Storage returns vehicleA because the managed entity is a member there.
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleA.id]);
      const res = await agent.get(`/api/organizations/${orgA.id}/vehicles`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(vehicleA.id);
    });
  });

  describe("GET /api/vehicles/:id", () => {
    it("returns 400 on invalid id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/vehicles/abc");
      expect(res.status).toBe(400);
    });

    it("non-admin not on Vehicle gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 when Vehicle missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(null);
      const res = await agent.get(`/api/vehicles/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can fetch any Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(vehicleA.id);
    });
  });

  describe("POST /api/organizations/:id/vehicles", () => {
    it("non-admin not in org gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "X", displayName: "X" });
      expect(res.status).toBe(403);
    });

    it("returns 404 when org missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "X", displayName: "X" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when zod validation fails (missing legal/display name)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("organizer can create Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([orgA.id]);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createVehicle.mockResolvedValue(vehicleA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "Test Vehicle LLC", displayName: "Test Vehicle", dateEstablished: "2024-01-01" });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgA.id }),
      );
    });

    it("defaults currency to USD when none is given", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createVehicle.mockResolvedValue(vehicleA);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "Test Vehicle LLC", displayName: "Test Vehicle", dateEstablished: "2024-01-01" });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "USD" }),
      );
    });

    it("accepts an explicit active currency", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.createVehicle.mockResolvedValue({ ...vehicleA, currency: "EUR" });
      mockStorage.getActiveCurrencyCodes.mockResolvedValue(["USD", "EUR"]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "Test Vehicle LLC", displayName: "Test Vehicle", dateEstablished: "2024-01-01", currency: "eur" });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "EUR" }),
      );
    });

    it("rejects a currency that isn't active", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getActiveCurrencyCodes.mockResolvedValue(["USD", "EUR"]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/vehicles`)
        .send({ legalName: "Test Vehicle LLC", displayName: "Test Vehicle", dateEstablished: "2024-01-01", currency: "GBP" });
      expect(res.status).toBe(400);
      expect(mockStorage.createVehicle).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/vehicles/:id/members", () => {
    const me = fixtures.memberAccount;
    const otherMember = { id: 200, vehicleId: vehicleA.id, accountId: 999, entityId: null, investorType: "account", account: { id: 999, email: "x", firstName: "X", lastName: "Y" }, entity: null, currentValue: "0" };
    const myMember = { id: 201, vehicleId: vehicleA.id, accountId: me.id, entityId: null, investorType: "account", account: { id: me.id, email: me.email, firstName: me.firstName, lastName: me.lastName }, entity: null, currentValue: "0" };
    const myEntityMember = { id: 202, vehicleId: vehicleA.id, accountId: null, entityId: 50, investorType: "entity", account: null, entity: { id: 50, legalName: "MyCo" }, currentValue: "0" };

    it("admin sees all members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleMembers.mockResolvedValue([otherMember, myMember, myEntityMember]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it("non-investor non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicleMembers.mockResolvedValue([otherMember]);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [] });
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(403);
    });

    it("non-admin investor only sees their own tranches (own account + owned entities)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicleMembers.mockResolvedValue([otherMember, myMember, myEntityMember]);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [] });
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleA.id]);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([50]);
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const ids = res.body.map((m: any) => m.id).sort();
      expect(ids).toEqual([myMember.id, myEntityMember.id].sort());
    });

    it("organizer of the Vehicle's org sees all members", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getVehicleMembers.mockResolvedValue([otherMember, myMember]);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [{ accountId: fixtures.organizerAccount.id }] });
      const res = await agent.get(`/api/vehicles/${vehicleA.id}/members`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("PATCH /api/vehicles/:id", () => {
    it("non-admin not on Vehicle gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([]);
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "X" });
      expect(res.status).toBe(403);
    });

    it("an investor in the Vehicle can't edit it", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicleA.id]);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [] });
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "X" });
      expect(res.status).toBe(403);
      expect(mockStorage.updateVehicle).not.toHaveBeenCalled();
    });

    it("an organizer of the Vehicle's org can edit it", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [{ accountId: fixtures.organizerAccount.id }] });
      mockStorage.updateVehicle.mockResolvedValue({ ...vehicleA, displayName: "Renamed" });
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "Renamed" });
      expect(res.status).toBe(200);
    });

    it("admin can update any Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicle.mockResolvedValue({ ...vehicleA, displayName: "Renamed" });
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "Renamed" });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("Renamed");
    });

    it("returns 404 when Vehicle missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicle.mockResolvedValue(undefined);
      const res = await agent.patch(`/api/vehicles/9999`).send({ displayName: "X" });
      expect(res.status).toBe(404);
    });

    it("an organizer trying to change the code has it silently stripped", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleA);
      mockStorage.getOrganization.mockResolvedValue({ ...orgA, organizers: [{ accountId: fixtures.organizerAccount.id }] });
      mockStorage.updateVehicle.mockResolvedValue({ ...vehicleA, displayName: "Renamed" });
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "Renamed", code: "ZQP7" });
      expect(res.status).toBe(200);
      const [, data] = mockStorage.updateVehicle.mock.calls[0];
      expect(data).toMatchObject({ displayName: "Renamed" });
      expect(data).not.toHaveProperty("code");
    });

    it("admin can change the code, normalised to uppercase", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicle.mockResolvedValue(vehicleA);
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ code: "zqp7" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicle).toHaveBeenCalledWith(vehicleA.id, expect.objectContaining({ code: "ZQP7" }));
    });

    it.each(["ZQP", "ZQP77", "ZQ-7", ""])("rejects the malformed code %j", async (code) => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ code });
      expect(res.status).toBe(400);
      expect(mockStorage.updateVehicle).not.toHaveBeenCalled();
    });

    it("silently ignores an attempt to change currency — it's fixed at creation", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicle.mockResolvedValue({ ...vehicleA, displayName: "Renamed" });
      const res = await agent.patch(`/api/vehicles/${vehicleA.id}`).send({ displayName: "Renamed", currency: "EUR" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicle).toHaveBeenCalledWith(
        vehicleA.id,
        expect.not.objectContaining({ currency: expect.anything() }),
      );
    });
  });

  describe("DELETE /api/vehicles/:id (admin only)", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      const res = await agent.delete(`/api/vehicles/${vehicleA.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicle.mockResolvedValue(true);
      const res = await agent.delete(`/api/vehicles/${vehicleA.id}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when Vehicle missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicle.mockResolvedValue(false);
      const res = await agent.delete(`/api/vehicles/9999`);
      expect(res.status).toBe(404);
    });
  });
});
