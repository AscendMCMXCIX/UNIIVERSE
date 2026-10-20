"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveSocialLinksAction } from "@/server/actions/account";
import { AUDIENCE_LABELS, SOCIAL_AUDIENCES, SOCIAL_KINDS, SOCIAL_LABELS, checkSocialValue, visibleSocialLinks, type SocialAudience, type SocialKind, type SocialLinks } from "@/domain/social-links";
import { SocialLinks as SocialChips } from "@/components/players/social-links";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const PLACEHOLDERS: Record<SocialKind, string> = { youtube: "youtube.com/@yourname", twitch: "twitch.tv/yourname", discord: "your Discord username" };

/** The links as they are edited: every platform, its value as typed and who may see it. */
export type SocialDraft = Record<SocialKind, { value: string; show: SocialAudience }>;

export const socialDraftOf = (links: SocialLinks | null): SocialDraft =>
  Object.fromEntries(SOCIAL_KINDS.map((k) => [k, { value: k === "discord" || !links?.[k] ? (links?.[k]?.value ?? "") : links[k]!.value.replace(/^https:\/\/www\./, ""), show: links?.[k]?.show ?? "hidden" }])) as SocialDraft;

/** Why each value would be refused, by the server's own rule (null: fine, or left empty). */
export function socialDraftProblems(draft: SocialDraft): Record<SocialKind, string | null> {
  return Object.fromEntries(
    SOCIAL_KINDS.map((k) => {
      const r = checkSocialValue(k, draft[k].value);
      return [k, r.ok ? null : r.error];
    }),
  ) as Record<SocialKind, string | null>;
}

export const socialDraftChanged = (draft: SocialDraft, saved: SocialDraft): boolean => SOCIAL_KINDS.some((k) => draft[k].value.trim() !== saved[k].value.trim() || draft[k].show !== saved[k].show);

/** The links a draft stands for, as the pages read them: only values that pass the checks. */
export function socialDraftLinks(draft: SocialDraft): SocialLinks {
  const links: SocialLinks = {};
  for (const k of SOCIAL_KINDS) {
    const r = checkSocialValue(k, draft[k].value);
    if (r.ok && r.value) links[k] = { value: r.value, show: draft[k].show };
  }
  return links;
}

/**
 * The three fields, each with who may see it, and what teammates and the public page would show
 * with these values (through the same filter as the pages). Controlled: Settings saves them with
 * their own button, the Player Card Studio together with the card. `idPrefix` keeps the fields'
 * ids apart where both could be on one page.
 */
export function SocialLinksFields({ draft, onChange, disabled = false, idPrefix = "social" }: { draft: SocialDraft; onChange: (kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => void; disabled?: boolean; idPrefix?: string }) {
  const problems = socialDraftProblems(draft);
  const asLinks = socialDraftLinks(draft);
  const teamSees = visibleSocialLinks(asLinks, "team");
  const publicSees = visibleSocialLinks(asLinks, "public");
  return (
    <div className="space-y-3">
      {SOCIAL_KINDS.map((k) => (
        <div key={k} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]" data-testid={`social-field-${k}`}>
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-${k}`}>{SOCIAL_LABELS[k]}</Label>
            <Input id={`${idPrefix}-${k}`} value={draft[k].value} placeholder={PLACEHOLDERS[k]} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200} enterKeyHint="done" disabled={disabled} onChange={(e) => onChange(k, { value: e.target.value })} aria-invalid={!!problems[k]} aria-describedby={problems[k] ? `${idPrefix}-${k}-problem` : undefined} />
            {problems[k] ? (
              <p id={`${idPrefix}-${k}-problem`} className="mt-1 text-xs text-bad" role="alert">
                {problems[k]}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-${k}-show`}>Who can see it</Label>
            <Select id={`${idPrefix}-${k}-show`} value={draft[k].show} disabled={disabled} onChange={(e) => onChange(k, { show: e.target.value as SocialAudience })}>
              {SOCIAL_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ))}
      <div className="space-y-1.5 rounded-md border border-border bg-bg/40 p-2.5 text-xs text-fg-muted" data-testid="social-links-preview">
        <p className="flex flex-wrap items-center gap-2">
          <span className="w-36 shrink-0">On your card, for teammates:</span>
          {teamSees.length ? <SocialChips links={teamSees} /> : <span className="text-fg-subtle">nothing</span>}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="w-36 shrink-0">On the public team page:</span>
          {publicSees.length ? <SocialChips links={publicSees} /> : <span className="text-fg-subtle">nothing</span>}
        </p>
      </div>
    </div>
  );
}

/**
 * Settings → Profile (and the optional welcome step): the member's own YouTube, Twitch and Discord,
 * each with who may see it. Nothing shows anywhere until they choose an audience other than "Only
 * me"; values are checked as they type with the server's own rule and saved with one button. The
 * Player Card Studio edits the same links (its Links step). `preview`: Admin → Previews, where
 * nothing may be saved.
 */
export function SocialLinksEditor({ initial, preview = false }: { initial: SocialLinks | null; preview?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(() => socialDraftOf(initial));
  const [draft, setDraft] = React.useState(saved);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const changed = socialDraftChanged(draft, saved);
  const invalid = Object.values(socialDraftProblems(draft)).some(Boolean);
  const set = (k: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => {
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
    setError(null);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || !changed || invalid) return;
    setBusy(true);
    const r = await saveSocialLinksAction(draft);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const next = socialDraftOf(r.data.links);
    setSaved(next);
    setDraft(next);
    toast.success("Social links saved.", { description: SOCIAL_KINDS.some((k) => r.data.links?.[k] && r.data.links[k]!.show !== "hidden") ? "They show where you chose." : "None of them is shown to anyone yet." });
    router.refresh();
  };
  return (
    <form onSubmit={save} className="space-y-3" data-testid="social-links-form">
      <div>
        <p className="text-sm font-medium text-fg">Social links</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Optional. Nothing is shown until you choose who can see it. YouTube and Twitch open your channel; Discord shows your username for others to copy. No account is connected and nothing is embedded.</p>
      </div>
      <SocialLinksFields draft={draft} onChange={set} disabled={preview} />
      {error ? (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <p className="text-xs text-fg-subtle">Preview: nothing is saved here.</p>
      ) : (
        <Button type="submit" variant="outline" disabled={busy || !changed || invalid} data-testid="social-links-save">
          {busy ? "Saving…" : "Save social links"}
        </Button>
      )}
    </form>
  );
}
