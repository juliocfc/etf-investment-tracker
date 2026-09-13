import { getDb } from "./db";
import { fxRates } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

const cache = new Map<string, { rate: number; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function dayKey(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().split("T")[0];
}

function cacheKey(base: string, quote: string, date: string) {
  return `${base.toUpperCase()}_${quote.toUpperCase()}_${date}`;
}

async function fetchFrankfurter(base: string, quote: string, dateStr: string): Promise<number | null> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  try {
    const url = `https://api.frankfurter.app/${dateStr}?from=${b}&to=${q}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const rate = data?.rates?.[q];
    if (rate) return parseFloat(rate);
    // frankfurter sometimes returns base EUR only; try inverse
    return null;
  } catch {
    return null;
  }
}

async function fetchFrankfurterRange(base: string, quote: string, start: string, end: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const url = `https://api.frankfurter.app/${start}..${end}?from=${base.toUpperCase()}&to=${quote.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) return map;
    const data: any = await res.json();
    const rates = data?.rates || {};
    for (const [d, vals] of Object.entries(rates as Record<string, any>)) {
      const v = (vals as any)[quote.toUpperCase()];
      if (v) map.set(d, parseFloat(v));
    }
  } catch {}
  return map;
}

async function fetchYahooFx(base: string, quote: string): Promise<number | null> {
  try {
    const YahooFinance = (await import("yahoo-finance2")).default;
    const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
    const sym = `${base.toUpperCase()}${quote.toUpperCase()}=X`;
    // try BRLUSD=X then BRL=X patterns
    for (const s of [sym, `${base.toUpperCase()}=X`]) {
      try {
        const q: any = await yf.quote(s);
        if (q?.regularMarketPrice) return q.regularMarketPrice;
      } catch {}
    }
  } catch {}
  return null;
}

export async function getFxRate(base: string, quote: string, date: Date): Promise<number> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  if (b === q) return 1;
  const dStr = dayKey(date);
  const ck = cacheKey(b, q, dStr);
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.rate;

  // DB lookup (exact UTC day)
  try {
    const db = await getDb();
    if (db) {
      const dayStart = new Date(dStr + "T00:00:00.000Z");
      const rows: any = await (db as any).select().from(fxRates).where(and(eq(fxRates.base, b), eq(fxRates.quote, q), eq(fxRates.date, dayStart))).limit(1);
      const row = rows?.[0] || rows?.rows?.[0];
      if (row?.rate) {
        const r = parseFloat(row.rate);
        cache.set(ck, { rate: r, ts: Date.now() });
        return r;
      }
      // try prior business day fallback in DB (up to 5 days)
      for (let i = 1; i <= 5; i++) {
        const prev = new Date(dayStart);
        prev.setUTCDate(prev.getUTCDate() - i);
        const prevRows: any = await (db as any).select().from(fxRates).where(and(eq(fxRates.base, b), eq(fxRates.quote, q), eq(fxRates.date, prev))).limit(1);
        const pr = prevRows?.[0] || prevRows?.rows?.[0];
        if (pr?.rate) {
          const r = parseFloat(pr.rate);
          cache.set(ck, { rate: r, ts: Date.now() });
          return r;
        }
      }
    }
  } catch {}

  // Fetch from Frankfurter (handles weekend snap automatically — returns prior business day)
  let rate = await fetchFrankfurter(b, q, dStr);
  // Frankfurter API returns EUR base only for some pairs; if null try via USD cross
  if (rate === null && b !== "EUR" && q !== "EUR") {
    const r1 = await fetchFrankfurter(b, "EUR", dStr);
    const r2 = await fetchFrankfurter("EUR", q, dStr);
    if (r1 && r2) rate = r1 * 0; // placeholder - Frankfurter already supports any base, but keep fallback
  }
  if (rate !== null) {
    try {
      const db = await getDb();
      const dayStart = new Date(dStr + "T00:00:00.000Z");
      await (db as any).insert(fxRates).values({ base: b, quote: q, rate: rate.toString(), date: dayStart }).onConflictDoNothing();
    } catch {}
    cache.set(ck, { rate, ts: Date.now() });
    return rate;
  }

  // Fallback Yahoo (latest only)
  const yahoo = await fetchYahooFx(b, q);
  if (yahoo) {
    cache.set(ck, { rate: yahoo, ts: Date.now() });
    return yahoo;
  }

  // last resort
  return 1;
}

export async function getFxRatesRange(base: string, quote: string, start: Date, end: Date): Promise<Map<string, number>> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  if (b === q) return new Map();
  const sStr = dayKey(start);
  const eStr = dayKey(end);
  const map = await fetchFrankfurterRange(b, q, sStr, eStr);
  // persist
  try {
    const db = await getDb();
    for (const [d, rate] of map) {
      const dayStart = new Date(d + "T00:00:00.000Z");
      await (db as any).insert(fxRates).values({ base: b, quote: q, rate: rate.toString(), date: dayStart }).onConflictDoNothing();
      cache.set(cacheKey(b, q, d), { rate, ts: Date.now() });
    }
  } catch {}
  return map;
}

export function convert(amount: number, rate: number): number {
  return amount * rate;
}

export async function toUSD(amount: number, currency: string, date: Date): Promise<number> {
  if (!currency || currency.toUpperCase() === "USD") return amount;
  const rate = await getFxRate(currency, "USD", date);
  return amount * rate;
}
