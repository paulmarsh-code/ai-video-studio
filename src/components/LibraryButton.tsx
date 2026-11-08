"use client";

import { useState, useTransition } from "react";

/** Small button that runs a server action and confirms. */
export function LibraryButton({ label, action }: { label: string; action: () => Promise<unknown> }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() => start(async () => { await action(); setDone(true); })}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-60"
    >
      {done ? "Saved to library" : pending ? "Saving…" : label}
    </button>
  );
}
