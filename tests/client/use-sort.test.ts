import { describe, it, expect } from "vitest";
import { compareSortValues, defaultSort, nextSort, sortItems } from "@/hooks/use-sort";

describe("compareSortValues", () => {
  it("compares strings ignoring case and accents, numbers within strings numerically", () => {
    expect(compareSortValues("álvaro", "Bea", "asc")).toBeLessThan(0);
    expect(compareSortValues("José", "jose", "asc")).toBe(0);
    expect(compareSortValues("SPV 2", "SPV 10", "asc")).toBeLessThan(0);
  });

  it("compares numbers, booleans and dates", () => {
    expect(compareSortValues(2, 10, "asc")).toBeLessThan(0);
    expect(compareSortValues(false, true, "asc")).toBeLessThan(0);
    expect(compareSortValues(new Date("2026-01-02"), new Date("2025-12-31"), "asc")).toBeGreaterThan(0);
  });

  it("inverts for desc", () => {
    expect(compareSortValues(1, 2, "desc")).toBeGreaterThan(0);
  });

  it("puts empty values last in both directions", () => {
    for (const dir of ["asc", "desc"] as const) {
      expect(compareSortValues(null, "a", dir)).toBeGreaterThan(0);
      expect(compareSortValues("", 1, dir)).toBeGreaterThan(0);
      expect(compareSortValues(1, undefined, dir)).toBeLessThan(0);
      expect(compareSortValues(new Date("nope"), new Date(), dir)).toBeGreaterThan(0);
      expect(compareSortValues(null, undefined, dir)).toBe(0);
    }
  });
});

describe("sortItems", () => {
  const rows = [
    { id: 1, name: "Carla", n: 3 },
    { id: 2, name: "ana", n: null },
    { id: 3, name: "Bruno", n: 1 },
    { id: 4, name: "Ana", n: 2 },
  ];
  const accessors = { name: (r: typeof rows[number]) => r.name, n: (r: typeof rows[number]) => r.n };
  const ids = (xs: typeof rows) => xs.map((r) => r.id);

  it("keeps the incoming order when unsorted, without mutating the input", () => {
    const out = sortItems(rows, accessors, null);
    expect(ids(out)).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(rows);
  });

  it("sorts asc/desc by the chosen column, stable on ties", () => {
    expect(ids(sortItems(rows, accessors, { key: "name", direction: "asc" }))).toEqual([2, 4, 3, 1]);
    expect(ids(sortItems(rows, accessors, { key: "name", direction: "desc" }))).toEqual([1, 3, 2, 4]);
    expect(ids(sortItems(rows, accessors, { key: "n", direction: "desc" }))).toEqual([1, 4, 3, 2]);
    expect(ids(rows)).toEqual([1, 2, 3, 4]);
  });
});

describe("nextSort", () => {
  it("starts a new column ascending and flips the active one", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort({ key: "name", direction: "desc" }, "email")).toEqual({ key: "email", direction: "asc" });
  });
});

describe("defaultSort", () => {
  it("sorts ascending by the first accessor", () => {
    expect(defaultSort({ name: () => "", email: () => "" })).toEqual({ key: "name", direction: "asc" });
    expect(defaultSort({})).toBeNull();
  });
});
