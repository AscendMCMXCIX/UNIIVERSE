/** Types for scripts/type-facts.mjs (the live check is plain JavaScript run by node). */
export interface TypeFacts {
  tiers: Record<string, string>;
  disabledTone: { live: number; inControls: number };
  /** Text drawn in capitals outside a pill: each as its tag and nearest test id, never its words. */
  capitals: string[];
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export const TEXT_TIERS: Record<"--color-fg" | "--color-fg-muted" | "--color-fg-subtle" | "--color-fg-disabled", string>;
export function readTypeFacts(): TypeFacts;
export function tiersDeployed(tiers: Record<string, string> | null | undefined): boolean;
export function typeVerdicts(input: { kind: string; page: string; facts: TypeFacts; tiers?: boolean; sentenceCase?: boolean }): Verdict[];
