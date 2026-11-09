"use client";

import { useState, type ReactNode } from "react";

/** Keeps a section out of the way until it's needed, with a link to show it early. */
export function RevealLater({ show, placeholder, revealLabel, children }: { show: boolean; placeholder: ReactNode; revealLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (show || open) return <>{children}</>;
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-600" data-testid="images-later">
      {placeholder}
      <button type="button" className="mt-2 block text-blue-700 underline" onClick={() => setOpen(true)}>{revealLabel}</button>
    </div>
  );
}
