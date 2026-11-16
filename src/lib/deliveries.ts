// How each line is delivered (D138): written by the app for every spoken panel that has none, or
// all of them again; and set by the user on a panel.

import { eq } from "drizzle-orm";
import { persist, type DB } from "@/db/client";
import * as t from "@/db/schema";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { deliveryPrompt, parseDeliveries } from "./domain/delivery";
import type { TextProvider } from "./providers/images";

type Line = { characterId: string; text: string; delivery?: string };

export async function writeDeliveries(db: DB, sceneId: string, provider: TextProvider, opts: { all?: boolean } = {}): Promise<{ written: number; asked: number }> {
  const s = repo.getScene(db, sceneId);
  if (!s) throw new Error("That scene wasn't found.");
  const project = repo.getProject(db, s.scene.projectId)!;
  const cast = repo.getCast(db, s.scene.projectId);
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const panels = [...s.panels].sort((a, b) => a.order - b.order);
  const spoken = panels.filter((p) => (p.dialogue as Line[]).some((d) => d.text?.trim() && (opts.all || !d.delivery?.trim())));
  if (!spoken.length) return { written: 0, asked: 0 };
  const chars = studio.listCharacters(db, s.scene.projectId);
  const about = (id: string) => {
    const c = chars.find((x) => x.slug === id);
    const pr = (c?.approved?.profile ?? {}) as { role?: string; personality?: string; appearance?: string };
    return [pr.role, pr.personality].filter(Boolean).join("; ") || undefined;
  };
  const inScene = [...new Set(panels.flatMap((p) => (p.dialogue as Line[]).map((d) => d.characterId)))];
  const prompt = deliveryPrompt({
    story: s.scene.story || studio.briefOf(project).outline,
    audience: studio.briefOf(project).audience,
    characters: (inScene.length ? cast.filter((c) => inScene.includes(c.id)) : cast).map((c) => ({ name: c.name, about: about(c.id) })),
    panels: spoken.map((p) => { const d = (p.dialogue as Line[])[0]; return { order: p.order, speaker: name(d.characterId), line: d.text, emotion: p.emotion, description: p.description }; }),
    around: panels.map((p) => { const d = (p.dialogue as Line[])[0]; return { order: p.order, description: p.description, speaker: d ? name(d.characterId) : undefined, line: d?.text }; }),
  });
  const got = parseDeliveries(await provider.describe(prompt));
  let written = 0;
  for (const p of spoken) {
    const d = got.get(p.order);
    if (!d) continue;
    const dialogue = (p.dialogue as Line[]).map((x, i) => (i === 0 ? { ...x, delivery: d } : x));
    db.update(t.panels).set({ dialogue }).where(eq(t.panels.id, p.id)).run();
    written++;
  }
  persist(db);
  return { written, asked: spoken.length };
}

/** The user's own words for how a panel's line is delivered; empty clears it. */
export function setDelivery(db: DB, panelId: string, text: string) {
  const p = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  if (!p) throw new Error("That panel wasn't found.");
  const lines = p.dialogue as Line[];
  if (!lines.length) throw new Error("This panel has no line.");
  const d = text.replace(/\s+/g, " ").trim();
  const dialogue = lines.map((x, i) => { if (i) return x; const { delivery: _old, ...rest } = x; void _old; return d ? { ...rest, delivery: d } : rest; });
  db.update(t.panels).set({ dialogue }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}
