/*
  The limits a profile's Refresh works within, shared by the server that enforces them
  (server/accounts/refresh.ts) and the control that explains them (components/ui/refresh-store.ts),
  so a repeated click can be answered without asking the server again.
*/

/** One refresh per account, and one multikill catch-up per player, per this long, whoever asks. */
export const REFRESH_COOLDOWN_SECONDS = 120;

/** Older games' records (their multikill counts) fetched again per Refresh. */
export const CATCH_UP_LIMIT = 40;
