import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Vehicle share classes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const vehicle = fixtures.vehicle({ id: 100, organizationId: 10 });
  const classA = { id: 1, vehicleId: 100, name: "Class A", notes: "", memberCount: 1, assetCount: 1 };
  const classB = { id: 2, vehicleId: 100, name: "Class B", notes: "", memberCount: 1, assetCount: 1 };

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  /** A plain investor (memberAccount) holding a position in Class A only. */
  function asClassAInvestor() {
    mockStorage.getVehicleIdsForAccount.mockResolvedValue([vehicle.id]);
    mockStorage.getVehicleMembers.mockResolvedValue([
      { id: 11, vehicleId: 100, classId: 1, accountId: fixtures.memberAccount.id, entityId: null },
      { id: 12, vehicleId: 100, classId: 2, accountId: 99, entityId: null },
    ]);
    mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
  }

  describe("GET /api/vehicles/:id/classes", () => {
    it("admin sees every class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await agent.get(`/api/vehicles/${vehicle.id}/classes`);
      expect(res.status).toBe(200);
      expect(res.body.map((c: any) => c.name)).toEqual(["Class A", "Class B"]);
    });

    it("an investor only sees the classes they hold positions in", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      asClassAInvestor();
      const res = await agent.get(`/api/vehicles/${vehicle.id}/classes`);
      expect(res.status).toBe(200);
      expect(res.body.map((c: any) => c.id)).toEqual([1]);
    });

    it("someone without access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await agent.get(`/api/vehicles/${vehicle.id}/classes`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/vehicles/:id/classes", () => {
    it("a plain org member can't create one", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getOrganization.mockResolvedValue(fixtures.organization({ organizers: [{ accountId: fixtures.organizerAccount.id }] }));
      const res = await agent.post(`/api/vehicles/${vehicle.id}/classes`).send({ name: "Class A" });
      expect(res.status).toBe(403);
    });

    it("an organizer creates one", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getOrganization.mockResolvedValue(fixtures.organization({ organizers: [{ accountId: fixtures.organizerAccount.id }] }));
      mockStorage.createVehicleClass.mockResolvedValue(classB);
      const res = await agent.post(`/api/vehicles/${vehicle.id}/classes`).send({ name: "  Class B ", notes: "Lead" });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicleClass).toHaveBeenCalledWith(vehicle.id, { name: "Class B", notes: "Lead" });
    });

    it("requires a name", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      const res = await agent.post(`/api/vehicles/${vehicle.id}/classes`).send({ name: " " });
      expect(res.status).toBe(400);
    });

    it("refuses a name another class of the Vehicle uses (case-insensitive)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getVehicleClasses.mockResolvedValue([classA]);
      const res = await agent.post(`/api/vehicles/${vehicle.id}/classes`).send({ name: "class a" });
      expect(res.status).toBe(409);
      expect(mockStorage.createVehicleClass).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post(`/api/vehicles/999/classes`).send({ name: "Class A" });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/vehicles/:id/classes/:classId", () => {
    it("renames a class, which may keep its own name", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      mockStorage.updateVehicleClass.mockResolvedValue({ ...classA, notes: "x" });
      const res = await agent.patch(`/api/vehicles/${vehicle.id}/classes/1`).send({ name: "Class A", notes: "x" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleClass).toHaveBeenCalledWith(vehicle.id, 1, { name: "Class A", notes: "x" });
    });

    it("refuses another class's name", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await agent.patch(`/api/vehicles/${vehicle.id}/classes/1`).send({ name: "Class B" });
      expect(res.status).toBe(409);
    });

    it("returns 404 for a class of another Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleClass.mockResolvedValue(undefined);
      const res = await agent.patch(`/api/vehicles/${vehicle.id}/classes/77`).send({ notes: "x" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/vehicles/:id/classes/:classId", () => {
    it("deletes a class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/classes/1`);
      expect(res.status).toBe(200);
      expect(mockStorage.deleteVehicleClass).toHaveBeenCalledWith(vehicle.id, 1);
    });

    it("refuses (409) while the class holds investments or assets", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicleClass.mockResolvedValue("in_use");
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/classes/1`);
      expect(res.status).toBe(409);
    });

    it("refuses (409) to delete a Vehicle's last class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicleClass.mockResolvedValue("last_class");
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/classes/1`);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/at least one share class/);
    });

    it("returns 404 for an unknown class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicleClass.mockResolvedValue("not_found");
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/classes/1`);
      expect(res.status).toBe(404);
    });
  });

  describe("investments", () => {
    beforeEach(() => {
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : { ...fixtures.memberAccount, id });
      mockStorage.getMember.mockResolvedValue(fixtures.member({ status: "approved" }));
      mockStorage.addVehicleMember.mockResolvedValue({ id: 5 });
    });

    const add = (agent: any, body: Record<string, unknown>) =>
      agent.post(`/api/vehicles/${vehicle.id}/members`).send({ accountId: 2, committed: 1000, date: "2026-01-01", ...body });

    it("go into the requested class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await add(agent, { classId: 2 });
      expect(res.status).toBe(201);
      expect(mockStorage.addVehicleMember.mock.calls[0][2]).toMatchObject({ classId: 2 });
    });

    it("need a class when the Vehicle has several", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await add(agent, {});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/classId is required/);
    });

    it("go into the only class when none is given", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA]);
      const res = await add(agent, {});
      expect(res.status).toBe(201);
      expect(mockStorage.addVehicleMember.mock.calls[0][2]).toMatchObject({ classId: 1 });
    });

    it("can't name a class of another Vehicle", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA]);
      const res = await add(agent, { classId: 77 });
      expect(res.status).toBe(400);
    });

    it("with AutoDeploy in a single-class Vehicle, speak of the Vehicle's default asset", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue({ ...vehicle, autoDeploy: true });
      mockStorage.getVehicleClasses.mockResolvedValue([classA]);
      const res = await add(agent, {});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/the Vehicle has no default asset/);
    });

    it("with AutoDeploy need a default asset in their own class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue({ ...vehicle, autoDeploy: true });
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      mockStorage.getVehicleAssets.mockResolvedValue([{ id: 9, classId: 1, isDefault: true }]);
      const refused = await add(agent, { classId: 2 });
      expect(refused.status).toBe(400);
      expect(refused.body.message).toMatch(/share class has no default asset/);
      expect((await add(agent, { classId: 1 })).status).toBe(201);
    });

    it("move to another class on PATCH", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      mockStorage.updateVehicleMemberById.mockResolvedValue({ id: 5, classId: 2 });
      const res = await agent.patch(`/api/vehicles/${vehicle.id}/members/5`).send({ classId: 2 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleMemberById).toHaveBeenCalledWith(vehicle.id, 5, { classId: 2 });
    });

    it("stay in their class when a PATCH omits classId", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleMemberById.mockResolvedValue({ id: 5 });
      await agent.patch(`/api/vehicles/${vehicle.id}/members/5`).send({ committed: 10 });
      expect(mockStorage.updateVehicleMemberById).toHaveBeenCalledWith(vehicle.id, 5, { committed: "10.00" });
    });
  });

  describe("assets", () => {
    it("are created in the requested class", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      mockStorage.createVehicleAsset.mockResolvedValue({ id: 9 });
      const res = await agent.post(`/api/vehicles/${vehicle.id}/assets`).send({ companyName: "Acme", classId: 2 });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicleAsset.mock.calls[0][1]).toMatchObject({ companyName: "Acme", classId: 2 });
    });

    it("need a class when the Vehicle has several", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicle);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      const res = await agent.post(`/api/vehicles/${vehicle.id}/assets`).send({ companyName: "Acme" });
      expect(res.status).toBe(400);
    });

    it("move to another class on PATCH", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleClasses.mockResolvedValue([classA, classB]);
      mockStorage.updateVehicleAsset.mockResolvedValue({ id: 9, classId: 1 });
      const res = await agent.patch(`/api/vehicles/${vehicle.id}/assets/9`).send({ classId: 1 });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleAsset).toHaveBeenCalledWith(vehicle.id, 9, { classId: 1 });
    });

    it("of other classes are hidden from an investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      asClassAInvestor();
      mockStorage.getVehicleAssets.mockResolvedValue([
        { id: 8, vehicleId: 100, classId: 1, companyName: "Mine" },
        { id: 9, vehicleId: 100, classId: 2, companyName: "Theirs" },
      ]);
      const res = await agent.get(`/api/vehicles/${vehicle.id}/assets`);
      expect(res.status).toBe(200);
      expect(res.body.map((a: any) => a.companyName)).toEqual(["Mine"]);
    });

    it("of other classes don't show their valuations to an investor", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      asClassAInvestor();
      mockStorage.getVehicleAsset.mockImplementation(async (_v: number, id: number) => ({ id, vehicleId: 100, classId: id === 8 ? 1 : 2 }));
      expect((await agent.get(`/api/vehicles/${vehicle.id}/assets/9/valuations`)).status).toBe(403);
      expect((await agent.get(`/api/vehicles/${vehicle.id}/assets/8/valuations`)).status).toBe(200);
    });
  });
});
