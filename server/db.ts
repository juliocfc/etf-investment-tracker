import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
export { eq, and, desc };
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { InsertUser, users, portfolios, accounts, etfHoldings, purchases, priceHistory, balanceHistory, dividendHistory, cashBalance, cashBalanceHistory, assetPrices, importedTransactions, brokerageTransactions, brokerageSyncs, brokerageHoldings } from "../drizzle/schema";
export { brokerageSyncs };

let _db: any = null;

export async function upsertBrokerageHoldings(userId: number, positions: any[]) {
  const db = await getDb();

  return db.transaction(async (tx: any) => {
    // First, we might want to clear old holdings for these accounts to ensure 
    // that positions no longer held are removed.
    const accountIds = Array.from(new Set(positions.map(p => p.account?.id).filter(Boolean)));

    if (accountIds.length > 0) {
      for (const accId of accountIds) {
        await tx.delete(brokerageHoldings)
          .where(and(
            eq(brokerageHoldings.userId, userId),
            eq(brokerageHoldings.accountId, accId)
          ));
      }
    }

    for (const pos of positions) {
      const symbolStr = JSON.stringify(pos.symbol);
      const accountId = pos.account?.id || "unknown";

      await tx.insert(brokerageHoldings).values({
        userId,
        accountId,
        accountName: pos.account?.name,
        accountNumber: pos.account?.number,
        symbol: symbolStr,
        units: pos.units?.toString(),
        price: pos.price?.toString(),
        averagePurchasePrice: pos.average_purchase_price?.toString(),
        currency: pos.symbol?.currency?.code,
        rawResponse: JSON.stringify(pos),
        updatedAt: new Date(),
        createdAt: new Date(),
      });
    }
  });
}

export async function getBrokerageHoldings(userId: number, accountId?: string) {
  const db = await getDb();
  let conditions = [eq(brokerageHoldings.userId, userId)];
  if (accountId && accountId !== "all") {
    conditions.push(eq(brokerageHoldings.accountId, accountId));
  }

  return db.select()
    .from(brokerageHoldings)
    .where(and(...conditions))
    .orderBy(brokerageHoldings.accountId);
}

export async function updateLastHoldingsSync(userId: number) {
  const db = await getDb();
  const existing = await getLastBrokerageSync(userId);

  if (existing) {
    return db.update(brokerageSyncs)
      .set({ lastHoldingsSyncAt: new Date() })
      .where(eq(brokerageSyncs.id, existing.id));
  } else {
    return db.insert(brokerageSyncs).values({
      userId,
      lastSyncAt: new Date(0), // Transaction sync never happened
      lastHoldingsSyncAt: new Date(),
    });
  }
}


export async function upsertBrokerageTransactions(userId: number, activities: any[]) {
  const db = await getDb();

  return db.transaction(async (tx: any) => {
    for (const activity of activities) {
      const externalId = activity.id;
      if (!externalId) continue;

      const existing = await tx.select()
        .from(brokerageTransactions)
        .where(eq(brokerageTransactions.externalId, externalId))
        .limit(1)
        .then((rows: any[]) => rows[0]);

      const data = {
        userId,
        externalId,
        accountId: activity.account?.id || "unknown",
        type: typeof activity.type === 'string' ? activity.type : activity.type?.name,
        description: activity.description,
        symbol: JSON.stringify(activity.symbol),
        units: activity.units?.toString(),
        price: activity.price?.toString(),
        amount: activity.amount?.toString(),
        currency: activity.currency?.code,
        tradeDate: activity.trade_date ? new Date(activity.trade_date) : null,
        settlementDate: activity.settlement_date ? new Date(activity.settlement_date) : null,
        rawResponse: JSON.stringify(activity),
        updatedAt: new Date(),
      };

      if (existing) {
        await tx.update(brokerageTransactions)
          .set(data)
          .where(eq(brokerageTransactions.id, existing.id));
      } else {
        await tx.insert(brokerageTransactions).values({
          ...data,
          createdAt: new Date(),
        });
      }
    }
  });
}

export async function getBrokerageTransactions(userId: number, startDate?: Date, endDate?: Date, accountIds?: string[]) {
  const db = await getDb();
  let conditions = [eq(brokerageTransactions.userId, userId)];

  if (startDate) conditions.push(gte(brokerageTransactions.tradeDate, startDate));
  if (endDate) conditions.push(lte(brokerageTransactions.tradeDate, endDate));
  if (accountIds && accountIds.length > 0) {
    // Note: accountIds filter is handled in app logic or we could add in(...) here
  }

  return db.select()
    .from(brokerageTransactions)
    .where(and(...conditions))
    .orderBy(desc(brokerageTransactions.tradeDate));
}

export async function getLastBrokerageSync(userId: number) {
  const db = await getDb();
  return db.select()
    .from(brokerageSyncs)
    .where(eq(brokerageSyncs.userId, userId))
    .limit(1)
    .then((rows: any[]) => rows[0]);
}

export async function updateLastBrokerageSync(userId: number) {
  const db = await getDb();
  const existing = await getLastBrokerageSync(userId);

  if (existing) {
    return db.update(brokerageSyncs)
      .set({ lastSyncAt: new Date() })
      .where(eq(brokerageSyncs.id, existing.id));
  } else {
    return db.insert(brokerageSyncs).values({
      userId,
      lastSyncAt: new Date(),
    });
  }
}

export async function markBrokerageTransactionImported(externalId: string, userId: number) {
  const db = await getDb();
  return db.update(brokerageTransactions)
    .set({ importDate: new Date() })
    .where(and(
      eq(brokerageTransactions.externalId, externalId),
      eq(brokerageTransactions.userId, userId)
    ));
}


// Asset Price queries
export async function addAssetPrice(symbol: string, price: string, date: Date) {
  const db = await getDb();
  const dateOnly = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const sym = symbol.toUpperCase();

  // Check if it already exists
  const existing = await getAssetPriceByDate(sym, dateOnly);
  
  if (existing) {
    return db.update(assetPrices)
      .set({ price, createdAt: new Date() })
      .where(and(
        eq(assetPrices.symbol, sym),
        eq(assetPrices.date, dateOnly)
      ));
  } else {
    return db.insert(assetPrices).values({ 
      symbol: sym, 
      price, 
      date: dateOnly 
    });
  }
}

export async function bulkAddAssetPrices(prices: Array<{ symbol: string, price: string, date: Date }>) {
  const db = await getDb();
  
  // Use a transaction for bulk operations in SQLite for MUCH better performance
  return db.transaction(async (tx: any) => {
    for (const p of prices) {
      const dateOnly = new Date(Date.UTC(p.date.getFullYear(), p.date.getMonth(), p.date.getDate()));
      const sym = p.symbol.toUpperCase();
      
      // We still check for existence to avoid unique constraint errors if using raw insert
      // or we can use onConflictDoUpdate if we can get it to work.
      // But in a transaction, individual selects are much faster.
      const rows = await tx.select()
        .from(assetPrices)
        .where(and(
          eq(assetPrices.symbol, sym),
          eq(assetPrices.date, dateOnly)
        ))
        .limit(1);
      
      const existing = rows[0];

      if (existing) {
        if (existing.price !== p.price) {
          await tx.update(assetPrices)
            .set({ price: p.price, createdAt: new Date() })
            .where(eq(assetPrices.id, existing.id));
        }
      } else {
        await tx.insert(assetPrices).values({ 
          symbol: sym, 
          price: p.price, 
          date: dateOnly 
        });
      }
    }
  });
}

export async function getAssetPricesInRange(symbol: string, startDate: Date, endDate: Date) {
  const db = await getDb();
  const startOnly = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
  const endOnly = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));

  return db.select()
    .from(assetPrices)
    .where(and(
      eq(assetPrices.symbol, symbol.toUpperCase()),
      gte(assetPrices.date, startOnly),
      lte(assetPrices.date, endOnly)
    ))
    .orderBy(assetPrices.date);
}

export async function getAssetPriceByDate(symbol: string, date: Date) {
  const db = await getDb();
  const dateOnly = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  return db.select()
    .from(assetPrices)
    .where(and(
      eq(assetPrices.symbol, symbol.toUpperCase()),
      eq(assetPrices.date, dateOnly)
    ))
    .limit(1)
    .then((rows: any[]) => rows[0]);
}


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
  const updateData: any = {
    name: user.name,
    email: user.email,
    lastSignedIn: user.lastSignedIn,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };

  return db
    .insert(users)
    .values(user)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateData,
    });
}

export async function updateRetirementSettings(userId: number, settings: {
  withdrawalRate?: string,
  returnRate?: string,
  inflationRate?: string,
  startDate?: Date,
  birthDate?: Date,
  ssAmount?: string,
  ssAge?: string
}) {
  const db = await getDb();
  const updateData: any = {
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };

  if (settings.withdrawalRate !== undefined) updateData.retirementWithdrawalRate = settings.withdrawalRate;
  if (settings.returnRate !== undefined) updateData.retirementReturnRate = settings.returnRate;
  if (settings.inflationRate !== undefined) updateData.retirementInflationRate = settings.inflationRate;
  if (settings.startDate !== undefined) updateData.retirementStartDate = settings.startDate;
  if (settings.birthDate !== undefined) updateData.userBirthDate = settings.birthDate;
  if (settings.ssAmount !== undefined) updateData.ssAmount = settings.ssAmount;
  if (settings.ssAge !== undefined) updateData.ssAge = settings.ssAge;

  return db.update(users)
    .set(updateData)
    .where(eq(users.id, userId));
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
    accountType: data.accountType || "Brokerage",
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
  // Delete related records first
  await db.delete(cashBalance).where(eq(cashBalance.accountId, id));
  await db.delete(cashBalanceHistory).where(eq(cashBalanceHistory.accountId, id));
  // Also delete purchases associated with this account
  await db.delete(purchases).where(eq(purchases.accountId, id));
  // Delete the account itself
  return db.delete(accounts).where(eq(accounts.id, id));
}

export async function updateAccount(id: number, data: any) {
  const db = await getDb();
  return db.update(accounts).set(data).where(eq(accounts.id, id));
}

// ETF Holdings queries
export async function getUserEtfHoldings(userId: number, portfolioId?: number, accountId?: number) {
  const db = await getDb();
  let conditions = [
    eq(etfHoldings.userId, userId),
  ];
  if (portfolioId) {
    conditions.push(eq(etfHoldings.portfolioId, portfolioId));
  }
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
  return db.select().from(purchases)
    .where(eq(purchases.holdingId, holdingId))
    .orderBy(desc(sql`COALESCE(${purchases.soldDate}, ${purchases.purchaseDate})`));
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

/**
 * Recalculates all running balances for an account based on its transaction history.
 * Maintains consistency across all historical records and updates the current cash balance.
 */
export async function recalculateCashBalances(userId: number, portfolioId: number, accountId: number) {
  const db = await getDb();

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

  // Update current cashBalance table with the final resulting balance
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

  return currentRunningBalance;
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
    amount, // Placeholder
    transactionType: transactionDetails?.type || "adjustment",
    transactionAmount: transactionDetails?.transactionAmount || amount,
    description: transactionDetails?.description || "",
    date: date 
  }).returning({ id: cashBalanceHistory.id });

  const historyId = historyResult[0]?.id;

  // 2. Recalculate
  await recalculateCashBalances(userId, portfolioId, accountId);

  return { success: true, historyId };
}
export async function getCashBalanceHistory(userId: number, portfolioId?: number, accountId?: number) {
  const db = await getDb();
  const conditions = [
    eq(cashBalanceHistory.userId, userId),
  ];
  
  if (portfolioId !== undefined) {
    conditions.push(eq(cashBalanceHistory.portfolioId, portfolioId));
  }

  if (accountId !== undefined) {
    conditions.push(eq(cashBalanceHistory.accountId, accountId));
  }

  return db.select()
    .from(cashBalanceHistory)
    .where(and(...conditions))
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
    
    currentBalance = truncateNumber(currentBalance);

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

export async function editCashTransaction(userId: number, portfolioId: number, accountId: number, transactionId: number, data: { amount: string, description?: string }) {
  const db = await getDb();
  
  // 1. Update the record
  await db.update(cashBalanceHistory)
    .set({ 
      transactionAmount: data.amount,
      description: data.description !== undefined ? data.description : sql`description`
    })
    .where(and(
      eq(cashBalanceHistory.id, transactionId),
      eq(cashBalanceHistory.userId, userId)
    ));
  
  // 2. Recalculate all subsequent balances for this specific account
  const accountHistory = await db.select()
    .from(cashBalanceHistory)
    .where(and(
      eq(cashBalanceHistory.userId, userId),
      eq(cashBalanceHistory.accountId, accountId)
    ))
    .orderBy(cashBalanceHistory.date, cashBalanceHistory.id);
  
  let currentBalance = 0;
  for (const record of accountHistory) {
    const transAmount = parseFloat(record.transactionAmount || record.amount);
    if (record.transactionType === "deposit") {
      currentBalance += transAmount;
    } else if (record.transactionType === "withdrawal") {
      currentBalance -= transAmount;
    } else {
      currentBalance = transAmount;
    }
    
    currentBalance = truncateNumber(currentBalance);

    await db.update(cashBalanceHistory)
      .set({ amount: currentBalance.toString() })
      .where(eq(cashBalanceHistory.id, record.id));
  }
  
  // 3. Update the main cashBalance table
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
  const lines = csvContent.split(/\r?\n/);
  const records = [];

  let startIndex = 0;
  if (lines.length > 0 && lines[0].toLowerCase().includes("date")) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV with possible quotes: "date","qty","cost"
    const parts = line.split(",").map((p) => {
      let cleaned = p.trim();
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1).trim();
      }
      return cleaned;
    });

    if (parts.length < 3) {
      records.push({
        error: `Row ${i + 1}: Invalid format (expected at least 3 columns, got ${parts.length})`,
      });
      continue;
    }

    const [dateStr, quantityStr, costStr] = parts;
    
    // More robust number parsing: remove currency symbols, commas, and other non-numeric chars
    // but keep minus sign and decimal point
    const cleanNumber = (val: string) => val.replace(/[^0-9.-]/g, "");
    
    const quantity = parseFloat(cleanNumber(quantityStr));
    const cost = parseFloat(cleanNumber(costStr));
    
    // Try to handle various date formats
    let date = new Date(dateStr);
    
    // Fallback for DD/MM/YYYY or DD-MM-YYYY
    if (isNaN(date.getTime()) && dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        // Assume DD/MM/YYYY and try to convert to YYYY-MM-DD
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        date = new Date(`${y}-${m}-${d}`);
      }
    }

    const errors = [];
    if (isNaN(date.getTime())) errors.push(`Invalid date: "${dateStr}"`);
    if (isNaN(quantity)) errors.push(`Invalid quantity: "${quantityStr}"`);
    if (isNaN(cost)) errors.push(`Invalid cost: "${costStr}"`);

    if (errors.length > 0) {
      records.push({
        error: `Row ${i + 1}: ${errors.join(", ")}`,
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
  const allPurchases = await db.select().from(purchases).where(and(eq(purchases.holdingId, holdingId), eq(purchases.isSold, false))).orderBy(desc(purchases.purchaseDate));

  if (allPurchases.length === 0) {
    // Check if there are ANY purchases at all (even sold ones)
    const hasAnyPurchases = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.holdingId, holdingId)).limit(1).then((rows: any[]) => rows.length > 0);
    
    if (hasAnyPurchases) {
      // Asset is fully sold, keep the holding but set quantity to 0
      await db
        .update(etfHoldings)
        .set({
          quantity: "0",
        })
        .where(eq(etfHoldings.id, holdingId));
      return "0";
    } else {
      // No purchases at all, delete the holding
      await deleteEtfHolding(holdingId);
      return "0";
    }
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

  await db
    .update(etfHoldings)
    .set({
      purchasePrice: avgCost,
      quantity: totalQtyStr,
    })
    .where(eq(etfHoldings.id, holdingId));

  return avgCost;
}

// Import tracking queries
export async function getImportedTransactionIds(userId: number, source: string) {
  const db = await getDb();
  
  // Get from legacy table
  const legacyIds = await db.select({ externalId: importedTransactions.externalId })
    .from(importedTransactions)
    .where(and(
      eq(importedTransactions.userId, userId),
      eq(importedTransactions.source, source)
    ))
    .then((rows: any[]) => rows.map(r => r.externalId));

  // Get from new brokerageTransactions table (where importDate is not null)
  const newIds = await db.select({ externalId: brokerageTransactions.externalId })
    .from(brokerageTransactions)
    .where(and(
      eq(brokerageTransactions.userId, userId),
      sql`${brokerageTransactions.importDate} IS NOT NULL`
    ))
    .then((rows: any[]) => rows.map(r => r.externalId));

  return new Set([...legacyIds, ...newIds]);
}

export async function markTransactionsAsImported(userId: number, externalIds: string[], source: string) {
  const db = await getDb();
  if (externalIds.length === 0) return;
  
  for (const id of externalIds) {
    // Update brokerageTransactions table
    await markBrokerageTransactionImported(id, userId);
  }
}

/**
 * Truncates a number to a fixed number of decimal places without rounding up.
 * Uses a tiny epsilon to handle floating-point precision issues.
 */
export function truncateNumber(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  const epsilon = 1e-9;
  return value < 0 
    ? Math.ceil(value * factor - epsilon) / factor 
    : Math.floor(value * factor + epsilon) / factor;
}
