// Raised and lowered areas (D29): stages, balconies, stairs, pits and the drop beyond a cliff or
// roof edge. The floor plan stays a plan from above, but every point now has a floor height,
// so people, props and cameras stand at the right height, cameras aim in 3D, and the pictures
// are told who is above or below whom. Made from the scene's words when it makes the plan, and
// editable on the floor plan. Works for any scene.

import type { AreaKind, GeometryPlanData, PlanCamera, PlanLevel, PlanView, Point } from "./types";

/** Whether a point is inside an area: its box, or the ellipse inside the box when round (D80). */
export function insideLevel(l: PlanLevel, p: Point): boolean {
  if (p.x < l.x || p.x > l.x + l.w || p.y < l.y || p.y > l.y + l.d) return false;
  if (!l.round) return true;
  const cx = l.x + l.w / 2, cy = l.y + l.d / 2;
  return ((p.x - cx) / (l.w / 2)) ** 2 + ((p.y - cy) / (l.d / 2)) ** 2 <= 1;
}

/** The area a point stands in, if any: the last one listed wins where they overlap. */
export function levelAt(plan: Pick<GeometryPlanData, "levels">, p: Point): PlanLevel | undefined {
  const ls = plan.levels ?? [];
  for (let k = ls.length - 1; k >= 0; k--) {
    const l = ls[k];
    if (insideLevel(l, p)) return l;
  }
  return undefined;
}

/** How far across a slope a point is (D80), from its top (0) to its foot (1). */
function downSlope(l: PlanLevel, p: Point): number {
  const u = { x: Math.cos(((l.fallDeg ?? 90) * Math.PI) / 180), y: Math.sin(((l.fallDeg ?? 90) * Math.PI) / 180) };
  const c = { x: l.x + l.w / 2, y: l.y + l.d / 2 };
  const ext = Math.abs(u.x) * (l.w / 2) + Math.abs(u.y) * (l.d / 2) || 1;
  return Math.max(0, Math.min(1, 0.5 + ((p.x - c.x) * u.x + (p.y - c.y) * u.y) / (2 * ext)));
}

/** Height of the floor under a point, in metres (0 is the room's floor). A slope falls across itself (D80). */
export function floorZ(plan: Pick<GeometryPlanData, "levels">, p: Point): number {
  const l = levelAt(plan, p);
  if (!l) return 0;
  if (l.dropM) return l.heightM - l.dropM * downSlope(l, p);
  return l.heightM;
}

/** "the skate bowl": an area's name in a sentence. */
export function areaName(l: Pick<PlanLevel, "name">): string {
  return /^(the|a|an)\s/i.test(l.name) ? l.name : `the ${l.name}`;
}

/** Whether people stand in an area rather than on it (D80): below the floor, or in water. */
export function isIn(l: PlanLevel): boolean {
  return l.kind === "water" || l.kind === "lowered" || l.heightM < 0;
}

const STOP_WORDS = new Set(["the", "a", "an", "and", "of", "with", "in", "on", "at", "to", "big", "small", "large", "little", "main", "old", "new"]);
const wordsOf = (t: string) => t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w && !STOP_WORDS.has(w)).map((w) => w.replace(/s$/, ""));
const metresIn = (t: string, re: RegExp): number | undefined => {
  const m = t.match(re);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /cm/i.test(m[2] ?? "") ? n / 100 : n;
};

/**
 * An area from the scene setting (D80), at its real size, beside the group: towards the venue
 * view that names it (a "deep bowl and street section" view for a skate bowl), else behind the
 * group, away from where cameras usually stand. Centred on the group when the spot puts them in
 * or on it. Sizes come from its words; anything not said has a size for its kind.
 */
export function areaFromWords(a: { name: string; kind: AreaKind; detail: string }, _b: Bounds, C: Point, views: Pick<PlanView, "name" | "directionDeg">[], spot = ""): PlanLevel | undefined {
  if (a.kind === "barrier") return undefined; // fences and glass: a later stage
  const t = `${a.name} ${a.detail}`.toLowerCase();
  const U = String.raw`\s?(m|metres?|meters?|cm)\b`;
  const by = t.match(new RegExp(String.raw`(\d+(?:\.\d+)?)(?:${U})?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)${U}`, "i"));
  const across = metresIn(t, new RegExp(String.raw`(\d+(?:\.\d+)?)${U}\s*(?:across|wide|in diameter|diameter)`, "i")) ?? metresIn(t, new RegExp(String.raw`diameter[^\d]{0,12}(\d+(?:\.\d+)?)${U}`, "i"));
  const long = metresIn(t, new RegExp(String.raw`(\d+(?:\.\d+)?)${U}\s*long`, "i"));
  const deep = metresIn(t, new RegExp(String.raw`(\d+(?:\.\d+)?)${U}\s*deep`, "i"));
  const high = metresIn(t, new RegExp(String.raw`(\d+(?:\.\d+)?)${U}\s*(?:high|tall)`, "i")) ?? metresIn(t, new RegExp(String.raw`(?:rising|rises|rise)\s*(?:about\s*)?(\d+(?:\.\d+)?)${U}`, "i"));
  const falls = metresIn(t, new RegExp(String.raw`(?:falls?|drops?|descends?)\s*(?:about\s*)?(\d+(?:\.\d+)?)${U}`, "i")) ?? metresIn(t, new RegExp(String.raw`(\d+(?:\.\d+)?)${U}\s*(?:drop|fall|descent)`, "i"));
  const round = /\b(round|circular|bowl|ring of|oval)\b/.test(t);
  const sizes: Record<string, [number, number]> = { lowered: [4, 4], water: [8, 4], raised: [4, 3], slope: [10, 20], steps: [8, 4], marked: [20, 10] };
  let [w, d] = sizes[a.kind] ?? [4, 4];
  if (by) { w = Number(by[1]) / (/cm/i.test(by[4] ?? "") ? 100 : 1); d = Number(by[3]) / (/cm/i.test(by[4] ?? "") ? 100 : 1); }
  else if (across) { w = across; d = round ? across : long ?? across; }
  else if (long) d = long;
  // Which way from the group: the view that names it, else behind them.
  const own = wordsOf(a.name);
  const view = views.map((v) => ({ v, n: wordsOf(v.name).filter((x) => own.includes(x)).length })).filter((x) => x.n).sort((x, y) => y.n - x.n)[0]?.v;
  const deg = view?.directionDeg ?? 90;
  const u = { x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) };
  // A slope or steps run away from the group: its length along that way.
  if ((a.kind === "slope" || a.kind === "steps") && Math.abs(u.x) > Math.abs(u.y)) [w, d] = [d, w];
  const head = own[own.length - 1] ?? "";
  const inIt = !!head && new RegExp(String.raw`\b(?:in|on|inside|into|onto|across)\s+(?:the\s+)?(?:[\w-]+\s+){0,2}${head}s?\b`, "i").test(spot);
  const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (d / 2);
  const c = inIt ? C : { x: C.x + u.x * (0.6 + reach), y: C.y + u.y * (0.6 + reach) };
  // Not squeezed into the room: the plan's bounds grow to hold it (`withAreas`), as a ski run
  // outgrows any venue's room size.
  const x = c.x - w / 2, y = c.y - d / 2;
  const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = { id: `area-${slug}`, name: a.name, kind: a.kind, x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2), ...(round ? { round: true } : {}), ...(a.detail ? { detail: a.detail } : {}) };
  if (a.kind === "lowered") return { ...base, heightM: -(deep ?? 1.5), edge: "plain" };
  if (a.kind === "water") { const waterM = deep ?? 1.4; return { ...base, heightM: +(-(waterM + 0.15)).toFixed(2), waterM, edge: "plain" }; }
  if (a.kind === "raised") return { ...base, heightM: high ?? 1, edge: "plain" };
  if (a.kind === "slope") return { ...base, heightM: 0, dropM: falls ?? Math.max(1, +(d * 0.2).toFixed(1)), fallDeg: deg, edge: "plain" };
  if (a.kind === "steps") return { ...base, heightM: 0, dropM: -(high ?? 2), fallDeg: deg, edge: "steps" };
  return { ...base, heightM: 0, edge: "plain" };
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
  const heightOf = new Map<string, number>();
  for (const id of ids) {
    const a = plan.actors.find((x) => x.characterId === id);
    if (a) heightOf.set(name(id), floorZ(plan, a.position));
  }
  for (const [key, names] of groups) {
    const l = plan.levels.find((x) => x.id === key);
    // On a slope the floor's height is where they stand (D80).
    const z = l?.dropM ? names.reduce((t, n) => t + (heightOf.get(n) ?? 0), 0) / names.length : l?.heightM ?? 0;
    const where = l ? `${isIn(l) ? "in" : "on"} ${areaName(l)}` : "on the main floor";
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
    const said = `${areaName(l)}${l.detail ? ` (${l.detail})` : ""}`;
    if (l.kind === "water") out.push(`In view: ${said}, its water about ${metres(l.waterM ?? 0)} deep, the surface a little below the floor around it.`);
    else if (l.kind === "slope") out.push(`In view: ${said}, falling away about ${metres(l.dropM ?? 0)} across it.`);
    else if (l.kind === "steps") out.push(`In view: ${said}, rising about ${metres(l.dropM ?? 0)} in tiers.`);
    else if (l.kind === "marked") out.push(`In view: ${said}, at floor level.`);
    else if (l.edge === "drop" || l.heightM <= -5) out.push(`Beyond them: the edge, then ${l.name}, a sheer drop of about ${metres(l.heightM)}; the ground or water far below.`);
    else if (l.heightM < 0) out.push(`In view: ${l.kind ? said : l.name}, ${metres(l.heightM)} below the floor.`);
    else out.push(`In view: ${l.kind ? said : l.name}, raised ${metres(l.heightM)} above the floor${l.edge === "railing" ? ", with a railing along its edge" : l.edge === "steps" ? ", with steps up to it" : ""}.`);
  }
  return out;
}

/**
 * A plan with the scene's areas (D80): any area from the setting not yet in the plan is added
 * beside the group, and the plan's bounds grow to hold every area with a metre to spare.
 * Areas already there (moved on the floor plan, say) are left as they are.
 */
export function withAreas(plan: GeometryPlanData, areas: { name: string; kind: AreaKind; detail: string }[], spot = ""): GeometryPlanData {
  const have = new Set((plan.levels ?? []).map((l) => l.name.trim().toLowerCase()));
  const b = plan.bounds ?? { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 };
  const people = plan.actors.map((a) => a.position);
  const C = people.length ? { x: people.reduce((s, p) => s + p.x, 0) / people.length, y: people.reduce((s, p) => s + p.y, 0) / people.length } : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const added = areas.filter((a) => !have.has(a.name.trim().toLowerCase())).map((a) => areaFromWords(a, b, C, plan.views ?? [], spot)).filter((l): l is PlanLevel => !!l);
  if (!added.length) return plan;
  const levels = [...(plan.levels ?? []), ...added];
  // A prop of the same name was the area misread as a thing (a skate bowl taken for a bowl on a
  // ledge): the area replaces it.
  const named = new Set(added.map((l) => l.name.trim().toLowerCase()));
  const furniture = plan.furniture?.filter((f) => !named.has(f.name.trim().toLowerCase()));
  const grown = levels.filter((l) => l.kind).reduce((g, l) => ({ minX: Math.min(g.minX, l.x - 1), maxX: Math.max(g.maxX, l.x + l.w + 1), minY: Math.min(g.minY, l.y - 1), maxY: Math.max(g.maxY, l.y + l.d + 1) }), b);
  const r = (n: number) => +n.toFixed(2);
  return { ...plan, levels, ...(furniture ? { furniture } : {}), bounds: { minX: r(grown.minX), maxX: r(grown.maxX), minY: r(grown.minY), maxY: r(grown.maxY) } };
}
