import { describe, expect, it } from "vitest";
import { resolveViewMode } from "./view-mode";
import type { Session } from "./permissions";

const base: Session = { userId: "u", role: "player", label: "P", playerId: "p", username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true };

describe("admin mode", () => {
  it("is the only view of the Owner account, with or without a player profile, whatever the cookie says", () => {
    for (const cookie of [undefined, "", "player", "admin"]) {
      expect(resolveViewMode(cookie, { ...base, role: "owner" }), String(cookie)).toBe("admin");
      expect(resolveViewMode(cookie, { ...base, role: "owner", playerId: null }), String(cookie)).toBe("admin");
    }
  });
  it("never turns on for anyone else", () => {
    for (const cookie of [undefined, "player", "admin"]) {
      expect(resolveViewMode(cookie, base)).toBe("player");
      expect(resolveViewMode(cookie, { ...base, role: "coach" })).toBe("player");
      expect(resolveViewMode(cookie, { ...base, capabilities: ["manage-lineup", "manage-players", "manage-matches"] })).toBe("player");
      expect(resolveViewMode(cookie, null)).toBe("player");
    }
  });
  it("lets only the automatic local owner of a development machine look at the player app", () => {
    expect(resolveViewMode("player", { ...base, role: "owner", localDev: true })).toBe("player");
    expect(resolveViewMode(undefined, { ...base, role: "owner", localDev: true })).toBe("admin");
  });
});
