"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { selectClass } from "@/components/ui/input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { ChampionFilter } from "@/components/champions/champion-filter";

export interface DraftedFilterValues {
  mode: string;
  result: string;
  opponent: string;
  patch: string;
  player: string;
  champion: string;
}

type Key = keyof DraftedFilterValues;
const EMPTY: DraftedFilterValues = { mode: "", result: "", opponent: "", patch: "", player: "", champion: "" };

/**
 * Matches → Drafted: the shared filter bar. Each dropdown says what it holds ("Any patch"), applies
 * at once and keeps the others; Reset clears them all.
 */
export function DraftedFilters({ values: saved, options, champions }: { values: DraftedFilterValues; options: Record<Exclude<Key, "champion">, Array<[string, string]>>; champions: Array<{ id: string; name: string; portraitUrl?: string }> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [values, show] = React.useOptimistic(saved, (_: DraftedFilterValues, next: DraftedFilterValues) => next);
  const go = (change: Partial<DraftedFilterValues>) => {
    const next = { ...values, ...change };
    const q = new URLSearchParams({ view: "drafted" });
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    start(() => {
      show(next);
      router.replace(`/matches?${q.toString()}`, { scroll: false });
    });
  };
  const fields: Array<{ key: Exclude<Key, "champion">; label: string; any: string }> = [
    { key: "mode", label: "Competition", any: "Any competition" },
    { key: "result", label: "Result", any: "Any result" },
    { key: "opponent", label: "Opponent", any: "Any opponent" },
    { key: "patch", label: "Patch", any: "Any patch" },
    { key: "player", label: "Player", any: "Any player" },
  ];
  const nameOf = (key: Exclude<Key, "champion">) => options[key].find(([v]) => v === values[key])?.[1] ?? values[key];
  const chosen = fields.filter((f) => values[f.key]).map((f) => nameOf(f.key));
  if (values.champion) chosen.push(champions.find((c) => c.id === values.champion)?.name ?? values.champion);
  return (
    <FilterBar testId="drafted-filters" summary={chosen.length ? chosen.join(" · ") : "All drafted matches"} activeCount={chosen.length} onReset={() => go(EMPTY)} pending={pending}>
      {fields.map((f) => (
        <FilterField key={f.key} label={f.label} htmlFor={`drafted-${f.key}`}>
          <select id={`drafted-${f.key}`} name={f.key} value={values[f.key]} onChange={(e) => go({ [f.key]: e.target.value })} className={selectClass("md:w-auto md:max-w-[12rem]")} data-testid={`drafted-filter-${f.key}`}>
            <option value="">{f.any}</option>
            {options[f.key].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FilterField>
      ))}
      <FilterField label="Our champion" className="md:w-52">
        <ChampionFilter label="Our champion" value={values.champion ? { scope: "champion", championId: values.champion } : { scope: "all" }} onChange={(v) => go({ champion: v.scope === "champion" ? v.championId : "" })} champions={champions} testId="matches-champion" />
      </FilterField>
    </FilterBar>
  );
}
