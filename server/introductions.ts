/**
 * Introduction graph rules (pure — no DB access, so they can be unit-tested).
 *
 * Accounts introduce accounts and entities. Account→account introductions
 * must never form a loop: if A introduced B and B introduced C, C can't
 * introduce A or B. An entity is treated as an extension of its managers, so
 * an account can't be credited for introducing an entity managed by itself or
 * by anyone it was (directly or indirectly) introduced by.
 *
 * Entities also inherit their managers' introducers: if X introduced M, every
 * entity M manages counts as introduced by X. Those inherited rows are
 * derived data — `computeInheritedIntroducers` says what they should be.
 */

export interface IntroductionGraph {
  /** Direct account→account introductions. */
  accountEdges: { introducerAccountId: number; introducedAccountId: number }[];
  /** Direct (not inherited) account→entity introductions. */
  entityEdges: { introducerAccountId: number; introducedEntityId: number }[];
  managers: { entityId: number; accountId: number }[];
}

export type IntroductionProposal =
  | { introducerAccountId: number; introducedAccountId: number; introducedEntityId?: undefined }
  | { introducerAccountId: number; introducedEntityId: number; introducedAccountId?: undefined };

function adjacency(graph: IntroductionGraph, reverse: boolean): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const e of graph.accountEdges) {
    const [from, to] = reverse
      ? [e.introducedAccountId, e.introducerAccountId]
      : [e.introducerAccountId, e.introducedAccountId];
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }
  return adj;
}

function reachable(adj: Map<number, number[]>, start: number): Set<number> {
  const seen = new Set<number>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(adj.get(n) ?? []));
  }
  return seen;
}

/** Accounts introduced by `accountId`, directly or indirectly. */
export function descendantsOf(graph: IntroductionGraph, accountId: number): Set<number> {
  return reachable(adjacency(graph, false), accountId);
}

/** Accounts that introduced `accountId`, directly or indirectly. */
export function ancestorsOf(graph: IntroductionGraph, accountId: number): Set<number> {
  return reachable(adjacency(graph, true), accountId);
}

function managersOf(graph: IntroductionGraph, entityId: number): number[] {
  return graph.managers.filter(m => m.entityId === entityId).map(m => m.accountId);
}

/**
 * Returns why `proposal` would break the introduction rules, or null if it's
 * allowed. Duplicates are not checked here (the caller handles those).
 */
export function findIntroductionConflict(graph: IntroductionGraph, proposal: IntroductionProposal): string | null {
  const x = proposal.introducerAccountId;

  if (proposal.introducedEntityId !== undefined) {
    const managers = managersOf(graph, proposal.introducedEntityId);
    if (managers.includes(x)) {
      return "An account cannot introduce an entity it manages";
    }
    const desc = new Set(managers.flatMap(m => Array.from(descendantsOf(graph, m))));
    if (desc.has(x)) {
      return "This would create a loop: the introducer was introduced (directly or indirectly) by a manager of this entity";
    }
    return null;
  }

  const y = proposal.introducedAccountId;
  if (x === y) return "An account cannot introduce itself";
  if (descendantsOf(graph, y).has(x)) {
    return "This would create a loop: the introduced account already introduced the introducer (directly or indirectly)";
  }

  // After adding x→y, everyone in {y}∪desc(y) descends from everyone in
  // {x}∪anc(x). None of the former may have introduced an entity managed by
  // one of the latter.
  const upstream = new Set([x, ...Array.from(ancestorsOf(graph, x))]);
  const downstream = new Set([y, ...Array.from(descendantsOf(graph, y))]);
  for (const e of graph.entityEdges) {
    if (!downstream.has(e.introducerAccountId)) continue;
    if (managersOf(graph, e.introducedEntityId).some(m => upstream.has(m))) {
      return "This would create a loop: the introduced account (or someone it introduced) introduced an entity managed by the introducer (or someone who introduced them)";
    }
  }
  return null;
}

export interface UnavailableIntroductions {
  /** Accounts that may not be added as introducers of this account. */
  introducerAccountIds: number[];
  /** Accounts this account may not be credited with introducing. */
  introducedAccountIds: number[];
  /** Entities this account may not be credited with introducing. */
  introducedEntityIds: number[];
}

/**
 * Everything `findIntroductionConflict` would reject for `accountId`, so the
 * UI can leave those choices out. Only nodes that appear in the graph can
 * conflict (besides the account itself), so those are the only candidates.
 */
export function unavailableIntroductions(graph: IntroductionGraph, accountId: number): UnavailableIntroductions {
  const accountIds = new Set<number>([accountId]);
  for (const e of graph.accountEdges) accountIds.add(e.introducerAccountId).add(e.introducedAccountId);
  for (const e of graph.entityEdges) accountIds.add(e.introducerAccountId);
  for (const m of graph.managers) accountIds.add(m.accountId);
  const entityIds = new Set(graph.managers.map(m => m.entityId));

  const ids = Array.from(accountIds);
  return {
    introducerAccountIds: ids.filter(c =>
      findIntroductionConflict(graph, { introducerAccountId: c, introducedAccountId: accountId }) !== null),
    introducedAccountIds: ids.filter(c =>
      findIntroductionConflict(graph, { introducerAccountId: accountId, introducedAccountId: c }) !== null),
    introducedEntityIds: Array.from(entityIds).filter(c =>
      findIntroductionConflict(graph, { introducerAccountId: accountId, introducedEntityId: c }) !== null),
  };
}

/**
 * The inherited introducers an entity should have: every direct introducer of
 * each of its managers, except managers themselves and accounts that already
 * introduced the entity directly. Maps introducer id → the managing account
 * the credit flows through (the first manager found, if several qualify).
 */
export function computeInheritedIntroducers(graph: IntroductionGraph, entityId: number): Map<number, number> {
  const managers = managersOf(graph, entityId);
  const direct = new Set(
    graph.entityEdges.filter(e => e.introducedEntityId === entityId).map(e => e.introducerAccountId),
  );
  const result = new Map<number, number>();
  for (const m of managers) {
    for (const e of graph.accountEdges) {
      if (e.introducedAccountId !== m) continue;
      const x = e.introducerAccountId;
      if (managers.includes(x) || direct.has(x) || result.has(x)) continue;
      result.set(x, m);
    }
  }
  return result;
}
