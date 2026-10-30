import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn(), sendWelcomeEmail: vi.fn(), sendAccountSetupEmail: vi.fn(), sendRegistrationEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

const secret = { kycUrl: "https://kyc.example/1", notes: "private", taxFormUrl: "https://concord.example/1" };
const entity = fixtures.entity({ id: 200, kycUrl: secret.kycUrl, taxFormUrl: secret.taxFormUrl, accreditation: "6", bankName: "Bank" });

describe("Admin-only profile fields", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("admins receive KYC, notes and the Concord link on accounts", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getAccount.mockImplementation(async (id: number) => id === 2 ? { ...fixtures.memberAccount, ...secret } : fixtures.adminAccount);
    const res = await agent.get("/api/accounts/2");
    expect(res.body).toMatchObject(secret);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("the account's owner doesn't", async () => {
    const own = { ...fixtures.memberAccount, ...secret, accreditation: "1" };
    const agent = await loginAs(app, mockStorage, own);
    for (const url of ["/api/accounts/2", "/api/auth/me"]) {
      const res = await agent.get(url);
      expect(res.status).toBe(200);
      expect(res.body.accreditation).toBe("1");
      for (const field of Object.keys(secret)) expect(res.body[field]).toBeUndefined();
    }
    const list = await agent.get("/api/accounts");
    for (const field of Object.keys(secret)) expect(list.body[0][field]).toBeUndefined();
  });

  it("an owner's PATCH can't set them, and its response doesn't reveal them", async () => {
    const own = { ...fixtures.memberAccount, ...secret };
    const agent = await loginAs(app, mockStorage, own);
    mockStorage.updateAccount.mockResolvedValue(own);
    const res = await agent.patch("/api/accounts/2").send({
      kycUrl: "x", notes: "x", accreditation: "9", qualification: "9", taxFormUrl: "x", taxFormDocumentId: 5, code: "AAAAAAAA", phone: "1",
    });
    expect(res.status).toBe(200);
    expect(mockStorage.updateAccount.mock.calls[0][1]).toEqual({ phone: "1" });
    for (const field of Object.keys(secret)) expect(res.body[field]).toBeUndefined();
  });

  it("an entity's manager doesn't receive them", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    mockStorage.getEntityIdsForAccount.mockResolvedValue([200]);
    mockStorage.getEntity.mockResolvedValue(entity);
    mockStorage.getAllEntities.mockResolvedValue([entity]);
    const one = await agent.get("/api/entities/200");
    expect(one.body.bankName).toBe("Bank");
    expect(one.body.kycUrl).toBeUndefined();
    expect(one.body.taxFormUrl).toBeUndefined();
    const list = await agent.get("/api/entities");
    expect(list.body[0].kycUrl).toBeUndefined();
  });

  it("an entity's manager can change its bank, but not its credentials", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    mockStorage.getEntityIdsForAccount.mockResolvedValue([200]);
    mockStorage.updateEntity.mockResolvedValue(entity);
    const res = await agent.patch("/api/entities/200").send({ bankName: "New", accreditation: "9", kycUrl: "x", code: "AAAAAAAA" });
    expect(res.status).toBe(200);
    expect(mockStorage.updateEntity.mock.calls[0][1]).toEqual({ bankName: "New" });
    expect(res.body.kycUrl).toBeUndefined();
  });

  it("the tax form must be one of the profile's own documents", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getAccount.mockImplementation(async (id: number) => id === 2 ? fixtures.memberAccount : fixtures.adminAccount);
    mockStorage.getDocumentOwner.mockResolvedValue({ accountId: 3, entityId: null });
    expect((await agent.patch("/api/accounts/2").send({ taxFormDocumentId: 7 })).status).toBe(400);
    mockStorage.getDocumentOwner.mockResolvedValue({ accountId: 2, entityId: null });
    mockStorage.updateAccount.mockResolvedValue(fixtures.memberAccount);
    expect((await agent.patch("/api/accounts/2").send({ taxFormDocumentId: 7 })).status).toBe(200);

    mockStorage.getDocumentOwner.mockResolvedValue({ accountId: 2, entityId: null });
    expect((await agent.patch("/api/entities/200").send({ taxFormDocumentId: 7 })).status).toBe(400);
  });

  it("an entity can't be disregarded to itself", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    expect((await agent.patch("/api/entities/200").send({ disregardedToEntityId: 200 })).status).toBe(400);
  });
});

describe("Name-only owners", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("accepts a name up to 25%", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.addEntityOwner.mockResolvedValue({ id: 1 });
    const res = await agent.post("/api/entities/200/owners").send({ ownerType: "person", ownerName: " Ada L ", ownershipPercent: "25" });
    expect(res.status).toBe(201);
    expect(mockStorage.addEntityOwner).toHaveBeenCalledWith(200, "person", null, null, "25", "Ada L");
  });

  it("refuses a name above 25%, or no name", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    expect((await agent.post("/api/entities/200/owners").send({ ownerType: "person", ownerName: "Ada", ownershipPercent: "25.01" })).status).toBe(400);
    expect((await agent.post("/api/entities/200/owners").send({ ownerType: "person", ownerName: "  ", ownershipPercent: "5" })).status).toBe(400);
    expect(mockStorage.addEntityOwner).not.toHaveBeenCalled();
  });

  it("linking to an account is admin-only", async () => {
    const member = await loginAs(app, mockStorage, fixtures.memberAccount);
    expect((await member.patch("/api/entities/200/owners/1").send({ ownerAccountId: 2 })).status).toBe(403);
    expect(mockStorage.linkEntityOwnerToAccount).not.toHaveBeenCalled();
  });

  it("an admin links them, and only name-only owners", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.linkEntityOwnerToAccount.mockResolvedValue({ id: 1, ownerType: "account", ownerAccountId: 2 });
    expect((await agent.patch("/api/entities/200/owners/1").send({ ownerAccountId: 2 })).status).toBe(200);
    expect(mockStorage.linkEntityOwnerToAccount).toHaveBeenCalledWith(1, 2);
    mockStorage.linkEntityOwnerToAccount.mockResolvedValue(undefined);
    expect((await agent.patch("/api/entities/200/owners/2").send({ ownerAccountId: 2 })).status).toBe(404);
  });
});
