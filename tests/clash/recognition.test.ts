import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { decodePng } from "@/server/images/png";
import { MATCH_MARGIN, printOf, similarity, type ChampionPrints, type Rgba } from "@/domain/clash-scout/champion-print";
import { recognizeShot } from "@/domain/clash-scout/recognize";
import type { ScreenshotRead } from "@/domain/clash-scout/layout";
import { mergeScreenshot, NAME_SURE } from "@/domain/clash-scout/merge";
import { emptyContent } from "@/domain/clash-scout/types";
import { hasNonLatin } from "@/domain/clash-scout/text";
import champions from "@/server/riot/fixtures/champions.fixture.json";
import { portraitPixels } from "../fixtures/clash/portrait.mjs";
import { nodeOcr, type NodeOcr } from "./ocr-node";

/*
  Clash Scout recognition end to end, with real OCR: Tesseract, the same engine and models the
  browser loads, reading:

  1. The League client's own scouting screens (tests/fixtures/clash/client-*.png: the two
     screenshots a member pasted, with the friends list and their own name replaced by invented
     ones), as captured and as other captures give them: smaller and larger windows, saved as
     JPEG, cropped to the scouting panel, the client in a window on a larger desktop. Around the
     five columns they show the client's top bar, the team's header, the Clash schedule and its
     timer, and a friends list full of names: none of it may become a player.
  2. Synthetic screens with names in Cyrillic, Hangul, Japanese, Chinese and Latin and synthetic
     champion portraits (scripts/clash-scout-fixtures.mjs), matched against the prints of all
     173 champions.

  The rule throughout: every figure is the one the screen shows, or empty and marked for
  checking; never another figure. Slow (OCR): a few minutes. Run with `pnpm vitest run tests/clash`.
*/

const dir = path.resolve(__dirname, "../fixtures/clash");
let ocr: NodeOcr;
let prints: ChampionPrints;
const ambiguous = new Set<string>();

beforeAll(async () => {
  ocr = await nodeOcr();
  const ids = (champions as { champions: Array<{ id: string }> }).champions.map((c) => c.id);
  prints = { version: "test", ids, prints: ids.map((id) => printOf(portraitPixels(id))) };
  // Synthetic portraits that nearly match another one: recognition rightly leaves those unknown.
  ids.forEach((id, i) => {
    if (ids.some((other, j) => j !== i && similarity(prints.prints[i]!, prints.prints[j]!) > 1 - MATCH_MARGIN)) ambiguous.add(id);
  });
}, 180_000);
afterAll(async () => {
  await ocr.terminate();
});

const pixels = async (image: Buffer): Promise<Rgba> => {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
};

describe("the League client's own scouting screens", () => {
  const truth = JSON.parse(readFileSync(path.join(dir, "client-expected.json"), "utf8")) as {
    opponent: string;
    names: string[];
    ranks: Array<[string, string] | null>;
    totals: number[];
    ranked: Array<Array<[number, number, number]>>;
    mastery: Array<Array<[number, number]>>;
  };
  const source = (kind: "ranked" | "mastery") => readFileSync(path.join(dir, `client-${kind}-1080.png`));
  /** The capture as other members' screens and tools give it. */
  const variants: Record<string, (png: Buffer) => Promise<Buffer>> = {
    "1920×1080, as captured": async (png) => png,
    "1280×720": (png) => sharp(png).resize(1280, 720).png().toBuffer(),
    "2560×1440": (png) => sharp(png).resize(2560, 1440).png().toBuffer(),
    "saved as JPEG": (png) => sharp(png).jpeg({ quality: 50 }).toBuffer(),
    "cropped to the scouting panel": (png) => sharp(png).extract({ left: 20, top: 150, width: 1560, height: 900 }).png().toBuffer(),
    "the client in a window on a 2560×1440 desktop": async (png) =>
      sharp({ create: { width: 2560, height: 1440, channels: 3, background: { r: 46, g: 52, b: 64 } } })
        .composite([{ input: await sharp(png).resize(1600, 900).png().toBuffer(), left: 480, top: 270 }])
        .png()
        .toBuffer(),
  };

  /** Every figure is the screen's, or empty and its row marked for checking. */
  const expectFigures = (read: ScreenshotRead, kind: "ranked" | "mastery", exact: boolean) => {
    read.columns.forEach((c, i) => {
      const rows = kind === "ranked" ? c.ranked.map((r) => ({ got: [r.winRate, r.games, r.kda], certainty: r.certainty })) : c.mastery.map((r) => ({ got: [r.points, r.level], certainty: r.certainty }));
      const want = kind === "ranked" ? truth.ranked[i]! : truth.mastery[i]!;
      expect(rows, `rows of ${truth.names[i]}`).toHaveLength(want.length);
      rows.forEach(({ got, certainty }, j) => {
        got.forEach((v, k) => {
          if (v === null && !exact) expect(certainty, `${truth.names[i]} row ${j + 1} is marked`).toBe("low");
          else expect(v, `${truth.names[i]} row ${j + 1}`).toBe(want[j]![k]);
        });
      });
    });
  };

  for (const [label, make] of Object.entries(variants)) {
    for (const kind of ["ranked", "mastery"] as const) {
      it(`${kind}, ${label}: the five names in order, each player's own figures`, async () => {
        const image = await pixels(await make(source(kind)));
        const read = await recognizeShot(image, ocr.engine, null);
        expect(read.kind).toBe(kind);
        expect(read.layout?.source).toBe("dividers");
        expect(read.columns.map((c) => c.name?.text)).toEqual(truth.names);
        expect(read.opponent?.text).toBe(truth.opponent);
        if (kind === "ranked") expect(read.columns.map((c) => (c.rank ? [c.rank.tier, c.rank.division] : null))).toEqual(truth.ranks);
        else expect(read.columns.map((c) => c.totalMastery)).toEqual(truth.totals);
        expectFigures(read, kind, label.endsWith("as captured"));
      }, 120_000);
    }
  }

  it("pairs the two screens into five players, every rank and mastery figure with its own player", async () => {
    const ranked = await recognizeShot(decodePng(source("ranked"))!, ocr.engine, null);
    const mastery = await recognizeShot(decodePng(source("mastery"))!, ocr.engine, null);
    let content = mergeScreenshot(emptyContent("oc1"), ranked, "ranked").content;
    const merged = mergeScreenshot(content, mastery, "mastery");
    content = merged.content;
    expect(merged.disagreements).toBe(0);
    expect(content.opponentName).toBe("WTF");
    content.players.forEach((p, i) => {
      expect(p.name).toBe(truth.names[i]);
      // Both screens read the same name: it is trusted, and still only a name (no account).
      expect(p.nameCertainty).toBe("high");
      expect(p.rank ? [p.rank.tier, p.rank.division] : null).toEqual(truth.ranks[i]);
      expect(p.totalMastery).toBe(truth.totals[i]);
      expect(p.ranked.map((r) => [r.winRate, r.games, r.kda])).toEqual(truth.ranked[i]);
      expect(p.mastery.map((r) => [r.points, r.level])).toEqual(truth.mastery[i]);
      expect(p).toMatchObject({ verification: "unverified", riotId: null, puuid: null });
    });
  }, 120_000);
});

describe("synthetic screens: names in any script, champions from their portraits", () => {
  const truth = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as {
    opponent: string;
    players: Array<{ name: string; rank: [string, string | null, number]; ranked: Array<[string, number, number, number]>; mastery: Array<[string, number, number]> }>;
  };
  /** The champion recognition should give: the champion, or unknown when its portrait has a near twin. */
  const champion = (got: string | null, want: string) => (got === null && ambiguous.has(want) ? want : got);
  const image = (file: string) => decodePng(readFileSync(path.join(dir, file)))!;
  /** A name is read exactly, or (Latin letters OCR confuses, "l" and "1") marked for checking: never wrong and trusted. */
  const expectName = (got: { text: string; confidence: number } | null, want: string) => {
    if (got?.text === want) return;
    expect(hasNonLatin(want), `${got?.text} for ${want}`).toBe(false);
    expect(got!.confidence, `${got?.text} for ${want} is marked for checking`).toBeLessThan(NAME_SURE);
  };

  for (const file of ["ranked-1600.png", "ranked-1280.png"]) {
    it(`reads the ranked screen at ${file.slice(7, -4)} px: names in any script, ranks, figures and champions`, async () => {
      const read = await recognizeShot(image(file), ocr.engine, prints);
      expect(read.kind).toBe("ranked");
      expect(read.opponent?.text).toBe(truth.opponent);
      read.columns.forEach((col, i) => {
        const want = truth.players[i]!;
        expectName(col.name, want.name);
        expect(col.rank).toEqual({ tier: want.rank[0], division: want.rank[1], lp: want.rank[2] });
        expect(col.ranked).toHaveLength(want.ranked.length);
        col.ranked.forEach((c, j) => {
          const [id, winRate, games, kda] = want.ranked[j]!;
          expect(champion(c.championId, id)).toBe(id);
          // A figure is read, or left empty with its row marked (at small sizes OCR can misread a "%" or drop a decimal point): never wrong.
          for (const [got, w] of [[c.winRate, winRate], [c.games, games], [c.kda, kda]] as const) {
            if (got === null) expect(c.certainty).toBe("low");
            else expect(got).toBe(w);
          }
        });
      });
    }, 120_000);
  }

  it("reads the mastery screen and pairs it with the ranked one, player by player", async () => {
    const ranked = await recognizeShot(image("ranked-1600.png"), ocr.engine, prints);
    const mastery = await recognizeShot(image("mastery-1600.png"), ocr.engine, prints);
    expect(mastery.kind).toBe("mastery");
    let content = mergeScreenshot(emptyContent("oc1"), ranked, "ranked").content;
    content = mergeScreenshot(content, mastery, "mastery").content;
    content.players.forEach((p, i) => {
      const want = truth.players[i]!;
      // Names in other scripts come through exactly. A Latin name OCR reads differently in the two
      // screens ("Sn1per" and "Snlper") is kept with the other reading offered, marked for checking.
      if (hasNonLatin(want.name)) expect(p.name).toBe(want.name);
      else if (p.name !== want.name) expect(p.nameCertainty).toBe("low");
      expect(p.mastery.map((m, j) => [champion(m.championId, want.mastery[j]![0]), m.level, m.points])).toEqual(want.mastery);
      expect(p.ranked).toHaveLength(3);
      // A name is never an account: nothing is verified by reading screenshots.
      expect(p).toMatchObject({ verification: "unverified", riotId: null, puuid: null });
    });
  }, 180_000);
});
