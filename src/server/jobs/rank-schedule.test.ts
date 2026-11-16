import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@/server/db/types";
import { installRankSchedule, removeRankSchedule, scheduleCommand, scheduleHost, RANK_SCHEDULE_SECRET } from "./rank-schedule";

/*
  The five-minute rank schedule's guards and command text. Its SQL needs pg_cron, pg_net and
  Supabase Vault, which CI's Postgres does not have; it was run against a real pg_cron with
  stand-ins for Vault and pg_net when it was written (#245), and its effect on production is read
  with Data jobs rank-schedule-status (docs/RANKED_PROGRESS.md).
*/

const SECRET = "a-test-secret-0123456789";
const prod = { VERCEL_ENV: "production", CRON_SECRET: SECRET, VERCEL_PROJECT_PRODUCTION_URL: "team-uniiverse.vercel.app" };
const noDb = new Proxy({}, { get: () => () => { throw new Error("the database must not be touched"); } }) as never;

describe("the five-minute rank schedule", () => {
  it("calls the production rank watch with the secret read from Vault, never written into the command", () => {
    const command = scheduleCommand("team-uniiverse.vercel.app");
    expect(command).toContain("url := 'https://team-uniiverse.vercel.app/api/jobs/rank-watch'");
    expect(command).toContain(`from vault.decrypted_secrets where name = '${RANK_SCHEDULE_SECRET}'`);
    expect(command).not.toContain(SECRET);
  });

  it("takes only a bare host name for the address, as it is written into SQL text", () => {
    expect(scheduleHost(prod)).toBe("team-uniiverse.vercel.app");
    for (const bad of ["", "localhost", "https://team-uniiverse.vercel.app", "x.com/path", "evil.com'; drop table users; --", "a..b", "-a.com"]) {
      expect(scheduleHost({ ...prod, VERCEL_PROJECT_PRODUCTION_URL: bad })).toBeNull();
    }
    expect(() => scheduleCommand("evil.com'; --")).toThrow();
  });

  it("installs only from production, with a cron secret and a known address, before touching the database", async () => {
    for (const env of [{ ...prod, VERCEL_ENV: "preview" }, { ...prod, VERCEL_ENV: undefined }, { ...prod, CRON_SECRET: "" }, { ...prod, CRON_SECRET: "short" }, { ...prod, VERCEL_PROJECT_PRODUCTION_URL: undefined }]) {
      const result = await installRankSchedule(noDb, env);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }
  });
});

/** A database with pg_cron and Vault, the rank schedule installed, and `others` other pg_cron jobs naming the secret. */
function scheduledDb(others: number) {
  const dialect = new PgDialect();
  const statements: string[] = [];
  const db = {
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql.replace(/\s+/g, " ").trim();
      statements.push(text);
      if (text.includes("from pg_extension")) return [{ extname: "pg_cron" }, { extname: "supabase_vault" }];
      if (text.startsWith("select jobid from cron.job")) return [{ jobid: 2 }];
      if (text.includes("strpos(command")) return [{ n: others }];
      if (text.startsWith("delete from vault.secrets")) return [{ id: "00000000-0000-0000-0000-000000000000" }];
      return [];
    },
  };
  return { db: db as unknown as Db, statements };
}

describe("removing the five-minute rank schedule", () => {
  it("keeps the Vault copy while another pg_cron job reads it (production's ten-minute tick), and still unschedules", async () => {
    const { db, statements } = scheduledDb(1);
    expect(await removeRankSchedule(db)).toEqual({ unscheduled: true, secretRemoved: false, secretStillUsedBy: 1 });
    expect(statements.some((s) => s.startsWith("select cron.unschedule"))).toBe(true);
    expect(statements.some((s) => s.startsWith("delete from vault.secrets"))).toBe(false);
  });

  it("removes the Vault copy when no other job reads it", async () => {
    const { db, statements } = scheduledDb(0);
    expect(await removeRankSchedule(db)).toEqual({ unscheduled: true, secretRemoved: true, secretStillUsedBy: 0 });
    expect(statements.some((s) => s.startsWith("delete from vault.secrets"))).toBe(true);
  });
});
