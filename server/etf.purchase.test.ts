import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
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

describe("Purchase Record Management", () => {
  beforeAll(async () => {
    const db = await getDb();
    const { portfolios, accounts, users, etfHoldings, purchases } = await import("../drizzle/schema");
    
    // Clean up
    await db.delete(purchases);
    await db.delete(etfHoldings);
    await db.delete(accounts);
    await db.delete(portfolios);
    await db.delete(users);

    // Seed test data
    await db.insert(users).values({ id: 1, openId: "test-user", name: "Test User" });
    await db.insert(portfolios).values({ id: 1, userId: 1, name: "Test Portfolio" });
    await db.insert(accounts).values({ id: 1, userId: 1, portfolioId: 1, name: "Test Account" });
  });

  it("should retrieve empty purchases for a new holding", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a holding
    const holding = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "QQQM",
      name: "Invesco QQQ Micro Cap ETF",
      quantity: "100.000",
      purchasePrice: "50.00",
      purchaseDate: new Date("2024-01-15"),
    });

    // Get purchases for the holding
    const purchases = await caller.etf.getPurchases({
      holdingId: Number(holding!.id),
    });

    // Should have at least one purchase (the initial one created when adding the holding)
    expect(purchases).toBeDefined();
    expect(purchases.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate average cost from purchases", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a holding with initial purchase
    const holding = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "50.000",
      purchasePrice: "400.00",
      purchaseDate: new Date("2024-01-01"),
    });

    // Calculate average cost
    const avgCost = await caller.etf.calculateAverageCost({
      holdingId: Number(holding!.id),
    });

    // Average cost should equal the purchase price
    expect(parseFloat(avgCost)).toBe(400.00);
  });

  it("should update average cost when buying more shares", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a holding
    const holding = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "QQQM",
      name: "Invesco QQQ Micro Cap ETF",
      quantity: "100.000",
      purchasePrice: "300.00",
      purchaseDate: new Date("2024-01-01"),
    });

    // Buy more shares at a different price
    const buyResult = await caller.etf.buyMoreShares({
      portfolioId: 1,
      accountId: 1,
      symbol: "QQQM",
      holdingId: Number(holding!.id),
      quantity: "50.000",
      price: "350.00",
      purchaseDate: new Date("2024-02-01"),
    });

    // Verify the buy result
    expect(buyResult.success).toBe(true);
    expect(buyResult.newQuantity).toBe("150.000");
    
    // Average cost should be (100*300 + 50*350) / 150 = 316.67
    expect(parseFloat(buyResult.averageCost)).toBeCloseTo(316.67, 1);

    // Verify by calculating average cost directly
    const avgCost = await caller.etf.calculateAverageCost({
      holdingId: Number(holding!.id),
    });
    expect(avgCost).toBeCloseTo(316.67, 1);
  });

  it("should have purchase records after adding a holding", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a holding
    const holding = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "SCHD",
      name: "Schwab US Dividend Equity ETF",
      quantity: "75.000",
      purchasePrice: "60.00",
      purchaseDate: new Date("2024-03-01"),
    });

    // Get purchases
    const purchases = await caller.etf.getPurchases({
      holdingId: Number(holding!.id),
    });

    // Should have exactly one purchase (the initial one)
    expect(purchases.length).toBe(1);
    expect(purchases[0]?.holdingId).toBe(Number(holding!.id));
    expect(purchases[0]?.quantity).toBe("75.000");
    expect(purchases[0]?.price).toBe("60.00");
    expect(purchases[0]?.symbol).toBe("SCHD");
  });
});

