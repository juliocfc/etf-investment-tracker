import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

// Cache for ETF names to avoid repeated API calls
const etfNameCache: Map<string, string> = new Map();

/**
 * Fetch ETF/stock name from Yahoo Finance using quote (reliable) with search fallback
 */
export async function fetchETFName(symbol: string): Promise<string | null> {
  try {
    const sym = symbol.toUpperCase();
    // Check cache first
    if (etfNameCache.has(sym)) {
      return etfNameCache.get(sym) || null;
    }

    console.log(`[ETFLookup] Fetching name for ${sym} from Yahoo Finance`);
    
    // Primary: use quote - reliable for known symbols, avoids search schema validation issues for ETFs
    try {
      const quote: any = await yahooFinance.quote(sym);
      const name = quote?.longName || quote?.shortName || quote?.displayName || null;
      if (name) {
        etfNameCache.set(sym, name);
        return name;
      }
    } catch (quoteError) {
      console.warn(`[ETFLookup] Quote failed for ${sym}, trying search fallback:`, (quoteError as any)?.message);
    }

    // Fallback: search (may fail validation for ETFs on some yahoo-finance2 versions)
    try {
      const searchResults = await yahooFinance.search(sym);
      const bestMatch = searchResults.quotes.find(q => q.symbol === sym);
      
      let name = null;
      if (bestMatch && (bestMatch as any).longname) {
        name = (bestMatch as any).longname;
      } else if (bestMatch && (bestMatch as any).shortname) {
        name = (bestMatch as any).shortname;
      } else if (searchResults.quotes.length > 0) {
        const firstResult = searchResults.quotes[0];
        name = (firstResult as any).longname || (firstResult as any).shortname || null;
      }

      if (name) {
        etfNameCache.set(sym, name);
        return name;
      }
    } catch (searchError) {
      console.warn(`[ETFLookup] Search fallback failed for ${sym}:`, (searchError as any)?.message);
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
