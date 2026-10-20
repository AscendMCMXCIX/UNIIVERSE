"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ExternalLink, ImageDown, Save, Trash2, X } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useSnapTrack } from "@/components/ui/use-snap-track";
import { deleteScoutAction, saveScoutAction, setScoutArchivedAction, updateScoutAction } from "@/server/actions/clash";
import { confirmPlayerName, hasContent, setOpponentName, setPlatform, setPlayerName } from "@/domain/clash-scout/edit";
import { OPGG_MULTISEARCH_URL, multiSearchText } from "@/domain/clash-scout/links";
import { clearKind, mergeScreenshot } from "@/domain/clash-scout/merge";
import { nameKey } from "@/domain/clash-scout/text";
import { emptyContent, type ScoutContent, type ScreenshotKind } from "@/domain/clash-scout/types";
import { OPGG_PLATFORMS, opggRegion } from "@/domain/opgg";
import { cn } from "@/lib/cn";
import { copyText } from "./copy-text";
import { clearDraft, loadDraft, saveDraft, type DraftShot, type StoredDraft } from "./draft-store";
import type { ShotResult } from "./recognizer";
import { ScoutCard, type EarlierView } from "./scout-card";
import { ScoutDetail } from "./scout-detail";
import { ShotIntake } from "./shot-intake";
import { useScreenshots } from "./use-screenshots";

/*
  CLASH SCOUT's workspace, for a new scout (a draft in this browser) and for a saved one. Pasting
  (anywhere on the page), dropping or choosing Clash's two scouting screenshots reads them in the
  browser (the images never leave it) and fills five opponent cards, side by side, each section in
  line with the others. A name is corrected right in its card; each card also opens the player in
  full for the figures and for finding the account. A draft is saved to the team's history only
  when a member chooses to; a saved scout is edited in place by those allowed to.
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

const noopSubscribe = () => () => {};

/**
 * A new scout starts from the draft kept in this browser, if there is one, so it is only
 * rendered in the browser (the server cannot see that draft); a saved scout renders at once.
 */
export function ClashWorkspace(props: WorkspaceProps) {
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (props.saved) return <Workspace {...props} draft={null} />;
  if (!mounted) return <div className="h-64 animate-pulse rounded-panel bg-surface/40" aria-busy="true" data-testid="clash-workspace-loading" />;
  return <DraftWorkspace {...props} />;
}

function DraftWorkspace(props: WorkspaceProps) {
  const [draft] = React.useState(() => loadDraft(props.teamId));
  return <Workspace {...props} draft={draft} />;
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
}: WorkspaceProps & { draft: StoredDraft | null }) {
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
  const [detail, setDetail] = React.useState<number | null>(null);
  const [earlier, setEarlier] = React.useState(earlierInitial);
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

  // The draft is kept in this browser as it changes (values only: never an image).
  React.useEffect(() => {
    if (!draftMode) return;
    const t = setTimeout(() => {
      if (savedRef.current) return;
      if (hasContent(content) || readShots.length) saveDraft({ teamId, content, shots: readShots, updatedAt: new Date().toISOString() });
      else clearDraft();
    }, 250);
    return () => clearTimeout(t);
  }, [draftMode, teamId, content, readShots]);

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
  const names = multiSearchText(content.players);
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
          {names ? (
            <a
              href={OPGG_MULTISEARCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary")}
              title="Copies the five names (verified Riot IDs where known) and opens OP.GG's Multi-Search: paste them there."
              onClick={() => void copyText(names).then((ok) => (ok ? toast.info("Names copied: paste them into OP.GG's Multi-Search.", { duration: 4000 }) : toast.error("The browser did not allow copying.")))}
              data-testid="clash-multisearch"
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> OP.GG Multi-Search
            </a>
          ) : null}
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
                champions={championMap}
                crop={cropFor(p.slot)}
                earlier={earlierFor(p.puuid)}
                editable={editable}
                shown={shown}
                onOpen={() => setDetail(p.slot)}
                onRename={(name) => setContent(setPlayerName(contentRef.current, p.slot, name))}
                onConfirm={() => setContent(confirmPlayerName(contentRef.current, p.slot))}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-center gap-3 @3xl:hidden" data-testid="clash-dots">
          <Button size="sm" variant="ghost" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous player">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          {content.players.map((p, i) => (
            <button key={p.slot} type="button" onClick={() => go(i)} aria-label={`Show player ${i + 1}`} aria-current={i === current} className={cn("h-2 w-2 rounded-full", i === current ? "bg-accent" : "bg-border-strong")} />
          ))}
          <Button size="sm" variant="ghost" onClick={() => go(current + 1)} disabled={current === content.players.length - 1} aria-label="Next player">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {saved ? (
        <p className="text-xs text-fg-subtle" data-testid="clash-saved-meta">
          Scouted {new Date(saved.scoutedAt).toLocaleString()}
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
                <span className="tabular-nums text-fg-muted">{new Date(m.playedAt).toLocaleString()}</span>
                {m.win === null ? null : <Badge tone={m.win ? "good" : "bad"}>{m.win ? "Win" : "Loss"}</Badge>}
                <span className="text-fg-muted">{m.opponentsFound} of the verified accounts on the other side</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail !== null ? (
        <ScoutDetail
          content={content}
          slot={detail}
          editable={editable}
          scoutId={saved?.id ?? null}
          crop={cropFor(detail)}
          champions={champions}
          earlier={earlierFor(content.players[detail]?.puuid ?? null)}
          onChange={setContent}
          onEarlier={(puuid, list) => setEarlier((e) => ({ ...e, [puuid]: list }))}
          onClose={() => setDetail(null)}
          onPrev={detail > 0 ? () => setDetail(detail - 1) : null}
          onNext={detail < content.players.length - 1 ? () => setDetail(detail + 1) : null}
        />
      ) : null}

      {saved ? (
        <Link href="/clash" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" aria-hidden /> All scouts
        </Link>
      ) : null}
    </div>
  );
}
