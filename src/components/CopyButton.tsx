"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-100"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
