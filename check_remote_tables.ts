import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function check() {
  const url = process.env.TURSO_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;

  console.log("Connecting to remote:", url);
  const client = createClient({
    url: url!,
    authToken: authToken!,
  });

  const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table';");
  console.log("Remote Tables:", JSON.stringify(res.rows));
}

check().catch(console.error);
