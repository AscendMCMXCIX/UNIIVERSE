"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { SocialLinkView } from "@/domain/social-links";
import { BrandIcon } from "@/components/brand-icons";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/*
  A member's social links as the platforms' own marks, icon only (the control's accessible name
  says which platform and whose link it is). YouTube, Twitch and a Discord profile open in a new
  tab (no referrer, nothing embedded); a Discord username, which has no public address, is copied.
  Only links already chosen for this viewer reach here (domain/social-links, visibleSocialLinks on
  the server). Every icon is its own control, so using one never reaches the card or header under
  it. One look everywhere: a round dark chip around the mark, `md` in headers and windows, `card`
  on a player card (sized by the card's own width: 1.75rem on a narrow card, 2rem from 17rem, a
  step more on touch screens), and on touch screens an invisible margin makes each a finger-sized
  target.
*/

const SIZE = {
  md: "h-9 w-9 [&_svg]:h-5 [&_svg]:w-5",
  card: "h-7 w-7 pointer-coarse:h-8 pointer-coarse:w-8 [&_svg]:h-4 [&_svg]:w-4 @min-[17rem]/card:h-8 @min-[17rem]/card:w-8 @min-[17rem]/card:pointer-coarse:h-9 @min-[17rem]/card:pointer-coarse:w-9 @min-[17rem]/card:[&_svg]:h-[1.125rem] @min-[17rem]/card:[&_svg]:w-[1.125rem]",
} as const;
type IconSize = keyof typeof SIZE;

const CHIP = "relative grid shrink-0 place-items-center rounded-full bg-bg/80 shadow-sm shadow-black/30 ring-1 ring-white/10";
const CONTROL = cn(CHIP, "transition-[background-color,transform] duration-150 hover:bg-bg active:scale-95 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']");

function nameOf(link: SocialLinkView, owner?: string): string {
  const whose = owner ? `${owner} on ${link.label}` : link.label;
  return link.href ? `${whose}: ${link.text} (opens in a new tab)` : `Copy ${owner ? `${owner}'s` : "the"} Discord username, ${link.text.replace(/^@/, "")}`;
}

/** One link: a link for an address, a copy button for a Discord username. */
function SocialIcon({ link, owner, size, testId }: { link: SocialLinkView; owner?: string; size: IconSize; testId: string }) {
  const label = nameOf(link, owner);
  if (link.href)
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={cn(CONTROL, SIZE[size])} aria-label={label} title={`${link.label}: ${link.text}`} data-testid={testId} data-kind={link.kind}>
        <BrandIcon kind={link.kind} />
      </a>
    );
  return <CopyUsername link={link} label={label} className={cn(CONTROL, SIZE[size])} testId={testId} />;
}

/** Copies a Discord username (Discord has no public address for one), with a short "copied" state. */
function CopyUsername({ link, label, className, testId }: { link: SocialLinkView; label: string; className: string; testId: string }) {
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
    <button type="button" onClick={() => void copy()} className={className} aria-label={copied ? `${label} (copied)` : label} title={`Discord: ${name}. Copy the username`} data-testid={testId} data-kind={link.kind} data-copied={copied || undefined}>
      {copied ? <Check className="text-good" aria-hidden /> : <BrandIcon kind={link.kind} />}
    </button>
  );
}

/** The links in a header or window (profile header, Team player window, previews of a member's links). */
export function SocialLinks({ links, owner, className }: { links: readonly SocialLinkView[]; /** Whose links: part of each control's name. */ owner?: string; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label={owner ? `${owner}'s social links` : "Social links"} data-testid="social-links">
      {links.map((l) => (
        <li key={l.kind}>
          <SocialIcon link={l} owner={owner} size="md" testId={`social-${l.kind}`} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The same links as icons on a player card (Team, Players, the public page, previews), on the
 * picture's row of CardIdentity. `interactive`: each icon its own control, drawn above the card's
 * own link or button; `static`: the same icons without actions (card previews).
 */
export function CardSocialIcons({ links, owner, mode = "interactive", className }: { links: readonly SocialLinkView[]; owner: string; mode?: "interactive" | "static"; className?: string }) {
  if (!links.length) return null;
  const row = "flex shrink-0 items-center gap-1.5 @min-[17rem]/card:gap-2";
  if (mode === "static")
    return (
      <span className={cn(row, className)} aria-hidden data-testid="card-social-preview">
        {links.map((l) => (
          <span key={l.kind} className={cn(CHIP, SIZE.card)}>
            <BrandIcon kind={l.kind} />
          </span>
        ))}
      </span>
    );
  return (
    <ul className={cn(row, className)} aria-label={`${owner}'s social links`} data-testid="card-social">
      {links.map((l) => (
        <li key={l.kind}>
          <SocialIcon link={l} owner={owner} size="card" testId={`card-social-${l.kind}`} />
        </li>
      ))}
    </ul>
  );
}
