"use client";

import * as React from "react";
import { ExternalLink, Laptop, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";

const SCREENS = [
  { key: "login", label: "Sign in", src: "/preview/login" },
  { key: "setup", label: "New player setup", src: "/preview/setup" },
] as const;

const DEVICES = [
  { key: "phone", label: "Phone", icon: Smartphone, width: 390, height: 844 },
  { key: "tablet", label: "Tablet", icon: Tablet, width: 768, height: 1024 },
  { key: "laptop", label: "Laptop", icon: Laptop, width: 1366, height: 768 },
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1920, height: 1080 },
] as const;

/**
 * The real pages in a frame of the chosen device size (the page lays itself out for that width,
 * as on the device), scaled down to fit this screen when needed. The pages themselves send
 * nothing: no account is created, no password changed, nobody signed in.
 */
export function PreviewStudio() {
  const [screen, setScreen] = React.useState<(typeof SCREENS)[number]["key"]>("login");
  const [device, setDevice] = React.useState<(typeof DEVICES)[number]["key"]>("phone");
  const [landscape, setLandscape] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const box = React.useRef<HTMLDivElement>(null);
  const [room, setRoom] = React.useState(0);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRoom(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = DEVICES.find((x) => x.key === device)!;
  const w = landscape ? d.height : d.width;
  const h = landscape ? d.width : d.height;
  const scale = room ? Math.min(1, room / w) : 1;
  const src = SCREENS.find((s) => s.key === screen)!.src;

  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" data-testid="preview-studio">
      {/* The two choices and the actions apart (24px), so the words of one group never read as the next's. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="radiogroup" aria-label="Page" className={segmentedGroupClass("flex-wrap overflow-visible")}>
          {SCREENS.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={screen === s.key} onClick={() => setScreen(s.key)} className={segmentClass(screen === s.key, { size: "md", className: "max-sm:max-w-full max-sm:whitespace-normal max-sm:text-center" })} data-testid={`preview-screen-${s.key}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Screen size" className={segmentedGroupClass("flex-wrap overflow-visible")}>
          {DEVICES.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="radio" aria-checked={device === key} onClick={() => setDevice(key)} className={segmentClass(device === key, { size: "md", className: "pointer-coarse:min-w-11" })} data-testid={`preview-device-${key}`}>
              <Icon className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
        {/* Rotate and Reset wrap together, in the segments' 14px type (G4-15); at a large text size on a narrow screen they stack rather than run off it. */}
        <span className="flex min-w-0 flex-wrap items-center gap-2" data-testid="preview-actions">
          <Button variant="outline" className="max-sm:px-2.5" onClick={() => setLandscape((v) => !v)} aria-pressed={landscape} data-testid="preview-rotate">
            <RotateCw className="h-4 w-4" /> Rotate
          </Button>
          <Button variant="outline" className="max-sm:px-2.5" onClick={() => setReload((n) => n + 1)}>
            Reset
          </Button>
        </span>
        <a href={src} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-9 items-center gap-1.5 text-sm text-accent hover:underline pointer-coarse:min-h-11">
          Open full size <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
      <p className="text-sm text-fg-subtle">
        {w} × {h} px{scale < 1 ? ` · shown at ${Math.round(scale * 100)}% to fit` : ""}
      </p>
      <div ref={box} className="w-full overflow-hidden">
        <div className="mx-auto overflow-hidden rounded-panel border border-border-strong bg-bg shadow-lg" style={{ width: w * scale, height: h * scale }}>
          <iframe key={`${src}-${reload}`} src={src} title={`${SCREENS.find((s) => s.key === screen)!.label} preview, ${d.label}`} width={w} height={h} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }} data-testid="preview-frame" />
        </div>
      </div>
    </section>
  );
}
