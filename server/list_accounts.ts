import { getDb } from "./db";
import { accounts, portfolios } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

async function listAccounts() {
  const db = await getDb();
  const portfolioIds = [1, 2, 4, 5, 6, 7];

  for (const pid of portfolioIds) {
    console.log(`Portfolio ID: ${pid}`);
    const accs = await db.select().from(accounts).where(eq(accounts.portfolioId, pid));
    if (accs.length === 0) {
      console.log("  No accounts found.");
    } else {
      accs.forEach((a: any) => {
        console.log(`  Account ID: ${a.id}, Name: ${a.name}`);
      });
    }
  }
}

listAccounts().catch(console.error);
