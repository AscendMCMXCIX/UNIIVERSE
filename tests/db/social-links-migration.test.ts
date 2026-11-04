import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "@/server/db/create";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { loadSocialLinks } from "@/server/repositories/profile";
import { visibleSocialLinks } from "@/domain/social-links";
import { runJob } from "@/server/jobs";

/*
  Migration 0061 on production-shaped data: every stored link { value, show } becomes
  { value, public }. Only links chosen for the public page are switched on; team-only, owner-only
  and anything unrecognised are switched off, so nothing becomes visible to anyone new. Values (and
  anything else stored with them) are kept; rows without links, empty ones and odd entries are left
  as they were.
*/

const TAG = "0061_social_links_public";

/** A database with every migration before 0061 applied, as production is before the deploy. */
async function before0061() {
  const fresh = await createDb({ mode: "pglite-memory", migrate: false });
  const db = fresh.db;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < TAG)) {
    await db.transaction(async (tx) => {
      for (const statement of m.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    });
  }
  return fresh;
}

const rowsOf = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? (r as T[]);

const YOUTUBE = "https://www.youtube.com/@Shown";
const TEAM_TWITCH = "https://www.twitch.tv/team_only";

/** What each profile had stored, in the old shape (and a few shapes it could have instead). */
const STORED: Record<string, unknown> = {
  // All three audiences, as the old Settings wrote them.
  everyAudience: { youtube: { value: YOUTUBE, show: "public" }, twitch: { value: TEAM_TWITCH, show: "team" }, discord: { value: "only.me", show: "hidden" } },
  teamOnly: { twitch: { value: "https://www.twitch.tv/b_team", show: "team" } },
  hiddenOnly: { discord: { value: "hidden.one", show: "hidden" } },
  // Not what the old code wrote, but possible in a hand-edited row: kept, never switched on.
  odd: { youtube: "not-an-object", twitch: { value: "https://www.twitch.tv/odd", show: "PUBLIC" }, discord: { value: "odd.one", show: true, note: "kept" } },
  // Already the new shape: the switch is kept, and only a JSON true counts as on.
  newShape: { youtube: { value: "https://www.youtube.com/@New", public: true }, twitch: { value: "https://www.twitch.tv/new_off", public: false }, discord: { value: "string.true", public: "true" } },
  empty: {},
};

describe("migration 0061: one Show publicly switch per social link", () => {
  it("switches on only the links chosen for the public page and keeps every value", async () => {
    const fresh = await before0061();
    const db = fresh.db;
    try {
      const [team] = rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO teams (name) VALUES ('Team') RETURNING id`));
      const ids: Record<string, string> = {};
      for (const [name, links] of Object.entries(STORED)) {
        const [row] = rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group", social_links) VALUES (${team!.id}, ${name}, 'MID', 'main', ${JSON.stringify(links)}::jsonb) RETURNING id`));
        ids[name] = row!.id;
      }
      const [none] = rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group") VALUES (${team!.id}, 'none', 'MID', 'main') RETURNING id`));

      // The held drops of the retired tables (0062 on) run after it; they have their own tests.
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied.filter((tag) => !tag.includes("_retire_"))).toEqual([TAG, "0065_rank_confirmations"]);

      const stored = new Map(rowsOf<{ id: string; links: unknown }>(await db.execute(sql`SELECT id, social_links AS links FROM players`)).map((r) => [r.id, r.links]));
      expect(stored.get(ids.everyAudience!)).toEqual({ youtube: { value: YOUTUBE, public: true }, twitch: { value: TEAM_TWITCH, public: false }, discord: { value: "only.me", public: false } });
      expect(stored.get(ids.teamOnly!)).toEqual({ twitch: { value: "https://www.twitch.tv/b_team", public: false } });
      expect(stored.get(ids.hiddenOnly!)).toEqual({ discord: { value: "hidden.one", public: false } });
      expect(stored.get(ids.odd!)).toEqual({ youtube: "not-an-object", twitch: { value: "https://www.twitch.tv/odd", public: false }, discord: { value: "odd.one", note: "kept", public: false } });
      expect(stored.get(ids.newShape!)).toEqual({ youtube: { value: "https://www.youtube.com/@New", public: true }, twitch: { value: "https://www.twitch.tv/new_off", public: false }, discord: { value: "string.true", public: false } });
      expect(stored.get(ids.empty!)).toEqual({});
      expect(stored.get(none!.id)).toBeNull();

      // What the pages show (the roster, profile header and public page all read through these):
      // the public link alone; a team-only or hidden one is shown to nobody.
      const links = await loadSocialLinks(db, Object.values(ids));
      const shown = (name: string) => visibleSocialLinks(links.get(ids[name]!)).map((l) => l.href);
      expect(shown("everyAudience")).toEqual([YOUTUBE]);
      expect(shown("teamOnly")).toEqual([]);
      expect(shown("hiddenOnly")).toEqual([]);
      expect(shown("odd")).toEqual([]);
      expect(shown("newShape")).toEqual(["https://www.youtube.com/@New"]);
      // The owner still has every value to edit in Settings, with the switch off.
      expect(links.get(ids.teamOnly!)).toEqual({ twitch: { value: "https://www.twitch.tv/b_team", public: false } });

      // Applied once: a second run changes nothing.
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([]);

      // The account audit counts them (objects only, values never): five profiles, ten links, two
      // switched on, none left in the old shape.
      const audit = async () => (await runJob(db, "auth-audit", "cli")).summary as { socialLinks: unknown };
      expect((await audit()).socialLinks).toEqual({ profiles: 5, links: 10, switchedOn: 2, oldShape: 0 });
      // The previous version, still serving during the deployment, saves in the old shape: the
      // audit sees it, and its team-only link stays private.
      await db.execute(sql`UPDATE players SET social_links = ${JSON.stringify({ twitch: { value: "https://www.twitch.tv/b_team", show: "team" }, youtube: { value: "https://www.youtube.com/@Late", show: "public" } })}::jsonb WHERE id = ${ids.teamOnly!}`);
      expect((await audit()).socialLinks).toEqual({ profiles: 5, links: 11, switchedOn: 3, oldShape: 2 });
      expect(visibleSocialLinks((await loadSocialLinks(db, [ids.teamOnly!])).get(ids.teamOnly!)).map((l) => l.href)).toEqual(["https://www.youtube.com/@Late"]);
      expect(JSON.stringify((await audit()).socialLinks)).not.toContain("b_team");
    } finally {
      await fresh.close();
    }
  });
});
