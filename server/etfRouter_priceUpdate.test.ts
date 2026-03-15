import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

// Mock financialApi - MUST BE BEFORE ANY IMPORTS THAT USE IT
vi.mock("./financialApi", async () => {
  return {
    validateEtfSymbol: vi.fn().mockResolvedValue(true),
    fetchEtfPrice: vi.fn().mockImplementation((symbol: string) => {
      console.log(`[Mock] Fetching price for ${symbol}`);
      return Promise.resolve({
        symbol: symbol.toUpperCase(),
        price: 500.00,
        timestamp: new Date(),
      });
    }),
    fetchHistoricalPrices: vi.fn().mockResolvedValue([]),
    fetchDividendData: vi.fn().mockResolvedValue([]),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as financialApi from "./financialApi";
import { getDb } from "./db";
import { etfHoldings } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test-${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {} as any,
    res: {} as any,
  };
}

describe("etfRouter Price Synchronization", () => {
  const userId = 100;

  beforeAll(async () => {
    const db = await getDb();
    const { portfolios, accounts, users, etfHoldings, purchases } = await import("../drizzle/schema");
    
    // Clean up
    await db.delete(purchases);
    await db.delete(etfHoldings);
    await db.delete(accounts);
    await db.delete(portfolios);
    await db.delete(users);

    // Seed test data for userId 100
    await db.insert(users).values({ id: userId, openId: `test-user-${userId}`, name: `Test User ${userId}` });
  });

  it("addHolding should use cached price if recent and sync price to other holdings", async () => {
    const ctx = createAuthContext(userId);
    const caller = appRouter.createCaller(ctx);

    // 1. Setup portfolio and accounts
    const portfolio = await caller.portfolio.create({ name: "P1" });
    const acc1 = await caller.account.addAccount({ portfolioId: Number(portfolio.id), name: "A1" });
    const acc2 = await caller.account.addAccount({ portfolioId: Number(portfolio.id), name: "A2" });

    const mockedFinancialApi = vi.mocked(financialApi);

    // 2. Add VOO to Account 1
    console.log("Adding VOO to Account 1");
    await caller.etf.addHolding({
      portfolioId: Number(portfolio.id),
      accountId: Number(acc1.id),
      symbol: "VOO",
      name: "Vanguard S&P 500",
      quantity: "10",
      purchasePrice: "450",
      purchaseDate: new Date(),
    });

    expect(mockedFinancialApi.fetchEtfPrice).toHaveBeenCalledTimes(1);
    
    // 3. Manually update the price in DB to something else to see if it's used
    const db = await getDb();
    await db.update(etfHoldings)
      .set({ currentPrice: "550.00", lastPriceUpdate: new Date() })
      .where(and(eq(etfHoldings.userId, userId), eq(etfHoldings.symbol, "VOO")));

    // 4. Add VOO to Account 2 - should use cached price (550.00) from DB because it's recent
    console.log("Adding VOO to Account 2");
    const result2 = await caller.etf.addHolding({
      portfolioId: Number(portfolio.id),
      accountId: Number(acc2.id),
      symbol: "VOO",
      name: "Vanguard S&P 500",
      quantity: "5",
      purchasePrice: "460",
      purchaseDate: new Date(),
    });

    // Should NOT have called fetchEtfPrice again because we used the one from DB (last 1 hour)
    expect(mockedFinancialApi.fetchEtfPrice).toHaveBeenCalledTimes(1);
    
    // Check if the new holding has the cached price
    const holdings = await caller.etf.getHoldings({ portfolioId: Number(portfolio.id), accountId: Number(acc2.id) });
    console.log("Holdings for Acc 2:", JSON.stringify(holdings, null, 2));
    const voo2 = holdings.find(h => Number(h.id) === Number(result2.id));
    expect(voo2?.currentPrice).toBe("550.00");

    // 5. Test updatePrices syncs across all holdings
    mockedFinancialApi.fetchEtfPrice.mockClear();
    mockedFinancialApi.fetchEtfPrice.mockResolvedValue({
      symbol: "VOO",
      price: 600.00,
      timestamp: new Date(),
    });

    console.log("Calling updatePrices");
    await caller.etf.updatePrices({ portfolioId: Number(portfolio.id) });
    
    expect(mockedFinancialApi.fetchEtfPrice).toHaveBeenCalledTimes(1); // Once for unique symbol VOO

    // Verify both holdings are updated to 600
    const dbHoldings = await db.select().from(etfHoldings).where(and(eq(etfHoldings.userId, userId), eq(etfHoldings.symbol, "VOO")));
    expect(dbHoldings.length).toBe(2);
    expect(dbHoldings[0].currentPrice).toBe("600");
    expect(dbHoldings[1].currentPrice).toBe("600");
  });
});

