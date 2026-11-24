"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { artBoxOf, CONTEXT_LABEL, CONTEXT_PLACE, PreviewContent, PreviewFrame, previewScreen, type ArtBox, type PreviewContext, type PreviewDevice, type PreviewScreen, type PreviewSubject } from "./studio-preview";

/*
  Card Studio's stage: the chosen preview (studio-preview.tsx) scaled into the room the Studio gives
  it, and the artwork surface over the artwork's crop, where the artwork is dragged, pinched or
  wheeled into place.

  - Fit: the whole place in view, as large as the room allows (up to 1.6× its real size: a phone's
    header on a desktop's preview is drawn larger, never distorted). Actual size: its real size in
    CSS pixels, the stage scrolling where it is larger than the room. Neither changes the saved
    artwork's zoom: they size the preview only.
  - The crop: a fine outline around the artwork's box, the box the page shows; while the artwork is
    moved, the rest of the picture shows faintly around it, so you see what the crop leaves out.
*/

/** The largest a preview is drawn in Fit (a phone's header in a desktop's room). */
const MAX_FIT = 1.6;

interface Measured {
  /** The shown element inside the frame, in the frame's CSS pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  art: ArtBox | null;
}

const sameMeasure = (a: Measured | null, b: Measured | null) => !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && JSON.stringify(a.art) === JSON.stringify(b.art);

/** The screen a device stands for, measured once on the client (and again when the window turns or resizes). */
function useScreen(device: PreviewDevice): PreviewScreen | null {
  const [screen, setScreen] = React.useState<PreviewScreen | null>(null);
  React.useEffect(() => {
    const measure = () =>
      setScreen((cur) => {
        const next = previewScreen(device);
        return cur && cur.width === next.width && cur.height === next.height && cur.sidebar === next.sidebar ? cur : next;
      });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [device]);
  return screen;
}

export function StudioPreview({ context, device, fit, subject, className, surface }: { context: PreviewContext; device: PreviewDevice; fit: "fit" | "actual"; subject: PreviewSubject; className?: string; /** The artwork surface for the shown crop (ArtSurface), given its box and the scale. */ surface?: (box: ArtBox, scale: number) => React.ReactNode }) {
  const screen = useScreen(device);
  const stage = React.useRef<HTMLDivElement>(null);
  const [room, setRoom] = React.useState<{ width: number; height: number } | null>(null);
  // Measured for the place shown (a new place starts measured afresh).
  const key = `${context}-${device}`;
  const [measuredFor, setMeasured] = React.useState<(Measured & { key: string }) | null>(null);
  const measured = measuredFor?.key === key ? measuredFor : null;
  React.useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom((cur) => (cur && cur.width === el.clientWidth && cur.height === el.clientHeight ? cur : { width: el.clientWidth, height: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onTarget = React.useCallback(
    (target: HTMLElement | null) => {
      if (!target) return setMeasured(null);
      const r = target.getBoundingClientRect();
      const next = { key, left: r.left, top: r.top, width: r.width, height: r.height, art: artBoxOf(target) };
      setMeasured((cur) => (cur?.key === key && sameMeasure(cur, next) ? cur : next));
    },
    [key],
  );

  const pad = 8;
  const scale = measured && room ? (fit === "actual" ? 1 : Math.max(0.1, Math.min(MAX_FIT, (room.width - pad * 2) / measured.width, (room.height - pad * 2) / measured.height))) : 1;
  const w = measured ? measured.width * scale : 0;
  const h = measured ? measured.height * scale : 0;
  const place = CONTEXT_PLACE[context][device];
  const title = `Preview: ${CONTEXT_LABEL[context]}, ${device === "desktop" ? "desktop" : "phone"}`;

  return (
    <div ref={stage} className={cn("relative min-h-0 min-w-0 rounded-panel", fit === "actual" ? "overflow-auto overscroll-contain" : "overflow-hidden", className)} data-testid="studio-stage">
      <div className="flex min-h-full min-w-full p-2" style={fit === "actual" && measured ? { width: w + pad * 2, height: h + pad * 2 } : undefined}>
        <div
          className={cn("relative m-auto shrink-0", !measured && "opacity-0")}
          style={{ width: w, height: h }}
          role="img"
          aria-label={title}
          data-testid="card-preview"
          data-context={context}
          data-device={device}
          data-view={context}
          data-frame={subject.look.style.frame}
          data-place={place ?? undefined}
          data-scale={Math.round(scale * 1000) / 1000}
          data-width={measured ? Math.round(measured.width) : undefined}
          data-height={measured ? Math.round(measured.height) : undefined}
          data-zoom={subject.look.style.art.zoom}
        >
          {/* Only the shown element: the rest of the screen the frame stands for is clipped away (and adds no scrolling). */}
          <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
            {screen ? (
              <PreviewFrame key={`${context}-${device}-${screen.width}x${screen.height}`} screen={screen} title={title} onTarget={onTarget} style={{ transform: `translate(${-(measured?.left ?? 0) * scale}px, ${-(measured?.top ?? 0) * scale}px) scale(${scale})` }}>
                <PreviewContent context={context} device={device} screen={screen} subject={subject} />
              </PreviewFrame>
            ) : null}
          </div>
          {measured?.art && surface ? surface(measured.art, scale) : null}
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The saved zoom's steps (normaliseCardStyle keeps 0.05). */
const roundZoom = (v: number) => Math.round(clamp(v, 1, 2) * 20) / 20;

/**
 * The artwork's crop over the preview, where it is moved: drag it (a finger or a mouse), pinch or
 * use the wheel to zoom, or focus it and use the arrow keys (Shift for larger steps) and + and −.
 * Every move changes the position the preview's place uses: its own, when it has one, else the shared
 * one (onChange). The sliders in Artwork set the same values precisely.
 */
export function ArtSurface({ box, scale, placement, blur, label, own, onChange }: { box: ArtBox; scale: number; placement: { focusX: number; focusY: number; zoom: number }; blur: number; label: string; own: boolean; onChange: (p: { focusX: number; focusY: number; zoom: number }) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [moving, setMoving] = React.useState(false);
  const latest = React.useRef({ placement, onChange, slack: { x: 0, y: 0 } });
  // The crop in screen pixels, and the picture as drawn: covering the crop, then zoomed about the focal point.
  const bw = box.width * scale;
  const bh = box.height * scale;
  const cover = bw / bh > box.ratio ? { w: bw, h: bw / box.ratio } : { w: bh * box.ratio, h: bh };
  const z = placement.zoom * (blur > 0 ? 1 + blur / 60 : 1);
  // What the picture overhangs the crop by, the room a drag moves it through (focal point 0–100%).
  const slack = { x: cover.w * z - bw, y: cover.h * z - bh };
  React.useLayoutEffect(() => {
    latest.current = { placement, onChange, slack };
  });

  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const start = React.useRef<{ x: number; y: number; focusX: number; focusY: number; zoom: number; dist: number | null } | null>(null);
  const begin = () => {
    const pts = [...pointers.current.values()];
    const p = latest.current.placement;
    const centre = pts.length ? { x: pts.reduce((a, b) => a + b.x, 0) / pts.length, y: pts.reduce((a, b) => a + b.y, 0) / pts.length } : { x: 0, y: 0 };
    start.current = { ...centre, focusX: p.focusX, focusY: p.focusY, zoom: p.zoom, dist: pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : null };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
    setMoving(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const s = start.current;
    const centre = { x: pts.reduce((a, b) => a + b.x, 0) / pts.length, y: pts.reduce((a, b) => a + b.y, 0) / pts.length };
    const zoom = s.dist && pts.length > 1 ? roundZoom(s.zoom * (Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) / s.dist)) : s.zoom;
    const sl = latest.current.slack;
    // The picture follows the pointer: moving it right shows more of its left (a lower focal point).
    const focusX = sl.x > 0.5 ? Math.round(clamp(s.focusX - ((centre.x - s.x) / sl.x) * 100, 0, 100)) : s.focusX;
    const focusY = sl.y > 0.5 ? Math.round(clamp(s.focusY - ((centre.y - s.y) / sl.y) * 100, 0, 100)) : s.focusY;
    const p = latest.current.placement;
    if (focusX !== p.focusX || focusY !== p.focusY || zoom !== p.zoom) latest.current.onChange({ focusX, focusY, zoom });
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) begin();
    else {
      start.current = null;
      setMoving(false);
    }
  };
  // The wheel zooms (a trackpad's pinch arrives as a wheel with Ctrl); a passive listener could not keep the page from scrolling.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const p = latest.current.placement;
      const zoom = roundZoom(p.zoom + (e.deltaY < 0 ? 0.05 : -0.05));
      if (zoom !== p.zoom) latest.current.onChange({ ...p, zoom });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const p = latest.current.placement;
    const step = e.shiftKey ? 5 : 1;
    let next = p;
    if (e.key === "ArrowLeft") next = { ...p, focusX: clamp(p.focusX - step, 0, 100) };
    else if (e.key === "ArrowRight") next = { ...p, focusX: clamp(p.focusX + step, 0, 100) };
    else if (e.key === "ArrowUp") next = { ...p, focusY: clamp(p.focusY - step, 0, 100) };
    else if (e.key === "ArrowDown") next = { ...p, focusY: clamp(p.focusY + step, 0, 100) };
    else if (e.key === "+" || e.key === "=") next = { ...p, zoom: roundZoom(p.zoom + 0.05) };
    else if (e.key === "-" || e.key === "_") next = { ...p, zoom: roundZoom(p.zoom - 0.05) };
    else return;
    e.preventDefault();
    if (next !== p) latest.current.onChange(next);
  };
  // The picture's whole extent as drawn (left = focal point × (crop − picture)), for the faint picture around the crop while moving.
  const ghost = { left: (placement.focusX / 100) * (bw - cover.w * z), top: (placement.focusY / 100) * (bh - cover.h * z), width: cover.w * z, height: cover.h * z };
  const descId = React.useId();
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-roledescription="artwork position"
      aria-label={`Artwork position: ${label}${own ? " (its own)" : ""}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={placement.focusX}
      aria-valuetext={`${placement.focusX}% across, ${placement.focusY}% down, zoom ${Math.round(placement.zoom * 100)}%`}
      aria-describedby={descId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={cn("group/surface absolute z-[1] touch-none select-none outline-none", moving ? "cursor-grabbing" : "cursor-grab")}
      style={{ left: box.left * scale, top: box.top * scale, width: bw, height: bh }}
      data-testid="art-surface"
      data-focus-x={placement.focusX}
      data-focus-y={placement.focusY}
      data-zoom={placement.zoom}
      data-own={own || undefined}
    >
      <span id={descId} className="sr-only">
        Drag, or use the arrow keys, to move the artwork; plus and minus zoom.
      </span>
      {moving && box.src ? (
        // The rest of the picture, faintly, outside the crop while it moves (the preview's own picture, already loaded).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={box.src} alt="" aria-hidden className="pointer-events-none absolute max-w-none object-cover opacity-30" style={{ ...ghost, clipPath: `path(evenodd, "M0 0H${ghost.width}V${ghost.height}H0Z M${-ghost.left} ${-ghost.top}h${bw}v${bh}h${-bw}Z")` }} data-testid="art-ghost" />
      ) : null}
      {/* The crop: what the page shows of the picture. */}
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[inherit] outline-dashed outline-1 -outline-offset-1 transition-opacity", moving ? "opacity-100 outline-accent" : "opacity-60 outline-fg/40 group-hover/surface:opacity-100 group-focus-visible/surface:opacity-100 group-focus-visible/surface:outline-2 group-focus-visible/surface:outline-accent")} data-testid="art-crop" />
    </div>
  );
}
