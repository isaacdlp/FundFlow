import { useState } from "react";

export const PAGE_SIZES = [25, 50, 100, "all"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export function pageCount(total: number, size: PageSize): number {
  return size === "all" ? 1 : Math.max(1, Math.ceil(total / size));
}

/** The slice of `items` on `page` (0-based, clamped to the last page). */
export function paginate<T>(items: readonly T[], size: PageSize, page: number): { items: T[]; page: number } {
  if (size === "all") return { items: [...items], page: 0 };
  const p = Math.min(Math.max(0, page), pageCount(items.length, size) - 1);
  return { items: items.slice(p * size, (p + 1) * size), page: p };
}

export interface PaginationControl {
  page: number;
  pageSize: PageSize;
  total: number;
  pageCount: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
}

/**
 * Client-side pagination for a list (50 per page by default; 25, 100 or all).
 * Pass whatever changes the list's contents or order (search, sort…) as
 * `resetOn`: when it changes, the list goes back to the first page.
 * Pair with `<ListPagination control={…} />` below the list.
 */
export function usePagination<T>(items: readonly T[], resetOn: unknown = null) {
  const resetKey = JSON.stringify(resetOn);
  const [pageSize, setSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [state, setState] = useState({ page: 0, resetKey });
  const requested = state.resetKey === resetKey ? state.page : 0;
  const { items: pageItems, page } = paginate(items, pageSize, requested);
  const control: PaginationControl = {
    page,
    pageSize,
    total: items.length,
    pageCount: pageCount(items.length, pageSize),
    setPage: (p) => setState({ page: p, resetKey }),
    setPageSize: (size) => {
      setSize(size);
      setState({ page: 0, resetKey });
    },
  };
  return { items: pageItems, control };
}
