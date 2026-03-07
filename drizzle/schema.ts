import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

export const etfHoldings = sqliteTable("etfHoldings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity").notNull(),
  purchasePrice: text("purchasePrice").notNull(),
  currentPrice: text("currentPrice").notNull(),
  purchaseDate: integer("purchaseDate", { mode: "timestamp" }).notNull(),
  lastPriceUpdate: integer("lastPriceUpdate", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  holdingId: integer("holdingId").notNull(),
  symbol: text("symbol").notNull(),
  quantity: text("quantity").notNull(),
  price: text("price").notNull(),
  purchaseDate: integer("purchaseDate", { mode: "timestamp" }).notNull(),
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

export const cashBalance = sqliteTable("cashBalance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  portfolioId: integer("portfolioId").notNull(),
  amount: text("amount").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
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
