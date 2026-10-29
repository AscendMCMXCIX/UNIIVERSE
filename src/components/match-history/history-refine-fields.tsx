"use client";

import * as React from "react";
import { FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { HIGHLIGHTS, type HistoryRefine, type ResultChoice } from "@/domain/history-refine";
import { formatCount, formatIsoDay } from "@/lib/format";
import type { MatchHistoryPage } from "@/server/players/match-history";

/*
  Match History's own Refine fields (rules in domain/history-refine), at the end of the profile's
  shared Refine panel (players/overview-filters): the result, the patch, the days played, a team
  member with or against the player, and the highlights. Each choice is an address parameter, so a
  link keeps it; `set` replaces the address (the list's own navigation, which closes an open game).
*/

type SetChoices = (patch: Record<string, string | null>) => void;
type Options = Pick<MatchHistoryPage, "patchOptions" | "memberOptions">;

const RESULTS: ReadonlyArray<{ key: ResultChoice | null; label: string }> = [
  { key: null, label: "All" },
  { key: "win", label: "Wins" },
  { key: "loss", label: "Losses" },
];

/** Every member parameter at once: choosing one side clears the other. */
const memberPatch = (value: string): Record<string, string | null> => {
  const [side, id] = value.split(":");
  return { with: side === "with" ? id! : null, against: side === "against" ? id! : null };
};

/** "Played with Alice", "Against any team member". */
function memberWords(refine: HistoryRefine, options: Options): string | null {
  if (!refine.member) return null;
  const name = refine.member.id === "any" ? "any team member" : (options.memberOptions.find((m) => m.id === refine.member!.id)?.name ?? "a team member");
  return refine.member.side === "with" ? `With ${name}` : `Against ${name}`;
}

/** Refine's choices in effect, as the shared chips show them (each removes itself). */
export function historyRefinements(refine: HistoryRefine, options: Options, set: SetChoices): Array<{ key: string; text: string; clear: () => void }> {
  const out: Array<{ key: string; text: string; clear: () => void }> = [];
  if (refine.result) out.push({ key: "result", text: refine.result === "win" ? "Wins" : "Losses", clear: () => set({ result: null }) });
  if (refine.patch) out.push({ key: "patch", text: `Patch ${options.patchOptions.find((p) => p.patch === refine.patch)?.label ?? refine.patch}`, clear: () => set({ patch: null }) });
  if (refine.from || refine.to)
    out.push({
      key: "days",
      text: refine.from && refine.to ? (refine.from === refine.to ? formatIsoDay(refine.from) : `${formatIsoDay(refine.from)} – ${formatIsoDay(refine.to)}`) : refine.from ? `From ${formatIsoDay(refine.from)}` : `Until ${formatIsoDay(refine.to!)}`,
      clear: () => set({ from: null, to: null }),
    });
  const member = memberWords(refine, options);
  if (member) out.push({ key: "member", text: member, clear: () => set({ with: null, against: null }) });
  if (refine.highlight) out.push({ key: "highlight", text: HIGHLIGHTS.find((h) => h.key === refine.highlight)!.label, clear: () => set({ hl: null }) });
  return out;
}

export function HistoryRefineFields({ refine, options, set, pending }: { refine: HistoryRefine; options: Options; set: SetChoices; pending: boolean }) {
  const id = React.useId();
  const members = options.memberOptions;
  const memberValue = refine.member ? `${refine.member.side}:${refine.member.id}` : "";
  const patchKnown = !refine.patch || options.patchOptions.some((p) => p.patch === refine.patch);
  return (
    <div className="flex min-w-0 flex-col gap-3 md:grid md:grid-cols-2 md:gap-3" data-testid="history-refine">
      <FilterField label="Result" labelId={`${id}-result`} alwaysLabel>
        <div role="radiogroup" aria-labelledby={`${id}-result`} className={segmentedGroupClass("w-fit")} data-testid="refine-result">
          {RESULTS.map((r) => {
            const on = refine.result === r.key;
            return (
              <button key={r.label} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => set({ result: r.key })} className={segmentClass(on)} data-value={r.key ?? "all"}>
                {r.label}
              </button>
            );
          })}
        </div>
      </FilterField>
      <FilterField label="Highlights" htmlFor={`${id}-hl`} alwaysLabel>
        <Select id={`${id}-hl`} value={refine.highlight ?? ""} disabled={pending} onChange={(e) => set({ hl: e.target.value || null })} className="w-full" data-testid="refine-highlight">
          <option value="">Every game</option>
          {HIGHLIGHTS.map((h) => (
            <option key={h.key} value={h.key}>
              {h.label}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField label="Patch" htmlFor={`${id}-patch`} alwaysLabel>
        <Select id={`${id}-patch`} value={refine.patch ?? ""} disabled={pending} onChange={(e) => set({ patch: e.target.value || null })} className="w-full" data-testid="refine-patch">
          <option value="">Every patch</option>
          {!patchKnown ? <option value={refine.patch!}>Patch {refine.patch} (0)</option> : null}
          {options.patchOptions.map((p) => (
            <option key={p.patch} value={p.patch}>
              Patch {p.label} ({formatCount(p.games)})
            </option>
          ))}
        </Select>
      </FilterField>
      {members.length || refine.member ? (
        <FilterField label="Team members" htmlFor={`${id}-member`} alwaysLabel>
          <Select id={`${id}-member`} value={memberValue} disabled={pending} onChange={(e) => set(e.target.value ? memberPatch(e.target.value) : { with: null, against: null })} className="w-full" data-testid="refine-member">
            <option value="">With or without them</option>
            <option value="with:any">With any team member</option>
            <option value="against:any">Against any team member</option>
            {members.map((m) => (
              <optgroup key={m.id} label={m.name}>
                <option value={`with:${m.id}`}>
                  With {m.name} ({formatCount(m.with)})
                </option>
                <option value={`against:${m.id}`}>
                  Against {m.name} ({formatCount(m.against)})
                </option>
              </optgroup>
            ))}
          </Select>
        </FilterField>
      ) : null}
      <DaysField from={refine.from} to={refine.to} set={set} pending={pending} />
    </div>
  );
}

/** How long a typed or picked date waits before the list follows it (typing a year changes the value at every digit). */
const DAYS_SETTLE_MS = 600;

/** The days played, both ends optional: the list follows a date once it has settled. */
function DaysField({ from, to, set, pending }: { from: string | null; to: string | null; set: SetChoices; pending: boolean }) {
  const id = React.useId();
  const [draft, setDraft] = React.useState({ from: from ?? "", to: to ?? "" });
  // A change from the address (a chip removed, Reset) shows at once.
  const [shown, setShown] = React.useState({ from, to });
  if (shown.from !== from || shown.to !== to) {
    setShown({ from, to });
    setDraft({ from: from ?? "", to: to ?? "" });
  }
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const pendingTimer = timer;
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);
  const change = (key: "from" | "to", value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ from: next.from || null, to: next.to || null }), DAYS_SETTLE_MS);
  };
  return (
    <FilterField label="Played between" labelId={`${id}-days`} alwaysLabel className="md:col-span-2">
      <div role="group" aria-labelledby={`${id}-days`} className="flex min-w-0 flex-wrap items-center gap-2">
        <Input type="date" aria-label="From" value={draft.from} max={draft.to || undefined} disabled={pending} onChange={(e) => change("from", e.target.value)} className="w-auto min-w-0 flex-1 basis-36" data-testid="refine-from" />
        <span className="text-xs text-fg-subtle" aria-hidden>
          and
        </span>
        <Input type="date" aria-label="To" value={draft.to} min={draft.from || undefined} disabled={pending} onChange={(e) => change("to", e.target.value)} className="w-auto min-w-0 flex-1 basis-36" data-testid="refine-to" />
      </div>
    </FilterField>
  );
}
