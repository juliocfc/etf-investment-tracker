import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("buyMoreShares", () => {
  it("should add a purchase and update holding quantity", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Get existing holdings
    const holdings = await caller.etf.getHoldings();
    if (holdings.length === 0) {
      console.log("Skipping test: No holdings found");
      return;
    }

    const holding = holdings[0];
    const initialQuantity = parseFloat(holding.quantity.toString());

    // Buy more shares at a different price
    const buyResult = await caller.etf.buyMoreShares({
      holdingId: holding.id,
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
      await caller.etf.buyMoreShares({
        holdingId: 99999,
        quantity: "50",
        price: "500.00",
        purchaseDate: new Date(),
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).toContain("Holding not found");
    }
  });
});
