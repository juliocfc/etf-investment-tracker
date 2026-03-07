import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

// Cache for ETF names to avoid repeated API calls
const etfNameCache: Map<string, string> = new Map();

/**
 * Fetch ETF/stock name from Yahoo Finance using search
 */
export async function fetchETFName(symbol: string): Promise<string | null> {
  try {
    const sym = symbol.toUpperCase();
    // Check cache first
    if (etfNameCache.has(sym)) {
      return etfNameCache.get(sym) || null;
    }

    console.log(`[ETFLookup] Searching for name of ${sym} from Yahoo Finance`);
    
    // Search for the symbol
    const searchResults = await yahooFinance.search(sym);
    const bestMatch = searchResults.quotes.find(q => q.symbol === sym);
    
    let name = null;
    if (bestMatch && (bestMatch as any).longname) {
      name = (bestMatch as any).longname;
    } else if (bestMatch && (bestMatch as any).shortname) {
      name = (bestMatch as any).shortname;
    } else if (searchResults.quotes.length > 0) {
      // Fallback to first search result if symbol isn't an exact match in quote list
      const firstResult = searchResults.quotes[0];
      name = (firstResult as any).longname || (firstResult as any).shortname || null;
    }

    if (name) {
      // Cache the result
      etfNameCache.set(sym, name);
      return name;
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
