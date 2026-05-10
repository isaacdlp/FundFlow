import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("SPV assets", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const spv = fixtures.spv({ id: 100, organizationId: 10 });
  const spvWithCash = { ...spv, cash: "5000.00", assetValue: "0.00", currentValue: "5000.00" };

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/spvs/:id/assets", () => {
    it("non-admin without SPV access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getSpvIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/spvs/${spv.id}/assets`);
      expect(res.status).toBe(403);
    });

    it("admin lists assets", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvAssets.mockResolvedValue([
        { id: 1, spvId: spv.id, companyName: "Acme", instrumentType: "Equity", cost: "1000", currentValue: "1500.00" },
      ]);
      const res = await agent.get(`/api/spvs/${spv.id}/assets`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/spvs/:id/assets", () => {
    it("plain member of org cannot add", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getSpv.mockResolvedValue(spvWithCash);
      mockStorage.getOrganization.mockResolvedValue(
        fixtures.organization({ id: spv.organizationId, organizers: [{ accountId: fixtures.organizerAccount.id }] }),
      );
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets`)
        .send({ companyName: "Acme", cost: 100 });
      expect(res.status).toBe(403);
    });

    it("returns 400 when companyName missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvWithCash);
      const res = await agent.post(`/api/spvs/${spv.id}/assets`).send({ cost: 100 });
      expect(res.status).toBe(400);
    });

    it("allows cost greater than SPV cash (negative cash permitted)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue({ ...spvWithCash, cash: "100.00" });
      mockStorage.createSpvAsset.mockResolvedValue({
        id: 99, spvId: spv.id, companyName: "Acme", instrumentType: "Equity",
        cost: "5000.00", currentValue: "5000.00",
      });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets`)
        .send({ companyName: "Acme", cost: 5000 });
      expect(res.status).toBe(201);
    });

    it("admin successfully creates asset", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue(spvWithCash);
      mockStorage.createSpvAsset.mockResolvedValue({
        id: 1, spvId: spv.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets`)
        .send({ companyName: "Acme", instrumentType: "Equity", cost: 1000, purchaseDate: "2025-01-15" });
      expect(res.status).toBe(201);
      expect(mockStorage.createSpvAsset).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/spvs/:id/assets/:assetId", () => {
    it("returns 404 when asset missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteSpvAsset.mockResolvedValue(false);
      const res = await agent.delete(`/api/spvs/${spv.id}/assets/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteSpvAsset.mockResolvedValue(true);
      const res = await agent.delete(`/api/spvs/${spv.id}/assets/1`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/spvs/:id/assets/:assetId/valuations", () => {
    it("returns 400 on missing date", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvAsset.mockResolvedValue({ id: 1, spvId: spv.id });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets/1/valuations`)
        .send({ value: 100 });
      expect(res.status).toBe(400);
    });

    it("returns 400 on negative value", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvAsset.mockResolvedValue({ id: 1, spvId: spv.id });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets/1/valuations`)
        .send({ date: "2025-06-01", value: -10 });
      expect(res.status).toBe(400);
    });

    it("admin can add valuation", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpvAsset.mockResolvedValue({ id: 1, spvId: spv.id });
      mockStorage.addAssetValuation.mockResolvedValue({
        id: 1, assetId: 1, date: "2025-06-01", value: "1500.00", note: "",
      });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets/1/valuations`)
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
      mockStorage.getSpv.mockResolvedValue(spvWithCash);
      mockStorage.createSpvAsset.mockResolvedValue({
        id: 7, spvId: spv.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", isDefault: true, currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/spvs/${spv.id}/assets`)
        .send({ companyName: "Acme", cost: 1000, isDefault: true });
      expect(res.status).toBe(201);
      expect(mockStorage.createSpvAsset).toHaveBeenCalledWith(
        spv.id,
        expect.objectContaining({ isDefault: true }),
      );
    });

    it("PATCH can promote an asset to default", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateSpvAsset.mockResolvedValue({
        id: 7, spvId: spv.id, companyName: "Acme", instrumentType: "Equity",
        cost: "1000.00", isDefault: true, currentValue: "1000.00",
      });
      const res = await agent
        .patch(`/api/spvs/${spv.id}/assets/7`)
        .send({ isDefault: true });
      expect(res.status).toBe(200);
      expect(mockStorage.updateSpvAsset).toHaveBeenCalledWith(
        spv.id, 7,
        expect.objectContaining({ isDefault: true }),
      );
    });
  });

  describe("AutoDeploy member add", () => {
    it("rejects with 400 when SPV is autoDeploy but has no default asset", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue({ ...spvWithCash, autoDeploy: true });
      mockStorage.getSpvAssets.mockResolvedValue([
        { id: 1, spvId: spv.id, companyName: "X", instrumentType: "Equity", cost: "0", isDefault: false, currentValue: "0" },
      ]);
      mockStorage.getMember.mockResolvedValue({ status: "approved" });
      const res = await agent
        .post(`/api/spvs/${spv.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 1000 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/default asset/i);
    });

    it("allows add when autoDeploy is true and a default asset exists", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getSpv.mockResolvedValue({ ...spvWithCash, autoDeploy: true });
      mockStorage.getSpvAssets.mockResolvedValue([
        { id: 1, spvId: spv.id, companyName: "X", instrumentType: "Equity", cost: "0", isDefault: true, currentValue: "0" },
      ]);
      mockStorage.getAccount.mockResolvedValue(fixtures.adminAccount);
      mockStorage.getMember.mockResolvedValue({ status: "approved" });
      mockStorage.addSpvMember.mockResolvedValue({
        id: 50, spvId: spv.id, accountId: fixtures.memberAccount.id,
        investorType: "account", account: fixtures.memberAccount,
        committed: "1000.00", totalCalled: "1000.00", currentValue: "1000.00",
      });
      const res = await agent
        .post(`/api/spvs/${spv.id}/members`)
        .send({ accountId: fixtures.memberAccount.id, committed: 1000 });
      expect(res.status).toBe(201);
    });
  });
});
