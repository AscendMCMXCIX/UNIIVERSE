import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Branding: names and colours (unreadable colours refused), images in their own table (GIFs
  keep their animation and get a still frame), the public image route, permissions, and the
  migration that moves a logo saved inline before Phase 3 into that table.
*/

const state = vi.hoisted(() => ({ db: null as unknown, allow: true }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  requirePermission: async () => {
    if (!state.allow) throw new Error("You do not have permission to do that.");
    return { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, mustChangePassword: false, setupComplete: true };
  },
  getSession: async () =>
    state.allow ? { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, mustChangePassword: false, setupComplete: true } : { userId: "44444444-4444-4444-8444-444444444444", role: "player", label: "P", playerId: null, username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: ["view-team"] },
}));

import { createDb } from "@/server/db/create";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { brandAssets } from "@/server/db/schema";
import { getBrandAsset, getBranding, storeWebCopy } from "@/server/repositories/branding";
import { invalidateCache } from "@/server/observability/cache";
import { gifFrameCount } from "@/server/images";
import { finishBrandUploadAction, removeBrandAssetAction, saveBrandingAction, uploadBrandAssetAction } from "@/server/actions/branding";
import { GET as brandingRoute } from "@/app/api/branding/[asset]/route";
import { POST as uploadRoute } from "@/app/api/branding/upload/route";
import { BRAND_UPLOAD_CHUNK_BYTES, NEUTRAL_NAME } from "@/domain/branding";
import { brandUploadChunks } from "@/server/db/schema";

/** A 16×16 GIF with `frames` image blocks (the pixel data is never decoded on the server). */
function gif(frames: number): Buffer {
  const frame = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 16, 0, 16, 0, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00];
  return Buffer.from([...Buffer.from("GIF89a"), 16, 0, 16, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
}
/** A PNG header for a 16×16 image (enough for type and size sniffing). */
function png(side = 16): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(side, 16);
  b.writeUInt32BE(side, 20);
  return b;
}
const dataUrl = (type: string, buf: Buffer) => `data:${type};base64,${buf.toString("base64")}`;

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
}, 60_000);
afterAll(async () => {
  await handle.close();
});
beforeEach(() => {
  state.allow = true;
  invalidateCache("branding");
});

describe("branding", () => {
  it("counts GIF frames from the file's own blocks", () => {
    expect(gifFrameCount(gif(1))).toBe(1);
    expect(gifFrameCount(gif(3))).toBe(3);
    expect(gifFrameCount(png())).toBeNull();
  });

  it("saves names and readable colours, refuses unreadable ones, and shows no tagline unless set", async () => {
    const ok = await saveBrandingAction({ teamName: "Rockets", shortName: "rkt", tagline: "", accent: "#ff8800", surface: "#1a1a2a" });
    expect(ok.ok).toBe(true);
    const saved = await getBranding(handle.db);
    expect(saved).toMatchObject({ teamName: "Rockets", shortName: "RKT", tagline: "", accent: "#ff8800", surface: "#1a1a2a", background: null });
    const light = await saveBrandingAction({ ...saved, background: "#f4f4f4" });
    expect(light.ok).toBe(false);
    if (!light.ok) expect(light.error).toMatch(/Text on the background/);
    expect((await getBranding(handle.db)).background).toBeNull();
  });

  it("keeps an animated GIF logo animated and stores its still frame for the tab icon and reduced motion", async () => {
    const r = await uploadBrandAssetAction("logo", dataUrl("image/gif", gif(2)), dataUrl("image/png", png()));
    expect(r.ok).toBe(true);
    const b = await getBranding(handle.db);
    expect(b.assets.logo).toMatchObject({ animated: true, hasStatic: true });
    expect((await getBrandAsset(handle.db, "logo"))!.contentType).toBe("image/gif");
    expect((await getBrandAsset(handle.db, "logo-static"))!.contentType).toBe("image/png");

    // Served publicly (the sign-in page needs it), cached for good under a versioned URL, sandboxed.
    const res = await brandingRoute(new Request(`http://x/api/branding/logo?v=${b.assets.logo!.version}`), { params: Promise.resolve({ asset: "logo" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await res.arrayBuffer()).equals(gif(2))).toBe(true);
    expect((await brandingRoute(new Request("http://x/api/branding/secrets"), { params: Promise.resolve({ asset: "secrets" }) })).status).toBe(404);
  });

  it("treats a single-frame GIF as still and drops a stale still frame", async () => {
    await uploadBrandAssetAction("logo", dataUrl("image/gif", gif(1)), dataUrl("image/png", png()));
    const b = await getBranding(handle.db);
    expect(b.assets.logo).toMatchObject({ animated: false, hasStatic: false });
    // Asking for the still frame falls back to the image itself.
    expect((await getBrandAsset(handle.db, "logo-static"))!.contentType).toBe("image/gif");
  });

  it("checks the real type, size and dimensions", async () => {
    expect(await uploadBrandAssetAction("logo", dataUrl("image/png", Buffer.from("not an image at all, just text")), null)).toMatchObject({ ok: false });
    expect(await uploadBrandAssetAction("logo", dataUrl("image/png", png(4096)), null)).toMatchObject({ ok: false, error: expect.stringMatching(/1024/) });
    expect(await uploadBrandAssetAction("logo", dataUrl("image/png", png(8)), null)).toMatchObject({ ok: false, error: expect.stringMatching(/16×16/) });
    expect(await uploadBrandAssetAction("background", dataUrl("image/png", Buffer.concat([png(), Buffer.alloc(20_100_000)])), null)).toMatchObject({ ok: false, error: expect.stringMatching(/20 MB/) });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
    expect(await uploadBrandAssetAction("background", dataUrl("image/svg+xml", svg), null)).toMatchObject({ ok: false });
    expect(await uploadBrandAssetAction("logo", dataUrl("image/svg+xml", svg), null)).toMatchObject({ ok: true });
    expect((await getBrandAsset(handle.db, "logo"))!.contentType).toBe("image/svg+xml");
  });

  it("removes an image with its still frame", async () => {
    await uploadBrandAssetAction("background", dataUrl("image/gif", gif(3)), dataUrl("image/png", png()));
    expect((await getBranding(handle.db)).assets.background).toMatchObject({ animated: true });
    expect(await removeBrandAssetAction("background")).toMatchObject({ ok: true });
    expect((await getBranding(handle.db)).assets.background).toBeNull();
    const rows = await handle.db.select({ kind: brandAssets.kind }).from(brandAssets);
    expect(rows.map((r) => r.kind)).not.toContain("background-static");
  });

  it("serves an image's web copy once one is made from the current upload, never one made from an older upload", async () => {
    await uploadBrandAssetAction("logo", dataUrl("image/gif", gif(2)), dataUrl("image/png", png()));
    const version = (await getBranding(handle.db)).assets.logo!.version;
    // No copy yet: the original is served (the route has a copy made once it has responded).
    expect(await getBrandAsset(handle.db, "logo")).toMatchObject({ contentType: "image/gif", original: true, version });
    const webp = Buffer.from("a WebP copy stands in here");
    const copy = { contentType: "image/webp", data: webp, width: 16, height: 16, animated: true };
    expect(await storeWebCopy(handle.db, "logo", version, copy)).toBe(true);
    const served = await getBrandAsset(handle.db, "logo");
    expect(served).toMatchObject({ contentType: "image/webp", original: false, version });
    expect(served!.data.equals(webp)).toBe(true);
    const res = await brandingRoute(new Request(`http://x/api/branding/logo?v=${version}`), { params: Promise.resolve({ asset: "logo" }) });
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await res.arrayBuffer()).equals(webp)).toBe(true);
    // The still frame has no copy of its own yet: it is served as uploaded.
    expect(await getBrandAsset(handle.db, "logo-static")).toMatchObject({ contentType: "image/png", original: true });

    // A new upload drops the old copies, and a copy made from the old upload is refused...
    await new Promise((r) => setTimeout(r, 5));
    await uploadBrandAssetAction("logo", dataUrl("image/gif", gif(3)), dataUrl("image/png", png()));
    const next = (await getBranding(handle.db)).assets.logo!.version;
    expect(next).not.toBe(version);
    expect(await storeWebCopy(handle.db, "logo", version, copy)).toBe(false);
    expect(await getBrandAsset(handle.db, "logo")).toMatchObject({ contentType: "image/gif", original: true, version: next });
    // ...and one that slipped in while the new upload was being saved is never served.
    await handle.db.insert(brandAssets).values({ kind: "logo@web", contentType: "image/webp", data: webp, animated: true, updatedAt: new Date(version) });
    expect(await getBrandAsset(handle.db, "logo")).toMatchObject({ contentType: "image/gif", original: true, version: next });
    // The image's settings never list a copy, and removing the image removes its copies.
    expect((await getBranding(handle.db)).assets.logo).toMatchObject({ version: next, animated: true, hasStatic: true });
    await removeBrandAssetAction("logo");
    const kinds = (await handle.db.select({ kind: brandAssets.kind }).from(brandAssets)).map((r) => r.kind);
    expect(kinds.filter((k) => k.startsWith("logo"))).toEqual([]);
  });

  it("accepts a large animated GIF sent in pieces (over the 4.5 MB request limit) and keeps it animated", async () => {
    // A real 2-frame GIF padded with a comment extension to about 9 MB (comments are legal GIF blocks).
    const frames = gif(2);
    const comment: number[] = [];
    let left = 9_000_000;
    while (left > 0) {
      const n = Math.min(255, left);
      comment.push(n, ...new Array(n).fill(0x41));
      left -= n;
    }
    const big = Buffer.concat([frames.subarray(0, frames.length - 1), Buffer.from([0x21, 0xfe, ...comment, 0x00]), Buffer.from([0x3b])]);
    expect(gifFrameCount(big)).toBe(2);
    const uploadId = "0f0e0d0c-0b0a-4908-8706-050403020100";
    const pieces = Math.ceil(big.length / BRAND_UPLOAD_CHUNK_BYTES);
    expect(pieces).toBe(3);
    for (let i = 0; i < pieces; i++) {
      const body = big.subarray(i * BRAND_UPLOAD_CHUNK_BYTES, (i + 1) * BRAND_UPLOAD_CHUNK_BYTES);
      const res = await uploadRoute(new Request(`http://x/api/branding/upload?kind=background&upload=${uploadId}&index=${i}`, { method: "POST", body: new Uint8Array(body) }));
      expect(res.status).toBe(200);
    }
    const r = await finishBrandUploadAction("background", uploadId, pieces, dataUrl("image/png", png()));
    expect(r.ok).toBe(true);
    expect((await getBranding(handle.db)).assets.background).toMatchObject({ animated: true, hasStatic: true });
    expect(Buffer.from((await getBrandAsset(handle.db, "background"))!.data).equals(big)).toBe(true);
    // The pieces are gone once the image is stored.
    expect(await handle.db.select().from(brandUploadChunks)).toEqual([]);
    await removeBrandAssetAction("background");
  });

  it("refuses an upload over 20 MB, an incomplete upload and a piece over the request limit", async () => {
    const id = "1f0e0d0c-0b0a-4908-8706-050403020100";
    const piece = Buffer.alloc(BRAND_UPLOAD_CHUNK_BYTES, 1);
    let status = 200;
    for (let i = 0; i < 7 && status === 200; i++) status = (await uploadRoute(new Request(`http://x/api/branding/upload?kind=logo&upload=${id}&index=${i}`, { method: "POST", body: new Uint8Array(piece) }))).status;
    expect(status).toBe(400); // the sixth piece would pass 20 MB
    const oversized = await uploadRoute(new Request(`http://x/api/branding/upload?kind=logo&upload=${id}&index=0`, { method: "POST", body: new Uint8Array(BRAND_UPLOAD_CHUNK_BYTES + 1) }));
    expect(oversized.status).toBe(400);
    expect(await finishBrandUploadAction("logo", id, 7, null)).toMatchObject({ ok: false, error: expect.stringMatching(/incomplete/) });
  });

  it("needs the branding permission", async () => {
    state.allow = false;
    expect(await saveBrandingAction({ teamName: "Nope" })).toMatchObject({ ok: false });
    expect(await uploadBrandAssetAction("logo", dataUrl("image/png", png()), null)).toMatchObject({ ok: false });
    expect(await removeBrandAssetAction("logo")).toMatchObject({ ok: false });
    const res = await uploadRoute(new Request("http://x/api/branding/upload?kind=logo&upload=2f0e0d0c-0b0a-4908-8706-050403020100&index=0", { method: "POST", body: new Uint8Array(png()) }));
    expect(res.status).toBe(403);
    expect(await finishBrandUploadAction("logo", "2f0e0d0c-0b0a-4908-8706-050403020100", 1, null)).toMatchObject({ ok: false });
  });

  it("moves a logo saved inline before Phase 3 into the image table", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0013")) {
      for (const statement of m.statements) await db.execute(sql.raw(statement));
      await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    }
    const legacy = { teamName: "Old Team", shortName: "OLD", tagline: "", accent: "#c8aa6e", logoDataUrl: dataUrl("image/png", png()) };
    await db.execute(sql`INSERT INTO app_settings (key, value) VALUES ('branding', ${JSON.stringify(legacy)}::jsonb)`);
    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied).toEqual(["0013_brand_assets", "0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public"]);
    const [row] = await db.select().from(brandAssets);
    expect(row).toMatchObject({ kind: "logo", contentType: "image/png" });
    expect(Buffer.from(row!.data).equals(png())).toBe(true);
    invalidateCache("branding");
    const b = await getBranding(db);
    expect(b).toMatchObject({ teamName: "Old Team", accent: "#c8aa6e" });
    expect(b.assets.logo).not.toBeNull();
    await fresh.close();
  });

  it("sign-in and app backgrounds are separate images, each uploaded and removed on its own", async () => {
    expect((await uploadBrandAssetAction("background", dataUrl("image/gif", gif(2)), dataUrl("image/jpeg", png()))).ok).toBe(true);
    expect((await uploadBrandAssetAction("appBackground", dataUrl("image/png", png()), null)).ok).toBe(true);
    let b = await getBranding(handle.db);
    expect(b.assets.background).toMatchObject({ animated: true });
    expect(b.assets.appBackground).toMatchObject({ animated: false });
    expect((await brandingRoute(new Request("http://x/api/branding/appBackground"), { params: Promise.resolve({ asset: "appBackground" }) })).status).toBe(200);
    expect((await removeBrandAssetAction("appBackground")).ok).toBe(true);
    b = await getBranding(handle.db);
    expect(b.assets.appBackground).toBeNull();
    expect(b.assets.background).not.toBeNull();
  });

  it("migration 0019 copies the existing background to the app background so nothing disappears", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0019")) {
        for (const statement of m.statements) await db.execute(sql.raw(statement));
        await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
      await db.insert(brandAssets).values([
        { kind: "background", contentType: "image/gif", data: gif(2), animated: true },
        { kind: "background-static", contentType: "image/jpeg", data: png(), animated: false },
      ]);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual(["0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public"]);
      const rows = await db.select().from(brandAssets);
      expect(rows.map((r) => r.kind).sort()).toEqual(["appBackground", "appBackground-static", "background", "background-static"]);
      expect(Buffer.from(rows.find((r) => r.kind === "appBackground")!.data).equals(gif(2))).toBe(true);
    } finally {
      await fresh.close();
    }
  });
});


describe("migration 0045: names are settings, and an existing install keeps its own", () => {
  // Migrates a fresh database up to 0044, lets `before` add what an older install had, then runs
  // the rest (0045 onwards) and returns the branding the app reads.
  async function upgrade(before: (db: DbHandle["db"]) => Promise<void>) {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      // One transaction per migration, as the migrator does (0022 locks a table, which needs one).
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0045")) {
        await db.transaction(async (tx) => {
          for (const statement of m.statements) await tx.execute(sql.raw(statement));
          await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
        });
      }
      await before(db);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied[0]).toBe("0045_keep_product_name");
      invalidateCache("branding");
      return await getBranding(db);
    } finally {
      invalidateCache("branding");
      await fresh.close();
    }
  }
  const anAccount = (db: DbHandle["db"]) => db.execute(sql`INSERT INTO users (username, display_name) VALUES ('owner', 'Owner')`);

  it("a new, empty install starts with the neutral names", async () => {
    const b = await upgrade(async () => {});
    expect(b).toMatchObject({ productName: NEUTRAL_NAME, teamName: NEUTRAL_NAME, shortName: NEUTRAL_NAME.toUpperCase() });
  });

  it("an install with accounts and no saved branding keeps UNIIVERSE everywhere", async () => {
    const b = await upgrade(async (db) => {
      await anAccount(db);
    });
    expect(b).toMatchObject({ productName: "UNIIVERSE", teamName: "UNIIVERSE", shortName: "UNIIVERSE" });
  });

  it("saved branding keeps its own names and colours; only the missing app name is filled", async () => {
    const b = await upgrade(async (db) => {
      await anAccount(db);
      await db.execute(sql`INSERT INTO app_settings (key, value) VALUES ('branding', ${JSON.stringify({ teamName: "Old Team", shortName: "OLD", tagline: "Since 2024", accent: "#c8aa6e", backdropLevel: 70 })}::jsonb)`);
    });
    expect(b).toMatchObject({ productName: "UNIIVERSE", teamName: "Old Team", shortName: "OLD", tagline: "Since 2024", accent: "#c8aa6e", backdropLevel: 70 });
  });
});
