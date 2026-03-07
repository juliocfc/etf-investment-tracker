import { describe, it, expect } from "vitest";
import { fetchEtfPrice, validateEtfSymbol, fetchHistoricalPrices } from "./financialApi";

describe("Financial API Integration", () => {
  it("should fetch current price for a valid ETF symbol", async () => {
    // Test with a well-known ETF: SPY (S&P 500)
    const priceData = await fetchEtfPrice("SPY");

    // With Yahoo Finance, we expect price data for a major ETF
    expect(priceData).not.toBeNull();
    if (priceData) {
      expect(priceData.symbol).toBe("SPY");
      expect(priceData.price).toBeGreaterThan(0);
      expect(priceData.timestamp).toBeInstanceOf(Date);
    }
  });

  it("should validate ETF symbol", async () => {
    // Test symbol validation
    const isValid = await validateEtfSymbol("SPY");
    expect(isValid).toBe(true);
  });

  it("should handle invalid symbols gracefully", async () => {
    // We need to use something that is really unlikely to be a symbol
    const priceData = await fetchEtfPrice("NOT_A_REAL_ETF_SYMBOL_XYZ");

    // Should return null for invalid symbols
    expect(priceData).toBeNull();
  });

  it("should fetch historical prices", async () => {
    const prices = await fetchHistoricalPrices("SPY", 30);
    expect(prices).toBeInstanceOf(Array);
    expect(prices.length).toBeGreaterThan(0);
    if (prices.length > 0) {
      expect(prices[0].symbol).toBe("SPY");
      expect(prices[0].price).toBeGreaterThan(0);
      expect(prices[0].timestamp).toBeInstanceOf(Date);
    }
  });
});
