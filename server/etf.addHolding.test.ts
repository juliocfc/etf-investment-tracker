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

describe("etf.addHolding", () => {
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

  it("creates a holding with correct structure", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const holdingData = {
      portfolioId: 1,
      accountId: 1,
      symbol: "QQQM",
      name: "Invesco QQQ Micro Cap ETF",
      quantity: "100.000",
      purchasePrice: "50.00",
      purchaseDate: new Date("2024-01-15"),
    };

    // Add a holding
    const result = await caller.etf.addHolding(holdingData);

    // Verify the holding was created with an ID
    expect(result).toBeDefined();
    expect(result?.id).toBeDefined();
    expect(typeof Number(result?.id)).toBe("number");
  });

  it("average cost should be calculated for newly added holdings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const holdingData = {
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "50.000",
      purchasePrice: "400.00",
      purchaseDate: new Date("2024-01-01"),
    };

    const result = await caller.etf.addHolding(holdingData);
    const holdingId = Number(result?.id);
    
    // Get holdings and verify average cost is not null
    const holdings = await caller.etf.getHoldings({ portfolioId: 1, accountId: 1 });
    const newHolding = holdings.find((h) => Number(h.id) === holdingId);
    
    expect(newHolding).toBeDefined();
    expect(newHolding?.averageCost).not.toBeNull();
    expect(parseFloat(newHolding?.averageCost || "0")).toBe(400.00);
  });
});

describe("etf.buyMoreShares", () => {
  it("updates average cost when buying more shares", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Add first holding
    const result1 = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "QQQM",
      name: "Invesco QQQ Micro Cap ETF",
      quantity: "100.000",
      purchasePrice: "300.00",
      purchaseDate: new Date("2024-01-01"),
    });

    const holdingId1 = Number(result1?.id);

    // Add more shares
    const buyResult = await caller.etf.buyMoreShares({
      portfolioId: 1,
      accountId: 1,
      holdingId: holdingId1,
      symbol: "QQQM",
      quantity: "50.000",
      price: "350.00",
      purchaseDate: new Date("2024-02-01"),
    });

    // Verify the buy result
    expect(buyResult.success).toBe(true);
    expect(buyResult.newQuantity).toBe("150.000");
    
    // Average cost should be (100*300 + 50*350) / 150 = 316.67
    expect(parseFloat(buyResult.averageCost)).toBeCloseTo(316.67, 1);
  });
});
