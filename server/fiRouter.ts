import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb, eq, and, updateRetirementSettings } from "./db";
import { expenses, fiSimulationAssets, fiFullSimulationAssets } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { fetchEtfPrice, calculateAnnualDPS } from "./financialApi";
import { getBondPriceFromBrokerage } from "./db";

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

  // Full Simulation Procedures
  getFullSimulationAssets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    try {
      return await db
        .select()
        .from(fiFullSimulationAssets)
        .where(eq(fiFullSimulationAssets.userId, ctx.user.id));
    } catch (e: any) {
      if (e?.message?.includes("no such column") || e?.message?.includes("assetType") || e?.message?.includes("couponRate") || e?.message?.includes("manualPrice")) {
        console.warn("[FI] Auto-migrating fifullsimulationassets missing columns (query fallback)");
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN assetType TEXT DEFAULT 'etf' NOT NULL"); } catch {}
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN couponRate TEXT"); } catch {}
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN manualPrice TEXT"); } catch {}
        // Fallback: raw query without new columns
        try {
          const client: any = (db as any).$client ?? (await import("@libsql/client")).createClient({ url: process.env.DATABASE_URL || "file:db/etf-tracker.db" });
          const res: any = await client.execute({ sql: "SELECT id, userId, symbol, allocation, usagePercent, createdAt FROM fifullsimulationassets WHERE userId = ?", args: [ctx.user.id] });
          return (res.rows || []).map((r:any)=> ({ id: r.id, userId: r.userId, symbol: r.symbol, allocation: r.allocation, usagePercent: r.usagePercent, assetType: "etf", couponRate: null, manualPrice: null, createdAt: r.createdAt }));
        } catch {}
      }
      throw e;
    }
  }),

  addFullSimulationAsset: protectedProcedure
    .input(z.object({ 
      symbol: z.string().min(1),
      allocation: z.string().optional(),
      usagePercent: z.string().optional(),
      assetType: z.enum(["etf","bond"]).optional(),
      couponRate: z.string().optional(),
      manualPrice: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const symbol = input.symbol.toUpperCase();

      const existing = await db
        .select()
        .from(fiFullSimulationAssets)
        .where(and(eq(fiFullSimulationAssets.userId, ctx.user.id), eq(fiFullSimulationAssets.symbol, symbol)))
        .then(rows => rows[0]);

      if (existing) return { success: true, id: existing.id };

      const result = await db.insert(fiFullSimulationAssets).values({
        userId: ctx.user.id,
        symbol: symbol,
        allocation: input.allocation || "0",
        usagePercent: input.usagePercent || "100",
        assetType: input.assetType || "etf",
        couponRate: input.couponRate || null,
        manualPrice: input.manualPrice || null,
        createdAt: new Date(),
      } as any);

      return { success: true, id: (result as any).lastInsertRowid };
    }),

  updateFullSimulationAsset: protectedProcedure
    .input(z.object({
      id: z.number(),
      allocation: z.string().optional(),
      usagePercent: z.string().optional(),
      couponRate: z.string().optional(),
      manualPrice: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const updates: any = {};
      if (input.allocation !== undefined) updates.allocation = input.allocation;
      if (input.usagePercent !== undefined) updates.usagePercent = input.usagePercent;
      if ((input as any).couponRate !== undefined) updates.couponRate = (input as any).couponRate;
      if ((input as any).manualPrice !== undefined) updates.manualPrice = (input as any).manualPrice;

      await db.update(fiFullSimulationAssets)
        .set(updates)
        .where(and(eq(fiFullSimulationAssets.id, input.id), eq(fiFullSimulationAssets.userId, ctx.user.id)));

      return { success: true };
    }),

  deleteFullSimulationAsset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(fiFullSimulationAssets)
        .where(and(eq(fiFullSimulationAssets.id, input.id), eq(fiFullSimulationAssets.userId, ctx.user.id)));

      return { success: true };
    }),

  getFullSimulationData: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    let assets: any[];
    try {
      assets = await db
        .select()
        .from(fiFullSimulationAssets)
        .where(eq(fiFullSimulationAssets.userId, ctx.user.id));
    } catch (e: any) {
      if (e?.message?.includes("no such column") || e?.message?.includes("assetType")) {
        console.warn("[FI] Auto-migrating fifullsimulationassets for getFullSimulationData");
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN assetType TEXT DEFAULT 'etf' NOT NULL"); } catch {}
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN couponRate TEXT"); } catch {}
        try { await (db as any).$client?.execute?.("ALTER TABLE fifullsimulationassets ADD COLUMN manualPrice TEXT"); } catch {}
        try {
          const client: any = (db as any).$client ?? (await import("@libsql/client")).createClient({ url: process.env.DATABASE_URL || "file:db/etf-tracker.db" });
          const res: any = await client.execute({ sql: "SELECT id, userId, symbol, allocation, usagePercent, createdAt FROM fifullsimulationassets WHERE userId = ?", args: [ctx.user.id] });
          assets = (res.rows || []).map((r:any)=> ({ id: r.id, userId: r.userId, symbol: r.symbol, allocation: r.allocation, usagePercent: r.usagePercent, assetType: "etf", couponRate: null, manualPrice: null, createdAt: r.createdAt }));
        } catch { assets = []; }
      } else throw e;
    }

    const results = await Promise.all(assets.map(async (asset: any) => {
      const assetType = asset.assetType || "etf";
      // Bond handling: twice a year coupon
      if (assetType === "bond") {
        try {
          let coupon = parseFloat(asset.couponRate || "0");
          // fallback to existing bond holding's coupon if not stored
          if (!coupon) {
            const { bondHoldings } = await import("../drizzle/schema");
            const bh = await db.select().from(bondHoldings).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.symbol, asset.symbol.toUpperCase()))).then(r=>r[0] as any);
            if (bh) coupon = parseFloat(bh.couponRate || "0");
          }
          let price = asset.manualPrice ? parseFloat(asset.manualPrice) : 0;
          if (!price) {
            const brPrice = await getBondPriceFromBrokerage(asset.symbol);
            price = brPrice ? parseFloat(brPrice) : 0;
            if (!price) {
              const { bondHoldings } = await import("../drizzle/schema");
              const bh2 = await db.select().from(bondHoldings).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.symbol, asset.symbol.toUpperCase()))).then(r=>r[0] as any);
              if (bh2) price = parseFloat(bh2.currentPrice || "0");
            }
            if (!price) {
              const pData = await fetchEtfPrice(asset.symbol);
              price = pData?.price || 100;
            }
          }
          return {
            id: asset.id,
            symbol: asset.symbol,
            allocation: asset.allocation,
            usagePercent: asset.usagePercent,
            assetType: "bond",
            price: price || 100,
            annualDPS: coupon,
            couponRate: coupon,
            paymentFrequency: "semiannual",
            success: price > 0,
          };
        } catch (e) {
          return { id: asset.id, symbol: asset.symbol, allocation: asset.allocation, usagePercent: asset.usagePercent, assetType: "bond", price: 100, annualDPS: parseFloat(asset.couponRate || "0"), success: false };
        }
      }
      // ETF handling - also auto-detect bond if ETF data missing but bond holding exists
      try {
        // Check if this symbol actually is a bond holding (user holds bond with this symbol) but assetType was etf
        const { bondHoldings } = await import("../drizzle/schema");
        const bh = await db.select().from(bondHoldings).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.symbol, asset.symbol.toUpperCase()))).then(r=>r[0] as any);
        if (bh) {
          let price = asset.manualPrice ? parseFloat(asset.manualPrice) : 0;
          if (!price) {
            const brPrice = await getBondPriceFromBrokerage(asset.symbol);
            price = brPrice ? parseFloat(brPrice) : parseFloat(bh.currentPrice || "0") || 100;
          }
          return { id: asset.id, symbol: asset.symbol, allocation: asset.allocation, usagePercent: asset.usagePercent, assetType: "bond", price: price, annualDPS: parseFloat(bh.couponRate || "0"), couponRate: parseFloat(bh.couponRate || "0"), paymentFrequency: "semiannual", success: true };
        }
        const priceData = await fetchEtfPrice(asset.symbol);
        const annualDPS = await calculateAnnualDPS(asset.symbol);
        return {
          id: asset.id,
          symbol: asset.symbol,
          allocation: asset.allocation,
          usagePercent: asset.usagePercent,
          assetType: "etf",
          price: priceData?.price || 0,
          annualDPS: annualDPS,
          success: !!priceData
        };
      } catch (e) {
        return {
          id: asset.id,
          symbol: asset.symbol,
          allocation: asset.allocation,
          usagePercent: asset.usagePercent,
          assetType: "etf",
          price: 0,
          annualDPS: 0,
          success: false
        };
      }
    }));

    return results;
  }),

  updateRetirementSettings: protectedProcedure
    .input(z.object({
      withdrawalRate: z.string().optional(),
      returnRate: z.string().optional(),
      inflationRate: z.string().optional(),
      startDate: z.date().optional(),
      birthDate: z.date().optional(),
      ssAmount: z.string().optional(),
      ssAge: z.string().optional(),
      lifeExpectancy: z.string().optional(),
      targetEffortDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateRetirementSettings(ctx.user.id, input);
      return { success: true };
    }),
});
