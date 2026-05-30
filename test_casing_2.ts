import { connect } from "@tursodatabase/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  const localPath = "test_casing_2.db";

  console.log("Testing with:", localPath);
  const syncClient = await connect({
    path: localPath,
    url: url!,
    authToken: authToken!,
  } as any);

  try {
    console.log("Creating table with camelCase...");
    await syncClient.exec('CREATE TABLE "CamelCaseTable" ("CamelColumn" TEXT)');
    console.log("Table created.");
    
    console.log("Querying with quoted camelCase...");
    const p1 = await syncClient.prepare('SELECT "CamelColumn" FROM "CamelCaseTable"');
    await p1.all();
    console.log("Quoted camelCase query works!");

    console.log("Checking actual casing in sqlite_master...");
    const p2 = await syncClient.prepare("SELECT sql FROM sqlite_master WHERE name='CamelCaseTable'");
    const res = await p2.all();
    console.log("Actual SQL:", res[0]?.sql);
  } catch (e: any) {
    console.log("Test failed:", e.message);
  }

  await syncClient.close();
}

test().catch(console.error);
