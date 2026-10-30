/**
 * Development dataset: a snapshot of one organization (its people, entities and
 * a chosen set of Vehicles) exported from a running FundFlow instance through the
 * REST API, and imported into a local development database.
 *
 * IDs in the snapshot are the source instance's IDs and are only used as
 * references between records; the importer assigns fresh IDs locally.
 * Tax IDs and bank account/routing numbers are blanked on export.
 */

import { DEFAULT_CLASS_NAME } from "@shared/vehicle-classes";

export interface DevAccount {
  ref: number;
  email: string;
  firstName: string;
  // Optional: snapshots taken before these fields existed don't have them.
  middleName?: string | null;
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
  mailingStreetAddress1?: string | null;
  mailingStreetAddress2?: string | null;
  mailingCountry?: string | null;
  mailingCity?: string | null;
  mailingStateProvince?: string | null;
  mailingZipPostalCode?: string | null;
  language: string;
  profileComplete: boolean | null;
  isAdmin: boolean;
}

export interface DevEntity {
  ref: number;
  fields: Record<string, unknown>;
  /** Accounts acting for the entity. */
  delegations?: DevEntityDelegation[];
  /** Snapshots taken before delegations: every listed account is a manager. */
  managers?: number[];
  owners: { ownerType: string; accountRef: number | null; entityRef: number | null; ownershipPercent: string | null }[];
}

export interface DevMember {
  accountRef: number;
  status: string;
  /** Default fee percentages; absent in snapshots taken before they existed. */
  managementFeePercent?: string | null;
  successFeePercent?: string | null;
}

export interface DevEntityDelegation {
  accountRef: number;
  level: string;
  notes: string | null;
}

export interface DevVehicleClass {
  ref: number;
  name: string;
  notes: string | null;
}

export interface DevVehicleMember {
  accountRef: number | null;
  entityRef: number | null;
  /** The share class (a DevVehicleClass ref); absent in snapshots taken before classes existed. */
  classRef?: number | null;
  committed: string | null;
  managementFee: string | null;
  otherFee: string | null;
  carry: string | null;
  totalCalled: string | null;
  distributed: string | null;
  ownershipPercent: string | null;
  date: string | null;
}

export interface DevVehicleAsset {
  classRef?: number | null;
  companyName: string;
  instrumentType: string;
  purchaseDate: string | null;
  cost: string;
  notes: string | null;
  isDefault: boolean;
  valuations: { date: string; value: string; note: string | null }[];
}

export interface DevVehicle {
  fields: Record<string, unknown>;
  managerRef: number | null;
  signatoryRef: number | null;
  /** Absent in snapshots taken before share classes existed (seeded with the default class). */
  classes?: DevVehicleClass[];
  members: DevVehicleMember[];
  assets: DevVehicleAsset[];
}

export interface DevDataset {
  source: string;
  exportedAt: string;
  organization: Record<string, unknown>;
  accounts: DevAccount[];
  organizers: number[];
  members: DevMember[];
  entities: DevEntity[];
  vehicles: DevVehicle[];
}

export const DEFAULT_DEV_ORG_SLUG = "rapid-scale";
export const DEFAULT_DEV_VEHICLES = ["Kapital", "Kushki", "Modelia"];

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

/** True when a Vehicle's names contain any of the (case-insensitive) patterns. */
export function vehicleMatches(vehicle: { displayName?: string; legalName?: string; investmentCompanyName?: string }, patterns: string[]): boolean {
  const haystack = [vehicle.displayName, vehicle.legalName, vehicle.investmentCompanyName].filter(Boolean).join(" ").toLowerCase();
  return patterns.some(p => haystack.includes(p.toLowerCase()));
}

export type ApiGet = (path: string) => Promise<any>;

export async function exportDevData(
  get: ApiGet,
  opts: { source: string; orgSlug?: string; vehiclePatterns?: string[] },
): Promise<DevDataset> {
  const orgSlug = opts.orgSlug ?? DEFAULT_DEV_ORG_SLUG;
  const patterns = opts.vehiclePatterns ?? DEFAULT_DEV_VEHICLES;

  const org = await get(`/api/organizations/by-slug/${encodeURIComponent(orgSlug)}`);
  const orgMembers: any[] = await get(`/api/organizations/${org.id}/members`);
  const allVehicles: any[] = await get(`/api/organizations/${org.id}/vehicles`);

  const missing = patterns.filter(p => !allVehicles.some(s => vehicleMatches(s, [p])));
  if (missing.length) {
    const names = allVehicles.map(s => s.displayName).join(", ");
    throw new Error(`No Vehicle in "${org.name}" matches: ${missing.join(", ")}. Available: ${names}`);
  }

  const accountRefs = new Set<number>();
  const entityRefs = new Set<number>();
  const organizers: number[] = (org.organizers ?? []).map((o: any) => o.accountId);
  organizers.forEach(id => accountRefs.add(id));
  const members: DevMember[] = orgMembers.map(m => ({
    accountRef: m.accountId as number,
    status: m.status as string,
    managementFeePercent: m.managementFeePercent ?? null,
    successFeePercent: m.successFeePercent ?? null,
  }));
  members.forEach(m => accountRefs.add(m.accountRef));

  const vehicles: DevVehicle[] = [];
  for (const vehicle of allVehicles.filter(s => vehicleMatches(s, patterns))) {
    const vehicleMembers: any[] = await get(`/api/vehicles/${vehicle.id}/members`);
    // A source instance from before share classes has no such endpoint: its Vehicles get the default class on import.
    const classes: any[] = await get(`/api/vehicles/${vehicle.id}/classes`).catch(() => []);
    const assets: any[] = await get(`/api/vehicles/${vehicle.id}/assets`);
    const devAssets: DevVehicleAsset[] = [];
    for (const asset of assets) {
      const vals: any[] = await get(`/api/vehicles/${vehicle.id}/assets/${asset.id}/valuations`);
      devAssets.push({
        classRef: asset.classId ?? null,
        companyName: asset.companyName,
        instrumentType: asset.instrumentType,
        purchaseDate: asset.purchaseDate,
        cost: asset.cost,
        notes: asset.notes,
        isDefault: asset.isDefault,
        valuations: vals.map(v => ({ date: v.date, value: v.value, note: v.note })),
      });
    }

    if (vehicle.managerId) accountRefs.add(vehicle.managerId);
    if (vehicle.signatoryId) accountRefs.add(vehicle.signatoryId);
    for (const m of vehicleMembers) {
      if (m.accountId) accountRefs.add(m.accountId);
      if (m.entityId) entityRefs.add(m.entityId);
    }

    vehicles.push({
      fields: pick(vehicle, [...SERVER_FIELDS, "organizationId", "managerId", "signatoryId",
        "manager", "signatory", "memberCount", "classCount", "organization", "cash", "assetValue", "currentValue"]),
      managerRef: vehicle.managerId ?? null,
      signatoryRef: vehicle.signatoryId ?? null,
      classes: classes.map(c => ({ ref: c.id, name: c.name, notes: c.notes ?? null })),
      members: vehicleMembers.map(m => ({
        accountRef: m.accountId ?? null,
        entityRef: m.entityId ?? null,
        classRef: m.classId ?? null,
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
    // Instances older than entity delegations only list managers.
    const delegations: any[] = await get(`/api/entities/${id}/delegations`).catch(async () =>
      (await get(`/api/entities/${id}/managers`)).map((m: any) => ({ delegateAccountId: m.accountId, level: "manager", notes: null })));
    for (const o of owners) {
      if (o.ownerAccountId) accountRefs.add(o.ownerAccountId);
      if (o.ownerEntityId) queue.push(o.ownerEntityId);
    }
    delegations.forEach(d => accountRefs.add(d.delegateAccountId));
    entities.push({
      ref: id,
      fields: pick(entity, [...SERVER_FIELDS, "managers", "ownerCount", "access"]),
      delegations: delegations.map(d => ({ accountRef: d.delegateAccountId, level: d.level, notes: d.notes ?? null })),
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
      middleName: a.middleName ?? null,
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
      mailingStreetAddress1: a.mailingStreetAddress1 ?? null,
      mailingStreetAddress2: a.mailingStreetAddress2 ?? null,
      mailingCountry: a.mailingCountry ?? null,
      mailingCity: a.mailingCity ?? null,
      mailingStateProvince: a.mailingStateProvince ?? null,
      mailingZipPostalCode: a.mailingZipPostalCode ?? null,
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
    vehicles,
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
  addMember(organizationId: number, accountId: number, status: string, fees: { managementFeePercent: string | null; successFeePercent: string | null }): Promise<void>;
  insertEntity(fields: Record<string, unknown>): Promise<number>;
  addEntityDelegation(entityId: number, delegation: { accountId: number; level: string; notes: string | null }): Promise<void>;
  addEntityOwner(entityId: number, owner: { ownerType: string; ownerAccountId: number | null; ownerEntityId: number | null; ownershipPercent: string | null }): Promise<void>;
  insertVehicle(fields: Record<string, unknown>): Promise<number>;
  insertVehicleClass(vehicleId: number, cls: { name: string; notes: string | null }): Promise<number>;
  insertVehicleMember(vehicleId: number, member: Omit<DevVehicleMember, "accountRef" | "entityRef" | "classRef"> & { accountId: number | null; entityId: number | null; classId: number }): Promise<void>;
  insertVehicleAsset(vehicleId: number, asset: Omit<DevVehicleAsset, "valuations" | "classRef"> & { classId: number }): Promise<number>;
  insertValuation(assetId: number, valuation: { date: string; value: string; note: string | null }): Promise<void>;
}

export interface DevImportResult {
  accountsCreated: number;
  accountsReused: number;
  entities: number;
  vehicles: number;
  vehicleMembers: number;
}

export async function importDevData(data: DevDataset, sink: DevDataSink): Promise<DevImportResult> {
  const result: DevImportResult = { accountsCreated: 0, accountsReused: 0, entities: 0, vehicles: 0, vehicleMembers: 0 };

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
  for (const m of data.members) {
    await sink.addMember(orgId, account(m.accountRef)!, m.status,
      { managementFeePercent: m.managementFeePercent ?? null, successFeePercent: m.successFeePercent ?? null });
  }

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
    const delegations = e.delegations ?? (e.managers ?? []).map(accountRef => ({ accountRef, level: "manager", notes: null }));
    for (const d of delegations) {
      await sink.addEntityDelegation(id, { accountId: account(d.accountRef)!, level: d.level, notes: d.notes });
    }
    for (const o of e.owners) {
      await sink.addEntityOwner(id, {
        ownerType: o.ownerType,
        ownerAccountId: account(o.accountRef),
        ownerEntityId: entity(o.entityRef),
        ownershipPercent: o.ownershipPercent,
      });
    }
  }

  for (const vehicle of data.vehicles) {
    const vehicleId = await sink.insertVehicle({
      ...vehicle.fields,
      organizationId: orgId,
      managerId: account(vehicle.managerRef),
      signatoryId: account(vehicle.signatoryRef),
    });
    result.vehicles++;
    // Every Vehicle has a class; snapshots taken before classes existed get the default one.
    const classes = vehicle.classes?.length ? vehicle.classes : [{ ref: -1, name: DEFAULT_CLASS_NAME, notes: null }];
    const classIds = new Map<number, number>();
    for (const c of classes) {
      classIds.set(c.ref, await sink.insertVehicleClass(vehicleId, { name: c.name, notes: c.notes }));
    }
    const shareClass = (ref: number | null | undefined) => {
      if (ref === null || ref === undefined) return classIds.get(classes[0].ref)!;
      const id = classIds.get(ref);
      if (id === undefined) throw new Error(`Dataset references unknown share class ${ref}`);
      return id;
    };
    for (const { accountRef, entityRef, classRef, ...investment } of vehicle.members) {
      await sink.insertVehicleMember(vehicleId, { ...investment, accountId: account(accountRef), entityId: entity(entityRef), classId: shareClass(classRef) });
      result.vehicleMembers++;
    }
    for (const { valuations, classRef, ...asset } of vehicle.assets) {
      const assetId = await sink.insertVehicleAsset(vehicleId, { ...asset, classId: shareClass(classRef) });
      for (const v of valuations) await sink.insertValuation(assetId, v);
    }
  }

  return result;
}
