import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getAccounts, createAccount, deleteAccount } from "./db";

export const accountRouter = router({
  getAccounts: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getAccounts(ctx.user.id, input.portfolioId);
    }),

  addAccount: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        name: z.string().min(1).max(255),
        number: z.string().optional(),
        accountType: z.enum(["Retirement", "Brokerage", "Savings", "Checking", "Other"]).default("Brokerage"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await createAccount({
        userId: ctx.user.id,
        portfolioId: input.portfolioId,
        name: input.name,
        number: input.number,
        accountType: input.accountType,
      });
      return { id: Number(accountId) };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteAccount(input.id);
      return { success: true };
    }),

  updateAccount: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        number: z.string().optional(),
        accountType: z.enum(["Retirement", "Brokerage", "Savings", "Checking", "Other"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { updateAccount } = await import("./db");
      await updateAccount(input.id, {
        name: input.name,
        number: input.number,
        accountType: input.accountType,
      });
      return { success: true };
    }),

  moveAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        targetPortfolioId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { moveAccount } = await import("./db");
      await moveAccount(input.accountId, input.targetPortfolioId);
      return { success: true };
    }),
});

