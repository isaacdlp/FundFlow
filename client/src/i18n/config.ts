import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import { LOCALES, DEFAULT_LOCALE, type Locale, getLocaleFromPath } from "./routes";

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
};

const LANG_COOKIE = "fundflow:lang";

export function getLangCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find(c => c.startsWith(LANG_COOKIE + "="));
  if (!match) return null;
  const val = match.split("=")[1];
  return (LOCALES as readonly string[]).includes(val) ? (val as Locale) : null;
}

export function setLangCookie(locale: Locale) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${LANG_COOKIE}=${locale}; expires=${expires}; path=/; SameSite=Lax`;
}

export function expireLangCookie() {
  document.cookie = `${LANG_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

const urlLocale = getLocaleFromPath(typeof window !== "undefined" ? window.location.pathname : "/");

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: urlLocale ?? undefined,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES as unknown as string[],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    // Detection is read-only here (no caching) — language persistence is managed
    // manually via the lang cookie so we control exactly when it is written/cleared.
    detection: {
      order: ["path", "navigator", "htmlTag"],
      lookupFromPathIndex: 0,
      caches: [],
    },
  });

export type { Locale };
export default i18n;
