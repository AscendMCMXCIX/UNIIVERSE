import type { TeamProfile } from "./profile";

export interface InteractionNote {
  /** Positive favours us, negative favours them. Roughly in the range [-1, 1]. */
  value: number;
  text: string;
}

export interface InteractionResult {
  /** Aggregate interaction score, roughly in [-1, 1]. */
  score: number;
  notes: InteractionNote[];
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/**
 * How our composition's structure interacts with theirs. Independent of lane matchups and of
 * champion-level win rates; this is the "does our win condition realistically function" layer.
 * Works on partial drafts and expresses confidence through magnitude (few picks → small values).
 */
export function compositionInteraction(ours: TeamProfile, theirs: TeamProfile): InteractionResult {
  const notes: InteractionNote[] = [];
  if (ours.count === 0 || theirs.count === 0) return { score: 0, notes };
  const scale = Math.min(ours.count, theirs.count) / 5;
  const o = ours.totals;
  const e = theirs.totals;

  // Our engage into their disengage/peel.
  if (ours.maxes.engage >= 2) {
    const resistance = e.counterEngage + e.peel * 0.5;
    const v = clamp((ours.maxes.engage - resistance / 2) / 3);
    notes.push({ value: v * 0.8, text: v > 0.2 ? "Our engage should land: they have little disengage" : v < -0.2 ? "They can disengage or peel our engage" : "Engage is contestable" });
  }
  // Their dive against our protection.
  if (theirs.maxes.dive >= 2) {
    const protection = o.peel + o.frontline * 0.4 + o.counterEngage * 0.5;
    const v = clamp((protection / 2 - theirs.maxes.dive) / 3);
    notes.push({ value: v, text: v < -0.2 ? "Their dive threatens our backline" : "We can hold their dive off the carries" });
  }
  // Their poke into our ability to force fights.
  if (e.poke >= 4) {
    const v = clamp((ours.maxes.engage + o.mobility * 0.2 - 2.5) / 3);
    notes.push({ value: v, text: v < -0.2 ? "Their poke will whittle us down unless we can force fights" : "We can close on their poke" });
  }
  // Our poke into their engage.
  if (o.poke >= 4) {
    const v = clamp((2 - theirs.maxes.engage + o.counterEngage * 0.4) / 3);
    notes.push({ value: v, text: v > 0.2 ? "Our poke is safe: they struggle to force onto us" : "They can engage through our poke" });
  }
  // Game-length dynamics.
  const lateEdge = (o.scaling - e.scaling) / 5;
  const earlyEdge = (o.earlyGame - e.earlyGame) / 5;
  if (Math.abs(lateEdge) > 0.3 || Math.abs(earlyEdge) > 0.3) {
    const v = clamp((lateEdge * 0.6 + earlyEdge * 0.4) / 2);
    notes.push({
      value: v,
      text:
        lateEdge > 0.3 && earlyEdge < -0.3
          ? "We outscale but must survive their early pressure"
          : earlyEdge > 0.3 && lateEdge < -0.3
            ? "We must press our early advantage before they outscale"
            : lateEdge > 0
              ? "We hold the late-game edge"
              : "They hold the late-game edge",
    });
  }
  // Their frontline against our ability to kill it.
  if (theirs.frontlineCount >= 2) {
    const v = clamp((o.sustainedDps - 5) / 5);
    notes.push({ value: v, text: v < -0.2 ? "We lack sustained damage to kill their frontline" : "We have the damage to chew through their frontline" });
  }
  // Our CC reliability against their mobility.
  if (theirs.avgMobility >= 2 && ours.reliableCCSources <= 1) {
    notes.push({ value: -0.3, text: "Their mobility makes our crowd control unreliable" });
  }
  // Range control.
  const rangeEdge = (ours.avgRange - theirs.avgRange) / 3;
  if (Math.abs(rangeEdge) > 0.3) {
    notes.push({ value: clamp(rangeEdge * 0.5), text: rangeEdge > 0 ? "We outrange them in neutral" : "They outrange us: avoid slow sieges" });
  }
  // Damage profile vs their itemisation.
  if (ours.count >= 3 && (ours.physicalShare >= 0.85 || ours.physicalShare <= 0.15)) {
    notes.push({ value: -0.25, text: "Single damage type lets them stack one resistance" });
  }
  // Carry access for us.
  if (theirs.hardCarries >= 1 && (ours.maxes.dive >= 2 || ours.maxes.pick >= 2)) {
    const v = clamp((Math.max(ours.maxes.dive, ours.maxes.pick) - e.peel / 2) / 3);
    notes.push({ value: v * 0.6, text: v > 0.2 ? "We can reach their carry" : "Their carry is well protected" });
  }

  const score = clamp(notes.reduce((s, n) => s + n.value, 0) / Math.max(3, notes.length)) * scale;
  return { score, notes };
}
