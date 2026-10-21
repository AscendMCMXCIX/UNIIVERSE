"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ImageDown, Save, Trash2, X } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useSnapTrack } from "@/components/ui/use-snap-track";
import { deleteScoutAction, findCandidatesAction, saveScoutAction, setScoutArchivedAction, updateScoutAction } from "@/server/actions/clash";
import { hasContent, setOpponentName, setPlatform } from "@/domain/clash-scout/edit";
import { evidenceOf, type CandidateView } from "@/domain/clash-scout/identity";
import { clearKind, mergeScreenshot } from "@/domain/clash-scout/merge";
import { nameKey } from "@/domain/clash-scout/text";
import { emptyContent, type ScoutContent, type ScreenshotKind } from "@/domain/clash-scout/types";
import { OPGG_PLATFORMS, opggRegion } from "@/domain/opgg";
import { cn } from "@/lib/cn";
import { clearDraft, loadDraft, saveDraft, type DraftShot, type StoredDraft } from "./draft-store";
import type { ShotResult } from "./recognizer";
import { OpenProfiles } from "./open-profiles";
import { ScoutCard, type EarlierView } from "./scout-card";
import { ShotIntake } from "./shot-intake";
import { useScreenshots } from "./use-screenshots";
import { formatDateTime } from "@/lib/format";

/*
  CLASH SCOUT's workspace, for a new scout (a draft in this browser) and for a saved one. Pasting
  (anywhere on the page), dropping or choosing Clash's two scouting screenshots reads them in the
  browser (the images never leave it) and fills five opponent cards, side by side, each section in
  line with the others. Everything is checked and corrected in the cards themselves; accounts
  UNIIVERSE already knows by those names are offered as potential matches (looked up once the
  names are read), and "Open all 5 profiles" opens the verified players' OP.GG profiles. A draft is
  saved to the team's history only when a member chooses to; a saved scout is edited in place by
  those allowed to.
*/

export interface SavedScoutMeta {
  id: string;
  updatedAt: string;
  scoutedAt: string;
  archived: boolean;
  createdByName: string | null;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export interface ScoutMatchView {
  matchId: string;
  playedAt: string;
  win: boolean | null;
  opponentsFound: number;
}

/** Each screenshot's crops of the names, by player slot (this page only: images are never kept). */
type Crops = Partial<Record<ScreenshotKind, Array<string | null>>>;

type WorkspaceProps = {
  teamId: string;
  saved: SavedScoutMeta | null;
  initial: ScoutContent | null;
  defaultPlatform: string;
  champions: PickerChampion[];
  ddragonVersion: string | null;
  recognition: "real" | "fake";
  earlier: Record<string, EarlierView[]>;
  matches: ScoutMatchView[];
};

/**
 * A new scout starts from the draft kept in this browser, if there is one. The server cannot see
 * that draft, so it draws the empty workspace (the page does not move when it becomes
 * interactive), and the browser puts its draft in place once it has read it; a saved scout
 * renders at once. Until the draft has been read, nothing is saved over it.
 */
export function ClashWorkspace(props: WorkspaceProps) {
  const { saved, teamId } = props;
  // undefined until this browser's draft has been read; then the draft, or null when there is none.
  const [draft, setDraft] = React.useState<StoredDraft | null | undefined>(undefined);
  React.useEffect(() => {
    if (saved) return;
    let current = true;
    void loadDraft(teamId).then((d) => {
      if (current) setDraft(d);
    });
    return () => {
      current = false;
    };
  }, [saved, teamId]);
  if (saved) return <Workspace {...props} draft={null} />;
  return <Workspace key={draft ? "draft" : "new"} {...props} draft={draft ?? null} draftRead={draft !== undefined} />;
}

/** Whether a paste is meant for a field: the focus is in one and the clipboard holds text. */
function pasteIsForField(e: ClipboardEvent): boolean {
  const target = e.target instanceof HTMLElement ? e.target : null;
  const field = !!target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  return field && !!e.clipboardData?.types.includes("text/plain");
}

/** The images in a paste (files, or file items some browsers list only there). */
function pastedImages(e: ClipboardEvent): File[] {
  const data = e.clipboardData;
  if (!data) return [];
  const files = [...data.files].filter((f) => f.type.startsWith("image/"));
  if (files.length) return files;
  return [...data.items].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");

function Workspace({
  teamId,
  saved,
  initial,
  defaultPlatform,
  champions,
  ddragonVersion,
  recognition,
  earlier: earlierInitial,
  matches,
  draft,
  draftRead = true,
}: WorkspaceProps & { draft: StoredDraft | null; /** False until this browser's draft has been read: nothing may be saved over it before. */ draftRead?: boolean }) {
  const router = useRouter();
  const draftMode = !saved;
  const editable = draftMode || saved.canEdit;
  const [content, setContentState] = React.useState<ScoutContent>(() => draft?.content ?? initial ?? emptyContent(defaultPlatform));
  const contentRef = React.useRef(content);
  const setContent = React.useCallback((next: ScoutContent) => {
    contentRef.current = next;
    setContentState(next);
  }, []);
  const [baseline, setBaseline] = React.useState(() => JSON.stringify(initial));
  const [updatedAt, setUpdatedAt] = React.useState(saved?.updatedAt ?? null);
  const [crops, setCrops] = React.useState<Crops>({});
  const [mismatch, setMismatch] = React.useState(false);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [earlier, setEarlier] = React.useState(earlierInitial);
  // Potential matches by what was asked (server, name and evidence), and those a member set aside.
  const [candidates, setCandidates] = React.useState<Record<string, CandidateView[]>>({});
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set());
  const [identify, setIdentify] = React.useState<Record<number, number>>({});
  const [saving, setSaving] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  // Set once the draft is saved to the history: it is then never written back to this browser.
  const savedRef = React.useRef(false);
  const championMap = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const { ref: trackRef, index: current, onScroll, go } = useSnapTrack(content.players.length);

  const onRead = React.useCallback(
    (kind: ScreenshotKind, result: ShotResult, replaces: ScreenshotKind | null) => {
      const base = replaces ? clearKind(contentRef.current, replaces) : contentRef.current;
      const merged = mergeScreenshot(base, result.read, kind);
      setContent(merged.content);
      const bySlot: Array<string | null> = Array(content.players.length).fill(null);
      merged.order.forEach((slot, col) => (bySlot[slot] = result.nameCrops[col] ?? null));
      setCrops((c) => ({ ...c, ...(replaces ? { [replaces]: undefined } : {}), [kind]: bySlot }));
      // Most names read differently in the two screenshots: they may not show the same team.
      setMismatch(merged.disagreements >= 3);
      setWarning(result.warnings[0] ?? null);
    },
    [setContent, content.players.length],
  );
  const onRemove = React.useCallback(
    (kind: ScreenshotKind) => {
      setContent(clearKind(contentRef.current, kind));
      setCrops((c) => ({ ...c, [kind]: undefined }));
      setMismatch(false);
    },
    [setContent],
  );
  const shots = useScreenshots({ recognition, ddragonVersion, initial: draft?.shots ?? [], onRead, onRemove });
  const { add, warmUp } = shots;

  const readShots: DraftShot[] = React.useMemo(
    () => shots.tiles.filter((t) => t.kind && t.readAt && t.fingerprint).map((t) => ({ kind: t.kind!, hash: t.fingerprint!, readAt: t.readAt! })),
    [shots.tiles],
  );
  const busy = shots.tiles.some((t) => t.status === "waiting" || t.status === "reading");

  // Potential matches for the names read (never while screenshots are still being read): one request
  // for every player not yet looked up, a moment after the names settle.
  const lookupKey = React.useCallback((p: ScoutContent["players"][number], platform: string) => `${platform}|${nameKey(p.name)}|${JSON.stringify(evidenceOf(p))}`, []);
  React.useEffect(() => {
    if (!editable || busy) return;
    const wanted = content.players.filter((p) => p.name.trim() && p.verification !== "verified" && !(lookupKey(p, content.platform) in candidates));
    if (!wanted.length) return;
    const t = setTimeout(async () => {
      const r = await findCandidatesAction({ platform: content.platform, players: wanted.map((p) => ({ slot: p.slot, name: p.name.trim(), evidence: evidenceOf(p) })) });
      if (!r.ok) return;
      setCandidates((c) => ({ ...c, ...Object.fromEntries(wanted.map((p) => [lookupKey(p, content.platform), r.data[p.slot] ?? []])) }));
    }, 700);
    return () => clearTimeout(t);
  }, [editable, busy, content.players, content.platform, candidates, lookupKey]);
  const candidatesFor = (p: ScoutContent["players"][number]) => {
    const found = candidates[lookupKey(p, content.platform)];
    return found?.filter((c) => !dismissed.has(`${p.slot}|${c.riotId}`));
  };

  // The draft is kept in this browser as it changes (values only: never an image).
  React.useEffect(() => {
    if (!draftMode || !draftRead) return;
    const t = setTimeout(() => {
      if (savedRef.current) return;
      if (hasContent(content) || readShots.length) saveDraft({ teamId, content, shots: readShots, updatedAt: new Date().toISOString() });
      else clearDraft();
    }, 250);
    return () => clearTimeout(t);
  }, [draftMode, draftRead, teamId, content, readShots]);

  // Pasting a screenshot anywhere on the page reads it; a paste meant for a field (text) is left alone.
  React.useEffect(() => {
    if (!draftMode) return;
    const onPaste = (e: ClipboardEvent) => {
      if (pasteIsForField(e)) return;
      const files = pastedImages(e);
      if (!files.length) return;
      e.preventDefault();
      add(files);
    };
    // Ctrl or ⌘ pressed: a paste may follow, so text recognition starts loading now.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") warmUp();
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [draftMode, add, warmUp]);

  // Screenshots can be dropped anywhere on the page.
  React.useEffect(() => {
    if (!draftMode) return;
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
      warmUp();
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      add([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [draftMode, add, warmUp]);

  const discard = () => {
    if (hasContent(content) && !window.confirm("Discard this scout? Nothing of it is kept.")) return;
    clearDraft();
    setContent(emptyContent(content.platform));
    shots.reset();
    setCrops({});
    setMismatch(false);
    setWarning(null);
  };

  const changePlatform = (platform: string) => {
    const r = setPlatform(content, platform);
    setContent(r.content);
    if (r.cleared) toast.info(`${r.cleared === 1 ? "1 verified account" : `${r.cleared} verified accounts`} were on the previous server: check them again on this one.`);
  };

  const save = async () => {
    setSaving(true);
    if (draftMode) {
      const r = await saveScoutAction(content);
      setSaving(false);
      if (!r.ok) return void toast.error(r.error);
      savedRef.current = true;
      clearDraft();
      toast.success("Scout saved to the team's history", { duration: 2500 });
      router.push(`/clash/${r.data.id}`);
      return;
    }
    const r = await updateScoutAction(saved.id, content, updatedAt);
    setSaving(false);
    if (!r.ok) return void toast.error(r.error);
    setUpdatedAt(r.data.updatedAt);
    setBaseline(JSON.stringify(content));
    toast.success("Changes saved", { duration: 2000 });
    router.refresh();
  };

  const archive = async (archived: boolean) => {
    if (!saved) return;
    const r = await setScoutArchivedAction(saved.id, archived);
    if (!r.ok) return void toast.error(r.error);
    toast.success(archived ? "Scout archived" : "Scout restored", { duration: 2000 });
    router.refresh();
  };

  const remove = async () => {
    if (!saved || !window.confirm("Delete this scout permanently? This cannot be undone.")) return;
    const r = await deleteScoutAction(saved.id);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Scout deleted", { duration: 2000 });
    router.push("/clash");
  };

  const dirty = !draftMode && JSON.stringify(content) !== baseline;
  const change = (f: (c: ScoutContent) => ScoutContent) => setContent(f(contentRef.current));
  // The crop of the screenshot whose reading is the name shown, else any.
  const cropFor = (slot: number) => {
    const p = content.players[slot];
    const reads = p?.nameReads ?? {};
    const matching = (["ranked", "mastery"] as const).find((k) => reads[k] && p && nameKey(reads[k]!.text) === nameKey(p.name) && crops[k]?.[slot]);
    return (matching ? crops[matching]?.[slot] : null) ?? crops.ranked?.[slot] ?? crops.mastery?.[slot] ?? null;
  };
  const earlierFor = (puuid: string | null) => (puuid ? (earlier[puuid] ?? []) : []);
  const has = (kind: ScreenshotKind) => readShots.some((s) => s.kind === kind) || content.players.some((p) => (kind === "ranked" ? p.ranked.length || p.rank : p.mastery.length));
  const shown = { ranked: !!has("ranked"), mastery: !!has("mastery") };
  const filled = hasContent(content);

  return (
    <div className="space-y-4" data-testid="clash-workspace">
      {draftMode ? (
        <ShotIntake
          tiles={shots.tiles}
          announcement={shots.announcement}
          canReadAgain={shots.canReadAgain}
          onFiles={add}
          onRetry={shots.retry}
          onReadAs={shots.readAs}
          onRemove={shots.remove}
          onWarmUp={warmUp}
          dragging={dragging}
        />
      ) : null}

      {draftMode && dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg/60 p-6 backdrop-blur-[2px] motion-safe:fade-in" aria-hidden data-testid="clash-drop-overlay">
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-accent bg-surface px-8 py-6 text-center shadow-lg">
            <ImageDown className="h-6 w-6 text-accent" aria-hidden />
            <p className="text-sm font-medium text-fg">Drop the screenshots to read them</p>
          </div>
        </div>
      ) : null}

      {mismatch ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg" role="alert" data-testid="clash-mismatch">
          Most names in the two screenshots do not match: are they of the same team? The names to check are marked below.
        </p>
      ) : null}
      {warning ? (
        <p className="rounded-md border border-border bg-surface/40 px-3 py-2 text-sm text-fg-muted" data-testid="clash-problem">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <Label htmlFor="clash-opponent">
              Opponent
              {content.opponentCertainty === "low" && content.opponentName ? (
                <Badge tone="warn" className="ml-1.5" title="Read with low confidence: check it against the screenshot.">
                  Check
                </Badge>
              ) : null}
            </Label>
            <Input id="clash-opponent" value={content.opponentName} placeholder="Team name" maxLength={60} disabled={!editable} onChange={(e) => setContent(setOpponentName(content, e.target.value))} data-testid="clash-opponent" />
          </div>
          <div>
            <Label htmlFor="clash-region">Server</Label>
            <Select id="clash-region" value={content.platform} disabled={!editable} onChange={(e) => changePlatform(e.target.value)} data-testid="clash-region">
              {OPGG_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {opggRegion(p)!.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="clash-tournament">Tournament</Label>
            <Input id="clash-tournament" value={content.tournament.name ?? ""} placeholder="e.g. Ionia Cup" maxLength={60} disabled={!editable} onChange={(e) => setContent({ ...content, tournament: { ...content.tournament, name: e.target.value || null } })} />
          </div>
          <div>
            <Label htmlFor="clash-day">Day</Label>
            <Input id="clash-day" value={content.tournament.day ?? ""} placeholder="e.g. Day 2" maxLength={30} disabled={!editable} onChange={(e) => setContent({ ...content, tournament: { ...content.tournament, day: e.target.value || null } })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {draftMode ? (
            <>
              {filled || shots.tiles.length ? (
                <Button variant="ghost" onClick={discard} data-testid="clash-discard">
                  <X className="h-4 w-4" aria-hidden /> Discard
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => void save()} disabled={!filled || saving || busy} title={busy ? "Wait for the screenshots to be read" : undefined} data-testid="clash-save">
                <Save className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Save scout"}
              </Button>
            </>
          ) : (
            <>
              {saved.canArchive ? (
                <Button variant="ghost" onClick={() => void archive(!saved.archived)} data-testid="clash-archive">
                  {saved.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                  {saved.archived ? "Restore" : "Archive"}
                </Button>
              ) : null}
              {saved.canDelete ? (
                <Button variant="danger" onClick={() => void remove()} data-testid="clash-delete">
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </Button>
              ) : null}
              {saved.canEdit ? (
                <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving} data-testid="clash-save-changes">
                  <Save className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {filled ? (
        <OpenProfiles
          players={content.players}
          platform={content.platform}
          onIdentify={(slot) => {
            setIdentify((r) => ({ ...r, [slot]: (r[slot] ?? 0) + 1 }));
            go(slot);
            document.querySelector(`[data-testid="scout-card"][data-slot="${slot}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        />
      ) : null}

      <div className="@container">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-[7%] pb-2 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden @3xl:mx-0 @3xl:grid @3xl:grid-cols-5 @3xl:gap-x-3 @3xl:gap-y-0 @3xl:overflow-visible @3xl:px-0"
          role="region"
          aria-roledescription="carousel"
          aria-label="Opponents"
          data-testid="clash-cards"
        >
          {content.players.map((p, i) => (
            <div
              key={p.slot}
              className="flex w-[86%] max-w-[24rem] shrink-0 snap-center snap-always @3xl:row-span-5 @3xl:grid @3xl:w-auto @3xl:max-w-none @3xl:min-w-0 @3xl:grid-rows-subgrid"
              role="group"
              aria-roledescription="slide"
              aria-label={`${p.name || `Player ${i + 1}`} (${i + 1} of 5)`}
            >
              <ScoutCard
                player={p}
                platform={content.platform}
                scoutId={saved?.id ?? null}
                champions={championMap}
                pickerChampions={champions}
                crop={cropFor(p.slot)}
                earlier={earlierFor(p.puuid)}
                editable={editable}
                shown={shown}
                candidates={candidatesFor(p)}
                identifyRequest={identify[p.slot] ?? 0}
                onChange={change}
                onEarlier={(puuid, list) => setEarlier((e) => ({ ...e, [puuid]: list }))}
                onDismissCandidate={(riotId) => setDismissed((d) => new Set(d).add(`${p.slot}|${riotId}`))}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-center gap-3 @3xl:hidden" data-testid="clash-dots">
          <Button size="sm" variant="ghost" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous player">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          {/* Small dots, finger-sized buttons: each dot sits in a 24px target (44px tall by touch). */}
          <span className="flex items-center">
            {content.players.map((p, i) => (
              <button key={p.slot} type="button" onClick={() => go(i)} aria-label={`Show player ${i + 1}`} aria-current={i === current} className="group grid h-6 w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-8">
                <span aria-hidden className={cn("h-2 w-2 rounded-full transition-colors", i === current ? "bg-accent" : "bg-border-strong group-hover:bg-fg-subtle")} />
              </button>
            ))}
          </span>
          <Button size="sm" variant="ghost" onClick={() => go(current + 1)} disabled={current === content.players.length - 1} aria-label="Next player">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {saved ? (
        <p className="text-xs text-fg-subtle" data-testid="clash-saved-meta">
          Scouted {formatDateTime(saved.scoutedAt)}
          {saved.createdByName ? ` by ${saved.createdByName}` : ""}. A snapshot of what the screenshots showed then.
          {saved.archived ? " Archived." : ""}
          {!saved.canEdit ? " Only the member who saved it, or a lineup manager, can change it." : ""}
        </p>
      ) : (
        <p className="text-xs text-fg-subtle">Recognition can misread names and figures: check what is marked before relying on it. Unsaved scouts stay in this browser only.</p>
      )}

      {matches.length ? (
        <section className="space-y-2" aria-labelledby="clash-matches-h" data-testid="clash-matches">
          <h2 id="clash-matches-h" className="text-sm font-semibold text-fg">
            Games against these accounts
          </h2>
          <ul className="space-y-1 text-sm">
            {matches.map((m) => (
              <li key={m.matchId} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-fg-muted">{formatDateTime(m.playedAt)}</span>
                {m.win === null ? null : <Badge tone={m.win ? "good" : "bad"}>{m.win ? "Win" : "Loss"}</Badge>}
                <span className="text-fg-muted">{m.opponentsFound} of the verified accounts on the other side</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}


      {saved ? (
        <Link href="/clash" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" aria-hidden /> All scouts
        </Link>
      ) : null}
    </div>
  );
}
