import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { deletePurchase, createEtfHolding, addPurchase } from "./db";

describe("deletePurchase", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("should decrement holding quantity when a purchase is deleted", async () => {
    if (!db) {
      console.log("Database not available, skipping test");
      return;
    }

    const { etfHoldings, purchases } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Create a test holding with 300 shares
    const holding = await createEtfHolding({
      userId: 1,
      symbol: "TESTDEL1",
      name: "Test ETF Delete 1",
      quantity: "300",
      purchasePrice: "100",
      purchaseDate: new Date(),
    });

    expect(holding).toBeDefined();
    console.log("Created holding:", holding?.id, "Qty:", holding?.quantity);

    // Add a purchase of 100 shares
    const purchase = await addPurchase(
      1,
      holding!.id,
      "TESTDEL1",
      "100",
      "100",
      new Date()
    );

    expect(purchase).toBeDefined();
    console.log("Created purchase:", purchase?.id, "Qty:", purchase?.quantity);

    // Get the holding before deletion
    const beforeDelete = await db
      .select()
      .from(etfHoldings)
      .where(eq(etfHoldings.id, holding!.id))
      .limit(1);

    console.log("Holding before delete:", beforeDelete[0]?.quantity);

    // Delete the purchase
    const deletedPurchase = await deletePurchase(purchase!.id);

    expect(deletedPurchase).toBeDefined();
    expect(deletedPurchase?.id).toBe(purchase!.id);

    // Verify the holding quantity was decremented
    const updatedHolding = await db
      .select()
      .from(etfHoldings)
      .where(eq(etfHoldings.id, holding!.id))
      .limit(1);

    console.log("Holding after delete:", updatedHolding[0]?.quantity);

    if (updatedHolding.length > 0) {
      const qty = parseFloat(updatedHolding[0].quantity.toString());
      console.log("Parsed quantity:", qty);
      expect(qty).toBe(200); // 300 - 100 = 200
    } else {
      throw new Error("Holding not found after purchase deletion");
    }

    // Clean up
    await db.delete(etfHoldings).where(eq(etfHoldings.id, holding!.id));
  });

  it("should delete holding when quantity becomes 0", async () => {
    if (!db) {
      console.log("Database not available, skipping test");
      return;
    }

    const { etfHoldings, purchases } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Create a test holding with 100 shares
    const holding = await createEtfHolding({
      userId: 1,
      symbol: "TESTDEL2",
      name: "Test ETF Delete 2",
      quantity: "100",
      purchasePrice: "100",
      purchaseDate: new Date(),
    });

    expect(holding).toBeDefined();
    console.log("Created holding:", holding?.id, "Qty:", holding?.quantity);

    // Add a purchase of 100 shares
    const purchase = await addPurchase(
      1,
      holding!.id,
      "TESTDEL2",
      "100",
      "100",
      new Date()
    );

    expect(purchase).toBeDefined();
    console.log("Created purchase:", purchase?.id, "Qty:", purchase?.quantity);

    // Delete the purchase (quantity becomes 0)
    const deletedPurchase = await deletePurchase(purchase!.id);

    expect(deletedPurchase).toBeDefined();

    // Verify the holding was deleted
    const remainingHolding = await db
      .select()
      .from(etfHoldings)
      .where(eq(etfHoldings.id, holding!.id))
      .limit(1);

    console.log("Remaining holdings:", remainingHolding.length);
    expect(remainingHolding.length).toBe(0);
  });
});
