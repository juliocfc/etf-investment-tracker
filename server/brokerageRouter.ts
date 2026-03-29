import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { Snaptrade } from "snaptrade-typescript-sdk";

const getSnapTradeClient = (clientId?: string, consumerKey?: string) => {
  return new Snaptrade({
    clientId: clientId || process.env.SNAPTRADE_CLIENT_ID || "",
    consumerKey: consumerKey || process.env.SNAPTRADE_CONSUMER_KEY || "",
  });
};

export const brokerageRouter = router({
  // List all SnapTrade users for the client
  listUsers: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      consumerKey: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        const response = await snaptrade.authentication.listSnapTradeUsers();
        return response.data; // Array of strings (user IDs)
      } catch (error: any) {
        console.error("SnapTrade listUsers error:", error.response?.data || error.message);
        throw new Error("Failed to fetch SnapTrade users");
      }
    }),

  // Get a redirect URL to the SnapTrade Connection Portal
  getLoginUrl: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      consumerKey: z.string().optional(),
      userId: z.string(),
      userSecret: z.string(),
      redirectURI: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        const response = await (snaptrade.authentication as any).loginSnapTradeUser({
          userId: input.userId,
          userSecret: input.userSecret,
          broker: "FIDELITY",
          immediateRedirect: true,
          customRedirect: input.redirectURI || "",
        });
        return response.data;
      } catch (error: any) {
        console.error("SnapTrade login error:", error.response?.data || error.message);
        throw new Error("Failed to get SnapTrade login URL");
      }
    }),

  // List all brokerage accounts for the user
  getAccounts: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      consumerKey: z.string().optional(),
      userId: z.string(),
      userSecret: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        const response = await snaptrade.accountInformation.listUserAccounts({
          userId: input.userId,
          userSecret: input.userSecret,
        });
        return response.data;
      } catch (error: any) {
        console.error("SnapTrade getAccounts error:", error.response?.data || error.message);
        throw new Error("Failed to fetch brokerage accounts");
      }
    }),

  // List transactions for a specific account
  getTransactions: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      consumerKey: z.string().optional(),
      userId: z.string(),
      userSecret: z.string(),
      startDate: z.string().optional(), // YYYY-MM-DD
      endDate: z.string().optional(),   // YYYY-MM-DD
      accounts: z.string().optional(),  // Comma-separated account IDs
    }))
    .query(async ({ input }) => {
      try {
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        const response = await snaptrade.transactionsAndReporting.getActivities({
          userId: input.userId,
          userSecret: input.userSecret,
          startDate: input.startDate,
          endDate: input.endDate,
          accounts: input.accounts,
        });
        return response.data;
      } catch (error: any) {
        console.error("SnapTrade getTransactions error:", error.response?.data || error.message);
        throw new Error("Failed to fetch brokerage transactions");
      }
    }),

  // List all holdings (positions) for all user accounts
  getHoldings: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      consumerKey: z.string().optional(),
      userId: z.string(),
      userSecret: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        // listUserAccounts returns an array of accounts, but we need the positions for EACH
        const accountsResponse = await snaptrade.accountInformation.listUserAccounts({
          userId: input.userId,
          userSecret: input.userSecret,
        });
        
        const allPositions: any[] = [];
        
        // Fetch positions for each account in parallel
        await Promise.all(accountsResponse.data.map(async (account: any) => {
          try {
            const positionsResponse = await snaptrade.accountInformation.getUserAccountPositions({
              userId: input.userId,
              userSecret: input.userSecret,
              accountId: account.id,
            });
            
            // Add account context to each position
            const positionsWithAccount = positionsResponse.data.map(p => ({
              ...p,
              account: {
                id: account.id,
                name: account.name,
                number: account.number,
              }
            }));
            
            allPositions.push(...positionsWithAccount);
          } catch (err) {
            console.error(`Failed to fetch positions for account ${account.id}:`, err);
          }
        }));
        
        return allPositions;
      } catch (error: any) {
        console.error("SnapTrade getHoldings error:", error.response?.data || error.message);
        throw new Error("Failed to fetch brokerage holdings");
      }
    }),

  getImportedTransactionIds: protectedProcedure
    .input(z.object({ source: z.string().default("snaptrade") }))
    .query(async ({ ctx, input }) => {
      const { getImportedTransactionIds } = await import("./db");
      const ids = await getImportedTransactionIds(ctx.user.id, input.source);
      return Array.from(ids);
    }),

  markTransactionsAsImported: protectedProcedure
    .input(z.object({
      externalIds: z.array(z.string()),
      source: z.string().default("snaptrade")
    }))
    .mutation(async ({ ctx, input }) => {
      const { markTransactionsAsImported } = await import("./db");
      await markTransactionsAsImported(ctx.user.id, input.externalIds, input.source);
      return { success: true };
    }),
});
