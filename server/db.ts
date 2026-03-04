import { eq, and, gte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Re-export commonly used operators for convenience
export { eq, and, gte };

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ETF Holdings queries
export async function getUserEtfHoldings(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { etfHoldings } = await import("../drizzle/schema");
  return db.select().from(etfHoldings).where(eq(etfHoldings.userId, userId));
}

export async function createEtfHolding(holding: any) {
  const db = await getDb();
  if (!db) return null;
  const { etfHoldings } = await import("../drizzle/schema");
  await db.insert(etfHoldings).values(holding);
  // Return the inserted holding with ID
  const insertedHolding = await db.select().from(etfHoldings).where(eq(etfHoldings.userId, holding.userId)).orderBy(desc(etfHoldings.id)).limit(1);
  return insertedHolding[0];
}

export async function updateEtfHolding(id: number, updates: any) {
  const db = await getDb();
  if (!db) return null;
  const { etfHoldings } = await import("../drizzle/schema");
  return db.update(etfHoldings).set(updates).where(eq(etfHoldings.id, id));
}

export async function deleteEtfHolding(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { etfHoldings } = await import("../drizzle/schema");
  return db.delete(etfHoldings).where(eq(etfHoldings.id, id));
}

// Price History queries
export async function addPriceHistory(userId: number, symbol: string, price: string, date: Date) {
  const db = await getDb();
  if (!db) return null;
  const { priceHistory } = await import("../drizzle/schema");
  return db.insert(priceHistory).values({ userId, symbol, price, date });
}

export async function getPriceHistory(userId: number, symbol: string, days: number = 365) {
  const db = await getDb();
  if (!db) return [];
  const { priceHistory } = await import("../drizzle/schema");
  const { gte } = await import("drizzle-orm");
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return db
    .select()
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.userId, userId),
        eq(priceHistory.symbol, symbol),
        gte(priceHistory.date, cutoffDate)
      )
    )
    .orderBy(priceHistory.date);
}

// Dividend History queries
export async function addDividendHistory(userId: number, symbol: string, dividendPerShare: string, exDate: Date, paymentDate?: Date, totalDividend?: string) {
  const db = await getDb();
  if (!db) return null;
  const { dividendHistory } = await import("../drizzle/schema");
  return db.insert(dividendHistory).values({
    userId,
    symbol,
    dividendPerShare,
    exDate,
    paymentDate,
    totalDividend,
  });
}

export async function getDividendHistory(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) return [];
  const { dividendHistory } = await import("../drizzle/schema");
  return db
    .select()
    .from(dividendHistory)
    .where(eq(dividendHistory.userId, userId) && eq(dividendHistory.symbol, symbol))
    .orderBy(dividendHistory.exDate);
}

// Cash Balance queries
export async function getCashBalance(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const { cashBalance } = await import("../drizzle/schema");
  const result = await db.select().from(cashBalance).where(eq(cashBalance.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateCashBalance(userId: number, amount: string) {
  const db = await getDb();
  if (!db) return null;
  const { cashBalance } = await import("../drizzle/schema");
  const existing = await getCashBalance(userId);
  if (existing) {
    return db.update(cashBalance).set({ amount }).where(eq(cashBalance.userId, userId));
  } else {
    return db.insert(cashBalance).values({ userId, amount });
  }
}

// Balance History queries
export async function addBalanceHistory(userId: number, totalValue: string, cashValue: string, investmentValue: string, date: Date) {
  const db = await getDb();
  if (!db) return null;
  const { balanceHistory } = await import("../drizzle/schema");
  return db.insert(balanceHistory).values({
    userId,
    totalValue,
    cashValue,
    investmentValue,
    date,
  });
}

export async function getBalanceHistory(userId: number, days: number = 365) {
  const db = await getDb();
  if (!db) return [];
  const { balanceHistory } = await import("../drizzle/schema");
  const { gte } = await import("drizzle-orm");
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return db
    .select()
    .from(balanceHistory)
    .where(
      and(
        eq(balanceHistory.userId, userId),
        gte(balanceHistory.date, cutoffDate)
      )
    )
    .orderBy(balanceHistory.date);
}

// Purchase queries
export async function addPurchase(userId: number, holdingId: number, symbol: string, quantity: string, price: string, purchaseDate: Date) {
  const db = await getDb();
  if (!db) return null;
  const { purchases } = await import("../drizzle/schema");
  return db.insert(purchases).values({
    userId,
    holdingId,
    symbol,
    quantity,
    price,
    purchaseDate,
  });
}

export async function getPurchases(holdingId: number) {
  const db = await getDb();
  if (!db) return [];
  const { purchases } = await import("../drizzle/schema");
  return db.select().from(purchases).where(eq(purchases.holdingId, holdingId)).orderBy(purchases.purchaseDate);
}

export async function calculateAverageCost(holdingId: number): Promise<number | null> {
  const purchases = await getPurchases(holdingId);
  if (purchases.length === 0) return null;
  
  let totalCost = 0;
  let totalQuantity = 0;
  
  for (const purchase of purchases) {
    const qty = parseFloat(purchase.quantity.toString());
    const price = parseFloat(purchase.price.toString());
    totalCost += qty * price;
    totalQuantity += qty;
  }
  
  return totalQuantity > 0 ? totalCost / totalQuantity : null;
}
