import { connect } from "@tursodatabase/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  const localPath = "test_sync.db";

  console.log("Testing with:", localPath);
  const syncClient = await connect({
    path: localPath,
    url: url!,
    authToken: authToken!,
  } as any);

  await syncClient.pull();

  try {
    console.log("Testing quoted camelCase...");
    const p1 = await syncClient.prepare('SELECT * FROM "etfHoldings" LIMIT 1');
    await p1.all();
    console.log("Quoted camelCase works!");
  } catch (e: any) {
    console.log("Quoted camelCase failed:", e.message);
  }

  try {
    console.log("Testing unquoted camelCase...");
    const p2 = await syncClient.prepare('SELECT * FROM etfHoldings LIMIT 1');
    await p2.all();
    console.log("Unquoted camelCase works!");
  } catch (e: any) {
    console.log("Unquoted camelCase failed:", e.message);
  }

  try {
    console.log("Testing lowercase...");
    const p3 = await syncClient.prepare('SELECT * FROM etfholdings LIMIT 1');
    await p3.all();
    console.log("Lowercase works!");
  } catch (e: any) {
    console.log("Lowercase failed:", e.message);
  }

  await syncClient.close();
}

test().catch(console.error);
