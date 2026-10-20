"use client";

import * as React from "react";
import { MAIN_MISTAKES } from "@/domain/ranked-improvement";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { GameFormInput } from "@/server/actions/ranked";
import { ChampionSlot } from "@/components/champion-slot";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ToggleChip } from "@/components/ui/toggle";
import type { JournalLookups } from "./types";
import { accountShortNames } from "@/domain/account-names";

export interface GameFormValues {
  championId: string | null;
  enemyChampionId: string | null;
  result: "win" | "loss" | null;
  mainMistake: string;
  notes: string;
  link: string;
  role: Role | "";
  /** yyyy-mm-dd or empty (today). */
  playedOn: string;
  teammatePlayerId: string;
  accountId: string;
}

export const EMPTY_GAME: GameFormValues = { championId: null, enemyChampionId: null, result: null, mainMistake: "", notes: "", link: "", role: "", playedOn: "", teammatePlayerId: "", accountId: "" };

/** Local calendar day → ISO at local noon, so the stored day never shifts across time zones. */
function playedAtIso(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toDayInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toActionInput(v: GameFormValues): GameFormInput {
  return {
    championId: v.championId ?? "",
    enemyChampionId: v.enemyChampionId,
    result: v.result ?? "win",
    mainMistake: v.mainMistake || null,
    notes: v.notes,
    link: v.link,
    role: v.role || null,
    playedAt: playedAtIso(v.playedOn),
    teammatePlayerId: v.teammatePlayerId || null,
    accountId: v.accountId || null,
  };
}

export interface GameFormProps {
  lookups: JournalLookups;
  initial?: Partial<GameFormValues>;
  /** An imported game keeps its Riot facts; the form still lets you add the reflection. */
  synced?: boolean;
  submitLabel: string;
  onSubmit: (values: GameFormValues) => Promise<string | null>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

/**
 * The thirty-second entry: champion, enemy laner, result, main mistake. Everything else is
 * optional and sits below. Phone-first: big touch targets, one column, no modal.
 */
export function GameForm({ lookups, initial, synced = false, submitLabel, onSubmit, onCancel, autoFocus = false }: GameFormProps) {
  const defaultAccount = lookups.accounts[0]?.id ?? "";
  const [values, setValues] = React.useState<GameFormValues>({ ...EMPTY_GAME, accountId: defaultAccount, ...initial });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(!!(initial?.link || initial?.playedOn || initial?.role || initial?.teammatePlayerId));
  const championsById = React.useMemo(() => new Map(Object.entries(lookups.championsById)), [lookups.championsById]);
  const set = <K extends keyof GameFormValues>(key: K, value: GameFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const uid = React.useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.championId) return setError("Choose the champion you played.");
    if (!values.result) return setError("Record the result: win or loss.");
    setBusy(true);
    setError(null);
    const err = await onSubmit(values);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Ranked game">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
        <div>
          <Label>Your champion</Label>
          <ChampionSlot championId={values.championId} champions={lookups.champions} championsById={championsById} onChange={(id) => set("championId", id)} label="Pick your champion" disabled={synced} preferredIds={lookups.mainPool.ids} preferredLabel={lookups.mainPool.roleLabel ? `in your ${lookups.mainPool.roleLabel} pool` : "in your pool"} />
        </div>
        <div>
          <Label>Enemy laner</Label>
          <ChampionSlot championId={values.enemyChampionId} champions={lookups.champions} championsById={championsById} onChange={(id) => set("enemyChampionId", id)} label="Pick the enemy champion (optional)" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Result</Label>
          <div className="flex gap-1.5">
            <ToggleChip active={values.result === "win"} tone="blue" onClick={() => set("result", "win")} className="flex-1 font-medium sm:flex-none sm:px-5" disabled={synced}>
              Win
            </ToggleChip>
            <ToggleChip active={values.result === "loss"} tone="red" onClick={() => set("result", "loss")} className="flex-1 font-medium sm:flex-none sm:px-5" disabled={synced}>
              Loss
            </ToggleChip>
          </div>
        </div>
      </div>

      {/* Your main pool in your order: one tap. Any other champion stays one tap away in the slot. */}
      {!synced && lookups.mainPool.ids.length ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="pool-quick-picks">
          <span className="text-xs text-fg-subtle">{lookups.mainPool.roleLabel ? `${lookups.mainPool.roleLabel} pool` : "Your pool"}:</span>
          {lookups.mainPool.ids.slice(0, 8).map((id) => {
            const c = lookups.championsById[id];
            if (!c) return null;
            const on = values.championId === id;
            return (
              <button key={id} type="button" onClick={() => set("championId", id)} aria-pressed={on} title={c.name} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-2 text-xs font-medium transition-colors pointer-coarse:min-h-11 ${on ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg"}`} data-testid="pool-quick-pick" data-champion={id}>
                <ChampionPortrait champion={c} size="xs" />
                {c.name}
              </button>
            );
          })}
          <span className="text-xs text-fg-subtle">· another champion: tap the slot</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-mistake`}>Main mistake</Label>
          <Select id={`${uid}-mistake`} value={values.mainMistake} onChange={(e) => set("mainMistake", e.target.value)} autoFocus={autoFocus}>
            <option value="">Not sure yet</option>
            {MAIN_MISTAKES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-teammate`}>Played with teammate</Label>
          <Select id={`${uid}-teammate`} value={values.teammatePlayerId} onChange={(e) => set("teammatePlayerId", e.target.value)}>
            <option value="">Solo</option>
            {lookups.teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor={`${uid}-notes`}>Notes</Label>
        <Textarea id={`${uid}-notes`} value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={1000} placeholder="One or two lines: what happened, what to do next time." />
      </div>

      <button type="button" onClick={() => setMore((v) => !v)} className="inline-flex min-h-11 items-center text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline md:min-h-0" aria-expanded={more}>
        {more ? "Hide optional details" : "More details (link, date, role, account)"}
      </button>
      {more ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-link`}>Game link</Label>
            <Input id={`${uid}-link`} value={values.link} onChange={(e) => set("link", e.target.value)} placeholder="https://www.op.gg/…" inputMode="url" spellCheck={false} maxLength={300} />
          </div>
          <div>
            <Label htmlFor={`${uid}-date`}>Date played</Label>
            <Input id={`${uid}-date`} type="date" value={values.playedOn} onChange={(e) => set("playedOn", e.target.value)} disabled={synced} />
          </div>
          <div>
            <Label>Role</Label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((role) => (
                <ToggleChip key={role} size="sm" active={values.role === role} onClick={() => set("role", values.role === role ? "" : role)} title={ROLE_LABELS[role]} aria-label={ROLE_LABELS[role]}>
                  <RoleIcon role={role} className="h-3.5 w-3.5" />
                  <span className="max-sm:hidden">{ROLE_LABELS[role]}</span>
                </ToggleChip>
              ))}
            </div>
          </div>
          {lookups.accounts.length > 1 ? (
            <div>
              <Label htmlFor={`${uid}-account`}>Riot account</Label>
              <Select id={`${uid}-account`} value={values.accountId} onChange={(e) => set("accountId", e.target.value)} disabled={synced}>
                <option value="">Not specified</option>
                {lookups.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountShortNames(lookups.accounts).get(a.id)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </Button>
        ) : null}
        {error ? (
          <p className="text-xs text-bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
