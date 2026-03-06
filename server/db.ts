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

    assignNullable("name");
    assignNullable("email");
    assignNullable("loginMethod");

    // Always update lastSignedIn if provided
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    // Only perform update if there are fields to update
    if (Object.keys(updateSet).length > 0) {
      await db
        .insert(users)
        .values(values)
        .onDuplicateKeyUpdate({ set: updateSet });
    } else {
      // If no fields to update, just insert (will be ignored if exists)
      await db.insert(users).values(values).onDuplicateKeyUpdate({ set: {} });
    }
  } catch (error) {
    console.error("[Database] Upsert failed:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot query user: database not available");
    return null;
  }

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Query failed:", error);
    return null;
  }
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

export async function getPriceHistory(userId: number, symbol: string, days?: number) {
  const db = await getDb();
  if (!db) return [];
  const { priceHistory } = await import("../drizzle/schema");
  
  const conditions = [eq(priceHistory.userId, userId), eq(priceHistory.symbol, symbol)];
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    conditions.push(gte(priceHistory.date, startDate));
  }
  
  return db.select().from(priceHistory).where(and(...conditions)).orderBy(desc(priceHistory.date));
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
    await db.update(cashBalance).set({ amount }).where(eq(cashBalance.userId, userId));
  } else {
    await db.insert(cashBalance).values({ userId, amount });
  }
  
  return getCashBalance(userId);
}

// Balance History queries
export async function addBalanceHistory(userId: number, totalValue: string, cashValue: string, investmentValue: string, date: Date) {
  const db = await getDb();
  if (!db) return null;
  const { balanceHistory } = await import("../drizzle/schema");
  return db.insert(balanceHistory).values({ userId, totalValue, cashValue, investmentValue, date });
}

export async function getBalanceHistory(userId: number, days?: number) {
  const db = await getDb();
  if (!db) return [];
  const { balanceHistory } = await import("../drizzle/schema");
  
  const conditions = [eq(balanceHistory.userId, userId)];
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    conditions.push(gte(balanceHistory.date, startDate));
  }
  
  return db.select().from(balanceHistory).where(and(...conditions)).orderBy(desc(balanceHistory.date));
}

// Dividend History queries
export async function getDividendHistory(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) return [];
  const { dividendHistory } = await import("../drizzle/schema");
  return db.select().from(dividendHistory).where(and(eq(dividendHistory.userId, userId), eq(dividendHistory.symbol, symbol))).orderBy(desc(dividendHistory.exDate));
}

export async function addDividendHistory(userId: number, symbol: string, dividendPerShare: string, exDate: Date, paymentDate?: Date, totalDividend?: string) {
  const db = await getDb();
  if (!db) return null;
  const { dividendHistory } = await import("../drizzle/schema");
  return db.insert(dividendHistory).values({ userId, symbol, dividendPerShare, exDate, paymentDate, totalDividend });
}

// Purchase queries
export async function addPurchase(userId: number, holdingId: number, symbol: string, quantity: string, price: string, purchaseDate: Date) {
  const db = await getDb();
  if (!db) return null;
  const { purchases } = await import("../drizzle/schema");
  await db.insert(purchases).values({ userId, holdingId, symbol, quantity, price, purchaseDate });
  const insertedPurchase = await db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.id)).limit(1);
  return insertedPurchase[0];
}

export async function getPurchases(holdingId: number) {
  const db = await getDb();
  if (!db) return [];
  const { purchases } = await import("../drizzle/schema");
  return db.select().from(purchases).where(eq(purchases.holdingId, holdingId)).orderBy(desc(purchases.purchaseDate));
}

export async function calculateAverageCost(holdingId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const { purchases } = await import("../drizzle/schema");
  
  const purchaseList = await db.select().from(purchases).where(eq(purchases.holdingId, holdingId));
  
  if (purchaseList.length === 0) return null;
  
  let totalCost = 0;
  let totalQuantity = 0;
  
  for (const purchase of purchaseList) {
    const quantity = parseFloat(purchase.quantity.toString());
    const price = parseFloat(purchase.price.toString());
    totalCost += quantity * price;
    totalQuantity += quantity;
  }
  
  return totalQuantity > 0 ? totalCost / totalQuantity : null;
}

export async function deletePurchase(purchaseId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { purchases, etfHoldings } = await import("../drizzle/schema");
  
  // Get the purchase details
  const purchaseResult = await db.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
  const purchase = purchaseResult.length > 0 ? purchaseResult[0] : null;
  
  if (!purchase) return null;
  
  // Delete the purchase
  await db.delete(purchases).where(eq(purchases.id, purchaseId));
  
  // Get the holding
  const holdingResult = await db.select().from(etfHoldings).where(eq(etfHoldings.id, purchase.holdingId)).limit(1);
  const holding = holdingResult.length > 0 ? holdingResult[0] : null;
  
  if (holding) {
    const currentQty = parseFloat(holding.quantity.toString());
    const purchaseQty = parseFloat(purchase.quantity.toString());
    const newQuantity = currentQty - purchaseQty;
    
    if (newQuantity <= 0) {
      // Delete holding if quantity becomes 0 or negative
      await db.delete(etfHoldings).where(eq(etfHoldings.id, holding.id));
    } else {
      // Update holding with new quantity
      await db.update(etfHoldings)
        .set({ quantity: newQuantity.toString() })
        .where(eq(etfHoldings.id, holding.id));
    }
  }
  
  return purchase;
}


// CSV Import helper
export interface ParsedPurchaseRecord {
  date: Date;
  quantity: string;
  cost: string;
  error?: string;
}

export function parseCSVContent(csvContent: string): ParsedPurchaseRecord[] {
  const lines = csvContent.trim().split('\n');
  const records: ParsedPurchaseRecord[] = [];

  // Skip header if present
  let startIndex = 0;
  if (lines.length > 0 && lines[0].toLowerCase().includes('date')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const parts = line.split(',').map(p => p.trim());
    
    if (parts.length < 3) {
      records.push({
        date: new Date(),
        quantity: '',
        cost: '',
        error: `Row ${i + 1}: Expected 3 columns (date, quantity, cost), got ${parts.length}`,
      });
      continue;
    }

    const dateStr = parts[0];
    const quantityStr = parts[1];
    const costStr = parts[2].replace('$', '').trim();

    // Parse date - support multiple formats
    let parsedDate: Date | null = null;
    const dateFormats = [
      /^(\w+)-(\d{1,2})-(\d{4})$/, // Dec-24-2025
      /^(\d{1,2})-(\w+)-(\d{4})$/, // 24-Dec-2025
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // 2025-12-24
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // 12/24/2025
    ];

    for (const format of dateFormats) {
      const match = dateStr.match(format);
      if (match) {
        try {
          // Try to parse the date
          const testDate = new Date(dateStr);
          if (!isNaN(testDate.getTime())) {
            parsedDate = testDate;
            break;
          }
        } catch (e) {
          // Continue to next format
        }
      }
    }

    // Validate quantity
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
      records.push({
        date: parsedDate || new Date(),
        quantity: quantityStr,
        cost: costStr,
        error: `Row ${i + 1}: Invalid quantity "${quantityStr}" - must be a positive number`,
      });
      continue;
    }

    // Validate cost
    const cost = parseFloat(costStr);
    if (isNaN(cost) || cost < 0) {
      records.push({
        date: parsedDate || new Date(),
        quantity: quantityStr,
        cost: costStr,
        error: `Row ${i + 1}: Invalid cost "${costStr}" - must be a non-negative number`,
      });
      continue;
    }

    // Validate date
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      records.push({
        date: new Date(),
        quantity: quantityStr,
        cost: costStr,
        error: `Row ${i + 1}: Invalid date format "${dateStr}" - use formats like Dec-24-2025, 2025-12-24, or 12/24/2025`,
      });
      continue;
    }

    records.push({
      date: parsedDate,
      quantity: quantity.toString(),
      cost: cost.toString(),
    });
  }

  return records;
}

export async function bulkImportPurchases(
  userId: number,
  holdingId: number,
  symbol: string,
  records: ParsedPurchaseRecord[]
) {
  const db = await getDb();
  if (!db) return { success: 0, failed: 0, errors: [] };

  const { purchases, etfHoldings } = await import("../drizzle/schema");
  const errors: string[] = [];
  let successCount = 0;
  let totalQuantity = 0;

  try {
    // Add all valid purchases
    for (const record of records) {
      if (record.error) {
        errors.push(record.error);
        continue;
      }

      try {
        await db.insert(purchases).values({
          userId,
          holdingId,
          symbol,
          quantity: record.quantity,
          price: record.cost,
          purchaseDate: record.date,
        });

        successCount++;
        totalQuantity += parseFloat(record.quantity);
      } catch (e) {
        errors.push(`Failed to import record: ${record.date.toLocaleDateString()} - ${(e as Error).message}`);
      }
    }

    // Update holding quantity
    if (successCount > 0) {
      const holding = await db.select().from(etfHoldings).where(eq(etfHoldings.id, holdingId)).limit(1);
      if (holding.length > 0) {
        const currentQty = parseFloat(holding[0].quantity.toString());
        const newQty = currentQty + totalQuantity;
        await db.update(etfHoldings)
          .set({ quantity: newQty.toString() })
          .where(eq(etfHoldings.id, holdingId));
      }
    }

    return { success: successCount, failed: errors.length, errors };
  } catch (error) {
    return {
      success: 0,
      failed: records.length,
      errors: [`Bulk import failed: ${(error as Error).message}`],
    };
  }
}
