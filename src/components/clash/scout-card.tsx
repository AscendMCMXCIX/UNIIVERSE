"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Check, Copy, ExternalLink, History, Pencil, Plus, ScanText, ShieldCheck, Trash2, X } from "lucide-react";
import { ChampionPicker, type PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { verifyOpponentAction } from "@/server/actions/clash";
import { applyVerification, championState, confirmPlayerName, formatPoints, formatRank, nameAlternatives, nameSource, needsCheck, removeVerification, setChampion, setMasteryChampions, setPlayerName, setRank, setRankedChampions, TIERS, tierLabel, type NameSource } from "@/domain/clash-scout/edit";
import { identityState, type CandidateView } from "@/domain/clash-scout/identity";
import { riotIdDraft, verifiedProfileUrl } from "@/domain/clash-scout/links";
import type { MasteryChampion, RankedChampion, ScoutContent, ScoutPlayer } from "@/domain/clash-scout/types";
import { cn } from "@/lib/cn";
import { copyText } from "./copy-text";
import { formatCount, formatDate } from "@/lib/format";

/*
  One opponent, everything at a glance and in the same place on all five cards: the name (a link to
  the player's OP.GG profile once the account is verified), who the account is, the rank, the ranked
  champions and the mastery, each with its champion's portrait. Nothing opens in a window: a name
  read unsurely is confirmed in place, a potential match is confirmed with one tap, an unknown or
  suggested champion is picked from a searchable list, and the pencil turns the card into its own
  editor for anything else.
*/

export interface EarlierView {
  scoutId: string;
  opponentName: string;
  scoutedAt: string;
}

export async function copyName(name: string) {
  if (await copyText(name)) toast.success("Name copied", { description: name, duration: 2000 });
  else toast.error("The browser did not allow copying. Select the name and copy it by hand.");
}

/** How each kind of name is labelled under it: where it came from, in a few words. */
export const SOURCE_LABEL: Record<Exclude<NameSource, "none">, { text: string; title: string }> = {
  verified: { text: "Riot verified", title: "Riot confirmed this exact Riot ID." },
  read: { text: "From the screenshot", title: "Read clearly from the screenshot. A name alone is not an account: it is not verified." },
  check: { text: "Check the name", title: "Read with low confidence, or the two screenshots read it differently: compare it with the screenshot." },
  confirmed: { text: "Confirmed", title: "A member confirmed the name as it was read. Not verified with Riot." },
  corrected: { text: "Corrected", title: "A member corrected the name the screenshot gave. Not verified with Riot." },
  entered: { text: "Entered", title: "Typed by a member: no screenshot read it. Not verified with Riot." },
};

const SOURCE_ICON: Record<Exclude<NameSource, "none">, React.ReactNode> = {
  verified: <BadgeCheck className="h-3.5 w-3.5 text-good" aria-hidden />,
  read: <ScanText className="h-3.5 w-3.5" aria-hidden />,
  check: <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />,
  confirmed: <Check className="h-3.5 w-3.5" aria-hidden />,
  corrected: <Pencil className="h-3.5 w-3.5" aria-hidden />,
  entered: <Pencil className="h-3.5 w-3.5" aria-hidden />,
};

/** A KDA as the client prints it: one decimal ("7.1"), or two when it has them ("3.21"). */
export const formatKda = (kda: number) => kda.toFixed(Math.round(kda * 100) % 10 === 0 ? 1 : 2);

const numberOrNull = (v: string, max: number) => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export interface ScoutCardProps {
  player: ScoutPlayer;
  platform: string;
  /** The saved scout being edited, if any (its own earlier sightings are not "seen before"). */
  scoutId: string | null;
  champions: ReadonlyMap<string, PickerChampion>;
  pickerChampions: PickerChampion[];
  /** The name as it appears in the screenshot (this page only), shown when the reading is unsure. */
  crop: string | null;
  earlier: EarlierView[];
  editable: boolean;
  /** Which screenshots are in (a missing section then says so). */
  shown: { ranked: boolean; mastery: boolean };
  /** Potential matches for the name (undefined while not looked up). */
  candidates: CandidateView[] | undefined;
  /** Grows when the member asked to identify this player (from "Open all verified profiles"): the Riot ID field opens. */
  identifyRequest: number;
  onChange: (change: (content: ScoutContent) => ScoutContent) => void;
  onEarlier: (puuid: string, earlier: EarlierView[]) => void;
  onDismissCandidate: (riotId: string) => void;
}

export function ScoutCard({ player, platform, scoutId, champions, pickerChampions, crop, earlier, editable, shown, candidates, identifyRequest, onChange, onEarlier, onDismissCandidate }: ScoutCardProps) {
  const slot = player.slot;
  const source = nameSource(player);
  const alternatives = source === "check" || source === "corrected" ? nameAlternatives(player) : [];
  const profile = verifiedProfileUrl(player, platform);
  const rank = formatRank(player.rank);
  const [editing, setEditing] = React.useState(false);
  const check = needsCheck(player);
  const label = player.name || `player ${slot + 1}`;

  return (
    <article
      className="flex h-full min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-sm @3xl:row-span-5 @3xl:grid @3xl:grid-rows-subgrid @3xl:gap-y-3"
      data-testid="scout-card"
      data-slot={slot}
      data-editing={editing || undefined}
      aria-label={player.name || `Player ${slot + 1}`}
    >
      <header className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="flex-1 text-2xs font-medium uppercase tracking-label text-fg-subtle">Player {slot + 1}</span>
          {earlier.length ? (
            <Link href={`/clash/${earlier[0]!.scoutId}`} prefetch={false} title={`Scouted before: ${earlier.map((e) => `${e.opponentName} (${formatDate(e.scoutedAt)})`).join(", ")}`} className="rounded-sm focus-visible:outline-2 focus-visible:outline-accent" data-testid="scout-card-earlier">
              <Badge tone="info">
                <History className="h-3 w-3" aria-hidden />
                Seen before
              </Badge>
            </Link>
          ) : null}
          {player.name ? (
            <button type="button" onClick={() => void copyName(player.riotId ?? player.name)} className="grid h-7 w-7 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-md:h-11 max-md:w-11" aria-label={`Copy ${player.riotId ?? player.name}`} title="Copy the name exactly" data-testid="scout-card-copy">
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-pressed={editing}
              className={cn("grid h-7 w-7 place-items-center rounded focus-visible:outline-2 focus-visible:outline-accent max-md:h-11 max-md:w-11", editing ? "bg-accent/15 text-accent-strong" : "text-fg-subtle hover:bg-surface-2 hover:text-fg")}
              aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
              title={editing ? "Done" : "Edit this player"}
              data-testid="scout-card-edit"
            >
              {editing ? <Check className="h-4 w-4" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
            </button>
          ) : null}
        </div>

        {editing ? (
          <NameEditor
            initial={player.name}
            onDone={(name) => {
              if (name !== null && name !== player.name) onChange((c) => setPlayerName(c, slot, name));
            }}
          />
        ) : (
          <div className="flex min-w-0 items-start gap-1">
            {profile ? (
              <a href={profile} target="_blank" rel="noopener noreferrer" className="group min-w-0 break-words text-base font-semibold leading-snug text-fg underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent" title={`Open ${player.riotId} on OP.GG (new tab)`} data-testid="scout-card-name" lang="">
                {player.name}
                <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-fg-subtle group-hover:text-accent" aria-label="(OP.GG, opens in a new tab)" />
              </a>
            ) : (
              <span className={cn("min-w-0 break-words text-base font-semibold leading-snug", player.name ? "text-fg" : "font-normal text-fg-subtle")} data-testid="scout-card-name" lang="">
                {player.name || "Not read"}
              </span>
            )}
            {player.verification === "verified" ? <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-good" aria-label="Riot account verified" data-testid="scout-card-verified" /> : null}
          </div>
        )}

        {source !== "none" && source !== "verified" && !editing ? (
          <p className={cn("flex items-center gap-1 text-xs", source === "check" ? "text-warn" : "text-fg-subtle")} title={SOURCE_LABEL[source].title} data-testid="scout-card-source" data-source={source}>
            {SOURCE_ICON[source]}
            <span className="min-w-0 truncate">
              {SOURCE_LABEL[source].text}
              {source === "corrected" && alternatives[0] ? ` · read as “${alternatives[0]}”` : ""}
            </span>
          </p>
        ) : null}

        {source === "check" && !editing ? (
          <div className="space-y-1 rounded-md border border-warn/30 bg-warn/5 p-1.5" data-testid="scout-card-check">
            {crop ? (
              // eslint-disable-next-line @next/next/no-img-element -- a crop of the member's own screenshot, kept in this page only
              <img src={crop} alt="The name as it appears in the screenshot" className="h-6 max-w-full rounded-sm object-contain object-left" data-testid="scout-card-crop" />
            ) : null}
            {editable ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" onClick={() => onChange((c) => confirmPlayerName(c, slot))} data-testid="scout-card-confirm">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Looks right
                </Button>
                {alternatives.map((a) => (
                  <Button key={a} size="sm" variant="ghost" className="max-w-full" onClick={() => onChange((c) => setPlayerName(c, slot, a))} title={`Use “${a}”: the other screenshot read it this way`} data-testid="scout-card-use-alt" lang="">
                    <span className="truncate">Or “{a}”</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Identity player={player} platform={platform} scoutId={scoutId} editable={editable} editing={editing} candidates={candidates} identifyRequest={identifyRequest} onChange={onChange} onEarlier={onEarlier} onDismissCandidate={onDismissCandidate} />
      </header>

      <div className="min-w-0 space-y-0.5 text-sm" data-testid="scout-card-rank-row">
        {editing ? (
          <RankEditor player={player} onChange={(r) => onChange((c) => setRank(c, slot, r))} />
        ) : rank ? (
          <p className="flex items-center gap-1.5 text-fg" data-testid="scout-card-rank">
            {rank}
            {player.rankCertainty === "low" ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Rank read with low confidence: check it" aria-label="Check the rank" /> : null}
          </p>
        ) : shown.ranked ? (
          <p className="text-fg-subtle">No rank shown</p>
        ) : null}
        {typeof player.totalMastery === "number" ? (
          <p className="text-xs text-fg-muted" data-testid="scout-card-total">
            <span className="tabular-nums text-fg">{formatCount(player.totalMastery)}</span> total mastery
          </p>
        ) : null}
      </div>

      <ChampionList
        kind="ranked"
        rows={player.ranked}
        shown={shown.ranked}
        editing={editing}
        editable={editable}
        champions={champions}
        pickerChampions={pickerChampions}
        playerLabel={label}
        onPick={(index, id) => onChange((c) => setChampion(c, slot, "ranked", index, id))}
        onRows={(rows) => onChange((c) => setRankedChampions(c, slot, rows as RankedChampion[]))}
      />
      <ChampionList
        kind="mastery"
        rows={player.mastery}
        shown={shown.mastery}
        editing={editing}
        editable={editable}
        champions={champions}
        pickerChampions={pickerChampions}
        playerLabel={label}
        onPick={(index, id) => onChange((c) => setChampion(c, slot, "mastery", index, id))}
        onRows={(rows) => onChange((c) => setMasteryChampions(c, slot, rows as MasteryChampion[]))}
      />

      <footer className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-fg-subtle @3xl:mt-0 @3xl:self-start">
        {check.rows || check.champions ? (
          <span title="Rows with a dot could not all be read surely; champions with a question mark are suggestions or unknown." data-testid="scout-card-to-check">
            {[check.rows ? `${check.rows} ${check.rows === 1 ? "row" : "rows"}` : null, check.champions ? `${check.champions} ${check.champions === 1 ? "champion" : "champions"}` : null].filter(Boolean).join(" · ")} to check
          </span>
        ) : null}
      </footer>
    </article>
  );
}

/**
 * Who the account is: verified (its Riot ID, and "Not this account" while editing); potential matches
 * (each with what agrees, confirmed with one tap: Riot then checks that exact Riot ID); or nobody yet
 * (the full Riot ID can be typed, from OP.GG or the client, and checked with Riot).
 */
function Identity({
  player,
  platform,
  scoutId,
  editable,
  editing,
  candidates,
  identifyRequest,
  onChange,
  onEarlier,
  onDismissCandidate,
}: Pick<ScoutCardProps, "player" | "platform" | "scoutId" | "editable" | "candidates" | "identifyRequest" | "onChange" | "onEarlier" | "onDismissCandidate"> & { editing: boolean }) {
  const slot = player.slot;
  const state = identityState(player, candidates);
  const [typing, setTyping] = React.useState(false);
  const [riotId, setRiotId] = React.useState(() => riotIdDraft(player));
  const [checking, setChecking] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  // Asked from "Open all verified profiles": the Riot ID field opens (set while rendering, when the request
  // changes, so the player's own changes never reopen it).
  const [request, setRequest] = React.useState(identifyRequest);
  if (request !== identifyRequest) {
    setRequest(identifyRequest);
    if (editable && player.verification !== "verified") {
      setRiotId(riotIdDraft(player));
      setTyping(true);
    }
  }
  // The field takes the cursor whenever it opens; without scrolling, as the page may be bringing the card into view smoothly.
  React.useEffect(() => {
    if (typing) input.current?.focus({ preventScroll: true });
  }, [typing, identifyRequest]);

  const verify = async (id: string) => {
    setChecking(id);
    const r = await verifyOpponentAction({ riotId: id, platform, scoutId });
    setChecking(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    onChange((c) => applyVerification(c, slot, r.data));
    if (r.data.earlier.length) onEarlier(r.data.puuid, r.data.earlier);
    setTyping(false);
    toast.success("Account verified", { description: r.data.riotId, duration: 2500 });
  };

  if (state === "none") return null;
  if (state === "verified") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-subtle" data-testid="scout-card-identity" data-identity="verified">
        <span className="min-w-0 truncate" title="Riot confirmed this exact Riot ID" data-testid="scout-card-riot-id" lang="">
          {player.riotId}
        </span>
        {editing && editable ? (
          <button type="button" className="text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => onChange((c) => removeVerification(c, slot))} data-testid="scout-card-unverify">
            Not this account
          </button>
        ) : null}
      </div>
    );
  }

  const riotIdForm = (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(riotId.trim());
      }}
    >
      <Input ref={input} value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Name#TAG" aria-label={`Full Riot ID of ${player.name}`} autoComplete="off" spellCheck={false} className="h-8 min-w-0 px-2 text-sm md:pointer-fine:h-8" data-testid="scout-card-riot-input" lang="" />
      <Button type="submit" size="sm" disabled={!!checking || !/#[^#]{3,5}$/.test(riotId.trim())} title="Check this exact Riot ID with Riot" data-testid="scout-card-verify">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {checking === riotId.trim() ? "…" : "Check"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-1.5" data-testid="scout-card-identity" data-identity={state}>
      {state === "possible" ? (
        <div className="space-y-1.5">
          <p className="text-xs text-fg-muted">{candidates!.length > 1 ? `${candidates!.length} known accounts have this name: check which, if any.` : "Possible match: check before relying on it."}</p>
          <ul className="space-y-1.5">
            {candidates!.map((c) => (
              <li key={c.riotId} className="rounded-md border border-border bg-surface-2/50 p-1.5" data-testid="scout-card-candidate" data-strength={c.strength}>
                <div className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" lang="">
                    {c.riotId}
                  </span>
                  <Badge tone={c.strength === "strong" ? "good" : c.strength === "some" ? "info" : "neutral"} title="How much of what the screenshots show agrees with what the team's records hold for this account. It is not proof.">
                    {c.strength === "strong" ? "Strong match" : c.strength === "some" ? "Some match" : "Name only"}
                  </Badge>
                </div>
                <ul className="mt-0.5 space-y-0.5 text-xs text-fg-muted">
                  {c.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {editable ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => void verify(c.riotId)} disabled={!!checking} title="It is this account: Riot checks the Riot ID, and the name links to its profile" data-testid="scout-card-candidate-confirm">
                      <Check className="h-3.5 w-3.5" aria-hidden /> {checking === c.riotId ? "Checking…" : "It's them"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDismissCandidate(c.riotId)} data-testid="scout-card-candidate-dismiss">
                      Not them
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-1 text-xs text-fg-subtle" title="The team's records hold no account by this name. A name alone can belong to several accounts: no profile is linked until Riot confirms the full Riot ID." data-testid="scout-card-unresolved">
          Not identified
        </p>
      )}
      {editable ? (
        typing ? (
          riotIdForm
        ) : (
          <button
            type="button"
            className="text-xs text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              // The name as it stands now (it may have been read or corrected since the card appeared), never a guessed tag.
              setRiotId(riotIdDraft(player));
              setTyping(true);
            }}
            data-testid="scout-card-add-riot-id"
          >
            {state === "possible" ? "Another account? Enter its Riot ID" : "Enter the Riot ID"}
          </button>
        )
      ) : null}
    </div>
  );
}

/** Tier, division and LP, set in place. */
function RankEditor({ player, onChange }: { player: ScoutPlayer; onChange: (rank: ScoutPlayer["rank"]) => void }) {
  const r = player.rank;
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1" data-testid="scout-card-rank-edit">
      <Select aria-label="Tier" value={r?.tier ?? ""} className="h-8 px-1 text-sm md:pointer-fine:h-8" onChange={(e) => onChange(e.target.value ? { tier: e.target.value, division: APEX.has(e.target.value) || e.target.value === "UNRANKED" ? null : (r?.division ?? "IV"), lp: e.target.value === "UNRANKED" ? null : (r?.lp ?? null) } : null)}>
        <option value="">No rank</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {tierLabel(t)}
          </option>
        ))}
      </Select>
      <Select aria-label="Division" value={r?.division ?? ""} disabled={!r || APEX.has(r.tier) || r.tier === "UNRANKED"} className="h-8 px-1 text-sm md:pointer-fine:h-8" onChange={(e) => r && onChange({ ...r, division: e.target.value || null })}>
        <option value="">—</option>
        {["I", "II", "III", "IV"].map((d) => (
          <option key={d}>{d}</option>
        ))}
      </Select>
      <Input aria-label="League points" inputMode="numeric" placeholder="LP" defaultValue={r?.lp ?? ""} disabled={!r || r.tier === "UNRANKED"} className="h-8 px-1.5 text-sm md:pointer-fine:h-8" onBlur={(e) => r && onChange({ ...r, lp: numberOrNull(e.target.value, 5000) })} />
    </div>
  );
}

type AnyRow = RankedChampion | MasteryChampion;

/**
 * A screen's champions: portrait and figures. A champion only suggested, or not recognised, is
 * marked and chosen from the searchable list in one tap; while editing, every champion can be
 * changed, every figure corrected, and rows added or removed.
 */
function ChampionList({
  kind,
  rows,
  shown,
  editing,
  editable,
  champions,
  pickerChampions,
  playerLabel,
  onPick,
  onRows,
}: {
  kind: "ranked" | "mastery";
  rows: AnyRow[];
  shown: boolean;
  editing: boolean;
  editable: boolean;
  champions: ReadonlyMap<string, PickerChampion>;
  pickerChampions: PickerChampion[];
  playerLabel: string;
  onPick: (index: number, championId: string) => void;
  onRows: (rows: AnyRow[]) => void;
}) {
  const [picking, setPicking] = React.useState<number | null>(null);
  const title = kind === "ranked" ? "Ranked" : "Mastery";
  const empty: AnyRow = kind === "ranked" ? { championId: null, games: null, winRate: null, kda: null, certainty: "manual" } : { championId: null, level: null, points: null, certainty: "manual" };
  const suggestion = picking !== null ? rows[picking]?.championId : null;
  return (
    <section aria-label={kind === "ranked" ? "Ranked champions" : "Champion mastery"} className="min-w-0 space-y-1.5">
      {rows.length || editing ? (
        <>
          <h3 className="text-2xs font-medium uppercase tracking-label text-fg-subtle">{title}</h3>
          <ul className="space-y-1.5">
            {rows.map((c, i) => (
              <li key={i} className={cn("min-w-0 text-sm", editing ? "space-y-1 rounded-md border border-border/70 p-1" : "flex items-center gap-2")} data-testid={kind === "ranked" ? "scout-ranked-row" : "scout-mastery-row"}>
                <div className="flex min-w-0 items-center gap-2">
                  <ChampionCell row={c} champions={champions} clickable={editable && (editing || championState(c) === "suggested" || championState(c) === "unknown")} onClick={() => setPicking(i)} where={`${playerLabel}, ${title.toLowerCase()} row ${i + 1}`} />
                  {editing ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{c.championId ? (champions.get(c.championId)?.name ?? c.championId) : "Choose champion"}</span>
                      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-bad focus-visible:outline-2 focus-visible:outline-accent max-md:h-11 max-md:w-11" onClick={() => onRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${title.toLowerCase()} row ${i + 1}`} data-testid="scout-row-remove">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <Figures row={c} />
                  )}
                </div>
                {editing ? <FigureInputs row={c} onRow={(next) => onRows(rows.map((r, j) => (j === i ? next : r)))} /> : null}
              </li>
            ))}
          </ul>
          {editing && rows.length < 5 ? (
            <Button size="sm" variant="ghost" onClick={() => onRows([...rows, empty])} data-testid={`scout-${kind}-add`}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add a champion
            </Button>
          ) : null}
        </>
      ) : shown ? (
        <p className="text-xs text-fg-subtle">{kind === "ranked" ? "No ranked champions read" : "No mastery read"}</p>
      ) : null}
      <ChampionPicker
        open={picking !== null}
        champions={pickerChampions}
        title={suggestion ? `Is it ${champions.get(suggestion)?.name ?? suggestion}?` : "Which champion is it?"}
        highlightIds={suggestion ? new Set([suggestion]) : undefined}
        highlightLabel="Suggested"
        onClose={() => setPicking(null)}
        onSelect={(id) => {
          if (picking !== null) onPick(picking, id);
          setPicking(null);
        }}
      />
    </section>
  );
}

/** A row's champion: its portrait, marked when only suggested or unknown, and a button where it can be chosen. */
function ChampionCell({ row, champions, clickable, onClick, where }: { row: AnyRow; champions: ReadonlyMap<string, PickerChampion>; clickable: boolean; onClick: () => void; where: string }) {
  const state = championState(row);
  const champion = row.championId ? champions.get(row.championId) : null;
  const name = champion?.name ?? row.championId ?? null;
  const title = state === "suggested" ? `Probably ${name}: check it` : state === "unknown" ? "Champion not recognised" : (name ?? undefined);
  const portrait = (
    <span className="relative block">
      <ChampionPortrait champion={champion} size="xs" title={title} className={cn(state === "suggested" && "border-warn ring-1 ring-warn/60")} />
      {state === "suggested" || state === "unknown" ? (
        <span className={cn("absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-4xs font-bold leading-none", state === "suggested" ? "bg-warn text-bg" : "bg-surface-3 text-fg-muted")} aria-hidden>
          ?
        </span>
      ) : null}
    </span>
  );
  if (!clickable) return <span data-testid="scout-champion" data-state={state} data-champion={row.championId ?? ""}>{portrait}</span>;
  return (
    <button type="button" onClick={onClick} className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent" aria-label={`${state === "suggested" ? `Probably ${name}` : state === "unknown" ? "Champion not recognised" : name}, ${where}: choose the champion`} title={title} data-testid="scout-champion" data-state={state} data-champion={row.championId ?? ""}>
      {portrait}
    </button>
  );
}

function Figures({ row }: { row: AnyRow }) {
  const doubtful = row.certainty === "low";
  return (
    <>
      {"winRate" in row ? (
        <span className="min-w-0 flex-1 leading-tight tabular-nums">
          <span className="text-fg">{[row.winRate !== null ? `${row.winRate}%` : null, row.games !== null ? `${row.games} ${row.games === 1 ? "game" : "games"}` : null].filter(Boolean).join(" · ") || "—"}</span>
          {row.kda !== null ? <span className="block text-xs text-fg-muted">{formatKda(row.kda)} KDA</span> : null}
        </span>
      ) : (
        <span className="min-w-0 flex-1 tabular-nums text-fg-muted">
          {row.points !== null ? <span className="text-fg">{formatPoints(row.points)}</span> : "—"}
          {row.level !== null ? ` · Lv ${row.level}` : null}
        </span>
      )}
      {doubtful ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Not all of this row could be read surely: check it" /> : null}
    </>
  );
}

/** A row's figures as small fields; a field only changes the row when its value changed. */
function FigureInputs({ row, onRow }: { row: AnyRow; onRow: (row: AnyRow) => void }) {
  const fields: Array<{ label: string; short: string; value: number | null; set: (v: string) => AnyRow }> =
    "winRate" in row
      ? [
          { label: "Win rate %", short: "%", value: row.winRate, set: (v) => ({ ...row, winRate: numberOrNull(v, 100) }) },
          { label: "Games", short: "G", value: row.games, set: (v) => ({ ...row, games: numberOrNull(v, 100_000) }) },
          { label: "KDA", short: "KDA", value: row.kda, set: (v) => ({ ...row, kda: numberOrNull(v, 99) }) },
        ]
      : [
          { label: "Points", short: "pts", value: row.points, set: (v) => ({ ...row, points: numberOrNull(v.replace(/[\s,.]/g, ""), 100_000_000) }) },
          { label: "Level", short: "Lv", value: row.level, set: (v) => ({ ...row, level: numberOrNull(v, 999) }) },
        ];
  return (
    <div className={cn("grid gap-1", fields.length === 3 ? "grid-cols-3" : "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]")}>
      {fields.map((f) => (
        <label key={f.label} className="relative block min-w-0">
          <span className="sr-only">{f.label}</span>
          <Input
            inputMode="decimal"
            defaultValue={f.value ?? ""}
            placeholder={f.short}
            className="h-8 min-w-0 px-1.5 pr-6 text-sm tabular-nums md:pointer-fine:h-8"
            onBlur={(e) => {
              const next = f.set(e.target.value);
              if (JSON.stringify(next) !== JSON.stringify(row)) onRow(next);
            }}
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-3xs text-fg-subtle" aria-hidden>
            {f.short}
          </span>
        </label>
      ))}
    </div>
  );
}

/** The name, corrected in place: Enter or leaving the field keeps it, Escape cancels. Any script is kept exactly as typed. */
function NameEditor({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name === null ? null : name.trim());
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        value={value}
        maxLength={48}
        spellCheck={false}
        autoComplete="off"
        aria-label="Player name"
        className="h-8 w-full min-w-0 rounded-md border border-accent bg-bg px-2 text-base font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        onChange={(e) => {
          done.current = false;
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          // Enter or Escape while an input method composes (Korean, Japanese, Chinese) belongs to the composition.
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") finish(value);
          else if (e.key === "Escape") {
            setValue(initial);
            finish(null);
          }
        }}
        onBlur={() => finish(value)}
        data-testid="scout-card-name-input"
      />
      {value !== initial ? (
        <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded text-fg-subtle hover:text-fg" onMouseDown={(e) => e.preventDefault()} onClick={() => setValue(initial)} aria-label="Undo the name change">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
