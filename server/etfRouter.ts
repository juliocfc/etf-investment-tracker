import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { etfHoldings } from "../drizzle/schema";
import {
  getUserEtfHoldings,
  createEtfHolding,
  updateEtfHolding,
  deleteEtfHolding,
  addPriceHistory,
  getPriceHistory,
  getCashBalance,
  updateCashBalance,
  addBalanceHistory,
  getBalanceHistory,
  getDividendHistory,
  addDividendHistory,
  addPurchase,
  getPurchases,
  calculateAverageCost,
  deletePurchase,
  parseCSVContent,
  bulkImportPurchases,
  getDb,
  and,
  eq,
} from "./db";
import {
  fetchEtfPrice,
  fetchHistoricalPrices,
  validateEtfSymbol,
  fetchDividendData,
} from "./financialApi";
import { fetchETFName } from "./etfLookup";
import { calculatePerformanceMetrics } from "./performanceMetrics";

export const etfRouter = router({
  getHoldings: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      if (!holdings || holdings.length === 0) return [];
      const holdingsWithAvgCost = await Promise.all(
        holdings.map(async (holding) => {
          const avgCost = await calculateAverageCost(holding.id);
          return { ...holding, averageCost: avgCost };
        })
      );
      return holdingsWithAvgCost;
    }),

  addHolding: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        symbol: z.string().min(1).max(20),
        name: z.string().min(1).max(255),
        quantity: z.string(),
        purchasePrice: z.string(),
        purchaseDate: z.date(),
        desiredAllocation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isValid = await validateEtfSymbol(input.symbol);
      if (!isValid) {
        throw new Error(`Invalid ETF symbol: ${input.symbol}`);
      }

      const priceData = await fetchEtfPrice(input.symbol);
      const currentPrice = priceData?.price.toString();

      const holdingId = await createEtfHolding({
        userId: ctx.user.id,
        portfolioId: input.portfolioId,
        symbol: input.symbol.toUpperCase(),
        name: input.name,
        quantity: input.quantity,
        purchasePrice: input.purchasePrice,
        purchaseDate: input.purchaseDate,
        desiredAllocation: input.desiredAllocation || "0",
        currentPrice,
        lastPriceUpdate: new Date(),
      });

      // Create a purchase record for the initial holding
      if (holdingId) {
        await addPurchase({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          holdingId: Number(holdingId),
          symbol: input.symbol.toUpperCase(),
          quantity: input.quantity,
          price: input.purchasePrice,
          purchaseDate: input.purchaseDate,
        });
      }

      return { id: holdingId };
    }),

  updateHolding: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        symbol: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(255).optional(),
        quantity: z.string().optional(),
        purchasePrice: z.string().optional(),
        purchaseDate: z.date().optional(),
        desiredAllocation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

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
    .input(z.object({ portfolioId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const results = [];

      for (let i = 0; i < holdings.length; i++) {
        const holding = holdings[i];
        
        // Small delay between requests to be polite to Yahoo Finance
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        
        const priceData = await fetchEtfPrice(holding.symbol);
        if (priceData) {
          await updateEtfHolding(holding.id, {
            currentPrice: priceData.price.toString(),
            lastPriceUpdate: new Date(),
          });

          await addPriceHistory(
            ctx.user.id,
            holding.symbol,
            priceData.price.toString(),
            new Date()
          );

          results.push({
            symbol: holding.symbol,
            price: priceData.price,
            success: true,
          });
        } else {
          results.push({
            symbol: holding.symbol,
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
      const history = await fetchHistoricalPrices(input.symbol, input.days, interval);
      
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
      const prices = await fetchHistoricalPrices(input.symbol, input.days);

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
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const balance = await getCashBalance(ctx.user.id, input.portfolioId);
      return balance?.amount || "0";
    }),

  updateCashBalance: protectedProcedure
    .input(z.object({ portfolioId: z.number(), amount: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return updateCashBalance(ctx.user.id, input.portfolioId, input.amount);
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
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const windowStart = new Date();
      windowStart.setFullYear(windowStart.getFullYear() - 1);

      const allDividends = [];
      const etfBreakdown = [];

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
        const dividendData = await fetchDividendData(holding.symbol);
        const purchases = await getPurchases(holding.id);
        
        let etfTotalWindow = 0;
        let etfTotalAllTime = 0;
        const etfQuarterly: Record<string, number> = {};
        lastQuarters.forEach(q => etfQuarterly[q] = 0);

        for (const div of dividendData) {
          const exDate = new Date(div.exDate);
          // Set to midnight of the ex-date
          exDate.setHours(0, 0, 0, 0);
          
          // Calculate quantity owned BEFORE the ex-date
          let quantityOwned = 0;
          for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.purchaseDate);
            // Must have purchased before the ex-dividend date to be eligible
            if (purchaseDate < exDate) {
              quantityOwned += parseFloat(purchase.quantity.toString());
            }
          }

          if (quantityOwned > 0) {
            const totalAmount = quantityOwned * div.dividendPerShare;
            const isInWindow = exDate >= windowStart;

            const dividendRecord = {
              symbol: holding.symbol,
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
            }
          }
        }

        etfBreakdown.push({
          symbol: holding.symbol,
          name: holding.name,
          totalLastYear: etfTotalWindow.toFixed(2),
          totalAllTime: etfTotalAllTime.toFixed(2),
          quarterlyBreakdown: lastQuarters.map(q => ({
            quarter: q,
            amount: (etfQuarterly[q] || 0).toFixed(2),
          })),
        });
      }

      const totalLastYear = etfBreakdown.reduce((sum, item) => sum + parseFloat(item.totalLastYear), 0);
      const totalAllTime = etfBreakdown.reduce((sum, item) => sum + parseFloat(item.totalAllTime), 0);
      const combinedQuarterly: Record<string, number> = {};
      lastQuarters.forEach(q => combinedQuarterly[q] = 0);
      
      etfBreakdown.forEach(item => {
        item.quarterlyBreakdown.forEach(q => {
          if (combinedQuarterly[q.quarter] !== undefined) {
            combinedQuarterly[q.quarter] += parseFloat(q.amount);
          }
        });
      });

      return {
        totalLastYear: totalLastYear.toFixed(2),
        totalAllTime: totalAllTime.toFixed(2),
        quarterlyBreakdown: lastQuarters.map(q => ({
          quarter: q,
          amount: (combinedQuarterly[q] || 0).toFixed(2),
        })),
        etfBreakdown,
        history: allDividends.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime()),
      };
    }),

  calculateTotalDividends: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      let totalDividends = 0;

      for (const holding of holdings) {
        const dividends = await getDividendHistory(ctx.user.id, holding.symbol);
        for (const div of dividends) {
          if (div.totalDividend) {
            totalDividends += parseFloat(div.totalDividend.toString());
          }
        }
      }

      return totalDividends.toFixed(2);
    }),

  lookupETFName: publicProcedure
    .input(z.object({ symbol: z.string().min(1).max(20) }))
    .query(async ({ input }) => {
      const name = await fetchETFName(input.symbol.toUpperCase());
      return name || null;
    }),

  buyMoreShares: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        holdingId: z.number(),
        quantity: z.string(),
        price: z.string(),
        purchaseDate: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const holding = holdings.find((h) => h.id === input.holdingId);
      
      if (!holding) {
        throw new Error("Holding not found");
      }

      await addPurchase({
        userId: ctx.user.id,
        portfolioId: input.portfolioId,
        holdingId: input.holdingId,
        symbol: holding.symbol,
        quantity: input.quantity,
        price: input.price,
        purchaseDate: input.purchaseDate,
      });

      const newQuantity = parseFloat(holding.quantity.toString()) + parseFloat(input.quantity);
      const averageCost = await calculateAverageCost(input.holdingId);

      await updateEtfHolding(input.holdingId, {
        quantity: newQuantity.toString(),
        purchasePrice: averageCost?.toString() || input.price,
      });

      return {
        success: true,
        newQuantity: newQuantity.toFixed(3),
        averageCost: parseFloat(averageCost || input.price).toFixed(3),
      };
    }),

  getPurchases: protectedProcedure
    .input(z.object({ holdingId: z.number() }))
    .query(async ({ input }) => {
      return getPurchases(input.holdingId);
    }),

  calculateAverageCost: protectedProcedure
    .input(z.object({ holdingId: z.number() }))
    .query(async ({ input }) => {
      return calculateAverageCost(input.holdingId);
    }),

  deletePurchase: protectedProcedure
    .input(z.object({ purchaseId: z.number(), holdingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      const holding = await dbInstance
        .select()
        .from(etfHoldings)
        .where(and(eq(etfHoldings.id, input.holdingId), eq(etfHoldings.userId, ctx.user.id)))
        .then((rows: any[]) => rows[0]);
      
      if (!holding) {
        throw new Error("Holding not found or unauthorized");
      }

      await deletePurchase(input.purchaseId);
      const newAvgCost = await calculateAverageCost(input.holdingId);
      
      return {
        success: true,
        newAvgCost,
      };
    }),

  getPortfolioSummary: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const cashBalance = await getCashBalance(ctx.user.id, input.portfolioId);

      let totalInvestmentValue = 0;
      const holdingsWithValues = await Promise.all(
        holdings.map(async (holding) => {
          const currentPrice = holding.currentPrice
            ? parseFloat(holding.currentPrice.toString())
            : 0;
          const quantity = parseFloat(holding.quantity.toString());
          const value = currentPrice * quantity;
          
          // Calculate average cost from purchases
          const avgCost = await calculateAverageCost(holding.id);
          const avgCostValue = avgCost || parseFloat(holding.purchasePrice.toString());
          const purchaseValue = avgCostValue * quantity;
          const gain = value - purchaseValue;
          const gainPercent = purchaseValue > 0 ? (gain / purchaseValue) * 100 : 0;

          totalInvestmentValue += value;

          return {
            ...holding,
            averageCost: avgCost,
            totalCost: purchaseValue.toFixed(2),
            currentValue: value.toFixed(2),
            gain: gain.toFixed(2),
            gainPercent: gainPercent.toFixed(2),
          };
        })
      );

      const cashAmount = cashBalance
        ? parseFloat(cashBalance.amount.toString())
        : 0;
      const totalValue = totalInvestmentValue + cashAmount;

      return {
        holdings: holdingsWithValues,
        cashBalance: cashAmount.toFixed(2),
        investmentValue: totalInvestmentValue.toFixed(2),
        totalValue: totalValue.toFixed(2),
        allocationBreakdown: holdingsWithValues.map((h) => ({
          symbol: h.symbol,
          name: h.name,
          percentage:
            totalValue > 0
              ? ((parseFloat(h.currentValue) / totalValue) * 100).toFixed(2)
              : "0",
        })),
        investmentAllocationBreakdown: holdingsWithValues.map((h) => ({
          symbol: h.symbol,
          name: h.name,
          percentage:
            totalInvestmentValue > 0
              ? ((parseFloat(h.currentValue) / totalInvestmentValue) * 100).toFixed(2)
              : "0",
        })),
        cashAllocationPercent:
          totalValue > 0
            ? ((cashAmount / totalValue) * 100).toFixed(2)
            : "0",
      };
    }),

  importPurchasesFromCSV: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        holdingId: z.number(),
        csvContent: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      const holding = holdings.find((h) => h.id === input.holdingId);
      
      if (!holding) {
        throw new Error("Holding not found");
      }

      const records = parseCSVContent(input.csvContent);
      const validRecords = records.filter((r) => !r.error);
      const invalidRecords = records.filter((r) => r.error);

      const result = await bulkImportPurchases(
        ctx.user.id,
        input.portfolioId,
        input.holdingId,
        holding.symbol,
        validRecords
      );

      const newAvgCost = await calculateAverageCost(input.holdingId);

      return {
        success: result.success > 0,
        imported: result.success,
        failed: result.failed,
        errors: [...result.errors, ...invalidRecords.map((r) => r.error || "")],
        newAvgCost,
      };
    }),

  getAssetQuantityHistory: protectedProcedure
    .input(
      z.object({
        holdingId: z.number(),
        range: z.enum(["1m", "ytd", "1y", "5y"]),
      })
    )
    .query(async ({ input }) => {
      let days = 365;
      if (input.range === "1m") days = 30;
      else if (input.range === "ytd") {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        days = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      } else if (input.range === "5y") days = 365 * 5;

      const interval = input.range === "1m" ? 1 : 7; // days between points
      
      const purchases = await getPurchases(input.holdingId);
      const result = [];
      const endDate = new Date();
      
      for (let i = days; i >= 0; i -= interval) {
        const date = new Date();
        date.setDate(endDate.getDate() - i);
        date.setHours(0, 0, 0, 0);

        let quantityOwned = 0;
        for (const purchase of purchases) {
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
      })
    )
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      if (input.holdingId) {
        holdings = holdings.filter(h => h.id === input.holdingId);
      }

      const emptyMetrics = { m1: "0", ytd: "0", y1: "0", y5: "0" };
      if (!holdings || holdings.length === 0) {
        return { marketGrowth: emptyMetrics, pricePerformance: emptyMetrics };
      }

      const calculateForRange = async (range: "1m" | "ytd" | "1y" | "5y") => {
        const data = await getProcessedEvolution(ctx.user.id, holdings, range);
        if (data.length < 2) return { market: "0", price: "0" };

        const first = data[0];
        const last = data[data.length - 1];

        const marketGrowth = first.totalValue > 0 
          ? ((last.totalValue - first.totalValue) / first.totalValue) * 100 
          : 0;
        
        const pricePerformance = first.priceOnlyValue > 0 
          ? ((last.priceOnlyValue - first.priceOnlyValue) / first.priceOnlyValue) * 100 
          : 0;

        return {
          market: marketGrowth.toFixed(2),
          price: pricePerformance.toFixed(2)
        };
      };

      const [m1, ytd, y1, y5] = await Promise.all([
        calculateForRange("1m"),
        calculateForRange("ytd"),
        calculateForRange("1y"),
        calculateForRange("5y")
      ]);

      return {
        marketGrowth: { m1: m1.market, ytd: ytd.market, y1: y1.market, y5: y5.market },
        pricePerformance: { m1: m1.price, ytd: ytd.price, y1: y1.price, y5: y5.price }
      };
    }),

  getPortfolioEvolution: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        range: z.enum(["1m", "ytd", "1y", "5y"]),
        holdingId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      if (input.holdingId) {
        holdings = holdings.filter(h => h.id === input.holdingId);
      }
      
      const data = await getProcessedEvolution(ctx.user.id, holdings, input.range);
      return data.map(d => ({
        date: d.date,
        value: d.totalValue.toFixed(2)
      }));
    }),

  getPerformanceMetrics: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1).max(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Fetch 1+ year of historical prices
      const prices = await fetchHistoricalPrices(input.symbol, 400);
      
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
        prices.map((p) => ({
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
        portfolioId: z.number(),
        range: z.enum(["7d", "1m", "ytd", "1y"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id, input.portfolioId);
      
      const now = new Date();
      let startDate = new Date();
      
      if (input.range === "7d") {
        startDate.setDate(now.getDate() - 7);
      } else if (input.range === "1m") {
        startDate.setMonth(now.getMonth() - 1);
      } else if (input.range === "ytd") {
        startDate = new Date(now.getFullYear(), 0, 1);
      } else if (input.range === "1y") {
        startDate.setFullYear(now.getFullYear() - 1);
      }

      const activities = [];

      for (const holding of holdings) {
        const allPurchases = await getPurchases(holding.id);
        const filteredPurchases = allPurchases.filter(p => new Date(p.purchaseDate) >= startDate);

        if (filteredPurchases.length > 0) {
          let totalQty = 0;
          let totalCost = 0;

          filteredPurchases.forEach(p => {
            const qty = parseFloat(p.quantity.toString());
            const price = parseFloat(p.price.toString());
            totalQty += qty;
            totalCost += (qty * price);
          });

          const currentPrice = holding.currentPrice ? parseFloat(holding.currentPrice.toString()) : 0;
          const currentValue = totalQty * currentPrice;
          const gain = currentValue - totalCost;
          const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;

          activities.push({
            holdingId: holding.id,
            symbol: holding.symbol,
            name: holding.name,
            totalQuantity: totalQty.toFixed(3),
            totalCost: totalCost.toFixed(2),
            averagePrice: (totalCost / totalQty).toFixed(2),
            currentPrice: currentPrice.toFixed(2),
            currentValue: currentValue.toFixed(2),
            gain: gain.toFixed(2),
            gainPercent: gainPercent.toFixed(2),
            purchaseCount: filteredPurchases.length,
            purchases: filteredPurchases
          });
        }
      }

      return activities;
    }),
});

/**
 * Shared engine to calculate evolution for any range
 * Ensures perfect consistency between charts and summary cards
 */
async function getProcessedEvolution(userId: number, holdings: any[], range: "1m" | "ytd" | "1y" | "5y") {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  let days = 365;
  let interval: "1d" | "1wk" = "1d";

  if (range === "1m") days = 30;
  else if (range === "ytd") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    days = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  } else if (range === "1y") days = 365;
  else if (range === "5y") {
    days = 365 * 5;
    interval = "1wk";
  }

  const allDatesSet = new Set<string>();
  const holdingData: any[] = [];

  for (const holding of holdings) {
    const priceHistory = await fetchHistoricalPrices(holding.symbol, days, interval);
    const purchases = await getPurchases(holding.id);
    const pricesMap = new Map<string, number>();
    
    priceHistory.forEach(p => {
      const dKey = p.timestamp.toISOString().split("T")[0];
      pricesMap.set(dKey, p.price);
      allDatesSet.add(dKey);
    });

    const todayKey = now.toISOString().split("T")[0];
    pricesMap.set(todayKey, parseFloat(holding.currentPrice || "0"));
    allDatesSet.add(todayKey);

    holdingData.push({ 
      holding, 
      pricesMap, 
      purchases, 
      currentQty: parseFloat(holding.quantity) 
    });
  }

  const sortedDates = Array.from(allDatesSet).sort();
  const lastPrices = new Map<number, number>();

  return sortedDates.map((dateKey) => {
    const currentDate = new Date(dateKey + "T12:00:00");
    let totalMarketValue = 0;
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
        if (new Date(p.purchaseDate) <= currentDate) {
          qtyOwned += parseFloat(p.quantity.toString());
        }
      }
      totalMarketValue += qtyOwned * price;

      // 2. Market Performance Value (Current Quantity * Historical Price)
      totalCurrentQtyValue += item.currentQty * price;
    }

    return {
      date: dateKey,
      totalValue: totalMarketValue,
      priceOnlyValue: totalCurrentQtyValue
    };
  });
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

  const monthlyData = balanceHistory.filter((b) => b.date >= thirtyDaysAgo);
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

  const yearlyData = balanceHistory.filter((b) => b.date >= oneYearAgo);
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
