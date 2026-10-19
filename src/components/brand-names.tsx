"use client";

import * as React from "react";
import { DEFAULT_BRANDING, type Branding } from "@/domain/branding";

/**
 * The install's names (Admin → Branding) for client components' wording: the product name ("Done:
 * open …", help text) and the team name ("Member of the … team"). Server components read them from
 * getBranding directly; the app shell and the sign-in frame provide them here.
 */
export type BrandNames = Pick<Branding, "productName" | "teamName">;

const BrandNamesContext = React.createContext<BrandNames>({ productName: DEFAULT_BRANDING.productName, teamName: DEFAULT_BRANDING.teamName });

export function BrandNamesProvider({ names, children }: { names: BrandNames; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ productName: names.productName, teamName: names.teamName }), [names.productName, names.teamName]);
  return <BrandNamesContext.Provider value={value}>{children}</BrandNamesContext.Provider>;
}

export function useBrandNames(): BrandNames {
  return React.useContext(BrandNamesContext);
}
