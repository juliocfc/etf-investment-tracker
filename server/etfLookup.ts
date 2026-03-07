import { getEnv } from "./_core/env";
import axios from 'axios';

const BASE_URL = 'https://www.alphavantage.co/query';

// Cache for ETF names to avoid repeated API calls
const etfNameCache: Map<string, string> = new Map();

/**
 * Fetch ETF/stock name from Alpha Vantage using SYMBOL_SEARCH
 */
export async function fetchETFName(symbol: string): Promise<string | null> {
  try {
    const env = getEnv();
    // Check cache first
    if (etfNameCache.has(symbol)) {
      return etfNameCache.get(symbol) || null;
    }

    const response = await axios.get(BASE_URL, {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: symbol,
        apikey: env.alphaVantageApiKey,
      },
      timeout: 5000,
    });

    const bestMatches = response.data?.bestMatches || [];
    
    if (bestMatches.length > 0) {
      const match = bestMatches[0];
      const name = match['2. name'] || null;
      
      if (name) {
        // Cache the result
        etfNameCache.set(symbol, name);
        return name;
      }
    }

    return null;
  } catch (error) {
    console.error(`[ETFLookup] Error fetching name for ${symbol}:`, error);
    return null;
  }
}

/**
 * Batch fetch ETF names for multiple symbols
 */
export async function fetchETFNames(symbols: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  for (const symbol of symbols) {
    const name = await fetchETFName(symbol);
    if (name) {
      results.set(symbol, name);
    }
  }
  
  return results;
}
