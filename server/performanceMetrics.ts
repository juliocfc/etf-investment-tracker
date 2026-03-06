/**
 * Performance Metrics Calculator
 * Calculates YTD return, 1-year return, and volatility for ETF holdings
 */

interface PricePoint {
  date: Date;
  price: number;
}

interface PerformanceMetrics {
  ytdReturn: number | null;
  oneYearReturn: number | null;
  volatility: number | null;
}

/**
 * Calculate YTD (Year-to-Date) return
 * Returns percentage change from Jan 1 of current year to today
 */
export function calculateYTDReturn(prices: PricePoint[]): number | null {
  if (prices.length === 0) return null;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // Find price at start of year (or earliest available)
  let startPrice: number | null = null;
  for (let i = prices.length - 1; i >= 0; i--) {
    if (prices[i].date <= yearStart) {
      startPrice = prices[i].price;
      break;
    }
  }

  // If no price found before year start, use earliest available
  if (startPrice === null && prices.length > 0) {
    startPrice = prices[prices.length - 1].price;
  }

  if (startPrice === null || startPrice === 0) return null;

  // Get most recent price
  const endPrice = prices[0].price;

  // Calculate return percentage
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Calculate 1-year return
 * Returns percentage change from 1 year ago to today
 */
export function calculateOneYearReturn(prices: PricePoint[]): number | null {
  if (prices.length === 0) return null;

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  // Find price from 1 year ago (or closest available)
  let startPrice: number | null = null;
  for (let i = prices.length - 1; i >= 0; i--) {
    if (prices[i].date <= oneYearAgo) {
      startPrice = prices[i].price;
      break;
    }
  }

  // If no price found from 1 year ago, use earliest available
  if (startPrice === null && prices.length > 0) {
    startPrice = prices[prices.length - 1].price;
  }

  if (startPrice === null || startPrice === 0) return null;

  // Get most recent price
  const endPrice = prices[0].price;

  // Calculate return percentage
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Calculate volatility (standard deviation of daily returns)
 * Measures price fluctuation over the period
 */
export function calculateVolatility(prices: PricePoint[]): number | null {
  if (prices.length < 2) return null;

  // Sort prices by date (oldest first)
  const sortedPrices = [...prices].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate daily returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < sortedPrices.length; i++) {
    const prevPrice = sortedPrices[i - 1].price;
    const currentPrice = sortedPrices[i].price;

    if (prevPrice !== 0) {
      const dailyReturn = (currentPrice - prevPrice) / prevPrice;
      dailyReturns.push(dailyReturn);
    }
  }

  if (dailyReturns.length === 0) return null;

  // Calculate mean of daily returns
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;

  // Calculate variance
  const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / dailyReturns.length;

  // Calculate standard deviation (daily volatility)
  const dailyVolatility = Math.sqrt(variance);

  // Annualize volatility (assuming 252 trading days per year)
  const annualizedVolatility = dailyVolatility * Math.sqrt(252);

  // Return as percentage
  return annualizedVolatility * 100;
}

/**
 * Calculate all performance metrics
 */
export function calculatePerformanceMetrics(prices: PricePoint[]): PerformanceMetrics {
  // Sort prices by date (newest first)
  const sortedPrices = [...prices].sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    ytdReturn: calculateYTDReturn(sortedPrices),
    oneYearReturn: calculateOneYearReturn(sortedPrices),
    volatility: calculateVolatility(sortedPrices),
  };
}

/**
 * Format metric value for display
 */
export function formatMetric(value: number | null, decimals: number = 2): string {
  if (value === null) return "N/A";
  return value.toFixed(decimals) + "%";
}
