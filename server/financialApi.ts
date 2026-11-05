import YahooFinance from 'yahoo-finance2';
import axios from 'axios';
import { getEnv } from "./_core/env";

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical']
});

const NINJAS_API_KEY = "ud6rGsasXebH6or8fKU0qsy2kD7BOv9Xfjm1HPdZ";
const NINJAS_BASE_URL = "https://api.api-ninjas.com/v1/stockprice";

/**
 * Financial Data API Integration
 * Fetches real-time ETF prices and dividend information
 * Uses Yahoo Finance as the primary provider with API Ninjas and Alpha Vantage as fallbacks
 */

interface PriceData {
  symbol: string;
  price: number;
  timestamp: Date;
}

interface DividendData {
  symbol: string;
  dividendPerShare: number;
  exDate: Date;
  paymentDate?: Date;
}

// Caching to reduce API calls
const priceCache = new Map<string, { data: PriceData, timestamp: number }>();
const dividendCache = new Map<string, { data: DividendData[], timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// B3 tickers like VALE3/PETR4 trade as VALE3.SA on Yahoo; auto-resolve
function isB3Like(sym: string): boolean {
  return /^[A-Z]{4}\d{1,2}$/.test(sym) || /^[A-Z]{4}3F?$/.test(sym) || /^[A-Z]{4}4F?$/.test(sym);
}
function b3Candidate(sym: string): string | null {
  if (sym.includes(".") || sym.includes("/")) return null;
  if (isB3Like(sym)) return `${sym}.SA`;
  return null;
}

/**
 * Fetch current price for an ETF symbol
 */
const CRYPTO_MAP: Record<string, { id: string, yahoo: string, name: string }> = {
  BTC: { id: "bitcoin", yahoo: "BTC-USD", name: "Bitcoin" },
  ETH: { id: "ethereum", yahoo: "ETH-USD", name: "Ethereum" },
  "BTC-USD": { id: "bitcoin", yahoo: "BTC-USD", name: "Bitcoin" },
  "ETH-USD": { id: "ethereum", yahoo: "ETH-USD", name: "Ethereum" },
};

async function fetchCryptoPrice(symbol: string): Promise<PriceData | null> {
  const sym = symbol.toUpperCase();
  const entry = CRYPTO_MAP[sym];
  if (!entry) return null;
  const cached = priceCache.get(sym);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) return cached.data;
  // Try CoinGecko first
  try {
    console.log(`[FinancialApi] Fetching crypto price for ${sym} via CoinGecko`);
    const resp = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${entry.id}&vs_currencies=usd`, { timeout: 8000 });
    const price = resp.data?.[entry.id]?.usd;
    if (price) {
      const data = { symbol: sym, price: Number(price), timestamp: new Date() };
      priceCache.set(sym, { data, timestamp: Date.now() });
      priceCache.set(entry.yahoo, { data: { symbol: entry.yahoo, price: Number(price), timestamp: new Date() }, timestamp: Date.now() });
      return data;
    }
  } catch (e: any) {
    console.warn(`[FinancialApi] CoinGecko failed for ${sym}:`, e.message);
  }
  // Fallback to Yahoo with yahoo symbol
  try {
    console.log(`[FinancialApi] Fetching crypto price for ${sym} via Yahoo ${entry.yahoo}`);
    const quote = await yahooFinance.quote(entry.yahoo);
    if (quote && quote.regularMarketPrice) {
      const data = { symbol: sym, price: quote.regularMarketPrice, timestamp: quote.regularMarketTime || new Date() };
      priceCache.set(sym, { data, timestamp: Date.now() });
      return data;
    }
  } catch (e: any) {
    console.warn(`[FinancialApi] Yahoo crypto fallback failed for ${entry.yahoo}:`, e.message);
  }
  return null;
}

export async function fetchEtfPrice(symbol: string): Promise<PriceData | null> {
  const sym = symbol.toUpperCase();
  // Crypto fast-path: BTC / ETH / BTC-USD / ETH-USD
  if (CRYPTO_MAP[sym]) {
    const cryptoData = await fetchCryptoPrice(sym);
    if (cryptoData) return cryptoData;
    // fall through to normal flow if crypto fetch fails (will try yahoo directly)
  }
  
  // Check cache
  const cached = priceCache.get(sym);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[FinancialApi] Returning cached price for ${sym}`);
    return cached.data;
  }

  try {
    console.log(`[FinancialApi] Fetching price for ${sym} from Yahoo Finance`);
    const quote = await yahooFinance.quote(sym);
    
    if (quote && quote.regularMarketPrice) {
      const data = {
        symbol: sym,
        price: quote.regularMarketPrice,
        timestamp: quote.regularMarketTime || new Date(),
      };
      priceCache.set(sym, { data, timestamp: Date.now() });
      return data;
    }
  } catch (error: any) {
    console.warn(`[FinancialApi] Yahoo Finance failed for ${sym}:`, error.message);
  }

  // B3 fallback: try VALE3 -> VALE3.SA
  const b3 = b3Candidate(sym);
  if (b3) {
    try {
      console.log(`[FinancialApi] Trying B3 fallback ${b3} for ${sym}`);
      const quote = await yahooFinance.quote(b3);
      if (quote && quote.regularMarketPrice) {
        const data = { symbol: sym, price: quote.regularMarketPrice, timestamp: quote.regularMarketTime || new Date() };
        priceCache.set(sym, { data, timestamp: Date.now() });
        priceCache.set(b3, { data: { symbol: b3, price: quote.regularMarketPrice, timestamp: quote.regularMarketTime || new Date() }, timestamp: Date.now() });
        return data;
      }
    } catch (error: any) {
      console.warn(`[FinancialApi] B3 fallback failed for ${b3}:`, error.message);
    }
  }

  // Attempt API Ninjas Fallback
  console.log(`[FinancialApi] Attempting API Ninjas fallback for ${sym}`);
  const ninjasPrice = await fetchPriceFromNinjas(sym);
  if (ninjasPrice) return ninjasPrice;
  
  // Attempt Alpha Vantage Fallback
  console.log(`[FinancialApi] Attempting Alpha Vantage fallback for ${sym}`);
  return fetchPriceFromAlphaVantage(sym);
}

async function fetchPriceFromNinjas(symbol: string): Promise<PriceData | null> {
  try {
    const response = await axios.get(`${NINJAS_BASE_URL}?ticker=${symbol}`, {
      headers: { 'X-Api-Key': NINJAS_API_KEY }
    });
    
    if (response.data && response.data.price) {
      console.log(`[FinancialApi] API Ninjas successfully fetched price for ${symbol}: ${response.data.price}`);
      const result = {
        symbol: symbol.toUpperCase(),
        price: parseFloat(response.data.price),
        timestamp: response.data.updated ? new Date(response.data.updated * 1000) : new Date(),
      };
      priceCache.set(symbol.toUpperCase(), { data: result, timestamp: Date.now() });
      return result;
    }
    return null;
  } catch (error: any) {
    console.error(`[FinancialApi] API Ninjas fallback failed for ${symbol}:`, error.message);
    return null;
  }
}

async function fetchPriceFromAlphaVantage(symbol: string): Promise<PriceData | null> {
  try {
    const env = getEnv();
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${env.alphaVantageApiKey}`;
    
    const response = await axios.get(url);
    console.log(`[FinancialApi] Alpha Vantage response for ${symbol}:`, JSON.stringify(response.data));
    
    if (response.data['Note'] || response.data['Information']) {
      console.warn(`[FinancialApi] Alpha Vantage potential rate limit:`, response.data['Note'] || response.data['Information']);
    }

    const data = response.data['Global Quote'];
    if (data && data['05. price']) {
      const result = {
        symbol: symbol.toUpperCase(),
        price: parseFloat(data['05. price']),
        timestamp: new Date(),
      };
      priceCache.set(symbol.toUpperCase(), { data: result, timestamp: Date.now() });
      return result;
    }
    return null;
  } catch (error) {
    console.error(`[FinancialApi] Alpha Vantage fallback failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchHistoricalPrices(
  symbol: string,
  days: number = 365,
  interval: '1d' | '1wk' | '1mo' = '1d'
): Promise<PriceData[]> {
  const symBase = symbol.toUpperCase();
  const cryptoYahoo = CRYPTO_MAP[symBase]?.yahoo;
  const candidates: string[] = cryptoYahoo
    ? [cryptoYahoo, symBase]
    : ([symBase, b3Candidate(symBase)].filter(Boolean) as string[]);
  for (const sym of candidates) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`[FinancialApi] Fetching historical prices for ${sym} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} with interval ${interval}`);

    const results = await yahooFinance.historical(sym, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

    if (!results || results.length === 0) {
      console.warn(`[FinancialApi] No historical results returned for ${sym}`);
      continue;
    }

    console.log(`[FinancialApi] Successfully fetched ${results.length} historical prices for ${sym}`);

    return results.map((day) => ({
      symbol: symBase,
      price: day.close,
      timestamp: new Date(day.date),
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  } catch (error: any) {
    console.error(`[FinancialApi] Historical fetch failed for ${sym}:`, error.message, error);
    continue;
  }
  }
  return [];
}

async function fetchDividendsFromNasdaq(symbol: string): Promise<DividendData[]> {
  const sym = symbol.toUpperCase();
  // Nasdaq requires assetclass stocks|etf — try both
  for (const assetclass of ["etf", "stocks"]) {
    try {
      const url = `https://api.nasdaq.com/api/quote/${sym}/dividends?assetclass=${assetclass}`;
      const resp = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
        },
        timeout: 12000,
      });
      const rows = resp.data?.data?.dividends?.rows;
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;
      const data: DividendData[] = rows
        .filter((r: any) => r.amount && r.exOrEffDate)
        .map((r: any) => {
          const amt = parseFloat(String(r.amount).replace(/[$,]/g, ""));
          const ex = new Date(r.exOrEffDate);
          const pay = r.paymentDate ? new Date(r.paymentDate) : undefined;
          if (isNaN(amt) || isNaN(ex.getTime())) return null;
          return { symbol: sym, dividendPerShare: amt, exDate: ex, paymentDate: pay };
        })
        .filter(Boolean) as DividendData[];
      if (data.length) {
        data.sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
        console.log(`[FinancialApi] Nasdaq dividends for ${sym} (${assetclass}): ${data.length} rows, last ${data[0]?.exDate.toISOString().slice(0,10)} $${data[0]?.dividendPerShare}`);
        return data;
      }
    } catch (e: any) {
      console.warn(`[FinancialApi] Nasdaq dividend fetch failed for ${sym} ${assetclass}:`, e.message);
    }
  }
  return [];
}

/**
 * Fetch dividend information for an ETF
 * Primary: Yahoo Finance; fallback D: Nasdaq (covers GPIX Oct/Nov gaps where Yahoo is stale)
 */
export async function fetchDividendData(symbol: string): Promise<DividendData[]> {
  const symBase = symbol.toUpperCase();
  const candidates = [symBase, b3Candidate(symBase)].filter(Boolean) as string[];
  for (const sym of candidates) {
  
  // Check cache
  const cached = dividendCache.get(sym);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  let yahooData: DividendData[] = [];
  try {
    const endDate = new Date();
    const startDate = new Date('1970-01-01');
    const results = await yahooFinance.historical(sym, {
      period1: startDate,
      period2: endDate,
      events: 'dividends',
    });
    if (results && results.length > 0) {
      yahooData = results.map(d => ({
        symbol: symBase,
        dividendPerShare: (d as any).dividends,
        exDate: new Date((d as any).date),
      })).sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
    }
  } catch (error: any) {
    console.warn(`[FinancialApi] Yahoo dividend fetch failed for ${sym}:`, error.message);
  }

  // Fallback D: Nasdaq — fetch regardless to fill Yahoo gaps (Yahoo missing Oct 2026 for GPIX)
  const nasdaqData = await fetchDividendsFromNasdaq(sym);

  // Merge, de-duplicate by exDate (keep higher-precision source; Nasdaq often fresher for current month)
  const merged = new Map<string, DividendData>();
  for (const d of yahooData) merged.set(d.exDate.toISOString().slice(0,10), d);
  for (const d of nasdaqData) {
    const key = d.exDate.toISOString().slice(0,10);
    if (!merged.has(key)) merged.set(key, { ...d, symbol: symBase });
    else {
      // if both have same exDate, prefer Nasdaq amount if Yahoo is stale (Nasdaq is the official exDate)
      const existing = merged.get(key)!;
      if (Math.abs(existing.dividendPerShare - d.dividendPerShare) > 0.0001) {
        merged.set(key, { ...d, symbol: symBase });
      }
    }
  }
  const data = Array.from(merged.values()).sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
  if (data.length > 0) {
    dividendCache.set(sym, { data, timestamp: Date.now() });
    dividendCache.set(symBase, { data, timestamp: Date.now() });
    if (yahooData.length && nasdaqData.length) console.log(`[FinancialApi] Merged dividends for ${symBase}: Yahoo ${yahooData.length} + Nasdaq ${nasdaqData.length} → ${data.length}`);
    else if (nasdaqData.length) console.log(`[FinancialApi] Using Nasdaq dividends for ${symBase}: ${data.length}`);
    return data;
  }
  }
  return [];
}

/**
 * Validate ETF symbol exists and is tradeable
 */
export async function validateEtfSymbol(symbol: string): Promise<boolean> {
  const sym = symbol.toUpperCase();
  if (sym === "BTC" || sym === "ETH" || sym === "BTC-USD" || sym === "ETH-USD") return true;
  const price = await fetchEtfPrice(symbol);
  return price !== null;
}

/**
 * Calculate annual dividend per share based on historical data
 */
export async function calculateAnnualDPS(symbol: string): Promise<number> {
  const symUp = symbol.toUpperCase();
  if (symUp === "BTC" || symUp === "ETH" || symUp === "BTC-USD" || symUp === "ETH-USD") return 0;
  try {
    const dividendData = await fetchDividendData(symbol);
    if (!dividendData || dividendData.length === 0) return 0;

    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

    // 1. Get payments in the last 12 months strictly
    const lastYearPayments = dividendData.filter((d: any) => {
      const dDate = new Date(d.exDate);
      return dDate >= twelveMonthsAgo && dDate <= now;
    });

    // 2. Estimate annual DPS based on frequency
    const sortedData = [...dividendData].sort((a, b) => b.exDate.getTime() - a.exDate.getTime());

    if (lastYearPayments.length >= 10) {
      // Likely a monthly payer
      return sortedData[0].dividendPerShare * 12;
    } else if (lastYearPayments.length >= 3) {
      // Likely a quarterly payer
      return sortedData[0].dividendPerShare * 4;
    } else {
      // Irregular or semi-annual
      return lastYearPayments.reduce((sum: number, d: any) => sum + d.dividendPerShare, 0);
    }
  } catch (error) {
    console.error(`Error calculating annual DPS for ${symbol}:`, error);
    return 0;
  }
}

/**
 * Batch fetch prices for multiple symbols
 */
export async function fetchMultiplePrices(
  symbols: string[]
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();

  for (const symbol of symbols) {
    const priceData = await fetchEtfPrice(symbol);
    if (priceData) {
      results.set(symbol.toUpperCase(), priceData);
    }
    // Polite delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}
