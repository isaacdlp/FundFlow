import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Vehicle assets", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const vehicle = fixtures.vehicle({ id: 100, organizationId: 10 });
  const vehicleWithCash = { ...vehicle, cash: "5000.00", assetValue: "0.00", currentValue: "5000.00" };

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/vehicles/:id/assets", () => {
    it("non-admin without Vehicle access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getVehicleIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/vehicles/${vehicle.id}/assets`);
      expect(res.status).toBe(403);
    });

    it("admin lists assets", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleAssets.mockResolvedValue([
        { id: 1, vehicleId: vehicle.id, companyName: "Acme", instrumentType: "Equity", cost: "1000", currentValue: "1500.00" },
      ]);
      const res = await agent.get(`/api/vehicles/${vehicle.id}/assets`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/vehicles/:id/assets", () => {
    it("plain member of org cannot add", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleWithCash);
      mockStorage.getOrganization.mockResolvedValue(
        fixtures.organization({ id: vehicle.organizationId, organizers: [{ accountId: fixtures.organizerAccount.id }] }),
      );
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets`)
        .send({ companyName: "Acme", cost: 100 });
      expect(res.status).toBe(403);
    });

    it("returns 400 when companyName missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleWithCash);
      const res = await agent.post(`/api/vehicles/${vehicle.id}/assets`).send({ cost: 100 });
      expect(res.status).toBe(400);
    });

    it("allows cost greater than Vehicle cash (negative cash permitted)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue({ ...vehicleWithCash, cash: "100.00" });
      mockStorage.createVehicleAsset.mockResolvedValue({
        id: 99, vehicleId: vehicle.id, companyName: "Acme", instrumentType: "Equity",
        cost: "5000.00", currentValue: "5000.00",
      });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets`)
        .send({ companyName: "Acme", cost: 5000 });
      expect(res.status).toBe(201);
    });

    it("admin successfully creates asset", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleWithCash);
      mockStorage.createVehicleAsset.mockResolvedValue({
        id: 1, vehicleId: vehicle.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets`)
        .send({ companyName: "Acme", instrumentType: "Equity", cost: 1000, purchaseDate: "2025-01-15" });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicleAsset).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/vehicles/:id/assets/:assetId", () => {
    it("returns 404 when asset missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicleAsset.mockResolvedValue(false);
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/assets/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteVehicleAsset.mockResolvedValue(true);
      const res = await agent.delete(`/api/vehicles/${vehicle.id}/assets/1`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/vehicles/:id/assets/:assetId/valuations", () => {
    it("returns 400 on missing date", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleAsset.mockResolvedValue({ id: 1, vehicleId: vehicle.id });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets/1/valuations`)
        .send({ value: 100 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on negative value", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleAsset.mockResolvedValue({ id: 1, vehicleId: vehicle.id });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets/1/valuations`)
        .send({ date: "2025-06-01", value: -10 });
      expect(res.status).toBe(400);
    });

    it("admin can add valuation", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicleAsset.mockResolvedValue({ id: 1, vehicleId: vehicle.id });
      mockStorage.addAssetValuation.mockResolvedValue({
        id: 1, assetId: 1, date: "2025-06-01", value: "1500.00", note: "",
      });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets/1/valuations`)
        .send({ date: "2025-06-01", value: 1500 });
      expect(res.status).toBe(201);
      expect(mockStorage.addAssetValuation).toHaveBeenCalledWith(1, {
        date: "2025-06-01", value: "1500.00", note: "",
      });
    });
  });

  describe("isDefault asset flag", () => {
    it("passes isDefault through to storage on create", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue(vehicleWithCash);
      mockStorage.createVehicleAsset.mockResolvedValue({
        id: 7, vehicleId: vehicle.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", isDefault: true, currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/assets`)
        .send({ companyName: "Acme", cost: 1000, isDefault: true });
      expect(res.status).toBe(201);
      expect(mockStorage.createVehicleAsset).toHaveBeenCalledWith(
        vehicle.id,
        expect.objectContaining({ isDefault: true }),
      );
    });

    it("PATCH can promote an asset to default", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateVehicleAsset.mockResolvedValue({
        id: 7, vehicleId: vehicle.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", isDefault: true, currentValue: "1000.00",
      });
      const res = await agent
        .patch(`/api/vehicles/${vehicle.id}/assets/7`)
        .send({ isDefault: true });
      expect(res.status).toBe(200);
      expect(mockStorage.updateVehicleAsset).toHaveBeenCalledWith(
        vehicle.id, 7,
        expect.objectContaining({ isDefault: true }),
      );
    });
  });

  describe("AutoDeploy member add", () => {
    it("rejects with 400 when Vehicle is autoDeploy but has no default asset", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue({ ...vehicleWithCash, autoDeploy: true });
      mockStorage.getVehicleAssets.mockResolvedValue([
        { id: 1, vehicleId: vehicle.id, companyName: "X", instrumentType: "Equity", cost: "0", isDefault: false, currentValue: "0" },
      ]);
      mockStorage.getMember.mockResolvedValue({ status: "approved" });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 1000, date: "2025-01-15" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/default asset/i);
    });

    it("allows add when autoDeploy is true and a default asset exists", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getVehicle.mockResolvedValue({ ...vehicleWithCash, autoDeploy: true });
      mockStorage.getVehicleAssets.mockResolvedValue([
        { id: 1, vehicleId: vehicle.id, companyName: "X", instrumentType: "Equity", cost: "0", isDefault: true, currentValue: "0" },
      ]);
      mockStorage.getAccount.mockResolvedValue(fixtures.adminAccount);
      mockStorage.getMember.mockResolvedValue({ status: "approved" });
      mockStorage.addVehicleMember.mockResolvedValue({
        id: 50, vehicleId: vehicle.id, accountId: fixtures.memberAccount.id,
        investorType: "account", account: fixtures.memberAccount,
        committed: "1000.00", totalCalled: "1000.00", currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/vehicles/${vehicle.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 1000, date: "2025-01-15" });
      expect(res.status).toBe(201);
    });
  });
});
