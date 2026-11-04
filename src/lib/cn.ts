import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Utilities a component's defaults may set and its caller may override, grouped by what they control. */
const SIZE_TEXT = /^text-(4xs|2xs|xs|sm|md|base|lg|xl|\dxl|figure|\[(length:)?[\d.]+(px|rem|em)\])$/;
const NOT_COLOUR = /^text-(left|center|right|justify|start|end|ellipsis|clip|wrap|nowrap|balance|pretty)$/;

/** Where a class's variants end: the last ":" outside brackets (text-[length:0.8rem] has one inside). */
function variantEnd(token: string): number {
  let depth = 0;
  let end = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) end = i;
  }
  return end;
}

function slot(token: string): string | null {
  const i = variantEnd(token);
  const variant = i >= 0 ? token.slice(0, i + 1) : "";
  const utility = token.slice(i + 1);
  const m = /^(max-w|max-h|w|h|px|py|bg|border)-/.exec(utility);
  if (m) {
    // Only colours count for backgrounds and borders: not border widths/styles or background images/positions.
    if (m[1] === "border" && (/^border(-[xytblrse])?(-\d+)?$/.test(utility) || /^border-(dashed|dotted|solid|double|none|hidden|collapse|separate)$/.test(utility))) return null;
    if (m[1] === "bg" && /^bg-(gradient|linear|radial|conic|none|cover|contain|auto|center|top|bottom|left|right|fixed|local|scroll|repeat|no-repeat|clip|origin|blend)/.test(utility)) return null;
    return variant + m[1];
  }
  if (SIZE_TEXT.test(utility)) return `${variant}text-size`;
  if (utility.startsWith("text-") && !NOT_COLOUR.test(utility)) return `${variant}text-colour`;
  return null;
}

/**
 * A component's default classes plus the caller's, where the caller's width (and max width),
 * height, padding,
 * font size or colours replace the defaults for the same breakpoint and state (Tailwind would
 * otherwise apply whichever comes later in its stylesheet, not in the class list).
 */
export function withDefaults(base: string, extra?: string): string {
  if (!extra) return base;
  const taken = new Set(extra.split(/\s+/).map(slot).filter((s): s is string => s !== null));
  return `${base
    .split(/\s+/)
    .filter((t) => {
      const s = slot(t);
      return s === null || !taken.has(s);
    })
    .join(" ")} ${extra}`;
}
