"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveSocialLinksAction } from "@/server/actions/account";
import { SOCIAL_KINDS, SOCIAL_LABELS, checkSocialValue, visibleSocialLinks, type SocialKind, type SocialLinks } from "@/domain/social-links";
import { SocialLinks as SocialChips } from "@/components/players/social-links";
import { BrandIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

const PLACEHOLDERS: Record<SocialKind, string> = { youtube: "youtube.com/@yourname", twitch: "twitch.tv/yourname", discord: "your Discord username" };

/** The links as they are edited: every platform, its value as typed and its "Show publicly" switch (off unless saved on). */
export type SocialDraft = Record<SocialKind, { value: string; public: boolean }>;

export const socialDraftOf = (links: SocialLinks | null): SocialDraft =>
  Object.fromEntries(SOCIAL_KINDS.map((k) => [k, { value: k === "discord" || !links?.[k] ? (links?.[k]?.value ?? "") : links[k]!.value.replace(/^https:\/\/www\./, ""), public: links?.[k]?.public === true }])) as SocialDraft;

/** Why each value would be refused, by the server's own rule (null: fine, or left empty). */
export function socialDraftProblems(draft: SocialDraft): Record<SocialKind, string | null> {
  return Object.fromEntries(
    SOCIAL_KINDS.map((k) => {
      const r = checkSocialValue(k, draft[k].value);
      return [k, r.ok ? null : r.error];
    }),
  ) as Record<SocialKind, string | null>;
}

export const socialDraftChanged = (draft: SocialDraft, saved: SocialDraft): boolean => SOCIAL_KINDS.some((k) => draft[k].value.trim() !== saved[k].value.trim() || draft[k].public !== saved[k].public);

/** The links a draft stands for, as the pages read them: only values that pass the checks. */
export function socialDraftLinks(draft: SocialDraft): SocialLinks {
  const links: SocialLinks = {};
  for (const k of SOCIAL_KINDS) {
    const r = checkSocialValue(k, draft[k].value);
    if (r.ok && r.value) links[k] = { value: r.value, public: draft[k].public };
  }
  return links;
}

/**
 * The three fields, one per platform: its label and its "Show publicly" switch on one line (on:
 * teammates and the public team page see the link; off, the default: nobody but you), the value
 * under them, checked as typed with the server's own rule; then, in one line, what everyone else
 * would see with these values (through the same filter as the pages). Controlled: Settings saves
 * them with their own button, the Player Card Studio together with the card. `idPrefix` keeps the
 * fields' ids apart where both could be on one page.
 */
export function SocialLinksFields({ draft, onChange, disabled = false, idPrefix = "social" }: { draft: SocialDraft; onChange: (kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => void; disabled?: boolean; idPrefix?: string }) {
  const problems = socialDraftProblems(draft);
  const shown = visibleSocialLinks(socialDraftLinks(draft));
  return (
    <div className="space-y-3">
      {SOCIAL_KINDS.map((k) => (
        <div key={k} className="min-w-0" data-testid={`social-field-${k}`} data-public={draft[k].public || undefined}>
          <div className="flex min-h-8 items-center justify-between gap-3">
            <label htmlFor={`${idPrefix}-${k}`} className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
              <BrandIcon kind={k} className="h-4 w-4" />
              {SOCIAL_LABELS[k]}
            </label>
            <Switch inline id={`${idPrefix}-${k}-public`} label="Show publicly" ariaLabel={`Show publicly: ${SOCIAL_LABELS[k]}`} checked={draft[k].public} disabled={disabled} onChange={(on) => onChange(k, { public: on })} className="-mr-1.5" testId={`social-public-${k}`} />
          </div>
          <Input id={`${idPrefix}-${k}`} value={draft[k].value} placeholder={PLACEHOLDERS[k]} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200} enterKeyHint="done" disabled={disabled} onChange={(e) => onChange(k, { value: e.target.value })} aria-invalid={!!problems[k]} aria-describedby={problems[k] ? `${idPrefix}-${k}-problem` : undefined} />
          {problems[k] ? (
            <p id={`${idPrefix}-${k}-problem`} className="mt-1 text-xs text-bad" role="alert">
              {problems[k]}
            </p>
          ) : null}
        </div>
      ))}
      {/* <div>, not <p>: SocialChips is a list, which a paragraph cannot hold (the browser would close
          the paragraph early and the page would fail to hydrate). */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg/40 px-2.5 py-2 text-xs text-fg-muted" data-testid="social-links-preview">
        <span className="shrink-0">Shown to teammates and on the public team page:</span>
        {shown.length ? <SocialChips links={shown} /> : <span className="text-fg-subtle">nothing</span>}
      </div>
    </div>
  );
}

/**
 * Settings → Profile (and the optional welcome step): the member's own YouTube, Twitch and Discord,
 * each with one switch, "Show publicly". Nothing shows anywhere until they switch a link on; values
 * are checked as they type with the server's own rule and saved with one button. The Player Card
 * Studio edits the same links (its Links step). `preview`: Admin → Previews, where nothing may be saved.
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
    toast.success("Social links saved.", { description: SOCIAL_KINDS.some((k) => r.data.links?.[k]?.public) ? "The ones switched on show on your card and the public team page." : "None of them is shown to anyone." });
    router.refresh();
  };
  return (
    <form onSubmit={save} className="space-y-3" data-testid="social-links-form">
      <div>
        <p className="text-sm font-medium text-fg">Social links</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Optional. A link stays private until you switch on Show publicly: then teammates and visitors to the public team page see it. YouTube and Twitch open your channel; Discord shows your username for others to copy. No account is connected and nothing is embedded.</p>
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
