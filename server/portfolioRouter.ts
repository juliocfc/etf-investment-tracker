import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and } from "./db";
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
        .then((rows) => rows[0]);

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
      const portfolioId = (result as any).insertId || result[0];

      // Create a cash balance entry for the new portfolio
      if (portfolioId) {
        await db.insert(cashBalance).values({
          userId: ctx.user.id,
          portfolioId: portfolioId,
          amount: "0",
        });
      }

      return { id: portfolioId, ...newPortfolio };
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
        .then((rows) => rows[0]);

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
        .then((rows) => rows[0]);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      // Delete the portfolio (cascade will handle related records)
      await db.delete(portfolios).where(eq(portfolios.id, input.portfolioId));

      return { success: true };
    }),
});
