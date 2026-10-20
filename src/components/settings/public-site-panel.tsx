"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { savePublicSiteAction } from "@/server/actions/branding";
import { PLAYING_DEFAULTS, PUBLIC_SITE_LIMITS, parseDiscordInvite, type PublicSite } from "@/domain/public-site";

/**
 * Admin → Branding → Public page: the few words the public page says that branding does not (the
 * welcome, the community's Discord invitation, whether the team is open to new players, a
 * sign-off). Plain fields, no page builder: the page's design stays the app's.
 */
export function PublicSitePanel({ site, teamName, disabled = false }: { site: PublicSite; teamName: string; disabled?: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState<PublicSite>(site);
  const [saved, setSaved] = React.useState<PublicSite>(site);
  const [invite, setInvite] = React.useState(site.discordUrl ?? "");
  const [busy, setBusy] = React.useState(false);
  const inviteCheck = parseDiscordInvite(invite);
  const dirty = JSON.stringify({ ...form, discordUrl: invite.trim() || null }) !== JSON.stringify(saved);
  const set = <K extends keyof PublicSite>(key: K, value: PublicSite[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!inviteCheck.ok) return;
    setBusy(true);
    const r = await savePublicSiteAction({ ...form, discordUrl: invite });
    setBusy(false);
    if (!r.ok) return toast.error("Public page not saved", { description: r.error });
    setForm(r.data);
    setSaved(r.data);
    setInvite(r.data.discordUrl ?? "");
    toast.success("Public page saved.");
    router.refresh();
  };
  const cancel = () => {
    setForm(saved);
    setInvite(saved.discordUrl ?? "");
  };

  return (
    <section className="space-y-5 rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="public-site-title" data-testid="public-site-panel">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="public-site-title" className="text-base font-semibold">
            Public page
          </h2>
          <p className="text-sm text-fg-muted">What visitors read on the public page. It uses the names, logo, colours and sign-in background above.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a href="/public" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-accent hover:underline">
            Open the public page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <a href="/admin/previews?screen=public" className="inline-flex min-h-9 items-center text-accent hover:underline">
            Preview on a phone
          </a>
        </div>
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-sm font-semibold text-fg">Welcome</legend>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div>
            <Label htmlFor="ps-hero-title">Heading</Label>
            <Input id="ps-hero-title" value={form.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.heroTitle} placeholder={`Welcome to ${teamName}.`} data-testid="ps-hero-title" />
            <p className="mt-1 text-xs text-fg-subtle">Leave empty for &ldquo;Welcome to {teamName}.&rdquo;</p>
          </div>
          <div>
            <Label htmlFor="ps-hero-text">Description</Label>
            <Textarea id="ps-hero-text" rows={2} value={form.heroText} onChange={(e) => set("heroText", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.heroText} data-testid="ps-hero-text" />
          </div>
          <div>
            <Label htmlFor="ps-team-label">Lineup button</Label>
            <Input id="ps-team-label" value={form.teamLabel} onChange={(e) => set("teamLabel", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.teamLabel} />
          </div>
          <div>
            <Label htmlFor="ps-community-label">Community button</Label>
            <Input id="ps-community-label" value={form.communityLabel} onChange={(e) => set("communityLabel", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.communityLabel} />
            <p className="mt-1 text-xs text-fg-subtle">Shown only with a Discord invitation.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-sm font-semibold text-fg">Community</legend>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div>
            <Label htmlFor="ps-discord">Discord invitation link</Label>
            <Input id="ps-discord" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://discord.gg/…" aria-invalid={!inviteCheck.ok} aria-describedby="ps-discord-hint" data-testid="ps-discord" />
            <p id="ps-discord-hint" className={inviteCheck.ok ? "mt-1 text-xs text-fg-subtle" : "mt-1 text-xs text-bad"} role={inviteCheck.ok ? undefined : "alert"}>
              {inviteCheck.ok ? "Without one, the page shows no Discord button. Discord invitations expire after 7 days unless you choose Never when you create the link." : inviteCheck.error}
            </p>
          </div>
          <div>
            <Label htmlFor="ps-community-text">Description</Label>
            <Textarea id="ps-community-text" rows={3} value={form.communityText} onChange={(e) => set("communityText", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.communityText} data-testid="ps-community-text" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-sm font-semibold text-fg">Playing with us</legend>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div className="-mx-2">
            <Switch id="ps-playing-open" checked={form.playingOpen} onChange={(v) => set("playingOpen", v)} label="Open to new players" description={form.playingOpen ? "Visitors are invited to say hello on Discord. Nobody gets an account or a place on the team from the page." : "The page says the lineup is settled for now."} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="ps-playing-text">What it says</Label>
            <Textarea id="ps-playing-text" rows={3} value={form.playingText} onChange={(e) => set("playingText", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.playingText} placeholder={PLAYING_DEFAULTS[form.playingOpen ? "open" : "closed"]} data-testid="ps-playing-text" />
            <p className="mt-1 text-xs text-fg-subtle">Leave empty for the wording shown in grey.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-sm font-semibold text-fg">Footer</legend>
        <div className="max-w-md">
          <Label htmlFor="ps-sign-off">Sign-off</Label>
          <Input id="ps-sign-off" value={form.signOff} onChange={(e) => set("signOff", e.target.value)} maxLength={PUBLIC_SITE_LIMITS.signOff} placeholder="Leave empty for none" data-testid="ps-sign-off" />
          <p className="mt-1 text-xs text-fg-subtle">A closing line at the foot of the page.</p>
        </div>
      </fieldset>

      {disabled ? null : (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty || !inviteCheck.ok} data-testid="ps-save">
            {busy ? "Saving…" : "Save public page"}
          </Button>
          <Button variant="outline" onClick={cancel} disabled={busy || !dirty}>
            Cancel<span className="max-sm:hidden"> changes</span>
          </Button>
          <span className="min-w-0 flex-1 text-xs text-fg-muted sm:text-sm" aria-live="polite">
            {!inviteCheck.ok ? "Fix the Discord link first." : dirty ? "Unsaved changes." : "Saved."}
          </span>
        </div>
      )}
    </section>
  );
}
