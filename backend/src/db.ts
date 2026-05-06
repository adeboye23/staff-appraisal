import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  max: 5,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true
});

pool.on("error", (error: Error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function query<T = any>(text: string, params: unknown[] = []) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await pool.query<T>(text, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      const isTransient =
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "08P01" ||
        /connection timeout/i.test(message) ||
        /authentication timed out/i.test(message) ||
        /connection terminated/i.test(message);

      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }

  throw new Error("Database query retry unexpectedly exhausted.");
}
