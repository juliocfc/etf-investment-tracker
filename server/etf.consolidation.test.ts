import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as financialApi from "./financialApi";

// Mock financialApi to avoid external network calls during tests
vi.mock("./financialApi", async () => {
  const actual = await vi.importActual("./financialApi") as any;
  return {
    ...actual,
    validateEtfSymbol: vi.fn().mockResolvedValue(true),
    fetchEtfPrice: vi.fn().mockImplementation((symbol: string) => Promise.resolve({
      symbol: symbol.toUpperCase(),
      price: symbol.toUpperCase() === "VOO" ? 450.00 : 100.00,
      timestamp: new Date(),
    })),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-consolidation",
    email: "test-consolidation@example.com",
    name: "Test User Consolidation",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("ETF Consolidation", () => {
  it("should consolidate holdings by symbol when accountId is not provided", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 1. Create a portfolio
    const portfolio = await caller.portfolio.create({
      name: "Consolidation Test Portfolio",
    });
    const portfolioId = portfolio.id;

    // 2. Create two accounts
    const account1 = await caller.account.addAccount({
      portfolioId,
      name: "Account 1",
    });
    const account2 = await caller.account.addAccount({
      portfolioId,
      name: "Account 2",
    });

    // 3. Add same ETF to both accounts
    // Account 1: 10 shares of VOO at 400
    await caller.etf.addHolding({
      portfolioId,
      accountId: account1.id,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "10.000",
      purchasePrice: "400.00",
      purchaseDate: new Date(),
    });

    // Account 2: 20 shares of VOO at 410
    await caller.etf.addHolding({
      portfolioId,
      accountId: account2.id,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "20.000",
      purchasePrice: "410.00",
      purchaseDate: new Date(),
    });

    // 4. Get holdings WITH accountId (should not be consolidated)
    const holdingsAcc1 = await caller.etf.getHoldings({
      portfolioId,
      accountId: account1.id,
    });
    expect(holdingsAcc1.length).toBe(1);
    expect(holdingsAcc1[0].symbol).toBe("VOO");
    expect(holdingsAcc1[0].quantity).toBe("10.000");

    // 5. Get holdings WITHOUT accountId (should be consolidated)
    const consolidatedHoldings = await caller.etf.getHoldings({
      portfolioId,
    });
    
    expect(consolidatedHoldings.length).toBe(1);
    expect(consolidatedHoldings[0].symbol).toBe("VOO");
    expect(consolidatedHoldings[0].isConsolidated).toBe(true);
    expect(consolidatedHoldings[0].id).toBe(-1);
    expect(parseFloat(consolidatedHoldings[0].quantity)).toBe(30);
    // Weighted average: (10*400 + 20*410) / 30 = (4000 + 8200) / 30 = 12200 / 30 = 406.666...
    expect(parseFloat(consolidatedHoldings[0].averageCost)).toBeCloseTo(406.67, 1);

    // 6. Get portfolio summary WITHOUT accountId (should be consolidated)
    const summary = await caller.etf.getPortfolioSummary({
      portfolioId,
    });
    
    const vooHolding = summary.holdings.find(h => h.symbol === "VOO");
    expect(vooHolding).toBeDefined();
    expect(vooHolding.isConsolidated).toBe(true);
    expect(parseFloat(vooHolding.quantity)).toBe(30);
    expect(parseFloat(vooHolding.totalCost)).toBe(12200);
    expect(parseFloat(vooHolding.averageCost)).toBeCloseTo(406.67, 1);
    
    // Check gain calculation in summary
    // Current Price is 450 (from mock)
    // Current Value = 30 * 450 = 13500
    // Gain = 13500 - 12200 = 1300
    expect(parseFloat(vooHolding.currentValue)).toBe(13500);
    expect(parseFloat(vooHolding.gain)).toBe(1300);
    expect(parseFloat(vooHolding.gainPercent)).toBeCloseTo((1300 / 12200) * 100, 1);
  });
});
