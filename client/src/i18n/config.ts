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
    detection: {
      order: ["path", "localStorage", "navigator", "htmlTag"],
      lookupFromPathIndex: 0,
      caches: ["localStorage"],
      lookupLocalStorage: "fundflow:lang",
    },
  });

export type { Locale };
export default i18n;
