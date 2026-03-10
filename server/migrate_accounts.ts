import { getDb } from "./db";
import { etfHoldings, purchases, cashBalance, accounts, portfolios } from "../drizzle/schema";
import { sql, isNull, eq, and, desc } from "drizzle-orm";

async function migrate() {
  const db = await getDb();

  console.log("Starting migration of records with NULL accountId...");

  // 1. Find all portfolioIds that have records with NULL accountId
  const holdingsWithNull = await db.select({ portfolioId: etfHoldings.portfolioId }).from(etfHoldings).where(isNull(etfHoldings.accountId));
  const purchasesWithNull = await db.select({ portfolioId: purchases.portfolioId }).from(purchases).where(isNull(purchases.accountId));
  const cashWithNull = await db.select({ portfolioId: cashBalance.portfolioId }).from(cashBalance).where(isNull(cashBalance.accountId));

  const portfolioIds = new Set<number>();
  holdingsWithNull.forEach((h: any) => portfolioIds.add(h.portfolioId));
  purchasesWithNull.forEach((p: any) => portfolioIds.add(p.portfolioId));
  cashWithNull.forEach((c: any) => portfolioIds.add(c.portfolioId));

  console.log(`Portfolios with NULL accountId records: ${Array.from(portfolioIds).join(", ")}`);

  for (const portfolioId of portfolioIds) {
    const portfolio = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).then((rows: any[]) => rows[0]);
    if (!portfolio) {
      console.warn(`Portfolio ${portfolioId} not found, skipping...`);
      continue;
    }

    console.log(`Processing Portfolio: ${portfolio.name} (ID: ${portfolioId}, User: ${portfolio.userId})`);

    // Check if "Default Account" exists
    let account = await db.select().from(accounts).where(
      and(
        eq(accounts.portfolioId, portfolioId),
        eq(accounts.name, "Default Account")
      )
    ).then((rows: any[]) => rows[0]);

    if (!account) {
      // Check if "Primary Account" already exists (maybe from a previous interrupted run or it just exists)
      account = await db.select().from(accounts).where(
        and(
          eq(accounts.portfolioId, portfolioId),
          eq(accounts.name, "Primary Account")
        )
      ).then((rows: any[]) => rows[0]);
      
      if (!account) {
        console.log(`  "Default Account" not found. Creating "Primary Account"...`);
        await db.insert(accounts).values({
          userId: portfolio.userId,
          portfolioId: portfolioId,
          name: "Primary Account",
        });
        
        account = await db.select().from(accounts).where(
          and(
            eq(accounts.portfolioId, portfolioId),
            eq(accounts.name, "Primary Account")
          )
        ).orderBy(desc(accounts.id)).limit(1).then((rows: any[]) => rows[0]);
      } else {
        console.log(`  "Primary Account" already exists (ID: ${account.id}).`);
      }
    } else {
      console.log(`  "Default Account" exists (ID: ${account.id}).`);
    }

    const accountId = account.id;
    console.log(`  Using account ID: ${accountId}`);

    // Update records
    const hResult = await db.update(etfHoldings)
      .set({ accountId })
      .where(and(eq(etfHoldings.portfolioId, portfolioId), isNull(etfHoldings.accountId)));
    console.log(`  Updated etfHoldings.`);

    const pResult = await db.update(purchases)
      .set({ accountId })
      .where(and(eq(purchases.portfolioId, portfolioId), isNull(purchases.accountId)));
    console.log(`  Updated purchases.`);

    const cResult = await db.update(cashBalance)
      .set({ accountId })
      .where(and(eq(cashBalance.portfolioId, portfolioId), isNull(cashBalance.accountId)));
    console.log(`  Updated cashBalance.`);
  }

  // 2. Verification
  console.log("\nVerifying that NO records remain with NULL accountId...");
  
  const hNullCount = await db.select({ count: sql`count(*)` }).from(etfHoldings).where(isNull(etfHoldings.accountId)).then((rows: any[]) => rows[0].count);
  const pNullCount = await db.select({ count: sql`count(*)` }).from(purchases).where(isNull(purchases.accountId)).then((rows: any[]) => rows[0].count);
  const cNullCount = await db.select({ count: sql`count(*)` }).from(cashBalance).where(isNull(cashBalance.accountId)).then((rows: any[]) => rows[0].count);

  console.log(`Remaining NULL accountId records:`);
  console.log(`  etfHoldings: ${hNullCount}`);
  console.log(`  purchases: ${pNullCount}`);
  console.log(`  cashBalance: ${cNullCount}`);

  if (Number(hNullCount) === 0 && Number(pNullCount) === 0 && Number(cNullCount) === 0) {
    console.log("\nMigration SUCCESSFUL!");
  } else {
    console.error("\nMigration FAILED: Some records still have NULL accountId.");
    process.exit(1);
  }
}

migrate().catch(error => {
  console.error(error);
  process.exit(1);
});
