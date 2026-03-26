import { fetchHistoricalPrices, fetchEtfPrice } from "./financialApi";
import { getAssetPricesInRange, getAssetPriceByDate, addAssetPrice, bulkAddAssetPrices } from "./db";

export interface PriceData {
  symbol: string;
  price: number;
  timestamp: Date;
}

/**
 * Smart price fetcher: Checks DB first, then fetches from provider and caches in DB.
 */
export async function getSmartHistoricalPrices(
  symbol: string,
  days: number = 365,
  interval: '1d' | '1wk' | '1mo' = '1d',
  saveFilter?: (date: Date) => boolean
): Promise<PriceData[]> {
  const sym = symbol.toUpperCase();
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Normalize dates to UTC midnight for DB comparison
  const startOfRange = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
  const endOfRange = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  // 1. Check DB for prices in range
  const dbPrices = await getAssetPricesInRange(sym, startOfRange, endOfRange);
  
  // Calculate expected number of business days (approximate check)
  // For '1d', we expect ~5 days per week.
  // For '1wk', we expect ~1 day per week.
  // For '1mo', we expect ~1 day per month.
  let expectedDataPoints = days * 5/7; 
  if (interval === '1wk') expectedDataPoints = days / 7;
  else if (interval === '1mo') expectedDataPoints = days / 30;
  
  if (dbPrices.length >= expectedDataPoints * 0.8) {
    console.log(`[PriceService] Cache HIT for ${sym} (found ${dbPrices.length}, expected ~${expectedDataPoints.toFixed(0)}, interval: ${interval})`);
    
    // If it's a non-daily interval, filter daily prices from DB accurately
    let filteredPrices = dbPrices;
    if (interval === '1wk') {
        // Take roughly one point per week (every 5th business day)
        filteredPrices = dbPrices.filter((_: any, index: number) => index % 5 === 0);
    } else if (interval === '1mo') {
        // Group by year and month, take the last available day of each month
        const grouped = new Map<string, any>();
        dbPrices.forEach((p: any) => {
            const d = new Date(p.date);
            const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
            grouped.set(key, p); 
        });
        filteredPrices = Array.from(grouped.values());
    }

    return filteredPrices.map((p: any) => ({
      symbol: sym,
      price: parseFloat(p.price),
      timestamp: new Date(p.date)
    }));
  }

  // 2. Cache miss: Fast fetch from provider then deep fetch in background
  console.log(`[PriceService] Cache MISS for ${sym}. Doing fast fetch (${interval}) for UI...`);
  
  // Await the fast fetch so the user gets data immediately
  const fastProviderPrices = await fetchHistoricalPrices(sym, days, interval);
  
  // 3. Trigger background fetch to populate cache
  (async () => {
    try {
      // Use the requested interval for background fetch as well to avoid over-fetching and bloating DB
      // However, if daily is requested, we do daily.
      console.log(`[PriceService] Background fetch started for ${sym} (${interval})...`);
      const deepPrices = await fetchHistoricalPrices(sym, days, interval);
      
      if (deepPrices.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        let historicalToSave = deepPrices.filter(p => {
            const pDateStr = p.timestamp.toISOString().split('T')[0];
            return pDateStr < todayStr;
        });

        // Apply provided filter or save all if no filter provided (since we already fetched at the correct interval)
        if (saveFilter) {
            historicalToSave = historicalToSave.filter(p => saveFilter(p.timestamp));
        }

        if (historicalToSave.length > 0) {
          await bulkAddAssetPrices(historicalToSave.map(p => ({
            symbol: sym,
            price: p.price.toString(),
            date: p.timestamp
          })));
          console.log(`[PriceService] Background fetch completed for ${sym}. Saved ${historicalToSave.length} points.`);
        }
      }
    } catch (err) {
      console.error(`[PriceService] Background fetch failed for ${sym}:`, err);
    }
  })();

  return fastProviderPrices;
}

/**
 * Get price for a specific date, checking DB first.
 */
export async function getSmartPriceByDate(symbol: string, date: Date): Promise<number | null> {
  const sym = symbol.toUpperCase();
  const todayStr = new Date().toISOString().split('T')[0];
  const targetDateStr = date.toISOString().split('T')[0];

  // If it's today, we always fetch fresh price (or use provider's internal cache)
  if (targetDateStr >= todayStr) {
    const fresh = await fetchEtfPrice(sym);
    return fresh ? fresh.price : null;
  }

  // 1. Check DB
  const cached = await getAssetPriceByDate(sym, date);
  if (cached) {
    return parseFloat(cached.price);
  }

  // 2. Fetch from provider (range request around that date is most reliable)
  console.log(`[PriceService] Specific date ${targetDateStr} MISS for ${sym}. Fetching...`);
  const daysDiff = Math.ceil((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24)) + 2;
  const history = await fetchHistoricalPrices(sym, daysDiff);
  
  // Find the closest price on or before the date
  const targetTime = date.getTime();
  const closest = history
    .filter(h => h.timestamp.getTime() <= targetTime)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

  if (closest) {
    // Save to DB in background if it's strictly historical
    if (closest.timestamp.toISOString().split('T')[0] < todayStr) {
        addAssetPrice(sym, closest.price.toString(), closest.timestamp).catch(err => {
            console.error(`[PriceService] Background single save failed for ${sym}:`, err);
        });
    }
    return closest.price;
  }

  // Final fallback: try to get current price if historical failed
  const current = await fetchEtfPrice(sym);
  return current ? current.price : null;
}
