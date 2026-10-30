/**
 * Share classes split a Vehicle into segregated pools. Every Vehicle has at
 * least one class and every position and asset belongs to one, so cash, value
 * and ownership are computed per class. The UI only shows classes once a
 * Vehicle has several (`showsClasses`). Shared by the server (financials,
 * current values) and the client (ownership column).
 */

/** The class every Vehicle is created with (and existing Vehicles were given). */
export const DEFAULT_CLASS_NAME = "Class A";

/** With a single class, a Vehicle is shown as if it had none. */
export const showsClasses = (classCount: number) => classCount > 1;

export interface PoolMember {
  id: number;
  classId: number;
  committed: string | null;
  managementFee: string | null;
  totalCalled: string | null;
  ownershipPercent: string | null;
}

export interface PoolAsset {
  classId: number;
  cost: string | null;
  /** Latest valuation, or cost when never valued. */
  currentValue: string | null;
}

export interface PoolFinancials {
  memberCount: number;
  committed: number;
  totalCalled: number;
  assetCost: number;
  /** Called capital not yet deployed into assets (may be negative). */
  cash: number;
  assetValue: number;
  currentValue: number;
}

const num = (v: string | null | undefined) => {
  const n = parseFloat(v || "0");
  return Number.isFinite(n) ? n : 0;
};

function emptyPool(): PoolFinancials {
  return { memberCount: 0, committed: 0, totalCalled: 0, assetCost: 0, cash: 0, assetValue: 0, currentValue: 0 };
}

/** Financials of each class's pool, keyed by class id. */
export function poolFinancials(members: Pick<PoolMember, "classId" | "committed" | "totalCalled">[], assets: PoolAsset[]): Map<number, PoolFinancials> {
  const pools = new Map<number, PoolFinancials>();
  const pool = (classId: number) => {
    let p = pools.get(classId);
    if (!p) { p = emptyPool(); pools.set(classId, p); }
    return p;
  };
  for (const m of members) {
    const p = pool(m.classId);
    p.memberCount++;
    p.committed += num(m.committed);
    p.totalCalled += num(m.totalCalled);
  }
  for (const a of assets) {
    const p = pool(a.classId);
    p.assetCost += num(a.cost);
    p.assetValue += num(a.currentValue);
  }
  pools.forEach(p => {
    p.cash = p.totalCalled - p.assetCost;
    p.currentValue = p.cash + p.assetValue;
  });
  return pools;
}

/** The Vehicle-wide totals: the sum of its pools. */
export function totalFinancials(pools: Map<number, PoolFinancials>): PoolFinancials {
  const total = emptyPool();
  pools.forEach(p => {
    for (const k of Object.keys(total) as (keyof PoolFinancials)[]) total[k] += p[k];
  });
  return total;
}

/**
 * Each position's share (0–1) of its class pool under the Vehicle's
 * allocation method; null when it can't be determined (an empty pool, or no
 * ownership % under "Custom").
 */
export function memberShares(members: PoolMember[], allocationMethod: string | null | undefined): Record<number, number | null> {
  const method = allocationMethod || "By Commitment";
  const out: Record<number, number | null> = {};
  if (method === "Custom") {
    for (const m of members) {
      const p = m.ownershipPercent != null ? parseFloat(m.ownershipPercent) : NaN;
      out[m.id] = Number.isFinite(p) ? p / 100 : null;
    }
    return out;
  }
  const weight = method === "By Capital Invested"
    ? (m: PoolMember) => Math.max(0, num(m.committed) - num(m.managementFee))
    : (m: PoolMember) => Math.max(0, num(m.committed));
  const totals = new Map<number, number>();
  for (const m of members) totals.set(m.classId, (totals.get(m.classId) ?? 0) + weight(m));
  for (const m of members) {
    const total = totals.get(m.classId)!;
    out[m.id] = total > 0 ? weight(m) / total : null;
  }
  return out;
}

/**
 * The class a new (or moved) position or asset goes into: the requested one,
 * which must be a class of the Vehicle — or, when none is given, the Vehicle's
 * only class (a Vehicle with several needs it stated).
 */
export function resolveClassId(
  classIds: number[],
  requested: unknown,
): { ok: true; classId: number } | { ok: false; error: string } {
  const given = requested !== undefined && requested !== null && requested !== "";
  if (!given) {
    return classIds.length === 1
      ? { ok: true, classId: classIds[0] }
      : { ok: false, error: "classId is required: this Vehicle has several share classes" };
  }
  const id = Number(requested);
  if (!Number.isInteger(id) || !classIds.includes(id)) {
    return { ok: false, error: "classId must be a share class of this Vehicle" };
  }
  return { ok: true, classId: id };
}
