/** Types for scripts/builds-probe.mjs (run by node in the Production check's workflow). */
export function sealBuildsProbe(ids: readonly string[], secret: string, iv?: Buffer): string;
export function unsealBuildsProbe(sealed: string | null | undefined, secret: string): string[] | null;
