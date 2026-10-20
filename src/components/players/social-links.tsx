"use client";

import * as React from "react";
import { Check, Copy, MessageCircle, MonitorPlay, Play } from "lucide-react";
import type { SocialKind, SocialLinkView } from "@/domain/social-links";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const ICONS: Record<SocialKind, typeof Play> = { youtube: Play, twitch: MonitorPlay, discord: MessageCircle };

/**
 * A member's social links as small labelled chips: YouTube and Twitch open the channel in a new tab
 * (no referrer, nothing embedded), Discord copies the username. Only links already chosen for this
 * viewer reach here (domain/social-links, visibleSocialLinks on the server). `onArt`: over card
 * artwork (profile header, Team window).
 */
export function SocialLinks({ links, className, tone = "default" }: { links: readonly SocialLinkView[]; className?: string; tone?: "default" | "onArt" }) {
  if (!links.length) return null;
  const chip = cn(
    "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11",
    tone === "onArt" ? "border-white/15 bg-bg/60 text-fg hover:bg-bg/80" : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
  );
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Social links" data-testid="social-links">
      {links.map((l) => {
        const Icon = ICONS[l.kind];
        return (
          <li key={l.kind} className="min-w-0 max-w-full">
            {l.href ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className={chip} title={`${l.label}: ${l.text} (opens in a new tab)`} data-testid={`social-${l.kind}`}>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{l.label}</span>
                <span className="sr-only">: {l.text} (opens in a new tab)</span>
              </a>
            ) : (
              <CopyUsername link={l} className={chip} icon={Icon} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Copies a Discord username (Discord has no public address for one), with a short "copied" state. */
function useCopyUsername(link: SocialLinkView) {
  const [copied, setCopied] = React.useState(false);
  const name = link.text.replace(/^@/, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      toast.success("Discord username copied.", { description: name });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Not copied", { description: `The Discord username is ${name}.` });
    }
  };
  return { name, copied, copy };
}

/** Discord has no public address for a username: the chip shows it and copies it. */
function CopyUsername({ link, className, icon: Icon }: { link: SocialLinkView; className: string; icon: typeof Play }) {
  const { name, copied, copy } = useCopyUsername(link);
  return (
    <button type="button" onClick={() => void copy()} className={className} title={`Discord: ${name}. Copy the username`} data-testid={`social-${link.kind}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{link.text}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden /> : <Copy className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
      <span className="sr-only">{copied ? " (copied)" : ": copy the Discord username"}</span>
    </button>
  );
}

const CARD_ICON = "grid h-6 w-6 place-items-center rounded-full bg-bg/75 text-fg-muted shadow-sm shadow-black/30 pointer-coarse:h-9 pointer-coarse:w-9";

/**
 * The same links as small round icons for the corner of a player card (Team, Players, the public
 * page, previews). `interactive`: links and the Discord copy button, each its own control, so a
 * click never reaches the card under it; `static`: the same icons without actions (card
 * previews); `reserve`: invisible, only keeping their space (where the real ones are drawn on top,
 * outside a card that is itself a link).
 */
export function CardSocialIcons({ links, owner, mode = "interactive", className }: { links: readonly SocialLinkView[]; owner: string; mode?: "interactive" | "static" | "reserve"; className?: string }) {
  if (!links.length) return null;
  if (mode !== "interactive")
    return (
      <span className={cn("flex shrink-0 items-center gap-1", mode === "reserve" && "invisible", className)} aria-hidden data-testid={mode === "static" ? "card-social-preview" : undefined}>
        {links.map((l) => {
          const Icon = ICONS[l.kind];
          return (
            <span key={l.kind} className={CARD_ICON}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          );
        })}
      </span>
    );
  return (
    <ul className={cn("flex shrink-0 items-center gap-1", className)} aria-label={`${owner}'s social links`} data-testid="card-social">
      {links.map((l) => (
        <li key={l.kind}>
          <CardSocialIcon link={l} owner={owner} />
        </li>
      ))}
    </ul>
  );
}

function CardSocialIcon({ link, owner }: { link: SocialLinkView; owner: string }) {
  const Icon = ICONS[link.kind];
  const control = cn(CARD_ICON, "transition-colors hover:bg-bg/90 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent");
  if (link.href)
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={control} aria-label={`${owner} on ${link.label}: ${link.text} (opens in a new tab)`} title={`${link.label}: ${link.text}`} data-testid={`card-social-${link.kind}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </a>
    );
  return <CardDiscordIcon link={link} owner={owner} className={control} icon={Icon} />;
}

function CardDiscordIcon({ link, owner, className, icon: Icon }: { link: SocialLinkView; owner: string; className: string; icon: typeof Play }) {
  const { name, copied, copy } = useCopyUsername(link);
  return (
    <button type="button" onClick={() => void copy()} className={className} aria-label={`Copy ${owner}'s Discord username, ${name}`} title={`Discord: ${name}. Copy the username`} data-testid={`card-social-${link.kind}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-good" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
