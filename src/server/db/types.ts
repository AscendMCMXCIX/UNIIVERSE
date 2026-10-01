import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Driver-agnostic database handle (postgres-js in production, PGlite locally / in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbMode = "postgres" | "pglite-file" | "pglite-memory";
