import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("GET /api/portfolio", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("returns 400 if both accountId and entityId provided", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    const res = await agent.get("/api/portfolio?accountId=1&entityId=2");
    expect(res.status).toBe(400);
  });

  it("admin (no filter) gets the full portfolio", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getPortfolio.mockResolvedValue([{ id: 1, currentValue: "1000" }]);
    const res = await agent.get("/api/portfolio");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockStorage.getPortfolio).toHaveBeenCalledWith();
  });

  it("non-admin (no filter) gets their own + their owned-entity portfolio", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([200]);
    mockStorage.getPortfolio.mockResolvedValue([]);
    const res = await agent.get("/api/portfolio");
    expect(res.status).toBe(200);
    expect(mockStorage.getPortfolio).toHaveBeenCalledWith({
      accountIds: [fixtures.memberAccount.id],
      entityIds: [200],
    });
  });

  describe("?accountId filter", () => {
    it("returns 400 on invalid accountId", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/portfolio?accountId=abc");
      expect(res.status).toBe(400);
    });

    it("non-admin gets 403 requesting another account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get(
        `/api/portfolio?accountId=${fixtures.adminAccount.id}`,
      );
      expect(res.status).toBe(403);
    });

    it("non-admin can request own", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([]);
      mockStorage.getPortfolio.mockResolvedValue([]);
      const res = await agent.get(
        `/api/portfolio?accountId=${fixtures.memberAccount.id}`,
      );
      expect(res.status).toBe(200);
    });

    it("admin can request any account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([]);
      mockStorage.getPortfolio.mockResolvedValue([]);
      const res = await agent.get(
        `/api/portfolio?accountId=${fixtures.memberAccount.id}`,
      );
      expect(res.status).toBe(200);
    });
  });

  describe("?entityId filter", () => {
    it("returns 400 on invalid entityId", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.get("/api/portfolio?entityId=abc");
      expect(res.status).toBe(400);
    });

    it("non-admin gets 403 if not owner or manager of the entity", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([]);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/portfolio?entityId=200`);
      expect(res.status).toBe(403);
    });

    it("non-admin owner of entity can fetch", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([200]);
      mockStorage.getPortfolio.mockResolvedValue([]);
      const res = await agent.get(`/api/portfolio?entityId=200`);
      expect(res.status).toBe(200);
    });

    it("non-admin manager of entity can fetch", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([]);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([200]);
      mockStorage.getPortfolio.mockResolvedValue([]);
      const res = await agent.get(`/api/portfolio?entityId=200`);
      expect(res.status).toBe(200);
    });

    it("admin can fetch any entity", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getPortfolio.mockResolvedValue([]);
      const res = await agent.get(`/api/portfolio?entityId=200`);
      expect(res.status).toBe(200);
    });
  });
});
