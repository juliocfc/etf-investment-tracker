import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { etfHoldings, purchases, accounts, cashBalanceHistory, cashBalance, bondHoldings, bondPurchases } from "../drizzle/schema";
import {
  getUserEtfHoldings,
  createEtfHolding,
  updateEtfHolding,
  updateEtfHoldingBySymbol,
  deleteEtfHolding,
  addPriceHistory,
  getPriceHistory,
  getCashBalance,
  updateCashBalance,
  recalculateCashBalances,
  getCashBalanceHistory,
  deleteCashTransaction,
  editCashTransaction,
  addBalanceHistory,
  getBalanceHistory,
  getDividendHistory,
  addDividendHistory,
  addPurchase,
  getPurchases,
  calculateAverageCost,
  deletePurchase,
  getUserBondHoldings,
  getBondPurchases,
  calculateBondAverageCost,
  getBondPriceFromBrokerage,
  updatePurchase,
  parseCSVContent,
  bulkImportPurchases,
  getDb,
  truncateNumber,
} from "./db";
import { gte, lte, sql, and, eq, desc, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  fetchEtfPrice,
  validateEtfSymbol,
  fetchDividendData,
  calculateAnnualDPS,
} from "./financialApi";
import { getSmartHistoricalPrices } from "./priceService";
import { fetchETFName } from "./etfLookup";
import { calculatePerformanceMetrics } from "./performanceMetrics";

export const etfRouter = router({
  getHoldings: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number(), 
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      
      if (input.accountType && input.accountId === undefined) {
        const db = await getDb();
        const conditions: any[] = [eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)];
        if (input.portfolioId) conditions.push(eq(accounts.portfolioId, input.portfolioId));
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...conditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
      }

      if (!holdings || holdings.length === 0) return [];
      const holdingsWithAvgCost = await Promise.all(
        holdings.map(async (holding: any) => {
          const avgCost = await calculateAverageCost(holding.id);
          // Re-fetch the holding to get the updated quantity after avg cost calculation
          const db = await getDb();
          const fresh = await db
            .select()
            .from(etfHoldings)
            .where(eq(etfHoldings.id, holding.id))
            .then((rows: any[]) => rows[0]);
          return { ...fresh, averageCost: avgCost };
        })
      );

      if (input.accountId === undefined) {
        // Consolidate by symbol
        const consolidatedMap = new Map<string, any>();
        for (const h of holdingsWithAvgCost) {
          if (!consolidatedMap.has(h.symbol)) {
            consolidatedMap.set(h.symbol, {
              ...h,
              id: -1,
              isConsolidated: true,
              quantity: 0,
              totalCost: 0,
            });
          }
          const existing = consolidatedMap.get(h.symbol);
          const qty = parseFloat(h.quantity.toString());
          const avgCost = parseFloat(h.averageCost || h.purchasePrice || "0");
          existing.quantity += qty;
          existing.totalCost += qty * avgCost;
        }

        // Build consolidated holdings and filter out zero quantities
        const consolidated = Array.from(consolidatedMap.values()).map((h: any) => ({
          ...h,
          quantity: h.quantity.toString(),
          averageCost: h.quantity > 0 ? (h.totalCost / h.quantity).toString() : "0",
          totalCost: undefined, // Remove temporary field
        }));
        return consolidated.filter((h: any) => parseFloat(h.quantity) > 0);
      }

      // Filter out holdings with zero quantity before returning
      return holdingsWithAvgCost.filter((h: any) => parseFloat(h.quantity) > 0);
    }),

  addHolding: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        accountId: z.number(),
        symbol: z.string().min(1).max(20),
        name: z.string().min(1).max(255),
        quantity: z.string(),
        purchasePrice: z.string(),
        purchaseDate: z.date(),
        desiredAllocation: z.string().optional(),
        fees: z.string().optional(),
        type: z.enum(["buy", "sell"]).default("buy"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      // Verify account belongs to portfolio
      const account = await dbInstance
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, input.accountId), 
          eq(accounts.portfolioId, input.portfolioId),
          eq(accounts.userId, ctx.user.id)
        ))
        .then((rows: any[]) => rows[0]);
      
      if (!account) {
        throw new Error("Invalid account selection for this portfolio");
      }

      const isValid = await validateEtfSymbol(input.symbol);
      if (!isValid) {
        throw new Error(`Invalid ETF symbol: ${input.symbol}`);
      }

      // Check if holding already exists in this SPECIFIC account
      const existingHolding = await dbInstance
        .select()
        .from(etfHoldings)
        .where(and(
          eq(etfHoldings.userId, ctx.user.id),
          eq(etfHoldings.portfolioId, input.portfolioId),
          eq(etfHoldings.accountId, input.accountId),
          eq(etfHoldings.symbol, input.symbol.toUpperCase())
        ))
        .limit(1)
        .then((rows: any[]) => rows[0]);

      if (input.type === "sell" && !existingHolding) {
        throw new Error("Cannot sell an asset you don't own in this portfolio");
      }

      let holdingId = existingHolding?.id;
      let currentPrice: string | undefined;
      let lastPriceUpdate: Date;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existingHolding && existingHolding.currentPrice && existingHolding.lastPriceUpdate && new Date(existingHolding.lastPriceUpdate) > oneHourAgo) {
        currentPrice = existingHolding.currentPrice;
        lastPriceUpdate = new Date(existingHolding.lastPriceUpdate);
      } else {
        const priceData = await fetchEtfPrice(input.symbol);
        currentPrice = priceData?.price.toString();
        lastPriceUpdate = new Date();
        const annualDividendPerShare = (await calculateAnnualDPS(input.symbol)).toString();
        
        if (currentPrice && existingHolding) {
          await updateEtfHoldingBySymbol(ctx.user.id, input.symbol, {
            currentPrice,
            lastPriceUpdate,
            annualDividendPerShare,
          });
        }
      }

      if (!existingHolding) {
        const annualDividendPerShare = (await calculateAnnualDPS(input.symbol)).toString();
        holdingId = await createEtfHolding({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          symbol: input.symbol.toUpperCase(),
          name: input.name,
          quantity: "0", // Start at 0, will be updated by purchase/sell
          purchasePrice: input.purchasePrice,
          purchaseDate: input.purchaseDate,
          desiredAllocation: input.desiredAllocation || "0",
          currentPrice,
          lastPriceUpdate,
          annualDividendPerShare,
        });
      }

      const quantityNum = parseFloat(input.quantity);
      const priceNum = parseFloat(input.purchasePrice);
      const feesNum = parseFloat(input.fees || "0");

      if (input.type === "buy") {
        const totalCost = truncateNumber((quantityNum * priceNum) + feesNum);
        const description = `You bought ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        
        const cashResult = await updateCashBalance(
          ctx.user.id,
          input.portfolioId,
          "0", // Balance will be recalculated by updateCashBalance
          input.accountId,
          input.purchaseDate,
          {
            type: "withdrawal",
            transactionAmount: totalCost.toString(),
            description: description
          }
        );

        await addPurchase({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          holdingId: Number(holdingId),
          symbol: input.symbol.toUpperCase(),
          quantity: input.quantity,
          price: input.purchasePrice,
          fees: input.fees || "0",
          cashTransactionId: cashResult.historyId,
          purchaseDate: input.purchaseDate,
        });
      } else {
        // SELL logic - FIFO
        const totalOwned = parseFloat(existingHolding!.quantity);
        if (totalOwned < quantityNum) {
          throw new Error(`Insufficient shares to sell. Owned: ${totalOwned}, Requested: ${quantityNum}`);
        }

        const totalProceeds = truncateNumber((quantityNum * priceNum) - feesNum);

        // 1. Create cash transaction (deposit)
        const currentBalance = await getCashBalance(ctx.user.id, input.portfolioId, input.accountId);
        const currentAmountNum = currentBalance ? parseFloat(currentBalance.amount) : 0;
        const newAmountNum = currentAmountNum + totalProceeds;

        const description = `You sold ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        
        await updateCashBalance(
          ctx.user.id,
          input.portfolioId,
          "0", // Balance will be recalculated by updateCashBalance
          input.accountId,
          input.purchaseDate,
          {
            type: "deposit",
            transactionAmount: totalProceeds.toString(),
            description: description
          }
        );

        // 2. Reduce shares using FIFO
        const db = await getDb();
        const allPurchases = await db.select()
          .from(purchases)
          .where(eq(purchases.holdingId, Number(holdingId)))
          .orderBy(purchases.purchaseDate, purchases.id);

        let remainingToSell = quantityNum;
        for (const purchase of allPurchases) {
          if (remainingToSell <= 0) break;

          const purchaseQty = parseFloat(purchase.quantity);
          if (purchaseQty <= remainingToSell) {
            // Mark entire purchase as sold
            await updatePurchase(purchase.id, { 
              isSold: true, 
              soldDate: input.purchaseDate,
              soldPrice: input.purchasePrice
            });
            remainingToSell -= purchaseQty;
          } else {
            // Partial sale: split the purchase record
            const remainingQty = purchaseQty - remainingToSell;
            
            // 1. Update existing record with the sold portion and mark as sold
            await updatePurchase(purchase.id, { 
              quantity: remainingToSell.toString(),
              isSold: true,
              soldDate: input.purchaseDate,
              soldPrice: input.purchasePrice
            });

            // 2. Create a new record for the unsold portion
            await addPurchase({
              userId: ctx.user.id,
              portfolioId: purchase.portfolioId,
              accountId: purchase.accountId,
              holdingId: purchase.holdingId,
              symbol: purchase.symbol,
              quantity: remainingQty.toString(),
              price: purchase.price,
              fees: "0", // Original fees stay with the sold portion
              purchaseDate: purchase.purchaseDate,
              isSold: false
            });

            remainingToSell = 0;
          }
        }
      }

      await calculateAverageCost(Number(holdingId));

      return { id: holdingId };
    }),

  updateHolding: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        portfolioId: z.number().optional(),
        symbol: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(255).optional(),
        quantity: z.string().optional(),
        purchasePrice: z.string().optional(),
        purchaseDate: z.date().optional(),
        desiredAllocation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, portfolioId, ...updates } = input;

      if (id === -1 && input.symbol && portfolioId) {
        // Update all holdings with this symbol in this portfolio
        const db = await getDb();
        const symbol = input.symbol.toUpperCase();
        
        await db.update(etfHoldings)
          .set({ desiredAllocation: updates.desiredAllocation })
          .where(and(
            eq(etfHoldings.userId, ctx.user.id),
            eq(etfHoldings.portfolioId, portfolioId),
            eq(etfHoldings.symbol, symbol)
          ));
        return { success: true };
      }

      if (updates.symbol) {
        const isValid = await validateEtfSymbol(updates.symbol);
        if (!isValid) {
          throw new Error(`Invalid ETF symbol: ${updates.symbol}`);
        }
        updates.symbol = updates.symbol.toUpperCase();
      }

      const result = await updateEtfHolding(id, updates);
      return result;
    }),

  deleteHolding: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      const holding = await dbInstance
        .select()
        .from(etfHoldings)
        .where(and(eq(etfHoldings.id, input.id), eq(etfHoldings.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);

      if (!holding) {
        throw new Error("Holding not found or unauthorized");
      }

      return deleteEtfHolding(input.id);
    }),

  updatePrices: protectedProcedure
    .input(z.object({ portfolioId: z.number().optional() }))
    .mutation(async ({ ctx }) => {
      // Get all holdings for the user across all portfolios
      const holdings = await getUserEtfHoldings(ctx.user.id);
      const uniqueSymbols = Array.from(new Set(holdings.map((h: any) => h.symbol.toUpperCase()))) as string[];
      const results = [];

      for (let i = 0; i < uniqueSymbols.length; i++) {
        const symbol = uniqueSymbols[i];

        // Polite delay
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const priceData = await fetchEtfPrice(symbol);
        if (priceData) {
          const currentPrice = priceData.price.toString();
          const lastPriceUpdate = new Date();
          const annualDividendPerShare = (await calculateAnnualDPS(symbol)).toString();

          // Update ALL holdings with this symbol for this user across ALL portfolios
          await updateEtfHoldingBySymbol(ctx.user.id, symbol, {
            currentPrice,
            lastPriceUpdate,
            annualDividendPerShare,
          });

          await addPriceHistory(
            ctx.user.id,
            symbol,
            currentPrice,
            lastPriceUpdate
          );

          results.push({
            symbol: symbol,
            price: priceData.price,
            success: true,
          });
        } else {
          results.push({
            symbol: symbol,
            success: false,
            error: "Failed to fetch price",
          });
        }
      }

      return results;
    }),
  getMarketPriceHistory: protectedProcedure
    .input(
      z.object({
        symbol: z.string(),
        days: z.number().default(365),
      })
    )
    .query(async ({ ctx, input }) => {
      const interval = input.days <= 30 ? "1d" : "1wk";
      const history = await getSmartHistoricalPrices(input.symbol, input.days, interval);
      
      // Find current price in our DB for this symbol
      const db = await getDb();
      const holding = await db.select({ currentPrice: etfHoldings.currentPrice })
        .from(etfHoldings)
        .where(and(eq(etfHoldings.symbol, input.symbol.toUpperCase()), eq(etfHoldings.userId, ctx.user.id)))
        .limit(1)
        .then((rows: any[]) => rows[0]);

      if (holding && holding.currentPrice) {
        history.push({
          symbol: input.symbol.toUpperCase(),
          price: parseFloat(holding.currentPrice),
          timestamp: new Date(),
        });
      }

      return history;
    }),

  getPriceHistory: protectedProcedure
    .input(
      z.object({
        symbol: z.string(),
        days: z.number().default(365),
      })
    )
    .query(async ({ ctx, input }) => {
      return getPriceHistory(ctx.user.id, input.symbol, input.days);
    }),

  syncHistoricalPrices: protectedProcedure
    .input(z.object({ symbol: z.string(), days: z.number().default(365) }))
    .mutation(async ({ ctx, input }) => {
      const prices = await getSmartHistoricalPrices(input.symbol, input.days);

      for (const price of prices) {
        await addPriceHistory(
          ctx.user.id,
          input.symbol,
          price.price.toString(),
          price.timestamp
        );
      }

      return { count: prices.length, symbol: input.symbol };
    }),

  getCashBalance: protectedProcedure
    .input(z.object({ portfolioId: z.number(), accountId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const balance = await getCashBalance(ctx.user.id, input.portfolioId, input.accountId);
      return balance?.amount || "0";
    }),

  updateCashBalance: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number(), 
      amount: z.string(), 
      accountId: z.number(),
      date: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return updateCashBalance(ctx.user.id, input.portfolioId, input.amount, input.accountId, input.date);
    }),

  recordCashTransaction: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      accountId: z.number(),
      type: z.enum(["deposit", "withdrawal", "adjustment"]),
      amount: z.string(), // Transaction amount
      description: z.string().optional(),
      date: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentBalance = await getCashBalance(ctx.user.id, input.portfolioId, input.accountId);
      const currentAmountNum = currentBalance ? parseFloat(currentBalance.amount) : 0;
      const transactionAmountNum = parseFloat(input.amount);

      let newAmountNum = currentAmountNum;
      if (input.type === "deposit") {
        newAmountNum = currentAmountNum + transactionAmountNum;
      } else if (input.type === "withdrawal") {
        newAmountNum = currentAmountNum - transactionAmountNum;
      } else {
        newAmountNum = transactionAmountNum; // Adjustment sets balance
      }

      return updateCashBalance(
        ctx.user.id, 
        input.portfolioId, 
        newAmountNum.toString(), 
        input.accountId, 
        input.date || new Date(),
        {
          type: input.type,
          transactionAmount: input.amount,
          description: input.description
        }
      );
    }),

  deleteCashTransaction: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      accountId: z.number(),
      transactionId: z.number()
    }))
    .mutation(async ({ ctx, input }) => {
      return deleteCashTransaction(ctx.user.id, input.portfolioId, input.accountId, input.transactionId);
    }),

  editCashTransaction: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      accountId: z.number(),
      transactionId: z.number(),
      amount: z.string(),
      description: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return editCashTransaction(ctx.user.id, input.portfolioId, input.accountId, input.transactionId, {
        amount: input.amount,
        description: input.description
      });
    }),

  getBalanceHistory: protectedProcedure
    .input(z.object({ portfolioId: z.number(), days: z.number().default(365) }))
    .query(async ({ ctx, input }) => {
      return getBalanceHistory(ctx.user.id, input.portfolioId, input.days);
    }),

  recordBalanceSnapshot: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        totalValue: z.string(),
        cashValue: z.string(),
        investmentValue: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return addBalanceHistory(
        ctx.user.id,
        input.portfolioId,
        input.totalValue,
        input.cashValue,
        input.investmentValue,
        new Date()
      );
    }),

  calculatePerformance: protectedProcedure
    .input(z.object({ portfolioId: z.number(), days: z.number().default(365) }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const balanceHistory = await getBalanceHistory(ctx.user.id, input.portfolioId, input.days);

      if (balanceHistory.length === 0) {
        return {
          totalReturn: "0",
          totalReturnPercent: "0",
          dailyReturn: "0",
          monthlyReturn: "0",
          yearlyReturn: "0",
        };
      }

      const startBalance = parseFloat(
        balanceHistory[0].totalValue.toString()
      );
      const endBalance = parseFloat(
        balanceHistory[balanceHistory.length - 1].totalValue.toString()
      );
      const totalReturn = endBalance - startBalance;
      const totalReturnPercent =
        startBalance > 0
          ? ((totalReturn / startBalance) * 100).toFixed(2)
          : "0";

      return {
        totalReturn: totalReturn.toFixed(2),
        totalReturnPercent,
        dailyReturn: calculateDailyReturn(balanceHistory),
        monthlyReturn: calculateMonthlyReturn(balanceHistory),
        yearlyReturn: calculateYearlyReturn(balanceHistory),
      };
    }),

  getDividendHistory: protectedProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ ctx, input }) => {
      return getDividendHistory(ctx.user.id, input.symbol);
    }),

  getDetailedDividendReport: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const db = await getDb();

      if (input.accountType) {
        const conditions: any[] = [eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)];
        if (input.portfolioId) conditions.push(eq(accounts.portfolioId, input.portfolioId));
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...conditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter(h => matchingIds.includes(h.accountId));
      }

      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
      const currentYear = now.getFullYear();

      // Determine the target comparison quarter (the previous full quarter)
      let targetQuarter: number;
      let targetYear: number;
      if (currentQuarter === 1) {
        targetQuarter = 4;
        targetYear = currentYear - 1;
      } else {
        targetQuarter = currentQuarter - 1;
        targetYear = currentYear;
      }

      const priorYearTargetYear = targetYear - 1;
      const targetQuarterKey = `${targetYear} Q${targetQuarter}`;
      const priorYearQuarterKey = `${priorYearTargetYear} Q${targetQuarter}`;
      const currentQuarterKey = `${currentYear} Q${currentQuarter}`;

      const windowStart = new Date();
      windowStart.setFullYear(windowStart.getFullYear() - 1);
      
      const priorWindowStart = new Date(windowStart);
      priorWindowStart.setFullYear(priorWindowStart.getFullYear() - 1);

      const allDividends = [];
      const etfBreakdownMap = new Map<string, any>();

      const getQuarterKey = (date: Date) => {
        const q = Math.floor(date.getMonth() / 3) + 1;
        return `${date.getFullYear()} Q${q}`;
      };

      // Helper to get last 4 quarter keys
      const lastQuarters: string[] = [];
      const tempDate = new Date();
      for (let i = 0; i < 4; i++) {
        lastQuarters.unshift(getQuarterKey(tempDate));
        tempDate.setMonth(tempDate.getMonth() - 3);
      }

      for (const holding of holdings) {
        const dividendData = await fetchDividendData(holding.symbol as string);
        const purchases = await getPurchases(holding.id);

        // Calculate current estimated quarterly dividend for this holding
        const currentQty = parseFloat(holding.quantity.toString());
        const sortedDivs = [...dividendData].sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
        const lastDivPerShare = sortedDivs.length > 0 ? sortedDivs[0].dividendPerShare : 0;
        
        // Simple logic to estimate quarterly amount based on frequency
        const nowTime = new Date().getTime();
        const twelveMonthsAgo = nowTime - (365 * 24 * 60 * 60 * 1000);
        const lastYearPayments = dividendData.filter((d: any) => new Date(d.exDate).getTime() >= twelveMonthsAgo).length;
        
        let estimatedQuarterlyAmount = 0;
        if (lastYearPayments >= 10) {
          // Monthly payer -> 3 payments per quarter
          estimatedQuarterlyAmount = currentQty * lastDivPerShare * 3;
        } else {
          // Quarterly or other -> 1 payment per quarter
          estimatedQuarterlyAmount = currentQty * lastDivPerShare;
        }

        let etfTotalWindow = 0;
        let etfTotalPriorWindow = 0;
        let etfTotalAllTime = 0;
        let etfTargetQuarterAmount = 0;
        let etfPriorYearQuarterAmount = 0;
        
        const etfQuarterly: Record<string, number> = {};
        lastQuarters.forEach((q: string) => etfQuarterly[q] = 0);

        for (const div of dividendData) {
          const exDate = new Date(div.exDate);
          exDate.setHours(0, 0, 0, 0);

          let quantityOwned = 0;
          for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.purchaseDate);
            if (purchaseDate < exDate) {
              quantityOwned += parseFloat(purchase.quantity.toString());
            }
          }

          if (quantityOwned > 0) {
            const totalAmount = quantityOwned * div.dividendPerShare;
            const exYear = exDate.getFullYear();
            const exQuarter = Math.floor(exDate.getMonth() / 3) + 1;
            
            // Check if this dividend belongs to our comparison quarters
            if (exYear === targetYear && exQuarter === targetQuarter) {
              etfTargetQuarterAmount += totalAmount;
            } else if (exYear === priorYearTargetYear && exQuarter === targetQuarter) {
              etfPriorYearQuarterAmount += totalAmount;
            }

            const isInWindow = exDate >= windowStart;
            const isInPriorWindow = exDate >= priorWindowStart && exDate < windowStart;

            const dividendRecord = {
              symbol: holding.symbol,
              accountId: (holding as any).accountId,
              exDate: div.exDate,
              dividendPerShare: div.dividendPerShare,
              quantityOwned,
              totalAmount,
            };

            allDividends.push(dividendRecord);
            etfTotalAllTime += totalAmount;

            if (isInWindow) {
              etfTotalWindow += totalAmount;
              const qKey = getQuarterKey(exDate);
              if (etfQuarterly[qKey] !== undefined) {
                etfQuarterly[qKey] += totalAmount;
              }
            } else if (isInPriorWindow) {
              etfTotalPriorWindow += totalAmount;
            }
          }
        }

        const symbol = holding.symbol.toUpperCase();
        const existing = etfBreakdownMap.get(symbol);

        if (existing) {
          existing.totalLastYearNum += etfTotalWindow;
          existing.totalPriorYearNum += etfTotalPriorWindow;
          existing.totalAllTimeNum += etfTotalAllTime;
          existing.latestAmountNum += etfTargetQuarterAmount;
          existing.priorAmountNum += etfPriorYearQuarterAmount;
          existing.currentEstimatedQuarterlyNum += estimatedQuarterlyAmount;
          lastQuarters.forEach((q: string) => {
            existing.quarterlyValues[q] = (existing.quarterlyValues[q] || 0) + (etfQuarterly[q] || 0);
          });
        } else {
          etfBreakdownMap.set(symbol, {
            symbol: symbol,
            name: holding.name,
            totalLastYearNum: etfTotalWindow,
            totalPriorYearNum: etfTotalPriorWindow,
            totalAllTimeNum: etfTotalAllTime,
            quarterlyValues: { ...etfQuarterly },
            latestAmountNum: etfTargetQuarterAmount,
            latestDate: `${targetYear} Q${targetQuarter}`,
            priorAmountNum: etfPriorYearQuarterAmount,
            priorDate: `${priorYearTargetYear} Q${targetQuarter}`,
            currentEstimatedQuarterlyNum: estimatedQuarterlyAmount,
          });
        }
      }

      const etfBreakdown = Array.from(etfBreakdownMap.values()).map((item: any) => {
        const growth = item.priorAmountNum > 0 
          ? ((item.latestAmountNum - item.priorAmountNum) / item.priorAmountNum) * 100 
          : 0;

        const yearlyGrowth = item.totalPriorYearNum > 0
          ? ((item.totalLastYearNum - item.totalPriorYearNum) / item.totalPriorYearNum) * 100
          : 0;

        return {
          symbol: item.symbol,
          name: item.name,
          totalLastYear: item.totalLastYearNum.toFixed(2),
          totalPriorYear: item.totalPriorYearNum.toFixed(2),
          totalAllTime: item.totalAllTimeNum.toFixed(2),
          yearlyGrowthPercent: yearlyGrowth.toFixed(2),
          latestAmount: item.latestAmountNum.toFixed(2),
          latestDate: item.latestDate,
          priorAmount: item.priorAmountNum.toFixed(2),
          priorDate: item.priorDate,
          growthPercent: growth.toFixed(2),
          currentEstimatedQuarterly: item.currentEstimatedQuarterlyNum.toFixed(2),
          quarterlyBreakdown: lastQuarters.map((q: string) => ({
            quarter: q,
            amount: (item.quarterlyValues[q] || 0).toFixed(2),
          })),
        };
      });

      const totalLastYear = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.totalLastYear), 0);
      const totalPriorYear = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.totalPriorYear), 0);
      const totalAllTime = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.totalAllTime), 0);

      const consolidatedLatest = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.latestAmount), 0);
      const consolidatedPrior = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.priorAmount), 0);
      const consolidatedEstimated = etfBreakdown.reduce((sum: number, item: any) => sum + parseFloat(item.currentEstimatedQuarterly), 0);
      const consolidatedGrowth = consolidatedPrior > 0 
        ? ((consolidatedLatest - consolidatedPrior) / consolidatedPrior) * 100 
        : 0;

      const consolidatedYearlyGrowth = totalPriorYear > 0
        ? ((totalLastYear - totalPriorYear) / totalPriorYear) * 100
        : 0;

      const combinedQuarterly: Record<string, number> = {};
      lastQuarters.forEach((q: string) => combinedQuarterly[q] = 0);

      etfBreakdown.forEach((item: any) => {
        item.quarterlyBreakdown.forEach((q: any) => {
          if (combinedQuarterly[q.quarter] !== undefined) {
            combinedQuarterly[q.quarter] += parseFloat(q.amount);
          }
        });
      });

      return {
        totalLastYear: totalLastYear.toFixed(2),
        totalPriorYear: totalPriorYear.toFixed(2),
        totalAllTime: totalAllTime.toFixed(2),
        targetQuarterKey,
        priorYearQuarterKey,
        currentQuarterKey,
        consolidatedComparative: {
          latestAmount: consolidatedLatest.toFixed(2),
          priorAmount: consolidatedPrior.toFixed(2),
          growthPercent: consolidatedGrowth.toFixed(2),
          totalLastYear: totalLastYear.toFixed(2),
          totalPriorYear: totalPriorYear.toFixed(2),
          yearlyGrowthPercent: consolidatedYearlyGrowth.toFixed(2),
          currentEstimatedQuarterly: consolidatedEstimated.toFixed(2)
        },
        quarterlyBreakdown: lastQuarters.map((q: string) => ({
          quarter: q,
          amount: (combinedQuarterly[q] || 0).toFixed(2),
        })),
        etfBreakdown,
        history: allDividends.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime()),
      };    }),

  getDividendCalendar: protectedProcedure
    .input(z.object({ portfolioId: z.number().optional(), accountType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const db = await getDb();
      if (input.accountType) {
        const conditions: any[] = [eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)];
        if (input.portfolioId) conditions.push(eq(accounts.portfolioId, input.portfolioId));
        const matchingAccounts = await db.select({ id: accounts.id }).from(accounts).where(and(...conditions));
        const matchingIds = matchingAccounts.map((a:any)=>a.id);
        holdings = holdings.filter((h:any)=> matchingIds.includes(h.accountId));
      }
      const uniqueSymbols = Array.from(new Set(holdings.map((h:any)=> h.symbol.toUpperCase())));
      const now = new Date();
      const result: any[] = [];
      for (const symbol of uniqueSymbols) {
        const dividendData = await fetchDividendData(symbol as string);
        const holdingQty = holdings.filter((h:any)=> h.symbol.toUpperCase()===symbol).reduce((s:number,h:any)=> s + parseFloat(h.quantity||"0"),0);
        const sorted = [...dividendData].sort((a:any,b:any)=> new Date(a.exDate).getTime() - new Date(b.exDate).getTime());
        // estimate frequency like projectedDividends
        const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setFullYear(now.getFullYear()-1);
        const lastYear = sorted.filter((d:any)=> new Date(d.exDate) >= twelveMonthsAgo);
        const last = sorted[sorted.length-1];
        if (!last) continue;
        const dps = last.dividendPerShare;
        let freqMonths = 3;
        if (lastYear.length >=10) freqMonths = 1;
        else if (lastYear.length >=3) freqMonths = 3;
        else if (lastYear.length===2) freqMonths = 6;
        else if (lastYear.length===1) freqMonths = 12;
        // project next 3 ex dates from last exDate
        const lastEx = new Date(last.exDate);
        for (let k=1;k<=3;k++) {
          const ex = new Date(lastEx); ex.setMonth(ex.getMonth()+ k*freqMonths);
          const pay = last.paymentDate ? new Date(new Date(last.paymentDate).getTime() + k*freqMonths*30*24*60*60*1000) : undefined;
          const estAmount = holdingQty * dps;
          // reliability: payments in last 2y vs expected
          const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(now.getFullYear()-2);
          const expected = freqMonths===1?24: freqMonths===3?8: freqMonths===6?4:2;
          const actual = sorted.filter((d:any)=> new Date(d.exDate) >= twoYearsAgo).length;
          const reliability = Math.min(100, Math.round(actual/expected*100));
          result.push({ symbol, name: holdings.find((h:any)=> h.symbol.toUpperCase()===symbol)?.name || symbol, exDate: ex.toISOString().split("T")[0], paymentDate: pay? pay.toISOString().split("T")[0]: undefined, dps: dps.toFixed(4), estimatedAmount: estAmount.toFixed(2), frequency: freqMonths===1?"Monthly":freqMonths===3?"Quarterly":freqMonths===6?"Semi":freqMonths===12?"Annual":"Irregular", reliability });
        }
      }
      return result.sort((a,b)=> new Date(a.exDate).getTime() - new Date(b.exDate).getTime()).slice(0,24);
    }),

  calculateTotalDividends: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      let totalDividends = 0;

      for (const holding of holdings) {
        const dividends = await getDividendHistory(ctx.user.id, holding.symbol as string);
        for (const div of dividends) {
          if (div.totalDividend) {
            totalDividends += parseFloat(div.totalDividend.toString());
          }
        }
      }

      return totalDividends.toFixed(2);
    }),

  getProjectedDividends: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number().optional(),
      withDRIP: z.boolean().default(false),
      symbol: z.string().optional(),
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      
      if (input.accountType && input.accountId === undefined) {
        const db = await getDb();
        const conditions: any[] = [eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)];
        if (input.portfolioId) conditions.push(eq(accounts.portfolioId, input.portfolioId));
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...conditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
      }
      
      if (input.symbol && input.symbol !== "ALL") {
        const symbolUpper = input.symbol.toUpperCase();
        holdings = holdings.filter((h: any) => h.symbol.toUpperCase() === symbolUpper);
      }
      
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // 1. Initial holdings loop & pattern identification
      const uniqueSymbols = Array.from(new Set(holdings.map((h: any) => h.symbol.toUpperCase())));
      const symbolDataMap = new Map<string, {
        monthlyDPS: Map<number, number>,
        trueAnnualDPS: number,
        currentPrice: number,
        name: string,
        initialQuantity: number
      }>();

      for (let i = 0; i < uniqueSymbols.length; i++) {
        const symbol = uniqueSymbols[i] as string;
        const dividendData = await fetchDividendData(symbol);
        const holding = holdings.find((h: any) => h.symbol.toUpperCase() === symbol)!;
        const currentPrice = parseFloat(holding.currentPrice || "0");
        
        // Pattern identification & annual DPS estimation
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(now.getFullYear() - 1);
        
        const lastYearPayments = dividendData.filter((d: any) => {
          const dDate = new Date(d.exDate);
          return dDate >= twelveMonthsAgo && dDate <= now;
        });

        // Use frequency-aware estimation for trueAnnualDPS
        const sortedData = [...dividendData].sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
        
        let estimatedAnnualDPS = 0;
        const monthlyDPSMap = new Map<number, number>();

        if (lastYearPayments.length >= 10) {
          // Likely a monthly payer
          estimatedAnnualDPS = sortedData[0].dividendPerShare * 12;
          // For simulation, assume it pays the same amount every month
          for (let m = 0; m < 12; m++) {
            monthlyDPSMap.set(m, sortedData[0].dividendPerShare);
          }
        } else if (lastYearPayments.length >= 3) {
          // Likely a quarterly payer
          estimatedAnnualDPS = sortedData[0].dividendPerShare * 4;
          // Set exactly 4 months in the cycle based on the most recent payment
          const latestMonth = new Date(sortedData[0].exDate).getMonth();
          for (let i = 0; i < 4; i++) {
            monthlyDPSMap.set((latestMonth + i * 3) % 12, sortedData[0].dividendPerShare);
          }
        } else {
          // Irregular or semi-annual
          estimatedAnnualDPS = lastYearPayments.reduce((sum: number, d: any) => sum + d.dividendPerShare, 0);
          lastYearPayments.forEach((d: any) => {
            const m = new Date(d.exDate).getMonth();
            monthlyDPSMap.set(m, d.dividendPerShare);
          });
        }

        const initialQuantity = holdings
          .filter((h: any) => h.symbol.toUpperCase() === symbol)
          .reduce((sum: number, h: any) => sum + parseFloat(h.quantity.toString()), 0);

        symbolDataMap.set(symbol as string, {
          monthlyDPS: monthlyDPSMap,
          trueAnnualDPS: estimatedAnnualDPS,
          currentPrice,
          name: holding.name,
          initialQuantity
        });
      }

      // 2. 12-month simulation
      const simulationState = new Map<string, { 
        quantity: number, 
        projectedTotal: number 
      }>();
      
      for (const [symbol, data] of Array.from(symbolDataMap.entries())) {
        simulationState.set(symbol, {
          quantity: data.initialQuantity,
          projectedTotal: 0
        });
      }

      const monthlyProjections = [];
      let totalProjectedAnnual = 0;
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentMonthProjectedMap = new Map<string, number>();
      for (const symbol of symbolDataMap.keys()) {
        currentMonthProjectedMap.set(symbol, 0);
      }

      for (let i = 0; i < 12; i++) {
        const projectionDate = new Date(currentYear, currentMonth + i, 1);
        const targetMonth = projectionDate.getMonth();
        const targetYear = projectionDate.getFullYear();
        
        let monthlyTotal = 0;

        for (const [symbol, data] of Array.from(symbolDataMap.entries())) {
          const state = simulationState.get(symbol)!;
          
          if (data.monthlyDPS.has(targetMonth)) {
            const scheduledDPS = data.monthlyDPS.get(targetMonth)!;
            const payout = state.quantity * scheduledDPS;
            
            if (i === 0) {
              currentMonthProjectedMap.set(symbol, payout);
            }
            state.projectedTotal += payout;
            monthlyTotal += payout;

            if (input.withDRIP && data.currentPrice > 0) {
              state.quantity += payout / data.currentPrice;
            }
          }
        }

        totalProjectedAnnual += monthlyTotal;
        monthlyProjections.push({
          month: `${monthNames[targetMonth]} ${targetYear}`,
          amount: monthlyTotal.toFixed(2)
        });
      }

      // 3. Final response construction
      const assets = Array.from(symbolDataMap.entries()).map(([symbol, data]) => {
        const state = simulationState.get(symbol)!;
        const divYield = data.currentPrice > 0 ? (data.trueAnnualDPS / data.currentPrice) * 100 : 0;
        
        return {
          symbol,
          name: data.name,
          currentQuantity: data.initialQuantity,
          finalQuantity: state.quantity,
          annualDPS: data.trueAnnualDPS.toFixed(4),
          currentPrice: data.currentPrice,
          yield: divYield.toFixed(2),
          projectedAnnual: state.projectedTotal.toFixed(2),
          projectedCurrentMonth: (currentMonthProjectedMap.get(symbol) || 0).toFixed(2)
        };
      });

      // Blended dividend yield weighted by current allocation (market value)
      let totalMarketValue = 0;
      let weightedYieldSum = 0;
      for (const [symbol, data] of Array.from(symbolDataMap.entries())) {
        const marketValue = data.initialQuantity * data.currentPrice;
        const divYield = data.currentPrice > 0 ? (data.trueAnnualDPS / data.currentPrice) * 100 : 0;
        if (marketValue > 0) {
          totalMarketValue += marketValue;
          weightedYieldSum += divYield * marketValue;
        }
      }
      const blendedYield = totalMarketValue > 0 ? weightedYieldSum / totalMarketValue : 0;

      return {
        totalProjectedAnnual: totalProjectedAnnual.toFixed(2),
        blendedYield: blendedYield.toFixed(2),
        totalMarketValue: totalMarketValue.toFixed(2),
        assets,
        monthlyProjection: monthlyProjections
      };
    }),

  lookupETFName: publicProcedure
    .input(z.object({ symbol: z.string().min(1).max(20) }))
    .query(async ({ input }) => {
      const name = await fetchETFName(input.symbol.toUpperCase());
      return name || null;
    }),

  executeTrade: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        holdingId: z.number(),
        symbol: z.string(),
        accountId: z.number(),
        quantity: z.string(),
        price: z.string(),
        purchaseDate: z.date(),
        fees: z.string().optional(),
        type: z.enum(["buy", "sell"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      // Verify account belongs to portfolio
      const account = await dbInstance
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, input.accountId), 
          eq(accounts.portfolioId, input.portfolioId),
          eq(accounts.userId, ctx.user.id)
        ))
        .then((rows: any[]) => rows[0]);
      
      if (!account) {
        throw new Error("Invalid account selection for this portfolio");
      }

      let holdingId = input.holdingId;
      let holding: any;

      if (holdingId === -1) {
        const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
        holding = holdings.find((h: any) => h.symbol === input.symbol.toUpperCase());

        if (!holding) {
          if (input.type === "sell") {
            throw new Error("Cannot sell: No holding found for this symbol");
          }
          
          const name = (await fetchETFName(input.symbol.toUpperCase())) || input.symbol.toUpperCase();
          const isValid = await validateEtfSymbol(input.symbol);
          if (!isValid) {
            throw new Error(`Invalid ETF symbol: ${input.symbol}`);
          }
          const priceData = await fetchEtfPrice(input.symbol);
          const currentPrice = priceData?.price.toString();
          const annualDividendPerShare = (await calculateAnnualDPS(input.symbol)).toString();

          holdingId = await createEtfHolding({
            userId: ctx.user.id,
            portfolioId: input.portfolioId,
            accountId: input.accountId,
            symbol: input.symbol.toUpperCase(),
            name: name,
            quantity: "0",
            purchasePrice: input.price,
            purchaseDate: input.purchaseDate,
            desiredAllocation: "0",
            currentPrice: currentPrice || input.price,
            lastPriceUpdate: new Date(),
            annualDividendPerShare,
          });
          holding = { symbol: input.symbol.toUpperCase(), accountId: input.accountId };
        } else {
          holdingId = holding.id;
        }
      } else {
        const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
        holding = holdings.find((h: any) => h.id === holdingId);
        if (!holding) {
          throw new Error("Holding not found");
        }
      }

      const quantityNum = parseFloat(input.quantity);
      const priceNum = parseFloat(input.price);
      const feesNum = parseFloat(input.fees || "0");

      if (input.type === "buy") {
        const totalCost = truncateNumber((quantityNum * priceNum) + feesNum);
        const description = `You bought ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        
        const cashResult = await updateCashBalance(
          ctx.user.id,
          input.portfolioId,
          "0", // Balance will be recalculated by updateCashBalance
          input.accountId,
          input.purchaseDate,
          {
            type: "withdrawal",
            transactionAmount: totalCost.toString(),
            description: description
          }
        );

        await addPurchase({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          holdingId: Number(holdingId),
          symbol: holding.symbol,
          quantity: input.quantity,
          price: input.price,
          fees: input.fees || "0",
          cashTransactionId: cashResult.historyId,
          purchaseDate: input.purchaseDate,
        });
      } else {
        // SELL logic - FIFO
        const totalOwned = parseFloat(holding.quantity);
        if (totalOwned < quantityNum) {
          throw new Error(`Insufficient shares to sell. Owned: ${totalOwned}, Requested: ${quantityNum}`);
        }

        const totalProceeds = truncateNumber((quantityNum * priceNum) - feesNum);

        // 1. Create cash transaction (deposit)
        const currentBalance = await getCashBalance(ctx.user.id, input.portfolioId, input.accountId);
        const currentAmountNum = currentBalance ? parseFloat(currentBalance.amount) : 0;
        const newAmountNum = currentAmountNum + totalProceeds;

        const description = `You sold ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        
        await updateCashBalance(
          ctx.user.id,
          input.portfolioId,
          "0", // Balance will be recalculated by updateCashBalance
          input.accountId,
          input.purchaseDate,
          {
            type: "deposit",
            transactionAmount: totalProceeds.toString(),
            description: description
          }
        );

        // 2. Reduce shares using FIFO
        // Get all purchases for this holding, sorted by date (oldest first)
        const db = await getDb();
        const allPurchases = await db.select()
          .from(purchases)
          .where(eq(purchases.holdingId, Number(holdingId)))
          .orderBy(purchases.purchaseDate, purchases.id); // Oldest first

        let remainingToSell = quantityNum;
        for (const purchase of allPurchases) {
          if (remainingToSell <= 0) break;

          const purchaseQty = parseFloat(purchase.quantity);
          if (purchaseQty <= remainingToSell) {
            // Mark entire purchase as sold
            await updatePurchase(purchase.id, { 
              isSold: true, 
              soldDate: input.purchaseDate,
              soldPrice: input.price
            });
            remainingToSell -= purchaseQty;
          } else {
            // Partial sale: split the purchase record
            const remainingQty = purchaseQty - remainingToSell;
            
            // 1. Update existing record with the sold portion and mark as sold
            await updatePurchase(purchase.id, { 
              quantity: remainingToSell.toString(),
              isSold: true,
              soldDate: input.purchaseDate,
              soldPrice: input.price
            });

            // 2. Create a new record for the unsold portion
            await addPurchase({
              userId: ctx.user.id,
              portfolioId: purchase.portfolioId,
              accountId: purchase.accountId,
              holdingId: purchase.holdingId,
              symbol: purchase.symbol,
              quantity: remainingQty.toString(),
              price: purchase.price,
              fees: "0",
              purchaseDate: purchase.purchaseDate,
              isSold: false
            });

            remainingToSell = 0;
          }
        }
      }

      const averageCost = await calculateAverageCost(Number(holdingId));
      
      const db = await getDb();
      const updatedHolding = await db.select()
        .from(etfHoldings)
        .where(eq(etfHoldings.id, Number(holdingId)))
        .then((rows: any[]) => rows[0]);

      return {
        success: true,
        newQuantity: updatedHolding ? parseFloat(updatedHolding.quantity).toFixed(3) : "0.000",
        averageCost: updatedHolding ? parseFloat(averageCost || input.price).toFixed(3) : "0.000",
      };
    }),

  getPurchases: protectedProcedure
    .input(z.object({ 
      holdingId: z.number(), 
      symbol: z.string().optional(),
      portfolioId: z.number().optional()
    }))
    .query(async ({ ctx, input }) => {
      if (input.holdingId === -1 && input.symbol && input.portfolioId) {
        // Return all purchases for this symbol in this portfolio across all accounts
        const db = await getDb();
        return db.select().from(purchases).where(
          and(
            eq(purchases.userId, ctx.user.id),
            eq(purchases.portfolioId, input.portfolioId),
            eq(purchases.symbol, input.symbol.toUpperCase())
          )
        ).orderBy(desc(sql`COALESCE(${purchases.soldDate}, ${purchases.purchaseDate})`));
      }
      return getPurchases(input.holdingId);
    }),

  transferPurchases: protectedProcedure
    .input(z.object({
      purchaseIds: z.array(z.number()),
      targetPortfolioId: z.number(),
      targetAccountId: z.number(),
      symbol: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      
      // 1. Verify target account belongs to target portfolio and user
      const targetAccount = await db.select().from(accounts).where(and(
        eq(accounts.id, input.targetAccountId),
        eq(accounts.portfolioId, input.targetPortfolioId),
        eq(accounts.userId, ctx.user.id)
      )).then(rows => rows[0]);

      if (!targetAccount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target account not found or access denied" });
      }

      // 2. Ensure holding exists in the target account
      let targetHolding = await db.select().from(etfHoldings).where(and(
        eq(etfHoldings.symbol, input.symbol.toUpperCase()),
        eq(etfHoldings.accountId, input.targetAccountId),
        eq(etfHoldings.userId, ctx.user.id)
      )).then(rows => rows[0]);

      if (!targetHolding) {
        // Find information from any source holding to create the target holding
        const sourcePurchase = await db.select().from(purchases).where(and(
          eq(purchases.id, input.purchaseIds[0]),
          eq(purchases.userId, ctx.user.id)
        )).then(rows => rows[0]);

        if (!sourcePurchase) throw new TRPCError({ code: "NOT_FOUND", message: "Source purchase not found" });

        const sourceHolding = await db.select().from(etfHoldings).where(and(
          eq(etfHoldings.id, sourcePurchase.holdingId)
        )).then(rows => rows[0]);

        const holdingId = await createEtfHolding({
          userId: ctx.user.id,
          portfolioId: input.targetPortfolioId,
          accountId: input.targetAccountId,
          symbol: input.symbol.toUpperCase(),
          name: sourceHolding?.name || input.symbol.toUpperCase(),
          quantity: "0",
          purchasePrice: sourceHolding?.purchasePrice || "0",
          purchaseDate: sourceHolding?.purchaseDate || new Date(),
          desiredAllocation: "0",
          currentPrice: sourceHolding?.currentPrice || "0",
          lastPriceUpdate: new Date(),
        });
        
        targetHolding = { id: Number(holdingId) } as any;
      }

      // 3. Track source holding IDs to recalculate them later
      const sourceHoldingIds = new Set<number>();
      const sourcePurchases = await db.select().from(purchases).where(and(
        inArray(purchases.id, input.purchaseIds),
        eq(purchases.userId, ctx.user.id)
      ));

      for (const sp of sourcePurchases) {
        sourceHoldingIds.add(sp.holdingId);
      }

      // 4. Update all selected purchases
      await db.update(purchases)
        .set({
          portfolioId: input.targetPortfolioId,
          accountId: input.targetAccountId,
          holdingId: targetHolding!.id,
        })
        .where(and(
          inArray(purchases.id, input.purchaseIds),
          eq(purchases.userId, ctx.user.id)
        ));

      // 5. Recalculate average cost and quantity for all involved holdings
      for (const hid of Array.from(sourceHoldingIds)) {
        await calculateAverageCost(hid);
      }
      await calculateAverageCost(targetHolding!.id);

      return { success: true };
    }),

  calculateAverageCost: protectedProcedure
    .input(z.object({ holdingId: z.number() }))
    .query(async ({ input }) => {
      return calculateAverageCost(input.holdingId);
    }),

  editPurchase: protectedProcedure
    .input(z.object({
      purchaseId: z.number(),
      holdingId: z.number(),
      portfolioId: z.number(),
      accountId: z.number(),
      quantity: z.string(),
      price: z.string(),
      fees: z.string().optional(),
      purchaseDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      
      // 1. Get existing purchase to find linked cash transaction
      const existingPurchase = await db.select()
        .from(purchases)
        .where(eq(purchases.id, input.purchaseId))
        .then((rows: any[]) => rows[0]);
      
      if (!existingPurchase) {
        throw new Error("Purchase not found");
      }

      const quantityNum = parseFloat(input.quantity);
      const priceNum = parseFloat(input.price);
      const feesNum = parseFloat(input.fees || "0");
      const totalCost = truncateNumber((quantityNum * priceNum) + feesNum);

      // 2. Update purchase record
      await updatePurchase(input.purchaseId, {
        quantity: input.quantity,
        price: input.price,
        fees: input.fees || "0",
        purchaseDate: input.purchaseDate,
      });

      // 3. Update linked cash transaction if it exists
      if (existingPurchase.cashTransactionId) {
        const description = `You bought ${input.quantity} ${existingPurchase.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        
        // We need to update the cashBalanceHistory record
        await db.update(cashBalanceHistory)
          .set({
            transactionAmount: totalCost.toString(),
            description: description,
            date: input.purchaseDate,
          })
          .where(eq(cashBalanceHistory.id, existingPurchase.cashTransactionId));
        
        // Recalculate cash balance for the account without creating a new record
        await recalculateCashBalances(
          ctx.user.id,
          input.portfolioId,
          input.accountId
        );
      }

      // 4. Update the holding totals (average cost and total quantity)
      const newAvgCost = await calculateAverageCost(input.holdingId);
      
      return {
        success: true,
        newAvgCost,
      };
    }),

  deletePurchase: protectedProcedure
    .input(z.object({ 
      purchaseId: z.number(), 
      holdingId: z.number(), 
      portfolioId: z.number(),
      accountId: z.number(),
      symbol: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      
      const purchaseRecord = await dbInstance
        .select()
        .from(purchases)
        .where(and(eq(purchases.id, input.purchaseId), eq(purchases.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);
      
      if (!purchaseRecord) {
        throw new Error("Purchase record not found or unauthorized");
      }

      // If holdingId is -1 (consolidated), we need to find the real holdingId from the purchase record
      let actualHoldingId = input.holdingId;
      if (actualHoldingId === -1) {
        actualHoldingId = purchaseRecord.holdingId;
      }

      const holding = await dbInstance
        .select()
        .from(etfHoldings)
        .where(and(eq(etfHoldings.id, actualHoldingId), eq(etfHoldings.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);
      
      if (!holding) {
        throw new Error("Holding not found or unauthorized");
      }

      // Delete associated cash transaction if it exists
      if (purchaseRecord.cashTransactionId) {
        try {
          // First delete the purchase so the safety check in deleteCashTransaction passes
          await deletePurchase(input.purchaseId);
          
          // Now call deleteCashTransaction to handle the balance recalculation and record deletion
          await deleteCashTransaction(
            ctx.user.id, 
            input.portfolioId, 
            input.accountId, 
            purchaseRecord.cashTransactionId
          );
        } catch (error) {
          console.error("Error deleting linked cash transaction:", error);
          // If the above failed (e.g. purchase already deleted but cash transaction failed), 
          // ensure we at least try to delete the purchase if not already done.
        }
      } else {
        await deletePurchase(input.purchaseId);
      }

      const newAvgCost = await calculateAverageCost(actualHoldingId);
      
      return {
        success: true,
        newAvgCost,
      };
    }),

  deleteHoldingBySymbol: protectedProcedure
    .input(z.object({ portfolioId: z.number(), symbol: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const symbol = input.symbol.toUpperCase();
      
      const holdings = await db.select()
        .from(etfHoldings)
        .where(and(
          eq(etfHoldings.userId, ctx.user.id),
          eq(etfHoldings.portfolioId, input.portfolioId),
          eq(etfHoldings.symbol, symbol)
        ));

      for (const holding of holdings) {
        await db.delete(purchases).where(eq(purchases.holdingId, holding.id));
        await deleteEtfHolding(holding.id);
      }

      return { success: true, deletedCount: holdings.length };
    }),

  getPortfolioSummary: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number(), 
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      
      // 1. Get all accounts for this portfolio to help with filtering
      const portfolioAccounts = await db.select().from(accounts).where(and(
        eq(accounts.userId, ctx.user.id),
        eq(accounts.portfolioId, input.portfolioId)
      ));

      // Filter accounts by type if requested
      const filteredAccountIds = portfolioAccounts
        .filter((a: any) => !input.accountType || a.accountType === input.accountType)
        .map((a: any) => a.id);

      // 2. Get holdings, potentially filtered by accountId OR accountType
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      
      // If filtering by accountType, restrict holdings to those accounts
      if (input.accountType && input.accountId === undefined) {
        holdings = holdings.filter((h: any) => filteredAccountIds.includes(h.accountId));
      }

      // 3. Get cash balance
      let currentCashBalance = await getCashBalance(ctx.user.id, input.portfolioId, input.accountId);
      
      // If filtering by accountType, we need to sum cash from all matching accounts
      if (input.accountType && input.accountId === undefined) {
        const matchingCashRows = await db.select()
          .from(cashBalance)
          .where(and(
            eq(cashBalance.userId, ctx.user.id),
            eq(cashBalance.portfolioId, input.portfolioId),
            sql`${cashBalance.accountId} IN (${sql.join(filteredAccountIds.length > 0 ? filteredAccountIds : [-1], sql`, `)})`
          ));
        const totalCash = matchingCashRows.reduce((sum: number, row: any) => sum + parseFloat(row.amount), 0);
        currentCashBalance = { amount: totalCash.toString() } as any;
      }

      const allCashBalances = await db.select().from(cashBalance).where(and(
        eq(cashBalance.userId, ctx.user.id),
        eq(cashBalance.portfolioId, input.portfolioId)
      ));      
      const cashBalancesMap: Record<number, string> = {};
      allCashBalances.forEach((cb: any) => {
        if (cb.accountId) {
          cashBalancesMap[cb.accountId] = cb.amount;
        }
      });

      let equityInvestmentValue = 0;
      let fixedIncomeInvestmentValue = 0;
      let totalInvestmentValue = 0;
      const holdingsWithValues = await Promise.all(
        holdings.map(async (holding: any) => {
          const currentPrice = holding.currentPrice
            ? parseFloat(holding.currentPrice.toString())
            : 0;
          const quantity = parseFloat(holding.quantity.toString());
          const value = truncateNumber(currentPrice * quantity);

          // Calculate average cost from purchases
          const avgCost = await calculateAverageCost(holding.id);
          const avgCostValue = avgCost
            ? parseFloat(avgCost.toString())
            : parseFloat(holding.purchasePrice.toString());
          const purchaseValue = truncateNumber(avgCostValue * quantity);
          const gain = value - purchaseValue;

          equityInvestmentValue += value;

          return {
            ...holding,
            averageCost: avgCost,
            totalCostNum: purchaseValue,
            currentValueNum: value,
            gainNum: gain,
            assetType: "etf",
          };
        })
      );

      // Include bond holdings in investment value and holdings list
      let bondHoldingsRaw = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
      if (input.accountType && input.accountId === undefined) {
        bondHoldingsRaw = bondHoldingsRaw.filter((h: any) => filteredAccountIds.includes(h.accountId));
      }
      const bondHoldingsWithValues = await Promise.all(
        bondHoldingsRaw.map(async (holding: any) => {
          const brokeragePriceStr = await getBondPriceFromBrokerage(holding.symbol);
          const effectivePrice = brokeragePriceStr ? parseFloat(brokeragePriceStr) : (holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0);
          const quantity = parseFloat(holding.quantity.toString());
          const value = truncateNumber(effectivePrice * quantity);
          const avgCost = await calculateBondAverageCost(holding.id);
          const avgCostValue = avgCost ? parseFloat(avgCost.toString()) : parseFloat(holding.purchasePrice.toString());
          const purchaseValue = truncateNumber(avgCostValue * quantity);
          const gain = value - purchaseValue;
          fixedIncomeInvestmentValue += value;
          // keep currentPrice in sync if brokerage has newer
          if (brokeragePriceStr && holding.currentPrice !== brokeragePriceStr) {
            const dbInner = await getDb();
            await dbInner.update(bondHoldings).set({ currentPrice: brokeragePriceStr }).where(eq(bondHoldings.id, holding.id));
            holding.currentPrice = brokeragePriceStr;
          }
          return {
            ...holding,
            currentPrice: brokeragePriceStr || holding.currentPrice,
            averageCost: avgCost,
            totalCostNum: purchaseValue,
            currentValueNum: value,
            gainNum: gain,
            assetType: "bond",
          };
        })
      );
      totalInvestmentValue = truncateNumber(equityInvestmentValue + fixedIncomeInvestmentValue);
      const allHoldingsWithValues = [...holdingsWithValues, ...bondHoldingsWithValues];

      let processedHoldings: any[];
      if (input.accountId === undefined) {
        const consolidatedMap = new Map<string, any>();
        for (const h of allHoldingsWithValues) {
          if (!consolidatedMap.has(h.symbol)) {
            consolidatedMap.set(h.symbol, {
              ...h,
              id: -1,
              isConsolidated: true,
              quantity: 0,
              currentValueNum: 0,
              totalCostNum: 0,
              gainNum: 0,
              accountBreakdown: [],
            });
          }
          const existing = consolidatedMap.get(h.symbol);
          existing.quantity += parseFloat(h.quantity.toString());
          existing.currentValueNum += h.currentValueNum;
          existing.totalCostNum += h.totalCostNum;
          existing.gainNum += h.gainNum;
          
          // Find account info for this holding
          const account = portfolioAccounts.find((a: any) => a.id === h.accountId);
          
          existing.accountBreakdown.push({
            id: h.id,
            accountId: h.accountId,
            accountName: account?.name || "Unknown Account",
            quantity: h.quantity.toString(),
            averageCost: h.averageCost,
            totalCost: truncateNumber(h.totalCostNum).toFixed(2),
            currentValue: truncateNumber(h.currentValueNum).toFixed(2),
            gain: truncateNumber(h.gainNum).toFixed(2),
            gainPercent: h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
            currentPrice: h.currentPrice,
          });
        }
        processedHoldings = Array.from(consolidatedMap.values()).map((h) => ({
          ...h,
          quantity: h.quantity.toString(),
          averageCost: h.quantity > 0 ? (h.totalCostNum / h.quantity).toString() : "0",
          totalCost: truncateNumber(h.totalCostNum).toFixed(2),
          currentValue: truncateNumber(h.currentValueNum).toFixed(2),
          gain: truncateNumber(h.gainNum).toFixed(2),
          gainPercent:
            h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
        }));
      } else {
        processedHoldings = allHoldingsWithValues.map((h) => ({
          ...h,
          totalCost: truncateNumber(h.totalCostNum).toFixed(2),
          currentValue: truncateNumber(h.currentValueNum).toFixed(2),
          gain: truncateNumber(h.gainNum).toFixed(2),
          gainPercent:
            h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
        }));
      }

      // Filter out zero-quantity holdings from the final output
      processedHoldings = processedHoldings.filter((h: any) => parseFloat(h.quantity) > 1e-6);

      const cashAmount = currentCashBalance ? parseFloat(currentCashBalance.amount.toString()) : 0;
      const totalValue = truncateNumber(totalInvestmentValue + cashAmount);

      // Calculate per-account summaries
      const accountSummaries: Record<number, { 
        investmentValue: string, 
        cashValue: string, 
        totalValue: string,
        accountType: string,
        assets: any[]
      }> = {};

      // Initialize with cash balances
      allCashBalances.forEach((cb: any) => {
        if (cb.accountId !== undefined && cb.accountId !== null) {
          // If specific account filter is on, only include that account
          if (input.accountId !== undefined && cb.accountId !== input.accountId) return;

          const account = portfolioAccounts.find((a: any) => a.id === cb.accountId);
          const type = account?.accountType || "Brokerage";

          // If account type filter is on, only include accounts of that type
          if (input.accountType && type !== input.accountType) return;

          const cash = parseFloat(cb.amount);
          accountSummaries[cb.accountId] = {
            investmentValue: "0.00",
            cashValue: truncateNumber(cash).toFixed(2),
            totalValue: truncateNumber(cash).toFixed(2),
            accountType: type,
            assets: []
          };
        }
      });

      // Add investment values and assets
      allHoldingsWithValues.forEach((h: any) => {
        if (h.accountId !== undefined && h.accountId !== null) {
          const account = portfolioAccounts.find((a: any) => a.id === h.accountId);
          const existing = accountSummaries[h.accountId] || { 
            investmentValue: "0.00", 
            cashValue: "0.00", 
            totalValue: "0.00",
            accountType: account?.accountType || "Brokerage",
            assets: []
          };
          const inv = parseFloat(existing.investmentValue) + h.currentValueNum;
          const cash = parseFloat(existing.cashValue);
          
          accountSummaries[h.accountId] = {
            investmentValue: truncateNumber(inv).toFixed(2),
            cashValue: truncateNumber(cash).toFixed(2),
            totalValue: truncateNumber(inv + cash).toFixed(2),
            accountType: existing.accountType,
            assets: [
              ...existing.assets,
              {
                ...h,
                averageCost: h.averageCost,
                currentPrice: h.currentPrice,
                totalCost: truncateNumber(h.totalCostNum).toFixed(2),
                currentValue: truncateNumber(h.currentValueNum).toFixed(2),
                gain: truncateNumber(h.gainNum).toFixed(2),
                gainPercent: h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
              }
            ]
          };
        }
      });

      // Calculate distribution by account type
      const typeMap = new Map<string, number>();
      Object.values(accountSummaries).forEach((acc: any) => {
        const type = acc.accountType || "Brokerage";
        const val = parseFloat(acc.totalValue);
        typeMap.set(type, (typeMap.get(type) || 0) + val);
      });
      
      // The default cash (accountId 0) is now handled in accountSummaries initialization 
      // because allCashBalances includes it and if (cb.accountId !== undefined) allows it.
      // So no need for extra default cash handling here which was causing double counting.

      const accountTypeBreakdown = Array.from(typeMap.entries()).map(([type, value]) => ({
        type,
        value: truncateNumber(value).toFixed(2),
        percentage: totalValue > 0 ? ((value / totalValue) * 100).toFixed(2) : "0",
      })).sort((a, b) => parseFloat(b.value) - parseFloat(a.value));

      return {
        holdings: processedHoldings,
        cashBalance: truncateNumber(cashAmount).toFixed(2),
        cashBalances: cashBalancesMap,
        accountSummaries,
        accountTypeBreakdown,
        investmentValue: truncateNumber(totalInvestmentValue).toFixed(2),
        equityInvestmentValue: truncateNumber(equityInvestmentValue).toFixed(2),
        fixedIncomeInvestmentValue: truncateNumber(fixedIncomeInvestmentValue).toFixed(2),
        totalValue: totalValue.toFixed(2),
        allocationBreakdown: (() => {
          const etfHoldings = processedHoldings.filter((h: any) => h.assetType !== "bond");
          const bondHoldingsFiltered = processedHoldings.filter((h: any) => h.assetType === "bond");
          const etfBreakdown = etfHoldings.map((h: any) => ({
            symbol: h.symbol,
            name: h.name,
            currentValue: h.currentValue,
            percentage:
              totalValue > 0
                ? ((parseFloat(h.currentValue) / totalValue) * 100).toFixed(2)
                : "0",
            assetType: h.assetType,
          }));
          if (bondHoldingsFiltered.length > 0) {
            const bondTotalValue = bondHoldingsFiltered.reduce((sum: number, h: any) => sum + parseFloat(h.currentValue), 0);
            etfBreakdown.push({
              symbol: "BONDS",
              name: "Bonds",
              currentValue: truncateNumber(bondTotalValue).toFixed(2),
              percentage: totalValue > 0 ? ((bondTotalValue / totalValue) * 100).toFixed(2) : "0",
              assetType: "bond",
            });
          }
          return etfBreakdown.sort((a: any, b: any) => parseFloat(b.currentValue) - parseFloat(a.currentValue));
        })(),
        investmentAllocationBreakdown: (() => {
          const etfHoldings = processedHoldings.filter((h: any) => h.assetType !== "bond");
          const bondHoldingsFiltered = processedHoldings.filter((h: any) => h.assetType === "bond");
          const etfBreakdown = etfHoldings.map((h: any) => ({
            symbol: h.symbol,
            name: h.name,
            currentValue: h.currentValue,
            percentage:
              totalInvestmentValue > 0
                ? ((parseFloat(h.currentValue) / totalInvestmentValue) * 100).toFixed(2)
                : "0",
            assetType: h.assetType,
          }));
          if (bondHoldingsFiltered.length > 0) {
            const bondTotalValue = bondHoldingsFiltered.reduce((sum: number, h: any) => sum + parseFloat(h.currentValue), 0);
            etfBreakdown.push({
              symbol: "BONDS",
              name: "Bonds",
              currentValue: truncateNumber(bondTotalValue).toFixed(2),
              percentage: totalInvestmentValue > 0 ? ((bondTotalValue / totalInvestmentValue) * 100).toFixed(2) : "0",
              assetType: "bond",
            });
          }
          return etfBreakdown.sort((a: any, b: any) => parseFloat(b.currentValue ?? "0") - parseFloat(a.currentValue ?? "0"));
        })(),
        cashAllocationPercent: totalValue > 0 ? ((cashAmount / totalValue) * 100).toFixed(2) : "0",
      };
    }),

  getIncomeTable: protectedProcedure
    .input(z.object({
      portfolioId: z.number().optional(),
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      let portfolioAccounts: any[];
      if (input.portfolioId) {
        portfolioAccounts = await db.select().from(accounts).where(and(
          eq(accounts.userId, ctx.user.id),
          eq(accounts.portfolioId, input.portfolioId)
        ));
      } else {
        portfolioAccounts = await db.select().from(accounts).where(eq(accounts.userId, ctx.user.id));
      }
      const filteredAccountIds = portfolioAccounts
        .filter((a: any) => !input.accountType || a.accountType === input.accountType)
        .map((a: any) => a.id);

      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      if (input.accountType && input.accountId === undefined) {
        holdings = holdings.filter((h: any) => filteredAccountIds.includes(h.accountId));
      }
      let bondHoldingsRaw = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
      if (input.accountType && input.accountId === undefined) {
        bondHoldingsRaw = bondHoldingsRaw.filter((h: any) => filteredAccountIds.includes(h.accountId));
      }

      // Build holdingsWithValues similar to getPortfolioSummary but keep for income table
      let equityInvestmentValue = 0;
      let fixedIncomeInvestmentValue = 0;
      const holdingsWithValues = await Promise.all(
        holdings.map(async (holding: any) => {
          const currentPrice = holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0;
          const quantity = parseFloat(holding.quantity.toString());
          const value = truncateNumber(currentPrice * quantity);
          const avgCost = await calculateAverageCost(holding.id);
          const avgCostValue = avgCost ? parseFloat(avgCost.toString()) : parseFloat(holding.purchasePrice.toString());
          const purchaseValue = truncateNumber(avgCostValue * quantity);
          const gain = value - purchaseValue;
          equityInvestmentValue += value;
          return { ...holding, averageCost: avgCost, totalCostNum: purchaseValue, currentValueNum: value, gainNum: gain, assetType: "etf" };
        })
      );
      const bondHoldingsWithValues = await Promise.all(
        bondHoldingsRaw.map(async (holding: any) => {
          const brokeragePriceStr = await getBondPriceFromBrokerage(holding.symbol);
          const effectivePrice = brokeragePriceStr ? parseFloat(brokeragePriceStr) : (holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0);
          const quantity = parseFloat(holding.quantity.toString());
          const value = truncateNumber(effectivePrice * quantity);
          const avgCost = await calculateBondAverageCost(holding.id);
          const avgCostValue = avgCost ? parseFloat(avgCost.toString()) : parseFloat(holding.purchasePrice.toString());
          const purchaseValue = truncateNumber(avgCostValue * quantity);
          const gain = value - purchaseValue;
          fixedIncomeInvestmentValue += value;
          return { ...holding, currentPrice: brokeragePriceStr || holding.currentPrice, averageCost: avgCost, totalCostNum: purchaseValue, currentValueNum: value, gainNum: gain, assetType: "bond" };
        })
      );
      const allHoldingsWithValues = [...holdingsWithValues, ...bondHoldingsWithValues];

      let processedHoldings: any[];
      if (input.accountId === undefined) {
        const consolidatedMap = new Map<string, any>();
        for (const h of allHoldingsWithValues) {
          if (!consolidatedMap.has(h.symbol)) {
            consolidatedMap.set(h.symbol, { ...h, id: -1, isConsolidated: true, quantity: 0, currentValueNum: 0, totalCostNum: 0, gainNum: 0, accountBreakdown: [], assetType: h.assetType, name: h.name, purchasePrice: h.purchasePrice, currentPrice: h.currentPrice, couponRate: (h as any).couponRate, redemptionDate: (h as any).redemptionDate });
          }
          const existing = consolidatedMap.get(h.symbol);
          existing.quantity += parseFloat(h.quantity.toString());
          existing.currentValueNum += h.currentValueNum;
          existing.totalCostNum += h.totalCostNum;
          existing.gainNum += h.gainNum;
          const account = portfolioAccounts.find((a: any) => a.id === h.accountId);
          existing.accountBreakdown.push({ id: h.id, accountId: h.accountId, accountName: account?.name || "Unknown", quantity: h.quantity.toString(), currentValue: truncateNumber(h.currentValueNum).toFixed(2) });
          // Keep coupon/redemption from first
          if (!existing.couponRate && (h as any).couponRate) existing.couponRate = (h as any).couponRate;
          if (!existing.redemptionDate && (h as any).redemptionDate) existing.redemptionDate = (h as any).redemptionDate;
        }
        processedHoldings = Array.from(consolidatedMap.values()).map((h) => ({
          ...h,
          quantity: h.quantity.toString(),
          averageCost: h.quantity > 0 ? (h.totalCostNum / h.quantity).toString() : "0",
          totalCost: truncateNumber(h.totalCostNum).toFixed(2),
          currentValue: truncateNumber(h.currentValueNum).toFixed(2),
          gain: truncateNumber(h.gainNum).toFixed(2),
          gainPercent: h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
        }));
      } else {
        processedHoldings = allHoldingsWithValues.map((h) => ({
          ...h,
          totalCost: truncateNumber(h.totalCostNum).toFixed(2),
          currentValue: truncateNumber(h.currentValueNum).toFixed(2),
          gain: truncateNumber(h.gainNum).toFixed(2),
          gainPercent: h.totalCostNum > 0 ? ((h.gainNum / h.totalCostNum) * 100).toFixed(2) : "0",
        }));
      }
      processedHoldings = processedHoldings.filter((h: any) => parseFloat(h.quantity) > 1e-6);

      // Helper to compute dividends for ETFs and interest for bonds
      const rows: any[] = [];
      for (const h of processedHoldings) {
        const symbol = h.symbol;
        const totalCostNum = parseFloat(h.totalCost || "0");
        const currentValueNum = parseFloat(h.currentValue || "0");
        const gainNum = parseFloat(h.gain || "0");
        const gainPercent = h.gainPercent || "0";
        let dividendsReceived = 0;

        if (h.assetType === "bond") {
          // Compute bond interest received: sum of past coupons where quantity owned >0
          try {
            const redemption = (h as any).redemptionDate ? new Date((h as any).redemptionDate) : null;
            const couponRate = parseFloat((h as any).couponRate || "0");
            if (redemption && couponRate > 0) {
              // Collect all purchases for this symbol (for consolidated, gather across holdings)
              let allPurchases: any[] = [];
              if (h.isConsolidated) {
                for (const ab of (h.accountBreakdown || [])) {
                  const ps = await getBondPurchases(ab.id);
                  allPurchases = allPurchases.concat(ps);
                }
              } else {
                allPurchases = await getBondPurchases(h.id);
              }
              // Find earliest purchase date
              let earliest: Date | null = null;
              for (const p of allPurchases) {
                const d = new Date(p.purchaseDate);
                if (!earliest || d < earliest) earliest = d;
              }
              if (earliest) {
                // Generate coupon dates from redemption backwards to earliest
                const couponDates: Date[] = [];
                let cur = new Date(redemption);
                const from = new Date(earliest);
                from.setHours(0,0,0,0);
                const now = new Date();
                while (cur >= from) {
                  if (cur <= now) couponDates.push(new Date(cur));
                  cur.setMonth(cur.getMonth() - 6);
                }
                // For each coupon date, compute quantity owned at that date
                for (const cDate of couponDates) {
                  cDate.setHours(0,0,0,0);
                  let qtyOwned = 0;
                  for (const p of allPurchases) {
                    const pDate = new Date(p.purchaseDate);
                    pDate.setHours(0,0,0,0);
                    if (pDate >= cDate) continue;
                    const isSold = (p as any).isSold;
                    const soldDate = (p as any).soldDate ? new Date((p as any).soldDate) : null;
                    if (isSold && soldDate && soldDate < cDate) continue;
                    if (isSold && !soldDate) continue; // sold but no date, assume not owned
                    // qty for this purchase
                    qtyOwned += parseFloat((p as any).quantity);
                  }
                  // Fallback if no purchases tracked but holding has quantity (e.g., initial holding without purchase record)
                  if (allPurchases.length === 0 && qtyOwned === 0) {
                    const holdingQty = parseFloat(h.quantity);
                    // If cDate after earliest (which is purchase date), use holdingQty
                    qtyOwned = holdingQty;
                  }
                  if (qtyOwned > 0) {
                    dividendsReceived += qtyOwned * couponRate / 2;
                  }
                }
              }
            }
          } catch (e) {
            // ignore bond interest calc errors
            dividendsReceived = 0;
          }
        } else {
          // ETF dividends: sum quantityOwned * dividendPerShare for all exDates where quantityOwned>0
          try {
            const dividendData = await fetchDividendData(symbol);
            // Gather purchases across holdings for this symbol
            let allPurchases: any[] = [];
            if (h.isConsolidated) {
              for (const ab of (h.accountBreakdown || [])) {
                const ps = await getPurchases(ab.id);
                allPurchases = allPurchases.concat(ps);
              }
            } else {
              allPurchases = await getPurchases(h.id);
            }
            for (const div of dividendData) {
              const exDate = new Date(div.exDate);
              exDate.setHours(0,0,0,0);
              let qtyOwned = 0;
              for (const p of allPurchases) {
                const pDate = new Date(p.purchaseDate);
                if (pDate < exDate) qtyOwned += parseFloat((p as any).quantity);
                // Note: purchases for ETFs are not marked isSold in same way? sell is handled via isSold flag similar to bonds, but we approximate by purchaseDate < exDate
                // For more accuracy, check isSold/soldDate if present
                const isSold = (p as any).isSold;
                const soldDate = (p as any).soldDate ? new Date((p as any).soldDate) : null;
                if (isSold && soldDate && soldDate < exDate) {
                  // if sold before exDate, should not count – we already counted but need to subtract
                  // Since we summed all purchases with purchaseDate < exDate, we need to exclude sold ones
                  // Our earlier sum already included them, so subtract if sold before exDate
                  // To keep simple, recompute qtyOwned as above but excluding sold before exDate
                  // For now, handle: if isSold and soldDate < exDate, subtract
                  qtyOwned -= parseFloat((p as any).quantity);
                }
              }
              if (qtyOwned > 0) dividendsReceived += qtyOwned * div.dividendPerShare;
            }
          } catch (e) {
            dividendsReceived = 0;
          }
        }

        const dividendsPercent = totalCostNum > 0 ? (dividendsReceived / totalCostNum * 100) : 0;
        const currentValuePlusDiv = currentValueNum + dividendsReceived;
        const totalGainInc = currentValuePlusDiv - totalCostNum;
        const totalGainPercentInc = totalCostNum > 0 ? (totalGainInc / totalCostNum * 100) : 0;

        rows.push({
          symbol: h.symbol,
          name: h.name,
          assetType: h.assetType,
          quantity: h.quantity,
          totalCost: truncateNumber(totalCostNum).toFixed(2),
          currentValue: truncateNumber(currentValueNum).toFixed(2),
          gain: truncateNumber(gainNum).toFixed(2),
          gainPercent: h.gainPercent,
          dividendsReceived: truncateNumber(dividendsReceived).toFixed(2),
          dividendsPercent: dividendsPercent.toFixed(2),
          currentValuePlusDividends: truncateNumber(currentValuePlusDiv).toFixed(2),
          totalGainInc: truncateNumber(totalGainInc).toFixed(2),
          totalGainPercentInc: totalGainPercentInc.toFixed(2),
        });
      }

      // Sort by current value desc
      rows.sort((a: any, b: any) => parseFloat(b.currentValue) - parseFloat(a.currentValue));

      // Totals
      const totals = rows.reduce((acc: any, r: any) => {
        acc.totalCost += parseFloat(r.totalCost);
        acc.currentValue += parseFloat(r.currentValue);
        acc.gain += parseFloat(r.gain);
        acc.dividendsReceived += parseFloat(r.dividendsReceived);
        acc.currentValuePlusDividends += parseFloat(r.currentValuePlusDividends);
        acc.totalGainInc += parseFloat(r.totalGainInc);
        return acc;
      }, { totalCost: 0, currentValue: 0, gain: 0, dividendsReceived: 0, currentValuePlusDividends: 0, totalGainInc: 0 });

      const totalsRow = {
        totalCost: truncateNumber(totals.totalCost).toFixed(2),
        currentValue: truncateNumber(totals.currentValue).toFixed(2),
        gain: truncateNumber(totals.gain).toFixed(2),
        gainPercent: totals.totalCost > 0 ? ((totals.gain / totals.totalCost)*100).toFixed(2) : "0",
        dividendsReceived: truncateNumber(totals.dividendsReceived).toFixed(2),
        dividendsPercent: totals.totalCost > 0 ? ((totals.dividendsReceived / totals.totalCost)*100).toFixed(2) : "0",
        currentValuePlusDividends: truncateNumber(totals.currentValuePlusDividends).toFixed(2),
        totalGainInc: truncateNumber(totals.totalGainInc).toFixed(2),
        totalGainPercentInc: totals.totalCost > 0 ? ((totals.totalGainInc / totals.totalCost)*100).toFixed(2) : "0",
      };

      return { assets: rows, totals: totalsRow };
    }),

  importPurchasesFromCSV: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        holdingId: z.number(),
        symbol: z.string(),
        csvContent: z.string(),
        accountId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      // Verify account belongs to portfolio
      const account = await dbInstance
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, input.accountId), 
          eq(accounts.portfolioId, input.portfolioId),
          eq(accounts.userId, ctx.user.id)
        ))
        .then((rows: any[]) => rows[0]);
      
      if (!account) {
        throw new Error("Invalid account selection for this portfolio");
      }

      let holdingId = input.holdingId;
      let holding: any;

      if (holdingId === -1) {
        const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
        holding = holdings.find((h: any) => h.symbol === input.symbol.toUpperCase());

        if (!holding) {
          const name = (await fetchETFName(input.symbol.toUpperCase())) || input.symbol.toUpperCase();
          const isValid = await validateEtfSymbol(input.symbol);
          if (!isValid) {
            throw new Error(`Invalid ETF symbol: ${input.symbol}`);
          }
          const priceData = await fetchEtfPrice(input.symbol);
          const annualDividendPerShare = (await calculateAnnualDPS(input.symbol)).toString();
          
          holdingId = await createEtfHolding({
            userId: ctx.user.id,
            portfolioId: input.portfolioId,
            accountId: input.accountId,
            symbol: input.symbol.toUpperCase(),
            name: name,
            quantity: "0",
            purchasePrice: "0",
            purchaseDate: new Date(),
            desiredAllocation: "0",
            currentPrice: priceData?.price.toString() || "0",
            lastPriceUpdate: new Date(),
            annualDividendPerShare,
          });
          holding = { symbol: input.symbol.toUpperCase(), accountId: input.accountId };
        } else {
          holdingId = holding.id;
        }
      } else {
        const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
        holding = holdings.find((h: any) => h.id === holdingId);
        if (!holding) {
          throw new Error("Holding not found");
        }
      }

      const records = parseCSVContent(input.csvContent);
      const validRecords = records.filter((r: any) => !r.error);
      const invalidRecords = records.filter((r: any) => r.error);

      const result = await bulkImportPurchases(
        ctx.user.id,
        input.portfolioId,
        Number(holdingId),
        holding.symbol,
        validRecords,
        input.accountId
      );

      // Update holding account if it was null
      if (!(holding as any).accountId && input.accountId) {
        await updateEtfHolding(Number(holdingId), { accountId: input.accountId });
      }

      const newAvgCost = await calculateAverageCost(Number(holdingId));

      return {
        success: result.success > 0,
        imported: result.success,
        failed: result.failed,
        errors: [...result.errors, ...invalidRecords.map((r: any) => r.error || "")],
        newAvgCost,
      };
      }),

  getAssetQuantityHistory: protectedProcedure
    .input(
      z.object({
        holdingId: z.number(),
        range: z.enum(["1m", "ytd", "1y", "5y"]),
        symbol: z.string().optional(),
        portfolioId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let days = 365;
      if (input.range === "1m") days = 30;
      else if (input.range === "ytd") {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        days = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      } else if (input.range === "5y") days = 365 * 5;

      const interval = input.range === "1m" ? 1 : 7; // days between points
      
      let purchasesList;
      if (input.holdingId === -1 && input.symbol && input.portfolioId) {
        const db = await getDb();
        purchasesList = await db.select().from(purchases).where(
          and(
            eq(purchases.userId, ctx.user.id),
            eq(purchases.portfolioId, input.portfolioId),
            eq(purchases.symbol, input.symbol.toUpperCase())
          )
        ).orderBy(desc(purchases.purchaseDate));
      } else {
        purchasesList = await getPurchases(input.holdingId);
      }

      const result = [];
      const endDate = new Date();
      
      for (let i = days; i >= 0; i -= interval) {
        const date = new Date();
        date.setDate(endDate.getDate() - i);
        date.setHours(0, 0, 0, 0);

        let quantityOwned = 0;
        for (const purchase of purchasesList) {
          if (new Date(purchase.purchaseDate) <= date) {
            quantityOwned += parseFloat(purchase.quantity.toString());
          }
        }

        result.push({
          date: date.toISOString().split("T")[0],
          quantity: quantityOwned.toFixed(3),
        });
      }

      return result;
    }),

  getPortfolioGrowthMetrics: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        holdingId: z.number().optional(),
        symbol: z.string().optional(),
        accountId: z.number().optional(),
        accountType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      
      if (input.accountType && input.accountId === undefined) {
        const db = await getDb();
        const conditions: any[] = [eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)];
        if (input.portfolioId) conditions.push(eq(accounts.portfolioId, input.portfolioId));
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...conditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
      }

      if (input.symbol) {
        const symbolUpper = input.symbol.toUpperCase();
        holdings = holdings.filter((h: any) => h.symbol === symbolUpper);
      } else if (input.holdingId && input.holdingId !== -1) {
        holdings = holdings.filter((h: any) => h.id === input.holdingId);
      }

      const emptyMetrics = { ytd: "0", y1: "0", all: "0" };
      if (!holdings || holdings.length === 0) {
        return { marketGrowth: emptyMetrics, pricePerformance: emptyMetrics };
      }

      const calculateForRange = async (range: "ytd" | "1y" | "all") => {
        const includeCash = !input.symbol && (!input.holdingId || input.holdingId === -1);
        const data = await getProcessedEvolution(ctx.user.id, holdings, range, input.portfolioId, includeCash, undefined, input.accountId, input.accountType);
        if (data.length < 2) return { market: "0", price: "0" };

        const first = data[0];
        const last = data[data.length - 1];

        // Find first non-zero point to calculate growth from
        const firstNonZeroMarket = data.find(d => d.totalValue > 0) || first;
        const firstNonZeroPrice = data.find(d => d.priceOnlyValue > 0) || first;

        const marketGrowth = firstNonZeroMarket.totalValue > 0 
          ? ((last.totalValue - firstNonZeroMarket.totalValue) / firstNonZeroMarket.totalValue) * 100 
          : 0;
        
        const pricePerformance = firstNonZeroPrice.priceOnlyValue > 0 
          ? ((last.priceOnlyValue - firstNonZeroPrice.priceOnlyValue) / firstNonZeroPrice.priceOnlyValue) * 100 
          : 0;

        return {
          market: marketGrowth.toFixed(2),
          price: pricePerformance.toFixed(2)
        };
      };

      const [ytd, y1, allTime] = await Promise.all([
        calculateForRange("ytd"),
        calculateForRange("1y"),
        calculateForRange("all")
      ]);

      return {
        marketGrowth: { ytd: ytd.market, y1: y1.market, all: allTime.market },
        pricePerformance: { ytd: ytd.price, y1: y1.price, all: allTime.price }
      };
    }),

  getPortfolioEvolution: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        range: z.enum(["ytd", "1y", "all"]),
        holdingId: z.number().optional(),
        symbol: z.string().optional(),
        granularity: z.enum(["1d", "1wk", "1mo"]).optional(),
        accountId: z.number().optional(),
        accountType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        let holdings: any[] = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
        let bondHoldings: any[] = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
        // Enrich bond holdings with assetType and brokerage price
        bondHoldings = await Promise.all(bondHoldings.map(async (h:any)=>{
          const bp = await getBondPriceFromBrokerage(h.symbol);
          if(bp) h.currentPrice = bp;
          return {...h, assetType: "bond"};
        }));
        holdings = holdings.map((h:any)=>({...h, assetType: "etf"})).concat(bondHoldings);
        
        if (input.accountType && input.accountId === undefined) {
          const db = await getDb();
          const matchingAccounts = await db.select({ id: accounts.id })
            .from(accounts)
            .where(and(
              eq(accounts.userId, ctx.user.id),
              eq(accounts.portfolioId, input.portfolioId),
              eq(accounts.accountType, input.accountType)
            ));
          const matchingIds = matchingAccounts.map((a: any) => a.id);
          holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
        }

        if (input.symbol) {
          const symbolUpper = input.symbol.toUpperCase();
          holdings = holdings.filter((h: any) => h.symbol === symbolUpper);
        } else if (input.holdingId && input.holdingId !== -1) {
          holdings = holdings.filter((h: any) => h.id === input.holdingId);
        }

        const includeCash = !input.symbol && (!input.holdingId || input.holdingId === -1);
        // Force "1mo" granularity if not specifically overridden, but Performance page wants monthly bars
        const granularity = input.granularity || "1mo";
        const data = await getProcessedEvolution(ctx.user.id, holdings, input.range, input.portfolioId, includeCash, granularity, input.accountId, input.accountType);
        return data.map((d: any) => ({
          date: d.date,
          value: d.totalValue.toFixed(2),
          investmentValue: d.investmentValue.toFixed(2),
          equitiesValue: (d as any).equitiesValue?.toFixed(2) ?? d.investmentValue.toFixed(2),
          fixedIncomeValue: (d as any).fixedIncomeValue?.toFixed(2) ?? "0.00",
          cashValue: d.cashValue.toFixed(2)
        }));
      } catch (error) {
        console.error(`[etfRouter] Error in getPortfolioEvolution:`, error);
        throw error;
      }
    }),
  getPerformanceRiskMetrics: protectedProcedure
    .input(z.object({ portfolioId: z.number(), accountType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const holdings: any[] = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      let bondHoldings: any[] = await getUserBondHoldings(ctx.user.id, input.portfolioId);
      bondHoldings = await Promise.all(bondHoldings.map(async (h:any)=>{ const bp=await getBondPriceFromBrokerage(h.symbol); if(bp) h.currentPrice=bp; return {...h, assetType:"bond"};}));
      const allHoldings = holdings.map((h:any)=>({...h,assetType:"etf"})).concat(bondHoldings);
      if (input.accountType) {
        const db = await getDb();
        const matchingAccounts = await db.select({id: accounts.id}).from(accounts).where(and(eq(accounts.userId, ctx.user.id), eq(accounts.portfolioId, input.portfolioId), eq(accounts.accountType, input.accountType)));
        const ids = matchingAccounts.map((a:any)=>a.id);
        // filter via purchases? simplified: keep holdings filtered
      }
      const evo = await getProcessedEvolution(ctx.user.id, allHoldings, "1y", input.portfolioId, true, "1mo");
      if (evo.length < 3) return { sharpe: "0", maxDrawdown: "0", volatility: "0", winRate: "0" };
      const returns: number[] = [];
      for(let i=1;i<evo.length;i++){ const prev=parseFloat((evo[i-1] as any).totalValue); const cur=parseFloat((evo[i] as any).totalValue); if(prev>0) returns.push((cur-prev)/prev); }
      const avg = returns.reduce((a,b)=>a+b,0)/returns.length;
      const variance = returns.reduce((a,b)=> a + Math.pow(b-avg,2),0)/returns.length;
      const vol = Math.sqrt(variance);
      const sharpe = vol>0 ? (avg / vol * Math.sqrt(12)).toFixed(2) : "0";
      let peak = parseFloat((evo[0] as any).totalValue); let maxDD=0;
      for(const p of evo){ const v=parseFloat((p as any).totalValue); if(v>peak) peak=v; const dd=(peak-v)/peak; if(dd>maxDD) maxDD=dd; }
      const winRate = returns.filter(r=>r>0).length / returns.length *100;
      // benchmark vs SPY 1y
      let beta="0"; let alpha="0";
      try{ const spy = await getSmartHistoricalPrices("SPY", 365, "1mo"); if(spy.length>=returns.length){ const spyR: number[]=[]; for(let i=1;i<spy.length;i++) spyR.push((spy[i].price - spy[i-1].price)/spy[i-1].price); const spySlice=spyR.slice(-returns.length); const cov = returns.reduce((a,_,i)=> a + (returns[i]-avg)*(spySlice[i]- (spySlice.reduce((x,y)=>x+y,0)/spySlice.length)),0)/returns.length; const spyVar = spySlice.reduce((a,b)=> a+ Math.pow(b- spySlice.reduce((x,y)=>x+y,0)/spySlice.length,2),0)/spySlice.length; beta = spyVar>0 ? (cov/spyVar).toFixed(2) : "0"; alpha = (avg - parseFloat(beta)*(spySlice.reduce((x,y)=>x+y,0)/spySlice.length)).toFixed(4); } }catch(e){}
      return { sharpe, maxDrawdown: (maxDD*100).toFixed(2), volatility: (vol*100).toFixed(2), winRate: winRate.toFixed(1), beta, alpha };
    }),

  getBenchmarkSeries: protectedProcedure
    .input(z.object({ portfolioId: z.number(), range: z.enum(["ytd","1y","all"]), symbol: z.string().default("SPY"), granularity: z.enum(["1d","1wk","1mo"]).optional() }))
    .query(async ({ ctx, input }) => {
      let holdings: any[] = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      let bondHoldings: any[] = await getUserBondHoldings(ctx.user.id, input.portfolioId);
      bondHoldings = await Promise.all(bondHoldings.map(async (h:any)=>{ const bp=await getBondPriceFromBrokerage(h.symbol); if(bp) h.currentPrice=bp; return {...h, assetType:"bond"};}));
      const allHoldings = holdings.map((h:any)=>({...h,assetType:"etf"})).concat(bondHoldings);
      const evo = await getProcessedEvolution(ctx.user.id, allHoldings, input.range, input.portfolioId, true, input.granularity||"1mo");
      const benchPrices = await getSmartHistoricalPrices(input.symbol, input.range==="ytd"? 400: input.range==="1y"? 400: 1500, input.granularity||"1mo");
      if(evo.length===0||benchPrices.length===0) return [];
      // normalize both to 100
      const evoStart = parseFloat((evo[0] as any).totalValue) || 1; const benchStart = benchPrices[0].price || 1;
      const len = Math.min(evo.length, benchPrices.length);
      const startIdxEvo = evo.length - len; const startIdxBench = benchPrices.length - len;
      const out=[];
      for(let i=0;i<len;i++){ const e=evo[startIdxEvo+i] as any; const b=benchPrices[startIdxBench+i]; out.push({ date: e.date, portfolio: parseFloat(e.totalValue)/evoStart*100, benchmark: b.price/benchStart*100, benchSymbol: input.symbol }); }
      return out;
    }),

  getPerformanceMetrics: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1).max(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Fetch 1+ year of historical prices
      const prices = await getSmartHistoricalPrices(input.symbol, 400);
      
      if (!prices || prices.length === 0) {
        return {
          symbol: input.symbol,
          ytdReturn: null,
          oneYearReturn: null,
          volatility: null,
          error: "Unable to fetch historical price data",
        };
      }

      // Calculate metrics
      const metrics = calculatePerformanceMetrics(
        prices.map((p: any) => ({
          date: p.timestamp,
          price: p.price,
        }))
      );

      return {
        symbol: input.symbol,
        ytdReturn: metrics.ytdReturn,
        oneYearReturn: metrics.oneYearReturn,
        volatility: metrics.volatility,
      };
    }),

  getInvestmentActivities: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number().optional(),
        range: z.string(), // Changed to string to support dynamic quarterly keys
        accountType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      
      if (input.accountType) {
        const db = await getDb();
        const accountConditions = [
          eq(accounts.userId, ctx.user.id),
          eq(accounts.accountType, input.accountType)
        ];
        if (input.portfolioId) {
          accountConditions.push(eq(accounts.portfolioId, input.portfolioId));
        }
        
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...accountConditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
      }

      const { startDate, endDate } = calculateDateRange(input.range);

      const activitiesMap = new Map<string, any>();

      for (const holding of holdings) {
        const allPurchases = await getPurchases(holding.id);
        const filteredPurchases = allPurchases.filter((p: any) => {
          const pDate = new Date(p.purchaseDate);
          return pDate >= startDate && pDate <= endDate;
        });
        if (filteredPurchases.length > 0) {
          const symbol = holding.symbol.toUpperCase();
          const existing = activitiesMap.get(symbol);
          
          let totalQty = 0;
          let totalCost = 0;

          filteredPurchases.forEach((p: any) => {
            const qty = parseFloat(p.quantity.toString());
            const price = parseFloat(p.price.toString());
            totalQty += qty;
            totalCost += (qty * price);
          });

          const currentPrice = holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0;

          if (existing) {
            existing.totalQuantityNum += totalQty;
            existing.totalCostNum += totalCost;
            existing.purchases = [...existing.purchases, ...filteredPurchases];
            existing.purchaseCount += filteredPurchases.length;
          } else {
            activitiesMap.set(symbol, {
              symbol: symbol,
              name: holding.name,
              totalQuantityNum: totalQty,
              totalCostNum: totalCost,
              currentPrice: currentPrice,
              purchaseCount: filteredPurchases.length,
              purchases: filteredPurchases
            });
          }
        }
      }

      return Array.from(activitiesMap.values()).map(activity => {
        const currentValue = truncateNumber(activity.totalQuantityNum * activity.currentPrice);
        const gain = currentValue - activity.totalCostNum;
        const gainPercent = activity.totalCostNum > 0 ? (gain / activity.totalCostNum) * 100 : 0;

        return {
          ...activity,
          totalQuantity: activity.totalQuantityNum.toFixed(3),
          totalCost: activity.totalCostNum.toFixed(2),
          averagePrice: (activity.totalCostNum / activity.totalQuantityNum).toFixed(2),
          currentPrice: activity.currentPrice.toFixed(2),
          currentValue: currentValue.toFixed(2),
          gain: gain.toFixed(2),
          gainPercent: gainPercent.toFixed(2)
        };
      });
    }),

  getCashActivities: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number().optional(), 
      range: z.string(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = calculateDateRange(input.range);
      const db = await getDb();
      
      const conditions = [
        eq(cashBalanceHistory.userId, ctx.user.id),
        gte(cashBalanceHistory.date, startDate),
        lte(cashBalanceHistory.date, endDate)
      ];

      if (input.portfolioId) {
        conditions.push(eq(cashBalanceHistory.portfolioId, input.portfolioId));
      }

      if (input.accountType) {
        const accountConditions = [
          eq(accounts.userId, ctx.user.id),
          eq(accounts.accountType, input.accountType)
        ];
        if (input.portfolioId) {
          accountConditions.push(eq(accounts.portfolioId, input.portfolioId));
        }

        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(...accountConditions));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        if (matchingIds.length > 0) {
          conditions.push(sql`${cashBalanceHistory.accountId} IN (${sql.join(matchingIds, sql`, `)})`);
        } else {
          // No accounts of this type, force empty result
          conditions.push(eq(cashBalanceHistory.accountId, -1));
        }
      }

      return db.select()
        .from(cashBalanceHistory)
        .where(and(...conditions))
        .orderBy(desc(cashBalanceHistory.date), desc(cashBalanceHistory.id));
    }),

  getUnifiedHistory: protectedProcedure
    .input(z.object({ portfolioId: z.number(), range: z.string() }))
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = calculateDateRange(input.range);
      const db = await getDb();

      const [purchaseRecords, cashRecords] = await Promise.all([
        db.select()
          .from(purchases)
          .where(and(
            eq(purchases.userId, ctx.user.id),
            eq(purchases.portfolioId, input.portfolioId),
            gte(purchases.purchaseDate, startDate),
            lte(purchases.purchaseDate, endDate)
          )),
        db.select()
          .from(cashBalanceHistory)
          .where(and(
            eq(cashBalanceHistory.userId, ctx.user.id),
            eq(cashBalanceHistory.portfolioId, input.portfolioId),
            gte(cashBalanceHistory.date, startDate),
            lte(cashBalanceHistory.date, endDate)
          ))
      ]);

      const unifiedPurchases = purchaseRecords.map((p: any) => ({
        id: `p-${p.id}`,
        date: p.purchaseDate,
        type: 'PURCHASE' as const,
        accountId: p.accountId,
        symbol: p.symbol,
        quantity: p.quantity,
        price: p.price,
      }));

      const unifiedCash = cashRecords.map((c: any) => ({
        id: `c-${c.id}`,
        date: c.date,
        type: 'CASH' as const,
        accountId: c.accountId,
        amount: c.amount,
        transactionType: c.transactionType,
        transactionAmount: c.transactionAmount,
        description: c.description
      }));

      return [...unifiedPurchases, ...unifiedCash].sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (timeB !== timeA) return timeB - timeA;
        const idA = parseInt(a.id.toString().split('-')[1]);
        const idB = parseInt(b.id.toString().split('-')[1]);
        return idB - idA;
      });
    }),

  getYearlyPerformance: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number(), 
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      let holdings: any[] = await getUserEtfHoldings(ctx.user.id, input.portfolioId, input.accountId);
      let bondHoldings: any[] = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
      // Enrich bonds with brokerage price
      bondHoldings = await Promise.all(bondHoldings.map(async (h:any)=>{
        const bp = await getBondPriceFromBrokerage(h.symbol);
        if(bp) h.currentPrice = bp;
        return {...h, assetType:"bond"};
      }));
      holdings = holdings.map((h:any)=>({...h, assetType:"etf"})).concat(bondHoldings);
      
      const purchaseConditions: any[] = [
        eq(purchases.userId, ctx.user.id),
        eq(purchases.portfolioId, input.portfolioId)
      ];
      if (input.accountId !== undefined) {
        purchaseConditions.push(eq(purchases.accountId, input.accountId));
      }

      const allPurchasesEtf = await db.select()
        .from(purchases)
        .where(and(...purchaseConditions))
        .orderBy(purchases.purchaseDate);
      const bondPurchaseConditions: any[] = [
        eq(bondPurchases.userId, ctx.user.id),
        eq(bondPurchases.portfolioId, input.portfolioId)
      ];
      if (input.accountId !== undefined) {
        bondPurchaseConditions.push(eq(bondPurchases.accountId, input.accountId));
      }
      const allBondPurchases = await db.select().from(bondPurchases).where(and(...bondPurchaseConditions)).orderBy(bondPurchases.purchaseDate);
      const allPurchases: any[] = [...allPurchasesEtf, ...allBondPurchases];
      const cashHistory = await getCashBalanceHistory(ctx.user.id, input.portfolioId, input.accountId);

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

      // Pre-fetch all symbols price history once (bonds use constant brokerage price)
      const symbolsOwned: string[] = Array.from(new Set(allPurchases.map((p: any) => p.symbol.toUpperCase())));
      const symbolPriceHistories = new Map<string, any[]>();
      
      const daysToFetch = Math.ceil((now.getTime() - new Date(startYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) + 10;
      for (const symbol of symbolsOwned) {
        const isBondSymbol = holdings.some((h:any) => h.symbol.toUpperCase() === symbol && ((h as any).assetType === "bond" || (h as any).couponRate !== undefined));
        if (isBondSymbol) {
          const bondHolding = holdings.find((h:any) => h.symbol.toUpperCase() === symbol);
          const price = bondHolding ? parseFloat(bondHolding.currentPrice || "0") : 0;
          // Constant price history for bonds
          symbolPriceHistories.set(symbol, [{ timestamp: new Date(startYear, 0, 1), price }, { timestamp: now, price }]);
        } else {
          const history = await getSmartHistoricalPrices(symbol, daysToFetch, '1mo');
          symbolPriceHistories.set(symbol, history);
        }
      }

      const result = [];
      let previousYearEndValue = 0;

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
          previousYearEndInvValue += truncateNumber(parseFloat(p.quantity) * price);
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
            purchasesInYear += truncateNumber(parseFloat(p.quantity) * parseFloat(p.price));
          }
        });

        if (isCurrentYear) {
          for (const h of holdings) {
            const price = parseFloat(h.currentPrice || "0");
            const qty = parseFloat(h.quantity || "0");
            invValue += truncateNumber(price * qty);
            costBasis += truncateNumber(parseFloat(h.purchasePrice || "0") * qty);
          }
        } else {
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
                cost: existing.cost + truncateNumber(qty * parseFloat(p.price))
              });
            }
          });

          yearEndHoldings.forEach((data, symbol) => {
            const history = symbolPriceHistories.get(symbol) || [];
            let yearEndPrice = 0;
            const pricePoint = history.filter(p => new Date(p.timestamp) <= endDate).pop();
            if (pricePoint) {
              yearEndPrice = pricePoint.price;
            } else if (history.length > 0) {
              yearEndPrice = history[0].price;
            }
            invValue += truncateNumber(data.qty * yearEndPrice);
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
        const yearlyGainLoss = invValue - denominator;
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
          yearlyGainLoss: yearlyGainLoss.toFixed(2),
          annualReturnPercent: annualReturnPercent.toFixed(2)
        });

        previousYearEndInvValue = invValue;
      }

      return processedYears.reverse();
    }),

  getMonthlyPerformance: protectedProcedure
    .input(z.object({ 
      portfolioId: z.number(), 
      accountId: z.number().optional(),
      accountType: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      
      const purchaseConditions: any[] = [
        eq(purchases.userId, ctx.user.id),
        eq(purchases.portfolioId, input.portfolioId)
      ];
      if (input.accountId !== undefined) {
        purchaseConditions.push(eq(purchases.accountId, input.accountId));
      }

      const allPurchasesEtf = await db.select()
        .from(purchases)
        .where(and(...purchaseConditions))
        .orderBy(purchases.purchaseDate);
      const bondPurchaseConditions: any[] = [
        eq(bondPurchases.userId, ctx.user.id),
        eq(bondPurchases.portfolioId, input.portfolioId)
      ];
      if (input.accountId !== undefined) {
        bondPurchaseConditions.push(eq(bondPurchases.accountId, input.accountId));
      }
      const allBondPurchases = await db.select().from(bondPurchases).where(and(...bondPurchaseConditions)).orderBy(bondPurchases.purchaseDate);
      const allPurchases: any[] = [...allPurchasesEtf, ...allBondPurchases];
      
      const now = new Date();
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
        });
      }

      const symbolsOwned: string[] = Array.from(new Set(allPurchases.map((p: any) => p.symbol.toUpperCase())));
      const symbolPriceHistories = new Map<string, any[]>();

      const startDate = new Date(months[0].year, months[0].month, 1);
      const daysToFetch = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 35;
      
      for (const symbol of symbolsOwned) {
        const looksLikeCusip = /^[0-9A-Z]{9}$/.test(symbol);
        if (looksLikeCusip) {
          // Find a purchase to get price, or use 0
          const samplePurchase = allPurchases.find((p:any) => p.symbol.toUpperCase() === symbol);
          const price = samplePurchase ? parseFloat(samplePurchase.price || "0") : 0;
          symbolPriceHistories.set(symbol, [{ timestamp: startDate, price }, { timestamp: now, price }]);
        } else {
          const history = await getSmartHistoricalPrices(symbol, daysToFetch, '1mo');
          symbolPriceHistories.set(symbol, history);
        }
      }

      const result = [];
      let previousMonthEndValue = 0;

      // Initialize previousMonthEndValue for the first month
      const firstMonthStart = new Date(months[0].year, months[0].month, 1);
      const preFirstMonthEnd = new Date(firstMonthStart.getTime() - 1);
      
      allPurchases.forEach((p: any) => {
        const pDate = new Date(p.purchaseDate);
        if (pDate <= preFirstMonthEnd && (!p.isSold || (p.soldDate && new Date(p.soldDate) > preFirstMonthEnd))) {
          const history = symbolPriceHistories.get(p.symbol.toUpperCase()) || [];
          const pricePoint = history.filter(h => new Date(h.timestamp) <= preFirstMonthEnd).pop();
          const price = pricePoint ? pricePoint.price : parseFloat(p.price);
          previousMonthEndValue += truncateNumber(parseFloat(p.quantity) * price);
        }
      });

      for (const m of months) {
        const monthStart = new Date(m.year, m.month, 1);
        const monthEnd = new Date(m.year, m.month + 1, 0, 23, 59, 59);
        const actualEnd = monthEnd > now ? now : monthEnd;

        let purchasesInMonth = 0;
        let monthEndValue = 0;

        allPurchases.forEach((p: any) => {
          const pDate = new Date(p.purchaseDate);
          if (pDate >= monthStart && pDate <= actualEnd) {
            purchasesInMonth += truncateNumber(parseFloat(p.quantity) * parseFloat(p.price));
          }
          
          if (pDate <= actualEnd && (!p.isSold || (p.soldDate && new Date(p.soldDate) > actualEnd))) {
            const history = symbolPriceHistories.get(p.symbol.toUpperCase()) || [];
            const pricePoint = history.filter(h => new Date(h.timestamp) <= actualEnd).pop();
            const price = pricePoint ? pricePoint.price : parseFloat(p.price);
            monthEndValue += truncateNumber(parseFloat(p.quantity) * price);
          }
        });

        const marketGainLoss = monthEndValue - (previousMonthEndValue + purchasesInMonth);

        result.push({
          month: m.label,
          purchases: purchasesInMonth.toFixed(2),
          existingValue: (monthEndValue - purchasesInMonth).toFixed(2),
          totalValue: monthEndValue.toFixed(2),
          marketGainLoss: marketGainLoss.toFixed(2)
        });

        previousMonthEndValue = monthEndValue;
      }

      return result;
    }),
});

/**
 * Shared engine to calculate date ranges for any query
 */
function calculateDateRange(range: string) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  if (range === "cw") {
    // Current week starting Monday
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    startDate.setDate(now.getDate() - diff);
  } else if (range === "cm") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === "3d") {
    startDate.setDate(now.getDate() - 3);
  } else if (range === "10d") {
    startDate.setDate(now.getDate() - 10);
  } else if (range === "30d" || range === "1m") {
    startDate.setDate(now.getDate() - 30);
  } else if (range === "60d") {
    startDate.setDate(now.getDate() - 60);
  } else if (range === "90d") {
    startDate.setDate(now.getDate() - 90);
  } else if (range === "ytd") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (range === "1y") {
    startDate.setFullYear(now.getFullYear() - 1);
  } else if (range.includes("Q")) {
    // Handle quarterly range (e.g., "2025Q1")
    const year = parseInt(range.substring(0, 4));
    const quarter = parseInt(range.substring(5, 6));
    startDate = new Date(year, (quarter - 1) * 3, 1);
    endDate = new Date(year, quarter * 3, 0);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Default to 30d
    startDate.setDate(now.getDate() - 30);
  }

  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Shared engine to calculate evolution for any range
 * Ensures perfect consistency between charts and summary cards
 */
async function getProcessedEvolution(userId: number, holdings: any[], range: "1m" | "ytd" | "1y" | "all", portfolioId?: number, includeCash?: boolean, granularity?: "1d" | "1wk" | "1mo", accountId?: number, accountType?: string) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  let days = 365;
  let interval: "1d" | "1wk" | "1mo" = "1d";

  if (range === "1m") days = 30;
  else if (range === "ytd") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    days = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  } else if (range === "1y") days = 365;
  else if (range === "all") {
    // Find oldest transaction (purchase or cash)
    const db = await getDb();
    const purchaseConditions = [eq(purchases.userId, userId)];
    
    if (accountId !== undefined) {
      purchaseConditions.push(eq(purchases.accountId, accountId));
    } else if (accountType && portfolioId) {
      const matchingAccounts = await db.select({ id: accounts.id })
        .from(accounts)
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.portfolioId, portfolioId),
          eq(accounts.accountType, accountType)
        ));
      const matchingIds = matchingAccounts.map((a: any) => a.id);
      if (matchingIds.length > 0) {
        purchaseConditions.push(sql`${purchases.accountId} IN (${sql.join(matchingIds, sql`, `)})`);
      } else {
        purchaseConditions.push(eq(purchases.accountId, -1));
      }
    }

    const oldestPurchase = await db.select({ date: purchases.purchaseDate })
      .from(purchases)
      .where(and(...purchaseConditions))
      .orderBy(purchases.purchaseDate)
      .limit(1)
      .then((rows: any[]) => rows[0]?.date);
    
    let oldestDate = oldestPurchase ? new Date(oldestPurchase) : new Date();

    if (includeCash && portfolioId) {
      const cashConditions = [
        eq(cashBalanceHistory.userId, userId), 
        eq(cashBalanceHistory.portfolioId, portfolioId)
      ];

      if (accountId !== undefined) {
        cashConditions.push(eq(cashBalanceHistory.accountId, accountId));
      } else if (accountType) {
        const matchingAccounts = await db.select({ id: accounts.id })
          .from(accounts)
          .where(and(
            eq(accounts.userId, userId),
            eq(accounts.portfolioId, portfolioId),
            eq(accounts.accountType, accountType)
          ));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        if (matchingIds.length > 0) {
          cashConditions.push(sql`${cashBalanceHistory.accountId} IN (${sql.join(matchingIds, sql`, `)})`);
        } else {
          cashConditions.push(eq(cashBalanceHistory.accountId, -1));
        }
      }

      const oldestCash = await db.select({ date: cashBalanceHistory.date })
        .from(cashBalanceHistory)
        .where(and(...cashConditions))
        .orderBy(cashBalanceHistory.date)
        .limit(1)
        .then((rows: any[]) => rows[0]?.date);
      
      if (oldestCash && new Date(oldestCash) < oldestDate) {
        oldestDate = new Date(oldestCash);
      }
    }

    days = Math.ceil((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days < 30) days = 30; // Minimum 1 month for visual consistency
    if (days > 730) interval = "1wk"; // Use weekly for > 2 years
  }

  // Override interval if granularity is specified
  if (granularity === "1wk") interval = "1wk";
  if (granularity === "1mo") interval = "1mo";

  const startDate = new Date();
  startDate.setDate(now.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateKey = startDate.toISOString().split("T")[0];

  const allDatesSet = new Set<string>();
  const holdingData: any[] = [];

  for (const holding of holdings) {
    const isBond = (holding as any).assetType === "bond" || (holding as any).couponRate !== undefined || (holding as any).symbol?.length === 9 && /^[0-9A-Z]{9}$/.test(holding.symbol);
    // For bonds, use brokerage price as constant, no price history needed
    let priceHistory: any[] = [];
    if (isBond) {
      const brokeragePriceStr = await getBondPriceFromBrokerage(holding.symbol);
      const price = brokeragePriceStr ? parseFloat(brokeragePriceStr) : parseFloat(holding.currentPrice || "0");
      // Create a single price point for today and startDate
      priceHistory = [{ timestamp: new Date(), price }];
    } else {
      priceHistory = await getSmartHistoricalPrices(holding.symbol as string, days + 10, interval);
    }
    
    const db = await getDb();
    // Choose correct purchases table based on asset type
    const isBondHolding = isBond;
    const purchaseConditions: any[] = isBondHolding ? [eq(bondPurchases.holdingId, holding.id)] : [eq(purchases.holdingId, holding.id)];
    
    if (accountId !== undefined) {
      purchaseConditions.push(eq(purchases.accountId, accountId));
    } else if (accountType && portfolioId) {
      const matchingAccounts = await db.select({ id: accounts.id })
        .from(accounts)
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.portfolioId, portfolioId),
          eq(accounts.accountType, accountType)
        ));
      const matchingIds = matchingAccounts.map((a: any) => a.id);
      if (matchingIds.length > 0) {
        purchaseConditions.push(sql`${purchases.accountId} IN (${sql.join(matchingIds, sql`, `)})`);
      } else {
        purchaseConditions.push(eq(purchases.accountId, -1));
      }
    }

    const holdingPurchases = isBondHolding
      ? await db.select().from(bondPurchases).where(and(...purchaseConditions)).orderBy(desc(bondPurchases.purchaseDate))
      : await db.select().from(purchases).where(and(...purchaseConditions)).orderBy(desc(purchases.purchaseDate));

    const pricesMap = new Map<string, number>();
    
    priceHistory.forEach((p: any) => {
      const dKey = p.timestamp.toISOString().split("T")[0];
      pricesMap.set(dKey, p.price);
      allDatesSet.add(dKey);
    });

    const todayKey = now.toISOString().split("T")[0];
    pricesMap.set(todayKey, parseFloat(holding.currentPrice || "0"));
    allDatesSet.add(todayKey);
    allDatesSet.add(startDateKey);

    holdingData.push({ 
      holding, 
      pricesMap, 
      purchases: holdingPurchases, 
      currentQty: parseFloat(holding.quantity) 
    });
  }

  // Fetch cash history if requested
  let cashHistory: any[] = [];
  if (includeCash && portfolioId) {
    cashHistory = await getCashBalanceHistory(userId, portfolioId, accountId);
    
    if (accountType && accountId === undefined) {
      const db = await getDb();
      const matchingAccounts = await db.select({ id: accounts.id })
        .from(accounts)
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.portfolioId, portfolioId),
          eq(accounts.accountType, accountType)
        ));
      const matchingIds = matchingAccounts.map((a: any) => a.id);
      if (matchingIds.length > 0) {
        cashHistory = cashHistory.filter(ch => matchingIds.includes(ch.accountId));
      } else {
        cashHistory = [];
      }
    }

    cashHistory.forEach((ch: any) => {
      const dKey = new Date(ch.date).toISOString().split("T")[0];
      allDatesSet.add(dKey);
    });
  }

  // Generate all dates in range to fill gaps
  const sortedDates = Array.from(allDatesSet).sort();
  const lastPrices = new Map<number, number>();

  // Warm up lastPrices with data before startDateKey
  for (const dateKey of sortedDates) {
    if (dateKey >= startDateKey) break;
    for (const item of holdingData) {
      const price = item.pricesMap.get(dateKey);
      if (price !== undefined) {
        lastPrices.set(item.holding.id, price);
      }
    }
  }

  // Generate continuous list of dates for the result
  const resultDates: string[] = [];
  let curr = new Date(startDate);
  
  if (granularity === "1mo") {
    // Start from the end of the first month in range
    curr = new Date(curr.getFullYear(), curr.getMonth() + 1, 0);
  }

  while (curr <= now) {
    const dKey = curr.toISOString().split("T")[0];
    resultDates.push(dKey);
    
    if (granularity === "1mo") {
      // Move to end of next month
      curr = new Date(curr.getFullYear(), curr.getMonth() + 2, 0);
    } else if (granularity === "1wk" || (interval === "1wk" && !granularity)) {
      curr.setDate(curr.getDate() + 7);
    } else {
      curr.setDate(curr.getDate() + 1);
    }
  }

  // Also ensure today is included at the end if not already
  const todayKey = now.toISOString().split("T")[0];
  if (resultDates.length === 0 || resultDates[resultDates.length - 1] !== todayKey) {
    // For monthly, if the last entry is already in the same month as today, 
    // replace it with today to show the most recent balance.
    if (granularity === "1mo" && resultDates.length > 0) {
      const lastDate = new Date(resultDates[resultDates.length - 1]);
      if (lastDate.getUTCFullYear() === now.getUTCFullYear() && lastDate.getUTCMonth() === now.getUTCMonth()) {
        resultDates[resultDates.length - 1] = todayKey;
      } else {
        resultDates.push(todayKey);
      }
    } else {
      resultDates.push(todayKey);
    }
  }

  let previousTotalValue = 0;
  
  // To get the first previousTotalValue, we need to calculate it for the day before startDate
  const preStartDate = new Date(startDate);
  preStartDate.setDate(preStartDate.getDate() - 1);
  const preStartDateKey = preStartDate.toISOString().split("T")[0];
  
  let initialValue = 0;
  for (const item of holdingData) {
    let price = item.pricesMap.get(preStartDateKey);
    if (price === undefined) {
      price = lastPrices.get(item.holding.id) || 0;
    }
    
    let qtyOwned = 0;
    for (const p of item.purchases) {
      if (new Date(p.purchaseDate) <= preStartDate) {
        qtyOwned += parseFloat(p.quantity.toString());
      }
    }
    initialValue += qtyOwned * price;
  }
  
  if (includeCash) {
    const latestAccountCash = new Map<number, number>();
    for (const ch of cashHistory) {
      if (new Date(ch.date) <= preStartDate) {
        latestAccountCash.set(ch.accountId, parseFloat(ch.amount));
      }
    }
    initialValue += Array.from(latestAccountCash.values()).reduce((sum: number, val: number) => sum + val, 0);
  }
  previousTotalValue = initialValue;

  const result = [];
  for (const dateKey of resultDates) {
    const currentDate = new Date(dateKey + "T12:00:00");
    let investmentValue = 0;
    let equitiesValue = 0;
    let fixedIncomeValue = 0;
    let totalCashValue = 0;
    let totalCurrentQtyValue = 0;

    for (const item of holdingData) {
      let price = item.pricesMap.get(dateKey);
      if (price === undefined) {
        price = lastPrices.get(item.holding.id) || 0;
      } else {
        lastPrices.set(item.holding.id, price);
      }

      // 1. Market Growth Value (Historical Quantity * Historical Price)
      let qtyOwned = 0;
      for (const p of item.purchases) {
        const pDate = new Date(p.purchaseDate);
        if (pDate <= currentDate) {
          qtyOwned += parseFloat(p.quantity.toString());
        }
      }
      const isBondItem = (item.holding as any).assetType === "bond" || (item.holding as any).couponRate !== undefined;
      const val = qtyOwned * price;
      investmentValue += val;
      if (isBondItem) fixedIncomeValue += val;
      else equitiesValue += val;

      // 2. Market Performance Value (Current Quantity * Historical Price)
      totalCurrentQtyValue += item.currentQty * price;
    }
    
    if (includeCash) {
      const latestAccountCash = new Map<number, number>();
      for (const ch of cashHistory) {
        if (new Date(ch.date) <= currentDate) {
          latestAccountCash.set(ch.accountId, parseFloat(ch.amount));
        }
      }
      totalCashValue = Array.from(latestAccountCash.values()).reduce((sum: number, val: number) => sum + val, 0);
      totalCurrentQtyValue += totalCashValue;
    }

    result.push({
      date: dateKey,
      totalValue: investmentValue + totalCashValue,
      investmentValue: investmentValue,
      equitiesValue: equitiesValue,
      fixedIncomeValue: fixedIncomeValue,
      cashValue: totalCashValue,
      priceOnlyValue: totalCurrentQtyValue
    });
  }
  return result;
}

function calculateDailyReturn(
  balanceHistory: Array<{ totalValue: any; date: Date }>
): string {
  if (balanceHistory.length < 2) return "0";

  const recent = balanceHistory[balanceHistory.length - 1];
  const previous = balanceHistory[balanceHistory.length - 2];

  const recentValue = parseFloat(recent.totalValue.toString());
  const previousValue = parseFloat(previous.totalValue.toString());

  const dailyReturn = recentValue - previousValue;
  const dailyReturnPercent =
    previousValue > 0
      ? ((dailyReturn / previousValue) * 100).toFixed(2)
      : "0";

  return dailyReturnPercent;
}

function calculateMonthlyReturn(
  balanceHistory: Array<{ totalValue: any; date: Date }>
): string {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const monthlyData = balanceHistory.filter((b: any) => b.date >= thirtyDaysAgo);
  if (monthlyData.length < 2) return "0";

  const startValue = parseFloat(monthlyData[0].totalValue.toString());
  const endValue = parseFloat(
    monthlyData[monthlyData.length - 1].totalValue.toString()
  );

  const monthlyReturn = endValue - startValue;
  const monthlyReturnPercent =
    startValue > 0
      ? ((monthlyReturn / startValue) * 100).toFixed(2)
      : "0";

  return monthlyReturnPercent;
}

function calculateYearlyReturn(
  balanceHistory: Array<{ totalValue: any; date: Date }>
): string {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const yearlyData = balanceHistory.filter((b: any) => b.date >= oneYearAgo);
  if (yearlyData.length < 2) return "0";

  const startValue = parseFloat(yearlyData[0].totalValue.toString());
  const endValue = parseFloat(
    yearlyData[yearlyData.length - 1].totalValue.toString()
  );

  const yearlyReturn = endValue - startValue;
  const yearlyReturnPercent =
    startValue > 0
      ? ((yearlyReturn / startValue) * 100).toFixed(2)
      : "0";

  return yearlyReturnPercent;
}
