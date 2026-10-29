import { describe, it, expect } from "vitest";
import { exportDevData, importDevData, spvMatches, type DevDataSink } from "../../server/dev-data";

const account = (id: number, email: string, extra: Record<string, unknown> = {}) => ({
  id, email, firstName: `First${id}`, lastName: `Last${id}`, phone: "", birthdate: null, nationality: "Spain",
  taxId: "123-45-6789", streetAddress1: "", streetAddress2: "", country: "", city: "",
  stateProvince: "", zipPostalCode: "", language: "es", profileComplete: true, roles: [], ...extra,
});

// A small source instance: org 3 with SPVs Kapital C (account + entity investor),
// Modelia (one investor) and an unrelated SPV that must not be exported.
const api: Record<string, unknown> = {
  "/api/organizations/by-slug/rapid-scale": {
    id: 3, name: "Rapid Scale", slug: "rapid-scale", description: "d", createdAt: "x", updatedAt: "x",
    organizers: [{ id: 1, accountId: 10, organizationId: 3 }],
  },
  "/api/organizations/3/members": [{ accountId: 11, status: "approved" }, { accountId: 12, status: "pending" }],
  "/api/organizations/3/spvs": [
    { id: 50, displayName: "Kapital C", legalName: "RS Kapital C LLC", managerId: 10, signatoryId: null,
      bankAccountNumber: "999", currency: "USD", dateEstablished: "2024-01-01", memberCount: 2, cash: "0", currentValue: "0" },
    { id: 51, displayName: "Modelia", legalName: "RS Modelia", managerId: 10, signatoryId: 10, currency: "EUR", dateEstablished: "2025-02-01" },
    { id: 52, displayName: "Other", legalName: "Other LLC", managerId: 99, signatoryId: null, currency: "USD", dateEstablished: "2025-02-01" },
  ],
  "/api/spvs/50/members": [
    { id: 1, accountId: 11, entityId: null, committed: "1000.00", totalCalled: "1000.00", date: "2024-02-01" },
    { id: 2, accountId: null, entityId: 70, committed: "5000.00", totalCalled: "2500.00", date: "2024-03-01" },
  ],
  "/api/spvs/50/assets": [{ id: 80, companyName: "Kapital", instrumentType: "Equity", cost: "3500.00", isDefault: true, purchaseDate: null, notes: "" }],
  "/api/spvs/50/assets/80/valuations": [{ id: 1, date: "2025-01-01", value: "7000.00", note: "Series B" }],
  "/api/spvs/51/members": [{ id: 3, accountId: 12, entityId: null, committed: "200.00", date: "2025-03-01" }],
  "/api/spvs/51/assets": [],
  "/api/entities/70": { id: 70, name: "Family Trust", entityType: "Trust", taxId: "98-7654321", managers: [], ownerCount: 1 },
  "/api/entities/70/owners": [{ ownerType: "entity", ownerAccountId: null, ownerEntityId: 71, ownershipPercent: "100.0000" }],
  "/api/entities/70/managers": [{ accountId: 13 }],
  "/api/entities/71": { id: 71, name: "HoldCo", entityType: "LLC", taxId: "" },
  "/api/entities/71/owners": [{ ownerType: "account", ownerAccountId: 14, ownerEntityId: null, ownershipPercent: "100.0000" }],
  "/api/entities/71/managers": [],
  "/api/accounts/10": account(10, "organizer@rs.vc", { roles: [{ name: "admin" }] }),
  "/api/accounts/11": account(11, "lp1@example.com"),
  "/api/accounts/12": account(12, "lp2@example.com"),
  "/api/accounts/13": account(13, "trustee@example.com"),
  "/api/accounts/14": account(14, "owner@example.com"),
};

const get = async (path: string) => {
  if (!(path in api)) throw new Error(`unexpected GET ${path}`);
  return api[path];
};

describe("spvMatches", () => {
  it("matches any name field case-insensitively", () => {
    expect(spvMatches({ displayName: "RS Kushki B1" }, ["kushki"])).toBe(true);
    expect(spvMatches({ displayName: "X", investmentCompanyName: "Modelia SA" }, ["Modelia"])).toBe(true);
    expect(spvMatches({ displayName: "Other" }, ["Kapital", "Kushki"])).toBe(false);
  });
});

describe("exportDevData", () => {
  it("collects the org, matching SPVs and every referenced account and entity", async () => {
    const data = await exportDevData(get, { source: "https://src", spvPatterns: ["Kapital", "Modelia"] });

    expect(data.organization).toMatchObject({ name: "Rapid Scale", slug: "rapid-scale" });
    expect(data.organization).not.toHaveProperty("id");
    expect(data.spvs.map(s => s.fields.displayName)).toEqual(["Kapital C", "Modelia"]);
    expect(data.accounts.map(a => a.ref)).toEqual([10, 11, 12, 13, 14]);
    expect(data.accounts.find(a => a.ref === 10)?.isAdmin).toBe(true);
    expect(data.accounts.find(a => a.ref === 10)?.nationality).toBe("Spain");
    expect(data.entities.map(e => e.ref)).toEqual([70, 71]);
    expect(data.spvs[0].assets[0].valuations).toEqual([{ date: "2025-01-01", value: "7000.00", note: "Series B" }]);
  });

  it("strips tax IDs, bank numbers and derived SPV fields", async () => {
    const data = await exportDevData(get, { source: "s", spvPatterns: ["Kapital"] });
    expect(data.accounts[0]).not.toHaveProperty("taxId");
    expect(data.entities[0].fields.taxId).toBe("");
    expect(data.spvs[0].fields.bankAccountNumber).toBe("");
    for (const key of ["id", "managerId", "memberCount", "cash", "currentValue"]) {
      expect(data.spvs[0].fields).not.toHaveProperty(key);
    }
  });

  it("fails clearly when a requested SPV doesn't exist", async () => {
    await expect(exportDevData(get, { source: "s", spvPatterns: ["Kushki"] })).rejects.toThrow(/Kushki.*Available: Kapital C, Modelia, Other/);
  });
});

describe("importDevData", () => {
  function memorySink(existingEmails: Record<string, number> = {}) {
    let nextId = 1000;
    const log: [string, ...unknown[]][] = [];
    const insert = (kind: string) => async (...args: unknown[]) => { const id = nextId++; log.push([kind, id, ...args]); return id; };
    const record = (kind: string) => async (...args: unknown[]) => { log.push([kind, ...args]); };
    const sink: DevDataSink = {
      findAccountByEmail: async (email) => existingEmails[email],
      insertAccount: insert("account"),
      grantAdmin: record("admin"),
      insertOrganization: insert("org"),
      addOrganizer: record("organizer"),
      addMember: record("member"),
      insertEntity: insert("entity"),
      addEntityManager: record("entityManager"),
      addEntityOwner: record("entityOwner"),
      insertSpv: insert("spv"),
      insertSpvMember: record("spvMember"),
      insertSpvAsset: insert("asset"),
      insertValuation: record("valuation"),
    };
    return { sink, log };
  }

  it("recreates the dataset with remapped IDs, reusing accounts that already exist", async () => {
    const data = await exportDevData(get, { source: "s", spvPatterns: ["Kapital", "Modelia"] });
    const { sink, log } = memorySink({ "organizer@rs.vc": 1 });

    const result = await importDevData(data, sink);

    expect(result).toEqual({ accountsCreated: 4, accountsReused: 1, entities: 2, spvs: 2, spvMembers: 3 });
    // The reused admin isn't re-granted; new account IDs start at 1000.
    expect(log.filter(l => l[0] === "admin")).toEqual([]);
    const idFor = (email: string) => log.find(l => l[0] === "account" && (l[2] as any).email === email)![1];
    const orgId = log.find(l => l[0] === "org")![1];
    expect(log).toContainEqual(["organizer", orgId, 1]);
    expect(log).toContainEqual(["member", orgId, idFor("lp2@example.com"), "pending"]);

    const [trust, holdCo] = log.filter(l => l[0] === "entity").map(l => l[1]);
    expect(log).toContainEqual(["entityOwner", trust, { ownerType: "entity", ownerAccountId: null, ownerEntityId: holdCo, ownershipPercent: "100.0000" }]);
    expect(log).toContainEqual(["entityManager", trust, idFor("trustee@example.com")]);

    const spvInsert = log.find(l => l[0] === "spv")!;
    expect(spvInsert[2]).toMatchObject({ displayName: "Kapital C", organizationId: orgId, managerId: 1, signatoryId: null });
    expect(log).toContainEqual(["spvMember", spvInsert[1], expect.objectContaining({ accountId: null, entityId: trust, committed: "5000.00" })]);
    const assetId = log.find(l => l[0] === "asset")![1];
    expect(log).toContainEqual(["valuation", assetId, { date: "2025-01-01", value: "7000.00", note: "Series B" }]);
  });

  it("grants admin to newly created admin accounts", async () => {
    const data = await exportDevData(get, { source: "s", spvPatterns: ["Modelia"] });
    const { sink, log } = memorySink();
    await importDevData(data, sink);
    const adminId = log.find(l => l[0] === "account" && (l[2] as any).email === "organizer@rs.vc")![1];
    expect(log).toContainEqual(["admin", adminId]);
  });
});
