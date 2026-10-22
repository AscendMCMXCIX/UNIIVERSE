"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, FlaskConical } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { cn } from "@/lib/cn";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { emptyScenario, type LabScenario } from "@/domain/clash-scout/lab";
import { ManualTest } from "./manual-test";
import { BlindTest, type BlindState } from "./blind-test";
import { OutdatedTest } from "./outdated-test";

/*
  THE TESTING LAB's page: three ways to test the identification engine, sharing what the tester
  builds while the page is open (nothing is stored: leaving or reloading the page forgets it, unless
  the tester exported a test file):

    Manual test    five opponents typed in, run through the real pipeline;
    Blind test     accounts UNIIVERSE knows, shown as a scouting screen would, the answers sealed
                   on the server and opened only to grade;
    Outdated data  variants of the current test (older screens, a changed top five…) side by side.
*/

export type LabMode = "manual" | "blind" | "outdated";

const MODES: Array<{ key: LabMode; label: string }> = [
  { key: "manual", label: "Manual test" },
  { key: "blind", label: "Blind test" },
  { key: "outdated", label: "Outdated data" },
];

export interface LabProps {
  champions: PickerChampion[];
  platforms: string[];
  defaultPlatform: string;
  /** No Riot key here: a stand-in answers, and every result says so. */
  standIn: boolean;
  liveMastery: boolean;
}

export function ClashLab({ champions, platforms, defaultPlatform, standIn, liveMastery }: LabProps) {
  const [mode, setMode] = React.useState<LabMode>("manual");
  const [scenario, setScenario] = React.useState<LabScenario>(() => emptyScenario(defaultPlatform));
  const [blind, setBlind] = React.useState<BlindState | null>(null);
  const championMap = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const interactive = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const openInManual = (s: LabScenario) => {
    setScenario(s);
    setMode("manual");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5" data-testid="clash-lab" data-ready={interactive ? "true" : undefined}>
      <div className="flex flex-col gap-3 rounded-card border border-warn/40 bg-warn/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="lab-banner">
        <p className="flex items-start gap-2 text-sm text-fg">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span>
            <strong className="font-semibold">Test environment.</strong> Results here are not scouts and are never saved or shared. A strong mastery match is a statistical match, never a verified identity.
            {standIn ? " This server has no Riot key: a stand-in invents the Riot figures, so results only show how the Lab works." : null}
            {!standIn && !liveMastery ? " Live mastery lookups are switched off on this server: candidates are compared with earlier scouts only." : null}
          </span>
        </p>
        <Link href="/clash" className="inline-flex shrink-0 items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Clash Scout
        </Link>
      </div>

      <div role="tablist" aria-label="Kind of test" className={segmentedGroupClass("w-full sm:w-auto")} data-testid="lab-modes">
        {MODES.map((m) => (
          <button key={m.key} id={`lab-tab-${m.key}`} type="button" role="tab" aria-selected={mode === m.key} aria-controls={`lab-panel-${m.key}`} className={cn(segmentClass(mode === m.key), "flex-1 sm:flex-none")} onClick={() => setMode(m.key)} data-testid={`lab-mode-${m.key}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div id="lab-panel-manual" role="tabpanel" aria-labelledby="lab-tab-manual" hidden={mode !== "manual"}>
        <ManualTest champions={champions} championMap={championMap} platforms={platforms} scenario={scenario} onScenario={setScenario} standIn={standIn} />
      </div>
      <div id="lab-panel-blind" role="tabpanel" aria-labelledby="lab-tab-blind" hidden={mode !== "blind"}>
        <BlindTest championMap={championMap} platforms={platforms} defaultPlatform={defaultPlatform} state={blind} onState={setBlind} onEdit={openInManual} />
      </div>
      <div id="lab-panel-outdated" role="tabpanel" aria-labelledby="lab-tab-outdated" hidden={mode !== "outdated"}>
        <OutdatedTest championMap={championMap} scenario={scenario} blind={blind} onEdit={openInManual} />
      </div>
    </div>
  );
}
