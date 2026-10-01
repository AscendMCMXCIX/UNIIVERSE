import type { ChampionTraits } from "../champion-model/traits";
import type { Role } from "../roles";

export interface ThreatEntry {
  from: { championId: string; role: Role | null };
  to: { championId: string; role: Role | null } | null;
  kind: "dive" | "pick" | "poke" | "disengage" | "frontline" | "side-lane" | "scaling" | "access";
  /** Positive: favours us; negative: favours them. */
  weight: number;
  text: string;
}

interface Member {
  championId: string;
  role: Role | null;
  traits: ChampionTraits;
  name: string;
}

/**
 * Explicit champion-interaction map between two compositions. Used by recommendations ("their
 * assassin threatens our ADC") and by the playbook (watch for / per-player jobs).
 */
export function threatMap(ours: Member[], theirs: Member[]): ThreatEntry[] {
  const out: ThreatEntry[] = [];
  const ourCarries = ours.filter((m) => m.traits.sustainedDps >= 3 || (m.traits.scaling >= 3 && m.traits.range >= 2));
  const ourPeel = ours.reduce((s, m) => s + m.traits.peel, 0);
  const ourEngage = Math.max(0, ...ours.map((m) => m.traits.engage));
  const theirDisengage = theirs.reduce((s, m) => s + m.traits.counterEngage, 0);
  const theirCarries = theirs.filter((m) => m.traits.sustainedDps >= 3 || (m.traits.scaling >= 3 && m.traits.range >= 2));

  for (const e of theirs) {
    if (e.traits.dive >= 3 || (e.traits.dive >= 2 && e.traits.burst >= 3)) {
      for (const c of ourCarries) out.push({ from: { championId: e.championId, role: e.role }, to: { championId: c.championId, role: c.role }, kind: "dive", weight: -(0.6 - Math.min(0.4, ourPeel * 0.1)), text: `${e.name} threatens ${c.name}${ourPeel >= 4 ? " (we have peel)" : ""}` });
    }
    if (e.traits.pick >= 3) out.push({ from: { championId: e.championId, role: e.role }, to: null, kind: "pick", weight: -0.4, text: `${e.name} catches isolated targets: move as a unit` });
    if (e.traits.poke >= 3 && ourEngage < 2) out.push({ from: { championId: e.championId, role: e.role }, to: null, kind: "poke", weight: -0.5, text: `${e.name} poke with little engage from us to punish it` });
    if (e.traits.counterEngage >= 3 && ourEngage >= 2) {
      const engager = ours.find((m) => m.traits.engage === ourEngage);
      out.push({ from: { championId: e.championId, role: e.role }, to: engager ? { championId: engager.championId, role: engager.role } : null, kind: "disengage", weight: -0.45, text: `${e.name} disrupts ${engager?.name ?? "our"} engage` });
    }
    if (e.traits.scaling >= 3) out.push({ from: { championId: e.championId, role: e.role }, to: null, kind: "scaling", weight: -0.3, text: `${e.name} scales: close the game before they come online` });
  }
  for (const m of ours) {
    if (m.traits.sideLane >= 3) {
      const answer = theirs.find((e) => e.traits.sideLane >= 2 && e.role === m.role);
      if (!answer) out.push({ from: { championId: m.championId, role: m.role }, to: null, kind: "side-lane", weight: 0.5, text: `${m.name} pressures a side lane they struggle to answer` });
    }
    if ((m.traits.dive >= 3 || m.traits.pick >= 3) && theirCarries.length) {
      const target = theirCarries[0]!;
      const theirPeel = theirs.reduce((s, e) => s + e.traits.peel, 0);
      out.push({ from: { championId: m.championId, role: m.role }, to: { championId: target.championId, role: target.role }, kind: "access", weight: 0.5 - Math.min(0.4, theirPeel * 0.1), text: `${m.name} can reach ${target.name}${theirPeel >= 4 ? " through heavy peel" : ""}` });
    }
  }
  if (theirs.filter((e) => e.traits.frontline >= 3).length >= 2 && ours.reduce((s, m) => s + m.traits.sustainedDps, 0) < 5) {
    out.push({ from: { championId: theirs.find((e) => e.traits.frontline >= 3)!.championId, role: null }, to: null, kind: "frontline", weight: -0.4, text: "Their double frontline outlasts our damage" });
  }
  if (theirDisengage >= 4 && ourEngage >= 3) out.push({ from: { championId: theirs[0]!.championId, role: null }, to: null, kind: "disengage", weight: -0.3, text: "Heavy disengage: engage only with flanks or numbers" });
  return out.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 8);
}
