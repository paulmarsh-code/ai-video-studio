"use client";

// An ⓘ beside a box whose words the app reads (D40): click for the words it understands, so
// what's written gets the result wanted. The lists live in `wordGuides.ts`.

import { useEffect, useRef, useState } from "react";
import { WORD_GUIDES, type GuideName } from "@/lib/domain/wordGuides";

export function WordsHelp({ guide }: { guide: GuideName }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const g = WORD_GUIDES[guide];
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={box} className="relative ml-1 inline-block align-middle">
      <button type="button" aria-label={`Words the app understands: ${g.title}`} aria-expanded={open} data-testid={`help-${guide}`}
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-300 bg-white text-[11px] font-bold italic text-blue-700 hover:bg-blue-50">i</button>
      {open && (
        <span role="dialog" aria-label={g.title} data-testid={`help-${guide}-note`}
          className="absolute left-0 top-6 z-40 block w-80 max-w-[85vw] rounded-lg border border-neutral-200 bg-white p-3 text-left text-xs font-normal not-italic text-neutral-800 shadow-lg">
          <span className="flex items-start justify-between gap-2">
            <span className="font-semibold">{g.title}: words the app understands</span>
            <button type="button" aria-label="Close" className="text-neutral-500 hover:text-neutral-800" onClick={(e) => { e.preventDefault(); setOpen(false); }}>×</button>
          </span>
          <span className="mt-1 block text-neutral-600">{g.intro}</span>
          {g.groups.map((grp) => (
            <span key={grp.heading} className="mt-2 block">
              <span className="block font-medium">{grp.heading}</span>
              <span className="block text-neutral-700">{grp.examples.map((x) => `“${x}”`).join(", ")}</span>
            </span>
          ))}
          {g.tip && <span className="mt-2 block border-t border-neutral-100 pt-2 text-neutral-600">{g.tip}</span>}
        </span>
      )}
    </span>
  );
}
