"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { deviceClassOf, isVitalMetric, pageGroupOf, vitalBucket, type VitalMetric, type VitalsBeacon } from "@/domain/web-vitals";

/*
  Field performance (domain/web-vitals): this page load's LCP, CLS, INP, FCP and TTFB as the
  browser reports them, each reduced to its bucket and sent once, when the page is hidden (closed,
  left or put in the background). Only the page group ("players") and the device class leave the
  browser: never the address, the account or the values themselves. Moving between pages inside
  the app is not a new load; INP keeps counting for the page the app was opened on.
*/

const pending: Partial<Record<VitalMetric, number>> = {};
const sent = new Set<VitalMetric>();
let where: Pick<VitalsBeacon, "page" | "device"> | null = null;

function send() {
  const metrics = { ...pending };
  for (const name of Object.keys(metrics) as VitalMetric[]) delete pending[name];
  if (!where || Object.keys(metrics).length === 0) return;
  const beacon: VitalsBeacon = { ...where, metrics };
  try {
    navigator.sendBeacon("/api/vitals", JSON.stringify(beacon));
  } catch {
    // A measurement that cannot be sent is dropped.
  }
}

export function WebVitalsReporter() {
  useReportWebVitals((metric: { name: string; value: number }) => {
    const name = metric.name;
    if (!isVitalMetric(name) || sent.has(name)) return;
    const bucket = vitalBucket(name, metric.value);
    if (bucket === null) return;
    sent.add(name);
    pending[name] = bucket;
    // The final CLS and INP arrive as the page is hidden, possibly after the listener below ran.
    if (document.visibilityState === "hidden") send();
  });
  useEffect(() => {
    where ??= { page: pageGroupOf(location.pathname), device: deviceClassOf(window.innerWidth) };
    const hidden = () => {
      if (document.visibilityState === "hidden") send();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", send);
    };
  }, []);
  return null;
}
