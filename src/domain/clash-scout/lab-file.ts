import { z } from "zod";
import { TIERS } from "./edit";
import { emptyLabPlayer, LAB_CHAMPIONS, LAB_FILE_KIND, LAB_PLAYERS, type LabScenario } from "./lab";

/*
  The Testing Lab's checks on a test that comes from outside the page: a scenario sent to the
  server, or a file the tester saved earlier and opens by hand. Server side only (the Lab's
  actions), apart from lab.ts, so the browser never loads the validation library
  (src/app/client-imports.test.ts).
*/

const championEntrySchema = z.object({ championId: z.string().max(40).nullable(), points: z.string().max(24) });
const playerSchema = z.object({
  name: z.string().max(40),
  champions: z.array(championEntrySchema).max(LAB_CHAMPIONS),
  totalScore: z.string().max(12).default(""),
  rank: z
    .object({ tier: z.enum(TIERS as [string, ...string[]]), division: z.string().max(4).nullable() })
    .nullable()
    .default(null),
});

export const labScenarioSchema = z.object({
  teamName: z.string().max(60).default(""),
  platform: z.string().regex(/^[a-z]{2,4}\d?$/),
  referenceDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .default(""),
  dateUnknown: z.boolean().default(false),
  players: z.array(playerSchema).max(LAB_PLAYERS),
});

/** A file exported from the Lab, back into a scenario (five players, five champions each). */
export function importScenario(text: string): { ok: true; scenario: LabScenario } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not JSON." };
  }
  const file = z.object({ kind: z.literal(LAB_FILE_KIND), version: z.literal(1), scenario: labScenarioSchema }).safeParse(raw);
  if (!file.success) return { ok: false, error: "This is not a Testing Lab file (or it was changed by hand in a way it cannot read)." };
  const s = file.data.scenario;
  const players = Array.from({ length: LAB_PLAYERS }, (_, i) => {
    const p = s.players[i];
    if (!p) return emptyLabPlayer();
    return { ...p, champions: Array.from({ length: LAB_CHAMPIONS }, (_, j) => p.champions[j] ?? { championId: null, points: "" }) };
  });
  return { ok: true, scenario: { ...s, players } };
}
