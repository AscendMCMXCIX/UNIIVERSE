import type { ColumnRead, ScreenshotRead } from "@/domain/clash-scout/layout";
import type { ScreenshotKind } from "@/domain/clash-scout/types";
import type { OpenedShot, Recognizer } from "./recognizer";
import { fileHash } from "./file-hash";

/*
  Browser tests only (the page passes `recognition: "fake"` when UNIIVERSE_FAKE_SCOUT_OCR=1 on the
  in-memory demo database): a stand-in for OCR that answers from the file's name, so the workspace
  can be tested without downloading Tesseract and its language files. "ranked…" and "mastery…"
  give the readings below (names in several scripts, one name read with low confidence); a name
  with "partial" in it leaves two players unread; with "alt", the last name is read differently
  (as the other screenshot might); "other…" is a screen whose kind cannot be told
  (read as the kind the member chooses); "slow…" takes a moment, "flaky…" fails the first time it
  is read, and anything else gives an image in which nothing could be read. The real pipeline is tested with real OCR in
  tests/clash/recognition.test.ts.
*/

const NAMES: Array<[string, number]> = [
  ["Пётр Пустота", 96],
  ["오징어게임", 92],
  ["ドラゴンの心", 89],
  ["我是大魔王", 94],
  ["xX_Sn1per_Xx", 62],
];
const RANKS = [
  { tier: "GOLD", division: "II", lp: 54 },
  { tier: "EMERALD", division: "IV", lp: 12 },
  { tier: "PLATINUM", division: "I", lp: 87 },
  { tier: "DIAMOND", division: "III", lp: 3 },
  { tier: "MASTER", division: null, lp: 213 },
];
const RANKED: Array<Array<[string | null, number, number, number | null]>> = [
  [["Ahri", 63, 41, 3.21], ["Akali", 48, 25, 2.4], ["Annie", 71, 14, 4.05]],
  [["Amumu", 55, 60, 2.88], ["Diana", 52, 33, 3.1], ["Ekko", 40, 10, 1.95]],
  [["Azir", 58, 52, 3.4], ["Corki", 50, 20, null], [null, 66, 9, 5.2]],
  [["Caitlyn", 61, 88, 3.05], ["Ezreal", 49, 35, 2.6], ["Draven", 57, 21, 2.9]],
  [["Braum", 60, 77, 3.75], ["Bard", 53, 30, 3.33], ["Alistar", 45, 12, 2.1]],
];
const MASTERY: Array<Array<[string, number, number]>> = [
  [["Ahri", 7, 512345], ["Annie", 6, 210004], ["Akali", 5, 98120]],
  [["Amumu", 7, 1204400], ["Ekko", 7, 456700], ["Diana", 4, 40210]],
  [["Azir", 7, 801000], ["Galio", 5, 120330], ["Corki", 5, 60500]],
  [["Caitlyn", 7, 2000150], ["Ezreal", 7, 950000], ["Draven", 6, 300700]],
  [["Braum", 7, 1500300], ["Bard", 7, 700100], ["Alistar", 6, 260900]],
];
const TOTALS = [811, 493, 408, 753, 894];

const box = { x: 0, y: 0, width: 10, height: 10 };
const nothing = (slot: number): ColumnRead => ({ slot, name: null, rank: null, rankLine: null, rankSure: false, totalMastery: null, ranked: [], mastery: [] });

function fakeRead(fileName: string, chosen: ScreenshotKind | undefined): ScreenshotRead {
  const named = /mastery/i.test(fileName) ? "mastery" : /ranked/i.test(fileName) ? "ranked" : null;
  const kind = chosen ?? named;
  const readable = named || /other/i.test(fileName);
  if (!kind || !readable) return { kind: null, kindSure: false, opponent: null, layout: null, rows: [], columns: Array.from({ length: 5 }, (_, slot) => nothing(slot)) };
  const partial = /partial/i.test(fileName);
  return {
    kind,
    kindSure: !!named,
    opponent: { text: "Night Owls Gaming", confidence: 94, box },
    layout: null,
    rows: [],
    columns: NAMES.map(([name, confidence], slot): ColumnRead => {
      if (partial && (slot === 1 || slot === 3)) return nothing(slot);
      const read = /alt/i.test(fileName) && slot === 4 ? { text: "xX_Snlper_Xx", confidence: 80 } : { text: name, confidence };
      return {
        slot,
        name: { ...read, box },
        rank: kind === "ranked" ? RANKS[slot]! : null,
        rankLine: null,
        rankSure: slot !== 2,
        totalMastery: kind === "mastery" ? TOTALS[slot]! : null,
        // Every champion recognised surely, except one suggestion to check (the first player's second ranked row).
        ranked: kind === "ranked" ? RANKED[slot]!.map(([championId, winRate, games, kda], i) => ({ championId, ...(championId ? { championCertainty: slot === 0 && i === 1 ? ("low" as const) : ("high" as const) } : {}), winRate, games, kda, certainty: kda !== null ? ("high" as const) : ("low" as const) })) : [],
        mastery: kind === "mastery" ? MASTERY[slot]!.map(([championId, level, points]) => ({ championId, championCertainty: "high" as const, level, points, certainty: "high" as const })) : [],
      };
    }),
  };
}

/** A small picture of the pasted image, standing in for the crop of an uncertain name. */
async function thumbnail(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = Math.max(1, Math.round((bitmap.height / bitmap.width) * 120));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function createFakeRecognizer(): Recognizer {
  const files = new Map<string, Blob>();
  const attempts = new Map<string, number>();
  return {
    warmUp() {},
    async open(file) {
      const shot: OpenedShot = { fingerprint: await fileHash(file), fileName: file instanceof File ? file.name : "", canvas: null, pixels: null };
      files.set(shot.fingerprint, file);
      return shot;
    },
    async read(shot, opts = {}) {
      opts.onStep?.("Reading names and figures");
      if (/slow/i.test(shot.fileName)) await new Promise((r) => setTimeout(r, 1200));
      const attempt = (attempts.get(shot.fingerprint) ?? 0) + 1;
      attempts.set(shot.fingerprint, attempt);
      if (/flaky/i.test(shot.fileName) && attempt === 1) throw new Error("Text recognition could not be downloaded.");
      const read = fakeRead(shot.fileName, opts.kind);
      const file = files.get(shot.fingerprint);
      const crop = file ? await thumbnail(file) : null;
      return { read, nameCrops: read.columns.map((c) => (c.name && c.name.confidence < 85 ? crop : null)), warnings: [] };
    },
  };
}
