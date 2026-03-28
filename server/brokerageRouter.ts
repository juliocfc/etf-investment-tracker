import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { Snaptrade } from "snaptrade-typescript-sdk";

const snaptrade = new Snaptrade({
  clientId: process.env.SNAPTRADE_CLIENT_ID || "",
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY || "",
});

export const brokerageRouter = router({
  // Get a redirect URL to the SnapTrade Connection Portal
  getLoginUrl: protectedProcedure
    .input(z.object({
      userId: z.string(),
      userSecret: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const response = await snaptrade.authentication.loginSnapTradeUser({
          userId: input.userId,
          userSecret: input.userSecret,
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
      userId: z.string(),
      userSecret: z.string(),
    }))
    .query(async ({ input }) => {
      try {
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
      userId: z.string(),
      userSecret: z.string(),
      startDate: z.string().optional(), // YYYY-MM-DD
      endDate: z.string().optional(),   // YYYY-MM-DD
      accounts: z.string().optional(),  // Comma-separated account IDs
    }))
    .query(async ({ input }) => {
      try {
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
});
