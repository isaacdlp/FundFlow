import { useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  buildPath,
  fullPath,
  getLocaleFromPath,
  translatePath,
  DEFAULT_LOCALE,
  type Locale,
  type RouteKey,
} from "./routes";

/** Returns the active locale. URL is authoritative; falls back to i18n state. */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  // Subscribe to wouter location changes so consumers re-render on navigation.
  const [path] = useLocation();
  const fromUrl =
    typeof window !== "undefined"
      ? getLocaleFromPath(window.location.pathname)
      : getLocaleFromPath(path);
  if (fromUrl) return fromUrl;
  const lng = (i18n.language || DEFAULT_LOCALE).slice(0, 2);
  if (lng === "es" || lng === "fr") return lng;
  return DEFAULT_LOCALE;
}

/**
 * Returns a localizer that maps a canonical route key (+ params) to a
 * pathname **inside** the current locale (no leading "/<lang>" prefix).
 * Suitable for `<Link href={...}>` because wouter has a base prefix.
 */
export function useLocalePath() {
  const locale = useLocale();
  return useCallback(
    (key: RouteKey, params?: Record<string, string | number>) => buildPath(key, locale, params),
    [locale],
  );
}

/** Returns a localizer that returns the FULL pathname including the /<lang> prefix. */
export function useLocaleFullPath() {
  const locale = useLocale();
  return useCallback(
    (key: RouteKey, params?: Record<string, string | number>) => fullPath(key, locale, params),
    [locale],
  );
}

/** Switch the active language and navigate to the equivalent localized URL. */
export function useSwitchLanguage() {
  const { i18n } = useTranslation();
  const [, navigate] = useLocation();
  return useCallback(
    (target: Locale) => {
      const current = window.location.pathname + window.location.search;
      const newFull = translatePath(current, target);
      i18n.changeLanguage(target);
      try { window.localStorage.setItem("fundflow:lang", target); } catch {}
      // Navigate using the absolute browser path (bypass wouter's base, which is the OLD locale).
      window.history.pushState({}, "", newFull);
      // Force a re-render: wouter listens to popstate; trigger one.
      window.dispatchEvent(new PopStateEvent("popstate"));
      // Avoid unused-var warning for navigate while still importing useLocation.
      void navigate;
    },
    [i18n, navigate],
  );
}

export { getLocaleFromPath, DEFAULT_LOCALE };
