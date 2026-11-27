/** Types for scripts/builds-probe.mjs (run by node in the Production check's workflow). */
export type ProbeEntry = { champion: string; queue: "solo" | "flex" | "draft" | "clash" };
export const PROBE_LABEL: string;
export function sealProbeText(text: string, secret: string, iv?: Buffer): string;
export function sealBuildsProbe(entries: ReadonlyArray<ProbeEntry | string>, secret: string, iv?: Buffer): string;
export function unsealProbe(sealed: string | null | undefined, secret: string | null | undefined): string | null;
export function parseProbe(text: string | null | undefined): ProbeEntry[];
export function unsealBuildsProbe(sealed: string | null | undefined, secret: string | null | undefined): ProbeEntry[] | null;
export function buildsChampionsEnv(entries: ReadonlyArray<ProbeEntry>): string;
