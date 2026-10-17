import { eq, like } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchDetails, type MatchParticipantDetail } from "@/server/db/schema";

/*
  Demo data only (synthetic DEMO_ games in the in-memory demo): the other players of the demo
  games are made distinct per game (the demo used to reuse one set of filler players everywhere,
  which would read as meeting the same people in every game), and a small pool of recurring
  players is placed in some of them, on either side, across different members' games, so Team →
  Matches → Encounters has something realistic to show. Real (non-DEMO_) records are never read
  or changed. Running it twice changes nothing.
*/

/** Recurring demo players: realistic Riot IDs (spaces, accents, other scripts, long names). */
const REGULARS: Array<{ id: string; name: string }> = [
  { id: "kestrel", name: "Kestrel#OCE" },
  { id: "moonbeam", name: "Moonbeam Rider#7777" },
  { id: "jokull", name: "Jökull#EUW" },
  { id: "shiranui", name: "不知火#JP1" },
  { id: "courier", name: "Midnight Courier#OCE" },
  { id: "omega", name: "Ωmega Sentinel#ΩMG" },
  { id: "tidecaller", name: "Tidecaller#ANZ" },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function applyDemoEncounters(db: Db): Promise<void> {
  const rows = await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%"));
  for (const { matchId, participants } of rows) {
    // Games with the demo's recurring duo (the match window's possible groups) are left as they are.
    if (!participants.length || participants.some((p) => p.puuid.startsWith("demo-regular-") || p.puuid.startsWith("demo-duo-") || p.puuid.startsWith(`demo-filler-${matchId}`))) continue;
    const h = hash(matchId);
    let changed = false;
    const next: MatchParticipantDetail[] = participants.map((p) => {
      if (!p.puuid.startsWith("demo-filler-")) return p;
      changed = true;
      return { ...p, puuid: `demo-filler-${matchId}-${p.puuid.slice("demo-filler-".length)}` };
    });
    // About two games in five meet a regular (on the enemy side more often), occasionally two.
    const fillers = next.map((p, i) => ({ p, i })).filter(({ p }) => p.puuid.startsWith("demo-filler-") || p.puuid.startsWith("demo-together-"));
    const place = (slot: number, regular: (typeof REGULARS)[number]) => {
      const target = fillers[slot % Math.max(1, fillers.length)];
      if (!target || next.some((p) => p.puuid === `demo-regular-${regular.id}`)) return;
      next[target.i] = { ...target.p, puuid: `demo-regular-${regular.id}`, name: regular.name };
      changed = true;
    };
    if (h % 5 < 2) place(h % 7, REGULARS[h % REGULARS.length]!);
    if (h % 11 === 0) place((h >>> 3) % 7, REGULARS[(h >>> 4) % REGULARS.length]!);
    if (changed) await db.update(matchDetails).set({ participants: next }).where(eq(matchDetails.matchId, matchId));
  }
}
