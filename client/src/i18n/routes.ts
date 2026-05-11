export const LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { native: string; short: string }> = {
  en: { native: "English", short: "EN" },
  es: { native: "Español", short: "ES" },
  fr: { native: "Français", short: "FR" },
};

/**
 * Canonical route keys → per-locale path patterns.
 * Patterns are wouter-style with ":param" placeholders.
 * The empty string under each locale would mean "root" within the locale prefix.
 *
 * IMPORTANT: order matters for matching — most-specific paths first when used in <Switch>.
 */
export type RouteKey =
  | "dashboard"
  | "accounts"
  | "accountNew"
  | "accountDetail"
  | "organizations"
  | "organizationNew"
  | "organizationSpvNew"
  | "organizationDetail"
  | "spvs"
  | "spvDetail"
  | "entities"
  | "entityNew"
  | "entityDetail"
  | "documents"
  | "settings"
  | "settingsDocuments"
  | "settingsManagement"
  | "settingsApiTokens"
  | "forgotPassword"
  | "resetPassword"
  | "orgLanding";

export const ROUTE_PATTERNS: Record<RouteKey, Record<Locale, string>> = {
  dashboard:           { en: "/",                                es: "/",                                fr: "/" },
  accounts:            { en: "/accounts",                        es: "/cuentas",                         fr: "/comptes" },
  accountNew:          { en: "/accounts/new",                    es: "/cuentas/nuevo",                   fr: "/comptes/nouveau" },
  accountDetail:       { en: "/accounts/:id",                    es: "/cuentas/:id",                     fr: "/comptes/:id" },
  organizations:       { en: "/organizations",                   es: "/organizaciones",                  fr: "/organisations" },
  organizationNew:     { en: "/organizations/new",               es: "/organizaciones/nueva",            fr: "/organisations/nouvelle" },
  organizationSpvNew:  { en: "/organizations/:orgId/spvs/new",   es: "/organizaciones/:orgId/spvs/nuevo", fr: "/organisations/:orgId/spvs/nouveau" },
  organizationDetail:  { en: "/organizations/:id",               es: "/organizaciones/:id",              fr: "/organisations/:id" },
  spvs:                { en: "/spvs",                            es: "/spvs",                            fr: "/spvs" },
  spvDetail:           { en: "/spvs/:id",                        es: "/spvs/:id",                        fr: "/spvs/:id" },
  entities:            { en: "/entities",                        es: "/entidades",                       fr: "/entites" },
  entityNew:           { en: "/entities/new",                    es: "/entidades/nueva",                 fr: "/entites/nouvelle" },
  entityDetail:        { en: "/entities/:id",                    es: "/entidades/:id",                   fr: "/entites/:id" },
  documents:           { en: "/documents",                       es: "/documentos",                      fr: "/documents" },
  settings:            { en: "/settings",                        es: "/configuracion",                   fr: "/parametres" },
  settingsDocuments:   { en: "/settings/documents",              es: "/configuracion/documentos",        fr: "/parametres/documents" },
  settingsManagement:  { en: "/settings/management",             es: "/configuracion/administracion",    fr: "/parametres/administration" },
  settingsApiTokens:   { en: "/settings/api-tokens",             es: "/configuracion/api-tokens",        fr: "/parametres/api-tokens" },
  forgotPassword:      { en: "/forgot-password",                 es: "/olvide-contrasena",               fr: "/mot-de-passe-oublie" },
  resetPassword:       { en: "/reset-password",                  es: "/restablecer-contrasena",          fr: "/reinitialiser-mot-de-passe" },
  orgLanding:          { en: "/org/:slug",                       es: "/organizacion/:slug",              fr: "/organisation/:slug" },
};
/** Returns the locale prefix in a pathname like "/en/foo" → "en", or null if missing/invalid. */
export function getLocaleFromPath(pathname: string): Locale | null {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  if (!m) return null;
  const seg = m[1];
  return (LOCALES as readonly string[]).includes(seg) ? (seg as Locale) : null;
}

/** Strip the leading "/<locale>" from a pathname, returning the rest (always starts with "/"). */
export function stripLocale(pathname: string): string {
  const loc = getLocaleFromPath(pathname);
  if (!loc) return pathname;
  const rest = pathname.slice(("/" + loc).length);
  return rest.length === 0 ? "/" : rest;
}

/** Build a pathname inside a locale, optionally substituting :param placeholders. */
export function buildPath(
  key: RouteKey,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  let path = ROUTE_PATTERNS[key][locale];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      path = path.replace(`:${k}`, encodeURIComponent(String(v)));
    }
  }
  return path;
}

/** Build a fully-qualified path including the /<locale> prefix. */
export function fullPath(
  key: RouteKey,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const p = buildPath(key, locale, params);
  return p === "/" ? `/${locale}` : `/${locale}${p}`;
}

/** Try to match a locale-stripped path against a known route pattern, return its key + params. */
export function matchRouteKey(
  pathInsideLocale: string,
  locale: Locale,
): { key: RouteKey; params: Record<string, string> } | null {
  const path = pathInsideLocale.split("?")[0];
  for (const key of Object.keys(ROUTE_PATTERNS) as RouteKey[]) {
    const pat = ROUTE_PATTERNS[key][locale];
    const re = new RegExp(
      "^" + pat.replace(/:[a-zA-Z]+/g, "([^/]+)").replace(/\//g, "\\/") + "$",
    );
    const m = path.match(re);
    if (!m) continue;
    const paramNames = (pat.match(/:[a-zA-Z]+/g) ?? []).map(s => s.slice(1));
    const params: Record<string, string> = {};
    paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return { key, params };
  }
  return null;
}

/** Translate a current full URL path (incl. locale prefix and search) into the equivalent in another locale. */
export function translatePath(currentFullPath: string, targetLocale: Locale): string {
  const [pathOnly, search = ""] = currentFullPath.split("?");
  const fromLocale = getLocaleFromPath(pathOnly) ?? DEFAULT_LOCALE;
  if (fromLocale === targetLocale) return currentFullPath;
  const inside = stripLocale(pathOnly);
  const matched = matchRouteKey(inside, fromLocale);
  if (!matched) {
    // Unknown route — keep the same suffix but swap locale prefix.
    const newPath = inside === "/" ? `/${targetLocale}` : `/${targetLocale}${inside}`;
    return search ? `${newPath}?${search}` : newPath;
  }
  const newFull = fullPath(matched.key, targetLocale, matched.params);
  return search ? `${newFull}?${search}` : newFull;
}
