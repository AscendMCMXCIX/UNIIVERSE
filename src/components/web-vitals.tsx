"use client";

import dynamic from "next/dynamic";

/**
 * The field-performance reporter (web-vitals-reporter), loaded after the page is interactive: the
 * browser keeps the paint and layout-shift entries it reads, so the page's first load carries none
 * of its code.
 */
export const WebVitals = dynamic(() => import("./web-vitals-reporter").then((m) => m.WebVitalsReporter), { ssr: false });
