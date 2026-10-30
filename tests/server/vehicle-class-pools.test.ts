import { describe, it, expect } from "vitest";
import { memberShares, poolFinancials, resolveClassId, showsClasses, totalFinancials } from "@shared/vehicle-classes";

const member = (id: number, classId: number, committed: string, extra: Partial<{ managementFee: string; totalCalled: string; ownershipPercent: string | null }> = {}) => ({
  id, classId, committed, managementFee: "0", totalCalled: "0", ownershipPercent: null, ...extra,
});

describe("memberShares", () => {
  it("splits each class's pool separately", () => {
    const shares = memberShares([
      member(1, 10, "100"), member(2, 10, "300"),
      member(3, 20, "50"),
    ], "By Commitment");
    expect(shares).toEqual({ 1: 0.25, 2: 0.75, 3: 1 });
  });

  it("defaults to By Commitment", () => {
    expect(memberShares([member(1, 10, "100"), member(2, 10, "100")], null)).toEqual({ 1: 0.5, 2: 0.5 });
  });

  it("weighs by net capital under By Capital Invested", () => {
    const shares = memberShares([
      member(1, 10, "100", { managementFee: "50" }), member(2, 10, "150"),
    ], "By Capital Invested");
    expect(shares).toEqual({ 1: 0.25, 2: 0.75 });
  });

  it("takes the stated percent under Custom, null when unset", () => {
    const shares = memberShares([member(1, 10, "0", { ownershipPercent: "40" }), member(2, 20, "0")], "Custom");
    expect(shares).toEqual({ 1: 0.4, 2: null });
  });

  it("is null in a pool with nothing committed", () => {
    expect(memberShares([member(1, 10, "0")], "By Commitment")).toEqual({ 1: null });
  });
});

describe("poolFinancials", () => {
  it("keeps each class's cash and assets apart", () => {
    const pools = poolFinancials(
      [member(1, 10, "1000", { totalCalled: "1000" }), member(2, 20, "500", { totalCalled: "500" })],
      [{ classId: 10, cost: "800", currentValue: "1200" }, { classId: 20, cost: "600", currentValue: "600" }],
    );
    expect(pools.get(10)).toMatchObject({ memberCount: 1, cash: 200, assetValue: 1200, currentValue: 1400 });
    // Negative cash stays negative (an over-deployed class), it isn't funded by another class.
    expect(pools.get(20)).toMatchObject({ memberCount: 1, cash: -100, assetValue: 600, currentValue: 500 });
    expect(totalFinancials(pools)).toMatchObject({ memberCount: 2, cash: 100, assetValue: 1800, currentValue: 1900 });
  });

  it("has a pool for a class with assets but no investors", () => {
    const pools = poolFinancials([], [{ classId: 30, cost: "100", currentValue: "150" }]);
    expect(pools.get(30)).toMatchObject({ memberCount: 0, cash: -100, currentValue: 50 });
  });
});

describe("showsClasses", () => {
  it("hides a single class", () => {
    expect(showsClasses(1)).toBe(false);
    expect(showsClasses(2)).toBe(true);
  });
});

describe("resolveClassId", () => {
  it("defaults to the only class", () => {
    expect(resolveClassId([3], undefined)).toEqual({ ok: true, classId: 3 });
    expect(resolveClassId([3], "")).toEqual({ ok: true, classId: 3 });
    expect(resolveClassId([3], 4).ok).toBe(false);
  });

  it("requires one of several classes", () => {
    expect(resolveClassId([3, 4], undefined).ok).toBe(false);
    expect(resolveClassId([3, 4], "4")).toEqual({ ok: true, classId: 4 });
    expect(resolveClassId([3, 4], 5).ok).toBe(false);
    expect(resolveClassId([3, 4], 3.5).ok).toBe(false);
  });
});
