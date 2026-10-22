import { formatCount } from "@/lib/format";

/*
  Mastery points as people write them and as the League client shows them, with how precise each
  figure is, so a comparison never asks a rounded figure for more than it says:

    150000, 150,000, 150 000, 150.000   exact: 150,000
    150k, 150K                          a thousand-rounded figure: 149,500 to 150,499
    150.4k, 150,4k                      hundred-rounded: 150,350 to 150,449 (the client's "150.4K")
    1.2m, 1,2M                          1,150,000 to 1,249,999
    1.25m                               1,245,000 to 1,254,999

  `precision` is half the step of the last digit written (500 for "150k", 50 for "150.4k", 0 for an
  exact figure); the figure stands for points − precision to points + precision.
*/

export interface MasteryValue {
  points: number;
  precision: number;
  /** As entered, trimmed (shown back to the tester). */
  text: string;
}

/** Riot's largest mastery totals are a few million; anything past this is a typing slip. */
export const MAX_MASTERY_POINTS = 50_000_000;

export const MASTERY_FORMAT_HELP = "Use 150000, 150,000, 150k, 150.4k or 1.2m.";

const SUFFIXED = /^(\d{1,5})(?:[.,](\d{1,2}))?\s*([km])$/i;
const GROUPED = /^\d{1,3}(?:([,.\s  '])\d{3})+$/;

export function parseMasteryText(raw: string): { ok: true; value: MasteryValue } | { ok: false; error: string } {
  const text = raw.trim().replace(/\s*(?:pts|points)$/i, "");
  if (!text) return { ok: false, error: "Enter the mastery points." };
  let points: number;
  let precision = 0;
  const s = SUFFIXED.exec(text);
  if (s) {
    const unit = s[3]!.toLowerCase() === "m" ? 1_000_000 : 1_000;
    const decimals = s[2] ?? "";
    points = Math.round(Number(`${s[1]}.${decimals || "0"}`) * unit);
    precision = unit / 10 ** decimals.length / 2;
  } else if (/^\d+$/.test(text)) {
    points = Number(text);
  } else if (GROUPED.test(text) && new Set(text.replace(/\d/g, "")).size === 1) {
    points = Number(text.replace(/\D/g, ""));
  } else {
    return { ok: false, error: `"${raw.trim()}" is not a number of mastery points. ${MASTERY_FORMAT_HELP}` };
  }
  if (!Number.isFinite(points) || points <= 0) return { ok: false, error: "Mastery points must be more than 0." };
  if (points > MAX_MASTERY_POINTS) return { ok: false, error: `More than ${formatCount(MAX_MASTERY_POINTS)} points: check the figure.` };
  return { ok: true, value: { points, precision, text } };
}

/**
 * How precise a figure read from a screenshot is, from its digits: the client writes "175.4K" and
 * "1.2M", so a whole hundred is taken as a hundred-rounded figure, a whole thousand as
 * thousand-rounded, and anything else as exact.
 */
export function inferPrecision(points: number): number {
  if (points >= 1_000_000 && points % 100_000 === 0) return 50_000;
  if (points % 1_000 === 0) return 500;
  if (points % 100 === 0) return 50;
  return 0;
}

/** A figure written back as precisely as it was given: "150,000", "150k", "150.4k", "1.2m". */
export function formatMastery(points: number, precision: number): string {
  if (precision <= 0) return formatCount(points);
  const unit = points >= 1_000_000 && precision >= 5_000 ? 1_000_000 : 1_000;
  const decimals = Math.max(0, Math.round(Math.log10(unit / (precision * 2))));
  const value = (points / unit).toFixed(decimals);
  return `${value}${unit === 1_000_000 ? "m" : "k"}`;
}

/** The client's way of showing a figure (one decimal in thousands, "175.4k"), as used to build test inputs. */
export type MasteryRounding = "client" | "thousands" | "exact";

export function roundMastery(points: number, rounding: MasteryRounding): MasteryValue {
  if (rounding === "exact") return { points, precision: 0, text: formatCount(points) };
  // The client: "175.4k" under a million, "1.2m" from a million. Thousands: "175k", "1235k".
  const step = rounding === "thousands" ? 1_000 : points >= 1_000_000 ? 100_000 : 100;
  const rounded = Math.max(step, Math.round(points / step) * step);
  const precision = step / 2;
  return { points: rounded, precision, text: formatMastery(rounded, precision) };
}
