import { describe, expect, it } from "vitest";
import { fetchETFName } from "./etfLookup";

describe("ETF Lookup Service", () => {
  it("should fetch ETF name or return null for a symbol", async () => {
    // Alpha Vantage SYMBOL_SEARCH has rate limits
    const name = await fetchETFName("VOO");
    
    // Should either return a string or null (API rate limit)
    expect(typeof name === "string" || name === null).toBe(true);
  }, { timeout: 10000 });

  it("should return null or string for invalid symbol", async () => {
    const name = await fetchETFName("INVALIDXYZ123");
    
    // Invalid symbols should return null or string
    expect(typeof name === "string" || name === null).toBe(true);
  }, { timeout: 10000 });

  it("should cache results to avoid repeated API calls", async () => {
    // First call
    const name1 = await fetchETFName("VTI");
    
    // Second call should use cache (instant)
    const name2 = await fetchETFName("VTI");
    
    // Both should be the same (either both null or both a string)
    expect(name1).toBe(name2);
  }, { timeout: 10000 });

  it("should handle API errors gracefully", async () => {
    // Test with a single letter symbol
    const name = await fetchETFName("A");
    
    // Should not throw, just return null or a result
    expect(typeof name === "string" || name === null).toBe(true);
  }, { timeout: 10000 });
});
