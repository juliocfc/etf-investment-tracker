import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { bondHoldings, bondPurchases, accounts, cashBalance } from "../drizzle/schema";
import {
  getUserBondHoldings,
  createBondHolding,
  updateBondHolding,
  deleteBondHolding,
  getBondPurchases,
  addBondPurchase,
  deleteBondPurchase,
  updateBondPurchase,
  calculateBondAverageCost,
  getCashBalance,
  updateCashBalance,
  getBondPriceFromBrokerage,
} from "./db";
import { and, eq, desc, sql } from "drizzle-orm";
import { getDb, truncateNumber } from "./db";


// Semi-annual coupon helper: redemption 02/15/2036 => coupons 02/15 & 08/15 each year
function getCouponDates(redemptionDate: Date, fromDate: Date = new Date()): Date[] {
  if (!redemptionDate) return [];
  const m = redemptionDate.getMonth();
  const d = redemptionDate.getDate();
  const dates: Date[] = [];
  const startYear = fromDate.getFullYear();
  const endYear = redemptionDate.getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    for (const mo of [m, (m + 6) % 12]) {
      const yr = mo === m ? y : (m + 6 >= 12 ? y + (m > 5 ? 0 : 0) : y); // handle year roll for second coupon
      // For Aug (m+6) when m=1 (Feb), month 7 same year
      let yearForSecond = y;
      if (m + 6 >= 12) yearForSecond = y + 1;
      // Actually simpler: two dates per year: month m and (m+6)%12
      // Need correct year association
    }
  }
  // Simpler robust: iterate every 6 months backwards from redemption
  let cur = new Date(redemptionDate);
  const from = new Date(fromDate); from.setHours(0,0,0,0);
  while (cur >= from) {
    if (cur <= redemptionDate) dates.push(new Date(cur));
    cur.setMonth(cur.getMonth() - 6);
  }
  return dates.sort((a,b)=>+a-+b);
}

function calculateCouponAmount(quantity: string | number, couponRate: string | number): number {
  const qty = parseFloat(String(quantity||"0"));
  const rate = parseFloat(String(couponRate||"0"));
  if (!qty || !rate) return 0;
  // par 100 per unit, semi-annual: qty * 100 * rate/100 /2 = qty * rate /2
  // Example: qty 10, rate 4.125 => 10*2.0625=20.625
  return truncateNumber(qty * (rate / 2), 2);
}


export const bondRouter = router({
  getHoldings: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      accountId: z.number().optional(),
      accountType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
      if (input.accountType && input.accountId === undefined) {
        const db = await getDb();
        const matchingAccounts = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, ctx.user.id), eq(accounts.portfolioId, input.portfolioId), eq(accounts.accountType, input.accountType)));
        const matchingIds = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => matchingIds.includes(h.accountId));
      }
      if (!holdings || holdings.length === 0) return [];
      const holdingsWithAvgCost = await Promise.all(
        holdings.map(async (holding: any) => {
          const avgCost = await calculateBondAverageCost(holding.id);
          const db = await getDb();
          const fresh = await db.select().from(bondHoldings).where(eq(bondHoldings.id, holding.id)).then((rows: any[]) => rows[0]);
          const brokeragePrice = await getBondPriceFromBrokerage(fresh.symbol);
          if (brokeragePrice) {
            // update stored currentPrice if brokerage has fresh price (non-blocking)
            if (fresh.currentPrice !== brokeragePrice) {
              await updateBondHolding(fresh.id, { currentPrice: brokeragePrice });
              fresh.currentPrice = brokeragePrice;
            }
          }
          return { ...fresh, averageCost: avgCost, assetType: "bond" };
        })
      );
      if (input.accountId === undefined) {
        const consolidatedMap = new Map<string, any>();
        for (const h of holdingsWithAvgCost) {
          if (!consolidatedMap.has(h.symbol)) {
            consolidatedMap.set(h.symbol, { ...h, id: -1, isConsolidated: true, quantity: 0, totalCost: 0 });
          }
          const existing = consolidatedMap.get(h.symbol);
          const qty = parseFloat(h.quantity.toString());
          const avgCost = parseFloat(h.averageCost || h.purchasePrice || "0");
          existing.quantity += qty;
          existing.totalCost += qty * avgCost;
        }
        const consolidated = Array.from(consolidatedMap.values()).map((h: any) => ({
          ...h,
          quantity: h.quantity.toString(),
          averageCost: h.quantity > 0 ? (h.totalCost / h.quantity).toString() : "0",
          totalCost: undefined,
        }));
        return consolidated.filter((h: any) => parseFloat(h.quantity) > 0);
      }
      return holdingsWithAvgCost.filter((h: any) => parseFloat(h.quantity) > 0);
    }),

  getPrice: protectedProcedure
    .input(z.object({ symbol: z.string().min(1).max(20) }))
    .query(async ({ input }) => {
      const price = await getBondPriceFromBrokerage(input.symbol.toUpperCase());
      return price ? { price, source: "brokerage" } : null;
    }),


  getCouponSchedule: protectedProcedure
    .input(z.object({ holdingId: z.number().optional(), symbol: z.string().optional(), portfolioId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      let holdings: any[] = [];
      if (input.holdingId && input.holdingId !== -1) {
        const db = await getDb();
        const h = await db.select().from(bondHoldings).where(eq(bondHoldings.id, input.holdingId)).then(r=>r[0]);
        if (h) holdings = [h];
      } else if (input.symbol && input.portfolioId) {
        holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId);
        holdings = holdings.filter((h:any)=>h.symbol.toUpperCase()===input.symbol!.toUpperCase());
      } else if (input.portfolioId) {
        holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId);
      }
      const result: any[] = [];
      for (const h of holdings) {
        if (!h.redemptionDate) continue;
        const rate = (h as any).couponRate || "0";
        const qty = h.quantity;
        const couponAmount = calculateCouponAmount(qty, rate);
        const dates = getCouponDates(new Date(h.redemptionDate), new Date());
        const nextDates = dates.map(d=>({ date: d, amount: couponAmount }));
        const next = nextDates[0] || null;
        result.push({ holdingId: h.id, symbol: h.symbol, name: h.name, quantity: qty, couponRate: rate, redemptionDate: h.redemptionDate, couponAmount, nextCouponDate: next?.date || null, nextCouponAmount: next?.amount || 0, schedule: nextDates.slice(0, 12) });
      }
      return result;
    }),

  getPurchases: protectedProcedure
    .input(z.object({
      holdingId: z.number().optional(),
      symbol: z.string().optional(),
      portfolioId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (input.holdingId && input.holdingId !== -1) {
        return getBondPurchases(input.holdingId);
      }
      if (input.symbol && input.portfolioId) {
        const holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId);
        const matched = holdings.filter((h: any) => h.symbol.toUpperCase() === input.symbol!.toUpperCase());
        let all: any[] = [];
        for (const h of matched) {
          const p = await getBondPurchases(h.id);
          all = all.concat(p);
        }
        return all.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      }
      // fallback: all bond purchases for user
      let conditions: any[] = [eq(bondPurchases.userId, ctx.user.id)];
      if (input.portfolioId) conditions.push(eq(bondPurchases.portfolioId, input.portfolioId));
      if (input.symbol) conditions.push(eq(bondPurchases.symbol, input.symbol.toUpperCase()));
      return db.select().from(bondPurchases).where(and(...conditions)).orderBy(desc(bondPurchases.purchaseDate));
    }),

  addHolding: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      accountId: z.number(),
      symbol: z.string().min(1).max(20), // CUSIP
      name: z.string().min(1).max(255),
      quantity: z.string(),
      purchasePrice: z.string(),
      purchaseDate: z.date(),
      redemptionDate: z.date().optional().nullable(),
      couponRate: z.string().optional().default("0"),
      interest: z.string().optional().default("0"),
      fees: z.string().optional().default("0"),
      type: z.enum(["buy", "sell"]).default("buy"),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      const account = await dbInstance.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.portfolioId, input.portfolioId), eq(accounts.userId, ctx.user.id))).then((rows: any[]) => rows[0]);
      if (!account) throw new Error("Invalid account selection for this portfolio");

      const existingHolding = await dbInstance.select().from(bondHoldings).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.portfolioId, input.portfolioId), eq(bondHoldings.accountId, input.accountId), eq(bondHoldings.symbol, input.symbol.toUpperCase()))).limit(1).then((rows: any[]) => rows[0]);
      if (input.type === "sell" && !existingHolding) throw new Error("Cannot sell a bond you don't own in this portfolio");

      let holdingId = existingHolding?.id;
      if (!existingHolding) {
        const brokeragePrice = await getBondPriceFromBrokerage(input.symbol.toUpperCase());
        holdingId = await createBondHolding({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          symbol: input.symbol.toUpperCase(),
          name: input.name,
          quantity: "0",
          purchasePrice: input.purchasePrice,
          currentPrice: brokeragePrice || input.purchasePrice,
          purchaseDate: input.purchaseDate,
          redemptionDate: input.redemptionDate ?? null,
          couponRate: input.couponRate || "0",
        });
      } else {
        const updates: any = {};
        if (input.redemptionDate) updates.redemptionDate = input.redemptionDate;
        if (input.couponRate && input.couponRate !== "0") updates.couponRate = input.couponRate;
        if (Object.keys(updates).length) await updateBondHolding(existingHolding.id, updates);
        const brokeragePrice = await getBondPriceFromBrokerage(input.symbol.toUpperCase());
        if (brokeragePrice && existingHolding.currentPrice !== brokeragePrice) {
          await updateBondHolding(existingHolding.id, { currentPrice: brokeragePrice });
        }
      }

      const quantityNum = parseFloat(input.quantity);
      const priceNum = parseFloat(input.purchasePrice);
      const interestNum = parseFloat(input.interest || "0");
      const feesNum = parseFloat(input.fees || "0");

      if (input.type === "buy") {
        const totalCost = truncateNumber(quantityNum * priceNum + interestNum + feesNum);
        const description = `You bought ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${interestNum > 0 ? ` (Interest: $${interestNum.toFixed(2)})` : ""}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        const cashResult = await updateCashBalance(ctx.user.id, input.portfolioId, "0", input.accountId, input.purchaseDate, { type: "withdrawal", transactionAmount: totalCost.toString(), description });
        await addBondPurchase({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          holdingId: Number(holdingId),
          symbol: input.symbol.toUpperCase(),
          quantity: input.quantity,
          price: input.purchasePrice,
          interest: (interestNum || 0).toString(),
          couponRate: input.couponRate || "0",
          fees: (feesNum || 0).toString(),
          cashTransactionId: cashResult.historyId,
          purchaseDate: input.purchaseDate,
          redemptionDate: input.redemptionDate ?? null,
        });
      } else {
        const totalOwned = parseFloat(existingHolding!.quantity);
        if (totalOwned < quantityNum) throw new Error(`Insufficient bonds to sell. Owned: ${totalOwned}, Requested: ${quantityNum}`);
        const totalProceeds = truncateNumber(quantityNum * priceNum - feesNum);
        const description = `You sold ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}${feesNum > 0 ? ` (Fees: $${feesNum.toFixed(2)})` : ""}`;
        await updateCashBalance(ctx.user.id, input.portfolioId, "0", input.accountId, input.purchaseDate, { type: "deposit", transactionAmount: totalProceeds.toString(), description });
        const db = await getDb();
        const allPurchases = await db.select().from(bondPurchases).where(eq(bondPurchases.holdingId, Number(holdingId))).orderBy(bondPurchases.purchaseDate, bondPurchases.id);
        let remainingToSell = quantityNum;
        for (const purchase of allPurchases) {
          if (remainingToSell <= 0) break;
          if ((purchase as any).isSold) continue;
          const purchaseQty = parseFloat((purchase as any).quantity);
          if (purchaseQty <= remainingToSell) {
            await updateBondPurchase(purchase.id, { isSold: true, soldDate: input.purchaseDate, soldPrice: input.purchasePrice });
            remainingToSell -= purchaseQty;
          } else {
            const remainingQty = purchaseQty - remainingToSell;
            await updateBondPurchase(purchase.id, { quantity: remainingToSell.toString(), isSold: true, soldDate: input.purchaseDate, soldPrice: input.purchasePrice });
            await addBondPurchase({
              userId: purchase.userId,
              portfolioId: purchase.portfolioId,
              accountId: purchase.accountId,
              holdingId: purchase.holdingId,
              symbol: purchase.symbol,
              quantity: remainingQty.toString(),
              price: (purchase as any).price,
              interest: "0",
              fees: "0",
              purchaseDate: purchase.purchaseDate,
              redemptionDate: (purchase as any).redemptionDate,
              isSold: false,
            });
            remainingToSell = 0;
          }
        }
      }
      await calculateBondAverageCost(Number(holdingId));
      return { id: holdingId };
    }),

  executeTrade: protectedProcedure
    .input(z.object({
      portfolioId: z.number(),
      holdingId: z.number(),
      symbol: z.string(),
      accountId: z.number(),
      quantity: z.string(),
      price: z.string(),
      purchaseDate: z.date(),
      interest: z.string().optional().default("0"),
      fees: z.string().optional().default("0"),
      type: z.enum(["buy", "sell"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      const account = await dbInstance.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.portfolioId, input.portfolioId), eq(accounts.userId, ctx.user.id))).then((rows: any[]) => rows[0]);
      if (!account) throw new Error("Invalid account selection for this portfolio");
      let holdingId = input.holdingId;
      let holding: any;
      if (holdingId === -1) {
        // Consolidated view: search across all accounts for this symbol, prefer the requested account if it has it
        const allHoldings = await getUserBondHoldings(ctx.user.id, input.portfolioId);
        const candidates = allHoldings.filter((h: any) => h.symbol === input.symbol.toUpperCase());
        let holdingForAccount = candidates.find((h: any) => h.accountId === input.accountId);
        holding = holdingForAccount || candidates.find((h: any) => parseFloat(h.quantity) > 0) || candidates[0];
        if (!holding) {
          if (input.type === "sell") throw new Error("Cannot sell: No bond holding found for this symbol");
          const newId = await createBondHolding({
            userId: ctx.user.id,
            portfolioId: input.portfolioId,
            accountId: input.accountId,
            symbol: input.symbol.toUpperCase(),
            name: input.symbol.toUpperCase(),
            quantity: "0",
            purchasePrice: input.price,
            currentPrice: input.price,
            purchaseDate: input.purchaseDate,
          });
          holdingId = newId;
        } else {
          holdingId = holding.id;
          // Use the actual holding's accountId for the trade if caller provided a different one
          input.accountId = holding.accountId;
        }
      } else {
        holding = await dbInstance.select().from(bondHoldings).where(eq(bondHoldings.id, holdingId)).then((rows: any[]) => rows[0]);
        if (!holding) throw new Error("Bond holding not found");
      }
      const qtyNum = parseFloat(input.quantity);
      const priceNum = parseFloat(input.price);
      const interestNum = parseFloat(input.interest || "0");
      const feesNum = parseFloat(input.fees || "0");
      if (input.type === "buy") {
        const totalCost = truncateNumber(qtyNum * priceNum + interestNum + feesNum);
        const description = `You bought ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}`;
        const cashResult = await updateCashBalance(ctx.user.id, input.portfolioId, "0", input.accountId, input.purchaseDate, { type: "withdrawal", transactionAmount: totalCost.toString(), description });
        await addBondPurchase({
          userId: ctx.user.id,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          holdingId,
          symbol: input.symbol.toUpperCase(),
          quantity: input.quantity,
          price: input.price,
          interest: interestNum.toString(),
          fees: feesNum.toString(),
          cashTransactionId: cashResult.historyId,
          purchaseDate: input.purchaseDate,
        });
      } else {
        const holdingQty = parseFloat(holding.quantity || "0");
        if (holdingQty < qtyNum) throw new Error(`Insufficient quantity. Owned: ${holdingQty}, Requested: ${qtyNum}`);
        const totalProceeds = truncateNumber(qtyNum * priceNum - feesNum);
        const description = `You sold/redeemed ${input.quantity} ${input.symbol.toUpperCase()} at $${priceNum.toFixed(2)}`;
        await updateCashBalance(ctx.user.id, input.portfolioId, "0", input.accountId, input.purchaseDate, { type: "deposit", transactionAmount: totalProceeds.toString(), description });
        const db = await getDb();
        const allPurchases = await db.select().from(bondPurchases).where(eq(bondPurchases.holdingId, holdingId)).orderBy(bondPurchases.purchaseDate, bondPurchases.id);
        let remainingToSell = qtyNum;
        for (const purchase of allPurchases) {
          if (remainingToSell <= 0) break;
          if ((purchase as any).isSold) continue;
          const purchaseQty = parseFloat((purchase as any).quantity);
          if (purchaseQty <= remainingToSell) {
            await updateBondPurchase(purchase.id, { isSold: true, soldDate: input.purchaseDate, soldPrice: input.price });
            remainingToSell -= purchaseQty;
          } else {
            const remainingQty = purchaseQty - remainingToSell;
            await updateBondPurchase(purchase.id, { quantity: remainingToSell.toString(), isSold: true, soldDate: input.purchaseDate, soldPrice: input.price });
            await addBondPurchase({
              userId: purchase.userId,
              portfolioId: purchase.portfolioId,
              accountId: purchase.accountId,
              holdingId: purchase.holdingId,
              symbol: purchase.symbol,
              quantity: remainingQty.toString(),
              price: (purchase as any).price,
              interest: "0",
              fees: "0",
              purchaseDate: purchase.purchaseDate,
              redemptionDate: (purchase as any).redemptionDate,
              isSold: false,
            });
            remainingToSell = 0;
          }
        }
      }
      const newQty = await calculateBondAverageCost(holdingId);
      // Update currentPrice if needed
      await updateBondHolding(holdingId, { currentPrice: input.price });
      const fresh = await dbInstance.select().from(bondHoldings).where(eq(bondHoldings.id, holdingId)).then((rows: any[]) => rows[0]);
      return { newQuantity: fresh?.quantity || "0", id: holdingId };
    }),

  deleteHolding: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const holding = await db.select().from(bondHoldings).where(and(eq(bondHoldings.id, input.id), eq(bondHoldings.userId, ctx.user.id))).then((rows: any[]) => rows[0]);
      if (!holding) throw new Error("Bond holding not found");
      await db.delete(bondPurchases).where(eq(bondPurchases.holdingId, input.id));
      await deleteBondHolding(input.id);
      return { success: true };
    }),

  deleteHoldingBySymbol: protectedProcedure
    .input(z.object({ portfolioId: z.number(), symbol: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId);
      const matched = holdings.filter((h: any) => h.symbol === input.symbol.toUpperCase());
      for (const h of matched) {
        await db.delete(bondPurchases).where(eq(bondPurchases.holdingId, h.id));
        await deleteBondHolding(h.id);
      }
      return { success: true };
    }),

  deletePurchase: protectedProcedure
    .input(z.object({ holdingId: z.number(), purchaseId: z.number(), symbol: z.string(), portfolioId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBondPurchase(input.purchaseId);
      await calculateBondAverageCost(input.holdingId);
      return { success: true };
    }),

  updateHolding: protectedProcedure
    .input(z.object({ id: z.number(), symbol: z.string().optional(), name: z.string().optional(), desiredAllocation: z.string().optional(), redemptionDate: z.date().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      if (id === -1 && input.symbol) {
        const db = await getDb();
        await db.update(bondHoldings).set(updates).where(and(eq(bondHoldings.userId, ctx.user.id), eq(bondHoldings.symbol, input.symbol.toUpperCase())));
      } else {
        await updateBondHolding(id, updates);
      }
      return { success: true };
    }),

  getPortfolioSummary: protectedProcedure
    .input(z.object({ portfolioId: z.number(), accountId: z.number().optional(), accountType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // minimal bond-only summary for inclusion in etf summary – client can also use etf summary combined
      let holdings = await getUserBondHoldings(ctx.user.id, input.portfolioId, input.accountId);
      if (input.accountType && input.accountId === undefined) {
        const db = await getDb();
        const matchingAccounts = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, ctx.user.id), eq(accounts.portfolioId, input.portfolioId), eq(accounts.accountType, input.accountType)));
        const ids = matchingAccounts.map((a: any) => a.id);
        holdings = holdings.filter((h: any) => ids.includes(h.accountId));
      }
      let totalInvestmentValue = 0;
      const holdingsWithValues = await Promise.all(holdings.map(async (h: any) => {
        const currentPrice = parseFloat(h.currentPrice?.toString() || "0");
        const qty = parseFloat(h.quantity.toString());
        const value = truncateNumber(currentPrice * qty);
        const avgCost = await calculateBondAverageCost(h.id);
        const avg = parseFloat(avgCost || h.purchasePrice || "0");
        const cost = truncateNumber(avg * qty);
        const gain = value - cost;
        totalInvestmentValue += value;
        return { ...h, averageCost: avgCost, totalCost: cost.toFixed(2), currentValue: value.toFixed(2), gain: gain.toFixed(2), gainPercent: cost > 0 ? ((gain/cost)*100).toFixed(2) : "0", assetType: "bond" };
      }));
      return { holdings: holdingsWithValues, investmentValue: totalInvestmentValue.toFixed(2) };
    }),
});
