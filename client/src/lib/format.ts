// Maps app locale codes to BCP 47 tags for number/date formatting.
export const LOCALE_TO_BCP: Record<string, string> = { en: "en-US", es: "es-ES", fr: "fr-FR" };

/** Formats an amount with 2 decimals using the app locale's separators. */
export function fmtMoney(n: number, locale: string): string {
  return n.toLocaleString(LOCALE_TO_BCP[locale] || locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
