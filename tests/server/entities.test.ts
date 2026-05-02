import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("/api/entities", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const entityA = fixtures.entity({ id: 200, name: "Entity A" });
  const entityB = fixtures.entity({ id: 201, name: "Entity B" });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/entities", () => {
    it("admin sees all + supports search", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAllEntities.mockResolvedValue([entityA, entityB]);
      const res = await agent.get("/api/entities?search=foo");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockStorage.getAllEntities).toHaveBeenCalledWith("foo");
    });

    it("non-admin sees only entities they manage/own", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getAllEntities.mockResolvedValue([entityA, entityB]);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([entityA.id]);
      const res = await agent.get("/api/entities");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(entityA.id);
    });
  });

  describe("GET /api/entities/:id", () => {
    it("non-admin without access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent.get(`/api/entities/${entityA.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can fetch any entity", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntity.mockResolvedValue(entityA);
      const res = await agent.get(`/api/entities/${entityA.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(entityA.id);
    });

    it("returns 404 when entity missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntity.mockResolvedValue(null);
      const res = await agent.get(`/api/entities/9999`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/entities (any auth)", () => {
    it("returns 400 on invalid body", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/entities").send({});
      expect(res.status).toBe(400);
    });

    it("any authenticated user can create an entity", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.createEntity.mockResolvedValue(entityA);
      const res = await agent
        .post("/api/entities")
        .send({ name: "Entity A", entityType: "LLC" });
      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /api/entities/:id", () => {
    it("non-admin without manage access gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      const res = await agent
        .patch(`/api/entities/${entityA.id}`)
        .send({ name: "Hacked" });
      expect(res.status).toBe(403);
    });

    it("manager/owner can update", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([entityA.id]);
      mockStorage.updateEntity.mockResolvedValue({ ...entityA, name: "Updated" });
      const res = await agent
        .patch(`/api/entities/${entityA.id}`)
        .send({ name: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    it("returns 404 when entity missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.updateEntity.mockResolvedValue(undefined);
      const res = await agent.patch(`/api/entities/9999`).send({ name: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/entities/:id (admin only)", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.delete(`/api/entities/${entityA.id}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteEntity.mockResolvedValue(true);
      const res = await agent.delete(`/api/entities/${entityA.id}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when entity missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.deleteEntity.mockResolvedValue(false);
      const res = await agent.delete(`/api/entities/9999`);
      expect(res.status).toBe(404);
    });
  });
});
