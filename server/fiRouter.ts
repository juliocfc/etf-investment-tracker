import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and } from "./db";
import { expenses } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";

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
});
