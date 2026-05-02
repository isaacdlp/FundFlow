import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Entity owners", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const entityA = fixtures.entity({ id: 200 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/entities/:id/owners", () => {
    it("non-admin without access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/entities/${entityA.id}/owners`);
      expect(res.status).toBe(403);
    });

    it("manager/owner can list owners", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([entityA.id]);
      mockStorage.getEntityOwners.mockResolvedValue([
        { id: 1, entityId: entityA.id, ownerType: "account", ownerAccountId: 2 },
      ]);
      const res = await agent.get(`/api/entities/${entityA.id}/owners`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/entities/:id/owners", () => {
    it("returns 400 when ownerType is missing or invalid", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const r1 = await agent.post(`/api/entities/${entityA.id}/owners`).send({});
      const r2 = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "weird" });
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
    });

    it("returns 400 when ownerType=account but ownerAccountId missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "account", ownershipPercent: "50" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when ownerType=entity but ownerEntityId missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "entity", ownershipPercent: "50" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when ownershipPercent is out of range", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const r1 = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "account", ownerAccountId: 2, ownershipPercent: "-1" });
      const r2 = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "account", ownerAccountId: 2, ownershipPercent: "101" });
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
    });

    it("admin successfully adds an account owner", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.addEntityOwner.mockResolvedValue({
        id: 1,
        entityId: entityA.id,
        ownerType: "account",
        ownerAccountId: 2,
      });
      const res = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({
          ownerType: "account",
          ownerAccountId: 2,
          ownershipPercent: "50",
          date: "2024-01-01",
        });
      expect(res.status).toBe(201);
      expect(mockStorage.addEntityOwner).toHaveBeenCalledWith(
        entityA.id,
        "account",
        2,
        null,
        "50",
        "2024-01-01",
      );
    });

    it("admin successfully adds an entity owner", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.addEntityOwner.mockResolvedValue({
        id: 2,
        entityId: entityA.id,
        ownerType: "entity",
        ownerEntityId: 201,
      });
      const res = await agent
        .post(`/api/entities/${entityA.id}/owners`)
        .send({ ownerType: "entity", ownerEntityId: 201, ownershipPercent: "100" });
      expect(res.status).toBe(201);
    });
  });

  describe("DELETE /api/entities/:id/owners/:ownerId", () => {
    it("non-admin without access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent.delete(`/api/entities/${entityA.id}/owners/1`);
      expect(res.status).toBe(403);
    });

    it("returns 404 when owner not found", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeEntityOwner.mockResolvedValue(false);
      const res = await agent.delete(`/api/entities/${entityA.id}/owners/9999`);
      expect(res.status).toBe(404);
    });

    it("admin can remove an owner", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeEntityOwner.mockResolvedValue(true);
      const res = await agent.delete(`/api/entities/${entityA.id}/owners/1`);
      expect(res.status).toBe(200);
    });
  });
});
