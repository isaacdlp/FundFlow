import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Organization members: active, member since and entities", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("an admin sets a member's active flag and join date", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.updateMemberFees.mockResolvedValue({ id: 1, active: false });
    const res = await agent.patch("/api/organizations/1/members/2").send({ active: false, memberSince: "2024-03-01" });
    expect(res.status).toBe(200);
    expect(mockStorage.updateMemberFees).toHaveBeenCalledWith(1, 2, expect.objectContaining({ active: false, memberSince: "2024-03-01" }));
  });

  it("a plain member can't", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
    expect((await agent.patch("/api/organizations/1/members/2").send({ active: false })).status).toBe(403);
    expect((await agent.get("/api/organizations/1/entity-members")).status).toBe(403);
    expect((await agent.put("/api/organizations/1/entity-members/200").send({ active: false })).status).toBe(403);
    expect((await agent.delete("/api/organizations/1/entity-members/200")).status).toBe(403);
    expect(mockStorage.saveEntityMember).not.toHaveBeenCalled();
  });

  it("saves an entity's terms", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getEntity.mockResolvedValue(fixtures.entity({ id: 200 }));
    mockStorage.saveEntityMember.mockResolvedValue({ id: 1, entityId: 200 });
    const res = await agent.put("/api/organizations/1/entity-members/200")
      .send({ active: false, memberSince: "", managementFeePercent: 3, successFeePercent: null });
    expect(res.status).toBe(200);
    expect(mockStorage.saveEntityMember).toHaveBeenCalledWith(1, 200,
      { active: false, memberSince: null, managementFeePercent: "3.00", successFeePercent: null });
  });

  it("refuses an unknown entity or a bad fee", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getEntity.mockResolvedValue(undefined);
    expect((await agent.put("/api/organizations/1/entity-members/999").send({})).status).toBe(404);
    expect((await agent.put("/api/organizations/1/entity-members/200").send({ managementFeePercent: 101 })).status).toBe(400);
  });

  it("removes one, or 404s", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.removeEntityMember.mockResolvedValue(true);
    expect((await agent.delete("/api/organizations/1/entity-members/200")).status).toBe(200);
    mockStorage.removeEntityMember.mockResolvedValue(false);
    expect((await agent.delete("/api/organizations/1/entity-members/200")).status).toBe(404);
  });
});
