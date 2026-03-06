import { describe, it, expect } from "vitest";
import {
  calculateYTDReturn,
  calculateOneYearReturn,
  calculateVolatility,
  calculatePerformanceMetrics,
  formatMetric,
} from "./performanceMetrics";

describe("Performance Metrics Calculator", () => {
  const mockPrices = [
    { date: new Date("2025-12-31"), price: 150 }, // Most recent
    { date: new Date("2025-12-15"), price: 148 },
    { date: new Date("2025-11-15"), price: 145 },
    { date: new Date("2025-01-15"), price: 140 }, // Start of 2025
    { date: new Date("2024-12-31"), price: 135 }, // 1 year ago
    { date: new Date("2024-12-15"), price: 133 },
    { date: new Date("2024-01-15"), price: 120 }, // 2 years ago
  ];

  describe("calculateYTDReturn", () => {
    it("should calculate YTD return correctly", () => {
      const result = calculateYTDReturn(mockPrices);
      // From earliest price in 2025 (120 on Jan 15) to Dec 31, 2025 (150)
      // (150 - 120) / 120 * 100 = 25%
      expect(result).toBeCloseTo(25, 1);
    });

    it("should return null for empty prices", () => {
      expect(calculateYTDReturn([])).toBeNull();
    });

    it("should return null if start price is zero", () => {
      const prices = [
        { date: new Date("2025-12-31"), price: 150 },
        { date: new Date("2025-01-01"), price: 0 },
      ];
      expect(calculateYTDReturn(prices)).toBeNull();
    });

    it("should handle single price", () => {
      const prices = [{ date: new Date("2025-12-31"), price: 150 }];
      const result = calculateYTDReturn(prices);
      expect(result).toBeDefined();
    });
  });

  describe("calculateOneYearReturn", () => {
    it("should calculate 1-year return correctly", () => {
      const result = calculateOneYearReturn(mockPrices);
      // From earliest available (120 on Jan 15, 2024) to Dec 31, 2025 (150)
      // (150 - 120) / 120 * 100 = 25%
      expect(result).toBeCloseTo(25, 1);
    });

    it("should return null for empty prices", () => {
      expect(calculateOneYearReturn([])).toBeNull();
    });

    it("should return null if start price is zero", () => {
      const prices = [
        { date: new Date("2025-12-31"), price: 150 },
        { date: new Date("2024-12-31"), price: 0 },
      ];
      expect(calculateOneYearReturn(prices)).toBeNull();
    });
  });

  describe("calculateVolatility", () => {
    it("should calculate volatility for price series", () => {
      const result = calculateVolatility(mockPrices);
      expect(result).toBeDefined();
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100); // Reasonable volatility percentage
    });

    it("should return null for less than 2 prices", () => {
      expect(calculateVolatility([])).toBeNull();
      expect(calculateVolatility([{ date: new Date(), price: 100 }])).toBeNull();
    });

    it("should handle constant prices (zero volatility)", () => {
      const constantPrices = [
        { date: new Date("2025-12-31"), price: 100 },
        { date: new Date("2025-12-30"), price: 100 },
        { date: new Date("2025-12-29"), price: 100 },
      ];
      const result = calculateVolatility(constantPrices);
      expect(result).toBeCloseTo(0, 1);
    });

    it("should handle volatile prices", () => {
      const volatilePrices = [
        { date: new Date("2025-12-31"), price: 150 },
        { date: new Date("2025-12-30"), price: 120 },
        { date: new Date("2025-12-29"), price: 160 },
        { date: new Date("2025-12-28"), price: 110 },
        { date: new Date("2025-12-27"), price: 170 },
      ];
      const result = calculateVolatility(volatilePrices);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("calculatePerformanceMetrics", () => {
    it("should calculate all metrics together", () => {
      const result = calculatePerformanceMetrics(mockPrices);
      expect(result.ytdReturn).toBeDefined();
      expect(result.oneYearReturn).toBeDefined();
      expect(result.volatility).toBeDefined();
    });

    it("should handle empty prices", () => {
      const result = calculatePerformanceMetrics([]);
      expect(result.ytdReturn).toBeNull();
      expect(result.oneYearReturn).toBeNull();
      expect(result.volatility).toBeNull();
    });
  });

  describe("formatMetric", () => {
    it("should format metric with default 2 decimals", () => {
      expect(formatMetric(7.14159)).toBe("7.14%");
    });

    it("should format metric with custom decimals", () => {
      expect(formatMetric(7.14159, 3)).toBe("7.142%");
    });

    it("should return N/A for null", () => {
      expect(formatMetric(null)).toBe("N/A");
    });

    it("should handle negative values", () => {
      expect(formatMetric(-5.5)).toBe("-5.50%");
    });

    it("should handle zero", () => {
      expect(formatMetric(0)).toBe("0.00%");
    });
  });

  describe("Edge cases", () => {
    it("should handle prices with same date", () => {
      const prices = [
        { date: new Date("2025-12-31"), price: 150 },
        { date: new Date("2025-12-31"), price: 148 },
        { date: new Date("2025-01-01"), price: 140 },
      ];
      const result = calculatePerformanceMetrics(prices);
      expect(result).toBeDefined();
    });

    it("should handle very small price changes", () => {
      const prices = [
        { date: new Date("2025-12-31"), price: 100.001 },
        { date: new Date("2025-12-30"), price: 100.0 },
      ];
      const result = calculatePerformanceMetrics(prices);
      expect(result.volatility).toBeDefined();
    });

    it("should handle large price swings", () => {
      const prices = [
        { date: new Date("2025-12-31"), price: 1000 },
        { date: new Date("2025-12-30"), price: 10 },
        { date: new Date("2025-12-29"), price: 500 },
      ];
      const result = calculatePerformanceMetrics(prices);
      expect(result.volatility).toBeGreaterThan(0);
    });
  });
});
