import type { ScreenshotRead } from "@/domain/clash-scout/layout";
import type { Recognizer } from "./recognizer";
import { fileHash } from "./file-hash";

/*
  Browser tests only (the page passes `recognition: "fake"` when UNIIVERSE_FAKE_SCOUT_OCR=1 on the
  in-memory demo database): a stand-in for OCR that answers from the file's name, so the workspace
  can be tested without downloading Tesseract and its language files. "ranked…" and "mastery…"
  give the readings below (names in several scripts, one name read with low confidence); any other
  name gives an image in which nothing could be read. The real pipeline is tested with real OCR in
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

const box = { x: 0, y: 0, width: 10, height: 10 };

function fakeRead(fileName: string): ScreenshotRead {
  const kind = /mastery/i.test(fileName) ? "mastery" : /ranked/i.test(fileName) ? "ranked" : null;
  if (!kind) return { kind: null, kindSure: false, opponent: null, columns: Array.from({ length: 5 }, (_, slot) => ({ slot, name: null, rank: null, ranked: [], mastery: [] })) };
  return {
    kind,
    kindSure: true,
    opponent: { text: "Night Owls Gaming", confidence: 94, box },
    columns: NAMES.map(([name, confidence], slot) => ({
      slot,
      name: { text: name, confidence, box },
      rank: RANKS[slot]!,
      ranked: kind === "ranked" ? RANKED[slot]!.map(([championId, winRate, games, kda]) => ({ championId, winRate, games, kda, certainty: championId ? ("high" as const) : ("low" as const) })) : [],
      mastery: kind === "mastery" ? MASTERY[slot]!.map(([championId, level, points]) => ({ championId, level, points, certainty: "high" as const })) : [],
    })),
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
  return {
    async read(file, onStep) {
      onStep?.("Reading names and figures");
      const read = fakeRead(file instanceof File ? file.name : "");
      const crop = await thumbnail(file);
      return {
        hash: await fileHash(file),
        read,
        nameCrops: read.columns.map((c) => (c.name && c.name.confidence < 85 ? crop : null)),
        opponentCrop: null,
        warnings: read.kind ? [] : ["No players could be read in this image. Is it one of Clash's two scouting screens?"],
      };
    },
  };
}
