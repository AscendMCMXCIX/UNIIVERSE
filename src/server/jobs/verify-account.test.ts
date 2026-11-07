import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveVerifyPassword } from "./verify-account";

/*
  The Production check works out the verification account's password itself (production-check.yml,
  the Live check step), with node's HMAC, as the app does. If the two drift apart, every signed-in
  check fails to sign in, so this keeps them identical.
*/
describe("the verification account's derived password", () => {
  it("is the workflow's derivation: HMAC-SHA256 of the same label, base64url", () => {
    const workflow = readFileSync(".github/workflows/production-check.yml", "utf8");
    expect(workflow).toContain('createHmac("sha256", process.env.CRON_SECRET).update("uniiverse:production-verification-account:v1", "utf8").digest("base64url")');
    expect(workflow).toContain('echo "::add-mask::$UNIIVERSE_VERIFY_PASSWORD"');
    expect(workflow).toContain("export UNIIVERSE_VERIFY_USER=verify UNIIVERSE_VERIFY_PASSWORD");
  });

  it("is long, URL-safe, and changes with CRON_SECRET", () => {
    const a = deriveVerifyPassword("secret-one-0123456789");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deriveVerifyPassword("secret-one-0123456789")).toBe(a);
    expect(deriveVerifyPassword("secret-two-0123456789")).not.toBe(a);
  });
});
