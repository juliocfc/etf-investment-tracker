import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { allocationGroups, allocationGroupAssets } from "../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "./db";

let _cashYieldCache: { value:number, ts:number } | null = null;
export const groupRouter = router({
  getYields: protectedProcedure.input(z.object({ assets: z.array(z.object({ assetType: z.enum(["cash","etf","bond","crypto"]), assetKey: z.string(), currentValue: z.number(), quantity: z.number().optional(), currentPrice: z.number().optional() })) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    const { fetchDividendData } = await import("./financialApi");
    const { bondHoldings } = await import("../drizzle/schema");
    const results: any[] = [];
    // Dynamic cash yield: BIL (1-3M T-Bill ETF) dividendYield ~ SPAXX/SPRXX 7-day (Fidelity ~3.57%); refresh hourly
    let cashYield = 0.0357;
    try {
      if (_cashYieldCache && Date.now() - _cashYieldCache.ts < 60*60*1000) cashYield = _cashYieldCache.value;
      else {
        const YahooFinance = (await import("yahoo-finance2")).default;
        const yf: any = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey','ripHistorical'] });
        const q = await yf.quote("BIL");
        const dy = (q as any).dividendYield ?? (q as any).trailingAnnualDividendYield;
        if (typeof dy === "number" && dy > 0.1) { // Yahoo returns 3.66 for 3.66%
          cashYield = dy > 1 ? dy/100 : dy;
          _cashYieldCache = { value: cashYield, ts: Date.now() };
        } else {
          const divs = await fetchDividendData("BIL");
          if (divs.length) {
            const last = [...divs].sort((a,b)=> b.exDate.getTime()-a.exDate.getTime())[0];
            // BIL monthly ~0.27, price ~91.5 => ~3.5%
            const priceQ = await yf.quote("BIL");
            const price = (priceQ as any).regularMarketPrice || 91.5;
            const annual = last.dividendPerShare * 12;
            cashYield = price>0 ? annual/price : cashYield;
            _cashYieldCache = { value: cashYield, ts: Date.now() };
          }
        }
      }
    } catch {}
    for (const a of input.assets) {
      const type = a.assetType;
      const key = type==="cash" ? a.assetKey : a.assetKey.toUpperCase();
      if (type==="cash") {
        const y = cashYield;
        results.push({ assetType: type, assetKey: key, yield: y, next12: a.currentValue * y, lastDividend: 0, frequency: "monthly", note: `BIL ${(y*100).toFixed(2)}% ~ SPAXX/SPRXX MMF (live)` });
        continue;
      }
      if (type==="bond") {
        // "BONDS" is the aggregated row from consolidatedHoldings — average across all active bonds
        let rows: any[] = [];
        if (key === "BONDS") {
          const all = await db.select().from(bondHoldings).where(eq(bondHoldings.userId, ctx.user.id));
          rows = (all as any[]).filter((r:any)=> parseFloat(r.quantity||"0") > 0.001);
        } else {
          rows = await db.select().from(bondHoldings).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.symbol, key)));
          if (rows.length===0) {
            // fallback: consolidated "BONDS" may hold a single CUSIP's value — still use all bonds average
            const all = await db.select().from(bondHoldings).where(eq(bondHoldings.userId, ctx.user.id));
            rows = (all as any[]).filter((r:any)=> parseFloat(r.quantity||"0") > 0.001);
          }
        }
        let avgCoupon = 0;
        if (rows.length) {
          let totQty=0, wCoupon=0;
          for (const r of rows as any[]) { const q=parseFloat(r.quantity||"0"); const c=parseFloat(r.couponRate||"0"); totQty+=q; wCoupon+= q*c; }
          avgCoupon = totQty>0 ? wCoupon/totQty : parseFloat((rows[0] as any).couponRate||"0");
        }
        // couponRate stored as e.g. "4.5" => 4.5% — avg coupon (not YTM)
        const y = avgCoupon/100;
        results.push({ assetType: type, assetKey: key, yield: y, next12: a.currentValue * y, lastDividend: 0, frequency: "coupon", couponRate: avgCoupon });
        continue;
      }
      // etf/crypto/stock: last dividend * frequency / price
      try {
        const divs = await fetchDividendData(key);
        if (!divs || divs.length===0) { results.push({ assetType: type, assetKey: key, yield: 0, next12: 0, lastDividend: 0, frequency: "none" }); continue; }
        const sorted = [...divs].sort((a,b)=> b.exDate.getTime()-a.exDate.getTime());
        const last = sorted[0];
        const lastAmt = last.dividendPerShare;
        // frequency by count in last 365d
        const oneYearAgo = Date.now() - 365*24*60*60*1000;
        const lastYearCount = sorted.filter(d=> d.exDate.getTime() >= oneYearAgo).length;
        let freq = 1, freqLabel="annual";
        if (lastYearCount >= 10) { freq=12; freqLabel="monthly"; }
        else if (lastYearCount >= 4) { freq=4; freqLabel="quarterly"; }
        else if (lastYearCount === 2) { freq=2; freqLabel="semi"; }
        else if (lastYearCount === 1) { freq=1; freqLabel="annual"; }
        else if (lastYearCount === 0) {
          // fallback: infer from spacing of last two dividends
          if (sorted.length>=2) {
            const gap = (sorted[0].exDate.getTime()-sorted[1].exDate.getTime())/(1000*60*60*24);
            if (gap <= 35) { freq=12; freqLabel="monthly"; }
            else if (gap <= 95) { freq=4; freqLabel="quarterly"; }
          }
        }
        const price = a.currentPrice && a.currentPrice>0 ? a.currentPrice : (a.quantity && a.quantity>0 ? a.currentValue / a.quantity : 0);
        const annualPerShare = lastAmt * freq;
        const y = price>0 ? annualPerShare / price : 0;
        const next12 = annualPerShare * (a.quantity||0);
        // fallback: if next12 0 but we have currentValue and y, use y*currentValue (covers price drift)
        const next12Alt = y * a.currentValue;
        results.push({ assetType: type, assetKey: key, yield: y, next12: next12>0 ? next12 : next12Alt, lastDividend: lastAmt, frequency: freqLabel, paymentsPerYear: freq });
      } catch (e) {
        results.push({ assetType: type, assetKey: key, yield: 0, next12: 0, lastDividend: 0, frequency: "error" });
      }
    }
    return results;
  }),

  getGroups: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const groups = await db.select().from(allocationGroups).where(eq(allocationGroups.userId, ctx.user.id)).orderBy(asc(allocationGroups.sortOrder), asc(allocationGroups.id));
    const assets = await db.select().from(allocationGroupAssets).where(eq(allocationGroupAssets.userId, ctx.user.id));
    return groups.map((g:any)=> ({ ...g, assets: assets.filter((a:any)=> a.groupId===g.id) }));
  }),

  createGroup: protectedProcedure.input(z.object({ name: z.string().min(1).max(60), targetAllocation: z.string().regex(/^\d+(\.\d+)?$/).default("0") })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const target = parseFloat(input.targetAllocation);
    if (target < 0 || target > 100) throw new Error("Target 0-100");
    const existing = await db.select().from(allocationGroups).where(eq(allocationGroups.userId, ctx.user.id));
    const maxOrder = existing.reduce((m:any,r:any)=> Math.max(m, r.sortOrder||0), -1);
    const res = await db.insert(allocationGroups).values({ userId: ctx.user.id, name: input.name.trim(), targetAllocation: target.toFixed(2), sortOrder: maxOrder+1 }).returning({ id: allocationGroups.id });
    const id = (res as any)[0]?.id ?? (res as any).lastInsertRowid;
    return { id };
  }),

  updateGroup: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1).max(60).optional(), targetAllocation: z.string().regex(/^\d+(\.\d+)?$/).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const row = await db.select().from(allocationGroups).where(and(eq(allocationGroups.id, input.id), eq(allocationGroups.userId, ctx.user.id))).then((r:any)=>r[0]);
    if (!row) throw new Error("Group not found");
    const upd: any = { updatedAt: new Date() };
    if (input.name !== undefined) upd.name = input.name.trim();
    if (input.targetAllocation !== undefined) {
      const t = parseFloat(input.targetAllocation);
      if (t<0||t>100) throw new Error("Target 0-100");
      upd.targetAllocation = t.toFixed(2);
    }
    await db.update(allocationGroups).set(upd).where(eq(allocationGroups.id, input.id));
    return { success: true };
  }),

  deleteGroup: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const row = await db.select().from(allocationGroups).where(and(eq(allocationGroups.id, input.id), eq(allocationGroups.userId, ctx.user.id))).then((r:any)=>r[0]);
    if (!row) throw new Error("Group not found");
    await db.delete(allocationGroupAssets).where(and(eq(allocationGroupAssets.groupId, input.id), eq(allocationGroupAssets.userId, ctx.user.id)));
    await db.delete(allocationGroups).where(eq(allocationGroups.id, input.id));
    return { success: true };
  }),

  assignAsset: protectedProcedure.input(z.object({ groupId: z.number(), assetType: z.enum(["cash","etf","bond","crypto"]), assetKey: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const group = await db.select().from(allocationGroups).where(and(eq(allocationGroups.id, input.groupId), eq(allocationGroups.userId, ctx.user.id))).then((r:any)=>r[0]);
    if (!group) throw new Error("Group not found");
    const key = input.assetType==="cash" ? input.assetKey : input.assetKey.toUpperCase();
    // one asset can only be in one group — remove from old if exists
    await db.delete(allocationGroupAssets).where(and(eq(allocationGroupAssets.userId, ctx.user.id), eq(allocationGroupAssets.assetType, input.assetType), eq(allocationGroupAssets.assetKey, key)));
    await db.insert(allocationGroupAssets).values({ groupId: input.groupId, userId: ctx.user.id, assetType: input.assetType, assetKey: key });
    return { success: true };
  }),

  unassignAsset: protectedProcedure.input(z.object({ assetType: z.enum(["cash","etf","bond","crypto"]), assetKey: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const key = input.assetType==="cash" ? input.assetKey : input.assetKey.toUpperCase();
    await db.delete(allocationGroupAssets).where(and(eq(allocationGroupAssets.userId, ctx.user.id), eq(allocationGroupAssets.assetType, input.assetType), eq(allocationGroupAssets.assetKey, key)));
    return { success: true };
  }),

  moveAsset: protectedProcedure.input(z.object({ assetType: z.enum(["cash","etf","bond","crypto"]), assetKey: z.string().min(1), targetGroupId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const key = input.assetType==="cash" ? input.assetKey : input.assetKey.toUpperCase();
    const group = await db.select().from(allocationGroups).where(and(eq(allocationGroups.id, input.targetGroupId), eq(allocationGroups.userId, ctx.user.id))).then((r:any)=>r[0]);
    if (!group) throw new Error("Group not found");
    await db.delete(allocationGroupAssets).where(and(eq(allocationGroupAssets.userId, ctx.user.id), eq(allocationGroupAssets.assetType, input.assetType), eq(allocationGroupAssets.assetKey, key)));
    await db.insert(allocationGroupAssets).values({ groupId: input.targetGroupId, userId: ctx.user.id, assetType: input.assetType, assetKey: key });
    return { success: true };
  }),
});
