import { createServer, connect, type Server, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq, sql } from "drizzle-orm";
import { createDb, type DbHandle } from "@/server/db/create";
import { brandAssets, dbEgressDaily } from "@/server/db/schema";
import { egressDay, flushEgress, processEgress, queryShape, resetEgressForTests } from "@/server/db/egress";
import { getBrandAsset } from "@/server/repositories/branding";
import { runJob } from "@/server/jobs";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";

/*
  Egress accounting (server/db/egress.ts). On Postgres the app's connection goes through a TCP
  proxy that counts the bytes the server sends, so the estimate is checked against the real
  traffic, not against itself. Postgres only: the gate (and so the counting) is the postgres-js
  path; the PGlite demo database has no egress to count.
*/
const adminUrl = process.env.TEST_DATABASE_URL;
const pg = adminUrl ? describe : describe.skip;

let proxy: Server;
let fromServer = 0;
let handle: DbHandle;
let admin: { unsafe: (q: string) => Promise<unknown>; end: (o?: { timeout?: number }) => Promise<void> };
const name = `uniiverse_test_${randomBytes(6).toString("hex")}`;
/** The app's own (gated, counted) client, as the gate uses it to write. */
const gated = (query: string, params?: unknown[]) => (handle.db as unknown as { $client: { unsafe: (q: string, p?: unknown[]) => PromiseLike<unknown> } }).$client.unsafe(query, params);

pg("database egress accounting", () => {
  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    admin = postgres(adminUrl!, { max: 1, prepare: false, ssl: false }) as unknown as typeof admin;
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    const target = new URL(adminUrl!);
    proxy = createServer((client: Socket) => {
      const server = connect(Number(target.port || 5432), target.hostname);
      client.pipe(server);
      server.on("data", (chunk: Buffer) => {
        fromServer += chunk.length;
        client.write(chunk);
      });
      server.on("end", () => client.end());
      client.on("error", () => server.destroy());
      server.on("error", () => client.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", () => resolve()));
    const port = (proxy.address() as { port: number }).port;
    const url = new URL(adminUrl!);
    url.hostname = "127.0.0.1";
    url.port = String(port);
    url.pathname = `/${name}`;
    process.env.DATABASE_POOL_MAX = "1";
    handle = await createDb({ mode: "postgres", databaseUrl: url.toString() });
    delete process.env.DATABASE_POOL_MAX;
  });

  afterAll(async () => {
    await handle?.close();
    await admin?.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin?.end({ timeout: 5 });
    proxy?.close();
  });

  it("estimates the bytes Postgres sends within a few percent", async () => {
    const team = await getOrCreateTeam(handle.db);
    for (let i = 0; i < 12; i++) await createPlayer(handle.db, team.id, { displayName: `Player ${i} ÄÖ`, primaryRole: "MID", primaryPool: [] });
    const image = randomBytes(300_000);
    await handle.db.insert(brandAssets).values({ kind: "logo", contentType: "image/png", data: image, width: 10, height: 10, animated: false });
    await handle.db.execute(sql`select 1`); // the connection is open and idle

    resetEgressForTests();
    const before = fromServer;
    // A mix like the app's: wide rows, many rows, JSON, timestamps, an image, writes.
    await handle.db.execute(sql`select * from players`);
    await handle.db.execute(sql`select g, md5(g::text) as h, now() - g * interval '1 minute' as at, g % 2 = 0 as even from generate_series(1, 4000) g`);
    await handle.db.execute(sql`select jsonb_build_object('participants', jsonb_agg(jsonb_build_object('name', 'Player ' || g, 'kills', g % 15, 'items', jsonb_build_array(g, g + 1, g + 2)))) as doc from generate_series(1, 500) g`);
    await handle.db.select({ data: brandAssets.data }).from(brandAssets);
    await getBrandAsset(handle.db, "logo");
    await handle.db.update(brandAssets).set({ width: 11 }).where(eq(brandAssets.kind, "logo"));
    const sent = fromServer - before;
    const counted = processEgress().bytes;
    if (process.env.EGRESS_TEST_PRINT) console.log(`proxy counted ${sent} bytes from the server; the app estimated ${counted} (${(((counted - sent) / sent) * 100).toFixed(2)}%)`);
    expect(sent).toBeGreaterThan(900_000);
    expect(Math.abs(counted - sent) / sent).toBeLessThan(0.05);
  });

  it("reads an image as base64 (about 1.33x) instead of hex (2x), and once per version", async () => {
    const [logo] = await handle.db.select({ updatedAt: brandAssets.updatedAt }).from(brandAssets).where(eq(brandAssets.kind, "logo"));
    const version = logo!.updatedAt.getTime();
    resetEgressForTests();
    let before = fromServer;
    const asset = await getBrandAsset(handle.db, "logo", version);
    const viaBase64 = fromServer - before;
    const [stored] = await handle.db.select({ data: brandAssets.data }).from(brandAssets).where(eq(brandAssets.kind, "logo"));
    expect(Buffer.compare(asset!.data, stored!.data)).toBe(0);
    expect(viaBase64).toBeLessThan(300_000 * 1.4);
    before = fromServer;
    await handle.db.select({ data: brandAssets.data }).from(brandAssets).where(eq(brandAssets.kind, "logo"));
    expect(fromServer - before).toBeGreaterThan(300_000 * 1.95);
    // The same version again: answered from memory, nothing sent.
    const calls = processEgress().calls;
    before = fromServer;
    const again = await getBrandAsset(handle.db, "logo", version);
    expect(Buffer.compare(again!.data, stored!.data)).toBe(0);
    expect(processEgress().calls).toBe(calls);
    expect(fromServer - before).toBe(0);
    // Another version (a new upload elsewhere): read again.
    await getBrandAsset(handle.db, "logo", version + 1);
    expect(processEgress().calls).toBe(calls + 1);
  });

  it("counts queries inside transactions", async () => {
    resetEgressForTests();
    await handle.db.transaction(async (tx) => {
      await tx.execute(sql`select g from generate_series(1, 100) g`);
    });
    expect(processEgress().rows).toBeGreaterThanOrEqual(100);
  });

  it("writes totals per query shape and day, with literals removed", async () => {
    resetEgressForTests();
    await handle.db.execute(sql.raw(`select 'Secret Name' as who, 42 as n`));
    await handle.db.execute(sql`select ${"Another Secret"} as who`);
    const ok = await flushEgress(gated);
    expect(ok).toBe(true);
    const rows = await handle.db.select().from(dbEgressDaily).where(eq(dbEgressDaily.day, egressDay()));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(rows);
    expect(text).not.toContain("Secret Name");
    expect(text).not.toContain("Another Secret");
    expect(text).not.toContain("42");
    expect(rows.every((r) => r.calls > 0 && r.bytes > 0)).toBe(true);
    // A second write adds to the same rows.
    await handle.db.execute(sql.raw(`select 'Secret Name' as who, 42 as n`));
    const shape = queryShape(`select 'Secret Name' as who, 42 as n`);
    await flushEgress(gated);
    const [row] = await handle.db.select().from(dbEgressDaily).where(eq(dbEgressDaily.label, shape.label));
    expect(row!.calls).toBe(2);
  });

  it("the egress job passes under the daily budget and fails over it, naming the largest shapes", async () => {
    const yesterday = egressDay(new Date(Date.now() - 86_400_000));
    await handle.db.insert(dbEgressDaily).values({ day: yesterday, label: "select account_matches 0000test", sample: "select …", calls: 10, rows: 100, bytes: 10 * 1024 * 1024 });
    let result = await runJob(handle.db, "egress", "cli");
    expect(result.ok).toBe(true);
    expect((result.summary as { yesterdayMb: number }).yesterdayMb).toBe(10);
    await handle.db.update(dbEgressDaily).set({ bytes: 500 * 1024 * 1024 }).where(eq(dbEgressDaily.label, "select account_matches 0000test"));
    result = await runJob(handle.db, "egress", "cli");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500 MB");
    expect(result.error).toContain("select account_matches 0000test");
    const report = await runJob(handle.db, "db-usage", "cli");
    const appEgress = (report.summary as { appEgress: { days: Array<{ day: string; mb: number }> } }).appEgress;
    expect(appEgress.days.find((d) => d.day === yesterday)?.mb).toBe(500);
    await handle.db.delete(dbEgressDaily).where(eq(dbEgressDaily.label, "select account_matches 0000test"));
    const left = await handle.db.select().from(dbEgressDaily).orderBy(desc(dbEgressDaily.day)).limit(1);
    expect(left.every((r) => r.label !== "select account_matches 0000test")).toBe(true);
  });
});

describe("query shapes", () => {
  it("group the same query whatever its values and list lengths", () => {
    const a = queryShape(`select "a" from "account_mastery" where "account_id" in ($1, $2)`);
    const b = queryShape(`select "a" from "account_mastery" where "account_id" in ($1, $2, $3, $4, $5)`);
    expect(a.label).toBe(b.label);
    expect(a.label).toMatch(/^select account_mastery [0-9a-f]{8}$/);
    const c = queryShape(`insert into "x" ("a", "b") values ($1, $2), ($3, $4), ($5, $6)`);
    const d = queryShape(`insert into "x" ("a", "b") values ($1, $2)`);
    expect(c.label.startsWith("insert x ")).toBe(true);
    expect(queryShape(`select 'Ann' as n where x = 'O''Brien' and y = 12.5`).sample).toBe(`select '?' as n where x = '?' and y = N`);
    expect(d.label.startsWith("insert x ")).toBe(true);
  });
});
