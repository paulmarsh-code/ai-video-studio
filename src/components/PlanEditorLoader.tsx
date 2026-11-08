"use client";

// Konva needs the browser, so the editor is loaded client-side only.
import dynamic from "next/dynamic";

export const PlanEditorLoader = dynamic(() => import("./PlanEditor").then((m) => m.PlanEditor), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-neutral-500">Loading floor plan…</p>,
});
