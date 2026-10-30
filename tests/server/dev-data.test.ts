import { describe, it, expect } from "vitest";
import { exportDevData, importDevData, vehicleMatches, type DevDataSink } from "../../server/dev-data";

const account = (id: number, email: string, extra: Record<string, unknown> = {}) => ({
  id, email, firstName: `First${id}`, lastName: `Last${id}`, phone: "", birthdate: null, nationality: "Spain",
  taxId: "123-45-6789", streetAddress1: "", streetAddress2: "", country: "", city: "",
  stateProvince: "", zipPostalCode: "", language: "es", profileComplete: true, roles: [], ...extra,
});

// A small source instance: org 3 with Vehicles Kapital C (account + entity investor),
// Modelia (one investor) and an unrelated Vehicle that must not be exported.
const api: Record<string, unknown> = {
  "/api/organizations/by-slug/rapid-scale": {
    id: 3, name: "Rapid Scale", slug: "rapid-scale", description: "d", createdAt: "x", updatedAt: "x",
    organizers: [{ id: 1, accountId: 10, organizationId: 3 }],
  },
  "/api/organizations/3/members": [
    { accountId: 11, status: "approved", managementFeePercent: "5.00", successFeePercent: "20.00" },
    { accountId: 12, status: "pending", managementFeePercent: null, successFeePercent: null },
  ],
  "/api/organizations/3/vehicles": [
    { id: 50, displayName: "Kapital C", legalName: "RS Kapital C LLC", managerId: 10, signatoryId: null,
      bankAccountNumber: "999", currency: "USD", dateEstablished: "2024-01-01", memberCount: 2, cash: "0", currentValue: "0" },
    { id: 51, displayName: "Modelia", legalName: "RS Modelia", managerId: 10, signatoryId: 10, currency: "EUR", dateEstablished: "2025-02-01" },
    { id: 52, displayName: "Other", legalName: "Other LLC", managerId: 99, signatoryId: null, currency: "USD", dateEstablished: "2025-02-01" },
  ],
  "/api/vehicles/50/members": [
    { id: 1, accountId: 11, entityId: null, classId: 5, committed: "1000.00", totalCalled: "1000.00", date: "2024-02-01" },
    { id: 2, accountId: null, entityId: 70, classId: 6, committed: "5000.00", totalCalled: "2500.00", date: "2024-03-01" },
  ],
  "/api/vehicles/50/classes": [{ id: 5, name: "Class A", notes: "" }, { id: 6, name: "Class B", notes: "Lead" }],
  "/api/vehicles/50/assets": [{ id: 80, classId: 6, companyName: "Kapital", instrumentType: "Equity", cost: "3500.00", isDefault: true, purchaseDate: null, notes: "" }],
  "/api/vehicles/50/assets/80/valuations": [{ id: 1, date: "2025-01-01", value: "7000.00", note: "Series B" }],
  "/api/vehicles/51/members": [{ id: 3, accountId: 12, entityId: null, committed: "200.00", date: "2025-03-01" }],
  "/api/vehicles/51/classes": [],
  "/api/vehicles/51/assets": [],
  "/api/entities/70": { id: 70, name: "Family Trust", entityType: "Trust", taxId: "98-7654321", managers: [], ownerCount: 1 },
  "/api/entities/70/owners": [{ ownerType: "entity", ownerAccountId: null, ownerEntityId: 71, ownershipPercent: "100.0000" }],
  "/api/entities/70/delegations": [{ delegateAccountId: 13, level: "manager", notes: "trustee" }],
  "/api/entities/71": { id: 71, name: "HoldCo", entityType: "LLC", taxId: "" },
  "/api/entities/71/owners": [{ ownerType: "account", ownerAccountId: 14, ownerEntityId: null, ownershipPercent: "100.0000" }],
  "/api/entities/71/delegations": [],
  "/api/accounts/10": account(10, "organizer@rs.vc", { roles: [{ name: "admin" }] }),
  "/api/accounts/11": account(11, "lp1@example.com", { middleName: "Maria", mailingCity: "Luarca", mailingCountry: "Spain" }),
  "/api/accounts/12": account(12, "lp2@example.com"),
  "/api/accounts/13": account(13, "trustee@example.com"),
  "/api/accounts/14": account(14, "owner@example.com"),
};

const get = async (path: string) => {
  if (!(path in api)) throw new Error(`unexpected GET ${path}`);
  return api[path];
};

describe("vehicleMatches", () => {
  it("matches any name field case-insensitively", () => {
    expect(vehicleMatches({ displayName: "RS Kushki B1" }, ["kushki"])).toBe(true);
    expect(vehicleMatches({ displayName: "X", investmentCompanyName: "Modelia SA" }, ["Modelia"])).toBe(true);
    expect(vehicleMatches({ displayName: "Other" }, ["Kapital", "Kushki"])).toBe(false);
  });
});

describe("exportDevData", () => {
  it("collects the org, matching Vehicles and every referenced account and entity", async () => {
    const data = await exportDevData(get, { source: "https://src", vehiclePatterns: ["Kapital", "Modelia"] });

    expect(data.organization).toMatchObject({ name: "Rapid Scale", slug: "rapid-scale" });
    expect(data.organization).not.toHaveProperty("id");
    expect(data.vehicles.map(s => s.fields.displayName)).toEqual(["Kapital C", "Modelia"]);
    expect(data.accounts.map(a => a.ref)).toEqual([10, 11, 12, 13, 14]);
    expect(data.accounts.find(a => a.ref === 10)?.isAdmin).toBe(true);
    expect(data.accounts.find(a => a.ref === 10)?.nationality).toBe("Spain");
    expect(data.accounts.find(a => a.ref === 11)).toMatchObject({ middleName: "Maria", mailingCity: "Luarca", mailingCountry: "Spain", mailingStreetAddress1: null });
    expect(data.entities.map(e => e.ref)).toEqual([70, 71]);
    expect(data.vehicles[0].assets[0].valuations).toEqual([{ date: "2025-01-01", value: "7000.00", note: "Series B" }]);
  });

  it("strips tax IDs, bank numbers and derived Vehicle fields", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Kapital"] });
    expect(data.accounts[0]).not.toHaveProperty("taxId");
    expect(data.entities[0].fields.taxId).toBe("");
    expect(data.vehicles[0].fields.bankAccountNumber).toBe("");
    for (const key of ["id", "managerId", "memberCount", "cash", "currentValue"]) {
      expect(data.vehicles[0].fields).not.toHaveProperty(key);
    }
  });

  it("fails clearly when a requested Vehicle doesn't exist", async () => {
    await expect(exportDevData(get, { source: "s", vehiclePatterns: ["Kushki"] })).rejects.toThrow(/Kushki.*Available: Kapital C, Modelia, Other/);
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
      addEntityDelegation: record("entityDelegation"),
      addEntityOwner: record("entityOwner"),
      insertVehicle: insert("vehicle"),
      insertVehicleClass: insert("class"),
      insertVehicleMember: record("vehicleMember"),
      insertVehicleAsset: insert("asset"),
      insertValuation: record("valuation"),
    };
    return { sink, log };
  }

  it("recreates the dataset with remapped IDs, reusing accounts that already exist", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Kapital", "Modelia"] });
    const { sink, log } = memorySink({ "organizer@rs.vc": 1 });

    const result = await importDevData(data, sink);

    expect(result).toEqual({ accountsCreated: 4, accountsReused: 1, entities: 2, vehicles: 2, vehicleMembers: 3 });
    // The reused admin isn't re-granted; new account IDs start at 1000.
    expect(log.filter(l => l[0] === "admin")).toEqual([]);
    const idFor = (email: string) => log.find(l => l[0] === "account" && (l[2] as any).email === email)![1];
    const orgId = log.find(l => l[0] === "org")![1];
    expect(log).toContainEqual(["organizer", orgId, 1]);
    expect(log).toContainEqual(["member", orgId, idFor("lp2@example.com"), "pending", { managementFeePercent: null, successFeePercent: null }]);
    expect(log).toContainEqual(["member", orgId, idFor("lp1@example.com"), "approved", { managementFeePercent: "5.00", successFeePercent: "20.00" }]);

    const [trust, holdCo] = log.filter(l => l[0] === "entity").map(l => l[1]);
    expect(log).toContainEqual(["entityOwner", trust, { ownerType: "entity", ownerAccountId: null, ownerEntityId: holdCo, ownershipPercent: "100.0000" }]);
    expect(log).toContainEqual(["entityDelegation", trust, { accountId: idFor("trustee@example.com"), level: "manager", notes: "trustee" }]);

    const vehicleInsert = log.find(l => l[0] === "vehicle")!;
    expect(vehicleInsert[2]).toMatchObject({ displayName: "Kapital C", organizationId: orgId, managerId: 1, signatoryId: null });
    expect(log).toContainEqual(["vehicleMember", vehicleInsert[1], expect.objectContaining({ accountId: null, entityId: trust, committed: "5000.00" })]);
    const assetId = log.find(l => l[0] === "asset")![1];
    expect(log).toContainEqual(["valuation", assetId, { date: "2025-01-01", value: "7000.00", note: "Series B" }]);
  });

  it("recreates share classes and puts positions and assets back in them", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Kapital"] });
    const { sink, log } = memorySink();
    await importDevData(data, sink);
    const vehicleId = log.find(l => l[0] === "vehicle")![1];
    const [classA, classB] = log.filter(l => l[0] === "class");
    expect(classA.slice(2)).toEqual([vehicleId, { name: "Class A", notes: "" }]);
    expect(classB.slice(2)).toEqual([vehicleId, { name: "Class B", notes: "Lead" }]);
    expect(log).toContainEqual(["vehicleMember", vehicleId, expect.objectContaining({ committed: "1000.00", classId: classA[1] })]);
    expect(log).toContainEqual(["vehicleMember", vehicleId, expect.objectContaining({ committed: "5000.00", classId: classB[1] })]);
    expect(log.find(l => l[0] === "asset")![3]).toMatchObject({ companyName: "Kapital", classId: classB[1] });
  });

  it("gives the Vehicles of a snapshot taken before share classes the default class", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Kapital"] });
    for (const v of data.vehicles) {
      delete v.classes;
      for (const m of v.members) delete m.classRef;
      for (const a of v.assets) delete a.classRef;
    }
    const { sink, log } = memorySink();
    await importDevData(data, sink);
    const classes = log.filter(l => l[0] === "class");
    expect(classes).toHaveLength(1);
    expect(classes[0][3]).toEqual({ name: "Class A", notes: null });
    const classId = classes[0][1];
    expect(log.filter(l => l[0] === "vehicleMember").every(l => (l[2] as any).classId === classId)).toBe(true);
    expect(log.find(l => l[0] === "asset")![3]).toMatchObject({ classId });
  });

  it("exports from an instance that predates share classes", async () => {
    const old = async (path: string) => {
      if (path.endsWith("/classes")) throw new Error("404");
      return get(path);
    };
    const data = await exportDevData(old, { source: "s", vehiclePatterns: ["Kapital"] });
    expect(data.vehicles[0].classes).toEqual([]);
  });

  it("treats the managers of a snapshot taken before delegations as manager-level delegates", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Kapital"] });
    const trust = data.entities.find(e => e.ref === 70)!;
    delete trust.delegations;
    trust.managers = [13];
    const { sink, log } = memorySink();
    await importDevData(data, sink);
    const trustId = log.find(l => l[0] === "entity")![1];
    const trusteeId = log.find(l => l[0] === "account" && (l[2] as any).email === "trustee@example.com")![1];
    expect(log).toContainEqual(["entityDelegation", trustId, { accountId: trusteeId, level: "manager", notes: null }]);
  });

  it("grants admin to newly created admin accounts", async () => {
    const data = await exportDevData(get, { source: "s", vehiclePatterns: ["Modelia"] });
    const { sink, log } = memorySink();
    await importDevData(data, sink);
    const adminId = log.find(l => l[0] === "account" && (l[2] as any).email === "organizer@rs.vc")![1];
    expect(log).toContainEqual(["admin", adminId]);
  });
});
