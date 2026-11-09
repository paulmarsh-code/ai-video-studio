"use client";

// One button style for every action: shows it's working ("Saving…"), then that it's done
// ("✓ Saved") and stays done, so there's nothing to click again, until something it
// depends on changes (resetKey). Actions that can sensibly be repeated pass doneForMs.

import { useEffect, useState, type ReactNode } from "react";

type Outcome = void | boolean | { ok: boolean };

export interface ActionButtonProps {
  label: ReactNode;
  busyLabel?: string;
  doneLabel: string;
  onAction: () => Promise<Outcome> | Outcome;
  /** When this changes, the button returns from "done" to ready. */
  resetKey?: unknown;
  /** Return to ready after this long (for actions worth repeating). */
  doneForMs?: number;
  disabled?: boolean;
  variant?: "primary" | "approve" | "secondary";
  size?: "sm" | "md";
  title?: string;
  testId?: string;
}

const STYLE = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  approve: "bg-green-700 text-white hover:bg-green-800",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
};

export function ActionButton(p: ActionButtonProps) {
  const [state, setState] = useState<"ready" | "busy" | "done">("ready");
  const key = JSON.stringify(p.resetKey ?? null);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    if (state === "done") setState("ready");
  }

  useEffect(() => {
    if (state !== "done" || !p.doneForMs) return;
    const t = setTimeout(() => setState("ready"), p.doneForMs);
    return () => clearTimeout(t);
  }, [state, p.doneForMs]);

  async function run() {
    setState("busy");
    try {
      const r = await p.onAction();
      const failed = r === false || (typeof r === "object" && r !== null && "ok" in r && !r.ok);
      setState(failed ? "ready" : "done");
    } catch {
      setState("ready");
    }
  }

  const done = state === "done";
  const size = p.size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <button
      type="button"
      title={p.title}
      data-testid={p.testId}
      data-state={state}
      disabled={p.disabled || state === "busy" || done}
      onClick={() => void run()}
      className={`rounded-md ${size} transition-colors ${
        done ? "border border-green-600 bg-green-50 text-green-800" : `${STYLE[p.variant ?? "primary"]} disabled:opacity-50`
      }`}
    >
      {state === "busy" ? p.busyLabel ?? "Working…" : done ? `✓ ${p.doneLabel}` : p.label}
    </button>
  );
}

/** The "done" look on its own, for when the button that did the work has gone away. */
export function DoneBadge({ text }: { text: string }) {
  return <span className="rounded-md border border-green-600 bg-green-50 px-3 py-1 text-sm text-green-800" role="status">✓ {text}</span>;
}
