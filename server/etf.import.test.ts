import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(): TrpcContext {
  const user = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus" as const,
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

describe("ETF CSV Import", () => {
  it("should require accountId and verify it belongs to portfolio", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This should fail because accountId 999 doesn't exist for this user/portfolio
    await expect(caller.etf.importPurchasesFromCSV({
      portfolioId: 1,
      holdingId: -1,
      symbol: "VOO",
      csvContent: "date,quantity,cost\n2024-01-01,10,400",
      accountId: 999,
    })).rejects.toThrow("Invalid account selection for this portfolio");
  });
});
