import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";
import { createPromoterSchema, createIncentiveSchema } from "@shared/schema";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("incentive validation", () => {
  it("accepts management and success fee shares between 0 and 100", () => {
    expect(createIncentiveSchema.parse({ type: "management_fee", percent: 20 }).percent).toBe(20);
    expect(createIncentiveSchema.parse({ type: "success_fee", percent: "12.5" }).percent).toBe(12.5);
    expect(createIncentiveSchema.parse({ type: "success_fee", percent: 100 }).percent).toBe(100);
  });

  it("rejects unknown types, out-of-range and over-precise percentages", () => {
    expect(createIncentiveSchema.safeParse({ type: "carry", percent: 10 }).success).toBe(false);
    expect(createIncentiveSchema.safeParse({ type: "success_fee", percent: 0 }).success).toBe(false);
    expect(createIncentiveSchema.safeParse({ type: "success_fee", percent: 100.01 }).success).toBe(false);
    expect(createIncentiveSchema.safeParse({ type: "success_fee", percent: 10.123 }).success).toBe(false);
  });

  it("rejects the same incentive type twice on creation", () => {
    const res = createPromoterSchema.safeParse({
      accountId: 1,
      incentives: [{ type: "success_fee", percent: 10 }, { type: "success_fee", percent: 5 }],
    });
    expect(res.success).toBe(false);
  });
});

describe("Promoters API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("is admin-only", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    expect((await agent.get("/api/promoters")).status).toBe(403);
    expect((await agent.post("/api/promoters").send({ accountId: 2 })).status).toBe(403);
    expect((await agent.patch("/api/promoters/1").send({ active: false })).status).toBe(403);
    expect((await agent.delete("/api/promoters/1")).status).toBe(403);
    expect((await agent.post("/api/promoters/1/incentives").send({ type: "success_fee", percent: 10 })).status).toBe(403);
    expect(mockStorage.createPromoter).not.toHaveBeenCalled();
  });

  it("lists promoters", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getPromoters.mockResolvedValue([{ id: 1 }]);
    const res = await agent.get("/api/promoters");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  describe("POST /api/promoters", () => {
    it("creates a promoter with its incentives", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createPromoter.mockResolvedValue({ id: 3 });
      const res = await agent.post("/api/promoters").send({
        accountId: 2, contractDate: "2026-10-01", notes: "Signed",
        incentives: [{ type: "management_fee", percent: 20 }],
      });
      expect(res.status).toBe(201);
      expect(mockStorage.createPromoter).toHaveBeenCalledWith({
        accountId: 2, contractDate: "2026-10-01", notes: "Signed",
        incentives: [{ type: "management_fee", percent: 20 }],
      });
    });

    it("returns 404 for an unknown account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === fixtures.adminAccount.id ? fixtures.adminAccount : null);
      const res = await agent.post("/api/promoters").send({ accountId: 999 });
      expect(res.status).toBe(404);
    });

    it("returns 409 when the account already is a promoter", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createPromoter.mockResolvedValue(null);
      const res = await agent.post("/api/promoters").send({ accountId: 2 });
      expect(res.status).toBe(409);
    });

    it("validates the body", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post("/api/promoters").send({ accountId: 2, contractDate: "October" });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH/DELETE /api/promoters/:id", () => {
    it("updates status, contract date and notes", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updatePromoter.mockResolvedValue({ id: 3, active: false });
      const res = await agent.patch("/api/promoters/3").send({ active: false, contractDate: null });
      expect(res.status).toBe(200);
      expect(mockStorage.updatePromoter).toHaveBeenCalledWith(3, { active: false, contractDate: null });
    });

    it("returns 404 when missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      expect((await agent.patch("/api/promoters/3").send({ active: false })).status).toBe(404);
      expect((await agent.delete("/api/promoters/3")).status).toBe(404);
      expect((await agent.get("/api/promoters/3")).status).toBe(404);
    });

    it("removes a promoter", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deletePromoter.mockResolvedValue(true);
      expect((await agent.delete("/api/promoters/3")).status).toBe(200);
    });
  });

  describe("incentives", () => {
    it("adds an incentive", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getPromoter.mockResolvedValue({ id: 3 });
      mockStorage.createPromoterIncentive.mockResolvedValue({ id: 8 });
      const res = await agent.post("/api/promoters/3/incentives").send({ type: "success_fee", percent: "15" });
      expect(res.status).toBe(201);
      expect(mockStorage.createPromoterIncentive).toHaveBeenCalledWith(3, { type: "success_fee", percent: 15 });
    });

    it("returns 404 for an unknown promoter and 409 for a duplicate type", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      expect((await agent.post("/api/promoters/3/incentives").send({ type: "success_fee", percent: 15 })).status).toBe(404);
      mockStorage.getPromoter.mockResolvedValue({ id: 3 });
      mockStorage.createPromoterIncentive.mockResolvedValue(null);
      expect((await agent.post("/api/promoters/3/incentives").send({ type: "success_fee", percent: 15 })).status).toBe(409);
    });

    it("edits and removes an incentive of that promoter", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getPromoterIncentive.mockResolvedValue({ id: 8, promoterId: 3 });
      mockStorage.updatePromoterIncentive.mockResolvedValue({ id: 8, percent: "25.00" });
      const patched = await agent.patch("/api/promoters/3/incentives/8").send({ percent: 25 });
      expect(patched.status).toBe(200);
      expect(mockStorage.updatePromoterIncentive).toHaveBeenCalledWith(8, { percent: 25 });
      expect((await agent.delete("/api/promoters/3/incentives/8")).status).toBe(200);
      expect(mockStorage.deletePromoterIncentive).toHaveBeenCalledWith(8);
    });

    it("won't touch another promoter's incentive through this URL", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getPromoterIncentive.mockResolvedValue({ id: 8, promoterId: 4 });
      expect((await agent.patch("/api/promoters/3/incentives/8").send({ percent: 25 })).status).toBe(404);
      expect((await agent.delete("/api/promoters/3/incentives/8")).status).toBe(404);
      expect(mockStorage.deletePromoterIncentive).not.toHaveBeenCalled();
    });
  });
});
