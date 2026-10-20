"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Loader2, RefreshCw, Save, Trash2, X } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useSnapTrack } from "@/components/ui/use-snap-track";
import { deleteScoutAction, saveScoutAction, setScoutArchivedAction, updateScoutAction } from "@/server/actions/clash";
import { hasContent, setOpponentName, setPlatform } from "@/domain/clash-scout/edit";
import { OPGG_MULTISEARCH_URL, multiSearchText } from "@/domain/clash-scout/links";
import { clearKind, mergeScreenshot, type MergeNote } from "@/domain/clash-scout/merge";
import { emptyContent, type ScoutContent, type ScreenshotKind } from "@/domain/clash-scout/types";
import { OPGG_PLATFORMS, opggRegion } from "@/domain/opgg";
import { cn } from "@/lib/cn";
import { copyText } from "./copy-text";
import { clearDraft, loadDraft, saveDraft, type DraftShot, type StoredDraft } from "./draft-store";
import { fileHash } from "./file-hash";
import type { Recognizer } from "./recognizer";
import { ScoutCard, type EarlierView } from "./scout-card";
import { ScoutDetail } from "./scout-detail";

/*
  CLASH SCOUT's workspace, for a new scout (a draft in this browser) and for a saved one. Pasting,
  dropping or choosing Clash's two scouting screenshots reads them in the browser (the images never
  leave it), and fills five opponent cards; each card opens the player in full for checking,
  correcting and finding the account. A draft is saved to the team's history only when a member
  chooses to; a saved scout is edited in place by those allowed to.
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

const KIND_LABEL: Record<ScreenshotKind, string> = { ranked: "Ranked", mastery: "Mastery" };

let recognizer: Promise<Recognizer> | null = null;
function loadRecognizer(mode: "real" | "fake", ddragonVersion: string | null): Promise<Recognizer> {
  // Text recognition is loaded the first time a screenshot is read, never with the page.
  recognizer ??= (mode === "fake" ? import("./fake-recognizer").then((m) => m.createFakeRecognizer()) : import("./recognizer").then((m) => m.createRecognizer({ ddragonVersion }))).catch((err) => {
    recognizer = null;
    throw err;
  });
  return recognizer;
}

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
  const [shots, setShotsState] = React.useState<DraftShot[]>(() => draft?.shots ?? []);
  const shotsRef = React.useRef(shots);
  const setShots = React.useCallback((next: DraftShot[]) => {
    shotsRef.current = next;
    setShotsState(next);
  }, []);
  const [crops, setCrops] = React.useState<Crops>({});
  const [notes, setNotes] = React.useState<Array<MergeNote & { kind: ScreenshotKind }>>([]);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(draftMode && (draft?.shots.length ?? 0) < 2);
  const [detail, setDetail] = React.useState<number | null>(null);
  const [earlier, setEarlier] = React.useState(earlierInitial);
  const [saving, setSaving] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  // Set once the draft is saved to the history: it is then never written back to this browser.
  const savedRef = React.useRef(false);
  const expectedKind = React.useRef<ScreenshotKind | null>(null);
  const championMap = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const { ref: trackRef, index: current, onScroll, go } = useSnapTrack(content.players.length);

  // The draft is kept in this browser as it changes (values only: never an image).
  React.useEffect(() => {
    if (!draftMode) return;
    const t = setTimeout(() => {
      if (savedRef.current) return;
      if (hasContent(content) || shots.length) saveDraft({ teamId, content, shots, updatedAt: new Date().toISOString() });
      else clearDraft();
    }, 250);
    return () => clearTimeout(t);
  }, [draftMode, teamId, content, shots]);

  const readFiles = React.useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/")).slice(0, 2);
      if (!images.length) {
        if (files.length) toast.error("That is not an image. Paste or choose the Clash screenshots.");
        return;
      }
      setProblem(null);
      for (const file of images) {
        const want = expectedKind.current;
        try {
          setBusy("Preparing the screenshot");
          const hash = await fileHash(file);
          if (shotsRef.current.some((s) => s.hash === hash)) {
            toast.info("This screenshot has already been read.", { duration: 2500 });
            continue;
          }
          setBusy("Loading text recognition (first time only)");
          const r = await (await loadRecognizer(recognition, ddragonVersion)).read(file, (step) => setBusy(step));
          const kind = r.read.kind;
          if (!kind) {
            setProblem(r.warnings[0] ?? "Nothing could be read in this image.");
            continue;
          }
          if (want && want !== kind) toast.info(`This is the ${KIND_LABEL[kind].toLowerCase()} screen, so it was used as that.`);
          const replacing = shotsRef.current.some((s) => s.kind === kind);
          const merged = mergeScreenshot(replacing ? clearKind(contentRef.current, kind) : contentRef.current, r.read, kind);
          setContent(merged.content);
          const nextShots = [...shotsRef.current.filter((s) => s.kind !== kind), { kind, hash: r.hash, readAt: new Date().toISOString() }];
          setShots(nextShots);
          setCrops((c) => ({ ...c, [kind]: r.nameCrops }));
          setNotes((n) => [...n.filter((x) => x.kind !== kind), ...merged.notes.map((x) => ({ ...x, kind }))]);
          if (r.warnings.length) setProblem(r.warnings.join(" "));
          if (nextShots.length >= 2) setUploadOpen(false);
        } catch (err) {
          console.error(err);
          setProblem("Text recognition could not run: it is downloaded from the jsDelivr CDN the first time, which this network may block. Try again, or fill the cards in by hand.");
        }
      }
      expectedKind.current = null;
      setBusy(null);
    },
    [recognition, ddragonVersion, setContent, setShots],
  );

  // Pasting a screenshot anywhere on the page reads it (only image files: pasting text into a field is untouched).
  React.useEffect(() => {
    if (!draftMode) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void readFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [draftMode, readFiles]);

  const choose = (kind: ScreenshotKind | null) => {
    expectedKind.current = kind;
    fileInput.current?.click();
  };

  const removeShot = (kind: ScreenshotKind) => {
    setContent(clearKind(contentRef.current, kind));
    setShots(shotsRef.current.filter((x) => x.kind !== kind));
    setCrops((c) => ({ ...c, [kind]: undefined }));
    setNotes((n) => n.filter((x) => x.kind !== kind));
  };

  const discard = () => {
    if (hasContent(content) && !window.confirm("Discard this scout? Nothing of it is kept.")) return;
    clearDraft();
    setContent(emptyContent(content.platform));
    setShots([]);
    setCrops({});
    setNotes([]);
    setProblem(null);
    setUploadOpen(true);
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
  const cropFor = (slot: number) => crops.ranked?.[slot] ?? crops.mastery?.[slot] ?? null;
  const earlierFor = (puuid: string | null) => (puuid ? (earlier[puuid] ?? []) : []);
  const has = (kind: ScreenshotKind) => shots.some((s) => s.kind === kind);
  const filled = hasContent(content);

  return (
    <div className="space-y-4" data-testid="clash-workspace">
      {draftMode ? (
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="clash-file-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void readFiles(files);
          }}
        />
      ) : null}

      {draftMode && uploadOpen ? (
        <div
          className={cn("rounded-panel border-2 border-dashed p-4 transition-colors sm:p-6", dragging ? "border-accent bg-accent/5" : "border-border bg-surface/40")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void readFiles([...e.dataTransfer.files]);
          }}
          data-testid="clash-dropzone"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-fg-subtle">{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}</span>
            {busy ? (
              <p className="text-sm font-medium text-fg" role="status" data-testid="clash-busy">
                {busy}…
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-fg">Paste, drop or choose Clash&apos;s two scouting screenshots</p>
                <p className="max-w-lg text-sm text-fg-muted">The ranked screen and the mastery screen, in either order. They are read on this device and never uploaded.</p>
              </>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {(["ranked", "mastery"] as const).map((k) => (
                <ShotChip key={k} kind={k} done={has(k)} disabled={!!busy} onChoose={() => choose(k)} onRemove={() => removeShot(k)} />
              ))}
            </div>
            {shots.length ? (
              <Button size="sm" variant="ghost" onClick={() => setUploadOpen(false)}>
                Hide
              </Button>
            ) : null}
          </div>
        </div>
      ) : draftMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-panel border border-border bg-surface/40 px-3 py-2 text-sm" data-testid="clash-shots-bar">
          <span className="text-fg-muted">Screenshots:</span>
          {(["ranked", "mastery"] as const).map((k) => (
            <ShotChip key={k} kind={k} done={has(k)} disabled={!!busy} onChoose={() => choose(k)} onRemove={() => removeShot(k)} compact />
          ))}
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-fg-muted" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {busy}…
            </span>
          ) : null}
        </div>
      ) : null}

      {problem ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg" role="alert" data-testid="clash-problem">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <Label htmlFor="clash-opponent">Opponent</Label>
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
              {!uploadOpen ? (
                <Button onClick={() => setUploadOpen(true)} data-testid="clash-show-upload">
                  <RefreshCw className="h-4 w-4" aria-hidden /> Screenshots
                </Button>
              ) : null}
              {filled || shots.length ? (
                <Button variant="ghost" onClick={discard} data-testid="clash-discard">
                  <X className="h-4 w-4" aria-hidden /> Discard
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => void save()} disabled={!filled || saving || !!busy} data-testid="clash-save">
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

      {notes.length ? (
        <ul className="space-y-1 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm" data-testid="clash-notes">
          {notes.map((n, i) => (
            <li key={i}>
              <span className="font-medium">Player {n.slot + 1}:</span> {n.message} Open the card to check.
            </li>
          ))}
        </ul>
      ) : null}

      <div className="@container">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-[7%] pb-2 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden @3xl:mx-0 @3xl:grid @3xl:grid-cols-5 @3xl:overflow-visible @3xl:px-0"
          role="region"
          aria-roledescription="carousel"
          aria-label="Opponents"
          data-testid="clash-cards"
        >
          {content.players.map((p, i) => (
            <div key={p.slot} className="flex w-[86%] max-w-[24rem] shrink-0 snap-center snap-always @3xl:w-auto @3xl:max-w-none @3xl:min-w-0" role="group" aria-roledescription="slide" aria-label={`${p.name || `Player ${i + 1}`} (${i + 1} of 5)`}>
              <ScoutCard player={p} platform={content.platform} champions={championMap} crop={cropFor(p.slot)} earlier={earlierFor(p.puuid)} onOpen={() => setDetail(p.slot)} />
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

function ShotChip({ kind, done, disabled, onChoose, onRemove, compact = false }: { kind: ScreenshotKind; done: boolean; disabled: boolean; onChoose: () => void; onRemove: () => void; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border", done ? "border-good/40 bg-good/10" : "border-border bg-surface-2")} data-testid={`clash-shot-${kind}`} data-done={done}>
      <button type="button" onClick={onChoose} disabled={disabled} className={cn("px-2.5 text-sm", compact ? "py-1" : "py-1.5", done ? "text-fg" : "text-fg-muted hover:text-fg")} title={done ? `Replace the ${kind} screenshot` : `Choose the ${kind} screenshot`}>
        {KIND_LABEL[kind]} {done ? "✓" : "screen"}
        {done ? <span className="ml-1 text-xs text-fg-muted">Replace</span> : null}
      </button>
      {done ? (
        <button type="button" onClick={onRemove} disabled={disabled} className="px-1.5 text-fg-subtle hover:text-fg" aria-label={`Remove what the ${kind} screenshot filled in`}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
