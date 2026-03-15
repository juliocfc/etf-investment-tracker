import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { deletePurchase, createEtfHolding, addPurchase, calculateAverageCost } from "./db";

describe("deletePurchase", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
    const { portfolios, accounts, users } = await import("../drizzle/schema");
    
    // Seed test data
    await db.insert(users).values({ id: 1, openId: "test-user", name: "Test User" }).onConflictDoNothing();
    await db.insert(portfolios).values({ id: 1, userId: 1, name: "Test Portfolio" }).onConflictDoNothing();
    await db.insert(accounts).values({ id: 1, userId: 1, portfolioId: 1, name: "Test Account" }).onConflictDoNothing();
  });

  it("should decrement holding quantity when a purchase is deleted", async () => {
    if (!db) {
      console.log("Database not available, skipping test");
      return;
    }

    const { etfHoldings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Create a test holding
    const holdingId = await createEtfHolding({
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      symbol: "TESTDEL1",
      name: "Test ETF Delete 1",
      quantity: "300",
      purchasePrice: "100",
      currentPrice: "110",
      purchaseDate: new Date(),
    });

    expect(holdingId).toBeDefined();

    // Add initial purchases totaling 300
    await addPurchase({
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holdingId),
      symbol: "TESTDEL1",
      quantity: "200",
      price: "100",
      purchaseDate: new Date()
    });

    const purchaseId = await addPurchase({
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holdingId),
      symbol: "TESTDEL1",
      quantity: "100",
      price: "100",
      purchaseDate: new Date()
    });

    expect(purchaseId).toBeDefined();

    // Delete the purchase
    await deletePurchase(Number(purchaseId));
    await calculateAverageCost(Number(holdingId));

    // Verify the holding quantity was decremented
    const updatedHolding = await db
      .select()
      .from(etfHoldings)
      .where(eq(etfHoldings.id, Number(holdingId)))
      .limit(1);

    if (updatedHolding.length > 0) {
      const qty = parseFloat(updatedHolding[0].quantity.toString());
      expect(qty).toBe(200); // 300 - 100 = 200
    } else {
      throw new Error("Holding not found after purchase deletion");
    }

    // Clean up
    await db.delete(etfHoldings).where(eq(etfHoldings.id, Number(holdingId)));
  });

  it("should delete holding when quantity becomes 0", async () => {
    if (!db) {
      console.log("Database not available, skipping test");
      return;
    }

    const { etfHoldings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Create a test holding with 100 shares
    const holdingId = await createEtfHolding({
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      symbol: "TESTDEL2",
      name: "Test ETF Delete 2",
      quantity: "100",
      purchasePrice: "100",
      currentPrice: "110",
      purchaseDate: new Date(),
    });

    expect(holdingId).toBeDefined();

    // Add a purchase of 100 shares
    const purchaseId = await addPurchase({
      userId: 1,
      portfolioId: 1,
      accountId: 1,
      holdingId: Number(holdingId),
      symbol: "TESTDEL2",
      quantity: "100",
      price: "100",
      purchaseDate: new Date()
    });

    expect(purchaseId).toBeDefined();

    // Delete the purchase (quantity becomes 0)
    await deletePurchase(Number(purchaseId));
    await calculateAverageCost(Number(holdingId));

    // Verify the holding was deleted
    const remainingHolding = await db
      .select()
      .from(etfHoldings)
      .where(eq(etfHoldings.id, Number(holdingId)))
      .limit(1);

    expect(remainingHolding.length).toBe(0);
  });
});
