import { connect } from "@tursodatabase/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  const localPath = "test_casing_3.db";

  console.log("Testing with:", localPath);
  const syncClient = await connect({
    path: localPath,
    url: url!,
    authToken: authToken!,
  } as any);

  try {
    console.log("Creating table with CamelCase...");
    await syncClient.exec('CREATE TABLE "CamelCaseTable" ("CamelColumn" TEXT)');
    
    const p1 = await syncClient.prepare("SELECT name FROM sqlite_master WHERE type='table'");
    const rows = await p1.all();
    console.log("Tables found:", JSON.stringify(rows));
    
    const name = (rows as any[]).find(r => r.name.toLowerCase() === 'camelcasetable')?.name;
    console.log("Actual name in DB:", name);

    if (name) {
      console.log(`Testing query with "${name}"...`);
      const p2 = await syncClient.prepare(`SELECT * FROM "${name}"`);
      await p2.all();
      console.log("Success!");
    }
  } catch (e: any) {
    console.log("Test failed:", e.message);
  }

  await syncClient.close();
}

test().catch(console.error);
