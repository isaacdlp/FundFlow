import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Entity managers", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const entityA = fixtures.entity({ id: 200 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/entities/:id/managers", () => {
    it("non-admin without access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/entities/${entityA.id}/managers`);
      expect(res.status).toBe(403);
    });

    it("manager can list managers", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([entityA.id]);
      mockStorage.getEntityManagers.mockResolvedValue([
        { id: 1, entityId: entityA.id, accountId: 2 },
      ]);
      const res = await agent.get(`/api/entities/${entityA.id}/managers`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/entities/:id/managers", () => {
    it("returns 400 when accountId missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post(`/api/entities/${entityA.id}/managers`).send({});
      expect(res.status).toBe(400);
    });

    it("admin can add a manager", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.addEntityManager.mockResolvedValue({
        id: 1,
        entityId: entityA.id,
        accountId: 2,
      });
      const res = await agent
        .post(`/api/entities/${entityA.id}/managers`)
        .send({ accountId: 2 });
      expect(res.status).toBe(200);
      expect(mockStorage.addEntityManager).toHaveBeenCalledWith(entityA.id, 2);
    });
  });

  describe("DELETE /api/entities/:id/managers/:accountId", () => {
    it("returns 400 on invalid IDs", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.delete(`/api/entities/${entityA.id}/managers/abc`);
      expect(res.status).toBe(400);
    });

    it("returns 404 when manager not found", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeEntityManager.mockResolvedValue(false);
      const res = await agent.delete(`/api/entities/${entityA.id}/managers/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can remove a manager", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeEntityManager.mockResolvedValue(true);
      const res = await agent.delete(`/api/entities/${entityA.id}/managers/2`);
      expect(res.status).toBe(200);
    });
  });
});
