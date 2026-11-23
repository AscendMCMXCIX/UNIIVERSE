/*
  MATCHUP INTEL'S FIVE ROLES in the Production check (scripts/live-check.mjs, matchupRolesFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 3.2–3.6): on the desktop, from the page
  the Matchup Intel facts already load, the lane selector switched to each role in turn, the slots it
  sets read in the page, and what the check asserts, apart from the browser so a unit test can hand
  it any state (src/server/ops/live-check-matchup-roles.test.ts). Only the slots' fixed labels, the
  role pressed, the address's role and history's length are read.
*/

/** The slots each role sets, by their labels (src/components/matchup-intel/slots.ts), sorted. */
export const ROLE_SLOTS = {
  top: ["Enemy", "Your champion"],
  jungle: ["Enemy", "Your champion"],
  mid: ["Enemy", "Your champion"],
  adc: ["Enemy ADC", "Enemy support", "Your ADC", "Your support"],
  support: ["Enemy ADC", "Enemy support", "Your ADC", "Your support"],
};

/** The lane bar as it stands (self-contained, for evaluate). */
export function readRoleBar() {
  const pressed = [...document.querySelectorAll('[data-testid="matchup-role"] button[aria-pressed="true"]')].map((b) => b.getAttribute("data-role"));
  const labels = [...document.querySelectorAll('[data-testid="matchup-pickers"] [data-testid^="matchup-pick-"][data-testid$="-label"]')]
    // The label's words without its aria-hidden short form ("You", shown in the narrowest row only).
    .map((l) => {
      const copy = l.cloneNode(true);
      copy.querySelectorAll("[aria-hidden]").forEach((h) => h.remove());
      return copy.textContent?.replace(/\s+/g, " ").trim() ?? "";
    })
    .sort();
  return {
    pressed: pressed.length === 1 ? pressed[0] : null,
    slots: document.querySelector('[data-testid="matchup-pickers"]')?.getAttribute("data-slots") ?? null,
    labels,
    // The slot inputs drawn (each a button), counted apart from the frame's data-slots.
    inputs: document.querySelectorAll('[data-testid="matchup-pickers"] button[data-testid^="matchup-pick-"]').length,
    addressRole: new URLSearchParams(location.search).get("role"),
    path: location.pathname,
    length: history.length,
    busy: !!document.querySelector('[data-testid="matchup-intel-content"][aria-busy="true"]'),
  };
}

/**
 * What the check asserts: `reads` holds the bar read after each role was chosen ({ role, at }), and
 * `start` the bar as the page loaded. Each role sets its slots and its address (the role the page
 * loaded on carries the address it was opened with, which may name no role: Top, the default);
 * history keeps the length it had (the role replaces the address), so Back leaves the page rather
 * than walking back through the roles.
 */
export function matchupRolesVerdicts({ kind, start, reads }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  const verdict = (role) => {
    const r = reads.find((x) => x.role === role)?.at ?? null;
    const want = ROLE_SLOTS[role];
    const ok = !!r && r.pressed === role && r.slots === String(want.length) && r.inputs === want.length && r.labels.length === want.length && r.labels.every((l, i) => l === want[i]) && (r.addressRole === role || (r === start && r.addressRole === null));
    return { role, ok, ...(r ? { inputs: r.inputs, labels: r.labels.join(", "), addressRole: r.addressRole } : { read: false }) };
  };
  const solo = ["top", "jungle", "mid"].map(verdict);
  const duo = ["adc", "support"].map(verdict);
  fact('Matchup Intel\'s lane selector: Top, Jungle and Mid each set 2 slots ("Your champion", "Enemy") and their role= in the address', solo.every((v) => v.ok), solo);
  fact('Matchup Intel\'s lane selector: ADC and Support each set 4 slots ("Your ADC", "Your support", "Enemy ADC", "Enemy support") and their role= in the address', duo.every((v) => v.ok), duo);
  const last = reads.at(-1)?.at ?? null;
  fact("switching the role replaces the address, so Back leaves Matchup Intel rather than walking through roles", !!last && last.path === start.path && last.length === start.length, { switches: reads.filter((x) => x.role !== start.pressed).length, before: start.length, after: last?.length ?? null });
  return out;
}
