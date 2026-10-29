import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_PAGE_SIZE, pageCount, paginate, usePagination } from "@/hooks/use-pagination";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("paginate", () => {
  it("slices the requested page and clamps out-of-range pages", () => {
    expect(paginate(range(60), 25, 0).items).toEqual(range(25));
    expect(paginate(range(60), 25, 2)).toEqual({ items: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59], page: 2 });
    expect(paginate(range(60), 25, 9).page).toBe(2);
    expect(paginate(range(60), 25, -1).page).toBe(0);
    expect(paginate([], 25, 3)).toEqual({ items: [], page: 0 });
  });

  it("returns everything for 'all'", () => {
    expect(paginate(range(130), "all", 4)).toEqual({ items: range(130), page: 0 });
  });
});

describe("pageCount", () => {
  it("is at least 1", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(500, "all")).toBe(1);
  });
});

describe("usePagination", () => {
  it("defaults to 50 per page", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    const { result } = renderHook(() => usePagination(range(120)));
    expect(result.current.items).toEqual(range(50));
    expect(result.current.control).toMatchObject({ page: 0, pageSize: 50, total: 120, pageCount: 3 });
  });

  it("changes page, and goes back to the first page when the size changes", () => {
    const { result } = renderHook(() => usePagination(range(120)));
    act(() => result.current.control.setPage(2));
    expect(result.current.items).toEqual(range(120).slice(100));
    act(() => result.current.control.setPageSize(25));
    expect(result.current.control).toMatchObject({ page: 0, pageSize: 25, pageCount: 5 });
    act(() => result.current.control.setPageSize("all"));
    expect(result.current.items).toHaveLength(120);
  });

  it("goes back to the first page when resetOn changes, keeping the size", () => {
    const { result, rerender } = renderHook(({ q }) => usePagination(range(120), [q]), { initialProps: { q: "" } });
    act(() => result.current.control.setPageSize(25));
    act(() => result.current.control.setPage(3));
    rerender({ q: "" });
    expect(result.current.control.page).toBe(3);
    rerender({ q: "ana" });
    expect(result.current.control).toMatchObject({ page: 0, pageSize: 25 });
  });

  it("clamps to the last page when the list shrinks", () => {
    const { result, rerender } = renderHook(({ n }) => usePagination(range(n)), { initialProps: { n: 120 } });
    act(() => result.current.control.setPage(2));
    rerender({ n: 60 });
    expect(result.current.control.page).toBe(1);
    expect(result.current.items).toEqual(range(60).slice(50));
  });
});

describe("pagination translations", () => {
  it("has every pagination string in es and fr", () => {
    const expected = Object.keys(en.pagination).sort();
    expect(Object.keys(es.pagination).sort()).toEqual(expected);
    expect(Object.keys(fr.pagination).sort()).toEqual(expected);
  });
});
