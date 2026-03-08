import YahooFinance from 'yahoo-finance2';
import axios from 'axios';
import { getEnv } from "./_core/env";

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical']
});

const MASSIVE_API_KEY = "8u4pCrdgx_pFCWonDBTpchyoyHSXEpPL";
const MASSIVE_BASE_URL = "https://api.massive.com";

/**
 * Financial Data API Integration
 * Fetches real-time ETF prices and dividend information
 * Uses Yahoo Finance as the primary provider with Massive API and Alpha Vantage as fallbacks
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
    if (error.message?.includes('429')) {
      console.warn(`[FinancialApi] Yahoo Finance throttled (429). Attempting Massive API fallback for ${sym}`);
      const massivePrice = await fetchPriceFromMassive(sym);
      if (massivePrice) return massivePrice;
      
      console.warn(`[FinancialApi] Massive API fallback failed. Attempting Alpha Vantage fallback for ${sym}`);
      return fetchPriceFromAlphaVantage(sym);
    }
    console.error(`[FinancialApi] Yahoo Finance error for ${sym}:`, error.message);
  }

  // If YF failed for reasons other than 429, still try fallbacks
  const massivePrice = await fetchPriceFromMassive(sym);
  if (massivePrice) return massivePrice;
  
  return fetchPriceFromAlphaVantage(sym);
}

async function fetchPriceFromMassive(symbol: string): Promise<PriceData | null> {
  try {
    console.log(`[FinancialApi] Fetching price for ${symbol} from Massive API`);
    const url = `${MASSIVE_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${MASSIVE_API_KEY}`
      }
    });
    
    const tickerData = response.data.ticker;
    if (tickerData && tickerData.day && tickerData.day.c) {
      const result = {
        symbol: symbol.toUpperCase(),
        price: tickerData.day.c, // 'c' is close price in Polygon/Massive snapshot format
        timestamp: new Date(),
      };
      priceCache.set(symbol.toUpperCase(), { data: result, timestamp: Date.now() });
      return result;
    }
    return null;
  } catch (error: any) {
    console.error(`[FinancialApi] Massive API fallback failed for ${symbol}:`, error.message);
    return null;
  }
}

async function fetchPriceFromAlphaVantage(symbol: string): Promise<PriceData | null> {
  try {
    console.log(`[FinancialApi] Fetching price for ${symbol} from Alpha Vantage`);
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

/**
 * Fetch historical prices for an ETF
 */
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

    const results = await yahooFinance.historical(sym, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

    if (!results || results.length === 0) return [];

    return results.map((day) => ({
      symbol: sym,
      price: day.close,
      timestamp: new Date(day.date),
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  } catch (error: any) {
    console.error(`[FinancialApi] Historical fetch failed for ${sym}:`, error.message);
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
