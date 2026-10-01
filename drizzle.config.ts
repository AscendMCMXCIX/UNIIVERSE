import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only needs a connection for `studio`/`push`. Migration SQL is generated from the
// schema files alone, so a DATABASE_URL is not required to run `pnpm db:generate`.
export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/uniiverse",
  },
  strict: true,
  verbose: true,
});
