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
/** All Champions' table, as counts only. */
export interface TableFigureFacts {
  /** False where the list shows narrow rows (no columns). */
  table: boolean;
  cells: number;
  notPrimary: number;
  emptyNotTertiary: number;
  weightOff: number;
  headings: number;
  headingOff: number;
}
export const TABLE_FIGURES: string[];
export function readTableFigures(ids: readonly string[]): TableFigureFacts;
export function tableFigureVerdicts(input: { kind: string; facts: TableFigureFacts }): Verdict[];
export function tiersDeployed(tiers: Record<string, string> | null | undefined): boolean;
export function typeVerdicts(input: { kind: string; page: string; facts: TypeFacts; tiers?: boolean; sentenceCase?: boolean }): Verdict[];
