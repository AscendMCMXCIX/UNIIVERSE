"use client";

import type { LookupFacts } from "@/domain/champion-lookup/view";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  A champion's own facts from Riot's Data Dragon (docs/CHAMPION_INTEL.md, "The page"), said once, in
  the champion's header: its attack range (`stats.attackrange`), its resource (`partype`: "Mana",
  "Energy", "Fury"…, "None" for none; Bel'Veth's empty one left out) and Riot's classes (`tags`).
  Sentence-case labels in the secondary colour, the values in the primary. No "melee" or "ranged":
  Data Dragon has no such field, and the range alone misleads for the champions who change form.
*/

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    // A narrow column puts the value under its label rather than squeeze it (a number never breaks).
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="break-words font-semibold tabular-nums text-fg" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export function ChampionFacts({ facts, className }: { facts: LookupFacts; className?: string }) {
  const range = facts.stats.find((s) => s.key === "attackrange")?.base ?? null;
  const resource = facts.resource || facts.resourceless;
  if (range === null && !resource && !facts.classes.length) return null;
  return (
    <dl className={cn("flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm", className)} data-testid="lookup-facts">
      {range !== null ? (
        <Fact label="Attack range" testId="lookup-range">
          {formatCount(range)}
        </Fact>
      ) : null}
      {resource ? (
        <Fact label="Resource" testId="lookup-resource">
          {facts.resource ?? "None"}
        </Fact>
      ) : null}
      {facts.classes.length ? (
        <Fact label={facts.classes.length > 1 ? "Classes" : "Class"} testId="lookup-classes">
          {facts.classes.join(" · ")}
        </Fact>
      ) : null}
    </dl>
  );
}
