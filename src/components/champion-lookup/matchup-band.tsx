import * as React from "react";
import type { KitChange, KitLine } from "@/domain/matchup/early-kit";
import type { LaneEvidenceView } from "@/domain/matchup/lane-evidence";
import { LEVEL_LABELS, SOURCE_KINDS, bandNotes, noteShown, parseRef, type PairNotes, type ShownNote } from "@/domain/matchup/notes";
import {
  BAND_SUBTITLE,
  BAND_TITLE,
  NOTES_TIP,
  NOTES_TITLE,
  RIOT_SUBTITLE,
  RIOT_TIP,
  RIOT_TITLE,
  WIKI_CREDIT,
  WIKI_LICENCE,
  WIKI_LICENCE_URL,
  bandLabel,
  freshnessWords,
  kitChangeWords,
  noNotesWords,
} from "@/domain/matchup/words";
import { publicPatchName } from "@/domain/patch";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { Fold } from "@/components/ui/fold";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { LaneEvidenceBlock } from "./matchup-evidence";

/*
  MATCHUP INTEL's early-lane band (docs/MATCHUP_INTEL.md; the owner's request of 26 Nov 2026, item
  4): in Champion Intel's Compare with a lane chosen, above the board, one surface with three
  blocks, each named in words by the kind of evidence it is (colour never carries the label):

  - Reviewed notes: what a team administrator wrote and reviewed about this pairing or this
    opponent, with its sources and the patch it was reviewed on; "not re-checked" two and three
    patches on; hidden, with why, when Riot changed a champion since or four patches on.
  - In the team's matches (accounts that may see teammates' statistics): the lane at 10:00 in the
    team's stored games of the pairing, by queue (matchup-evidence.tsx).
  - From Riot's data: the level-1 differences of the same quantity, in neutral words, and what
    Riot changed since the previous stored version.

  From a 60rem band the three sit side by side, each separated by a rule (no card inside the band:
  no boxes within boxes); narrower they stack, notes first. Nothing scrolls inside; "+N more" opens
  the rest in place. The section's name says the lane and the two champions.

  Side by side, the shown points take at most BAND_POINT_LINES lines (one line-clamp over the list:
  the demo's typical two points whole), one less beside the heading's long "not re-checked" line and
  two less beside a hidden note's line, so the notes block is never taller than it is with the demo's
  notes and the board's five abilities stay on the first screen at 1440 × 900 whatever the notes
  hold (domain/matchup/notes bandNotes; e2e/champion-matchup.spec.ts measures the longest notes a
  note may hold). Longer points end in "…"; opening the fold lifts the clamp. Stacked (phones,
  tablets, large text) nothing is clamped: the page scrolls.
*/

export interface MatchupBandData {
  role: Role;
  a: { id: string; name: string };
  b: { id: string; name: string };
  /** The public patch of the first champion's stored version ("26.23"); null for none. */
  patch: string | null;
  kit: { lines: KitLine[]; changes: KitChange[] };
  /** Null: this account may not see teammates' statistics (the block is absent). */
  evidence: LaneEvidenceView | null;
  notes: PairNotes;
}

const BLOCK = "min-w-0 px-3 py-2.5 sm:px-4";

function BlockHeading({ id, title, tip, tipLabel, tipId, meta, metaTone = "muted", metaTestId }: { id: string; title: string; tip: string; tipLabel: string; tipId: string; meta?: string | null; metaTone?: "muted" | "warn"; metaTestId?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <h3 id={id} className="label-text">
        {title}
      </h3>
      <InfoTip label={tipLabel} text={tip} testId={tipId} />
      {meta ? (
        <span className={cn("text-xs", metaTone === "warn" ? "text-warn" : "text-fg-subtle")} data-testid={metaTestId}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/** An ability a point rests on: its key tile and, in words, whose it is. */
function Ref({ refText, names }: { refText: string; names: Readonly<Record<string, string>> }) {
  const r = parseRef(refText);
  if (!r) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-fg-muted" data-testid="matchup-ref" data-ref={refText}>
      <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface-2 text-2xs font-bold leading-none text-fg" data-slot={r.slot}>
        {r.slot}
      </span>
      <span>
        {names[r.champion] ?? r.champion} {r.slot === "P" ? "passive" : r.slot}
      </span>
    </span>
  );
}

function Points({ notes, names }: { notes: ShownNote[]; names: Readonly<Record<string, string>> }) {
  return (
    <>
      {notes.flatMap(({ note }) =>
        note.points.map((p, i) => (
          <li key={`${note.id}-${i}`} className="text-sm text-fg" data-testid="matchup-point" data-scope={note.scope}>
            {p.levels ? <span className="label-text mr-1.5 text-fg-subtle">{LEVEL_LABELS[p.levels]}</span> : null}
            {p.text}{" "}
            <span className="inline-flex flex-wrap gap-x-2 align-middle">
              {p.refs.map((r) => (
                <Ref key={r} refText={r} names={names} />
              ))}
            </span>
          </li>
        )),
      )}
    </>
  );
}

/** A link in the sources' running text: the accent and an underline at rest, never colour alone (docs/STANDARDS.md, WCAG 1.4.1). */
const LINK = "text-accent underline underline-offset-2 hover:text-accent-strong";

function Sources({ notes }: { notes: ShownNote[] }) {
  const all = notes.flatMap(({ note }) => note.sources);
  return (
    <ul className="space-y-1 text-xs text-fg-muted" data-testid="matchup-sources">
      {all.map((s, i) => (
        <li key={i}>
          <span className="text-fg-subtle">{SOURCE_KINDS[s.kind]}: </span>
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="matchup-source-link">
              {s.title}
            </a>
          ) : (
            s.title
          )}
          <span className="text-fg-subtle"> · patch {s.patch}</span>
          {s.kind === "wiki" ? (
            <span className="text-fg-subtle">
              {" "}
              · written in our own words from {WIKI_CREDIT},{" "}
              <a href={WIKI_LICENCE_URL} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="matchup-licence-link">
                {WIKI_LICENCE}
              </a>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The shown points' clamp side by side, by lines (bandNotes), lifted while the notes' fold is open; literal names for Tailwind. */
const CLAMP: Record<number, string> = {
  2: "@min-[60rem]/band:line-clamp-2",
  3: "@min-[60rem]/band:line-clamp-3",
  4: "@min-[60rem]/band:line-clamp-4",
  5: "@min-[60rem]/band:line-clamp-5",
};
const UNCLAMP = "@min-[60rem]/band:group-has-[[data-notes-fold][open]]/notes:line-clamp-none";

function NotesBlock({ data, headingId }: { data: MatchupBandData; headingId: string }) {
  const names = { [data.a.id]: data.a.name, [data.b.id]: data.b.name };
  if ("status" in data.notes) {
    return (
      <div className={BLOCK} data-testid="matchup-notes" data-state="unavailable">
        <BlockHeading id={headingId} title={NOTES_TITLE} tip={NOTES_TIP} tipLabel="About reviewed notes" tipId="matchup-notes-tip" />
        <p className="mt-1 text-sm text-fg-muted">Reviewed notes can&apos;t be loaded right now.</p>
      </div>
    );
  }
  const { notes, currentPatch } = data.notes;
  const shown = notes.filter((n) => noteShown(n.freshness));
  const hidden = notes.filter((n) => !noteShown(n.freshness));
  const fresh = shown.find((n) => n.freshness.state === "fresh");
  const stale = shown.find((n) => n.freshness.state === "stale");
  const meta = fresh ? freshnessWords(fresh.freshness, fresh.note.reviewedPatch, currentPatch, names).meta : stale ? freshnessWords(stale.freshness, stale.note.reviewedPatch, currentPatch, names).meta : null;
  // Points one by one, pair notes first (the read's order); the first VISIBLE_POINTS show, within their lines side by side, the rest open in place.
  const { first, rest, more, lines, long } = bandNotes(shown, { hiddenLine: hidden.length > 0, blocks: data.evidence ? 3 : 2 });
  // "Full text" only side by side, where the clamp is: stacked, every point shows whole.
  const summary = more ? (
    `${more} more · sources`
  ) : long ? (
    <>
      <span className="@min-[60rem]/band:hidden">Sources</span>
      <span className="hidden @min-[60rem]/band:inline">Full text · sources</span>
    </>
  ) : (
    "Sources"
  );
  return (
    <div className={cn(BLOCK, "group/notes")} data-testid="matchup-notes" data-state={shown.length ? "shown" : "none"} data-notes={shown.length} data-hidden={hidden.length}>
      <BlockHeading id={headingId} title={NOTES_TITLE} tip={NOTES_TIP} tipLabel="About reviewed notes" tipId="matchup-notes-tip" meta={meta} metaTone={!fresh && stale ? "warn" : "muted"} metaTestId="matchup-notes-meta" />
      {shown.length ? (
        <>
          <ul className={cn("mt-1 space-y-1", CLAMP[lines], UNCLAMP)} data-testid="matchup-points" data-lines={lines}>
            <Points notes={first} names={names} />
          </ul>
          <Fold variant="inline" tone="accent" summary={summary} testId="matchup-notes-more" bodyClassName="space-y-2" data-notes-fold="">
            {more ? (
              <ul className="space-y-1">
                <Points notes={rest} names={names} />
              </ul>
            ) : null}
            <Sources notes={shown} />
          </Fold>
        </>
      ) : !hidden.length ? (
        <p className="mt-1 text-sm text-fg-muted" data-testid="matchup-notes-line">
          {noNotesWords(data.a.name, data.b.name, data.role)}
        </p>
      ) : null}
      {hidden.map((n) => (
        <p key={n.note.id} className="mt-1 text-sm text-fg-muted" data-testid="matchup-note-hidden" data-freshness={n.freshness.state}>
          {freshnessWords(n.freshness, n.note.reviewedPatch, currentPatch, names).hidden}
        </p>
      ))}
      {shown.map((n) => (
        <span key={n.note.id} hidden data-testid="matchup-note" data-freshness={n.freshness.state} data-reviewed={n.note.reviewedPatch ? publicPatchName(n.note.reviewedPatch) : ""} data-scope={n.note.scope} />
      ))}
    </div>
  );
}

function RiotBlock({ data, headingId }: { data: MatchupBandData; headingId: string }) {
  return (
    <div className={BLOCK} data-testid="matchup-riot">
      <BlockHeading id={headingId} title={RIOT_TITLE} tip={RIOT_TIP} tipLabel="About Riot's data" tipId="matchup-riot-tip" meta={RIOT_SUBTITLE} />
      {data.kit.lines.length ? (
        <dl className="mt-1 space-y-0.5 text-sm">
          {data.kit.lines.map((l) => (
            <div key={l.key} className="flex flex-wrap items-baseline justify-between gap-x-3" data-testid="matchup-kit-line" data-key={l.key} data-values={`${l.a},${l.b}`} data-more={l.more === null ? "" : l.more === 0 ? data.a.id : data.b.id}>
              <dt className="text-fg-muted">{l.label}</dt>
              <dd className="ml-auto text-right tabular-nums text-fg">{l.words}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-fg-muted">Riot&apos;s base statistics for these champions arrive with the next game-data update.</p>
      )}
      {data.kit.changes.map((c) => (
        <p key={c.champion} className="mt-1 text-xs text-fg-muted" data-testid="matchup-kit-change">
          {kitChangeWords(c)}
        </p>
      ))}
    </div>
  );
}

/** The band, from the data the page built on the server (page.tsx MatchupBand). */
export function MatchupBand({ data }: { data: MatchupBandData }) {
  const uid = React.useId();
  const id = (k: string) => `${uid}-${k}`;
  const blocks = data.evidence ? 3 : 2;
  return (
    <section
      aria-labelledby={id("title")}
      className="@container/band panel-depth overflow-hidden rounded-panel border border-border bg-surface"
      data-testid="matchup-band"
      data-lane={data.role}
      data-a={data.a.id}
      data-b={data.b.id}
      data-blocks={blocks}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border px-3 py-1 sm:px-4">
        {/* Its name says the lane and the two champions ("Matchup Intel, Top: Riven against Darius"), beginning with the words shown. */}
        <h2 id={id("title")} aria-label={bandLabel(data.role, data.a.name, data.b.name)} className="text-sm font-semibold text-fg">
          {BAND_TITLE}
        </h2>
        <p className="text-xs text-fg-muted" data-testid="matchup-band-subtitle">
          {BAND_SUBTITLE} · {ROLE_LABELS[data.role]}
          {data.patch ? ` · patch ${data.patch}` : ""}
        </p>
      </div>
      <div className={cn("grid grid-cols-1 divide-y divide-border @min-[60rem]/band:divide-x @min-[60rem]/band:divide-y-0", blocks === 3 ? "@min-[60rem]/band:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]" : "@min-[60rem]/band:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
        <NotesBlock data={data} headingId={id("notes")} />
        {data.evidence ? (
          <div className={BLOCK}>
            <LaneEvidenceBlock evidence={data.evidence} a={data.a.name} b={data.b.name} role={data.role} headingId={id("team")} />
          </div>
        ) : null}
        <RiotBlock data={data} headingId={id("riot")} />
      </div>
    </section>
  );
}
