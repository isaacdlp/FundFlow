import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

const { adminAccount, memberAccount: delegate, organizerAccount: principal, outsiderAccount: outsider } = fixtures;
const byId: Record<number, any> = { 1: adminAccount, 2: delegate, 3: principal, 4: outsider };

describe("delegations and relationships", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  /** Logs in as `me`, resolving other accounts by id; `me` holds the given delegations. */
  async function loginWith(me: any, delegators: { accountId: number; level: string }[] = []) {
    const agent = await loginAs(app, mockStorage, me);
    mockStorage.getAccount.mockImplementation(async (id: number) => byId[id] ?? null);
    mockStorage.getDelegatorsOf.mockImplementation(async (id: number) => (id === me.id ? delegators : []));
    return agent;
  }

  describe("admin API", () => {
    it("is admin-only", async () => {
      const agent = await loginWith(delegate);
      expect((await agent.get(`/api/accounts/${principal.id}/delegations`)).status).toBe(403);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 2, level: "observer" })).status).toBe(403);
      expect((await agent.get(`/api/accounts/${principal.id}/relationships`)).status).toBe(403);
      expect((await agent.post("/api/relationships").send({ fromAccountId: 3, toAccountId: 2, description: "wife" })).status).toBe(403);
    });

    it("creates a delegation", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.createDelegation.mockResolvedValue({ id: 7 });
      const body = { principalAccountId: 3, delegateAccountId: 2, level: "manager", notes: "POA 2026" };
      const res = await agent.post("/api/delegations").send(body);
      expect(res.status).toBe(201);
      expect(mockStorage.createDelegation).toHaveBeenCalledWith(body);
    });

    it("rejects self-delegation, unknown levels and unknown accounts", async () => {
      const agent = await loginWith(adminAccount);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 3, level: "observer" })).status).toBe(400);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 2, level: "owner" })).status).toBe(400);
      expect((await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 99, level: "observer" })).status).toBe(404);
    });

    it("returns 409 for a duplicate delegation", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.createDelegation.mockResolvedValue(null);
      const res = await agent.post("/api/delegations").send({ principalAccountId: 3, delegateAccountId: 2, level: "observer" });
      expect(res.status).toBe(409);
    });

    it("changes the level and removes a delegation", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.getDelegation.mockResolvedValue({ id: 7, principalAccountId: 3, principalEntityId: null, delegateAccountId: 2, level: "manager" });
      mockStorage.updateDelegation.mockResolvedValue({ id: 7, level: "observer" });
      expect((await agent.patch("/api/delegations/7").send({ level: "observer" })).status).toBe(200);
      expect(mockStorage.updateDelegation).toHaveBeenCalledWith(7, { level: "observer" });
      mockStorage.getDelegation.mockResolvedValue(undefined);
      expect((await agent.delete("/api/delegations/7")).status).toBe(404);
      mockStorage.getDelegation.mockResolvedValue({ id: 7, principalAccountId: 3, principalEntityId: null, delegateAccountId: 2, level: "observer" });
      mockStorage.deleteDelegation.mockResolvedValue(true);
      expect((await agent.delete("/api/delegations/7")).status).toBe(200);
    });

    it("creates relationships with a trimmed description", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.createRelationship.mockResolvedValue({ id: 5 });
      const res = await agent.post("/api/relationships").send({ fromAccountId: 3, toAccountId: 2, description: "  wife " });
      expect(res.status).toBe(201);
      expect(mockStorage.createRelationship).toHaveBeenCalledWith({ fromAccountId: 3, toAccountId: 2, description: "wife" });
    });

    it("rejects empty, self and duplicate relationships", async () => {
      const agent = await loginWith(adminAccount);
      expect((await agent.post("/api/relationships").send({ fromAccountId: 3, toAccountId: 2, description: " " })).status).toBe(400);
      expect((await agent.post("/api/relationships").send({ fromAccountId: 3, toAccountId: 3, description: "self" })).status).toBe(400);
      mockStorage.createRelationship.mockResolvedValue(null);
      expect((await agent.post("/api/relationships").send({ fromAccountId: 3, toAccountId: 2, description: "wife" })).status).toBe(409);
    });

    it("edits and removes relationships", async () => {
      const agent = await loginWith(adminAccount);
      mockStorage.updateRelationship.mockResolvedValue({ id: 5, description: "ex-wife" });
      expect((await agent.patch("/api/relationships/5").send({ description: "ex-wife" })).status).toBe(200);
      mockStorage.deleteRelationship.mockResolvedValue(true);
      expect((await agent.delete("/api/relationships/5")).status).toBe(200);
    });
  });

  describe("access granted by a delegation", () => {
    it("an observer reads the principal's account, which is listed with their own", async () => {
      const agent = await loginWith(delegate, [{ accountId: principal.id, level: "observer" }]);
      const res = await agent.get(`/api/accounts/${principal.id}`);
      expect(res.status).toBe(200);
      expect(res.body.access).toBe("observer");
      const list = await agent.get("/api/accounts");
      expect(list.body.map((a: any) => a.id)).toEqual([delegate.id, principal.id]);
    });

    it("reports self and admin access", async () => {
      const own = await loginWith(delegate);
      expect((await own.get(`/api/accounts/${delegate.id}`)).body.access).toBe("self");
      const admin = await loginWith(adminAccount);
      expect((await admin.get(`/api/accounts/${principal.id}`)).body.access).toBe("admin");
    });

    it("without a delegation, other accounts stay out of reach", async () => {
      const agent = await loginWith(delegate, [{ accountId: principal.id, level: "manager" }]);
      expect((await agent.get(`/api/accounts/${outsider.id}`)).status).toBe(403);
      expect((await agent.get(`/api/portfolio?accountId=${outsider.id}`)).status).toBe(403);
    });

    it("an observer can't edit the principal's profile; a manager can", async () => {
      mockStorage.updateAccount.mockResolvedValue(principal);
      const observer = await loginWith(delegate, [{ accountId: principal.id, level: "observer" }]);
      expect((await observer.patch(`/api/accounts/${principal.id}`).send({ phone: "1" })).status).toBe(403);
      const manager = await loginWith(delegate, [{ accountId: principal.id, level: "manager" }]);
      expect((await manager.patch(`/api/accounts/${principal.id}`).send({ phone: "1" })).status).toBe(200);
    });

    it("a manager can't grant roles through the principal's profile", async () => {
      mockStorage.updateAccount.mockResolvedValue(principal);
      const manager = await loginWith(delegate, [{ accountId: principal.id, level: "manager" }]);
      await manager.patch(`/api/accounts/${principal.id}`).send({ roles: ["admin"], phone: "1" });
      expect(mockStorage.updateAccount).toHaveBeenCalledWith(principal.id, expect.not.objectContaining({ roles: expect.anything() }));
    });

    it("an observer reads the principal's portfolio", async () => {
      const agent = await loginWith(delegate, [{ accountId: principal.id, level: "observer" }]);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([70]);
      const res = await agent.get(`/api/portfolio?accountId=${principal.id}`);
      expect(res.status).toBe(200);
      expect(mockStorage.getPortfolio).toHaveBeenCalledWith({ accountIds: [principal.id], entityIds: [70] });
    });

    it("an observer reads the principal's entities but only a manager may change them", async () => {
      mockStorage.getEntityIdsForAccount.mockImplementation(async (id: number) => (id === principal.id ? [70] : []));
      mockStorage.getEntity.mockResolvedValue({ id: 70, name: "Family Trust" });
      mockStorage.updateEntity.mockResolvedValue({ id: 70, name: "Renamed" });

      const observer = await loginWith(delegate, [{ accountId: principal.id, level: "observer" }]);
      expect((await observer.get("/api/entities/70")).status).toBe(200);
      expect((await observer.patch("/api/entities/70").send({ name: "Renamed" })).status).toBe(403);

      const manager = await loginWith(delegate, [{ accountId: principal.id, level: "manager" }]);
      mockStorage.getEntityIdsForAccount.mockImplementation(async (id: number) => (id === principal.id ? [70] : []));
      expect((await manager.patch("/api/entities/70").send({ name: "Renamed" })).status).toBe(200);
    });

    it("an observer sees the principal's vehicles and only their positions in them", async () => {
      const agent = await loginWith(delegate, [{ accountId: principal.id, level: "observer" }]);
      mockStorage.getVehicleIdsForAccount.mockImplementation(async (id: number) => (id === principal.id ? [50] : []));
      mockStorage.getVehicle.mockResolvedValue({ id: 50, organizationId: 10, displayName: "Kapital" });
      mockStorage.getOrganization.mockResolvedValue({ id: 10, organizers: [] });
      mockStorage.getVehicleMembers.mockResolvedValue([
        { id: 1, accountId: principal.id, entityId: null },
        { id: 2, accountId: outsider.id, entityId: null },
      ]);
      expect((await agent.get("/api/vehicles/50")).status).toBe(200);
      const members = await agent.get("/api/vehicles/50/members");
      expect(members.body.map((m: any) => m.id)).toEqual([1]);
    });
  });
});
