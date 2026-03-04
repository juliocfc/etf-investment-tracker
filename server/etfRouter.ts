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
} from "./db";
import {
  fetchEtfPrice,
  fetchHistoricalPrices,
  validateEtfSymbol,
} from "./financialApi";
import { fetchETFName } from "./etfLookup";

export const etfRouter = router({
  getHoldings: protectedProcedure.query(async ({ ctx }) => {
    const holdings = await getUserEtfHoldings(ctx.user.id);
    return holdings || [];
  }),

  addHolding: protectedProcedure
    .input(
      z.object({
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
        symbol: input.symbol.toUpperCase(),
        name: input.name,
        quantity: input.quantity,
        purchasePrice: input.purchasePrice,
        purchaseDate: input.purchaseDate,
        currentPrice,
        lastPriceUpdate: new Date(),
      });

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

  updatePrices: protectedProcedure.mutation(async ({ ctx }) => {
    const holdings = await getUserEtfHoldings(ctx.user.id);
    const results = [];

    for (let i = 0; i < holdings.length; i++) {
      const holding = holdings[i];
      
      // Add 1.2 second delay between requests to respect Alpha Vantage rate limit
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
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

  getCashBalance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await getCashBalance(ctx.user.id);
    return balance?.amount || "0";
  }),

  updateCashBalance: protectedProcedure
    .input(z.object({ amount: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return updateCashBalance(ctx.user.id, input.amount);
    }),

  getBalanceHistory: protectedProcedure
    .input(z.object({ days: z.number().default(365) }))
    .query(async ({ ctx, input }) => {
      return getBalanceHistory(ctx.user.id, input.days);
    }),

  recordBalanceSnapshot: protectedProcedure
    .input(
      z.object({
        totalValue: z.string(),
        cashValue: z.string(),
        investmentValue: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return addBalanceHistory(
        ctx.user.id,
        input.totalValue,
        input.cashValue,
        input.investmentValue,
        new Date()
      );
    }),

  calculatePerformance: protectedProcedure
    .input(z.object({ days: z.number().default(365) }))
    .query(async ({ ctx, input }) => {
      const holdings = await getUserEtfHoldings(ctx.user.id);
      const balanceHistory = await getBalanceHistory(ctx.user.id, input.days);

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

  calculateTotalDividends: protectedProcedure.query(async ({ ctx }) => {
    const holdings = await getUserEtfHoldings(ctx.user.id);
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

  getPortfolioSummary: protectedProcedure.query(async ({ ctx }) => {
    const holdings = await getUserEtfHoldings(ctx.user.id);
    const cashBalance = await getCashBalance(ctx.user.id);

    let totalInvestmentValue = 0;
    const holdingsWithValues = holdings.map((holding) => {
      const currentPrice = holding.currentPrice
        ? parseFloat(holding.currentPrice.toString())
        : 0;
      const quantity = parseFloat(holding.quantity.toString());
      const value = currentPrice * quantity;
      const purchasePrice = parseFloat(holding.purchasePrice.toString());
      const purchaseValue = purchasePrice * quantity;
      const gain = value - purchaseValue;
      const gainPercent = purchaseValue > 0 ? (gain / purchaseValue) * 100 : 0;

      totalInvestmentValue += value;

      return {
        ...holding,
        currentValue: value.toFixed(2),
        gain: gain.toFixed(2),
        gainPercent: gainPercent.toFixed(2),
      };
    });

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
