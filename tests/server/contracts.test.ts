import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";
import { createPromoterContractSchema } from "@shared/schema";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const concord = {
  agreementUrl: vi.fn(),
  createFromTemplate: vi.fn(),
  getStatus: vi.fn(),
  deleteAgreement: vi.fn(),
};
vi.mock("../../server/concord", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/concord")>();
  return {
    ...actual,
    getConcordClient: (config: unknown) => {
      if (!config) throw new actual.ConcordNotConfiguredError();
      return concord;
    },
  };
});

const { createTestApp } = await import("./setup/test-app");
const { ConcordError } = await import("../../server/concord");
const { buildPromoterContractDraft, formatFeeDetail } = await import("../../server/contracts");

/** What `app_settings` holds for Concord in each test (mutable per test). */
let settings: Record<string, string> = {};
const CONCORD_SETTINGS = {
  concord_org_id: "42",
  concord_promoter_template_id: "tpl",
  concord_promoter_folder_id: "77",
};

const promoterAccount = {
  id: 5, email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", language: "es", nationality: "United Kingdom",
  streetAddress1: "1 Main St", streetAddress2: "", city: "Madrid", stateProvince: "", zipPostalCode: "28001", country: "Spain",
  roles: [],
};

const promoter = (overrides: Record<string, any> = {}) => ({
  id: 3, accountId: 5, active: true, contractDate: null, notes: "",
  account: promoterAccount,
  incentives: [{ id: 1, promoterId: 3, type: "success_fee", percent: "12.50" }],
  introductionCount: 0,
  ...overrides,
});

const contract = (overrides: Record<string, any> = {}) => ({
  id: 9, kind: "promoter_agreement", concordUid: "doc1", title: "Promoter Agreement for Ada Lovelace",
  status: "SIGNING", signers: ["ada@example.com", "admin@test.local"], promoterId: 3, createdByAccountId: 1,
  statusCheckedAt: null, signedAt: null, createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"),
  ...overrides,
});

describe("promoter contract drafts", () => {
  it("prefills the contract in English, and the invitation in the promoter's language", () => {
    const draft = buildPromoterContractDraft(promoterAccount as any, promoter().incentives as any, "us@example.com", true);
    expect(draft.title).toBe("Promoter Agreement for Ada Lovelace");
    expect(draft.subject).toBe("Acuerdo de Promotor para Ada Lovelace");
    expect(draft.message).toBe("Por favor, revisa y firma el acuerdo adjunto.");
    // Template slots: the promoter first, then our Managing Partner.
    expect(draft.signers).toEqual(["ada@example.com", "us@example.com"]);
    expect(draft.variables).toEqual({
      "Beneficiary": "Ada Lovelace",
      "Nationality": "United Kingdom",
      "Address Street": "1 Main St",
      "Address State": "Madrid, 28001",
      "Address Country": "Spain",
      "Email": "ada@example.com",
      "Detail of Fees": "12.5% OF THE SUCCESS FEE",
    });
  });

  it("lists every incentive in Detail of Fees, management fee first, in capitals", () => {
    const incentives = [
      { id: 2, promoterId: 3, type: "success_fee", percent: "10.00" },
      { id: 1, promoterId: 3, type: "management_fee", percent: "25.50" },
    ] as any;
    expect(formatFeeDetail(incentives)).toBe("25.5% OF THE MANAGEMENT FEE; 10% OF THE SUCCESS FEE");
    expect(formatFeeDetail([])).toBe("");
  });

  it("doesn't list the same person twice as signer", () => {
    const draft = buildPromoterContractDraft(promoterAccount as any, [], "ADA@example.com", true);
    expect(draft.signers).toEqual(["ada@example.com"]);
  });

  it("rejects duplicate or invalid signers", () => {
    expect(createPromoterContractSchema.safeParse({ title: "x", signers: ["a@b.co", "A@b.co"] }).success).toBe(false);
    expect(createPromoterContractSchema.safeParse({ title: "x", signers: ["nope"] }).success).toBe(false);
    expect(createPromoterContractSchema.safeParse({ title: "x", signers: [] }).success).toBe(false);
  });
});

describe("Contracts API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    Object.values(concord).forEach(fn => fn.mockReset());
    process.env.CONCORD_API_KEY = "key";
    settings = { ...CONCORD_SETTINGS };
    mockStorage.getAppSettings.mockImplementation(async (keys: string[]) =>
      Object.fromEntries(keys.filter(k => k in settings).map(k => [k, settings[k]])));
    app = await createTestApp();
  });

  afterEach(() => {
    delete process.env.CONCORD_API_KEY;
    Object.assign(process.env, savedEnv);
  });

  async function admin() {
    const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
    mockStorage.getAccount.mockImplementation(async (id: number) =>
      id === promoterAccount.id ? promoterAccount : id === fixtures.adminAccount.id ? fixtures.adminAccount : null);
    return agent;
  }

  it("is admin-only", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    expect((await agent.get("/api/promoters/3/contracts")).status).toBe(403);
    expect((await agent.get("/api/promoters/3/contracts/draft")).status).toBe(403);
    expect((await agent.post("/api/promoters/3/contracts").send({ title: "x", signers: ["a@b.co"] })).status).toBe(403);
    expect((await agent.get("/api/contracts/9")).status).toBe(403);
    expect((await agent.post("/api/contracts/9/refresh")).status).toBe(403);
    expect((await agent.delete("/api/contracts/9")).status).toBe(403);
    expect(concord.createFromTemplate).not.toHaveBeenCalled();
    expect(concord.deleteAgreement).not.toHaveBeenCalled();
  });

  it("lists a promoter's contracts with Concord links", async () => {
    const agent = await admin();
    mockStorage.getPromoter.mockResolvedValue(promoter());
    mockStorage.getContractsForPromoter.mockResolvedValue([contract()]);
    const res = await agent.get("/api/promoters/3/contracts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 9, status: "SIGNING", url: "https://secure.concordnow.com/#/organizations/42/agreements/doc1" });
  });

  describe("GET /api/promoters/:id/contracts/draft", () => {
    it("suggests us (the calling admin) as second signer", async () => {
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      const res = await agent.get("/api/promoters/3/contracts/draft");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ready: true, signers: ["ada@example.com", "admin@test.local"] });
    });

    it("uses the signer from Settings as our signer when set", async () => {
      settings.concord_signer_email = "legal@example.com";
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      const res = await agent.get("/api/promoters/3/contracts/draft");
      expect(res.body.signers).toEqual(["ada@example.com", "legal@example.com"]);
    });

    it("isn't ready without a template", async () => {
      delete settings.concord_promoter_template_id;
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      expect((await agent.get("/api/promoters/3/contracts/draft")).body.ready).toBe(false);
    });
  });

  describe("POST /api/promoters/:id/contracts", () => {
    const body = { title: "Agreement", signers: ["ada@example.com", "admin@test.local"], variables: { Beneficiary: "Ada" }, subject: "Acuerdo", message: "Hola" };

    it("sends the agreement through Concord and records it", async () => {
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      concord.createFromTemplate.mockResolvedValue("doc1");
      mockStorage.createContract.mockImplementation(async (data: any) => contract({ ...data, title: "Agreement" }));
      const res = await agent.post("/api/promoters/3/contracts").send(body);
      expect(res.status).toBe(201);
      expect(concord.createFromTemplate).toHaveBeenCalledWith({
        templateId: "tpl",
        folderId: "77",
        title: "Agreement",
        variables: { Beneficiary: "Ada" },
        signers: ["ada@example.com", "admin@test.local"],
        // Our own signer isn't emailed an invitation.
        invite: { emails: ["ada@example.com"], subject: "Acuerdo", message: "Hola" },
      });
      expect(mockStorage.createContract).toHaveBeenCalledWith(expect.objectContaining({
        kind: "promoter_agreement", concordUid: "doc1", status: "SIGNING", promoterId: 3, createdByAccountId: 1,
      }));
      expect(res.body.concordUid).toBe("doc1");
    });

    it("uses the title as email subject when none is given", async () => {
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      concord.createFromTemplate.mockResolvedValue("doc1");
      mockStorage.createContract.mockImplementation(async (data: any) => contract(data));
      const { subject: _subject, ...rest } = body;
      expect((await agent.post("/api/promoters/3/contracts").send(rest)).status).toBe(201);
      expect(concord.createFromTemplate.mock.calls[0][0].invite.subject).toBe("Agreement");
    });

    it("validates the body", async () => {
      const agent = await admin();
      const res = await agent.post("/api/promoters/3/contracts").send({ title: "", signers: [] });
      expect(res.status).toBe(400);
    });

    it("404s for an unknown promoter", async () => {
      const agent = await admin();
      expect((await agent.post("/api/promoters/3/contracts").send(body)).status).toBe(404);
    });

    it("503s without a template or Concord credentials", async () => {
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      delete settings.concord_promoter_template_id;
      expect((await agent.post("/api/promoters/3/contracts").send(body)).status).toBe(503);
      settings.concord_promoter_template_id = "tpl";
      delete process.env.CONCORD_API_KEY;
      expect((await agent.post("/api/promoters/3/contracts").send(body)).status).toBe(503);
      process.env.CONCORD_API_KEY = "key";
      delete settings.concord_org_id;
      expect((await agent.post("/api/promoters/3/contracts").send(body)).status).toBe(503);
      expect(mockStorage.createContract).not.toHaveBeenCalled();
    });

    it("502s with Concord's reason when it refuses", async () => {
      const agent = await admin();
      mockStorage.getPromoter.mockResolvedValue(promoter());
      concord.createFromTemplate.mockRejectedValue(new ConcordError("Could not create the agreement (Concord answered 404)", 404));
      const res = await agent.post("/api/promoters/3/contracts").send(body);
      expect(res.status).toBe(502);
      expect(res.body.message).toContain("Could not create the agreement");
      expect(mockStorage.createContract).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/contracts/:id/refresh", () => {
    it("updates the status from Concord", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      concord.getStatus.mockResolvedValue({ status: "SIGNING", uid: "doc1" });
      mockStorage.updateContract.mockImplementation(async (_id: number, data: any) => contract(data));
      const res = await agent.post("/api/contracts/9/refresh");
      expect(res.status).toBe(200);
      expect(mockStorage.updateContract).toHaveBeenCalledWith(9, expect.objectContaining({ status: "SIGNING", concordUid: "doc1", signedAt: null }));
      expect(mockStorage.updatePromoter).not.toHaveBeenCalled();
    });

    it("on signature, follows the signed copy and dates the promoter's contract", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      mockStorage.getPromoter.mockResolvedValue(promoter());
      concord.getStatus.mockResolvedValue({ status: "SIGNED", uid: "doc2" });
      mockStorage.updateContract.mockImplementation(async (_id: number, data: any) => contract(data));
      const res = await agent.post("/api/contracts/9/refresh");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "SIGNED", concordUid: "doc2" });
      expect(res.body.signedAt).toBeTruthy();
      expect(mockStorage.updatePromoter).toHaveBeenCalledWith(3, { contractDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    });

    it("keeps a contract date an admin already set", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      mockStorage.getPromoter.mockResolvedValue(promoter({ contractDate: "2026-01-01" }));
      concord.getStatus.mockResolvedValue({ status: "SIGNED", uid: "doc1" });
      mockStorage.updateContract.mockImplementation(async (_id: number, data: any) => contract(data));
      await agent.post("/api/contracts/9/refresh");
      expect(mockStorage.updatePromoter).not.toHaveBeenCalled();
    });

    it("marks contracts Concord no longer has as DELETED", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      concord.getStatus.mockResolvedValue(null);
      mockStorage.updateContract.mockImplementation(async (_id: number, data: any) => contract(data));
      expect((await agent.post("/api/contracts/9/refresh")).body.status).toBe("DELETED");
    });

    it("404s for an unknown contract", async () => {
      const agent = await admin();
      expect((await agent.post("/api/contracts/9/refresh")).status).toBe(404);
    });
  });

  describe("DELETE /api/contracts/:id", () => {
    it("deletes the agreement in Concord, then the record", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      concord.getStatus.mockResolvedValue({ status: "SIGNING", uid: "doc1" });
      const res = await agent.delete("/api/contracts/9");
      expect(res.status).toBe(200);
      expect(concord.deleteAgreement).toHaveBeenCalledWith("doc1");
      expect(mockStorage.deleteContract).toHaveBeenCalledWith(9);
    });

    it("refuses signed contracts, even if we hadn't noticed the signature yet", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract({ status: "SIGNING" }));
      concord.getStatus.mockResolvedValue({ status: "SIGNED", uid: "doc2" });
      const res = await agent.delete("/api/contracts/9");
      expect(res.status).toBe(409);
      expect(concord.deleteAgreement).not.toHaveBeenCalled();
      expect(mockStorage.deleteContract).not.toHaveBeenCalled();
      expect(mockStorage.updateContract).toHaveBeenCalledWith(9, expect.objectContaining({ status: "SIGNED", concordUid: "doc2" }));
    });

    it("just drops the record when Concord no longer has it", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract({ status: "DELETED" }));
      concord.getStatus.mockResolvedValue(null);
      expect((await agent.delete("/api/contracts/9")).status).toBe(200);
      expect(concord.deleteAgreement).not.toHaveBeenCalled();
      expect(mockStorage.deleteContract).toHaveBeenCalledWith(9);
    });

    it("keeps the record when Concord fails", async () => {
      const agent = await admin();
      mockStorage.getContract.mockResolvedValue(contract());
      concord.getStatus.mockResolvedValue({ status: "SIGNING", uid: "doc1" });
      concord.deleteAgreement.mockRejectedValue(new ConcordError("Could not trash the agreement (Concord answered 500)", 500));
      expect((await agent.delete("/api/contracts/9")).status).toBe(502);
      expect(mockStorage.deleteContract).not.toHaveBeenCalled();
    });
  });

  describe("Concord settings", () => {
    it("are admin-only", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      expect((await agent.get("/api/settings/concord")).status).toBe(403);
      expect((await agent.patch("/api/settings/concord").send({ orgId: "1" })).status).toBe(403);
      expect(mockStorage.setAppSettings).not.toHaveBeenCalled();
    });

    it("returns the stored values, defaults and whether the API key is set (never the key)", async () => {
      const agent = await admin();
      const res = await agent.get("/api/settings/concord");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        orgId: "42", apiUrl: "", appUrl: "", signerEmail: "",
        promoterTemplateId: "tpl", promoterFolderId: "77",
        apiKeySet: true,
        defaultApiUrl: "https://api.concordnow.com/api/rest/1",
        defaultAppUrl: "https://secure.concordnow.com/#",
      });
      delete process.env.CONCORD_API_KEY;
      expect((await agent.get("/api/settings/concord")).body.apiKeySet).toBe(false);
    });

    it("saves only the fields sent, trimmed; empty clears", async () => {
      const agent = await admin();
      mockStorage.setAppSettings.mockImplementation(async (values: Record<string, string>) => { Object.assign(settings, values); });
      const res = await agent.patch("/api/settings/concord").send({ signerEmail: " legal@example.com ", promoterFolderId: "" });
      expect(res.status).toBe(200);
      expect(mockStorage.setAppSettings).toHaveBeenCalledWith({ concord_signer_email: "legal@example.com", concord_promoter_folder_id: "" });
      expect(res.body).toMatchObject({ orgId: "42", signerEmail: "legal@example.com", promoterFolderId: "" });
    });

    it("validates emails, URLs and unknown fields", async () => {
      const agent = await admin();
      expect((await agent.patch("/api/settings/concord").send({ signerEmail: "nope" })).status).toBe(400);
      expect((await agent.patch("/api/settings/concord").send({ apiUrl: "ftp://x" })).status).toBe(400);
      expect((await agent.patch("/api/settings/concord").send({ apiKey: "secret" })).status).toBe(400);
      expect(mockStorage.setAppSettings).not.toHaveBeenCalled();
    });
  });
});
