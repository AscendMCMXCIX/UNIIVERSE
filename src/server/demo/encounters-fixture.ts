import { eq, like } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchDetails, matchTimelines, type MatchParticipantDetail } from "@/server/db/schema";

/*
  Demo data only (synthetic DEMO_ games in the in-memory demo): the other players of the demo
  games are made distinct per game (the demo used to reuse one set of filler players everywhere,
  which would read as meeting the same people in every game), and a small pool of recurring
  players is placed in some of them, on either side, across different members' games, so a profile's
  Encounters (Match History) has something realistic to show. One more is met once on each side by
  every member (BOTH_SIDES), so every profile has a player who was both an ally and an opponent
  (Mixed). A game's stored timeline is renamed with it. Real (non-DEMO_) records are never read or
  changed. Running it twice changes nothing.
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

/** Met by every member in their first two games: on their side in one, on the other side in the next. */
const BOTH_SIDES = { id: "echo", name: "Riverside Echo#OCE" };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function applyDemoEncounters(db: Db): Promise<void> {
  const rows = await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%")).orderBy(matchDetails.matchId);
  // How many of each member's games have met BOTH_SIDES so far (in match id order, so the same games every run).
  const bothSides = new Map<string, number>();
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
    // A member's own game (DEMO_<account>_<n>, the member first): BOTH_SIDES on their side in their
    // first game, on the other side in the next.
    const me = next[0];
    if (me && /^DEMO_[^_]+_\d+$/.test(matchId)) {
      const met = bothSides.get(me.puuid) ?? 0;
      const slot = met < 2 ? next.findIndex((p) => (p.puuid.startsWith("demo-filler-") || p.puuid.startsWith("demo-together-")) && (p.teamId === me.teamId) === (met === 0)) : -1;
      if (slot >= 0) {
        next[slot] = { ...next[slot]!, puuid: `demo-regular-${BOTH_SIDES.id}`, name: BOTH_SIDES.name };
        bothSides.set(me.puuid, met + 1);
        changed = true;
      }
    }
    if (!changed) continue;
    await db.update(matchDetails).set({ participants: next }).where(eq(matchDetails.matchId, matchId));
    // The game's timeline follows the same players under their new identities, so its figures
    // still belong to someone in the record (the gold difference needs all ten).
    const renamed = new Map(participants.flatMap((p, i) => (p.puuid !== next[i]!.puuid ? [[p.puuid, next[i]!.puuid] as const] : [])));
    const [timeline] = await db.select({ participants: matchTimelines.participants, frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
    if (!timeline || !renamed.size) continue;
    const to = (puuid: string) => renamed.get(puuid) ?? puuid;
    await db
      .update(matchTimelines)
      .set({
        participants: timeline.participants.map((t) => ({ ...t, puuid: to(t.puuid) })),
        frames: timeline.frames ? { t: timeline.frames.t, p: Object.fromEntries(Object.entries(timeline.frames.p).map(([puuid, series]) => [to(puuid), series])) } : timeline.frames,
      })
      .where(eq(matchTimelines.matchId, matchId));
  }
}
