
import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function migrate() {
  try {
    const db = await getDb();
    console.log("Adding isSold and soldDate columns to purchases table...");
    
    // Check if isSold exists first
    const tableInfo = await db.run(sql`PRAGMA table_info(purchases)`);
    const columns = tableInfo.rows || tableInfo;
    const hasIsSold = Array.isArray(columns) && columns.some((c: any) => c[1] === 'isSold' || c.name === 'isSold');
    
    if (!hasIsSold) {
      await db.run(sql`ALTER TABLE purchases ADD COLUMN isSold INTEGER DEFAULT 0 NOT NULL`);
      await db.run(sql`ALTER TABLE purchases ADD COLUMN soldDate INTEGER`);
      console.log("Migration successful!");
    } else {
      console.log("Columns already exist, skipping migration.");
    }
  } catch (e) {
    console.error("Migration failed:", e);
  }
}

migrate();
