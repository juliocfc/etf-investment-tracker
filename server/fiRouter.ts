import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and } from "./db";
import { expenses, fiSimulationAssets } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { fetchEtfPrice, calculateAnnualDPS } from "./financialApi";

export const fiRouter = router({
  // Get all expenses for the current user
  getExpenses: protectedProcedure.query(async ({ ctx }) => {
    console.log(`[FI] Fetching expenses for user ${ctx.user.id}...`);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    try {
      const userExpenses = await db
        .select()
        .from(expenses)
        .where(eq(expenses.userId, ctx.user.id));
      console.log(`[FI] Found ${userExpenses.length} expenses for user ${ctx.user.id}`);
      return userExpenses;
    } catch (error) {
      console.error(`[FI] Error fetching expenses for user ${ctx.user.id}:`, error);
      throw error;
    }
  }),

  // Add a new expense
  addExpense: protectedProcedure
    .input(z.object({
      description: z.string().min(1),
      amount: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.insert(expenses).values({
        userId: ctx.user.id,
        description: input.description,
        amount: input.amount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, id: (result as any).lastInsertRowid };
    }),

  // Update an expense
  updateExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().min(1),
      amount: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(expenses)
        .set({
          description: input.description,
          amount: input.amount,
          updatedAt: new Date(),
        })
        .where(and(eq(expenses.id, input.id), eq(expenses.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete an expense
  deleteExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.userId, ctx.user.id)));

      return { success: true };
    }),

  // Get all simulation assets
  getSimulationAssets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    return db
      .select()
      .from(fiSimulationAssets)
      .where(eq(fiSimulationAssets.userId, ctx.user.id));
  }),

  // Add simulation asset
  addSimulationAsset: protectedProcedure
    .input(z.object({ 
      symbol: z.string().min(1),
      allocation: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const symbol = input.symbol.toUpperCase();

      // Check if already exists
      const existing = await db
        .select()
        .from(fiSimulationAssets)
        .where(and(eq(fiSimulationAssets.userId, ctx.user.id), eq(fiSimulationAssets.symbol, symbol)))
        .then(rows => rows[0]);

      if (existing) return { success: true, id: existing.id };

      const result = await db.insert(fiSimulationAssets).values({
        userId: ctx.user.id,
        symbol: symbol,
        allocation: input.allocation || "0",
        createdAt: new Date(),
      });

      return { success: true, id: (result as any).lastInsertRowid };
    }),

  // Update simulation asset
  updateSimulationAsset: protectedProcedure
    .input(z.object({
      id: z.number(),
      allocation: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(fiSimulationAssets)
        .set({ allocation: input.allocation })
        .where(and(eq(fiSimulationAssets.id, input.id), eq(fiSimulationAssets.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete simulation asset
  deleteSimulationAsset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(fiSimulationAssets)
        .where(and(eq(fiSimulationAssets.id, input.id), eq(fiSimulationAssets.userId, ctx.user.id)));

      return { success: true };
    }),

  // Get data for all simulation assets (price + div)
  getSimulationData: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const assets = await db
      .select()
      .from(fiSimulationAssets)
      .where(eq(fiSimulationAssets.userId, ctx.user.id));

    const results = await Promise.all(assets.map(async (asset) => {
      try {
        const priceData = await fetchEtfPrice(asset.symbol);
        const annualDPS = await calculateAnnualDPS(asset.symbol);
        return {
          id: asset.id,
          symbol: asset.symbol,
          allocation: asset.allocation,
          price: priceData?.price || 0,
          annualDPS: annualDPS,
          success: !!priceData
        };
      } catch (e) {
        return {
          id: asset.id,
          symbol: asset.symbol,
          allocation: asset.allocation,
          price: 0,
          annualDPS: 0,
          success: false
        };
      }
    }));

    return results;
  }),
});
