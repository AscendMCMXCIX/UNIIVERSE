import type { PickerChampion } from "@/components/champion-picker";
import type { Branding } from "@/domain/branding";
import { SetPasswordForm } from "./set-password-form";
import { SetupForm, type SetupCard, type SetupValues } from "./setup-form";

/*
  The steps of a new player's first sign-in, as the card content: the real /welcome pages and
  Admin → Previews both render these, so the preview never drifts from what players see.
*/

/** The first-sign-in pages' eyebrow, with the app's own name (Admin → Branding). */
export const welcomeEyebrow = (b: Pick<Branding, "productName">) => `WELCOME TO ${b.productName.toUpperCase()}`;

/** Step 1: replace the temporary password from the admin. */
export function WelcomePasswordStep({ username, preview = false, onPreviewSaved }: { username: string; preview?: boolean; onPreviewSaved?: (password: string) => string | null }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Choose your password</h1>
      <p className="mt-2 text-sm text-fg-muted">
        You signed in as <span className="font-medium text-fg">{username}</span> with a temporary password. Choose your own now; the temporary one stops working as soon as you save.
      </p>
      <SetPasswordForm username={username} preview={preview} onPreviewSaved={onPreviewSaved} />
    </>
  );
}

/** Step 2: the required player profile (display name, then roles and champions), with a live preview of their card. */
export function WelcomeSetupStep({ username, riotId, champions, initial, startAt, card, autosave, preview = false, onPreviewFinish, onPreviewChange, onStepChange }: { username: string; riotId: string | null; champions: PickerChampion[]; initial: SetupValues; startAt?: "name" | "profile"; card?: SetupCard; autosave?: boolean; preview?: boolean; onPreviewFinish?: (values: SetupValues) => void; onPreviewChange?: (values: SetupValues) => void; onStepChange?: (step: "name" | "profile") => void }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Set up your player profile</h1>
      <p className="mt-2 text-sm text-fg-muted">Two quick required steps, saved as you go. Personalising your card comes after and is optional.</p>
      <SetupForm username={username} riotId={riotId} champions={champions} initial={initial} startAt={startAt} card={card} autosave={autosave} preview={preview} onPreviewFinish={onPreviewFinish} onPreviewChange={onPreviewChange} onStepChange={onStepChange} />
    </>
  );
}
