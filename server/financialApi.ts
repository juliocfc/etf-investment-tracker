import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical']
});

/**
 * Financial Data API Integration
 * Fetches real-time ETF prices and dividend information
 * Uses Yahoo Finance as the primary provider
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

/**
 * Fetch current price for an ETF symbol
 */
export async function fetchEtfPrice(symbol: string): Promise<PriceData | null> {
  try {
    console.log(`[FinancialApi] Fetching price for ${symbol} from Yahoo Finance`);
    const quote = await yahooFinance.quote(symbol.toUpperCase());
    
    if (quote && quote.regularMarketPrice) {
      console.log(`[FinancialApi] Successfully fetched price for ${symbol}: $${quote.regularMarketPrice}`);
      return {
        symbol: symbol.toUpperCase(),
        price: quote.regularMarketPrice,
        timestamp: quote.regularMarketTime || new Date(),
      };
    }

    console.warn(`[FinancialApi] No price data for ${symbol}.`);
    return null;
  } catch (error) {
    console.error(`[FinancialApi] Error fetching price for ${symbol}:`, error);
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
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`[FinancialApi] Fetching historical prices for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()} with interval ${interval}`);
    
    const results = await yahooFinance.historical(symbol.toUpperCase(), {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

    if (!results || results.length === 0) {
      console.warn(`[FinancialApi] No historical data for ${symbol}`);
      return [];
    }

    const prices: PriceData[] = results.map((day) => ({
      symbol: symbol.toUpperCase(),
      price: day.close,
      timestamp: new Date(day.date),
    }));

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
 */
export async function fetchDividendData(symbol: string): Promise<DividendData[]> {
  try {
    console.log(`[FinancialApi] Fetching historical dividend data for ${symbol} from Yahoo Finance`);
    
    const endDate = new Date();
    const startDate = new Date('1970-01-01');

    const results = await yahooFinance.historical(symbol.toUpperCase(), {
      period1: startDate,
      period2: endDate,
      events: 'dividends',
    });

    if (!results || results.length === 0) {
      // Fallback to quote if no historical dividends found (rare for dividend ETFs)
      const quote = await yahooFinance.quote(symbol.toUpperCase());
      if (quote && quote.trailingAnnualDividendRate) {
          return [{
              symbol: symbol.toUpperCase(),
              dividendPerShare: quote.trailingAnnualDividendRate,
              exDate: quote.dividendDate ? new Date(quote.dividendDate) : new Date(),
          }];
      }
      return [];
    }

    return results.map(d => ({
      symbol: symbol.toUpperCase(),
      dividendPerShare: d.dividends,
      exDate: new Date(d.date),
    })).sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
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
    const quote = await yahooFinance.quote(symbol.toUpperCase());
    return !!(quote && quote.regularMarketPrice);
  } catch (error) {
    console.error(`[FinancialApi] Error validating symbol ${symbol}:`, error);
    return false;
  }
}

/**
 * Batch fetch prices for multiple symbols
 * Yahoo Finance is much faster than Alpha Vantage, so we can reduce delays
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
    // Small delay to be polite
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}
