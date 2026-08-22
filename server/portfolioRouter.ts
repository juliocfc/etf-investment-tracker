import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and, desc, truncateNumber } from "./db";
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
          
          accountInvestmentValue += truncateNumber(currentPrice * quantity);
          accountTotalCost += truncateNumber(purchasePrice * quantity);
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
          accountType: account.accountType,
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
        totalValue: truncateNumber(portfolioInvestmentValue + portfolioCashValue).toFixed(2),
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
        totalInvestmentValue += truncateNumber(currentPrice * quantity);
      }
    }

    // Calculate total cash
    for (const cash of cashBalances) {
      totalCashBalance += parseFloat(cash.amount.toString());
    }

    const totalValue = truncateNumber(totalInvestmentValue + totalCashBalance);

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
        .orderBy(desc(purchasesTable.purchaseDate), desc(purchasesTable.id));

      const holdings = await db
        .select()
        .from(holdingsTable)
        .where(eq(holdingsTable.userId, ctx.user.id));

      // Fetch historical prices for all unique symbols in parallel
      const symbols = Array.from(new Set(holdings.map((h: any) => h.symbol.toUpperCase()))) as string[];
      const historicalPrices: Record<string, any[]> = {};

      await Promise.all(symbols.map(async (symbol) => {
        // Fetch with '1mo' interval for the frontend
        const prices = await getSmartHistoricalPrices(symbol, input.days, '1mo');
        historicalPrices[symbol] = prices;
      }));

      return {
        cashHistory,
        purchases: allPurchases,
        holdings,
        historicalPrices
      };
    }),

  // Get yearly performance summary for all portfolios (consolidated)
  getYearlyPerformance: protectedProcedure
    .input(z.object({ portfolioId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { getUserEtfHoldings, getCashBalanceHistory } = await import("./db");
      const { getSmartHistoricalPrices } = await import("./priceService");
      const { purchases: purchasesTable } = await import("../drizzle/schema");

      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      
      const purchaseConditions = [
        eq(purchasesTable.userId, ctx.user.id),
      ];
      if (input.portfolioId !== undefined) {
        purchaseConditions.push(eq(purchasesTable.portfolioId, input.portfolioId));
      }

      const allPurchases = await db.select()
        .from(purchasesTable)
        .where(and(...purchaseConditions))
        .orderBy(purchasesTable.purchaseDate);
      
      const cashHistory = await getCashBalanceHistory(ctx.user.id, input.portfolioId);

      const now = new Date();
      const currentYear = now.getFullYear();
      
      let oldestDate = now;
      if (allPurchases.length > 0 && new Date(allPurchases[0].purchaseDate) < oldestDate) {
        oldestDate = new Date(allPurchases[0].purchaseDate);
      }
      if (cashHistory.length > 0 && new Date(cashHistory[0].date) < oldestDate) {
        oldestDate = new Date(cashHistory[0].date);
      }

      const startYear = Math.max(oldestDate.getFullYear(), currentYear - 4);
      const years = [];
      for (let y = currentYear; y >= startYear; y--) {
        years.push(y);
      }

      // Pre-fetch all symbols price history once
      const symbolsOwned: string[] = Array.from(new Set(allPurchases.map((p: any) => p.symbol.toUpperCase())));
      const symbolPriceHistories = new Map<string, any[]>();
      
      const daysToFetch = Math.ceil((now.getTime() - new Date(startYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) + 10;
      for (const symbol of symbolsOwned) {
        // Use '1mo' interval for performance tables
        const history = await getSmartHistoricalPrices(symbol, daysToFetch, '1mo');
        symbolPriceHistories.set(symbol, history);
      }

      // To calculate start value for the oldest year in our list, 
      // we need to know the investment value at the end of the year PRIOR to our startYear
      const preStartYear = startYear - 1;
      const preEndDate = new Date(preStartYear, 11, 31, 23, 59, 59);
      
      let previousYearEndInvValue = 0;
      allPurchases.forEach((p: any) => {
        const pDate = new Date(p.purchaseDate);
        const sDate = p.soldDate ? new Date(p.soldDate) : null;
        if (pDate <= preEndDate && (!p.isSold || (sDate && sDate > preEndDate))) {
          // Find price at year end
          const history = symbolPriceHistories.get(p.symbol.toUpperCase()) || [];
          const pricePoint = history.filter(h => new Date(h.timestamp) <= preEndDate).pop();
          const price = pricePoint ? pricePoint.price : parseFloat(p.price);
          previousYearEndInvValue += parseFloat(p.quantity) * price;
        }
      });

      const processedYears = [];
      const yearsAsc = [...years].reverse();

      for (const year of yearsAsc) {
        const isCurrentYear = year === currentYear;
        const endDate = isCurrentYear ? now : new Date(year, 11, 31, 23, 59, 59);
        const startDate = new Date(year, 0, 1, 0, 0, 0);

        let invValue = 0;
        let costBasis = 0;
        let purchasesInYear = 0;

        // Calculate purchases during this year
        allPurchases.forEach((p: any) => {
          const pDate = new Date(p.purchaseDate);
          if (pDate >= startDate && pDate <= endDate) {
            purchasesInYear += parseFloat(p.quantity) * parseFloat(p.price);
          }
        });

        if (isCurrentYear) {
          for (const h of holdings) {
            const price = parseFloat(h.currentPrice || "0");
            const qty = parseFloat(h.quantity || "0");
            invValue += price * qty;
            costBasis += parseFloat(h.purchasePrice || "0") * qty;
          }
        } else {
          // Identify holdings at that year end
          const yearEndHoldings = new Map<string, { qty: number, cost: number }>();
          allPurchases.forEach((p: any) => {
            const pDate = new Date(p.purchaseDate);
            const sDate = p.soldDate ? new Date(p.soldDate) : null;
            if (pDate <= endDate && (!p.isSold || (sDate && sDate > endDate))) {
              const sym = p.symbol.toUpperCase();
              const existing = yearEndHoldings.get(sym) || { qty: 0, cost: 0 };
              const qty = parseFloat(p.quantity);
              yearEndHoldings.set(sym, {
                qty: existing.qty + qty,
                cost: existing.cost + (qty * parseFloat(p.price))
              });
            }
          });

          // Using forEach to avoid Iterator issues with current TS config
          yearEndHoldings.forEach((data, symbol) => {
            const history = symbolPriceHistories.get(symbol) || [];
            // Find price at or closest before endDate
            let yearEndPrice = 0;
            const pricePoint = history.filter(p => new Date(p.timestamp) <= endDate).pop();
            if (pricePoint) {
              yearEndPrice = pricePoint.price;
            } else if (history.length > 0) {
              yearEndPrice = history[0].price;
            }

            invValue += data.qty * yearEndPrice;
            costBasis += data.cost;
          });
        }

        const latestAccountCash = new Map<number, number>();
        cashHistory.forEach((ch: any) => {
          if (new Date(ch.date) <= endDate) {
            latestAccountCash.set(ch.accountId, parseFloat(ch.amount));
          }
        });
        const cashValue = Array.from(latestAccountCash.values()).reduce((sum, val) => sum + val, 0);
        
        const totalValue = invValue + cashValue;
        const gainLoss = invValue - costBasis;
        const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

        // Annual Return Formula: (End Inv Value) / (Start Inv Value + Purchases) - 1
        const denominator = previousYearEndInvValue + purchasesInYear;
        const annualReturnPercent = denominator > 0 ? ((invValue / denominator) - 1) * 100 : 0;

        processedYears.push({
          year,
          startInvestment: previousYearEndInvValue.toFixed(2),
          investment: invValue.toFixed(2),
          costBasis: costBasis.toFixed(2),
          purchasesInYear: purchasesInYear.toFixed(2),
          cash: cashValue.toFixed(2),
          total: totalValue.toFixed(2),
          gainLoss: gainLoss.toFixed(2),
          gainLossPercent: gainLossPercent.toFixed(2),
          annualReturnPercent: annualReturnPercent.toFixed(2)
        });

        previousYearEndInvValue = invValue;
      }

      return processedYears.reverse();
    }),

  // Get all holdings for the current user
  getAllHoldings: protectedProcedure.query(async ({ ctx }) => {
    console.log(`[Portfolio] Fetching all holdings for user ${ctx.user.id}...`);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const { etfHoldings: holdingsTable } = await import("../drizzle/schema");

    const holdings = await db
      .select()
      .from(holdingsTable)
      .where(eq(holdingsTable.userId, ctx.user.id));

    // Filter out fully-sold holdings (zero or negligible quantity)
    const activeHoldings = holdings.filter((h: any) => {
      const qty = parseFloat(String(h.quantity ?? "0"));
      return Number.isFinite(qty) && qty > 1e-6;
    });

    console.log(`[Portfolio] Found ${activeHoldings.length} active holdings (${holdings.length} total) for user ${ctx.user.id}`);
    
    const holdingsWithDividends = activeHoldings.map(h => ({
      ...h,
      annualDividendPerShare: parseFloat(h.annualDividendPerShare || "0")
    }));

    console.log(`[Portfolio] Finished processing all holdings for user ${ctx.user.id}`);
    return holdingsWithDividends;
  }),
});
