import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";
import {
  findIntroductionConflict,
  computeInheritedIntroducers,
  unavailableIntroductions,
  type IntroductionGraph,
} from "../../server/introductions";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

function graph(partial: Partial<IntroductionGraph> = {}): IntroductionGraph {
  return { accountEdges: [], entityEdges: [], managers: [], ...partial };
}
const intro = (introducerAccountId: number, introducedAccountId: number) => ({ introducerAccountId, introducedAccountId });

describe("introduction rules", () => {
  // A(1) → B(2) → C(3)
  const chain = graph({ accountEdges: [intro(1, 2), intro(2, 3)] });

  it("rejects self-introduction", () => {
    expect(findIntroductionConflict(graph(), { introducerAccountId: 1, introducedAccountId: 1 })).toMatch(/itself/);
  });

  it("rejects direct and indirect loops", () => {
    expect(findIntroductionConflict(chain, { introducerAccountId: 2, introducedAccountId: 1 })).toMatch(/loop/);
    expect(findIntroductionConflict(chain, { introducerAccountId: 3, introducedAccountId: 1 })).toMatch(/loop/);
    expect(findIntroductionConflict(chain, { introducerAccountId: 3, introducedAccountId: 2 })).toMatch(/loop/);
  });

  it("allows multiple introducers and non-looping edges", () => {
    expect(findIntroductionConflict(chain, { introducerAccountId: 1, introducedAccountId: 3 })).toBeNull();
    expect(findIntroductionConflict(chain, { introducerAccountId: 4, introducedAccountId: 3 })).toBeNull();
    expect(findIntroductionConflict(chain, { introducerAccountId: 3, introducedAccountId: 4 })).toBeNull();
  });

  it("rejects introducing an entity managed by the introducer or by an upstream introducer", () => {
    const g = graph({ accountEdges: [intro(1, 2), intro(2, 3)], managers: [{ entityId: 100, accountId: 1 }] });
    expect(findIntroductionConflict(g, { introducerAccountId: 1, introducedEntityId: 100 })).toMatch(/manages/);
    expect(findIntroductionConflict(g, { introducerAccountId: 3, introducedEntityId: 100 })).toMatch(/loop/);
    expect(findIntroductionConflict(g, { introducerAccountId: 4, introducedEntityId: 100 })).toBeNull();
  });

  it("rejects an account introduction that would turn an existing entity introduction into a loop", () => {
    // C(3) introduced entity 100, managed by A(1). A→C would make C introduce A's entity.
    const g = graph({
      entityEdges: [{ introducerAccountId: 3, introducedEntityId: 100 }],
      managers: [{ entityId: 100, accountId: 1 }],
    });
    expect(findIntroductionConflict(g, { introducerAccountId: 1, introducedAccountId: 3 })).toMatch(/loop/);
    expect(findIntroductionConflict(g, { introducerAccountId: 3, introducedAccountId: 1 })).toBeNull();
  });

  it("lists unavailable choices for an account", () => {
    const g = graph({ accountEdges: [intro(1, 2), intro(2, 3)], managers: [{ entityId: 100, accountId: 1 }] });
    const forB = unavailableIntroductions(g, 2);
    expect(forB.introducerAccountIds.sort()).toEqual([2, 3]);
    expect(forB.introducedAccountIds.sort()).toEqual([1, 2]);
    expect(forB.introducedEntityIds).toEqual([100]);
  });
});

describe("inherited entity introductions", () => {
  it("credits the introducers of each manager", () => {
    const g = graph({
      accountEdges: [intro(1, 2), intro(4, 2), intro(5, 3)],
      managers: [{ entityId: 100, accountId: 2 }, { entityId: 100, accountId: 3 }],
    });
    expect(Object.fromEntries(computeInheritedIntroducers(g, 100))).toEqual({ 1: 2, 4: 2, 5: 3 });
  });

  it("skips co-managers and introducers already credited directly", () => {
    const g = graph({
      accountEdges: [intro(1, 2), intro(3, 2)],
      entityEdges: [{ introducerAccountId: 3, introducedEntityId: 100 }],
      managers: [{ entityId: 100, accountId: 2 }, { entityId: 100, accountId: 1 }],
    });
    expect(computeInheritedIntroducers(g, 100).size).toBe(0);
  });

  it("is not transitive", () => {
    const g = graph({ accountEdges: [intro(1, 2), intro(2, 3)], managers: [{ entityId: 100, accountId: 3 }] });
    expect(Object.fromEntries(computeInheritedIntroducers(g, 100))).toEqual({ 2: 3 });
  });
});

describe("Introductions API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("GET /api/accounts/:id/introductions", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get(`/api/accounts/${fixtures.memberAccount.id}/introductions`);
      expect(res.status).toBe(403);
    });

    it("admin gets introductions plus unavailable choices", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroductionGraph.mockResolvedValue(graph({ accountEdges: [intro(1, 2)] }));
      mockStorage.getIntroductionsForAccount.mockResolvedValue({ introducedBy: [{ id: 7 }], introduced: [] });
      const res = await agent.get("/api/accounts/2/introductions");
      expect(res.status).toBe(200);
      expect(res.body.introducedBy).toEqual([{ id: 7 }]);
      expect(res.body.unavailable.introducedAccountIds.sort()).toEqual([1, 2]);
    });
  });

  describe("POST /api/introductions", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/introductions").send({ introducerAccountId: 1, introducedAccountId: 2 });
      expect(res.status).toBe(403);
    });

    it("requires exactly one target", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const none = await agent.post("/api/introductions").send({ introducerAccountId: 1 });
      expect(none.status).toBe(400);
      const both = await agent.post("/api/introductions")
        .send({ introducerAccountId: 1, introducedAccountId: 2, introducedEntityId: 3 });
      expect(both.status).toBe(400);
    });

    it("returns 404 for an unknown entity", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntity.mockResolvedValue(null);
      const res = await agent.post("/api/introductions").send({ introducerAccountId: 1, introducedEntityId: 999 });
      expect(res.status).toBe(404);
    });

    it("rejects a loop with 400 and doesn't write", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroductionGraph.mockResolvedValue(graph({ accountEdges: [intro(1, 2), intro(2, 3)] }));
      const res = await agent.post("/api/introductions").send({ introducerAccountId: 3, introducedAccountId: 1 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/loop/);
      expect(mockStorage.createIntroduction).not.toHaveBeenCalled();
    });

    it("returns 409 for a duplicate", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.createIntroduction.mockResolvedValue(null);
      const res = await agent.post("/api/introductions").send({ introducerAccountId: 1, introducedAccountId: 2 });
      expect(res.status).toBe(409);
    });

    it("creates an introduction", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntity.mockResolvedValue(fixtures.entity());
      mockStorage.createIntroduction.mockResolvedValue({ id: 5 });
      const res = await agent.post("/api/introductions")
        .send({ introducerAccountId: 1, introducedEntityId: 200, date: "2026-01-15", notes: "Dinner" });
      expect(res.status).toBe(201);
      expect(mockStorage.createIntroduction).toHaveBeenCalledWith({
        introducerAccountId: 1, introducedEntityId: 200, date: "2026-01-15", notes: "Dinner",
      });
    });
  });

  describe("PATCH /api/introductions/:id", () => {
    it("updates date and notes of a direct introduction", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroduction.mockResolvedValue({ id: 5, viaAccountId: null });
      mockStorage.updateIntroduction.mockResolvedValue({ id: 5, notes: "x" });
      const res = await agent.patch("/api/introductions/5").send({ notes: "x", date: null });
      expect(res.status).toBe(200);
      expect(mockStorage.updateIntroduction).toHaveBeenCalledWith(5, { notes: "x", date: null });
    });

    it("rejects editing an inherited introduction", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroduction.mockResolvedValue({ id: 5, viaAccountId: 2 });
      const res = await agent.patch("/api/introductions/5").send({ notes: "x" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.patch("/api/introductions/5").send({ notes: "x" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/introductions/:id", () => {
    it("removes a direct introduction", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroduction.mockResolvedValue({ id: 5, viaAccountId: null });
      const res = await agent.delete("/api/introductions/5");
      expect(res.status).toBe(200);
      expect(mockStorage.deleteIntroduction).toHaveBeenCalledWith(5);
    });

    it("rejects removing an inherited introduction", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getIntroduction.mockResolvedValue({ id: 5, viaAccountId: 2 });
      const res = await agent.delete("/api/introductions/5");
      expect(res.status).toBe(400);
      expect(mockStorage.deleteIntroduction).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/entities/:id/introductions", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get("/api/entities/200/introductions");
      expect(res.status).toBe(403);
    });

    it("admin lists an entity's introducers", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getEntity.mockResolvedValue(fixtures.entity());
      mockStorage.getIntroductionsForEntity.mockResolvedValue([{ id: 1 }]);
      const res = await agent.get("/api/entities/200/introductions");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1 }]);
    });
  });
});
