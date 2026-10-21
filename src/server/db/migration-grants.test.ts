import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EMBEDDED_MIGRATIONS } from "./migrations.generated";
import { EXPLICIT_GRANTS_FROM, migrationGrantProblems } from "./migration-grants";

/*
  Every migration from 0052 on says itself what each role gets on what it creates
  (docs/DATABASE_PERMISSIONS.md), so it never depends on Supabase's automatic grants: there were
  grants for every role until 30 October 2026, and there are none after it.
*/

/** What drizzle-kit writes for a table with a serial id, followed by the documented template. */
function templateMigration(): string {
  const doc = readFileSync(path.join(__dirname, "../../../docs/DATABASE_PERMISSIONS.md"), "utf8");
  const block = /<!-- template: new table -->\s*```sql\n([\s\S]*?)```/.exec(doc)?.[1];
  if (!block) throw new Error("docs/DATABASE_PERMISSIONS.md has lost its new-table template");
  return `CREATE TABLE "example_items" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"name" text NOT NULL\n);\n--> statement-breakpoint\n${block}`;
}

describe("explicit grants in migrations", () => {
  it("every migration from 0052 on follows the convention", () => {
    const checked = EMBEDDED_MIGRATIONS.filter((m) => m.idx >= EXPLICIT_GRANTS_FROM);
    expect(checked.map((m) => m.tag)).toContain("0052_data_api_grants");
    expect(checked.flatMap((m) => migrationGrantProblems(m.statements).map((p) => `${m.tag}: ${p}`))).toEqual([]);
  });

  it("accepts the documented template for a new table", () => {
    expect(migrationGrantProblems(templateMigration())).toEqual([]);
  });

  it("names each line a new table is missing, its sequence included", () => {
    const bare = `CREATE TABLE "example_items" ("id" serial PRIMARY KEY NOT NULL, "name" text NOT NULL);`;
    expect(migrationGrantProblems(bare)).toEqual([
      `table example_items: Row Level Security is not turned on (ALTER TABLE "example_items" ENABLE ROW LEVEL SECURITY)`,
      "table example_items: no REVOKE ALL ON TABLE public.example_items FROM anon, so what anon gets depends on the project's default privileges",
      "table example_items: no REVOKE ALL ON TABLE public.example_items FROM authenticated, so what authenticated gets depends on the project's default privileges",
      "table example_items: no GRANT SELECT ON TABLE public.example_items TO uniiverse_backup, so a backup would fail where no default privileges cover it",
      "sequence example_items_id_seq: no REVOKE ALL ON SEQUENCE public.example_items_id_seq FROM anon, so what anon gets depends on the project's default privileges",
      "sequence example_items_id_seq: no REVOKE ALL ON SEQUENCE public.example_items_id_seq FROM authenticated, so what authenticated gets depends on the project's default privileges",
      "sequence example_items_id_seq: no GRANT SELECT ON SEQUENCE public.example_items_id_seq TO uniiverse_backup, so a backup would fail where no default privileges cover it",
    ]);
    // One missing line is enough to be named; the sequence of an identity column counts too.
    const withoutBackup = templateMigration().replace(/^\s*GRANT SELECT ON TABLE public\.example_items TO uniiverse_backup;$/m, "");
    expect(migrationGrantProblems(withoutBackup)).toEqual([expect.stringMatching(/^table example_items: no GRANT SELECT/)]);
    const identity = `CREATE TABLE "events" ("id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1), "at" timestamp);`;
    expect(migrationGrantProblems(identity).filter((p) => p.startsWith("sequence"))).toHaveLength(3);
    const added = `ALTER TABLE "players" ADD COLUMN "rank_order" serial NOT NULL;`;
    expect(migrationGrantProblems(added).map((p) => p.split(":")[0])).toEqual(["sequence players_rank_order_seq", "sequence players_rank_order_seq", "sequence players_rank_order_seq"]);
  });

  it("refuses grants to the Data API roles or PUBLIC, blanket grants, default privileges, policies and RLS turned off", () => {
    const cases: Array<[string, RegExp]> = [
      ["GRANT SELECT ON TABLE public.players TO anon;", /grants to anon/],
      ["GRANT SELECT, INSERT ON public.players TO authenticated;", /grants to authenticated/],
      ["GRANT ALL ON TABLE players TO service_role;", /grants to service_role/],
      ["GRANT SELECT ON players TO PUBLIC;", /grants to PUBLIC/],
      ["GRANT SELECT, INSERT ON TABLE public.players TO uniiverse_backup;", /more than SELECT/],
      ["GRANT SELECT ON ALL TABLES IN SCHEMA public TO uniiverse_backup;", /schema-wide/],
      ["ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO uniiverse_backup;", /default privileges/],
      ["ALTER TABLE players DISABLE ROW LEVEL SECURITY;", /Row Level Security off/],
      [`CREATE POLICY "read" ON players FOR SELECT TO anon USING (true);`, /creates a policy/],
    ];
    for (const [sql, problem] of cases) expect(migrationGrantProblems(sql).join("\n"), sql).toMatch(problem);
    // Revoking, and granting the backup role SELECT alone, are fine; so is a comment that mentions anon.
    expect(migrationGrantProblems("-- grants nothing to anon\nREVOKE ALL ON TABLE public.players FROM anon;\nGRANT SELECT ON TABLE public.players TO uniiverse_backup;")).toEqual([]);
  });

  it("asks a view to run as its caller, and a function to be closed to PUBLIC", () => {
    expect(migrationGrantProblems(`CREATE VIEW player_names AS SELECT id, display_name FROM players;`)).toEqual([
      "view player_names: not WITH (security_invoker = true), so it would read as its owner, round Row Level Security",
      "view player_names: no REVOKE ALL ON TABLE public.player_names FROM anon",
      "view player_names: no REVOKE ALL ON TABLE public.player_names FROM authenticated",
    ]);
    expect(migrationGrantProblems(`CREATE VIEW player_names WITH (security_invoker = false) AS SELECT id FROM players;`).join("\n")).toMatch(/not WITH \(security_invoker = true\)/);
    const view = `CREATE VIEW player_names WITH (security_invoker = true) AS SELECT id FROM players;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.player_names FROM anon; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.player_names FROM authenticated; END IF;
      END $$;`;
    expect(migrationGrantProblems(view)).toEqual([]);

    const fn = `CREATE FUNCTION public.team_size() RETURNS int LANGUAGE sql AS 'SELECT count(*)::int FROM players';`;
    expect(migrationGrantProblems(fn)).toEqual([
      "function team_size: no REVOKE ALL ON FUNCTION public.team_size(…) FROM PUBLIC",
      "function team_size: no REVOKE ALL ON FUNCTION public.team_size(…) FROM anon",
      "function team_size: no REVOKE ALL ON FUNCTION public.team_size(…) FROM authenticated",
    ]);
    expect(migrationGrantProblems(`${fn} REVOKE ALL ON FUNCTION public.team_size() FROM PUBLIC, anon, authenticated;`)).toEqual([]);
    expect(migrationGrantProblems(`CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;`)).toEqual([]);
    expect(migrationGrantProblems(`CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; REVOKE ALL ON FUNCTION f() FROM PUBLIC, anon, authenticated;`).join("\n")).toMatch(/SECURITY DEFINER/);
  });
});
