/**
 * Development dataset: a snapshot of one organization (its people, entities and
 * a chosen set of SPVs) exported from a running FundFlow instance through the
 * REST API, and imported into a local development database.
 *
 * IDs in the snapshot are the source instance's IDs and are only used as
 * references between records; the importer assigns fresh IDs locally.
 * Tax IDs and bank account/routing numbers are blanked on export.
 */

export interface DevAccount {
  ref: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthdate: string | null;
  nationality: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  language: string;
  profileComplete: boolean | null;
  isAdmin: boolean;
}

export interface DevEntity {
  ref: number;
  fields: Record<string, unknown>;
  managers: number[];
  owners: { ownerType: string; accountRef: number | null; entityRef: number | null; ownershipPercent: string | null }[];
}

export interface DevSpvMember {
  accountRef: number | null;
  entityRef: number | null;
  committed: string | null;
  managementFee: string | null;
  otherFee: string | null;
  carry: string | null;
  totalCalled: string | null;
  distributed: string | null;
  ownershipPercent: string | null;
  date: string | null;
}

export interface DevSpvAsset {
  companyName: string;
  instrumentType: string;
  purchaseDate: string | null;
  cost: string;
  notes: string | null;
  isDefault: boolean;
  valuations: { date: string; value: string; note: string | null }[];
}

export interface DevSpv {
  fields: Record<string, unknown>;
  managerRef: number | null;
  signatoryRef: number | null;
  members: DevSpvMember[];
  assets: DevSpvAsset[];
}

export interface DevDataset {
  source: string;
  exportedAt: string;
  organization: Record<string, unknown>;
  accounts: DevAccount[];
  organizers: number[];
  members: { accountRef: number; status: string }[];
  entities: DevEntity[];
  spvs: DevSpv[];
}

export const DEFAULT_DEV_ORG_SLUG = "rapid-scale";
export const DEFAULT_DEV_SPVS = ["Kapital", "Kushki", "Modelia"];

// Fields never copied out of the source instance (beyond passwordHash, which
// the API never returns anyway).
const SENSITIVE_FIELDS = ["taxId", "bankAccountNumber", "bankRoutingNumber"];
const SERVER_FIELDS = ["id", "createdAt", "updatedAt"];

function pick(obj: Record<string, any>, omit: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (omit.includes(key)) continue;
    out[key] = SENSITIVE_FIELDS.includes(key) ? "" : value;
  }
  return out;
}

/** True when an SPV's names contain any of the (case-insensitive) patterns. */
export function spvMatches(spv: { displayName?: string; legalName?: string; investmentCompanyName?: string }, patterns: string[]): boolean {
  const haystack = [spv.displayName, spv.legalName, spv.investmentCompanyName].filter(Boolean).join(" ").toLowerCase();
  return patterns.some(p => haystack.includes(p.toLowerCase()));
}

export type ApiGet = (path: string) => Promise<any>;

export async function exportDevData(
  get: ApiGet,
  opts: { source: string; orgSlug?: string; spvPatterns?: string[] },
): Promise<DevDataset> {
  const orgSlug = opts.orgSlug ?? DEFAULT_DEV_ORG_SLUG;
  const patterns = opts.spvPatterns ?? DEFAULT_DEV_SPVS;

  const org = await get(`/api/organizations/by-slug/${encodeURIComponent(orgSlug)}`);
  const orgMembers: any[] = await get(`/api/organizations/${org.id}/members`);
  const allSpvs: any[] = await get(`/api/organizations/${org.id}/spvs`);

  const missing = patterns.filter(p => !allSpvs.some(s => spvMatches(s, [p])));
  if (missing.length) {
    const names = allSpvs.map(s => s.displayName).join(", ");
    throw new Error(`No SPV in "${org.name}" matches: ${missing.join(", ")}. Available: ${names}`);
  }

  const accountRefs = new Set<number>();
  const entityRefs = new Set<number>();
  const organizers: number[] = (org.organizers ?? []).map((o: any) => o.accountId);
  organizers.forEach(id => accountRefs.add(id));
  const members = orgMembers.map(m => ({ accountRef: m.accountId as number, status: m.status as string }));
  members.forEach(m => accountRefs.add(m.accountRef));

  const spvs: DevSpv[] = [];
  for (const spv of allSpvs.filter(s => spvMatches(s, patterns))) {
    const spvMembers: any[] = await get(`/api/spvs/${spv.id}/members`);
    const assets: any[] = await get(`/api/spvs/${spv.id}/assets`);
    const devAssets: DevSpvAsset[] = [];
    for (const asset of assets) {
      const vals: any[] = await get(`/api/spvs/${spv.id}/assets/${asset.id}/valuations`);
      devAssets.push({
        companyName: asset.companyName,
        instrumentType: asset.instrumentType,
        purchaseDate: asset.purchaseDate,
        cost: asset.cost,
        notes: asset.notes,
        isDefault: asset.isDefault,
        valuations: vals.map(v => ({ date: v.date, value: v.value, note: v.note })),
      });
    }

    if (spv.managerId) accountRefs.add(spv.managerId);
    if (spv.signatoryId) accountRefs.add(spv.signatoryId);
    for (const m of spvMembers) {
      if (m.accountId) accountRefs.add(m.accountId);
      if (m.entityId) entityRefs.add(m.entityId);
    }

    spvs.push({
      fields: pick(spv, [...SERVER_FIELDS, "organizationId", "managerId", "signatoryId",
        "manager", "signatory", "memberCount", "organization", "cash", "assetValue", "currentValue"]),
      managerRef: spv.managerId ?? null,
      signatoryRef: spv.signatoryId ?? null,
      members: spvMembers.map(m => ({
        accountRef: m.accountId ?? null,
        entityRef: m.entityId ?? null,
        committed: m.committed,
        managementFee: m.managementFee,
        otherFee: m.otherFee,
        carry: m.carry,
        totalCalled: m.totalCalled,
        distributed: m.distributed,
        ownershipPercent: m.ownershipPercent,
        date: m.date,
      })),
      assets: devAssets,
    });
  }

  // Walk entity ownership so nested owner entities (and their people) come along.
  const entities: DevEntity[] = [];
  const queue = Array.from(entityRefs);
  const seen = new Set<number>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const entity = await get(`/api/entities/${id}`);
    const owners: any[] = await get(`/api/entities/${id}/owners`);
    const managers: any[] = await get(`/api/entities/${id}/managers`);
    for (const o of owners) {
      if (o.ownerAccountId) accountRefs.add(o.ownerAccountId);
      if (o.ownerEntityId) queue.push(o.ownerEntityId);
    }
    managers.forEach(m => accountRefs.add(m.accountId));
    entities.push({
      ref: id,
      fields: pick(entity, [...SERVER_FIELDS, "managers", "ownerCount"]),
      managers: managers.map(m => m.accountId),
      owners: owners.map(o => ({
        ownerType: o.ownerType,
        accountRef: o.ownerAccountId ?? null,
        entityRef: o.ownerEntityId ?? null,
        ownershipPercent: o.ownershipPercent,
      })),
    });
  }

  const accounts: DevAccount[] = [];
  for (const id of Array.from(accountRefs).sort((a, b) => a - b)) {
    const a = await get(`/api/accounts/${id}`);
    accounts.push({
      ref: a.id,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      birthdate: a.birthdate,
      nationality: a.nationality ?? null,
      streetAddress1: a.streetAddress1,
      streetAddress2: a.streetAddress2,
      country: a.country,
      city: a.city,
      stateProvince: a.stateProvince,
      zipPostalCode: a.zipPostalCode,
      language: a.language ?? "en",
      profileComplete: a.profileComplete,
      isAdmin: (a.roles ?? []).some((r: any) => r.name === "admin"),
    });
  }

  return {
    source: opts.source,
    exportedAt: new Date().toISOString(),
    organization: pick(org, [...SERVER_FIELDS, "organizers"]),
    accounts,
    organizers,
    members,
    entities,
    spvs,
  };
}

/** Writes records into the target database and returns the new IDs. */
export interface DevDataSink {
  /** Returns the ID of an existing account with this email, if any. */
  findAccountByEmail(email: string): Promise<number | undefined>;
  insertAccount(account: Omit<DevAccount, "ref" | "isAdmin">): Promise<number>;
  grantAdmin(accountId: number): Promise<void>;
  insertOrganization(fields: Record<string, unknown>): Promise<number>;
  addOrganizer(organizationId: number, accountId: number): Promise<void>;
  addMember(organizationId: number, accountId: number, status: string): Promise<void>;
  insertEntity(fields: Record<string, unknown>): Promise<number>;
  addEntityManager(entityId: number, accountId: number): Promise<void>;
  addEntityOwner(entityId: number, owner: { ownerType: string; ownerAccountId: number | null; ownerEntityId: number | null; ownershipPercent: string | null }): Promise<void>;
  insertSpv(fields: Record<string, unknown>): Promise<number>;
  insertSpvMember(spvId: number, member: Omit<DevSpvMember, "accountRef" | "entityRef"> & { accountId: number | null; entityId: number | null }): Promise<void>;
  insertSpvAsset(spvId: number, asset: Omit<DevSpvAsset, "valuations">): Promise<number>;
  insertValuation(assetId: number, valuation: { date: string; value: string; note: string | null }): Promise<void>;
}

export interface DevImportResult {
  accountsCreated: number;
  accountsReused: number;
  entities: number;
  spvs: number;
  spvMembers: number;
}

export async function importDevData(data: DevDataset, sink: DevDataSink): Promise<DevImportResult> {
  const result: DevImportResult = { accountsCreated: 0, accountsReused: 0, entities: 0, spvs: 0, spvMembers: 0 };

  const accountIds = new Map<number, number>();
  for (const { ref, isAdmin, ...account } of data.accounts) {
    const existing = await sink.findAccountByEmail(account.email);
    if (existing !== undefined) {
      accountIds.set(ref, existing);
      result.accountsReused++;
      continue;
    }
    const id = await sink.insertAccount(account);
    if (isAdmin) await sink.grantAdmin(id);
    accountIds.set(ref, id);
    result.accountsCreated++;
  }
  const account = (ref: number | null) => {
    if (ref === null) return null;
    const id = accountIds.get(ref);
    if (id === undefined) throw new Error(`Dataset references unknown account ${ref}`);
    return id;
  };

  const orgId = await sink.insertOrganization(data.organization);
  for (const ref of data.organizers) await sink.addOrganizer(orgId, account(ref)!);
  for (const m of data.members) await sink.addMember(orgId, account(m.accountRef)!, m.status);

  // Insert every entity before linking owners, since owners may be entities too.
  const entityIds = new Map<number, number>();
  for (const e of data.entities) {
    entityIds.set(e.ref, await sink.insertEntity(e.fields));
    result.entities++;
  }
  const entity = (ref: number | null) => {
    if (ref === null) return null;
    const id = entityIds.get(ref);
    if (id === undefined) throw new Error(`Dataset references unknown entity ${ref}`);
    return id;
  };
  for (const e of data.entities) {
    const id = entity(e.ref)!;
    for (const m of e.managers) await sink.addEntityManager(id, account(m)!);
    for (const o of e.owners) {
      await sink.addEntityOwner(id, {
        ownerType: o.ownerType,
        ownerAccountId: account(o.accountRef),
        ownerEntityId: entity(o.entityRef),
        ownershipPercent: o.ownershipPercent,
      });
    }
  }

  for (const spv of data.spvs) {
    const spvId = await sink.insertSpv({
      ...spv.fields,
      organizationId: orgId,
      managerId: account(spv.managerRef),
      signatoryId: account(spv.signatoryRef),
    });
    result.spvs++;
    for (const { accountRef, entityRef, ...investment } of spv.members) {
      await sink.insertSpvMember(spvId, { ...investment, accountId: account(accountRef), entityId: entity(entityRef) });
      result.spvMembers++;
    }
    for (const { valuations, ...asset } of spv.assets) {
      const assetId = await sink.insertSpvAsset(spvId, asset);
      for (const v of valuations) await sink.insertValuation(assetId, v);
    }
  }

  return result;
}
