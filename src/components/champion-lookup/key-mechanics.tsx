"use client";

import * as React from "react";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { MECHANIC_GROUP_WORDS } from "@/domain/champion-lookup/mechanics";
import { MECHANICS_SOURCE_WORDS } from "@/domain/champion-lookup/words";
import { formatCount } from "@/lib/format";
import { InfoTip } from "@/components/ui/info-tip";
import type { Slot } from "@/domain/champion-lookup/types";

/*
  Champion Intel's key mechanics (docs/CHAMPION_INTEL.md, "Key mechanics"): one compact block under
  the champion's name. First Riot's own facts for the champion: its attack range, its resource and
  Riot's classes. Then what Riot's ability descriptions name, by group (crowd control, mobility,
  damage types, sustain, defence, how abilities are cast), each kind with the keys of the abilities
  whose description names it (mechanicsOf: fixed word rules, every match with Riot's sentence). A
  key opens that ability's row, where Riot's sentence is marked. No duration, no number from a
  description, no judgement: where the descriptions name nothing of a group, the group is left out.
*/

/** Opens an ability's fold and brings it into view, its summary focused. */
function openAbility(foldId: string) {
  const fold = document.getElementById(foldId);
  if (!(fold instanceof HTMLDetailsElement)) return;
  fold.open = true;
  const summary = fold.querySelector("summary");
  summary?.focus({ preventScroll: true });
  fold.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function Keys({ slots, kind, word, idPrefix }: { slots: readonly Slot[]; kind: string; word: string; idPrefix: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => openAbility(`${idPrefix}-${slot}`)}
          className="touch-target inline-grid h-5 min-w-5 place-items-center rounded-sm border border-border-strong px-1 text-4xs font-bold leading-none text-fg-muted transition-colors hover:border-accent/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${word}: open ${slot === "P" ? "the passive" : slot}`}
          data-kind={kind}
          data-slot={slot}
        >
          {slot}
        </button>
      ))}
    </span>
  );
}

export function KeyMechanics({ lookup, idPrefix }: { lookup: LookupChampion; idPrefix: string }) {
  const facts = lookup.facts;
  const range = facts?.stats.find((s) => s.key === "attackrange")?.base ?? null;
  const groups = lookup.mechanics.groups;
  return (
    <section aria-label={`${lookup.champion.name}'s key mechanics`} className="space-y-1 text-sm" data-testid="lookup-mechanics">
      {facts ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5" data-testid="lookup-facts">
          {range !== null ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="label-caps">Attack range</dt>
              <dd className="font-semibold tabular-nums text-fg" data-testid="lookup-range">
                {formatCount(range)}
              </dd>
            </div>
          ) : null}
          {facts.resource || facts.resourceless ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="label-caps">Resource</dt>
              <dd className="font-semibold text-fg" data-testid="lookup-resource">
                {facts.resource ?? "None"}
              </dd>
            </div>
          ) : null}
          {facts.classes.length ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="label-caps">Riot&apos;s classes</dt>
              <dd className="font-semibold text-fg" data-testid="lookup-classes">
                {facts.classes.join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {groups.length ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5" data-testid="lookup-mechanic-groups">
          {groups.map((g) => (
            <p key={g.group} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1" data-group={g.group}>
              <span className="label-caps">{MECHANIC_GROUP_WORDS[g.group]}</span>
              {g.kinds.map((k, i) => (
                <span key={k.kind} className="inline-flex items-baseline gap-1 whitespace-nowrap" data-testid="lookup-mechanic" data-kind={k.kind}>
                  {i > 0 ? (
                    <span aria-hidden className="text-fg-subtle">
                      ·
                    </span>
                  ) : null}
                  <span className="text-fg">{k.word}</span>
                  <Keys slots={k.slots} kind={k.kind} word={k.word} idPrefix={idPrefix} />
                </span>
              ))}
            </p>
          ))}
          <InfoTip text={MECHANICS_SOURCE_WORDS} className="text-2xs text-fg-subtle" testId="lookup-mechanics-source">
            From Riot&apos;s descriptions
          </InfoTip>
        </div>
      ) : lookup.abilities ? (
        <p className="text-xs text-fg-subtle" data-testid="lookup-mechanics-none">
          Riot&apos;s descriptions of {formatCount(lookup.abilities.length)} abilities name none of the mechanics listed here.
        </p>
      ) : null}
    </section>
  );
}
