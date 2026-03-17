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

describe("etf.executeTrade (Sell/FIFO)", () => {
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

  it("should sell shares using FIFO and update cash balance", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Initial Deposit
    await caller.etf.recordCashTransaction({
      portfolioId: 1,
      accountId: 1,
      type: "deposit",
      amount: "1000.00",
      description: "Initial Deposit",
      date: new Date("2023-12-31")
    });

    // 1. Add two purchases
    // Purchase 1: 10 units at $100
    await caller.etf.addHolding({
      portfolioId: 1,
      accountId: 1,
      symbol: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      quantity: "10",
      purchasePrice: "100.00",
      purchaseDate: new Date("2024-01-01"),
      fees: "0"
    });

    // Purchase 2: 5 units at $120
    const holdings = await caller.etf.getHoldings({ portfolioId: 1, accountId: 1 });
    const holding = holdings.find(h => h.symbol === "SPY");
    
    await caller.etf.executeTrade({
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holding!.id),
      symbol: "SPY",
      quantity: "5",
      price: "120.00",
      purchaseDate: new Date("2024-02-01"),
      type: "buy",
      fees: "0"
    });

    // Capture baseline cash after both buys
    const baselineCash = parseFloat(await caller.etf.getCashBalance({ portfolioId: 1, accountId: 1 }));

    // 2. Sell 8 units at $150 (Proceeds: 8 * 150 = $1200)
    // This should take 8 units from Purchase 1 (10 units).
    // Purchase 1 should be updated to 2 units.
    const sellResult = await caller.etf.executeTrade({
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holding!.id),
      symbol: "SPY",
      quantity: "8",
      price: "150.00",
      purchaseDate: new Date("2024-03-01"),
      type: "sell",
      fees: "10.00" // $1200 - $10 = $1190 net proceeds
    });

    expect(sellResult.success).toBe(true);
    expect(parseFloat(sellResult.newQuantity)).toBe(7); // (10 + 5) - 8 = 7

    // 3. Verify Cash Balance
    // Net proceeds: $1190
    const expectedCashAfterSale1 = baselineCash + 1190;
    const currentCash1 = parseFloat(await caller.etf.getCashBalance({ portfolioId: 1, accountId: 1 }));
    expect(currentCash1).toBe(expectedCashAfterSale1);

    // 4. Verify Purchases (FIFO)
    const allPurchases = await caller.etf.getPurchases({ holdingId: Number(holding!.id) });
    expect(allPurchases.length).toBe(2);
    
    // Oldest purchase should now have 2 units
    const oldest = allPurchases.find(p => p.purchaseDate.getTime() === new Date("2024-01-01").getTime());
    expect(parseFloat(oldest!.quantity)).toBe(2);

    // 5. Sell 4 more units at $160 (Proceeds: 4 * 160 = $640)
    // This should consume the remaining 2 units of Purchase 1 AND 2 units of Purchase 2.
    // Purchase 1 should be deleted.
    // Purchase 2 should be updated to 3 units (5 - 2 = 3).
    await caller.etf.executeTrade({
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holding!.id),
      symbol: "SPY",
      quantity: "4",
      price: "160.00",
      purchaseDate: new Date("2024-04-01"),
      type: "sell",
      fees: "0"
    });

    const remainingPurchases = await caller.etf.getPurchases({ holdingId: Number(holding!.id) });
    expect(remainingPurchases.length).toBe(1);
    expect(parseFloat(remainingPurchases[0].quantity)).toBe(3);
    expect(remainingPurchases[0].purchaseDate.getTime()).toBe(new Date("2024-02-01").getTime());

    // Verify final cash: expectedCashAfterSale1 + 640
    const finalCash = parseFloat(await caller.etf.getCashBalance({ portfolioId: 1, accountId: 1 }));
    expect(finalCash).toBe(expectedCashAfterSale1 + 640);
  });

  it("should decrement cash balance when executing a BUY trade", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Initial state: ensure we have some cash
    await caller.etf.recordCashTransaction({
      portfolioId: 1,
      accountId: 1,
      type: "deposit",
      amount: "2000.00",
      description: "Initial Test Deposit",
      date: new Date()
    });

    const initialCash = parseFloat(await caller.etf.getCashBalance({ portfolioId: 1, accountId: 1 }));
    expect(initialCash).toBe(2000.00);

    // Execute a BUY trade
    // 2 units at $100 + $10 fees = $210 total cost
    await caller.etf.executeTrade({
      portfolioId: 1,
      accountId: 1,
      holdingId: -1, // Use symbol lookup
      symbol: "VOO",
      quantity: "2",
      price: "100.00",
      purchaseDate: new Date(), // Today
      type: "buy",
      fees: "10.00"
    });

    const finalCash = parseFloat(await caller.etf.getCashBalance({ portfolioId: 1, accountId: 1 }));
    expect(finalCash).toBe(1790.00); // 2000 - 210 = 1790
  });
});
