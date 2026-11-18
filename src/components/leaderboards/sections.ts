/**
 * The page's sections, in reading order: their anchors (each section's id), for the phone's index
 * (SectionIndex), the old Records address that lands on its section (RetiredViewLanding), and the
 * boards themselves. Plain values, so server and client components share them.
 */
export const SECTIONS = { form: "recent-form", records: "season-records", multikills: "multikills", milestones: "milestones" } as const;
