import { describe, expect, it, vi, beforeEach } from "vitest";
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("etf.addHolding", () => {
  it("creates a holding with correct structure", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const holdingData = {
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
    expect(typeof result?.id).toBe("number");
    expect(result?.symbol).toBe("QQQM");
    expect(result?.name).toBe("Invesco QQQ Micro Cap ETF");
    expect(result?.quantity).toBe("100.000");
    expect(result?.purchasePrice).toBe("50.00");
  });

  it("average cost should be calculated for newly added holdings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const holdingData = {
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      quantity: "50.000",
      purchasePrice: "400.00",
      purchaseDate: new Date("2024-01-01"),
    };

    const result = await caller.etf.addHolding(holdingData);
    
    // Get holdings and verify average cost is not null
    const holdings = await caller.etf.getHoldings();
    const newHolding = holdings.find((h) => h.id === result?.id);
    
    expect(newHolding).toBeDefined();
    expect(newHolding?.averageCost).not.toBeNull();
    expect(newHolding?.averageCost).toBe(400.00);
  });
});

describe("etf.buyMoreShares", () => {
  it("updates average cost when buying more shares", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Add first holding
    const holding1 = await caller.etf.addHolding({
      symbol: "QQQM",
      name: "Invesco QQQ Micro Cap ETF",
      quantity: "100.000",
      purchasePrice: "300.00",
      purchaseDate: new Date("2024-01-01"),
    });

    // Add more shares
    const buyResult = await caller.etf.buyMoreShares({
      holdingId: holding1!.id,
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
