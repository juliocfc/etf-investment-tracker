import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

// Load environment variables from .env.local if it exists
dotenv.config({ path: ".env.local" });

const isTurso = process.env.DATABASE_URL?.includes("libsql") || process.env.DATABASE_URL?.includes("http");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: isTurso ? "turso" : "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
