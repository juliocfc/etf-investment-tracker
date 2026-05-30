import { connect } from "@tursodatabase/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  const localPath = "test_sync.db"; // This should have etfHoldings from previous pull

  console.log("Connecting to:", localPath);
  const syncClient = await connect({
    path: localPath,
    url: url!,
    authToken: authToken!,
  } as any);

  try {
    const sql = 'update "etfHoldings" set "currentPrice" = ? where "symbol" = ?';
    console.log("Original SQL:", sql);
    
    try {
      const p1 = await syncClient.prepare(sql);
      console.log("Original SQL worked!");
    } catch (e: any) {
      console.log("Original SQL failed:", e.message);
    }

    const strippedSql = sql.replace(/"/g, '');
    console.log("Stripped SQL:", strippedSql);
    try {
      const p2 = await syncClient.prepare(strippedSql);
      console.log("Stripped SQL worked!");
    } catch (e: any) {
      console.log("Stripped SQL failed:", e.message);
    }

  } catch (e: any) {
    console.error(e);
  }

  await syncClient.close();
}

test().catch(console.error);
