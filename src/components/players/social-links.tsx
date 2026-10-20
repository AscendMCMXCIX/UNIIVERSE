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

/** Discord has no public address for a username: the chip shows it and copies it. */
function CopyUsername({ link, className, icon: Icon }: { link: SocialLinkView; className: string; icon: typeof Play }) {
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
  return (
    <button type="button" onClick={() => void copy()} className={className} title={`Discord: ${name}. Copy the username`} data-testid={`social-${link.kind}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{link.text}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden /> : <Copy className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
      <span className="sr-only">{copied ? " (copied)" : ": copy the Discord username"}</span>
    </button>
  );
}
