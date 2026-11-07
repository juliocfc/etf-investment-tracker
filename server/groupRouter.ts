import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { allocationGroups, allocationGroupAssets } from "../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "./db";

export const groupRouter = router({
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
