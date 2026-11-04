import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  The integrity job re-applies the erasure records to what was stored lately, every day. When it
  finds and removes someone again, this instance's caches (team, public page and pictures,
  proficiency, Matchups' lanes) must drop them too, as after an administrator's erasure: they use
  the same list (privacy/after-erasure). Before, the job removed the rows but left the caches,
  which kept the person until their cache times ran out, and the lanes, which have none, until the
  instance stopped. What the pass finds is stood in for here; privacy-erasure.test.ts covers the
  pass itself.
*/

const found = vi.hoisted(() => ({ people: 0, traces: 0 }));
const cleared = vi.hoisted(() => ({ times: 0 }));
vi.mock("@/server/privacy/reconcile", () => ({
  reconcileErasures: async (_db: unknown, options: { mode: string }) => ({ mode: options.mode, records: 1, unusable: 0, people: found.people, traces: found.traces }),
}));
vi.mock("@/server/privacy/after-erasure", () => ({
  clearCachesAfterErasure: () => {
    cleared.times += 1;
  },
}));

const { runJob } = await import("@/server/jobs");

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
}, 60_000);
afterAll(async () => {
  await handle.close();
});
beforeEach(() => {
  cleared.times = 0;
});

describe("the integrity job's erasure pass", () => {
  it("clears this instance's caches when it removed a person or traces again", async () => {
    found.people = 0;
    found.traces = 2;
    expect(await runJob(handle.db, "integrity", "cli")).toMatchObject({ ok: true });
    expect(cleared.times).toBe(1);
    found.people = 1;
    found.traces = 0;
    await runJob(handle.db, "integrity", "cli");
    expect(cleared.times).toBe(2);
  });

  it("leaves the caches alone when it found nothing", async () => {
    found.people = 0;
    found.traces = 0;
    expect(await runJob(handle.db, "integrity", "cli")).toMatchObject({ ok: true });
    expect(cleared.times).toBe(0);
  });
});
