import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  docs/DATABASE_PERMISSIONS.md, "Permissions matrix", against the schema: the number of tables it
  says are private, and the matrix of who sees each table through the app, list exactly the tables
  the migrations create (the newest Drizzle snapshot) plus the migration ledger the migrator keeps
  outside it. A table a migration adds, or drops, fails here until the page says so.
*/

const root = path.join(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const doc = read("docs/DATABASE_PERMISSIONS.md");
/** The ledger src/server/db/migrator.ts creates for itself: not in the Drizzle schema. */
const LEDGER = "uniiverse_migrations";

function schemaTables(): string[] {
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  const newest = journal.entries.reduce((a, b) => (b.idx > a.idx ? b : a));
  const snapshot = JSON.parse(read(`drizzle/meta/${newest.tag.slice(0, 4)}_snapshot.json`)) as { tables: Record<string, unknown> };
  return [...Object.keys(snapshot.tables).map((k) => k.replace(/^public\./, "")), LEDGER].sort();
}

/** The table names in the "Through the app" matrix's Tables column (notes in brackets left out, as they name related tables). */
function matrixTables(): string[] {
  const start = doc.indexOf("| Category | Tables | Through the app |");
  expect(start, "the matrix's header").toBeGreaterThan(0);
  const rows = doc.slice(start).split("\n").slice(2);
  const out: string[] = [];
  for (const row of rows) {
    if (!row.startsWith("|")) break;
    const tables = row.split(" | ")[1] ?? "";
    for (const m of tables.replace(/\([^()]*\)/g, "").matchAll(/`([a-z0-9_]+)`/g)) out.push(m[1]!);
  }
  return out.sort();
}

describe("the database permissions page", () => {
  const tables = schemaTables();

  it("knows the ledger is the migrator's own table", () => {
    expect(read("src/server/db/migrator.ts")).toContain(LEDGER);
    expect(tables).toContain("matchup_notes");
    expect(tables).toContain("match_multikills");
  });

  it("says how many tables are private: every table the migrations create, and the ledger", () => {
    const said = /All (\d+) tables are \*\*private\*\*/.exec(doc)?.[1];
    expect(Number(said)).toBe(tables.length);
  });

  it("lists every table once in the matrix of who sees it through the app, and no table that does not exist", () => {
    expect(matrixTables()).toEqual(tables);
  });
});
