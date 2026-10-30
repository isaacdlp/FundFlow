import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  sendAccountSetupEmail: vi.fn().mockResolvedValue(true),
  sendRegistrationEmail: vi.fn().mockResolvedValue(true),
}));

const { createTestApp } = await import("./setup/test-app");
const { sendWelcomeEmail, sendAccountSetupEmail } = await import("../../server/email");
const { buildPromoterContractDraft } = await import("../../server/contracts");

const managed = { ...fixtures.memberAccount, id: 50, email: null, firstName: "Vanessa", lastName: "M" };
const manager = { ...fixtures.memberAccount, id: 51, email: "manager@test.local" };
const managerDelegation = (over = {}) => ({
  id: 9, principalAccountId: 50, principalEntityId: null, delegateAccountId: 51, level: "manager",
  delegate: { id: 51, email: "manager@test.local", firstName: "Man", lastName: "Ager" }, ...over,
});

describe("Managed accounts", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    vi.mocked(sendWelcomeEmail).mockClear();
    vi.mocked(sendAccountSetupEmail).mockClear();
    app = await createTestApp();
  });

  describe("POST /api/accounts", () => {
    const body = { firstName: "Vanessa", lastName: "M", email: "" };

    it("requires a manager", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post("/api/accounts").send(body);
      expect(res.status).toBe(400);
      expect(mockStorage.createAccount).not.toHaveBeenCalled();
    });

    it("refuses a password", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.post("/api/accounts").send({ ...body, password: "secret123", managerAccountIds: [51] });
      expect(res.status).toBe(400);
    });

    it("refuses a manager who can't log in", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      const res = await agent.post("/api/accounts").send({ ...body, managerAccountIds: [50] });
      expect(res.status).toBe(400);
    });

    it("creates it with a null email and sends nothing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 51 ? manager : fixtures.adminAccount);
      mockStorage.createAccount.mockResolvedValue(managed);
      const res = await agent.post("/api/accounts").send({ ...body, managerAccountIds: [51] });
      expect(res.status).toBe(201);
      expect(res.body.welcomeEmail).toBe("skipped");
      expect(mockStorage.createAccount.mock.calls[0][0]).toMatchObject({ email: null, managerAccountIds: [51] });
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
      expect(sendAccountSetupEmail).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/accounts/:id", () => {
    it("a delegate manager can't add an email", async () => {
      const agent = await loginAs(app, mockStorage, manager);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : manager);
      mockStorage.getDelegatorsOf.mockResolvedValue([{ accountId: 50, level: "manager" }]);
      mockStorage.updateAccount.mockResolvedValue(managed);
      const res = await agent.patch("/api/accounts/50").send({ email: "in@test.local", phone: "1" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateAccount.mock.calls[0][1]).toEqual({ phone: "1" });
      expect(sendAccountSetupEmail).not.toHaveBeenCalled();
    });

    it("an admin adding an email sends the setup link", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      mockStorage.updateAccount.mockResolvedValue({ ...managed, email: "in@test.local" });
      mockStorage.createPasswordResetToken.mockResolvedValue("tok");
      const res = await agent.patch("/api/accounts/50").send({ email: "in@test.local" });
      expect(res.status).toBe(200);
      expect(res.body.welcomeEmail).toBe("sent");
      expect(sendAccountSetupEmail).toHaveBeenCalled();
    });

    it("an admin can't clear an email without a manager", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 60 ? { ...manager, id: 60 } : fixtures.adminAccount);
      const res = await agent.patch("/api/accounts/60").send({ email: "" });
      expect(res.status).toBe(409);
      expect(mockStorage.updateAccount).not.toHaveBeenCalled();
    });

    it("an admin can clear an email with a manager", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 60 ? { ...manager, id: 60 } : fixtures.adminAccount);
      mockStorage.getDelegationsForAccount.mockResolvedValue({ delegatedIn: [], delegatedOut: [managerDelegation()] });
      mockStorage.updateAccount.mockResolvedValue({ ...manager, id: 60, email: null });
      const res = await agent.patch("/api/accounts/60").send({ email: "" });
      expect(res.status).toBe(200);
      expect(mockStorage.updateAccount.mock.calls[0][1].email).toBeNull();
    });

    it("refuses setting a password", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      const res = await agent.patch("/api/accounts/50").send({ password: "secret123" });
      expect(res.status).toBe(400);
    });
  });

  describe("keeping a manager", () => {
    beforeEach(() => {
      mockStorage.getDelegation.mockResolvedValue(managerDelegation());
      mockStorage.getDelegationsForAccount.mockResolvedValue({ delegatedIn: [], delegatedOut: [managerDelegation()] });
    });

    it("refuses removing the last one", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      const res = await agent.delete("/api/delegations/9");
      expect(res.status).toBe(409);
    });

    it("refuses downgrading the last one", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      const res = await agent.patch("/api/delegations/9").send({ level: "observer" });
      expect(res.status).toBe(409);
    });

    it("refuses deleting the account of the last one", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
      mockStorage.getDelegatorsOf.mockResolvedValue([{ accountId: 50, level: "manager" }]);
      const res = await agent.delete("/api/accounts/51");
      expect(res.status).toBe(409);
      expect(mockStorage.deleteAccount).not.toHaveBeenCalled();
    });

    it("doesn't apply to an account with an email", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? { ...managed, email: "own@test.local" } : fixtures.adminAccount);
      mockStorage.deleteDelegation.mockResolvedValue(true);
      const res = await agent.delete("/api/delegations/9");
      expect(res.status).toBe(200);
    });
  });

  it("a managed delegate doesn't count as an entity's remaining manager", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getDelegation.mockResolvedValue(managerDelegation({ principalAccountId: null, principalEntityId: 70 }));
    mockStorage.getDelegationsForEntity.mockResolvedValue([
      managerDelegation({ principalAccountId: null, principalEntityId: 70 }),
      managerDelegation({ id: 10, principalAccountId: null, principalEntityId: 70, delegateAccountId: 50, delegate: { id: 50, email: null, firstName: "V", lastName: "M" } }),
    ]);
    const res = await agent.delete("/api/delegations/9");
    expect(res.status).toBe(409);
  });

  it("GET /api/accounts/:id names the managers", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getAccount.mockImplementation(async (id: number) => id === 50 ? managed : fixtures.adminAccount);
    mockStorage.getDelegationsForAccount.mockResolvedValue({ delegatedIn: [], delegatedOut: [managerDelegation()] });
    const res = await agent.get("/api/accounts/50");
    expect(res.body.email).toBeNull();
    expect(res.body.managedBy).toEqual([{ id: 51, firstName: "Man", lastName: "Ager" }]);
  });

  it("the contract draft goes to the manager's email", async () => {
    const draft = buildPromoterContractDraft(managed as any, [], "us@example.com", true, "manager@test.local");
    expect(draft.signers).toEqual(["manager@test.local", "us@example.com"]);
    expect(draft.variables.Email).toBe("manager@test.local");
  });
});
