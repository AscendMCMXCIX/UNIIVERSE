/** Types for scripts/builds-probe.mjs (run by node in the Production check's workflow). */
export const PROBE_LABEL: string;
export function unsealProbe(sealed: string | null | undefined, secret: string | null | undefined): string | null;
export function parseProbe(text: string | null | undefined): Array<{ champion: string; queue: "solo" | "flex" | "draft" | "clash" }>;
