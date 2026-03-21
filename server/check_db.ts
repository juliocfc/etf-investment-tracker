
import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function check() {
  try {
    const db = await getDb();
    console.log("Checking purchases table schema...");
    const result = await db.run(sql`PRAGMA table_info(purchases)`);
    console.log("Table info:", JSON.stringify(result, null, 2));
    
    // Check if isSold exists
    const columns = result.rows || result; // Depending on the driver
    const hasIsSold = Array.isArray(columns) && columns.some((c: any) => c.name === 'isSold');
    console.log("Has isSold column:", hasIsSold);
  } catch (e) {
    console.error("Error checking database:", e);
  }
}

check();
