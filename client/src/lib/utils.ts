import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// NFD decomposition splits accented chars (e.g. é -> e + combining mark), then strip marks
const COMBINING_MARKS = /[̀-ͯ]/g;
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}
