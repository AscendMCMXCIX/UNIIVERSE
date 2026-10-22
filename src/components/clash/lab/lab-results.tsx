"use client";

import * as React from "react";
import { Check, Download, ShieldCheck, X } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatCount, formatDayMonth, percent } from "@/lib/format";
import { formatMastery } from "@/domain/clash-scout/mastery-input";
import { OUTCOME_LABEL, type ChampionComparison, type Outcome, type Strength } from "@/domain/clash-scout/mastery-match";
import { GRADE_LABEL, type Grade, type LabInput } from "@/domain/clash-scout/lab";
import type { CandidateOutcome } from "@/server/clash/identify";
import type { LabRun, LabRunPlayer } from "@/server/clash/lab";

/*
  What a run of the Testing Lab found, the same way for every kind of test: a few figures for the
  whole run, then one card a player with what was entered, what discovery found, every candidate
  with what agrees and what contradicts it, champion by champion, and (blind tests only) where the
  right account ranked. A manual test has no known answers: nothing in it is called correct.
*/

export const OUTCOME_TONE: Record<Outcome, BadgeTone> = {
  verified: "good",
  strong: "accent",
  ambiguous: "warn",
  partial: "info",
  differs: "neutral",
  unscored: "neutral",
  "not-discovered": "neutral",
  "not-enough": "neutral",
};

export const GRADE_TONE: Record<Grade, BadgeTone> = {
  correct: "good",
  incorrect: "bad",
  ambiguous: "warn",
  "not-identified": "neutral",
  "not-discovered": "neutral",
  "not-enough": "neutral",
};

const STRENGTH: Record<Strength, { label: string; tone: BadgeTone }> = {
  strong: { label: "Strong match", tone: "good" },
  partial: { label: "Partial match", tone: "info" },
  differs: { label: "Differs", tone: "bad" },
  unscored: { label: "No mastery to compare", tone: "neutral" },
};

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

function verdictText(c: ChampionComparison): { text: string; tone: "good" | "bad" | "muted" } {
  switch (c.verdict) {
    case "same":
      return { text: "The same", tone: "good" };
    case "grew":
      return { text: `Grew ${formatCount(c.change ?? 0)}`, tone: "good" };
    case "lower":
      return { text: "Fewer: impossible", tone: "bad" };
    case "too-fast":
      return { text: `${formatCount(Math.abs(c.change ?? 0))} more: too fast`, tone: "bad" };
    case "never-played":
      return { text: "Never played", tone: "bad" };
    case "not-in-top":
      return { text: "Not in its later five", tone: "bad" };
    case "plays":
      return { text: "Plays it", tone: "good" };
    case "unknown":
      return { text: "Not known", tone: "muted" };
  }
}

/* ---------- The whole run ---------- */

interface Tile {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "warn";
}

function tilesOf(run: LabRun, graded: boolean): Tile[] {
  const s = run.summary;
  const tiles: Tile[] = [{ label: "Players tested", value: formatCount(s.players) }];
  if (run.condition === "discovery") tiles.push({ label: "Candidates discovered", value: formatCount(s.candidates), hint: "Accounts known by the names entered" });
  if (graded && s.graded) {
    const g = s.graded;
    tiles.push(
      { label: "Correct", value: formatCount(g.correct), hint: "The one account named was the right one", tone: g.correct ? "good" : undefined },
      { label: "Incorrect", value: formatCount(g.incorrect), hint: "A wrong account was named", tone: g.incorrect ? "bad" : undefined },
      { label: "Ambiguous", value: formatCount(g.ambiguous), hint: "Several accounts fit equally well", tone: g.ambiguous ? "warn" : undefined },
      { label: run.condition === "discovery" ? "Not discoverable" : "Right account missing", value: formatCount(g.notDiscovered), hint: run.condition === "discovery" ? "The right account was not among the candidates: a discovery failure" : "The right account was not in the pool" },
      { label: "Not identified", value: formatCount(g.notIdentified + g.notEnough), hint: "No account named, the right one among the candidates" },
      { label: "Resolved correctly", value: s.players ? percent(g.correct / s.players, 0) : "–", hint: `${formatCount(g.correct)} of ${formatCount(s.players)} players` },
      { label: "Right account first", value: `${formatCount(g.topRanked)} of ${formatCount(s.players)}`, hint: "Ranked first, named or not" },
    );
  } else {
    const o = s.outcomes;
    const count = (k: Outcome) => o[k] ?? 0;
    tiles.push(
      { label: "Verified", value: formatCount(count("verified")), hint: "Riot confirmed the exact Riot ID entered" },
      { label: "Strong matches", value: formatCount(count("strong")), hint: "Statistical: never a verified identity" },
      { label: "Several plausible", value: formatCount(count("ambiguous")) },
      { label: "Partial or differing", value: formatCount(count("partial") + count("differs") + count("unscored")) },
      { label: "No candidate", value: formatCount(count("not-discovered")), hint: "No account known by the name" },
      { label: "Not enough entered", value: formatCount(count("not-enough")) },
    );
  }
  tiles.push(
    { label: "Time per player", value: s.avgMs < 1 ? "under 1 ms" : `${formatCount(s.avgMs)} ms`, hint: "Discovery and the rules; Riot's answers included" },
    { label: "Riot requests", value: formatCount(run.requests.accounts + run.requests.mastery), hint: `${formatCount(run.requests.accounts)} account, ${formatCount(run.requests.mastery)} mastery (answers kept a while cost nothing)` },
  );
  return tiles;
}

export function RunSummary({ run, graded }: { run: LabRun; graded: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" data-testid="lab-summary">
      {tilesOf(run, graded).map((t) => (
        <div key={t.label} className="min-w-0 rounded-md border border-border bg-bg-elevated px-2.5 py-2" data-testid="lab-summary-tile" data-label={t.label}>
          <dt className="truncate text-2xs font-semibold uppercase tracking-label text-fg-subtle">{t.label}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", t.tone === "good" ? "text-good" : t.tone === "bad" ? "text-bad" : t.tone === "warn" ? "text-warn" : "text-fg")}>{t.value}</dd>
          {t.hint ? <dd className="text-2xs leading-snug text-fg-subtle">{t.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/* ---------- One player ---------- */

function InputRecap({ input, championMap }: { input: LabInput | undefined; championMap: ReadonlyMap<string, PickerChampion> }) {
  if (!input) return null;
  const { champions, totalScore, capturedAt } = input.shown;
  return (
    <div className="space-y-1" data-testid="lab-result-input">
      <ul className="flex flex-wrap gap-1.5" aria-label="Champions entered">
        {champions.map((c) => {
          const champ = championMap.get(c.championId);
          return (
            <li key={c.championId} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/50 py-0.5 pl-0.5 pr-2 text-xs">
              <ChampionPortrait champion={champ ?? null} size="xs" />
              <span className="text-fg">{champ?.name ?? c.championId}</span>
              <span className="tabular-nums text-fg-muted">{c.points === null ? "no points" : formatMastery(c.points, c.precision)}</span>
            </li>
          );
        })}
        {!champions.length ? <li className="text-xs text-fg-subtle">No champions entered</li> : null}
      </ul>
      <p className="text-2xs text-fg-subtle">
        {totalScore !== null ? `Total mastery ${formatCount(totalScore)} · ` : ""}
        {capturedAt === null ? "Date of the screens unknown: any growth is possible" : `Seen ${formatDayMonth(capturedAt)}`}
        {input.riotId ? ` · Exact Riot ID ${input.riotId}` : ""}
      </p>
    </div>
  );
}

function DiscoveryLines({ player, condition, graded }: { player: LabRunPlayer; condition: LabRun["condition"]; graded: boolean }) {
  const d = player.discovery;
  if (condition === "controlled") return <p className="text-xs text-fg-muted">Controlled pool: names are not used, every account of the pool is compared by mastery alone.</p>;
  if (!d) return null;
  const lines: string[] = [];
  if (d.found) lines.push(`${plural(d.found, "account")} known by this name${d.fromScouts || d.fromGames ? ` (${[d.fromScouts ? `${formatCount(d.fromScouts)} from earlier scouts` : "", d.fromGames ? `${formatCount(d.fromGames)} from recorded games` : ""].filter(Boolean).join(", ")})` : ""}.`);
  else lines.push(graded ? "No account known to UNIIVERSE has this name: a discovery failure." : "No account known to UNIIVERSE has this name.");
  if (d.renamed) lines.push(`${plural(d.renamed, "account")} named otherwise now${player.candidates.some((c) => c.sources.some((s) => s.startsWith("Named "))) ? " (kept: the screens are older than a day)" : " (left out: current screens show current names)"}.`);
  if (d.gone) lines.push(`${plural(d.gone, "account")} Riot no longer knows, or could not name right now.`);
  if (d.capped) lines.push("More accounts had this name than are looked at (three at most).");
  if (d.masteryUnavailable) lines.push(`${d.masteryUnavailable}.`);
  if (d.exact)
    lines.push(
      d.exact.state === "verified"
        ? `Riot confirmed ${d.exact.riotId}${d.exact.discoveredByName ? "; discovery by name found it too" : "; discovery by name alone did not find it"}.`
        : d.exact.state === "not-found"
          ? `Riot has no account named ${d.exact.riotId}.`
          : d.exact.state === "erased"
            ? "The Riot ID entered belongs to a player whose data was erased: not shown."
            : "Riot could not check the Riot ID entered right now.",
    );
  return (
    <ul className="space-y-0.5 text-xs text-fg-muted" data-testid="lab-result-discovery">
      {lines.map((l) => (
        <li key={l} lang="">
          {l}
        </li>
      ))}
    </ul>
  );
}

function ChampionTable({ rows, championMap }: { rows: ChampionComparison[]; championMap: ReadonlyMap<string, PickerChampion> }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] text-left text-xs">
        <thead className="text-2xs uppercase tracking-label text-fg-subtle">
          <tr>
            <th className="py-1 pr-2 font-semibold">Champion</th>
            <th className="py-1 pr-2 text-right font-semibold">Entered</th>
            <th className="py-1 pr-2 text-right font-semibold">Account</th>
            <th className="py-1 font-semibold">Compared</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = verdictText(r);
            return (
              <tr key={r.championId} className="border-t border-border/60" data-testid="lab-champion-row" data-verdict={r.verdict}>
                <td className="py-1 pr-2 text-fg">{championMap.get(r.championId)?.name ?? r.championId}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-fg-muted">{r.shownText ?? "–"}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-fg-muted">{r.known === null ? "–" : formatCount(r.known)}</td>
                <td className={cn("py-1", v.tone === "good" ? "text-good" : v.tone === "bad" ? "text-bad" : "text-fg-subtle")}>{v.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Contradictions shown before "more": the first ones already rule an account out. */
const AGAINST_SHOWN = 3;

function CandidateItem({ c, index, isTruth, graded, championMap }: { c: CandidateOutcome; index: number; isTruth: boolean; graded: boolean; championMap: ReadonlyMap<string, PickerChampion> }) {
  const j = c.judgement;
  const strength = STRENGTH[j.strength];
  const [allAgainst, setAllAgainst] = React.useState(false);
  const against = allAgainst ? j.contradictions : j.contradictions.slice(0, AGAINST_SHOWN);
  const more = j.contradictions.length - against.length;
  return (
    <li className={cn("rounded-md border bg-surface-2/40 p-2", isTruth ? "border-good/50" : "border-border")} data-testid="lab-candidate" data-strength={j.strength} data-verified={c.verified ? "true" : undefined} data-truth={graded ? (isTruth ? "true" : "false") : undefined}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-xs tabular-nums text-fg-subtle">{index + 1}.</span>
        <span className="min-w-0 truncate text-sm font-medium text-fg" lang="">
          {c.label}
        </span>
        {c.verified ? (
          <Badge tone="good">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Verified by Riot
          </Badge>
        ) : null}
        <Badge tone={strength.tone} title="How much of what was entered agrees with this account's figures. A strong match is statistical: it is not proof.">
          {strength.label}
        </Badge>
        {graded && isTruth ? <Badge tone="good">Right account</Badge> : null}
      </div>
      {c.sources.length ? (
        <ul className="mt-1 space-y-0.5 text-2xs text-fg-subtle">
          {c.sources.map((s) => (
            <li key={s} lang="">
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {j.facts.length || j.contradictions.length ? (
        <ul className="mt-1 space-y-0.5 text-xs">
          {against.map((f) => (
            <li key={`x${f}`} className="flex gap-1 text-bad" data-testid="lab-contradiction">
              <X className="mt-0.5 h-3 w-3 shrink-0" aria-label="Against:" />
              <span>{f}</span>
            </li>
          ))}
          {more > 0 ? (
            <li>
              <button type="button" className="text-2xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setAllAgainst(true)} data-testid="lab-contradictions-more">
                {plural(more, "more thing", "more things")} against it
              </button>
            </li>
          ) : null}
          {j.facts.map((f) => (
            <li key={`f${f}`} className="flex gap-1 text-fg-muted">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-good" aria-label="For:" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {j.perChampion.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-2xs font-medium text-fg-muted hover:text-fg">Champion by champion{j.basis ? ` · against ${j.basis}` : ""}</summary>
          <div className="mt-1">
            <ChampionTable rows={j.perChampion} championMap={championMap} />
          </div>
        </details>
      ) : null}
    </li>
  );
}

export function PlayerResult({ player, input, condition, graded, championMap }: { player: LabRunPlayer; input: LabInput | undefined; condition: LabRun["condition"]; graded: boolean; championMap: ReadonlyMap<string, PickerChampion> }) {
  const truthRef = player.truth?.ref;
  return (
    <article className="min-w-0 space-y-2.5 rounded-card border border-border bg-surface p-3 sm:p-4" data-testid="lab-result" data-slot={player.slot} data-outcome={player.outcome} data-grade={player.grade}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="min-w-0 text-sm font-semibold text-fg">
          <span className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Player {player.slot + 1}</span> <span lang="">{player.name}</span>
        </h4>
        <span className="ml-auto flex flex-wrap gap-1">
          <Badge tone={OUTCOME_TONE[player.outcome]}>{OUTCOME_LABEL[player.outcome]}</Badge>
          {graded && player.grade ? <Badge tone={GRADE_TONE[player.grade]}>{GRADE_LABEL[player.grade]}</Badge> : null}
        </span>
      </header>
      <InputRecap input={input} championMap={championMap} />
      <DiscoveryLines player={player} condition={condition} graded={graded} />
      {player.reasons.length ? (
        <ul className="space-y-0.5 text-xs text-fg" data-testid="lab-result-reasons">
          {player.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {player.candidates.length ? (
        <ol className="space-y-1.5" aria-label={`Candidates for ${player.name}, best first`}>
          {player.candidates.map((c, i) => (
            <CandidateItem key={c.ref} c={c} index={player.truth && c.ref === truthRef && player.truth.rank ? player.truth.rank - 1 : i} isTruth={!!truthRef && c.ref === truthRef} graded={graded} championMap={championMap} />
          ))}
        </ol>
      ) : null}
      {player.hidden ? <p className="text-2xs text-fg-subtle">{plural(player.hidden, "more account")} of the pool ranked lower.</p> : null}
      {graded && player.truth ? (
        <p className="border-t border-border pt-2 text-xs text-fg-muted" data-testid="lab-result-truth">
          Right account: <span className="font-medium text-fg" lang="">{player.truth.label}</span>
          {player.truth.rank === null ? (condition === "discovery" ? `, not among the candidates: discovery did not find it${player.truth.renamedSinceGames ? " (it was named otherwise in your team's games with it)" : ""}.` : ", missing from the pool.") : `, ranked ${ordinal(player.truth.rank)}.`}
        </p>
      ) : null}
    </article>
  );
}

/* ---------- A run, with its heading ---------- */

export function LabRunView({ run, inputs, championMap, title, caveat, graded, testId, fileName }: { run: LabRun; inputs: LabInput[]; championMap: ReadonlyMap<string, PickerChampion>; title: string; caveat?: React.ReactNode; graded: boolean; testId: string; fileName: string }) {
  const download = () => {
    const blob = new Blob([JSON.stringify({ kind: "uniiverse-clash-lab-results", version: 1, condition: run.condition, graded, inputs, run }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <section className="space-y-3" aria-label={title} data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {caveat ? <div className="mt-0.5 text-xs text-fg-muted">{caveat}</div> : null}
        </div>
        <Button size="sm" variant="ghost" onClick={download} title="A JSON file of this run, saved by your browser: nothing is stored by UNIIVERSE">
          <Download className="h-3.5 w-3.5" aria-hidden /> Results file
        </Button>
      </div>
      {run.standIn ? (
        <p className="rounded-md border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs text-fg" data-testid="lab-stand-in">
          Stand-in data (test environment): this server has no Riot key, so the Riot figures below are made up. They show how the Lab works, not how well the engine does.
        </p>
      ) : null}
      <RunSummary run={run} graded={graded} />
      {!graded ? <p className="text-xs text-fg-subtle">No right answers are known in a manual test: the results show what the engine concluded, never whether it was right.</p> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {run.players.map((p) => (
          <PlayerResult key={p.slot} player={p} input={inputs.find((i) => i.slot === p.slot)} condition={run.condition} graded={graded} championMap={championMap} />
        ))}
      </div>
    </section>
  );
}
