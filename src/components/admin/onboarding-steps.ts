/** The onboarding preview's practice account and steps (plain data: the server page reads them too). */
export const PREVIEW_ACCOUNT = { username: "NewPlayer", riotId: "NewPlayer#OCE", temporaryPassword: "Temp#2026" } as const;

export const ONBOARDING_STEPS = [
  { key: "signin", label: "Sign in" },
  { key: "password", label: "Password" },
  { key: "profile", label: "Roles & champions" },
  { key: "done", label: "Done" },
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];
