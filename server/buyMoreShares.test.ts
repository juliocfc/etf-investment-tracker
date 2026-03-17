import { describe, expect, it, beforeAll } from "vitest";
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
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("executeTrade", () => {
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

  it("should add a purchase and update holding quantity", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Ensure we have a holding
    await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "100",
      purchasePrice: "500.00",
      purchaseDate: new Date("2024-05-01"),
    });

    // Get existing holdings
    const holdings = await caller.etf.getHoldings({ portfolioId: 1, accountId: 1 });
    const holding = holdings.find(h => h.symbol === "VOO");
    if (!holding) {
      throw new Error("Holding not found after addHolding");
    }

    const initialQuantity = parseFloat(holding.quantity.toString());

    // Buy more shares at a different price
    const buyResult = await caller.etf.executeTrade({
      type: "buy",
      portfolioId: 1,
      holdingId: Number(holding.id),
      symbol: holding.symbol,
      accountId: 1,
      quantity: "50",
      price: "500.00",
      purchaseDate: new Date("2024-06-01"),
    });

    expect(buyResult.success).toBe(true);
    expect(parseFloat(buyResult.newQuantity)).toBe(initialQuantity + 50);
    expect(buyResult.averageCost).toBeDefined();
  });

  it("should throw error if holding not found", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.etf.executeTrade({
        type: "buy",
        portfolioId: 1,
        holdingId: 99999,
        symbol: "VOO",
        accountId: 1,
        quantity: "50",
        price: "500.00",
        purchaseDate: new Date(),
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      // The error might be "Invalid account selection" if account is also missing,
      // but since we seed account 1, it should reach the holding check.
      // Actually, if holdingId is 99999, it checks account first, then holding.
      expect(error.message).toContain("Holding not found");
    }
  });
});
