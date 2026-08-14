export const LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The `resetPassword` entry of client/src/i18n/routes.ts ROUTE_PATTERNS, shared so the
 * server can build correctly-localized reset-password links without duplicating it. */
export const RESET_PASSWORD_PATHS: Record<Locale, string> = {
  en: "/reset-password",
  es: "/restablecer-contrasena",
  fr: "/reinitialiser-mot-de-passe",
};
