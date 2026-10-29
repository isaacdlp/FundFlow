import { useState } from "react";

export type SortDirection = "asc" | "desc";
export type SortValue = string | number | boolean | Date | null | undefined;
export type SortAccessors<T, K extends string> = Record<K, (item: T) => SortValue>;
export interface SortState<K extends string> { key: K; direction: SortDirection }

// Accent- and case-insensitive, numeric-aware ("Vehicle 2" < "Vehicle 10")
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function isEmpty(v: SortValue): v is null | undefined | "" {
  return v === null || v === undefined || v === "" || (v instanceof Date && isNaN(v.getTime()));
}

// Empty values always sort last, whatever the direction
export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  let cmp: number;
  if (typeof a === "string" && typeof b === "string") cmp = collator.compare(a, b);
  else {
    const x = a instanceof Date ? a.getTime() : Number(a);
    const y = b instanceof Date ? b.getTime() : Number(b);
    cmp = x - y;
  }
  return direction === "asc" ? cmp : -cmp;
}

export function sortItems<T, K extends string>(
  items: readonly T[], accessors: SortAccessors<T, K>, sort: SortState<K> | null,
): T[] {
  if (!sort) return [...items];
  const get = accessors[sort.key];
  // Array.prototype.sort is stable, so ties keep their incoming order
  return [...items].sort((a, b) => compareSortValues(get(a), get(b), sort.direction));
}

export interface SortControl<K extends string> { sort: SortState<K> | null; toggle: (key: K) => void }

/** Clicking a column sorts it ascending; clicking the active column again flips the direction. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> {
  return current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
}

/** Just the sort state, for views that sort several lists (or nested rows) with it via `sortItems`. */
export function useSortState<K extends string>(initial: SortState<K> | null = null): SortControl<K> {
  const [sort, setSort] = useState<SortState<K> | null>(initial);
  return { sort, toggle: (key: K) => setSort((s) => nextSort(s, key)) };
}

/** Lists start sorted ascending by their first accessor, which should be the first column. */
export function defaultSort<K extends string>(accessors: Record<K, unknown>): SortState<K> | null {
  const first = Object.keys(accessors)[0] as K | undefined;
  return first ? { key: first, direction: "asc" } : null;
}

/**
 * Client-side column sorting for a list. Pair with
 * `<SortableTableHead control={…} column="key">` for the headers.
 * Declare `accessors` in column order: the first one is the default sort
 * (pass `initial` to override it, or `null` to keep the incoming order).
 */
export function useSort<T, K extends string>(
  items: readonly T[] | undefined,
  accessors: SortAccessors<T, K>,
  initial: SortState<K> | null = defaultSort(accessors),
) {
  const control = useSortState(initial);
  const sorted = items ? sortItems(items, accessors, control.sort) : [];
  return { ...control, sorted };
}
