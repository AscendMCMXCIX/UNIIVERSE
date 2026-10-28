"use client";

import * as React from "react";
import { CATEGORY_GROUPS, categoriesIn } from "@/domain/development/categories";
import { EXECUTION_LEVELS, REVIEW_TEXT_MAX } from "@/domain/development/reviews";
import { planSentence } from "@/domain/development/plans";
import { saveReviewAction, skipReviewAction } from "@/server/actions/development";
import type { PlanView } from "@/server/development/repository";
import type { SessionGame } from "@/server/development/page-data";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import type { JournalLookups } from "@/components/ranked/types";
import { GameFacts } from "./game-facts";
import { useAction } from "./use-action";

function AreaSelect({ id, label, value, onChange, testId }: { id: string; label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        <option value="">Not sure</option>
        {CATEGORY_GROUPS.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {categoriesIn(g.key).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}

/**
 * The post-game review, under a minute: how consistently the plan was followed, the biggest learning
 * point, what to adjust next game, and (optionally) the areas that went best and were hardest.
 * Every answer is optional and skipping costs nothing. Answers are the player's own view and are
 * always shown as self-reported.
 */
export function ReviewDialog({ open, onClose, game, objectiveTitle, plan, lookups }: { open: boolean; onClose: () => void; game: SessionGame; objectiveTitle: string | null; plan: Pick<PlanView, "ifText" | "thenText"> | null; lookups: Pick<JournalLookups, "championsById"> }) {
  const { busy, run } = useAction();
  const [execution, setExecution] = React.useState<number | null>(null);
  const [learning, setLearning] = React.useState("");
  const [adjustment, setAdjustment] = React.useState("");
  const [wentWell, setWentWell] = React.useState("");
  const [wentWrong, setWentWrong] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setExecution(game.execution);
      setLearning(game.learning);
      setAdjustment(game.adjustment);
      setWentWell(game.wentWell ?? "");
      setWentWrong(game.wentWrong ?? "");
      setError(null);
    }
  }
  const uid = React.useId();
  const champion = lookups.championsById[game.championId] ?? { id: game.championId, name: game.championId, portraitUrl: "" };
  const reviewed = game.reviewStatus === "done";
  const save = async () => {
    if (execution === null && !learning.trim() && !adjustment.trim() && !wentWell && !wentWrong) return setError("Answer at least one question, or skip the review.");
    setError(null);
    if (await run(() => saveReviewAction(game.id, { execution, learning, adjustment, wentWell: wentWell || null, wentWrong: wentWrong || null }), { success: "Review saved." })) onClose();
  };
  const skip = async () => {
    if (await run(() => skipReviewAction(game.id), { success: "Skipped. Nothing is lost: you can still review it from the session." })) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reviewed ? "Your review" : "Review this game"}
      description="Under a minute. Every answer is optional."
      className="sm:max-w-xl"
      footer={
        <>
          {!reviewed ? (
            <Button variant="ghost" onClick={() => void skip()} disabled={busy} className="mr-auto" data-testid="review-skip">
              Skip this game
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="review-save">
            {busy ? "Saving…" : "Save review"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="review-dialog">
        <div className="flex items-center gap-3 rounded-md bg-bg-elevated p-2.5">
          <ChampionPortrait champion={champion} size="md" />
          <GameFacts game={game} lookups={lookups} />
        </div>
        {plan || objectiveTitle ? (
          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
            <p className="text-2xs font-semibold uppercase tracking-label text-accent">{plan ? "Your plan" : "Your objective"}</p>
            <p className="mt-0.5 text-fg">{plan ? planSentence(plan) : objectiveTitle}</p>
          </div>
        ) : null}
        {plan || objectiveTitle ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg" id={`${uid}-execution`}>
              How consistently did you follow {plan ? "your plan" : "your objective"}?
            </p>
            <div role="radiogroup" aria-labelledby={`${uid}-execution`} className={segmentedGroupClass("flex w-full")} data-testid="review-execution">
              {EXECUTION_LEVELS.map((l) => (
                <button key={l.value} type="button" role="radio" aria-checked={execution === l.value} onClick={() => setExecution(execution === l.value ? null : l.value)} className={segmentClass(execution === l.value, { className: "flex-1 px-1.5" })} data-testid={`review-execution-${l.value}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <Label htmlFor={`${uid}-learning`}>Your biggest learning point</Label>
          <Input id={`${uid}-learning`} value={learning} maxLength={REVIEW_TEXT_MAX} onChange={(e) => setLearning(e.target.value)} placeholder="I pushed past the river with no vision twice" data-testid="review-learning" />
        </div>
        <div>
          <Label htmlFor={`${uid}-adjustment`}>What will you adjust next game?</Label>
          <Input id={`${uid}-adjustment`} value={adjustment} maxLength={REVIEW_TEXT_MAX} onChange={(e) => setAdjustment(e.target.value)} placeholder="Ward before I push, not after" data-testid="review-adjustment" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AreaSelect id={`${uid}-best`} label="What went best? (optional)" value={wentWell} onChange={setWentWell} testId="review-went-well" />
          <AreaSelect id={`${uid}-hardest`} label="What was hardest? (optional)" value={wentWrong} onChange={setWentWrong} testId="review-went-wrong" />
        </div>
        {error ? (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
