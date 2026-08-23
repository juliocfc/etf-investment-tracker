import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { etfRouter } from "./etfRouter";
import { bondRouter } from "./bondRouter";
import { portfolioRouter } from "./portfolioRouter";
import { accountRouter } from "./accountRouter";
import { brokerageRouter } from "./brokerageRouter";
import { fiRouter } from "./fiRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  portfolio: portfolioRouter,
  account: accountRouter,
  etf: etfRouter,
  bond: bondRouter,
  brokerage: brokerageRouter,
  fi: fiRouter,
});

export type AppRouter = typeof appRouter;
