// Positions per panel (D35). The scene's floor plan is where everyone starts; any panel can
// move someone, turn them, or have them walk somewhere during it. What's set on a panel
// carries on to later panels until they're moved again, unless it was for "this panel only",
// and a panel whose own words move them (an arrival, a crossing) takes over from there.
// Pure functions, used by the server and by the floor plan's panel stepper alike.

import type { PanelBlock, Point, ShotSpec } from "./types";

export type BlockEntry = Omit<PanelBlock, "by">;

/**
 * Carry each panel's positions forward (D35). Someone placed on a panel stays there in later
 * panels until they're placed again, or the panel's own words move them (an arrival or exit
 * mark), unless the placement was "this panel only". Recomputed from scratch each time, so
 * removing a placement removes what it carried.
 */
export function carryBlocking<T extends { spec: ShotSpec }>(shots: T[]): ShotSpec[] {
  const state = new Map<string, { at: Point; facingDeg?: number; gone?: boolean; with?: string }>();
  return shots.map((sh) => {
    // Set on this panel, by you or by the app from the words (D36); everything else is worked out again.
    const mine = Object.fromEntries(Object.entries(sh.spec.blocking ?? {}).filter(([, b]) => b.by !== "carried"));
    const out: Record<string, PanelBlock> = { ...mine };
    for (const [id, st] of state) {
      if (mine[id]) continue;
      if (sh.spec.at?.[id]) { state.delete(id); continue; } // the words move them: those win
      out[id] = { at: st.at, ...(st.facingDeg !== undefined ? { facingDeg: st.facingDeg } : {}), ...(st.gone ? { gone: true } : {}), ...(st.with ? { with: st.with } : {}), by: "carried" };
    }
    for (const [id, b] of Object.entries(mine)) {
      if (b.only) continue;
      const end = b.to ?? b.at;
      // A way to face carries on if it was set; after a walk they face the others again as usual.
      const facing = b.to ? undefined : b.facingDeg;
      state.set(id, { at: end, ...(facing !== undefined ? { facingDeg: Math.round(facing) } : {}), ...(b.gone ? { gone: true } : {}), ...(b.with ? { with: b.with } : {}) });
    }
    const spec = { ...sh.spec };
    if (Object.keys(out).length) spec.blocking = out; else delete spec.blocking;
    return spec;
  });
}

/** A panel's own placements with unsaved edits laid over them (null clears one). */
export function withEdits(spec: ShotSpec, edits?: Record<string, BlockEntry | null>): ShotSpec {
  if (!edits || !Object.keys(edits).length) return spec;
  const blocking: Record<string, PanelBlock> = { ...(spec.blocking ?? {}) };
  for (const [id, e] of Object.entries(edits)) {
    if (!e) delete blocking[id];
    else blocking[id] = { ...e, by: "you" };
  }
  return { ...spec, blocking };
}

/** Where someone's placement on a panel comes from, in words for the panel stepper. */
export function blockSource(specs: ShotSpec[], k: number, id: string): { kind: "here" | "app" | "carried" | "mark" | "plan"; from?: number; fromApp?: boolean } {
  const b = specs[k]?.blocking?.[id];
  if (b?.by === "you") return { kind: "here" };
  if (b?.by === "app") return { kind: "app" };
  if (b?.by === "carried") {
    for (let j = k - 1; j >= 0; j--) { const e = specs[j].blocking?.[id]; if (e && e.by !== "carried") return { kind: "carried", from: j, fromApp: e.by === "app" }; }
    return { kind: "carried" };
  }
  if (specs[k]?.at?.[id]) return { kind: "mark" };
  return { kind: "plan" };
}
