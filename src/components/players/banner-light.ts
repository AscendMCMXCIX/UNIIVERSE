import type * as React from "react";

/**
 * The banner's light on the page: the player's own two card colours, faint, from behind the banner
 * down over the top of their profile, so the page below reads as theirs. Painted as the profile
 * frame's own background (behind everything in it, without a stacking context of its own, so menus
 * and tooltips keep their layers), each light an ellipse that ends inside its band (no edge where it
 * is cut off). Still: no animation.
 */
export function bannerLightStyle(colours: { primary: string; secondary: string }): React.CSSProperties {
  return {
    backgroundImage: `radial-gradient(30% 45% at 30% 45%, color-mix(in srgb, ${colours.primary} 16%, transparent), transparent), radial-gradient(26% 42% at 76% 48%, color-mix(in srgb, ${colours.secondary} 12%, transparent), transparent)`,
    backgroundSize: "100% 32rem",
    backgroundRepeat: "no-repeat",
  };
}
