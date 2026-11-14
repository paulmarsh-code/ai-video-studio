// The user's Kling Elements, for picking from a list (D114). The app has no Kling key, so Claude
// writes this list from Kling's own connection into data/kling_elements.json when asked ("refresh
// my Kling Elements"); the page reads it each time it opens.

import fs from "node:fs";
import path from "node:path";

export interface KlingListed { id: string; name: string }

export function klingElementList(): { elements: KlingListed[]; updatedAt?: string } {
  try {
    const f = path.join(process.cwd(), "data", "kling_elements.json");
    if (!fs.existsSync(f)) return { elements: [] };
    const j = JSON.parse(fs.readFileSync(f, "utf8")) as { updatedAt?: string; elements?: KlingListed[] };
    const elements = (j.elements ?? []).filter((e) => e && typeof e.id === "string" && typeof e.name === "string");
    return { elements, ...(j.updatedAt ? { updatedAt: j.updatedAt } : {}) };
  } catch {
    return { elements: [] };
  }
}
