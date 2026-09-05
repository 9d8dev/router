import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Migration function
 *
 * Only runs when the NODE_ENV is NOT production
 */
async function main() {
  let pool: Pool | undefined;
  try {
    const dev = process.env.NODE_ENV !== "production";
    loadEnvConfig("./", dev);
    if (!process.env.POSTGRES_URL) {
      throw new Error("POSTGRES_URL is not configured.");
    }

    pool = new Pool({ connectionString: process.env.POSTGRES_URL });
    await migrate(drizzle(pool), { migrationsFolder: "lib/db/drizzle" });
    console.log("Migrations complete");
  } catch (error) {
    console.log("Migrations failed");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

main();
