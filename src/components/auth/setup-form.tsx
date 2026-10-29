"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { DEFAULT_CARD_STYLE, type CardLook } from "@/domain/card-style";
import { DISPLAY_NAME_MAX, displayNameProblem, normaliseDisplayName } from "@/domain/display-name";
import { finishSetupAction, saveSetupProgressAction } from "@/server/actions/auth";
import type { PickerChampion } from "@/components/champions/types";
import { PoolSection } from "@/components/profile/profile-editor";
import { RoleFields } from "@/components/auth/role-fields";
import { CardPreview } from "@/components/players/card-preview";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { sanitiseSetup, setupProblems } from "@/domain/onboarding";
import { SetupSteps } from "./setup-steps";

export interface SetupValues {
  displayName: string;
  primaryRole: Role | null;
  primaryPool: string[];
  secondaryRole: Role | null;
  secondaryPool: string[];
}

/** The card the live preview starts from: their picture and saved look (a new player has the default look). */
export interface SetupCard {
  avatarUrl: string | null;
  look: CardLook | null;
}

const DEFAULT_LOOK: CardLook = { style: DEFAULT_CARD_STYLE, bannerUrl: null };

/**
 * WELCOME TO UNIIVERSE: the required part of a new player's first sign-in, in two steps: the
 * display name teammates will see, then roles and champions. Back and Continue keep everything
 * entered; every change is also saved to the server as it happens, so a refresh, a closed tab or
 * signing out resumes here. The live preview is the real Team card (CardPreview, as in the Card
 * Studio). The username and Riot ID come from the admin and are shown, not edited. The server
 * validates again on Finish, then the optional Personalise step opens.
 */
export function SetupForm({
  username,
  riotId,
  champions,
  initial,
  startAt = "name",
  card,
  autosave = true,
  preview = false,
  onPreviewFinish,
  onPreviewChange,
  onStepChange,
}: {
  username: string;
  riotId: string | null;
  champions: PickerChampion[];
  initial: SetupValues;
  startAt?: "name" | "profile";
  card?: SetupCard;
  /** False when an account that already finished comes back to change its answers (nothing half-done to keep). */
  autosave?: boolean;
  preview?: boolean;
  onPreviewFinish?: (values: SetupValues) => void;
  onPreviewChange?: (values: SetupValues) => void;
  /** Told when the player moves between the two steps (Admin → Previews follows it in its step bar). */
  onStepChange?: (step: "name" | "profile") => void;
}) {
  const [values, setValues] = React.useState<SetupValues>(initial);
  const [step, setStep] = React.useState<"name" | "profile">(startAt);
  const [nameTouched, setNameTouched] = React.useState(false);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const first = React.useRef(true);
  const moved = React.useRef(false);

  // Autosave, debounced: the server keeps the progress, not the browser.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Admin → Previews: the choices stay in this page only (the onboarding preview keeps them across its steps).
    if (preview) return onPreviewChange?.(values);
    if (!autosave) return;
    const t = setTimeout(async () => {
      setSaved("saving");
      const r = await saveSetupProgressAction(values);
      setSaved(r.ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [values, preview, autosave, onPreviewChange]);

  // A new step reads from its heading (keyboard and screen readers start there), not from the button just pressed.
  React.useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, [step]);
  const go = (next: "name" | "profile") => {
    moved.current = true;
    setError(null);
    setStep(next);
    onStepChange?.(next);
  };

  const nameProblem = displayNameProblem(values.displayName);
  const ready = !nameProblem && !!values.primaryRole && values.primaryPool.length >= 1;
  const finish = () => {
    setError(null);
    if (nameProblem) return go("name");
    if (preview) {
      if (!onPreviewFinish) return setError("Preview: nothing was saved. On the real page this finishes their setup and opens the optional Personalise step.");
      // The server's own rules (domain/onboarding), then the preview's next screen.
      const problems = setupProblems(sanitiseSetup(values));
      return problems.length ? setError(problems.join(" ")) : onPreviewFinish(values);
    }
    startTransition(async () => {
      const r = await finishSetupAction(values);
      if (r && !r.ok) setError(r.error);
    });
  };

  const shownName = normaliseDisplayName(values.displayName) || username;
  const art = values.primaryPool[0] ? { championId: values.primaryPool[0], skinNum: 0 } : null;
  const previewData = { role: values.primaryRole, rank: null, status: values.primaryRole ? ("main" as const) : null, season: null, poolIds: values.primaryPool };

  return (
    <div data-testid="setup-form" data-step={step}>
      <SetupSteps current={step} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6">
        <aside className="lg:order-2" aria-label="Live preview of your card" data-testid="setup-preview">
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Live preview</p>
          <div className="lg:sticky lg:top-4">
            <CardPreview view="team" look={card?.look ?? DEFAULT_LOOK} art={art} name={shownName} avatarUrl={card?.avatarUrl ?? null} data={previewData} champions={champions} />
            <p className="mt-1.5 text-xs text-fg-subtle">Your card as teammates see it on Team and Players. Its figures fill in once your games sync.</p>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {step === "name" ? (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                setNameTouched(true);
                if (!nameProblem) go("profile");
              }}
              data-testid="setup-name-step"
            >
              <div>
                <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
                  Your name
                </h2>
                <p className="mt-1 text-sm text-fg-muted">Choose the name teammates see on Team, Players, your profile, cards and Leaderboards.</p>
              </div>
              <div>
                <Label htmlFor="setup-display-name">Display name</Label>
                <Input
                  id="setup-display-name"
                  value={values.displayName}
                  maxLength={DISPLAY_NAME_MAX + 8}
                  autoComplete="nickname"
                  spellCheck={false}
                  onChange={(e) => {
                    const displayName = e.target.value;
                    setValues((v) => ({ ...v, displayName }));
                  }}
                  onBlur={() => setNameTouched(true)}
                  aria-invalid={nameTouched && !!nameProblem}
                  aria-describedby="setup-display-name-help"
                  data-testid="setup-display-name"
                />
                <p id="setup-display-name-help" className={nameTouched && nameProblem ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-xs text-fg-subtle"}>
                  {nameTouched && nameProblem ? nameProblem : `2–${DISPLAY_NAME_MAX} characters. It doesn't have to match your username or Riot ID, and you can change it any time in Settings.`}
                </p>
              </div>
              <dl className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm" data-testid="setup-account-facts">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <dt className="text-fg-subtle">Username (you sign in with it)</dt>
                  <dd className="font-medium text-fg">{username}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <dt className="text-fg-subtle">Riot ID</dt>
                  <dd className="font-medium text-fg">{riotId ?? "linked by your admin"}</dd>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">Both were entered by your admin and stay as they are. Ask them if either is wrong.</p>
              </dl>
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!nameProblem} data-testid="setup-continue">
                Continue
              </Button>
            </form>
          ) : (
            <div className="space-y-5" data-testid="setup-profile-step">
              <div>
                <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
                  Roles &amp; champions
                </h2>
                <p className="mt-1 text-sm text-fg-muted">The role you play and the champions you are ready to play. More roles and champions can be added later on My Profile.</p>
              </div>
              <RoleFields
                // Seeded from the current answers, so coming back from the name step keeps them.
                initialPrimary={values.primaryRole}
                initialSecondary={values.secondaryRole}
                onChange={(r) =>
                  setValues((v) => ({
                    ...v,
                    primaryRole: r.primaryRole,
                    secondaryRole: r.secondaryRole,
                    // A champion stays with the role it was picked for: changing a role clears that role's pool.
                    primaryPool: r.primaryRole === v.primaryRole ? v.primaryPool : [],
                    secondaryPool: r.secondaryRole === v.secondaryRole ? v.secondaryPool : [],
                  }))
                }
              />

              {values.primaryRole ? (
                <PoolSection title={`Primary champions · ${ROLE_LABELS[values.primaryRole]} (at least 1)`} role={values.primaryRole} ids={values.primaryPool} champions={champions} championsById={championsById} editable onChange={(ids) => setValues((v) => ({ ...v, primaryPool: ids }))} testId="primary-pool" />
              ) : (
                <p className="text-sm text-fg-subtle">Choose your primary role to pick its champions.</p>
              )}
              {values.secondaryRole ? <PoolSection title={`Secondary champions · ${ROLE_LABELS[values.secondaryRole]} (optional)`} role={values.secondaryRole} ids={values.secondaryPool} champions={champions} championsById={championsById} editable onChange={(ids) => setValues((v) => ({ ...v, secondaryPool: ids }))} testId="secondary-pool" /> : null}

              {error ? (
                <p className="text-sm text-bad" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="lg" onClick={() => go("name")} data-testid="setup-back">
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </Button>
                <Button type="button" variant="primary" size="lg" className="flex-1" disabled={pending || !ready} onClick={finish}>
                  {pending ? "Saving…" : "Finish setup"}
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-fg-subtle" aria-live="polite">
            {step === "profile" && !ready ? "Choose your primary role and at least one champion to continue. " : ""}
            {saved === "saving" ? "Saving your progress…" : saved === "saved" ? "Progress saved: you can come back to it any time." : saved === "error" ? "Could not save your progress just now; it will be retried with your next change." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
