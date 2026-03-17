import { describe, expect, it, beforeEach } from "vitest";
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
  beforeEach(async () => {
    const db = await getDb();
    const { portfolios, accounts, users, etfHoldings, purchases, cashBalanceHistory, cashBalance } = await import("../drizzle/schema");
    
    // Clean up
    await db.delete(purchases);
    await db.delete(etfHoldings);
    await db.delete(cashBalanceHistory);
    await db.delete(cashBalance);
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

  it("should update existing holding instead of erroring when symbol already exists in account", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 1. Initial purchase
    await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500",
      quantity: "10",
      purchasePrice: "500.00",
      purchaseDate: new Date("2024-01-01"),
    });

    // 2. Second purchase using addHolding (mimicking the top button action)
    const result = await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500",
      quantity: "5",
      purchasePrice: "520.00",
      purchaseDate: new Date("2024-02-01"),
    });

    // Should return the same ID or a valid ID, not error
    expect(result?.id).toBeDefined();

    // Verify consolidated result
    const holdings = await caller.etf.getHoldings({ portfolioId: 1, accountId: 1 });
    const holding = holdings.find(h => h.symbol === "VOO");
    expect(parseFloat(holding!.quantity)).toBe(15);
    // Average cost: (10*500 + 5*520) / 15 = (5000 + 2600) / 15 = 7600 / 15 = 506.67
    expect(parseFloat(holding!.averageCost || "0")).toBeCloseTo(506.67, 1);
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
