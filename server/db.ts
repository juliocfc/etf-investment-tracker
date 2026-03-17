import { eq, and, gte, desc, sql } from "drizzle-orm";
export { eq, and, desc };
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { InsertUser, users, portfolios, accounts, etfHoldings, purchases, priceHistory, balanceHistory, dividendHistory, cashBalance, cashBalanceHistory } from "../drizzle/schema";

let _db: any = null;

export async function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL || "file:local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  console.log(`[Database] Connecting to database at: ${url.startsWith('file:') ? 'local file' : 'remote Turso'}`);
  
  const client = createClient({
    url: url,
    authToken: authToken,
  });

  _db = drizzle(client);
  return _db;
}

// User queries
export async function getUserById(id: number) {
  const db = await getDb();
  return db.select().from(users).where(eq(users.id, id)).then((rows: any[]) => rows[0]);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  return db.select().from(users).where(eq(users.openId, openId)).then((rows: any[]) => rows[0]);
}

export async function createUser(user: InsertUser) {
  const db = await getDb();
  return db.insert(users).values(user);
}

export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  return db
    .insert(users)
    .values(user)
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        name: user.name,
        email: user.email,
        lastSignedIn: user.lastSignedIn,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

// Account queries
export async function getAccounts(userId: number, portfolioId: number) {
  const db = await getDb();
  return db.select().from(accounts).where(
    and(
      eq(accounts.userId, userId),
      eq(accounts.portfolioId, portfolioId)
    )
  );
}

export async function createAccount(data: any) {
  const db = await getDb();
  // Ensure we don't pass undefined for optional fields
  const values = {
    userId: data.userId,
    portfolioId: data.portfolioId,
    name: data.name,
    number: data.number || null,
  };
  
  const result = await db.insert(accounts).values(values);
  if ((result as any).lastInsertRowid !== undefined) {
    return (result as any).lastInsertRowid;
  }
  const row = await db.select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, data.userId))
    .orderBy(desc(accounts.id))
    .limit(1)
    .then((rows: any[]) => rows[0]);
    
  return row?.id;
}

export async function deleteAccount(id: number) {
  const db = await getDb();
  return db.delete(accounts).where(eq(accounts.id, id));
}

// ETF Holdings queries
export async function getUserEtfHoldings(userId: number, portfolioId: number, accountId?: number) {
  const db = await getDb();
  let conditions = [
    eq(etfHoldings.userId, userId),
    eq(etfHoldings.portfolioId, portfolioId)
  ];
  if (accountId) {
    conditions.push(eq(etfHoldings.accountId, accountId));
  }
  return db.select().from(etfHoldings).where(and(...conditions));
}

export async function createEtfHolding(data: any) {
  const db = await getDb();
  const result = await db.insert(etfHoldings).values(data);
  
  // For Turso/LibSQL, the ID is often in result.lastInsertRowid or we need to query it
  if ((result as any).lastInsertRowid !== undefined) {
    return (result as any).lastInsertRowid;
  }
  
  // Fallback: get the most recent ID for this user
  const row = await db.select({ id: etfHoldings.id })
    .from(etfHoldings)
    .where(eq(etfHoldings.userId, data.userId))
    .orderBy(desc(etfHoldings.id))
    .limit(1)
    .then((rows: any[]) => rows[0]);
    
  return row?.id;
}

export async function updateEtfHolding(id: number, data: any) {
  const db = await getDb();
  return db.update(etfHoldings).set(data).where(eq(etfHoldings.id, id));
}

export async function updateEtfHoldingBySymbol(userId: number, symbol: string, data: any) {
  const db = await getDb();
  return db.update(etfHoldings)
    .set(data)
    .where(and(
      eq(etfHoldings.userId, userId),
      eq(etfHoldings.symbol, symbol.toUpperCase())
    ));
}

export async function deleteEtfHolding(id: number) {
  const db = await getDb();
  return db.delete(etfHoldings).where(eq(etfHoldings.id, id));
}

// Purchase queries
export async function getPurchases(holdingId: number) {
  const db = await getDb();
  return db.select().from(purchases).where(eq(purchases.holdingId, holdingId)).orderBy(desc(purchases.purchaseDate));
}

export async function addPurchase(data: any) {
  const db = await getDb();
  const result = await db.insert(purchases).values(data).returning({ id: purchases.id });
  return result[0]?.id;
}

export async function deletePurchase(purchaseId: number) {
  const db = await getDb();
  return db.delete(purchases).where(eq(purchases.id, purchaseId));
}

export async function updatePurchase(purchaseId: number, data: any) {
  const db = await getDb();
  return db.update(purchases).set(data).where(eq(purchases.id, purchaseId));
}

// Price History queries
export async function addPriceHistory(userId: number, symbol: string, price: string, date: Date) {
  const db = await getDb();
  return db.insert(priceHistory).values({ userId, symbol, price, date });
}

export async function getPriceHistory(userId: number, symbol: string, days?: number) {
  const db = await getDb();
  let conditions = [eq(priceHistory.userId, userId), eq(priceHistory.symbol, symbol)];
  
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    conditions.push(gte(priceHistory.date, startDate));
  }
  
  return db.select().from(priceHistory).where(and(...conditions)).orderBy(desc(priceHistory.date));
}

// Balance History queries
export async function addBalanceHistory(userId: number, portfolioId: number, totalValue: string, cashValue: string, investmentValue: string, date: Date) {
  const db = await getDb();
  return db.insert(balanceHistory).values({ userId, portfolioId, totalValue, cashValue, investmentValue, date });
}

export async function getBalanceHistory(userId: number, portfolioId: number, days?: number) {
  const db = await getDb();
  let conditions = [eq(balanceHistory.userId, userId), eq(balanceHistory.portfolioId, portfolioId)];
  
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    conditions.push(gte(balanceHistory.date, startDate));
  }
  
  return db.select().from(balanceHistory).where(and(...conditions)).orderBy(desc(balanceHistory.date));
}

// Dividend History queries
export async function addDividendHistory(data: any) {
  const db = await getDb();
  return db.insert(dividendHistory).values(data);
}

export async function getDividendHistory(userId: number, symbol?: string) {
  const db = await getDb();
  let conditions = [eq(dividendHistory.userId, userId)];
  
  if (symbol) {
    conditions.push(eq(dividendHistory.symbol, symbol));
  }
  
  return db.select().from(dividendHistory).where(and(...conditions)).orderBy(desc(dividendHistory.exDate));
}

// Cash Balance queries
export async function getCashBalance(userId: number, portfolioId: number, accountId?: number) {
  const db = await getDb();
  let conditions = [
    eq(cashBalance.userId, userId),
    eq(cashBalance.portfolioId, portfolioId)
  ];
  if (accountId) {
    conditions.push(eq(cashBalance.accountId, accountId));
  } else {
    // If no accountId, we might want to sum all cash balances or return the global one (where accountId is null)
    // Based on the requirement, we should probably return all and sum them if accountId is not provided
    const rows = await db.select().from(cashBalance).where(and(...conditions));
    if (rows.length === 0) return null;
    
    // Check if we have a global one (where accountId is null)
    const globalRow = rows.find((r: any) => r.accountId === null);
    if (rows.length === 1 && globalRow) return globalRow;
    
    // Sum them up for global view
    const totalAmount = rows.reduce((sum: number, row: any) => sum + parseFloat(row.amount), 0);
    return { ...(globalRow || rows[0]), amount: totalAmount.toString(), id: globalRow ? globalRow.id : 0, accountId: null };
  }
  return db.select().from(cashBalance).where(and(...conditions)).then((rows: any[]) => rows[0]);
}

export async function updateCashBalance(
  userId: number, 
  portfolioId: number, 
  amount: string, 
  accountId: number, 
  date: Date = new Date(),
  transactionDetails?: {
    type: string,
    transactionAmount: string,
    description?: string
  }
) {
  const db = await getDb();
  
  // 1. Record history
  const historyResult = await db.insert(cashBalanceHistory).values({ 
    userId, 
    portfolioId, 
    accountId, 
    amount, // This will be recalculated below anyway, but it's a good placeholder
    transactionType: transactionDetails?.type || "adjustment",
    transactionAmount: transactionDetails?.transactionAmount || amount,
    description: transactionDetails?.description || "",
    date: date 
  }).returning({ id: cashBalanceHistory.id });
  
  const historyId = historyResult[0]?.id;
  
  // 2. Recalculate ALL balances for this account from the date of this transaction onwards
  // to maintain consistency if a historical transaction was added
  const accountHistory = await db.select()
    .from(cashBalanceHistory)
    .where(and(
      eq(cashBalanceHistory.userId, userId),
      eq(cashBalanceHistory.accountId, accountId)
    ))
    .orderBy(cashBalanceHistory.date, cashBalanceHistory.id);

  let currentRunningBalance = 0;
  for (const record of accountHistory) {
    const txAmount = parseFloat(record.transactionAmount || "0");
    if (record.transactionType === "deposit") {
      currentRunningBalance += txAmount;
    } else if (record.transactionType === "withdrawal") {
      currentRunningBalance -= txAmount;
    } else if (record.transactionType === "adjustment") {
      currentRunningBalance = parseFloat(record.transactionAmount || "0");
    }
    
    // Update the record with its new resulting balance
    await db.update(cashBalanceHistory)
      .set({ amount: currentRunningBalance.toString() })
      .where(eq(cashBalanceHistory.id, record.id));
  }

  // 3. Update current cashBalance table with the final resulting balance
  const existing = await getCashBalance(userId, portfolioId, accountId);
  if (existing && existing.accountId === accountId) {
    await db.update(cashBalance)
      .set({ 
        amount: currentRunningBalance.toString(), 
        updatedAt: new Date() 
      })
      .where(eq(cashBalance.id, existing.id));
  } else {
    await db.insert(cashBalance).values({ 
      userId, 
      portfolioId, 
      amount: currentRunningBalance.toString(), 
      accountId 
    });
  }
  
  return { success: true, historyId };
}

export async function getCashBalanceHistory(userId: number, portfolioId: number) {
  const db = await getDb();
  return db.select()
    .from(cashBalanceHistory)
    .where(and(
      eq(cashBalanceHistory.userId, userId),
      eq(cashBalanceHistory.portfolioId, portfolioId)
    ))
    .orderBy(cashBalanceHistory.date);
}

export async function deleteCashTransaction(userId: number, portfolioId: number, accountId: number, transactionId: number) {
  const db = await getDb();
  
  // Check if this transaction is linked to a purchase
  const linkedPurchase = await db.select()
    .from(purchases)
    .where(and(eq(purchases.cashTransactionId, transactionId), eq(purchases.userId, userId)))
    .then((rows: any[]) => rows[0]);
    
  if (linkedPurchase) {
    throw new Error("Cannot delete cash transaction linked to a purchase. Delete the purchase instead.");
  }

  // 1. Delete the record
  await db.delete(cashBalanceHistory).where(and(
    eq(cashBalanceHistory.id, transactionId),
    eq(cashBalanceHistory.userId, userId)
  ));
  
  // 2. Recalculate all subsequent balances for this specific account
  // First, get all remaining records for this account, sorted by date
  const accountHistory = await db.select()
    .from(cashBalanceHistory)
    .where(and(
      eq(cashBalanceHistory.userId, userId),
      eq(cashBalanceHistory.accountId, accountId)
    ))
    .orderBy(cashBalanceHistory.date, cashBalanceHistory.id);
  
  // Recalculate balances starting from the first record
  let currentBalance = 0;
  for (const record of accountHistory) {
    const transAmount = parseFloat(record.transactionAmount || record.amount);
    if (record.transactionType === "deposit") {
      currentBalance += transAmount;
    } else if (record.transactionType === "withdrawal") {
      currentBalance -= transAmount;
    } else {
      // Adjustment or initial record: sets the balance
      currentBalance = transAmount;
    }
    
    // Update the record with the recalculated balance
    await db.update(cashBalanceHistory)
      .set({ amount: currentBalance.toString() })
      .where(eq(cashBalanceHistory.id, record.id));
  }
  
  // 3. Update the main cashBalance table with the final result
  const finalBalance = currentBalance.toString();
  const existing = await getCashBalance(userId, portfolioId, accountId);
  if (existing) {
    await db.update(cashBalance)
      .set({ amount: finalBalance, updatedAt: new Date() })
      .where(eq(cashBalance.id, existing.id));
  }
  
  return { success: true };
}

// CSV Parsing and Bulk Import
export function parseCSVContent(csvContent: string) {
  const lines = csvContent.split("\n");
  const records = [];

  let startIndex = 0;
  if (lines.length > 0 && lines[0].toLowerCase().includes("date")) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim().replace("$", ""));
    if (parts.length < 3) {
      records.push({
        error: `Row ${i + 1}: Invalid format (expected 3 columns)`,
      });
      continue;
    }

    const [dateStr, quantityStr, costStr] = parts;
    const quantity = parseFloat(quantityStr);
    const cost = parseFloat(costStr);
    const date = new Date(dateStr);

    if (isNaN(quantity) || isNaN(cost) || isNaN(date.getTime())) {
      records.push({
        error: `Row ${i + 1}: Invalid data types`,
      });
      continue;
    }

    records.push({
      date,
      quantity: quantity.toString(),
      cost: cost.toString(),
    });
  }

  return records;
}

export async function bulkImportPurchases(
  userId: number,
  portfolioId: number,
  holdingId: number,
  symbol: string,
  records: any[],
  accountId: number
) {
  const db = await getDb();
  let successCount = 0;
  const errors = [];

  for (const record of records) {
    try {
      await db.insert(purchases).values({
        userId,
        portfolioId,
        accountId,
        holdingId,
        symbol,
        quantity: record.quantity,
        price: record.cost,
        purchaseDate: record.date,
      });
      successCount++;
    } catch (error) {
      errors.push(`Failed to insert record: ${(error as Error).message}`);
    }
  }

  return { success: successCount, failed: records.length - successCount, errors };
}

export async function calculateAverageCost(holdingId: number) {
  const db = await getDb();
  const allPurchases = await getPurchases(holdingId);

  if (allPurchases.length === 0) {
    await deleteEtfHolding(holdingId);
    return "0";
  }

  let totalQty = 0;
  let totalCost = 0;

  for (const p of allPurchases) {
    const qty = parseFloat(p.quantity.toString());
    const price = parseFloat(p.price.toString());
    totalQty += qty;
    totalCost += qty * price;
  }

  const avgCost = totalQty > 0 ? (totalCost / totalQty).toString() : "0";
  const totalQtyStr = totalQty.toString();

  if (totalQty === 0) {
    await deleteEtfHolding(holdingId);
  } else {
    await db
      .update(etfHoldings)
      .set({
        purchasePrice: avgCost,
        quantity: totalQtyStr,
      })
      .where(eq(etfHoldings.id, holdingId));
  }

  return avgCost;
}
