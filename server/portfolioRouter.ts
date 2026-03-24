import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and, desc } from "./db";
import { portfolios, cashBalance, InsertPortfolio } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";

export const portfolioRouter = router({
  // Get all portfolios for the current user
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const userPortfolios = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, ctx.user.id));

    return userPortfolios;
  }),

  // Get detailed summary for all portfolios including account breakdown
  getDetailedAll: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const { getUserEtfHoldings } = await import("./db");
    const { accounts: accountsTable, cashBalance: cashBalanceTable } = await import("../drizzle/schema");

    const userPortfolios = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, ctx.user.id));

    const result = [];

    for (const portfolio of userPortfolios) {
      const portfolioAccounts = await db
        .select()
        .from(accountsTable)
        .where(and(
          eq(accountsTable.userId, ctx.user.id),
          eq(accountsTable.portfolioId, portfolio.id)
        ));

      const accountDetails = [];
      let portfolioInvestmentValue = 0;
      let portfolioCashValue = 0;

      for (const account of portfolioAccounts) {
        // Calculate investment value for this account
        const holdings = await getUserEtfHoldings(ctx.user.id, portfolio.id, account.id);
        let accountInvestmentValue = 0;
        let accountTotalCost = 0;

        for (const holding of holdings) {
          const currentPrice = holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0;
          const purchasePrice = holding.purchasePrice ? parseFloat(holding.purchasePrice.toString()) : 0;
          const quantity = parseFloat(holding.quantity.toString());
          
          accountInvestmentValue += currentPrice * quantity;
          accountTotalCost += purchasePrice * quantity;
        }

        // Calculate cash value for this account
        const cashRow = await db
          .select()
          .from(cashBalanceTable)
          .where(and(
            eq(cashBalanceTable.userId, ctx.user.id),
            eq(cashBalanceTable.portfolioId, portfolio.id),
            eq(cashBalanceTable.accountId, account.id)
          ))
          .then((rows: any[]) => rows[0]);
        
        const accountCashValue = cashRow ? parseFloat(cashRow.amount.toString()) : 0;
        const accountGain = accountInvestmentValue - accountTotalCost;
        const accountGainPercent = accountTotalCost > 0 ? (accountGain / accountTotalCost) * 100 : 0;

        accountDetails.push({
          id: account.id,
          name: account.name,
          number: account.number,
          investmentValue: accountInvestmentValue.toFixed(2),
          totalCost: accountTotalCost.toFixed(2),
          gain: accountGain.toFixed(2),
          gainPercent: accountGainPercent.toFixed(2),
          cashValue: accountCashValue.toFixed(2),
          totalValue: (accountInvestmentValue + accountCashValue).toFixed(2),
        });

        portfolioInvestmentValue += accountInvestmentValue;
        portfolioCashValue += accountCashValue;
      }

      // ALSO include the "default" cash (accountId = 0) that might not be in the accounts table
      const defaultCashRow = await db
        .select()
        .from(cashBalanceTable)
        .where(and(
          eq(cashBalanceTable.userId, ctx.user.id),
          eq(cashBalanceTable.portfolioId, portfolio.id),
          eq(cashBalanceTable.accountId, 0)
        ))
        .then((rows: any[]) => rows[0]);
      
      const defaultCashValue = defaultCashRow ? parseFloat(defaultCashRow.amount.toString()) : 0;
      if (defaultCashValue > 0) {
        portfolioCashValue += defaultCashValue;
        // Add a "virtual" account for the default cash if it has balance
        accountDetails.push({
          id: 0,
          name: "Default Cash",
          number: "No Account Assigned",
          investmentValue: "0.00",
          totalCost: "0.00",
          gain: "0.00",
          gainPercent: "0.00",
          cashValue: defaultCashValue.toFixed(2),
          totalValue: defaultCashValue.toFixed(2),
        });
      }

      const portfolioTotalCost = accountDetails.reduce((acc, a) => acc + parseFloat(a.totalCost), 0);
      const portfolioGain = portfolioInvestmentValue - portfolioTotalCost;
      const portfolioGainPercent = portfolioTotalCost > 0 ? (portfolioGain / portfolioTotalCost) * 100 : 0;

      result.push({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        investmentValue: portfolioInvestmentValue.toFixed(2),
        totalCost: portfolioTotalCost.toFixed(2),
        gain: portfolioGain.toFixed(2),
        gainPercent: portfolioGainPercent.toFixed(2),
        cashValue: portfolioCashValue.toFixed(2),
        totalValue: (portfolioInvestmentValue + portfolioCashValue).toFixed(2),
        accounts: accountDetails,
      });
    }

    return result;
  }),

  // Get consolidated summary for all portfolios
  getConsolidatedSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const { getUserEtfHoldings } = await import("./db");

    const userPortfolios = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, ctx.user.id));

    const cashBalances = await db
      .select()
      .from(cashBalance)
      .where(eq(cashBalance.userId, ctx.user.id));

    let totalInvestmentValue = 0;
    let totalCashBalance = 0;

    // Calculate total ETF value across all portfolios
    for (const portfolio of userPortfolios) {
      const holdings = await getUserEtfHoldings(ctx.user.id, portfolio.id);
      for (const holding of holdings) {
        const currentPrice = holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0;
        const quantity = parseFloat(holding.quantity.toString());
        totalInvestmentValue += currentPrice * quantity;
      }
    }

    // Calculate total cash
    for (const cash of cashBalances) {
      totalCashBalance += parseFloat(cash.amount.toString());
    }

    const totalValue = totalInvestmentValue + totalCashBalance;

    return {
      totalValue: totalValue.toFixed(2),
      investmentValue: totalInvestmentValue.toFixed(2),
      cashBalance: totalCashBalance.toFixed(2),
      investmentPercent: totalValue > 0 ? ((totalInvestmentValue / totalValue) * 100).toFixed(1) : "0",
      cashPercent: totalValue > 0 ? ((totalCashBalance / totalValue) * 100).toFixed(1) : "0",
    };
  }),

  // Get a specific portfolio by ID
  getById: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const portfolio = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      return portfolio;
    }),

  // Create a new portfolio
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Portfolio name is required").max(255),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const newPortfolio: InsertPortfolio = {
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
      };

      const result = await db.insert(portfolios).values(newPortfolio);
      let portfolioId = (result as any).lastInsertRowid;
      
      if (portfolioId === undefined) {
        // Fallback for drivers that don't return lastInsertRowid
        const row = await db.select({ id: portfolios.id })
          .from(portfolios)
          .where(eq(portfolios.userId, ctx.user.id))
          .orderBy(desc(portfolios.id))
          .limit(1)
          .then((rows: any[]) => rows[0]);
        portfolioId = row?.id;
      }

      // Create a cash balance entry for the new portfolio
      if (portfolioId) {
        await db.insert(cashBalance).values({
          userId: ctx.user.id,
          portfolioId: Number(portfolioId),
          amount: "0",
        });
      }

      return { id: Number(portfolioId), ...newPortfolio };
    }),

  // Update a portfolio
  update: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        name: z.string().min(1, "Portfolio name is required").max(255).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const portfolio = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;

      await db
        .update(portfolios)
        .set(updateData)
        .where(eq(portfolios.id, input.portfolioId));

      return { ...portfolio, ...updateData };
    }),

  // Delete a portfolio
  delete: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const portfolio = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      // Manually delete related records if cascade is not set
      const { purchases, etfHoldings, cashBalance, balanceHistory, accounts, cashBalanceHistory } = await import("../drizzle/schema");

      // 1. Delete all purchases for all holdings in this portfolio
      await db.delete(purchases).where(eq(purchases.portfolioId, input.portfolioId));

      // 2. Delete all holdings in this portfolio
      await db.delete(etfHoldings).where(eq(etfHoldings.portfolioId, input.portfolioId));

      // 3. Delete cash balance records
      await db.delete(cashBalance).where(eq(cashBalance.portfolioId, input.portfolioId));
      
      // 4. Delete cash balance history
      await db.delete(cashBalanceHistory).where(eq(cashBalanceHistory.portfolioId, input.portfolioId));

      // 5. Delete balance history
      await db.delete(balanceHistory).where(eq(balanceHistory.portfolioId, input.portfolioId));
      
      // 6. Delete all accounts in this portfolio
      await db.delete(accounts).where(eq(accounts.portfolioId, input.portfolioId));

      // 7. Finally delete the portfolio
      await db.delete(portfolios).where(eq(portfolios.id, input.portfolioId));

      return { success: true };
    }),

  // Get consolidated history for all portfolios
  getHistory: protectedProcedure
    .input(z.object({ days: z.number().default(365) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { purchases: purchasesTable, cashBalanceHistory: cashBalanceHistoryTable, etfHoldings: holdingsTable } = await import("../drizzle/schema");
      const { getSmartHistoricalPrices } = await import("./priceService");

      const cashHistory = await db
        .select()
        .from(cashBalanceHistoryTable)
        .where(eq(cashBalanceHistoryTable.userId, ctx.user.id))
        .orderBy(desc(cashBalanceHistoryTable.date), desc(cashBalanceHistoryTable.id));

      const allPurchases = await db
        .select()
        .from(purchasesTable)
        .where(eq(purchasesTable.userId, ctx.user.id))
        .orderBy(desc(purchasesTable.purchaseDate));

      const holdings = await db
        .select()
        .from(holdingsTable)
        .where(eq(holdingsTable.userId, ctx.user.id));

      // Fetch historical prices for all unique symbols in parallel
      const symbols = Array.from(new Set(holdings.map((h: any) => h.symbol.toUpperCase()))) as string[];
      const historicalPrices: Record<string, any[]> = {};

      // Filter to save only 1st and last day of month to DB cache
      const saveFilter = (date: Date) => {
        const d = new Date(date);
        const day = d.getUTCDate();
        const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        return day === 1 || day === lastDay;
      };

      await Promise.all(symbols.map(async (symbol) => {
        // Fetch with '1mo' interval for the frontend, but the service will fetch daily and save filtered in background
        const prices = await getSmartHistoricalPrices(symbol, input.days, '1mo', saveFilter);
        historicalPrices[symbol] = prices;
      }));

      return {
        cashHistory,
        purchases: allPurchases,
        holdings,
        historicalPrices
      };
    }),

  // Get all holdings for the current user
  getAllHoldings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const { etfHoldings: holdingsTable } = await import("../drizzle/schema");
    const { fetchDividendData } = await import("./financialApi");

    const holdings = await db
      .select()
      .from(holdingsTable)
      .where(eq(holdingsTable.userId, ctx.user.id));

    const holdingsWithDividends = [];
    
    // Group symbols to fetch dividends only once per symbol
    const symbols = Array.from(new Set(holdings.map((h: any) => h.symbol.toUpperCase()))) as string[];
    const symbolDividends: Record<string, number> = {};

    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

    for (const symbol of symbols) {
      try {
        const dividendData = await fetchDividendData(symbol);
        if (dividendData && dividendData.length > 0) {
          // 1. Get payments in the last 12 months strictly (Trailing Twelve Months)
          const lastYearPayments = dividendData.filter((d: any) => {
            const dDate = new Date(d.exDate);
            return dDate >= twelveMonthsAgo && dDate <= now;
          });

          // 2. Estimate annual DPS based on frequency for better projection
          // Sort by date desc to get the most recent ones
          const sortedData = [...dividendData].sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
          
          let estimatedAnnualDPS = 0;
          if (lastYearPayments.length >= 10) {
            // Likely a monthly payer - use the most recent payment * 12
            estimatedAnnualDPS = sortedData[0].dividendPerShare * 12;
          } else if (lastYearPayments.length >= 3) {
            // Likely a quarterly payer - use the most recent payment * 4
            estimatedAnnualDPS = sortedData[0].dividendPerShare * 4;
          } else {
            // Irregular or semi-annual - use sum of last 12 months
            estimatedAnnualDPS = lastYearPayments.reduce((sum: number, d: any) => sum + d.dividendPerShare, 0);
          }
          
          symbolDividends[symbol] = estimatedAnnualDPS;
        } else {
          symbolDividends[symbol] = 0;
        }
      } catch (error) {
        console.error(`Error fetching dividends for ${symbol}:`, error);
        symbolDividends[symbol] = 0;
      }
    }

    for (const holding of holdings) {
      holdingsWithDividends.push({
        ...holding,
        annualDividendPerShare: symbolDividends[holding.symbol.toUpperCase()] || 0
      });
    }

    return holdingsWithDividends;
  }),
});
