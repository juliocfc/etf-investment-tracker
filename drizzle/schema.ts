import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(), // "user" or "admin"
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = typeof portfolios.$inferInsert;

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  name: text("name").notNull(),
  number: text("number"),
  accountType: text("accountType").default("Brokerage").notNull(), // "Retirement", "Brokerage", "Savings", "Checking", "Other"
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

export const etfHoldings = sqliteTable("etfHoldings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  accountId: integer("accountId").default(0).notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity").notNull(),
  purchasePrice: text("purchasePrice").notNull(),
  currentPrice: text("currentPrice").notNull(),
  annualDividendPerShare: text("annualDividendPerShare").default("0").notNull(),
  desiredAllocation: text("desiredAllocation").default("0").notNull(),
  purchaseDate: integer("purchaseDate", { mode: "timestamp" }).notNull(),
  lastPriceUpdate: integer("lastPriceUpdate", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  accountId: integer("accountId").default(0).notNull(),
  holdingId: integer("holdingId").notNull(),
  symbol: text("symbol").notNull(),
  quantity: text("quantity").notNull(),
  price: text("price").notNull(),
  fees: text("fees").default("0").notNull(),
  cashTransactionId: integer("cashTransactionId"),
  purchaseDate: integer("purchaseDate", { mode: "timestamp" }).notNull(),
  isSold: integer("isSold", { mode: "boolean" }).default(false),
  soldDate: integer("soldDate", { mode: "timestamp" }),
  soldPrice: text("soldPrice"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const priceHistory = sqliteTable("priceHistory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  symbol: text("symbol").notNull(),
  price: text("price").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const assetPrices = sqliteTable("assetPrices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  price: text("price").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const cashBalance = sqliteTable("cashBalance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  accountId: integer("accountId").default(0).notNull(),
  amount: text("amount").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const cashBalanceHistory = sqliteTable("cashBalanceHistory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  accountId: integer("accountId").notNull(),
  amount: text("amount").notNull(), // Resulting balance after transaction
  transactionType: text("transactionType"), // "deposit", "withdrawal", "adjustment"
  transactionAmount: text("transactionAmount"),
  description: text("description"),
  date: integer("date", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const balanceHistory = sqliteTable("balanceHistory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  totalValue: text("totalValue").notNull(),
  cashValue: text("cashValue").notNull(),
  investmentValue: text("investmentValue").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const dividendHistory = sqliteTable("dividendHistory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  symbol: text("symbol").notNull(),
  dividendPerShare: text("dividendPerShare").notNull(),
  totalDividend: text("totalDividend").notNull(),
  exDate: integer("exDate", { mode: "timestamp" }).notNull(),
  paymentDate: integer("paymentDate", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const importedTransactions = sqliteTable("importedTransactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  externalId: text("externalId").notNull(), // The ID from SnapTrade/other source
  source: text("source").notNull(), // e.g., "snaptrade"
  importDate: integer("importDate", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("external_id_source_idx").on(table.externalId, table.source),
]);

export const brokerageTransactions = sqliteTable("brokerageTransactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  externalId: text("externalId").notNull().unique(), // Activity ID from SnapTrade
  accountId: text("accountId").notNull(), // SnapTrade Account ID
  type: text("type"),
  description: text("description"),
  symbol: text("symbol"), // JSON string or identifier
  units: text("units"),
  price: text("price"),
  amount: text("amount"),
  currency: text("currency"),
  tradeDate: integer("tradeDate", { mode: "timestamp" }),
  settlementDate: integer("settlementDate", { mode: "timestamp" }),
  rawResponse: text("rawResponse").notNull(), // Full JSON from SnapTrade
  importDate: integer("importDate", { mode: "timestamp" }), // Null if not imported
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const brokerageSyncs = sqliteTable("brokerageSyncs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  lastSyncAt: integer("lastSyncAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastHoldingsSyncAt: integer("lastHoldingsSyncAt", { mode: "timestamp" }),
}, (table) => [
  uniqueIndex("user_sync_idx").on(table.userId),
]);

export const brokerageHoldings = sqliteTable("brokerageHoldings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  accountId: text("accountId").notNull(), // SnapTrade Account ID
  accountName: text("accountName"),
  accountNumber: text("accountNumber"),
  symbol: text("symbol"), // JSON string of the symbol object
  units: text("units"),
  price: text("price"),
  averagePurchasePrice: text("averagePurchasePrice"),
  currency: text("currency"),
  rawResponse: text("rawResponse").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("holdings_user_acc_sym_idx").on(table.userId, table.accountId, table.symbol),
]);

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  description: text("description").notNull(),
  amount: text("amount").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const fiSimulationAssets = sqliteTable("fiSimulationAssets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  symbol: text("symbol").notNull(),
  allocation: text("allocation").default("0").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;
export type FiSimulationAsset = typeof fiSimulationAssets.$inferSelect;
export type InsertFiSimulationAsset = typeof fiSimulationAssets.$inferInsert;
