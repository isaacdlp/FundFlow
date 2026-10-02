import type { Express, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { db, storage } from "./storage";
import { currencies, exchangeRates, spvs, updateCurrencySchema } from "@shared/schema";

// Known currency catalog. USD and EUR start active per the initial rollout;
// the rest are available for an admin to activate later from
// Settings > Currencies without needing a code change.
const CATALOG: { code: string; name: string; symbol: string; active: boolean }[] = [
  { code: "USD", name: "US Dollar", symbol: "$", active: true },
  { code: "EUR", name: "Euro", symbol: "€", active: true },
  { code: "GBP", name: "British Pound", symbol: "£", active: false },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", active: false },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", active: false },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", active: false },
  { code: "AUD", name: "Australian Dollar", symbol: "$", active: false },
];

// SPVs predate ISO-code currencies and stored a decorative label instead
// (e.g. "USD ($)"). Maps those legacy values to the matching code so every
// SPV lands on a valid, consistent value once this feature ships. Anything
// unrecognized is treated as USD, per the product assumption that all
// pre-existing funds are USD-denominated.
const LEGACY_CURRENCY_MAP: Record<string, string> = {
  "USD ($)": "USD",
  "EUR (€)": "EUR",
  "GBP (£)": "GBP",
  "CHF": "CHF",
  "JPY (¥)": "JPY",
  "CAD ($)": "CAD",
  "AUD ($)": "AUD",
};

const FRANKFURTER_URL = "https://api.frankfurter.app/latest";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // refresh a given rate at most once a day
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // but check hourly whether one has gone stale

/**
 * Seeds the currency catalog on first boot and normalizes any pre-ISO-code
 * SPV currency values left over from before this feature existed. Safe to
 * call on every startup — both steps are no-ops once data is already clean.
 */
export async function initCurrencies(): Promise<void> {
  const existing = await db.select().from(currencies);
  if (existing.length === 0) {
    await db.insert(currencies).values(CATALOG);
  }

  const validCodes = new Set((await db.select().from(currencies)).map(c => c.code));
  const allSpvs = await db.select({ id: spvs.id, currency: spvs.currency }).from(spvs);
  for (const s of allSpvs) {
    if (validCodes.has(s.currency)) continue;
    const mapped = LEGACY_CURRENCY_MAP[s.currency] ?? "USD";
    await db.update(spvs).set({ currency: mapped }).where(eq(spvs.id, s.id));
  }
}

async function fetchRateToUsd(code: string): Promise<number | null> {
  if (code === "USD") return 1;
  try {
    const url = `${FRANKFURTER_URL}?from=${encodeURIComponent(code)}&to=USD`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    const rate = json?.rates?.USD;
    return typeof rate === "number" && isFinite(rate) && rate > 0 ? rate : null;
  } catch (e) {
    console.error(`[exchange-rates] failed to fetch rate for ${code}:`, e);
    return null;
  }
}

/**
 * Refreshes the stored exchange rate for every active, non-USD currency
 * whose rate is missing or older than 24h. Pass `force: true` to refresh
 * regardless of staleness (used by the admin "refresh now" action and right
 * after a currency is activated).
 */
export async function refreshExchangeRates(force = false): Promise<void> {
  const active = await db.select().from(currencies).where(eq(currencies.active, true));
  const nonUsd = active.filter(c => c.code !== "USD");
  if (nonUsd.length === 0) return;

  const existingRates = await db.select().from(exchangeRates);
  const rateByCode = new Map(existingRates.map(r => [r.currency, r]));

  for (const c of nonUsd) {
    const existing = rateByCode.get(c.code);
    const staleMs = existing?.updatedAt ? Date.now() - existing.updatedAt.getTime() : Infinity;
    if (!force && existing && staleMs < REFRESH_INTERVAL_MS) continue;

    const rate = await fetchRateToUsd(c.code);
    if (rate === null) {
      console.warn(`[exchange-rates] could not refresh ${c.code}/USD; keeping previous value${existing ? "" : " (none stored yet)"}`);
      continue;
    }
    await db.insert(exchangeRates)
      .values({ currency: c.code, rateToUsd: rate.toFixed(8) })
      .onConflictDoUpdate({ target: exchangeRates.currency, set: { rateToUsd: rate.toFixed(8), updatedAt: new Date() } });
  }
}

/** Kicks off the daily exchange-rate refresh: once immediately, then an hourly staleness check. */
export function startExchangeRateScheduler(): void {
  refreshExchangeRates().catch(e => console.error("[exchange-rates] initial refresh failed:", e));
  setInterval(() => {
    refreshExchangeRates().catch(e => console.error("[exchange-rates] scheduled refresh failed:", e));
  }, CHECK_INTERVAL_MS);
}

function getAuthAccountId(req: Request): number | undefined {
  return (req.session as any).impersonatedAccountId ?? (req.session as any).accountId ?? (req as any).apiAccountId;
}

function isAdminAccount(roles: { name: string }[]): boolean {
  return roles.some(r => r.name === "admin");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getAuthAccountId(req)) return res.status(401).json({ message: "Authentication required" });
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const id = getAuthAccountId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const acc = await storage.getAccount(id);
  if (!acc || !isAdminAccount(acc.roles)) return res.status(403).json({ message: "Admin access required" });
  next();
}

export function registerCurrencyRoutes(app: Express) {
  // Full catalog (active + inactive) — any authenticated user, since both
  // SPV creation and the dashboard's currency dropdown need the active set.
  app.get("/api/currencies", requireAuth, async (_req, res) => {
    const rows = await db.select().from(currencies).orderBy(currencies.code);
    res.json(rows);
  });

  // Toggle a currency active/inactive — admin only. USD is the reporting
  // base currency and the exchange-rate pivot, so it can't be deactivated.
  app.patch("/api/currencies/:code", requireAdmin, async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (code === "USD") {
      return res.status(400).json({ message: "USD is the platform's base currency and cannot be deactivated" });
    }
    try {
      const { active } = updateCurrencySchema.parse(req.body);
      const [row] = await db.update(currencies).set({ active }).where(eq(currencies.code, code)).returning();
      if (!row) return res.status(404).json({ message: "Currency not found" });
      if (active) {
        // Don't make the newly-activated currency wait for the next hourly
        // staleness check before it has a usable rate.
        refreshExchangeRates().catch(e => console.error("[exchange-rates] refresh after activation failed:", e));
      }
      res.json(row);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
  });

  // Latest known rates for every active currency, expressed as USD per unit
  // (USD itself is always 1). Used by the dashboard to consolidate
  // multi-currency investments into a single selected display currency.
  app.get("/api/exchange-rates", requireAuth, async (_req, res) => {
    const rows = await db.select().from(exchangeRates);
    const rates: Record<string, number> = { USD: 1 };
    let updatedAt: string | null = null;
    for (const r of rows) {
      rates[r.currency] = parseFloat(r.rateToUsd);
      const ts = r.updatedAt ? r.updatedAt.toISOString() : null;
      if (ts && (!updatedAt || ts > updatedAt)) updatedAt = ts;
    }
    res.json({ base: "USD", rates, updatedAt });
  });

  // Manual refresh — admin only, mainly for troubleshooting a stale/missing rate.
  app.post("/api/exchange-rates/refresh", requireAdmin, async (_req, res) => {
    await refreshExchangeRates(true);
    const rows = await db.select().from(exchangeRates);
    const rates: Record<string, number> = { USD: 1 };
    let updatedAt: string | null = null;
    for (const r of rows) {
      rates[r.currency] = parseFloat(r.rateToUsd);
      const ts = r.updatedAt ? r.updatedAt.toISOString() : null;
      if (ts && (!updatedAt || ts > updatedAt)) updatedAt = ts;
    }
    res.json({ base: "USD", rates, updatedAt });
  });
}
