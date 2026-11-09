"use client";

import { ActionButton } from "./ActionButton";

/** Small button that runs a server action and confirms. */
export function LibraryButton({ label, action }: { label: string; action: () => Promise<unknown> }) {
  return <ActionButton variant="secondary" size="sm" label={label} busyLabel="Saving…" doneLabel="Saved to library" onAction={async () => { await action(); }} />;
}
