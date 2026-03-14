import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as financialApi from "./financialApi";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getUserEtfHoldings: vi.fn(),
  };
});

vi.mock("./financialApi", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    fetchDividendData: vi.fn(),
  };
});

function createAuthContext(): TrpcContext {
  const user: any = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      headers: {},
      protocol: "http",
    } as any,
    res: {} as any,
  };
}

describe("getProjectedDividends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate projected dividends correctly without DRIP", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Assume today is May 1, 2024
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 1)); // May 1

    // Mock holdings
    (db.getUserEtfHoldings as any).mockResolvedValue([
      {
        symbol: "SCHD",
        name: "Schwab US Dividend Equity ETF",
        quantity: "100",
        currentPrice: "75.00",
      }
    ]);

    // Mock dividends (pays $0.50 every quarter in Jan, Apr, Jul, Oct)
    const dividends = [
      { exDate: new Date(2024, 3, 10), dividendPerShare: 0.50 }, // Apr
      { exDate: new Date(2024, 0, 10), dividendPerShare: 0.50 }, // Jan
      { exDate: new Date(2023, 9, 10), dividendPerShare: 0.50 }, // Oct
      { exDate: new Date(2023, 6, 10), dividendPerShare: 0.50 }, // Jul
    ];
    (financialApi.fetchDividendData as any).mockResolvedValue(dividends);

    const result = await caller.etf.getProjectedDividends({
      portfolioId: 1,
      withDRIP: false,
    });

    // Patterns found: 0 (Jan), 3 (Apr), 6 (Jul), 9 (Oct).
    // Simulation from May 2024 to Apr 2025:
    // Jul 2024 (index 6): 50
    // Oct 2024 (index 9): 50
    // Jan 2025 (index 0): 50
    // Apr 2025 (index 3): 50
    // Total = 200.00
    
    expect(result.totalProjectedAnnual).toBe("200.00");
    expect(result.assets[0].projectedAnnual).toBe("200.00");
    expect(result.assets[0].annualDPS).toBe("2.0000"); // 0.50 * 4

    vi.useRealTimers();
  });

  it("should calculate projected dividends correctly with DRIP", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1)); // Jan 1st 2024

    // Mock holdings
    (db.getUserEtfHoldings as any).mockResolvedValue([
      {
        symbol: "MONTHLY",
        name: "Monthly Payer",
        quantity: "100",
        currentPrice: "100.00",
      }
    ]);

    // Mock dividends (pays $1.00 every month)
    const dividends = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(2024, 0 - i, 15);
      dividends.push({ exDate: d, dividendPerShare: 1.00 });
    }
    (financialApi.fetchDividendData as any).mockResolvedValue(dividends);

    const result = await caller.etf.getProjectedDividends({
      portfolioId: 1,
      withDRIP: true,
    });

    // Payouts: 100, 101, 102.01, ..., 111.56
    // Sum = 100 * (1.01^12 - 1) / 0.01 = 1268.25
    
    expect(parseFloat(result.totalProjectedAnnual)).toBeCloseTo(1268.25, 1);
    expect(result.assets[0].projectedAnnual).toBe("1268.25");

    vi.useRealTimers();
  });
});
