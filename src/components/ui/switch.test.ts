import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./switch";
import { Slider } from "@/components/players/customise-card";

/*
  The disabled tone (fg-disabled, 3.7–4.1:1) is for a disabled control's own words, which axe skips;
  what explains it or reads its value stays readable (AA): a switch's description, often the reason it
  is off ("Needs a colour wash (Colours)."), and a Card Studio slider's readout, an <output> that is
  not the control (axe checks it whatever the slider's state). 25 Nov 2026 review.
*/

const sw = (disabled: boolean) => renderToStaticMarkup(createElement(Switch, { checked: false, onChange: () => {}, label: "Moving colour wash", description: "Needs a colour wash (Colours).", disabled, id: "fx-drift" }));

describe("a disabled switch", () => {
  it("draws its label in the disabled tone and its description readable, in fg-subtle", () => {
    const html = sw(true);
    expect(html).toMatch(/<span class="block text-sm text-fg-disabled">Moving colour wash<\/span>/);
    expect(html).toMatch(/<span class="block text-xs text-fg-subtle" data-testid="switch-description">Needs a colour wash \(Colours\)\.<\/span>/);
    expect(html).toContain("cursor-not-allowed");
  });

  it("an enabled one keeps its label primary and its description secondary", () => {
    const html = sw(false);
    expect(html).toMatch(/<span class="block text-sm text-fg">Moving colour wash<\/span>/);
    expect(html).toMatch(/class="block text-xs text-fg-muted" data-testid="switch-description"/);
    expect(html).not.toContain("text-fg-disabled");
  });
});

describe("Card Studio's slider readout", () => {
  const slider = (disabled: boolean) => renderToStaticMarkup(createElement(Slider, { value: 50, min: 0, max: 100, onChange: () => {}, label: "Effect intensity", format: (v: number) => `${v}%`, disabled }));

  it("is never in the disabled tone: tertiary while the slider is off, primary while it is on", () => {
    const off = slider(true);
    expect(off).toMatch(/<output class="[^"]*text-fg-subtle"[^>]*data-testid="studio-slider-value">50%<\/output>/);
    expect(off).not.toMatch(/<output[^>]*text-fg-disabled/);
    expect(off).toMatch(/<input[^>]*disabled=""/);
    expect(slider(false)).toMatch(/<output class="[^"]*text-fg"[^>]*data-testid="studio-slider-value">50%<\/output>/);
  });
});
