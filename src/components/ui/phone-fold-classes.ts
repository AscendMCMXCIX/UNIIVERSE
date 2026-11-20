/*
  The phone Fold's classes (phone-fold.tsx), in a module without "use client" so that server
  components read the strings themselves: a value imported from a client module into a server
  component is a client reference, not the value.

  The posture is posture.ts's WINDOW_POSTURE_QUERY as CSS: max-md (under 48rem wide) or short (30rem,
  480px, tall or less; globals.css). phone-fold.test.ts holds the two in step.
*/

/** What folds away on a touch phone while the section is closed (the window posture, as CSS). */
export const PHONE_FOLDED = "max-md:group-data-[fold=closed]/fold:hidden short:group-data-[fold=closed]/fold:hidden";
/** What exists only where the section folds (its Show and Hide button). */
export const PHONE_FOLD_ONLY = "hidden max-md:inline-flex short:inline-flex";
/** Hidden on a touch phone (the window posture), for a part whose Fold state its own client component holds. */
export const PHONE_HIDDEN = "max-md:hidden short:hidden";
