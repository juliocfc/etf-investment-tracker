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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await createAccount({
        userId: ctx.user.id,
        portfolioId: input.portfolioId,
        name: input.name,
        number: input.number,
      });
      return { id: Number(accountId) };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteAccount(input.id);
      return { success: true };
    }),
});
