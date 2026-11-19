/** Types for scripts/page-budgets.mjs (shared by scripts/ux-measure.mjs and e2e/page-budgets.spec.ts). */
import type { Page, BrowserContextOptions, CDPSession } from "@playwright/test";

export interface Figures { screens: number; overflow: number; small: number; smallNames: string[]; frame: number; frameScrolled: number }
export type Setup = "se1" | "se3" | "i12" | "i15" | "max" | "land" | "i15s";
export const SETUPS: Record<Setup, { width: number; height: number; insets: [number, number, number, number] }>;
export const TEXT_SIZES: number[];
export const PAGES: Record<string, { path: string; admin?: boolean }>;
export function findPlayerId(page: Page, base: string): Promise<string>;
export function applySetup(page: Page, setup: Setup, text: number): Promise<CDPSession>;
export function contextOptions(setup: Setup): BrowserContextOptions;
export function measure(page: Page): Promise<Figures>;
export function openAndMeasure(page: Page, base: string, key: string, playerId: string | null): Promise<Figures>;
export function overBudget(figures: Figures, ceiling?: Partial<Record<"screens" | "frame" | "frameScrolled" | "small", number>>): string[];
