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
      const { purchases, etfHoldings, cashBalance, balanceHistory } = await import("../drizzle/schema");

      // 1. Delete all purchases for all holdings in this portfolio
      await db.delete(purchases).where(eq(purchases.portfolioId, input.portfolioId));

      // 2. Delete all holdings in this portfolio
      await db.delete(etfHoldings).where(eq(etfHoldings.portfolioId, input.portfolioId));

      // 3. Delete cash balance
      await db.delete(cashBalance).where(eq(cashBalance.portfolioId, input.portfolioId));

      // 4. Delete balance history
      await db.delete(balanceHistory).where(eq(balanceHistory.portfolioId, input.portfolioId));

      // 5. Finally delete the portfolio
      await db.delete(portfolios).where(eq(portfolios.id, input.portfolioId));

      return { success: true };
    }),
});
