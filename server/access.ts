import { storage } from "./storage";
import type { DelegationLevel } from "@shared/schema";

/**
 * Delegation-aware access. A delegate acts for their principals: an observer
 * reads what the principal can read, a manager may also change what the
 * principal can change. Delegation is not transitive, and it covers the
 * principal's own data (account, entities, investments, documents) — never
 * their organizer powers or admin role.
 *
 * Entities only act through their delegates: any delegation lets the account
 * read the entity, a manager-level one lets it change the entity. An account
 * delegate reaches the entities its principal reaches, at the lower of the
 * two levels.
 */

export type AccountAccess = "self" | DelegationLevel;

/** Accounts `accountId` may act as: itself, then its principals (manager level only for "write"). */
export async function actingAccountIds(accountId: number, mode: "read" | "write" = "read"): Promise<number[]> {
  const delegators = await storage.getDelegatorsOf(accountId);
  const principals = delegators.filter(d => mode === "read" || d.level === "manager").map(d => d.accountId);
  return [accountId, ...principals.filter(id => id !== accountId)];
}

/** How `accountId` may reach `targetId`'s account: as itself, as a delegate, or not at all. */
export async function accessToAccount(accountId: number, targetId: number): Promise<AccountAccess | null> {
  if (accountId === targetId) return "self";
  const delegation = (await storage.getDelegatorsOf(accountId)).find(d => d.accountId === targetId);
  return delegation?.level ?? null;
}

async function union(accountIds: number[], of: (id: number) => Promise<number[]>): Promise<number[]> {
  const lists = await Promise.all(accountIds.map(of));
  return Array.from(new Set(lists.flat()));
}

/**
 * Entities that delegated to any of the accounts — at any level, or only as
 * manager (`"write"`: what changing an entity requires).
 */
export function delegatedEntityIdsOf(accountIds: number[], mode: "read" | "write" = "read"): Promise<number[]> {
  return union(accountIds, id => storage.getEntityIdsForAccount(id, mode === "write" ? "manager" : "observer"));
}

/** How `accountId` may reach the entity, itself or through an account that delegated to it. */
export async function accessToEntity(accountId: number, entityId: number): Promise<DelegationLevel | null> {
  if ((await delegatedEntityIdsOf(await actingAccountIds(accountId, "write"), "write")).includes(entityId)) return "manager";
  if ((await delegatedEntityIdsOf(await actingAccountIds(accountId))).includes(entityId)) return "observer";
  return null;
}

/** Entities owned (directly or through other entities) by any of the accounts. */
export function ownedEntityIdsOf(accountIds: number[]): Promise<number[]> {
  return union(accountIds, id => storage.getEntityIdsOwnedByAccount(id));
}

/** Vehicles any of the accounts invests in, directly or through owned/managed entities. */
export function vehicleIdsOf(accountIds: number[]): Promise<number[]> {
  return union(accountIds, id => storage.getVehicleIdsForAccount(id));
}
