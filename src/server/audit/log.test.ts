import { describe, expect, it } from "vitest";
import { safeDetails } from "./log";
import { AUDIT_ACTIONS, auditLabel } from "@/domain/audit";

describe("admin activity details", () => {
  it("drops anything that looks like a secret and cuts long values short", () => {
    expect(safeDetails({ role: "owner", password: "hunter2", temporaryPassword: "x", setupKey: "k", token: "t", hash: "h", count: 3, on: true, gone: undefined })).toEqual({ role: "owner", count: 3, on: true });
    expect(String(safeDetails({ groups: "g".repeat(500) }).groups)).toHaveLength(80);
  });

  it("names every recorded action, and shows an unknown one as it is", () => {
    for (const label of Object.values(AUDIT_ACTIONS)) expect(label.length).toBeGreaterThan(5);
    expect(auditLabel("account.create")).toBe("Created an account");
    expect(auditLabel("something.else")).toBe("something.else");
  });
});
