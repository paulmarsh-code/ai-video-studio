// Raised and lowered areas (D29): stages, balconies, stairs, pits and the drop beyond a cliff or
// roof edge. The floor plan stays a plan from above, but every point now has a floor height,
// so people, props and cameras stand at the right height, cameras aim in 3D, and the pictures
// are told who is above or below whom. Made from the scene's words when it makes the plan, and
// editable on the floor plan. Works for any scene.

import type { GeometryPlanData, PlanCamera, PlanLevel, Point } from "./types";

/** The area a point stands in, if any: the last one listed wins where they overlap. */
export function levelAt(plan: Pick<GeometryPlanData, "levels">, p: Point): PlanLevel | undefined {
  const ls = plan.levels ?? [];
  for (let k = ls.length - 1; k >= 0; k--) {
    const l = ls[k];
    if (p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.d) return l;
  }
  return undefined;
}

/** Height of the floor under a point, in metres (0 is the room's floor). */
export function floorZ(plan: Pick<GeometryPlanData, "levels">, p: Point): number {
  return levelAt(plan, p)?.heightM ?? 0;
}

/** The camera lens's height above the room's floor: its floor plus its own height. */
export function cameraZ(plan: Pick<GeometryPlanData, "levels">, cam: Pick<PlanCamera, "position" | "heightM">): number {
  return floorZ(plan, cam.position) + (cam.heightM ?? 1.6);
}

type Bounds = NonNullable<GeometryPlanData["bounds"]>;

const ON = String.raw`\b(?:on|onto|up\s+on|upon|at|along|across|from|standing\s+on|stood\s+on|out\s+on)\s+(?:the\s+|a\s+|an\s+)?`;
const STAGE = new RegExp(`${ON}(?:\\w+\\s+)?(?:stage|platform|podium|dais|stand|catwalk|runway|bandstand|rostrum)\\b`, "i");
const BALCONY = new RegExp(`${ON}(?:\\w+\\s+)?(?:balcony|mezzanine|gallery|landing|upper\\s+(?:floor|level|deck)|walkway|terrace\\s+above|minstrels['’]?\\s+gallery)\\b|\\blooking\\s+down\\s+(?:on|at|over)\\s+the\\s+(?:hall|crowd|room|street|dance\\s?floor|square|courtyard|guests)\\b`, "i");
const CLIFF = /\b(?:cliff\s?(?:top|edge)?|clifftop|edge\s+of\s+(?:a|the)\s+cliff|precipice|crag|gorge\s+edge|canyon\s+(?:edge|rim)|rim\s+of\s+the\s+(?:canyon|gorge))\b/i;
const ROOF = /\b(?:roof\s?top|on\s+the\s+roof|roof\s+edge|edge\s+of\s+the\s+roof|top\s+of\s+(?:the|a)\s+(?:building|tower|skyscraper|block)|ledge)\b/i;
const BRIDGE = /\b(?:on|across|from|over)\s+(?:the|a)\s+(?:\w+\s+)?bridge\b/i;
const STAIRS_TOP = /\b(?:top|head)\s+of\s+(?:the|a)\s+(?:stairs|staircase|steps|stairway)\b|\bon\s+the\s+(?:stairs|staircase|steps)\b|\bat\s+the\s+top\s+of\s+the\s+(?:stairs|steps)\b/i;
const STAIRS_BOTTOM = /\b(?:bottom|foot)\s+of\s+(?:the|a)\s+(?:stairs|staircase|steps|stairway)\b/i;
const PIT = /\b(?:by|near|beside|at|around|over)\s+(?:the|a)\s+(?:edge\s+of\s+(?:the|a)\s+)?(?:pit|hole|well|trench|grave|crater|mine\s?shaft|shaft|orchestra\s+pit|pool)\b/i;
const VENUE_BALCONY = /\b(?:balcony|balconies|mezzanine|gallery\s+level|upper\s+level|minstrels['’]?\s+gallery)\b/i;
const VENUE_STAGE = /\b(?:stage|platform|podium|dais)\b/i;

/**
 * Raised and lowered areas from the scene's words: where the group stands (`spot`) and the
 * venue's own description. Only clear wording makes one; otherwise the floor is flat.
 * `C` is where the group stands.
 */
export function levelsFromWords(spot: string, venueText: string, b: Bounds, C: Point): PlanLevel[] {
  const W = b.maxX - b.minX, D = b.maxY - b.minY;
  const rect = (id: string, name: string, heightM: number, cx: number, cy: number, w: number, d: number, edge: PlanLevel["edge"]): PlanLevel => {
    const x = Math.max(b.minX, cx - w / 2), y = Math.max(b.minY, cy - d / 2);
    return { id, name, heightM, x: +x.toFixed(2), y: +y.toFixed(2), w: +Math.min(w, b.maxX - x).toFixed(2), d: +Math.min(d, b.maxY - y).toFixed(2), edge };
  };
  // Behind the group (away from where cameras stand): from 1.8 m past them to the back wall.
  const beyond = (id: string, name: string, heightM: number, edge: PlanLevel["edge"]): PlanLevel => {
    const y = Math.min(b.maxY - 0.5, C.y + 1.8);
    return { id, name, heightM, x: b.minX, y: +y.toFixed(2), w: +W.toFixed(2), d: +(b.maxY - y).toFixed(2), edge };
  };
  const out: PlanLevel[] = [];
  if (CLIFF.test(spot)) out.push(beyond("drop", "the drop below the cliff edge", -30, "drop"));
  else if (ROOF.test(spot)) out.push(beyond("drop", "the street far below the roof edge", -20, "drop"));
  else if (BRIDGE.test(spot)) out.push(beyond("drop", "the water below the bridge", -8, "railing"));
  else if (BALCONY.test(spot)) out.push(rect("balcony", "the balcony", 4, C.x, C.y, Math.min(10, W * 0.7), Math.min(6, D * 0.45), "railing"));
  else if (STAGE.test(spot)) out.push(rect("stage", "the stage", 1, C.x, C.y, Math.min(8, W * 0.6), Math.min(5, D * 0.4), "plain"));
  else if (STAIRS_TOP.test(spot)) out.push(rect("stairs", "the top of the stairs", 3, C.x, C.y, Math.min(4, W * 0.4), 3, "steps"));
  else if (STAIRS_BOTTOM.test(spot)) out.push(beyond("stairs", "the stairs going up", 3, "steps"));
  else if (PIT.test(spot)) out.push(rect("pit", /pool/i.test(spot) ? "the pool" : "the pit", /pool/i.test(spot) ? -1.5 : -2.5, C.x, C.y + 1.6, 2, 2, "plain"));
  // The venue's own balcony or stage, where the group isn't standing on it: at the back.
  if (!out.length || out[0].heightM < 0) {
    if (VENUE_BALCONY.test(venueText) && !BALCONY.test(spot)) out.push({ id: "venue-balcony", name: "the balcony", heightM: 4, x: b.minX, y: +(b.maxY - Math.min(3, D * 0.2)).toFixed(2), w: +W.toFixed(2), d: +Math.min(3, D * 0.2).toFixed(2), edge: "railing" });
    else if (VENUE_STAGE.test(venueText) && !STAGE.test(spot)) out.push({ id: "venue-stage", name: "the stage", heightM: 1, x: +(C.x - Math.min(8, W * 0.6) / 2).toFixed(2), y: +(b.maxY - Math.min(4, D * 0.3)).toFixed(2), w: +Math.min(8, W * 0.6).toFixed(2), d: +Math.min(4, D * 0.3).toFixed(2), edge: "plain" });
  }
  return out;
}

const metres = (m: number) => `${Math.round(Math.abs(m) * 10) / 10} m`;

/**
 * Words for the prompts (D29): who stands above or below the camera and by how much, and any
 * raised or lowered area the camera sees.
 */
export function levelLines(plan: GeometryPlanData, cam: PlanCamera, ids: string[], name: (id: string) => string): string[] {
  if (!plan.levels?.length) return [];
  const out: string[] = [];
  const camFloor = levelAt(plan, cam.position);
  const zc = camFloor?.heightM ?? 0;
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const a = plan.actors.find((x) => x.characterId === id);
    if (!a) continue;
    const l = levelAt(plan, a.position);
    const key = l ? l.id : "floor";
    groups.set(key, [...(groups.get(key) ?? []), name(id)]);
  }
  const join = (xs: string[]) => (xs.length < 2 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  for (const [key, names] of groups) {
    const l = plan.levels.find((x) => x.id === key);
    const z = l?.heightM ?? 0;
    const where = l ? `on ${l.name}` : "on the main floor";
    const dz = z - zc;
    if (Math.abs(dz) < 0.3) { if (l && Math.abs(z) >= 0.3) out.push(`${join(names)} ${names.length > 1 ? "are" : "is"} ${where}, ${metres(z)} ${z > 0 ? "above" : "below"} the main floor; the camera is up there with them.`); continue; }
    out.push(`${join(names)} ${names.length > 1 ? "are" : "is"} ${where}, about ${metres(dz)} ${dz > 0 ? "above" : "below"} the camera, so we look ${dz > 0 ? "up" : "down"} at ${names.length > 1 ? "them" : names[0]}.`);
  }
  if (camFloor && Math.abs(zc) >= 0.3 && !out.some((x) => x.includes("up there with them"))) out.push(`The camera stands on ${camFloor.name}, ${metres(zc)} ${zc > 0 ? "above" : "below"} the main floor.`);
  // Areas the camera looks towards that nobody stands in: the drop, the balcony, the stage.
  const f = { x: cam.lookAt.x - cam.position.x, y: cam.lookAt.y - cam.position.y };
  const fl = Math.hypot(f.x, f.y) || 1;
  for (const l of plan.levels) {
    if (groups.has(l.id) || l === camFloor) continue;
    const c = { x: l.x + l.w / 2, y: l.y + l.d / 2 };
    // Nearest point of the area to the camera, and whether it is in front.
    const nx = Math.max(l.x, Math.min(cam.position.x, l.x + l.w)), ny = Math.max(l.y, Math.min(cam.position.y, l.y + l.d));
    const toC = { x: c.x - cam.position.x, y: c.y - cam.position.y }, toN = { x: nx - cam.position.x, y: ny - cam.position.y };
    const front = (v: Point) => (v.x * f.x + v.y * f.y) / fl > 0;
    if (!front(toC) && !front(toN)) continue;
    if (l.edge === "drop" || l.heightM <= -5) out.push(`Beyond them: the edge, then ${l.name}, a sheer drop of about ${metres(l.heightM)}; the ground or water far below.`);
    else if (l.heightM < 0) out.push(`In view: ${l.name}, ${metres(l.heightM)} below the floor.`);
    else out.push(`In view: ${l.name}, raised ${metres(l.heightM)} above the floor${l.edge === "railing" ? ", with a railing along its edge" : l.edge === "steps" ? ", with steps up to it" : ""}.`);
  }
  return out;
}
