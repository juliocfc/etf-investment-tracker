import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "test-user-summary-filter",
    email: "test-filter@example.com",
    name: "Test User Summary Filter",
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

describe("ETF Portfolio Summary Filtering", () => {
  beforeAll(async () => {
    const db = await getDb();
    const { portfolios, accounts, users, etfHoldings, purchases, cashBalance } = await import("../drizzle/schema");
    
    // Clean up
    await db.delete(purchases);
    await db.delete(etfHoldings);
    await db.delete(cashBalance);
    await db.delete(accounts);
    await db.delete(portfolios);
    await db.delete(users);

    // Seed test data
    await db.insert(users).values({ id: 999, openId: "test-user-summary-filter", name: "Test User Summary Filter" });
  });

  it("should filter accountTypeBreakdown by accountType", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 1. Create a portfolio
    const portfolio = await caller.portfolio.create({
      name: "Filter Test Portfolio",
    });
    const portfolioId = Number(portfolio.id);

    // 2. Create accounts of different types
    const brokerageAccount = await caller.account.addAccount({
      portfolioId,
      name: "My Brokerage",
      accountType: "Brokerage",
    });
    const retirementAccount = await caller.account.addAccount({
      portfolioId,
      name: "My Retirement",
      accountType: "Retirement",
    });

    const brokerageId = Number(brokerageAccount.id);
    const retirementId = Number(retirementAccount.id);

    // 3. Add some cash to both
    await caller.brokerage.adjustCashBalance({
      portfolioId,
      accountId: brokerageId,
      amount: "1000.00",
      description: "Initial deposit",
    });

    await caller.brokerage.adjustCashBalance({
      portfolioId,
      accountId: retirementId,
      amount: "2000.00",
      description: "Initial deposit",
    });

    // 4. Get summary without filter (should show both)
    const summaryAll = await caller.etf.getPortfolioSummary({
      portfolioId,
    });

    expect(summaryAll.accountTypeBreakdown.length).toBeGreaterThanOrEqual(2);
    expect(summaryAll.accountTypeBreakdown.some(b => b.type === "Brokerage")).toBe(true);
    expect(summaryAll.accountTypeBreakdown.some(b => b.type === "Retirement")).toBe(true);

    // 5. Get summary with Retirement filter
    const summaryRetirement = await caller.etf.getPortfolioSummary({
      portfolioId,
      accountType: "Retirement",
    });

    // It should only show Retirement in the breakdown
    expect(summaryRetirement.accountTypeBreakdown.length).toBe(1);
    expect(summaryRetirement.accountTypeBreakdown[0].type).toBe("Retirement");
    expect(parseFloat(summaryRetirement.accountTypeBreakdown[0].value)).toBe(2000.00);

    // 6. Get summary with Brokerage filter
    const summaryBrokerage = await caller.etf.getPortfolioSummary({
      portfolioId,
      accountType: "Brokerage",
    });

    expect(summaryBrokerage.accountTypeBreakdown.length).toBe(1);
    expect(summaryBrokerage.accountTypeBreakdown[0].type).toBe("Brokerage");
    expect(parseFloat(summaryBrokerage.accountTypeBreakdown[0].value)).toBe(1000.00);

    // 7. Get summary for a specific account
    const summarySpecific = await caller.etf.getPortfolioSummary({
      portfolioId,
      accountId: brokerageId,
    });

    expect(summarySpecific.accountTypeBreakdown.length).toBe(1);
    expect(summarySpecific.accountTypeBreakdown[0].type).toBe("Brokerage");
    expect(parseFloat(summarySpecific.accountTypeBreakdown[0].value)).toBe(1000.00);
  });
});
