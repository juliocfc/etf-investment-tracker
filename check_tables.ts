import { connect } from "@tursodatabase/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function check() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  const localPath = "local.db";

  console.log("Connecting to:", localPath);
  const syncClient = await connect({
    path: localPath,
    url: url!,
    authToken: authToken!,
  } as any);

  const prepared = await syncClient.prepare("SELECT name FROM sqlite_master WHERE type='table';");
  const rows = await prepared.all();
  console.log("Tables found:", JSON.stringify(rows));
  await syncClient.close();
}

check().catch(console.error);
