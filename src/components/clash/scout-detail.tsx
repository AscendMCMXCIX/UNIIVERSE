"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ChampionPicker, type PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { DetailModal } from "@/components/ui/detail-modal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { verifyOpponentAction } from "@/server/actions/clash";
import { TIERS, applyVerification, confirmPlayerName, formatRank, nameAlternatives, nameSource, removeVerification, setMasteryChampions, setPlayerName, setRank, setRankedChampions, tierLabel } from "@/domain/clash-scout/edit";
import { OPGG_MULTISEARCH_URL, riotIdDraft, verifiedProfileUrl } from "@/domain/clash-scout/links";
import type { MasteryChampion, RankedChampion, ScoutContent } from "@/domain/clash-scout/types";
import { copyText } from "./copy-text";
import { copyName, SOURCE_LABEL, type EarlierView } from "./scout-card";

const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const numberOrNull = (v: string, max: number) => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/**
 * One opponent in full: the name (corrected or confirmed in place, with the screenshot's crop
 * beside an unsure reading), finding the account (copy the name, OP.GG Multi-Search, or a full
 * Riot ID checked with Riot), and every figure, each correctable. Read-only without the right to edit.
 */
export function ScoutDetail({
  content,
  slot,
  editable,
  scoutId,
  crop,
  champions,
  earlier,
  onChange,
  onEarlier,
  onClose,
  onPrev,
  onNext,
}: {
  content: ScoutContent;
  slot: number;
  editable: boolean;
  scoutId: string | null;
  crop: string | null;
  champions: PickerChampion[];
  earlier: EarlierView[];
  onChange: (content: ScoutContent) => void;
  onEarlier: (puuid: string, earlier: EarlierView[]) => void;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const player = content.players.find((p) => p.slot === slot)!;
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const source = nameSource(player);
  const alternatives = source === "check" || source === "corrected" ? nameAlternatives(player) : [];
  const profile = verifiedProfileUrl(player, content.platform);
  // The Riot ID being typed, per player (moving to the next player and back keeps it).
  const [riotIds, setRiotIds] = React.useState<Record<number, string>>({});
  const riotId = riotIds[slot] ?? riotIdDraft(player);
  const setRiotId = (v: string) => setRiotIds((r) => ({ ...r, [slot]: v }));
  const [checking, setChecking] = React.useState(false);
  const [picker, setPicker] = React.useState<{ list: "ranked" | "mastery"; index: number } | null>(null);

  const verify = async () => {
    setChecking(true);
    const r = await verifyOpponentAction({ riotId, platform: content.platform, scoutId });
    setChecking(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    onChange(applyVerification(content, slot, r.data));
    if (r.data.earlier.length) onEarlier(r.data.puuid, r.data.earlier);
    toast.success("Account verified", { description: r.data.riotId, duration: 2500 });
  };

  const searchOnOpgg = () => void copyText(player.name).then((ok) => (ok ? toast.info("Name copied: paste it into OP.GG's Multi-Search.", { duration: 4000 }) : toast.error("The browser did not allow copying. Copy the name by hand.")));

  const updateRanked = (list: RankedChampion[]) => onChange(setRankedChampions(content, slot, list));
  const updateMastery = (list: MasteryChampion[]) => onChange(setMasteryChampions(content, slot, list));

  return (
    <DetailModal
      open
      onClose={onClose}
      title={player.name || `Player ${slot + 1}`}
      description={formatRank(player.rank) ?? undefined}
      testId="scout-detail"
      size="standard"
      headerExtra={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous player">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next player">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section aria-labelledby="scout-name-h" className="space-y-2">
          <h3 id="scout-name-h" className="text-sm font-semibold text-fg">
            Name
          </h3>
          {source === "check" && crop ? (
            <figure className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- a crop of the member's own screenshot, kept in this page only */}
              <img src={crop} alt="The name as it appears in the screenshot" className="h-10 max-w-full rounded-sm border border-warn/40 object-contain object-left" data-testid="scout-detail-crop" />
              <figcaption className="text-xs text-fg-muted">As it appears in the screenshot. The reading below is unsure: correct it or confirm it.</figcaption>
            </figure>
          ) : null}
          <div className="flex gap-2">
            <Input aria-label="Player name" value={player.name} onChange={(e) => onChange(setPlayerName(content, slot, e.target.value))} disabled={!editable} maxLength={48} spellCheck={false} autoComplete="off" data-testid="scout-detail-name" />
            {editable && source === "check" ? (
              <Button onClick={() => onChange(confirmPlayerName(content, slot))} data-testid="scout-detail-confirm-name">
                Looks right
              </Button>
            ) : null}
          </div>
          {source !== "none" ? (
            <p className={source === "check" ? "text-xs text-warn" : "text-xs text-fg-subtle"} data-testid="scout-detail-source">
              {SOURCE_LABEL[source].text}. {SOURCE_LABEL[source].title}
            </p>
          ) : null}
          {editable && alternatives.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
              {source === "corrected" ? "The screenshots read:" : "The other screenshot reads:"}
              {alternatives.map((a) => (
                <Button key={a} size="sm" variant="ghost" onClick={() => onChange(setPlayerName(content, slot, a))} data-testid="scout-detail-use-alt" lang="">
                  Use “{a}”
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="scout-account-h" className="space-y-3 rounded-panel border border-border bg-surface-2/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="scout-account-h" className="text-sm font-semibold text-fg">
              Account
            </h3>
            {player.verification === "verified" ? (
              <Badge tone="good">
                <BadgeCheck className="h-3 w-3" aria-hidden /> Verified by Riot
              </Badge>
            ) : (
              <Badge>Unverified</Badge>
            )}
          </div>
          {player.verification === "verified" && player.riotId ? (
            <div className="space-y-2">
              <p className="break-words text-sm text-fg" data-testid="scout-detail-riot-id">
                {player.riotId}
              </p>
              <div className="flex flex-wrap gap-2">
                {profile ? (
                  <a href={profile} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")} data-testid="scout-detail-opgg">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open OP.GG profile
                  </a>
                ) : (
                  <span className="text-xs text-fg-muted">OP.GG does not list this server.</span>
                )}
                <Button size="sm" variant="ghost" onClick={() => void copyName(player.riotId!)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy Riot ID
                </Button>
                {editable ? (
                  <Button size="sm" variant="ghost" onClick={() => onChange(removeVerification(content, slot))} data-testid="scout-detail-unverify">
                    Not this account
                  </Button>
                ) : null}
              </div>
              {earlier.length ? (
                <div className="text-xs text-fg-muted" data-testid="scout-detail-earlier">
                  Scouted before:{" "}
                  {earlier.map((e, i) => (
                    <React.Fragment key={e.scoutId}>
                      {i ? ", " : null}
                      <Link href={`/clash/${e.scoutId}`} prefetch={false} className="text-accent hover:underline">
                        {e.opponentName} ({new Date(e.scoutedAt).toLocaleDateString()})
                      </Link>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">A name alone can belong to several accounts, so no profile is linked until Riot confirms the full Riot ID.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void copyName(player.name)} disabled={!player.name} data-testid="scout-detail-copy">
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy name
                </Button>
                <a href={OPGG_MULTISEARCH_URL} target="_blank" rel="noopener noreferrer" onClick={searchOnOpgg} className={buttonClass("secondary", "sm")} data-testid="scout-detail-multisearch">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Search on OP.GG
                </a>
              </div>
              {editable ? (
                <form
                  className="space-y-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verify();
                  }}
                >
                  <Label htmlFor="scout-riot-id">Riot ID, when you know the tag</Label>
                  <div className="flex gap-2">
                    <Input id="scout-riot-id" value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Name#TAG" autoComplete="off" spellCheck={false} data-testid="scout-detail-riot-input" />
                    <Button type="submit" disabled={checking || !/#.{3,5}$/.test(riotId.trim())} data-testid="scout-detail-verify">
                      <ShieldCheck className="h-4 w-4" aria-hidden />
                      {checking ? "Checking…" : "Check with Riot"}
                    </Button>
                  </div>
                  <p className="text-xs text-fg-subtle">The tag is never guessed: type it from OP.GG or the client. Riot confirms whether that exact account exists.</p>
                </form>
              ) : null}
            </div>
          )}
        </section>

        <section aria-labelledby="scout-rank-h" className="space-y-2">
          <h3 id="scout-rank-h" className="flex items-center gap-2 text-sm font-semibold text-fg">
            Rank
            {player.rankCertainty === "low" ? (
              <Badge tone="warn" title="Read with low confidence: check it against the screenshot.">
                Check
              </Badge>
            ) : null}
            {typeof player.totalMastery === "number" ? <span className="ml-auto text-xs font-normal text-fg-muted">{player.totalMastery.toLocaleString()} total mastery</span> : null}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <Select
              aria-label="Tier"
              value={player.rank?.tier ?? ""}
              disabled={!editable}
              onChange={(e) => onChange(setRank(content, slot, e.target.value ? { tier: e.target.value, division: APEX.has(e.target.value) || e.target.value === "UNRANKED" ? null : (player.rank?.division ?? "IV"), lp: e.target.value === "UNRANKED" ? null : (player.rank?.lp ?? null) } : null))}
            >
              <option value="">Not shown</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {tierLabel(t)}
                </option>
              ))}
            </Select>
            <Select aria-label="Division" value={player.rank?.division ?? ""} disabled={!editable || !player.rank || APEX.has(player.rank.tier) || player.rank.tier === "UNRANKED"} onChange={(e) => player.rank && onChange(setRank(content, slot, { ...player.rank, division: e.target.value || null }))}>
              <option value="">—</option>
              {["I", "II", "III", "IV"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
            <Input aria-label="League points" inputMode="numeric" placeholder="LP" value={player.rank?.lp ?? ""} disabled={!editable || !player.rank || player.rank.tier === "UNRANKED"} onChange={(e) => player.rank && onChange(setRank(content, slot, { ...player.rank, lp: numberOrNull(e.target.value, 5000) }))} />
          </div>
        </section>

        <ChampionRows
          title="Ranked champions"
          testId="scout-detail-ranked"
          rows={player.ranked}
          editable={editable}
          byId={byId}
          onPick={(index) => setPicker({ list: "ranked", index })}
          onRemove={(i) => updateRanked(player.ranked.filter((_, j) => j !== i))}
          onAdd={() => updateRanked([...player.ranked, { championId: null, games: null, winRate: null, kda: null, certainty: "manual" }])}
          fields={[
            { label: "Win rate %", value: (c) => c.winRate, set: (c, v) => ({ ...c, winRate: numberOrNull(v, 100) }) },
            { label: "Games", value: (c) => c.games, set: (c, v) => ({ ...c, games: numberOrNull(v, 100_000) }) },
            { label: "KDA", value: (c) => c.kda, set: (c, v) => ({ ...c, kda: numberOrNull(v, 99) }) },
          ]}
          onRow={(i, row) => updateRanked(player.ranked.map((c, j) => (j === i ? row : c)))}
        />
        <ChampionRows
          title="Mastery"
          testId="scout-detail-mastery"
          rows={player.mastery}
          editable={editable}
          byId={byId}
          onPick={(index) => setPicker({ list: "mastery", index })}
          onRemove={(i) => updateMastery(player.mastery.filter((_, j) => j !== i))}
          onAdd={() => updateMastery([...player.mastery, { championId: null, level: null, points: null, certainty: "manual" }])}
          fields={[
            { label: "Level", value: (c) => c.level, set: (c, v) => ({ ...c, level: numberOrNull(v, 999) }) },
            { label: "Points", value: (c) => c.points, set: (c, v) => ({ ...c, points: numberOrNull(v.replace(/[\s,.]/g, ""), 100_000_000) }) },
          ]}
          onRow={(i, row) => updateMastery(player.mastery.map((c, j) => (j === i ? row : c)))}
        />
      </div>
      <ChampionPicker
        open={picker !== null}
        champions={champions}
        title="Which champion is it?"
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (picker?.list === "ranked") updateRanked(player.ranked.map((c, j) => (j === picker.index ? { ...c, championId: id } : c)));
          else if (picker) updateMastery(player.mastery.map((c, j) => (j === picker.index ? { ...c, championId: id } : c)));
          setPicker(null);
        }}
      />
    </DetailModal>
  );
}

function ChampionRows<T extends { championId: string | null; certainty: string }>({
  title,
  testId,
  rows,
  editable,
  byId,
  fields,
  onPick,
  onRemove,
  onAdd,
  onRow,
}: {
  title: string;
  testId: string;
  rows: T[];
  editable: boolean;
  byId: ReadonlyMap<string, PickerChampion>;
  fields: Array<{ label: string; value: (c: T) => number | null; set: (c: T, v: string) => T }>;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onRow: (index: number, row: T) => void;
}) {
  return (
    <section aria-label={title} className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-fg-subtle">None read.</p> : null}
      <ul className="space-y-2">
        {rows.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onPick(i)} disabled={!editable} className="flex min-w-[9rem] items-center gap-2 rounded-md text-left text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default" aria-label={`Champion: ${c.championId ? (byId.get(c.championId)?.name ?? c.championId) : "not recognised"}${editable ? ". Change" : ""}`}>
              <ChampionPortrait champion={c.championId ? byId.get(c.championId) : null} size="sm" />
              <span className={c.championId && c.certainty !== "low" ? "text-fg" : "text-warn"}>{c.championId ? (byId.get(c.championId)?.name ?? c.championId) : "Pick champion"}</span>
            </button>
            {fields.map((f) => (
              <Input key={f.label} aria-label={f.label} placeholder={f.label} inputMode="decimal" className="w-24 md:pointer-fine:w-24" defaultValue={f.value(c) ?? ""} disabled={!editable} onBlur={(e) => {
                  // Only a changed value makes the row the member's.
                  const next = f.set(c, e.target.value);
                  if (f.value(next) !== f.value(c)) onRow(i, next);
                }} />
            ))}
            {editable ? (
              <Button size="sm" variant="ghost" onClick={() => onRemove(i)} aria-label={`Remove ${title.toLowerCase()} row ${i + 1}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable && rows.length < 5 ? (
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add a champion
        </Button>
      ) : null}
    </section>
  );
}
