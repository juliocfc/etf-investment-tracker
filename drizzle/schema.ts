import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, index, foreignKey } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ETF Holdings table
export const etfHoldings = mysqlTable(
  "etf_holdings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    quantity: decimal("quantity", { precision: 18, scale: 8 }).notNull(),
    purchasePrice: decimal("purchasePrice", { precision: 18, scale: 8 }).notNull(),
    purchaseDate: timestamp("purchaseDate").notNull(),
    currentPrice: decimal("currentPrice", { precision: 18, scale: 8 }),
    lastPriceUpdate: timestamp("lastPriceUpdate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ([
    index("idx_userId").on(table.userId),
    index("idx_symbol").on(table.symbol),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ])
);

export type EtfHolding = typeof etfHoldings.$inferSelect;
export type InsertEtfHolding = typeof etfHoldings.$inferInsert;

// Price History table
export const priceHistory = mysqlTable(
  "price_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    price: decimal("price", { precision: 18, scale: 8 }).notNull(),
    date: timestamp("date").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ([
    index("idx_userId_symbol_date").on(table.userId, table.symbol, table.date),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ])
);

export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;

// Dividend History table
export const dividendHistory = mysqlTable(
  "dividend_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    dividendPerShare: decimal("dividendPerShare", { precision: 18, scale: 8 }).notNull(),
    exDate: timestamp("exDate").notNull(),
    paymentDate: timestamp("paymentDate"),
    totalDividend: decimal("totalDividend", { precision: 18, scale: 8 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ([
    index("idx_userId_symbol").on(table.userId, table.symbol),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ])
);

export type DividendHistory = typeof dividendHistory.$inferSelect;
export type InsertDividendHistory = typeof dividendHistory.$inferInsert;

// Cash Balance table
export const cashBalance = mysqlTable(
  "cash_balance",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    amount: decimal("amount", { precision: 18, scale: 8 }).notNull().default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ([
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ])
);

export type CashBalance = typeof cashBalance.$inferSelect;
export type InsertCashBalance = typeof cashBalance.$inferInsert;

// Balance History table (for tracking portfolio balance over time)
export const balanceHistory = mysqlTable(
  "balance_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    totalValue: decimal("totalValue", { precision: 18, scale: 8 }).notNull(),
    cashValue: decimal("cashValue", { precision: 18, scale: 8 }).notNull(),
    investmentValue: decimal("investmentValue", { precision: 18, scale: 8 }).notNull(),
    date: timestamp("date").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ([
    index("idx_userId_date").on(table.userId, table.date),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ])
);

export type BalanceHistory = typeof balanceHistory.$inferSelect;
export type InsertBalanceHistory = typeof balanceHistory.$inferInsert;

// Purchases table (tracks individual buy transactions for average cost calculation)
export const purchases = mysqlTable(
  "purchases",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    holdingId: int("holdingId").notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    quantity: decimal("quantity", { precision: 18, scale: 8 }).notNull(),
    price: decimal("price", { precision: 18, scale: 8 }).notNull(),
    purchaseDate: timestamp("purchaseDate").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ([
    index("idx_userId_holdingId").on(table.userId, table.holdingId),
    index("idx_symbol").on(table.symbol),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.holdingId],
      foreignColumns: [etfHoldings.id],
    }).onDelete("cascade"),
  ])
);

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;