import { getDb } from "./db";
import { etfHoldings, purchases, cashBalance, accounts, portfolios } from "../drizzle/schema";
import { sql, isNull, eq, and } from "drizzle-orm";

async function checkNullAccounts() {
  const db = await getDb();

  console.log("Checking for records with NULL accountId...");

  const holdingsWithNull = await db.select({ portfolioId: etfHoldings.portfolioId }).from(etfHoldings).where(isNull(etfHoldings.accountId));
  const purchasesWithNull = await db.select({ portfolioId: purchases.portfolioId }).from(purchases).where(isNull(purchases.accountId));
  const cashWithNull = await db.select({ portfolioId: cashBalance.portfolioId }).from(cashBalance).where(isNull(cashBalance.accountId));

  const portfolioIds = new Set<number>();
  holdingsWithNull.forEach((h: any) => portfolioIds.add(h.portfolioId));
  purchasesWithNull.forEach((p: any) => portfolioIds.add(p.portfolioId));
  cashWithNull.forEach((c: any) => portfolioIds.add(c.portfolioId));

  console.log(`Portfolios with NULL accountId: ${Array.from(portfolioIds).join(", ")}`);

  for (const portfolioId of portfolioIds) {
    const portfolio = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).then((rows: any[]) => rows[0]);
    if (portfolio) {
      console.log(`Portfolio ID: ${portfolioId}, User ID: ${portfolio.userId}, Name: ${portfolio.name}`);
      
      const holdingsCount = await db.select({ count: sql`count(*)` }).from(etfHoldings).where(and(eq(etfHoldings.portfolioId, portfolioId), isNull(etfHoldings.accountId))).then((rows: any[]) => rows[0].count);
      const purchasesCount = await db.select({ count: sql`count(*)` }).from(purchases).where(and(eq(purchases.portfolioId, portfolioId), isNull(purchases.accountId))).then((rows: any[]) => rows[0].count);
      const cashCount = await db.select({ count: sql`count(*)` }).from(cashBalance).where(and(eq(cashBalance.portfolioId, portfolioId), isNull(cashBalance.accountId))).then((rows: any[]) => rows[0].count);
      
      console.log(`  NULL accountId records: Holdings: ${holdingsCount}, Purchases: ${purchasesCount}, Cash: ${cashCount}`);
    } else {
      console.log(`Portfolio ID: ${portfolioId} NOT FOUND!`);
    }
  }
}

checkNullAccounts().catch(console.error);
