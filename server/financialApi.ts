/**
 * Financial Data API Integration
 * Fetches real-time ETF prices and dividend information
 * Uses Alpha Vantage as primary provider with fallback options
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "demo";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

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

/**
 * Fetch current price for an ETF symbol
 * Uses Alpha Vantage Global Quote endpoint
 */
export async function fetchEtfPrice(symbol: string): Promise<PriceData | null> {
  try {
    const params = new URLSearchParams({
      function: "GLOBAL_QUOTE",
      symbol: symbol.toUpperCase(),
      apikey: ALPHA_VANTAGE_API_KEY,
    });

    const url = `${ALPHA_VANTAGE_BASE_URL}?${params}`;
    console.log(`[FinancialApi] Fetching price for ${symbol} from ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`[FinancialApi] API Response for ${symbol}:`, JSON.stringify(data).substring(0, 200));

    if (data["Global Quote"] && data["Global Quote"]["05. price"]) {
      const price = parseFloat(data["Global Quote"]["05. price"]);
      if (!isNaN(price)) {
        console.log(`[FinancialApi] Successfully fetched price for ${symbol}: $${price}`);
        return {
          symbol: symbol.toUpperCase(),
          price,
          timestamp: new Date(),
        };
      }
    }

    console.warn(`[FinancialApi] No price data for ${symbol}. Response keys: ${Object.keys(data).join(', ')}`);
    return null;
  } catch (error) {
    console.error(`[FinancialApi] Error fetching price for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch historical daily prices for an ETF
 * Uses Alpha Vantage TIME_SERIES_DAILY endpoint
 */
export async function fetchHistoricalPrices(
  symbol: string,
  days: number = 365
): Promise<PriceData[]> {
  try {
    const params = new URLSearchParams({
      function: "TIME_SERIES_DAILY",
      symbol: symbol.toUpperCase(),
      outputsize: days > 100 ? "full" : "compact",
      apikey: ALPHA_VANTAGE_API_KEY,
    });

    const response = await fetch(`${ALPHA_VANTAGE_BASE_URL}?${params}`);
    const data = await response.json();

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) {
      console.warn(`[FinancialApi] No historical data for ${symbol}`);
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const prices: PriceData[] = [];
    for (const [dateStr, dailyData] of Object.entries(timeSeries)) {
      const date = new Date(dateStr);
      if (date >= cutoffDate) {
        const closePrice = parseFloat((dailyData as any)["4. close"]);
        if (!isNaN(closePrice)) {
          prices.push({
            symbol: symbol.toUpperCase(),
            price: closePrice,
            timestamp: date,
          });
        }
      }
    }

    return prices.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  } catch (error) {
    console.error(
      `[FinancialApi] Error fetching historical prices for ${symbol}:`,
      error
    );
    return [];
  }
}

/**
 * Fetch dividend information for an ETF
 * Note: Alpha Vantage has limited dividend data; this is a basic implementation
 * For production, consider using a specialized dividend API
 */
export async function fetchDividendData(symbol: string): Promise<DividendData[]> {
  try {
    // Alpha Vantage doesn't have a dedicated dividend endpoint
    // This is a placeholder for future integration with specialized APIs
    // like IEX Cloud, Polygon.io, or Finnhub
    
    console.log(
      `[FinancialApi] Dividend data for ${symbol} requires specialized API integration`
    );
    return [];
  } catch (error) {
    console.error(
      `[FinancialApi] Error fetching dividend data for ${symbol}:`,
      error
    );
    return [];
  }
}

/**
 * Validate ETF symbol exists and is tradeable
 */
export async function validateEtfSymbol(symbol: string): Promise<boolean> {
  try {
    const priceData = await fetchEtfPrice(symbol);
    return priceData !== null;
  } catch (error) {
    console.error(`[FinancialApi] Error validating symbol ${symbol}:`, error);
    return false;
  }
}

/**
 * Batch fetch prices for multiple symbols
 * Respects API rate limits
 */
export async function fetchMultiplePrices(
  symbols: string[]
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();

  // Add delay between requests to respect rate limits
  for (const symbol of symbols) {
    const priceData = await fetchEtfPrice(symbol);
    if (priceData) {
      results.set(symbol.toUpperCase(), priceData);
    }
    // Alpha Vantage free tier: 5 requests per minute
    await new Promise((resolve) => setTimeout(resolve, 12000));
  }

  return results;
}
