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
    .query(async ({ ctx, input }) => {
      const { 
        getLastBrokerageSync, 
        updateLastBrokerageSync, 
        upsertBrokerageTransactions, 
        getBrokerageTransactions 
      } = await import("./db");

      try {
        const lastSync = await getLastBrokerageSync(ctx.user.id);
        const now = new Date();
        const isToday = lastSync && 
          new Date(lastSync.lastSyncAt).toDateString() === now.toDateString();

        // Helper to augment SnapTrade data with DB info (like importDate)
        const augmentWithDbInfo = async (snapTxs: any[]) => {
          const dbTxs = await getBrokerageTransactions(ctx.user.id);
          const dbMap = new Map(dbTxs.map(t => [t.externalId, t]));
          
          return snapTxs.map(tx => {
            const dbInfo = dbMap.get(tx.id);
            return {
              ...tx,
              importDate: dbInfo?.importDate || null,
              updatedAt: dbInfo?.updatedAt || null,
            };
          });
        };

        // If synced today, return from DB
        if (isToday) {
          const start = input.startDate ? new Date(input.startDate) : undefined;
          const end = input.endDate ? new Date(input.endDate) : undefined;
          const accountIds = input.accounts ? input.accounts.split(',') : undefined;
          
          const dbTransactions = await getBrokerageTransactions(ctx.user.id, start, end, accountIds);
          
          if (dbTransactions.length > 0) {
            console.log(`[Brokerage] Cache HIT for user ${ctx.user.id} (${dbTransactions.length} items)`);
            return {
              transactions: dbTransactions.map(tx => ({
                ...JSON.parse(tx.rawResponse),
                importDate: tx.importDate,
                updatedAt: tx.updatedAt,
              })),
              lastSyncAt: lastSync.lastSyncAt
            };
          }
        }

        // 2. Cache miss: Fetch from SnapTrade
        console.log(`[Brokerage] Cache MISS for user ${ctx.user.id}. Fetching from SnapTrade...`);
        const snaptrade = getSnapTradeClient(input.clientId, input.consumerKey);
        const response = await snaptrade.transactionsAndReporting.getActivities({
          userId: input.userId,
          userSecret: input.userSecret,
          startDate: input.startDate,
          endDate: input.endDate,
          accounts: input.accounts,
        });

        // Trigger background update
        (async () => {
          try {
            await upsertBrokerageTransactions(ctx.user.id, response.data);
            await updateLastBrokerageSync(ctx.user.id);
            console.log(`[Brokerage] Background sync completed for user ${ctx.user.id}`);
          } catch (err) {
            console.error(`[Brokerage] Background sync failed:`, err);
          }
        })();

        // For the immediate response on MISS, we try to augment with what we have in DB
        const augmented = await augmentWithDbInfo(response.data);

        return {
          transactions: augmented,
          lastSyncAt: lastSync?.lastSyncAt
        };
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
    .query(async ({ ctx, input }) => {
      const { 
        getLastBrokerageSync, 
        updateLastHoldingsSync, 
        upsertBrokerageHoldings, 
        getBrokerageHoldings 
      } = await import("./db");

      try {
        // 1. Check last sync time
        const lastSync = await getLastBrokerageSync(ctx.user.id);
        const now = new Date();
        const isToday = lastSync && lastSync.lastHoldingsSyncAt && 
          new Date(lastSync.lastHoldingsSyncAt).toDateString() === now.toDateString();

        // If synced today, return from DB
        if (isToday) {
          const dbHoldings = await getBrokerageHoldings(ctx.user.id);
          if (dbHoldings.length > 0) {
            console.log(`[Brokerage] Holdings cache HIT for user ${ctx.user.id} (${dbHoldings.length} items)`);
            return {
              holdings: dbHoldings.map(h => ({
                ...JSON.parse(h.rawResponse),
                account: {
                  id: h.accountId,
                  name: h.accountName,
                  number: h.accountNumber,
                }
              })),
              lastSyncAt: lastSync.lastHoldingsSyncAt
            };
          }
        }

        // 2. Cache miss: Fetch from SnapTrade
        console.log(`[Brokerage] Holdings cache MISS for user ${ctx.user.id}. Fetching from SnapTrade...`);
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

        // 3. Trigger background update
        (async () => {
          try {
            await upsertBrokerageHoldings(ctx.user.id, allPositions);
            await updateLastHoldingsSync(ctx.user.id);
            console.log(`[Brokerage] Background holdings sync completed for user ${ctx.user.id}`);
          } catch (err) {
            console.error(`[Brokerage] Background holdings sync failed:`, err);
          }
        })();
        
        return {
          holdings: allPositions,
          lastSyncAt: lastSync?.lastHoldingsSyncAt
        };
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
