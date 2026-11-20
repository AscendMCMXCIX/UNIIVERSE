import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "./audit";
import { auditDetailsSentence, auditSentence } from "./audit-sentence";

/* Audit Logs in sentences: no `key: value`, no stored key (camelCase), no session count. */

const SAMPLES: Record<string, string | number | boolean | null>[] = [
  { teamMember: true },
  { teamMember: false },
  { profileErased: true },
  { level: "Standard" },
  { level: "custom", capabilities: 4 },
  { groups: "lineup-manager, match-manager" },
  { groups: 2 },
  { role: "player" },
  { fromMinutes: 5, toMinutes: 0 },
  { ok: true, kind: "check" },
  { purpose: "production verification", profile: false },
  { purpose: "production verification", reason: "derived again" },
  { change: "seed-roster" },
  { usernameChanged: true },
  { kind: "member", riotAccounts: 2, gamesDeleted: 10, gamesDeidentified: 3, notes: 1, auditEntries: 4 },
  { records: 3, unusable: 0, people: 2, traces: 5 },
  { added: 1, updated: 2, people: 1, traces: 0 },
  { link: "YouTube" },
  { someNewFlag: true, anotherValue: "x", snake_case_key: 3 },
];

describe("audit sentences", () => {
  it("never print `key: value` or a camelCase key", () => {
    for (const d of SAMPLES) {
      const text = auditDetailsSentence(d);
      expect(text, JSON.stringify(d)).not.toMatch(/\w:\s/);
      expect(text, JSON.stringify(d)).not.toMatch(/\b[a-z]+[A-Z]\w*/);
      for (const key of Object.keys(d)) if (/[A-Z_]/.test(key)) expect(text).not.toContain(key);
    }
  });

  it("read as words", () => {
    expect(auditDetailsSentence({ fromMinutes: 5, toMinutes: 0 })).toBe("From every 5 minutes to off.");
    expect(auditDetailsSentence({ teamMember: true })).toBe("Joins the team.");
    expect(auditDetailsSentence({})).toBe("");
    expect(auditSentence({ actorName: "Founder", action: "account.admin-grant", targetName: "Captain", details: {} })).toBe("Founder made Captain an administrator.");
    expect(auditSentence({ actorName: null, action: "owner.setup", targetName: null, details: {} })).toBe("The local owner created the Owner account.");
  });

  it("give every recorded action a sentence without `key: value` or an unfilled placeholder", () => {
    for (const action of Object.keys(AUDIT_ACTIONS)) {
      for (const targetName of ["Teammate", null]) {
        const text = auditSentence({ actorName: "Founder", action, targetName, details: {} });
        expect(text, action).not.toContain("{t}");
        expect(text, action).not.toMatch(/\b[a-z]+[A-Z]\w*/);
        expect(text, action).toMatch(/^Founder .+\.$/);
        expect(text, action).not.toMatch(/\w:\s/);
      }
    }
  });

  it("never mention a number of sessions", () => {
    const text = auditSentence({ actorName: "Founder", action: "account.sign-out-everywhere", targetName: "Teammate", details: {} }) + auditDetailsSentence({});
    expect(text).toBe("Founder signed Teammate out everywhere.");
    expect(text).not.toMatch(/\d|session/i);
  });
});
