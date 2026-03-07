import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
} from "./db";
import {
  fetchEtfPrice,
  fetchHistoricalPrices,
  validateEtfSymbol,
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isValid = await validateEtfSymbol(input.symbol);
      if (!isValid) {
        throw new Error(`Invalid ETF symbol: ${input.symbol}`);
      }

      const priceData = await fetchEtfPrice(input.symbol);
      const currentPrice = priceData?.price.toString();

      const result = await createEtfHolding({
        userId: ctx.user.id,
        portfolioId: input.portfolioId,
        symbol: input.symbol.toUpperCase(),
        name: input.name,
        quantity: input.quantity,
        purchasePrice: input.purchasePrice,
        purchaseDate: input.purchaseDate,
        currentPrice,
        lastPriceUpdate: new Date(),
      });

      // Create a purchase record for the initial holding
      if (result && result.id) {
        await addPurchase(
          ctx.user.id,
          input.portfolioId,
          result.id,
          input.symbol.toUpperCase(),
          input.quantity,
          input.purchasePrice,
          input.purchaseDate
        );
      }

      return result;
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
    .mutation(async ({ input }) => {
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

      await addPurchase(
        ctx.user.id,
        input.portfolioId,
        input.holdingId,
        holding.symbol,
        input.quantity,
        input.price,
        input.purchaseDate
      );

      const newQuantity = parseFloat(holding.quantity.toString()) + parseFloat(input.quantity);
      const averageCost = await calculateAverageCost(input.holdingId);

      await updateEtfHolding(input.holdingId, {
        quantity: newQuantity.toString(),
        purchasePrice: averageCost?.toString() || input.price,
      });

      return {
        success: true,
        newQuantity: newQuantity.toFixed(3),
        averageCost: averageCost?.toFixed(3) || input.price,
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
      const holdings = await getUserEtfHoldings(ctx.user.id);
      const holding = holdings.find((h) => h.id === input.holdingId);
      
      if (!holding) {
        throw new Error("Holding not found");
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
});

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
