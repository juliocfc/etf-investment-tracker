import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { eq } from "drizzle-orm";

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

describe("moveAccount", () => {
  beforeAll(async () => {
    const db = await getDb();
    const { portfolios, accounts, users, etfHoldings, purchases, cashBalance, cashBalanceHistory } = await import("../drizzle/schema");
    
    // Clean up in reverse dependency order
    await db.delete(purchases);
    await db.delete(cashBalanceHistory);
    await db.delete(cashBalance);
    await db.delete(etfHoldings);
    await db.delete(accounts);
    await db.delete(portfolios);
    await db.delete(users);

    // Seed test data
    await db.insert(users).values({ id: 1, openId: "test-user", name: "Test User" });
    await db.insert(portfolios).values({ id: 1, userId: 1, name: "Test Portfolio 1" });
    await db.insert(portfolios).values({ id: 2, userId: 1, name: "Test Portfolio 2" });
    await db.insert(accounts).values({ id: 1, userId: 1, portfolioId: 1, name: "Test Account" });

    // Seed related data for Account 1, Portfolio 1
    await db.insert(etfHoldings).values({
      id: 1,
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "10.0",
      purchasePrice: "400.0",
      currentPrice: "400.0",
      purchaseDate: new Date(),
    });

    await db.insert(purchases).values({
      id: 1,
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      holdingId: 1,
      symbol: "VOO",
      quantity: "10.0",
      price: "400.0",
      purchaseDate: new Date(),
    });

    await db.insert(cashBalance).values({
      id: 1,
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      amount: "1000.0",
    });

    await db.insert(cashBalanceHistory).values({
      id: 1,
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      amount: "1000.0",
      transactionType: "deposit",
      transactionAmount: "1000.0",
      description: "Initial deposit",
      date: new Date(),
    });
  });

  it("should move account and all related records to the target portfolio", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const db = await getDb();
    const { accounts, etfHoldings, purchases, cashBalance, cashBalanceHistory } = await import("../drizzle/schema");

    // Verify initial state
    const initialAccount = await db.select().from(accounts).where(eq(accounts.id, 1)).then(r => r[0]);
    expect(initialAccount.portfolioId).toBe(1);

    const initialHolding = await db.select().from(etfHoldings).where(eq(etfHoldings.accountId, 1)).then(r => r[0]);
    expect(initialHolding.portfolioId).toBe(1);

    const initialPurchase = await db.select().from(purchases).where(eq(purchases.accountId, 1)).then(r => r[0]);
    expect(initialPurchase.portfolioId).toBe(1);

    const initialCash = await db.select().from(cashBalance).where(eq(cashBalance.accountId, 1)).then(r => r[0]);
    expect(initialCash.portfolioId).toBe(1);

    const initialCashHist = await db.select().from(cashBalanceHistory).where(eq(cashBalanceHistory.accountId, 1)).then(r => r[0]);
    expect(initialCashHist.portfolioId).toBe(1);

    // Call TRPC procedure to move account to portfolio 2
    const result = await caller.account.moveAccount({
      accountId: 1,
      targetPortfolioId: 2,
    });

    expect(result.success).toBe(true);

    // Verify final state
    const updatedAccount = await db.select().from(accounts).where(eq(accounts.id, 1)).then(r => r[0]);
    expect(updatedAccount.portfolioId).toBe(2);

    const updatedHolding = await db.select().from(etfHoldings).where(eq(etfHoldings.accountId, 1)).then(r => r[0]);
    expect(updatedHolding.portfolioId).toBe(2);

    const updatedPurchase = await db.select().from(purchases).where(eq(purchases.accountId, 1)).then(r => r[0]);
    expect(updatedPurchase.portfolioId).toBe(2);

    const updatedCash = await db.select().from(cashBalance).where(eq(cashBalance.accountId, 1)).then(r => r[0]);
    expect(updatedCash.portfolioId).toBe(2);

    const updatedCashHist = await db.select().from(cashBalanceHistory).where(eq(cashBalanceHistory.accountId, 1)).then(r => r[0]);
    expect(updatedCashHist.portfolioId).toBe(2);
  });
});
