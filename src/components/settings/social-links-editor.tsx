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

type Draft = Record<SocialKind, { value: string; show: SocialAudience }>;

const draftOf = (links: SocialLinks | null): Draft =>
  Object.fromEntries(SOCIAL_KINDS.map((k) => [k, { value: k === "discord" || !links?.[k] ? (links?.[k]?.value ?? "") : links[k]!.value.replace(/^https:\/\/www\./, ""), show: links?.[k]?.show ?? "hidden" }])) as Draft;

/**
 * Settings → Profile (and the optional welcome step): the member's own YouTube, Twitch and Discord,
 * each with who may see it. Nothing shows anywhere until they choose an audience other than "Only
 * me"; values are checked as they type with the server's own rule and saved with one button.
 * `preview`: Admin → Previews, where nothing may be saved.
 */
export function SocialLinksEditor({ initial, preview = false }: { initial: SocialLinks | null; preview?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(() => draftOf(initial));
  const [draft, setDraft] = React.useState(saved);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const problems = Object.fromEntries(SOCIAL_KINDS.map((k) => [k, (() => {
    const r = checkSocialValue(k, draft[k].value);
    return r.ok ? null : r.error;
  })()])) as Record<SocialKind, string | null>;
  const changed = SOCIAL_KINDS.some((k) => draft[k].value.trim() !== saved[k].value.trim() || draft[k].show !== saved[k].show);
  // What each audience would see with these values, through the same filter as the pages.
  const asLinks: SocialLinks = {};
  for (const k of SOCIAL_KINDS) {
    const r = checkSocialValue(k, draft[k].value);
    if (r.ok && r.value) asLinks[k] = { value: r.value, show: draft[k].show };
  }
  const teamSees = visibleSocialLinks(asLinks, "team");
  const publicSees = visibleSocialLinks(asLinks, "public");
  const invalid = SOCIAL_KINDS.some((k) => problems[k]);
  const set = (k: SocialKind, patch: Partial<Draft[SocialKind]>) => {
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
    const next = draftOf(r.data.links);
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
      {SOCIAL_KINDS.map((k) => (
        <div key={k} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]" data-testid={`social-field-${k}`}>
          <div className="min-w-0">
            <Label htmlFor={`social-${k}`}>{SOCIAL_LABELS[k]}</Label>
            <Input id={`social-${k}`} value={draft[k].value} placeholder={PLACEHOLDERS[k]} autoComplete="off" spellCheck={false} maxLength={200} disabled={preview} onChange={(e) => set(k, { value: e.target.value })} aria-invalid={!!problems[k]} aria-describedby={problems[k] ? `social-${k}-problem` : undefined} />
            {problems[k] ? (
              <p id={`social-${k}-problem`} className="mt-1 text-xs text-bad" role="alert">
                {problems[k]}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor={`social-${k}-show`}>Who can see it</Label>
            <Select id={`social-${k}-show`} value={draft[k].show} disabled={preview} onChange={(e) => set(k, { show: e.target.value as SocialAudience })}>
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
