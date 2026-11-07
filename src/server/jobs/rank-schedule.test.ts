import { describe, expect, it } from "vitest";
import { installRankSchedule, scheduleCommand, scheduleHost, RANK_SCHEDULE_SECRET } from "./rank-schedule";

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
