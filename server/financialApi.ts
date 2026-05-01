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

/**
 * Fetch current price for an ETF symbol
 */
export async function fetchEtfPrice(symbol: string): Promise<PriceData | null> {
  const sym = symbol.toUpperCase();
  
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
  const sym = symbol.toUpperCase();
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
      return [];
    }

    console.log(`[FinancialApi] Successfully fetched ${results.length} historical prices for ${sym}`);

    return results.map((day) => ({
      symbol: sym,
      price: day.close,
      timestamp: new Date(day.date),
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  } catch (error: any) {
    console.error(`[FinancialApi] Historical fetch failed for ${sym}:`, error.message, error);
    return [];
  }
}

/**
 * Fetch dividend information for an ETF
 */
export async function fetchDividendData(symbol: string): Promise<DividendData[]> {
  const sym = symbol.toUpperCase();
  
  // Check cache
  const cached = dividendCache.get(sym);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  try {
    const endDate = new Date();
    const startDate = new Date('1970-01-01');

    const results = await yahooFinance.historical(sym, {
      period1: startDate,
      period2: endDate,
      events: 'dividends',
    });

    if (results && results.length > 0) {
      const data = results.map(d => ({
        symbol: sym,
        dividendPerShare: d.dividends,
        exDate: new Date(d.date),
      })).sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
      
      dividendCache.set(sym, { data, timestamp: Date.now() });
      return data;
    }
  } catch (error: any) {
    console.error(`[FinancialApi] Dividend fetch failed for ${sym}:`, error.message);
  }

  return [];
}

/**
 * Validate ETF symbol exists and is tradeable
 */
export async function validateEtfSymbol(symbol: string): Promise<boolean> {
  const price = await fetchEtfPrice(symbol);
  return price !== null;
}

/**
 * Calculate annual dividend per share based on historical data
 */
export async function calculateAnnualDPS(symbol: string): Promise<number> {
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
