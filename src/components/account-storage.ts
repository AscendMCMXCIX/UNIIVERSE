/*
  Keys for the conveniences a browser keeps for each account in its storage (a picker's recent
  champions, the champions Champion Lookup showed lately). The readable `uniiverse_who` cookie names the
  signed-in account (a fingerprint, not a credential: src/server/auth/account-jar.ts), so two people
  who use one browser one after the other never see, or forget, each other's. Without the cookie
  (signed out, a demo with no accounts, a test) the key is the base itself. A plain module, used by
  client components; on the server there is no document, so the base is the key.
*/

const COOKIE = "uniiverse_who";
/** What a marker may be: identityMarker writes 16 hex characters; anything else is not used in a key. */
const MARKER = /^[A-Za-z0-9_-]{1,64}$/;

/** The signed-in account's marker in this browser, or null when there is none to read. */
export function accountMarker(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const hit = document.cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
    const value = hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
    return MARKER.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** A storage key for the signed-in account: "<base>:<marker>", or the base itself without a marker. */
export function perAccountKey(base: string): string {
  const who = accountMarker();
  return who ? `${base}:${who}` : base;
}
