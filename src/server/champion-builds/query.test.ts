import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@/server/db/types";
import { queryShape } from "@/server/db/egress";
import { readBuildCounts } from "./query";

/*
  The builds' statement as the egress counts name it (src/server/db/egress.ts queryShape): the label
  docs/HOSTING_USAGE.md ("26 Nov 2026", "If it ever weighs") tells the owner to look for in a
  `db-usage` run, so a change to the statement's opening changes the doc with it. No database: the
  statement is only rendered as Postgres receives it.
*/

/** The statements readBuildCounts sends, as text, from a stand-in that answers nothing. */
async function statements(): Promise<string[]> {
  const sent: SQL[] = [];
  const tx = { execute: async (q: SQL) => (sent.push(q), []) };
  const db = { transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx) } as unknown as Db;
  await readBuildCounts(db, { champion: "Ahri", patches: ["16.22", "16.21"], items: { completed: ["3089"], boots: ["3020"], known: ["3089", "3020"] }, ranks: { 1: 5, 2: 5, 3: 5, 4: 3 } });
  const dialect = new PgDialect();
  return sent.map((q) => dialect.sqlToQuery(q).sql);
}

describe("the builds' statement in the egress counts", () => {
  it("is labelled `with riot_accounts`, its sample opening on the team's accounts, as HOSTING_USAGE.md says", async () => {
    const [jit, counts] = await statements();
    expect(jit).toBe("SET LOCAL jit = off");
    const shape = queryShape(counts!);
    expect(shape.label).toMatch(/^with riot_accounts [0-9a-f]{8}$/);
    expect(shape.sample.startsWith("WITH mem AS MATERIALIZED ( SELECT ra.puuid FROM riot_accounts ra JOIN players")).toBe(true);
    const doc = readFileSync(join(process.cwd(), "docs/HOSTING_USAGE.md"), "utf8").replace(/\s+/g, " ");
    expect(doc).toContain("labelled `with riot_accounts <hash>`");
    expect(doc).toContain('"WITH mem AS MATERIALIZED ( SELECT ra.puuid FROM riot_accounts ra JOIN players"');
    expect(doc).not.toContain("the `champion-builds` shape");
  });
});
