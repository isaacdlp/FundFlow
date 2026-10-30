import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

const { adminAccount, memberAccount: member, organizerAccount: other, outsiderAccount: outsider } = fixtures;
const byId: Record<number, any> = { 1: adminAccount, 2: member, 3: other, 4: outsider };
const ENTITY = 200;
const entity = fixtures.entity({ id: ENTITY });

const delegation = (id: number, delegateAccountId: number, level: "observer" | "manager") =>
  ({ id, principalAccountId: null, principalEntityId: ENTITY, delegateAccountId, level, notes: "" });

describe("Entity delegations", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  /**
   * Logs in as `me`. `entityLevels` maps account id → its delegation level on
   * the entity; `delegators` are the account delegations `me` holds.
   */
  async function loginWith(me: any, entityLevels: Record<number, string> = {}, delegators: { accountId: number; level: string }[] = []) {
    const agent = await loginAs(app, mockStorage, me);
    mockStorage.getAccount.mockImplementation(async (id: number) => byId[id] ?? null);
    mockStorage.getEntity.mockResolvedValue(entity);
    mockStorage.getDelegatorsOf.mockImplementation(async (id: number) => (id === me.id ? delegators : []));
    mockStorage.getEntityIdsForAccount.mockImplementation(async (id: number, minLevel = "observer") => {
      const level = entityLevels[id];
      return level && (minLevel === "observer" || level === "manager") ? [ENTITY] : [];
    });
    return agent;
  }

  describe("reading", () => {
    it("any delegate can read the entity and its delegations, and sees its own level", async () => {
      mockStorage.getDelegationsForEntity.mockResolvedValue([delegation(1, 3, "manager"), delegation(2, 2, "observer")]);
      const agent = await loginWith(member, { 2: "observer" });
      const res = await agent.get(`/api/entities/${ENTITY}`);
      expect(res.status).toBe(200);
      expect(res.body.access).toBe("observer");
      const list = await agent.get(`/api/entities/${ENTITY}/delegations`);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(2);
    });

    it("reports manager and admin access", async () => {
      expect((await (await loginWith(member, { 2: "manager" })).get(`/api/entities/${ENTITY}`)).body.access).toBe("manager");
      expect((await (await loginWith(adminAccount)).get(`/api/entities/${ENTITY}`)).body.access).toBe("admin");
    });

    it("others can't", async () => {
      const agent = await loginWith(outsider);
      expect((await agent.get(`/api/entities/${ENTITY}`)).status).toBe(403);
      expect((await agent.get(`/api/entities/${ENTITY}/delegations`)).status).toBe(403);
    });
  });

  describe("changing the entity", () => {
    it("an observer can't edit the entity or its owners; a manager can", async () => {
      mockStorage.updateEntity.mockResolvedValue(entity);
      const observer = await loginWith(member, { 2: "observer" });
      expect((await observer.patch(`/api/entities/${ENTITY}`).send({ name: "X" })).status).toBe(403);
      expect((await observer.post(`/api/entities/${ENTITY}/owners`).send({ ownerType: "account", ownerAccountId: 3, ownershipPercent: "10" })).status).toBe(403);
      const manager = await loginWith(member, { 2: "manager" });
      expect((await manager.patch(`/api/entities/${ENTITY}`).send({ name: "X" })).status).toBe(200);
    });

    it("an account's manager-level delegate manages the entities that account manages", async () => {
      mockStorage.updateEntity.mockResolvedValue(entity);
      const viaObserver = await loginWith(member, { 3: "manager" }, [{ accountId: 3, level: "observer" }]);
      expect((await viaObserver.get(`/api/entities/${ENTITY}`)).body.access).toBe("observer");
      expect((await viaObserver.patch(`/api/entities/${ENTITY}`).send({ name: "X" })).status).toBe(403);
      const viaManager = await loginWith(member, { 3: "manager" }, [{ accountId: 3, level: "manager" }]);
      expect((await viaManager.patch(`/api/entities/${ENTITY}`).send({ name: "X" })).status).toBe(200);
    });
  });

  describe("delegating", () => {
    it("the entity's managers can add delegates; observers can't", async () => {
      mockStorage.createDelegation.mockResolvedValue(delegation(9, 4, "observer"));
      const body = { principalEntityId: ENTITY, delegateAccountId: 4, level: "observer" };
      expect((await (await loginWith(member, { 2: "observer" })).post("/api/delegations").send(body)).status).toBe(403);
      const res = await (await loginWith(member, { 2: "manager" })).post("/api/delegations").send(body);
      expect(res.status).toBe(201);
      expect(mockStorage.createDelegation).toHaveBeenCalledWith(body);
    });

    it("rejects both or neither principal, and unknown entities", async () => {
      const agent = await loginWith(adminAccount);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, principalEntityId: ENTITY, delegateAccountId: 2, level: "manager" })).status).toBe(400);
      expect((await agent.post("/api/delegations").send({ delegateAccountId: 2, level: "manager" })).status).toBe(400);
      mockStorage.getEntity.mockResolvedValue(undefined);
      expect((await agent.post("/api/delegations").send({ principalEntityId: 999, delegateAccountId: 2, level: "manager" })).status).toBe(404);
    });

    it("keeps at least one manager: the last one can't be removed or made an observer", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.getDelegation.mockResolvedValue(delegation(1, 3, "manager"));
      mockStorage.getDelegationsForEntity.mockResolvedValue([delegation(1, 3, "manager"), delegation(2, 2, "observer")]);
      expect((await agent.delete("/api/delegations/1")).status).toBe(409);
      expect((await agent.patch("/api/delegations/1").send({ level: "observer" })).status).toBe(409);
      expect(mockStorage.deleteDelegation).not.toHaveBeenCalled();
      expect(mockStorage.updateDelegation).not.toHaveBeenCalled();
    });

    it("a manager can go once another one remains", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.getDelegation.mockResolvedValue(delegation(1, 3, "manager"));
      mockStorage.getDelegationsForEntity.mockResolvedValue([delegation(1, 3, "manager"), delegation(2, 2, "manager")]);
      mockStorage.deleteDelegation.mockResolvedValue(true);
      expect((await agent.delete("/api/delegations/1")).status).toBe(200);
    });

    it("observers can always be removed, and notes edited on the last manager", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.getDelegationsForEntity.mockResolvedValue([delegation(1, 3, "manager"), delegation(2, 2, "observer")]);
      mockStorage.getDelegation.mockResolvedValue(delegation(2, 2, "observer"));
      mockStorage.deleteDelegation.mockResolvedValue(true);
      expect((await agent.delete("/api/delegations/2")).status).toBe(200);
      mockStorage.getDelegation.mockResolvedValue(delegation(1, 3, "manager"));
      mockStorage.updateDelegation.mockResolvedValue(delegation(1, 3, "manager"));
      expect((await agent.patch("/api/delegations/1").send({ notes: "POA" })).status).toBe(200);
    });

    it("an entity's manager can't touch account delegations", async () => {
      const agent = await loginWith(member, { 2: "manager" });
      mockStorage.getDelegation.mockResolvedValue({ id: 5, principalAccountId: 3, principalEntityId: null, delegateAccountId: 4, level: "observer" });
      expect((await agent.delete("/api/delegations/5")).status).toBe(403);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 4, level: "observer" })).status).toBe(403);
    });
  });
});
