import { describe, expect, it } from "vitest";
import { withDefaults } from "./cn";

describe("withDefaults", () => {
  it("lets a dialog's width replace the default max width (it used to lose in stylesheet order)", () => {
    const out = withDefaults("w-full max-w-none sm:m-auto sm:max-w-lg", "sm:max-w-4xl").split(" ");
    expect(out).not.toContain("sm:max-w-lg");
    expect(out).toEqual(expect.arrayContaining(["max-w-none", "sm:max-w-4xl", "w-full"]));
  });

  it("lets the caller's size classes replace the defaults for the same breakpoint", () => {
    const base = "h-11 w-full px-3 text-base md:h-9 md:text-sm rounded-md";
    expect(withDefaults(base, "w-24").split(" ")).not.toContain("w-full");
    expect(withDefaults(base, "md:h-8 md:text-xs").split(" ")).toEqual(expect.arrayContaining(["h-11", "text-base", "md:h-8", "md:text-xs"]));
    expect(withDefaults(base, "md:h-8").split(" ")).not.toContain("md:h-9");
    // Other classes are kept; colours named like sizes are not mistaken for font sizes.
    expect(withDefaults(base, "text-fg font-mono").split(" ")).toEqual(expect.arrayContaining(["text-base", "text-fg", "font-mono", "rounded-md"]));
    expect(withDefaults(base)).toBe(base);
  });

  it("knows the project's own type sizes and arbitrary rem sizes as sizes, not colours", () => {
    const primary = "bg-accent text-bg h-7 px-2.5 text-xs";
    for (const size of ["text-2xs", "text-4xs", "text-md", "text-figure", "text-[0.8rem]", "text-[length:13px]"]) {
      const out = withDefaults(primary, size).split(" ");
      expect(out).toContain("text-bg");
      expect(out).not.toContain("text-xs");
      expect(out).toContain(size);
    }
  });

  it("lets a caller recolour a button without touching alignment or border widths", () => {
    const ghost = "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 border border-border text-left";
    const out = withDefaults(ghost, "text-bad").split(" ");
    expect(out).not.toContain("text-fg-muted");
    expect(out).toEqual(expect.arrayContaining(["text-bad", "hover:text-fg", "text-left", "border"]));
    expect(withDefaults(ghost, "border-bad/40").split(" ")).not.toContain("border-border");
    expect(withDefaults(ghost, "border-2").split(" ")).toContain("border-border");
    expect(withDefaults("border-b border-border", "border-border-strong").split(" ")).toEqual(["border-b", "border-border-strong"]);
    expect(withDefaults("bg-surface bg-gradient-to-r", "bg-accent").split(" ")).toEqual(["bg-gradient-to-r", "bg-accent"]);
  });
});
