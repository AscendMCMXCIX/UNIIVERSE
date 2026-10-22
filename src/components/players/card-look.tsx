import * as React from "react";
import { Anchor, Coffee, Crosshair, Eye, Feather, Flame, Ghost, Heart, Leaf, Moon, Mountain, Music, PawPrint, Rocket, Shield, Skull, Snowflake, Sparkles, Star, Sun, Swords, Target, Waves, Zap, type LucideIcon } from "lucide-react";
import { accentCss, readableColour, type CardEmblem, type CardLook, type CardStyle } from "@/domain/card-style";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

/*
  The pieces of a personalised card, shared by every place a player's card appears (Team,
  Players, the profile header and the Studio preview). Decoration is drawn on
  top (frames as an overlay, glow as a shadow), never as extra width or height, so cards keep
  their size and stay aligned whatever each player chooses.
*/

export const EMBLEM_ICONS: Record<CardEmblem, LucideIcon> = {
  flame: Flame,
  bolt: Zap,
  sparkles: Sparkles,
  star: Star,
  moon: Moon,
  sun: Sun,
  leaf: Leaf,
  snowflake: Snowflake,
  waves: Waves,
  mountain: Mountain,
  feather: Feather,
  heart: Heart,
  ghost: Ghost,
  skull: Skull,
  swords: Swords,
  shield: Shield,
  crosshair: Crosshair,
  target: Target,
  rocket: Rocket,
  eye: Eye,
  anchor: Anchor,
  music: Music,
  coffee: Coffee,
  paw: PawPrint,
};

const mix = (c: string, pct: number, other = "transparent") => `color-mix(in srgb, ${c} ${pct}%, ${other})`;

function borderColour(style: CardStyle): string {
  const { border, primary, secondary } = style.colours;
  if (border === "primary") return mix(primary, 60, "var(--color-border)");
  if (border === "secondary") return mix(secondary, 60, "var(--color-border)");
  return "var(--color-border)";
}

function surface(style: CardStyle): string {
  if (style.identity.theme === "deep") return "var(--color-bg-elevated)";
  if (style.identity.theme === "tinted") return mix(style.colours.primary, 9, "var(--color-surface)");
  return "var(--color-surface)";
}

/**
 * Inline style for a card's outer element: colour variables for everything inside it
 * (`--card-accent` is the readable primary for text and icons), the surface, the border colour
 * and the optional glow. `glow` false for small variants.
 */
export function cardShellStyle(look: CardLook | null | undefined, opts: { glow?: boolean } = {}): React.CSSProperties {
  if (!look) return {};
  const s = look.style;
  const glow = opts.glow !== false && s.effects.glow ? `0 0 ${Math.round(10 + 22 * (s.effects.intensity / 100))}px ${mix(s.colours.primary, Math.round(18 + 30 * (s.effects.intensity / 100)))}` : undefined;
  return {
    ["--card-accent" as string]: s.colours.primary === "#1fc3ff" ? accentCss(s) : readableColour(s.colours.primary),
    ["--card-primary" as string]: s.colours.primary,
    ["--card-secondary" as string]: s.colours.secondary,
    ["--card-surface" as string]: surface(s),
    background: surface(s),
    borderColor: borderColour(s),
    boxShadow: glow,
  };
}

/** The decorative frame over a card (pointer-events none; never changes the card's size). */
export function CardFrame({ look, className }: { look: CardLook | null | undefined; className?: string }) {
  if (!look) return null;
  const s = look.style;
  const gradient = s.colours.border === "gradient";
  const c = s.colours.border === "secondary" ? s.colours.secondary : s.colours.border === "subtle" ? "var(--color-border-strong)" : s.colours.primary;
  const ring = (width: number): React.CSSProperties =>
    gradient
      ? { padding: width, background: `linear-gradient(135deg, ${s.colours.primary}, ${s.colours.secondary})`, mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", maskComposite: "exclude", WebkitMaskComposite: "xor" }
      : { boxShadow: `inset 0 0 0 ${width}px ${mix(c, 85)}` };
  const base = "pointer-events-none absolute inset-0 z-[1] rounded-[inherit]";
  const corner = (pos: string) => <span className={cn("absolute h-4 w-4", pos)} style={{ borderColor: gradient ? s.colours.primary : c }} />;
  let body: React.ReactNode = null;
  switch (s.frame) {
    case "none":
      body = gradient ? <span className={base} style={ring(1)} /> : null;
      break;
    case "minimal":
      body = <span className={base} style={gradient ? ring(1) : { boxShadow: `inset 0 0 0 1px ${mix(c, 55)}` }} />;
      break;
    case "outline":
      body = <span className={base} style={ring(2)} />;
      break;
    case "double":
      body = (
        <>
          <span className={base} style={ring(1)} />
          <span className="pointer-events-none absolute inset-[4px] z-[1] rounded-[calc(1rem-4px)]" style={{ boxShadow: `inset 0 0 0 1px ${mix(gradient ? s.colours.secondary : c, 55)}` }} />
        </>
      );
      break;
    case "angular":
      body = (
        <span className={base} style={{ boxShadow: `inset 0 0 0 1px ${mix(gradient ? s.colours.primary : c, 35)}` }}>
          {corner("left-1.5 top-1.5 border-l-2 border-t-2")}
          {corner("right-1.5 top-1.5 border-r-2 border-t-2")}
          {corner("bottom-1.5 left-1.5 border-b-2 border-l-2")}
          {corner("bottom-1.5 right-1.5 border-b-2 border-r-2")}
        </span>
      );
      break;
    case "glow":
      body = (
        <>
          <span className={base} style={ring(1)} />
          <span className={base} style={{ boxShadow: `inset 0 0 ${Math.round(14 + 14 * (s.effects.intensity / 100))}px ${mix(s.colours.primary, 30)}` }} />
        </>
      );
      break;
    case "premium":
      body = (
        <>
          <span className={base} style={gradient ? ring(1.5) : { boxShadow: `inset 0 0 0 1.5px ${mix(c, 90)}` }} />
          <span className="pointer-events-none absolute left-1/2 top-0 z-[1] h-[3px] w-14 -translate-x-1/2 rounded-b-full" style={{ background: `linear-gradient(90deg, ${s.colours.primary}, ${s.colours.secondary})` }} />
        </>
      );
      break;
  }
  return body ? (
    <span aria-hidden className={cn("contents", className)} data-testid="card-frame" data-frame={s.frame}>
      {body}
    </span>
  ) : null;
}

/** The player's picture with their avatar frame (drawn as a ring/shadow: same size as a plain avatar). */
export function CardAvatar({ look, name, src, size = "lg", className, children }: { look: CardLook | null | undefined; name: string; src: string | null; size?: React.ComponentProps<typeof Avatar>["size"]; className?: string; children?: React.ReactNode }) {
  const frame = look?.style.colours.avatarFrame ?? "primary";
  const s = look?.style;
  const picture = children ?? <Avatar name={name} src={src} size={size} />;
  if (!s || frame === "none") return <span className={cn("relative inline-flex shrink-0 rounded-full", className)} data-avatar-frame="none">{picture}</span>;
  if (frame === "gradient")
    return (
      <span className={cn("relative -m-[2px] inline-flex shrink-0 rounded-full p-[2px]", className)} style={{ background: `linear-gradient(135deg, ${s.colours.primary}, ${s.colours.secondary})` }} data-avatar-frame="gradient">
        {picture}
      </span>
    );
  const colour = frame === "secondary" ? s.colours.secondary : frame === "neutral" ? "var(--color-border-strong)" : s.colours.primary === "#1fc3ff" ? "var(--color-accent)" : s.colours.primary;
  return (
    <span className={cn("relative inline-flex shrink-0 rounded-full", className)} style={{ boxShadow: `0 0 0 2px ${colour}` }} data-avatar-frame={frame}>
      {picture}
    </span>
  );
}

const NAME_CLASS: Record<CardStyle["identity"]["nameStyle"], string> = {
  standard: "font-semibold",
  bold: "font-extrabold tracking-tight",
  wide: "font-semibold uppercase tracking-[0.06em] text-[0.92em]",
  italic: "font-semibold italic",
};

/** A word this long may not fit a narrow card's line: it gets break hints (nameParts). */
const LONG_WORD = 13;

/**
 * A name cut where a line may break inside a long word: before a capital that follows a small
 * letter, and between letters and digits. CardName joins the parts with <wbr>, so
 * "XxShadowAssassin2026" can break as "XxShadowAssassin / 2026" instead of at whichever letter
 * reaches the edge, and nothing is added to the text (copying it or reading it aloud is unchanged).
 * A name without a long word is one part.
 */
export function nameParts(name: string): string[] {
  if (!name.split(/\s+/).some((w) => [...w].length >= LONG_WORD)) return [name];
  const parts: string[] = [];
  let part = "";
  let prev = "";
  for (const ch of name) {
    const meet = (/\p{Ll}/u.test(prev) && /\p{Lu}/u.test(ch)) || (/\p{L}/u.test(prev) && /\p{N}/u.test(ch)) || (/\p{N}/u.test(prev) && /\p{L}/u.test(ch));
    if (meet && part) {
      parts.push(part);
      part = "";
    }
    part += ch;
    prev = ch;
  }
  parts.push(part);
  return parts;
}

/**
 * The player's name in their name style, with their emblem beside its first line. It is never cut:
 * a name too long for its line takes as many lines as it needs (at most 32 characters, so a few at
 * the narrowest card), with its lines balanced, breaking a long word where its parts meet
 * (nameParts) and inside a part only when it must. The full text is also its title.
 * `dir="auto"` keeps a right-to-left name in its own order without reordering what is around it.
 */
export function CardName({ look, name, className }: { look: CardLook | null | undefined; name: string; className?: string }) {
  const emblem = look?.style.identity.emblem;
  const Icon = emblem ? EMBLEM_ICONS[emblem] : null;
  return (
    <span className={cn("flex min-w-0 items-start gap-1.5", className)}>
      {Icon ? <Icon className="mt-[calc((1lh_-_0.9em)/2)] h-[0.9em] w-[0.9em] shrink-0" style={{ color: "var(--card-accent, var(--color-accent))" }} aria-hidden data-testid="card-emblem" data-emblem={emblem} /> : null}
      <span dir="auto" title={name} className={cn("min-w-0 text-balance [overflow-wrap:anywhere]", NAME_CLASS[look?.style.identity.nameStyle ?? "standard"])} data-name-style={look?.style.identity.nameStyle ?? "standard"} data-testid="card-name">
        {nameParts(name).map((part, i) => (
          <React.Fragment key={i}>
            {i ? <wbr /> : null}
            {part}
          </React.Fragment>
        ))}
      </span>
    </span>
  );
}

/**
 * The player's own tagline, in quotes, wrapping onto as many lines as it needs (at most 40
 * characters, so two lines on the narrowest card; a third only for unusually wide letters, where
 * it stops with an ellipsis and its title holds the whole text). One step larger on a card of
 * 17rem or more.
 */
export function CardTagline({ look, className }: { look: CardLook | null | undefined; className?: string }) {
  const text = look?.style.identity.tagline ?? "";
  if (!text) return null;
  return (
    <span className={cn("line-clamp-3 text-xs leading-snug text-fg-muted [overflow-wrap:anywhere] @min-[17rem]/card:text-sm", className)} data-testid="card-tagline" title={text}>
      “{text}”
    </span>
  );
}
