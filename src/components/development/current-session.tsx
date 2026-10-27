"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Flag, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { sessionLimitText } from "@/domain/development/sessions";
import { LOSS_LIMIT, MAX_BLOCK_SIZE, MIN_BLOCK_SIZE, targetReached } from "@/domain/ranked-improvement";
import { accountShortNames } from "@/domain/account-names";
import { endSessionAction, setPrimaryObjectiveAction, setSessionObjectiveAction } from "@/server/actions/development";
import { deleteRankedBlockAction, setRankedBlockSizeAction } from "@/server/actions/ranked";
import type { ObjectiveView } from "@/server/development/repository";
import type { SessionDetail } from "@/server/development/page-data";
import type { RankedBlockView } from "@/server/ranked/repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { toast } from "@/components/ui/toast";
import type { JournalLookups } from "@/components/ranked/types";
import { ObjectiveHeading, PlanCallout } from "./before-queue";
import { ObjectiveEditorDialog } from "./objective-editor";
import { PlanEditorDialog } from "./plan-editor";
import { SessionGameList } from "./session-games";
import { LpChange } from "./session-summary";
import { useAction } from "./use-action";

/** End a session, with an optional closing note. Games played in it that Riot hands over later still join it. */
export function EndSessionDialog({ open, onClose, session, after }: { open: boolean; onClose: () => void; session: Pick<RankedBlockView, "id" | "label" | "games" | "wins" | "losses">; after?: string }) {
  const { busy, run } = useAction();
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const uid = React.useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`End ${session.label}?`}
      description={`${session.games} game${session.games === 1 ? "" : "s"} (${session.wins}W ${session.losses}L). A game you just finished still joins it when Riot hands it over.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep playing
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (await run(() => endSessionAction(session.id, note), { success: `${session.label} ended.` })) {
                onClose();
                if (after) router.push(after);
              }
            }}
            data-testid="session-end-confirm"
          >
            <Flag className="h-4 w-4" aria-hidden /> End session
          </Button>
        </>
      }
    >
      <Label htmlFor={`${uid}-note`}>A closing note (optional, private)</Label>
      <Textarea id={`${uid}-note`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tilted after game 3; the plan held in lane." data-testid="session-end-note" />
    </Dialog>
  );
}

/** Delete a session with its games and reviews in this journal. Riot data is never touched. */
export function DeleteSessionButton({ session, after }: { session: Pick<RankedBlockView, "id" | "label" | "games">; after?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="text-fg-muted hover:text-bad" onClick={() => setOpen(true)} data-testid="session-delete">
        <Trash2 className="h-4 w-4" aria-hidden /> Delete session
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete ${session.label}?`}
        description={`This removes ${session.label} and its ${session.games} game${session.games === 1 ? "" : "s"} from Ranked Development, with their reviews and notes. Your Riot match history, Match History and statistics are not affected, and your objectives stay in your library. This cannot be undone.`}
        confirmLabel="Delete session"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const r = await deleteRankedBlockAction(session.id);
          setBusy(false);
          setOpen(false);
          if (!r.ok) return void toast.error("The session was not deleted", { description: r.error });
          toast.success(`${r.data.label} deleted.`, { description: "Your Riot games are untouched." });
          if (after) router.push(after);
          router.refresh();
        }}
      />
    </>
  );
}

/** The objective and the game limit of the session in progress, changed without ending it. */
function SessionSettings({ detail, library }: { detail: SessionDetail; library: ObjectiveView[] }) {
  const { busy, run } = useAction();
  const s = detail.session;
  const [objectiveId, setObjectiveId] = React.useState(s.objectiveId ?? "");
  const [games, setGames] = React.useState(s.plannedGames === null ? "" : String(s.plannedGames));
  const uid = React.useId();
  const n = Number(games);
  const validTarget = games === "" || (Number.isInteger(n) && n >= MIN_BLOCK_SIZE && n <= MAX_BLOCK_SIZE);
  return (
    <div className="grid gap-3 rounded-md border border-border bg-bg-elevated p-3 sm:grid-cols-2" data-testid="session-settings">
      {library.length ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${uid}-objective`}>Objective</Label>
            <Select id={`${uid}-objective`} value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
              {!s.objectiveId ? <option value="">No objective</option> : null}
              {library.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </div>
          <Button size="md" variant="outline" disabled={busy || !objectiveId || objectiveId === s.objectiveId} onClick={() => void run(() => setSessionObjectiveAction(s.id, objectiveId), { success: "Objective changed. Games still waiting for a review follow it." })}>
            Change
          </Button>
        </div>
      ) : null}
      {s.completionRule === "target" ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${uid}-games`}>Game limit (empty: none)</Label>
            <Input id={`${uid}-games`} type="number" inputMode="numeric" min={MIN_BLOCK_SIZE} max={MAX_BLOCK_SIZE} value={games} onChange={(e) => setGames(e.target.value)} />
          </div>
          <Button size="md" variant="outline" disabled={busy || !validTarget} onClick={() => void run(() => setRankedBlockSizeAction(s.id, games === "" ? "open" : n), { success: "Limit saved." })}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * THE SESSION IN PROGRESS: its objective and plan, results so far (and LP when it is known), the
 * games that joined it with their reviews, and ending it. A planned game limit or the two-loss rule
 * is shown as the player chose it; only the two-loss rule ends a session by itself.
 */
export function CurrentSessionPanel({ detail, library, lookups, playerId }: { detail: SessionDetail; library: ObjectiveView[]; lookups: JournalLookups; playerId: string }) {
  const [ending, setEnding] = React.useState(false);
  const [settings, setSettings] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const s = detail.session;
  const objective = library.find((o) => o.id === s.objectiveId) ?? null;
  const reached = s.completionRule === "target" && targetReached(s.games, s.plannedGames);
  const account = s.accountId ? accountShortNames(lookups.accounts).get(s.accountId) : null;
  return (
    <section className="overflow-hidden rounded-card border border-accent/40 bg-surface" data-testid="current-session">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-accent/15 via-accent/5 to-transparent px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-label text-accent">Session in progress</p>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg">
            {s.label} <Badge tone="accent">In progress</Badge>
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
            <span>
              Started <RelativeTime date={s.startedAt} />
            </span>
            <span>· {sessionLimitText(s)}</span>
            <span>· {account ?? "Any of your accounts"}</span>
          </p>
        </div>
        <div className="flex items-end gap-4 tabular-nums">
          <span className="text-center leading-none">
            <span className="block text-2xl font-bold text-blue">{s.wins}</span>
            <span className="text-2xs uppercase tracking-label text-fg-subtle">Wins</span>
          </span>
          <span className="text-center leading-none">
            <span className="block text-2xl font-bold text-red">{s.losses}</span>
            <span className="text-2xs uppercase tracking-label text-fg-subtle">Losses</span>
          </span>
          <LpChange lp={detail.lp} />
        </div>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {objective ? <ObjectiveHeading objective={objective} lookups={lookups} size="md" /> : s.focus ? <p className="text-base font-semibold text-fg">{s.focus}</p> : <p className="text-sm text-fg-muted">This session has no objective; you can choose one in the session settings.</p>}
        {objective ? <PlanCallout plan={detail.plan} onEdit={() => setPlanning(true)} /> : detail.plan ? <PlanCallout plan={detail.plan} /> : null}
        {reached ? (
          <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-fg" data-testid="session-limit-reached">
            You planned {s.plannedGames} game{s.plannedGames === 1 ? "" : "s"}: a good moment to stop, review and end the session. Keep playing if you prefer; new games still join it.
          </p>
        ) : null}
        {s.completionRule === "two-losses" && s.losses === LOSS_LIMIT - 1 ? (
          <p className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg" data-testid="session-last-life">
            <ShieldAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden /> One loss so far: the next loss ends this session.
          </p>
        ) : null}
        <SessionGameList
          games={detail.games}
          session={{ id: s.id, label: s.label, objectiveTitle: objective?.title ?? s.focus, measure: detail.objective?.measure ?? null, plan: detail.plan }}
          alternatives={detail.alternatives}
          lookups={lookups}
          playerId={playerId}
          emptyText={<>No games yet. Play a Solo/Duo game: it joins this session by itself once your account syncs (usually within a few minutes of the game ending, while this page is open).</>}
        />
        {settings ? <SessionSettings detail={detail} library={library} /> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant={reached ? "primary" : "outline"} onClick={() => setEnding(true)} data-testid="session-end">
            <Flag className="h-4 w-4" aria-hidden /> End session
          </Button>
          <Button variant="ghost" onClick={() => setSettings((v) => !v)} aria-expanded={settings} data-testid="session-settings-toggle">
            <Settings2 className="h-4 w-4" aria-hidden /> Session settings
          </Button>
          <span className="ml-auto">
            <DeleteSessionButton session={s} />
          </span>
        </div>
      </div>
      <EndSessionDialog open={ending} onClose={() => setEnding(false)} session={s} after={`/overview/development/sessions/${s.id}`} />
      {objective ? <PlanEditorDialog open={planning} onClose={() => setPlanning(false)} objective={objective} /> : null}
    </section>
  );
}

/**
 * After a session: keep the objective, adjust its plan, or replace it (another from the library, or
 * a new one). The player decides; nothing changes by itself.
 */
export function NextSessionChoice({ objective, library, lookups }: { objective: ObjectiveView | null; library: ObjectiveView[]; lookups: JournalLookups }) {
  const { busy, run } = useAction();
  const [planning, setPlanning] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [replacing, setReplacing] = React.useState(false);
  const others = library.filter((o) => o.id !== objective?.id);
  const [replacement, setReplacement] = React.useState(others[0]?.id ?? "");
  const [kept, setKept] = React.useState(false);
  const uid = React.useId();
  return (
    <div className="space-y-3" data-testid="next-session">
      <p className="text-sm text-fg">{objective ? <>For your next session, keep “{objective.title}”, adjust its plan, or practise something else.</> : "Choose what your next session practises."}</p>
      <div className="flex flex-wrap gap-2">
        {objective ? (
          <Button variant={kept ? "secondary" : "primary"} onClick={() => (objective.isPrimary ? setKept(true) : void run(() => setPrimaryObjectiveAction(objective.id)).then((r) => r && setKept(true)))} disabled={kept || busy} data-testid="next-keep">
            {kept ? "Kept for next session" : "Keep this objective"}
          </Button>
        ) : null}
        {objective ? (
          <Button variant="outline" onClick={() => setPlanning(true)} data-testid="next-adjust">
            Adjust the plan
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => (others.length ? setReplacing((v) => !v) : setCreating(true))} data-testid="next-replace">
          {objective ? "Practise something else" : "Choose an objective"}
        </Button>
      </div>
      {replacing ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-elevated p-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${uid}-replacement`}>From your library</Label>
            <Select id={`${uid}-replacement`} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="primary" disabled={busy || !replacement} onClick={() => void run(() => setPrimaryObjectiveAction(replacement), { success: (o) => `Next session: “${o.title}”.` }).then((r) => r && setReplacing(false))}>
            Use it next
          </Button>
          <Button variant="ghost" onClick={() => setCreating(true)}>
            New objective
          </Button>
        </div>
      ) : null}
      {objective ? <PlanEditorDialog open={planning} onClose={() => setPlanning(false)} objective={objective} /> : null}
      <ObjectiveEditorDialog open={creating} onClose={() => setCreating(false)} lookups={lookups} hasPrimary={library.some((o) => o.isPrimary)} primaryByDefault />
    </div>
  );
}
