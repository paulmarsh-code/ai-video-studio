// D166: the app places everyone from the user's words about where they are.
// Paul: "App creates floor plan positions to approve or adjust… explain what's wrong". The words
// reader (D157) only understands set phrases, so the scene's starting plan is placed by the text
// model from the words, the room, its walls and props, then checked and clamped here.

import type { GeometryPlanData, Point } from "./types";

export interface PlaceInput {
  plan: GeometryPlanData;
  people: { id: string; name: string }[];
  words: string;
  story?: string;
}

/** Which wall a view names, from the direction that looks at it (0 = +x, 90 = +y). */
export function wallOf(directionDeg: number, b: NonNullable<GeometryPlanData["bounds"]>): string {
  const d = ((Math.round(directionDeg) % 360) + 360) % 360;
  if (d >= 45 && d < 135) return `the wall along y = ${b.maxY}`;
  if (d >= 135 && d < 225) return `the wall along x = ${b.minX}`;
  if (d >= 225 && d < 315) return `the wall along y = ${b.minY}`;
  return `the wall along x = ${b.maxX}`;
}

const boundsOf = (p: GeometryPlanData) => p.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };

export function placePrompt(i: PlaceInput): string {
  const b = boundsOf(i.plan);
  const pos = (p: Point) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
  const L = [
    "You place people and props on a top-down floor plan of a room for a film scene, from the director's words.",
    `The room runs from x = ${b.minX} to x = ${b.maxX} and from y = ${b.minY} to y = ${b.maxY}, in metres.`,
    "Walls and what is on them:",
    ...i.plan.views.map((v) => `- ${v.name}: ${wallOf(v.directionDeg, b)}`),
    ...(i.plan.levels?.length ? ["Raised or lowered areas (nobody stands there unless the words say so):", ...i.plan.levels.map((l) => `- ${l.name}: x ${l.x} to ${+(l.x + l.w).toFixed(2)}, y ${l.y} to ${+(l.y + l.d).toFixed(2)}, height ${l.heightM} m`)] : []),
    "Props now (id, name, centre, size):",
    ...(i.plan.furniture ?? []).map((f) => `- ${f.id}: ${f.name} at ${pos(f.position)}, about ${(f.radiusM * 2).toFixed(1)} m across${f.detail ? `; ${f.detail}` : ""}`),
    "People now (id, name, where):",
    ...i.people.map((p) => { const a = i.plan.actors.find((x) => x.characterId === p.id); return `- ${p.id}: ${p.name}${a ? ` at ${pos(a.position)}` : ""}`; }),
    ...(i.story?.trim() ? ["The scene's story, for context:", i.story.trim()] : []),
    "Where the director wants everyone at the start of the scene:",
    i.words.trim(),
    "Rules:",
    "- A fixed fitting named after a wall (a bar counter by the bar wall, a screen by the screen wall) goes against or close to that wall, along it.",
    "- Someone leaning on, at or behind something is within about 0.6 m of its edge, not on top of it.",
    "- Someone who must hear another without being seen is 2 to 4 m away, behind them or out of their line of sight, with room for other guests between them.",
    "- People keep at least 0.6 m apart unless the words put them together. Everyone stays inside the room and off the props.",
    "- Move only what the words need; keep everything else where it is.",
    "- facing is the point the person looks towards (another person's position, a prop, a wall).",
    'Reply with JSON only: {"people":[{"id":"…","x":0,"y":0,"facing":{"x":0,"y":0}}],"props":[{"id":"…","x":0,"y":0}],"summary":"one short sentence of what you placed"}. Include every person; include a prop only if you moved it.',
  ];
  return L.join("\n");
}

export interface Placement { people: Record<string, { at: Point; facingDeg?: number }>; props: Record<string, Point>; summary: string }

/** Read the model's reply, keeping only known ids and positions inside the room. */
export function parsePlacement(text: string, i: PlaceInput): Placement {
  const b = boundsOf(i.plan);
  let j: { people?: unknown; props?: unknown; summary?: unknown } = {};
  try { j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { j = {}; }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const clamp = (p: Point): Point => ({ x: +Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, p.x)).toFixed(2), y: +Math.min(b.maxY - 0.3, Math.max(b.minY + 0.3, p.y)).toFixed(2) });
  const people: Placement["people"] = {};
  for (const p of Array.isArray(j.people) ? j.people : []) {
    const o = p as { id?: unknown; x?: unknown; y?: unknown; facing?: { x?: unknown; y?: unknown } };
    const x = num(o.x), y = num(o.y);
    if (typeof o.id !== "string" || !i.people.some((c) => c.id === o.id) || x === undefined || y === undefined) continue;
    const at = clamp({ x, y });
    const fx = num(o.facing?.x), fy = num(o.facing?.y);
    const facingDeg = fx !== undefined && fy !== undefined && (fx !== at.x || fy !== at.y) ? Math.round((Math.atan2(fy - at.y, fx - at.x) * 180) / Math.PI) : undefined;
    people[o.id] = { at, ...(facingDeg !== undefined ? { facingDeg } : {}) };
  }
  const props: Placement["props"] = {};
  for (const p of Array.isArray(j.props) ? j.props : []) {
    const o = p as { id?: unknown; x?: unknown; y?: unknown };
    const x = num(o.x), y = num(o.y);
    if (typeof o.id !== "string" || !(i.plan.furniture ?? []).some((f) => f.id === o.id) || x === undefined || y === undefined) continue;
    props[o.id] = clamp({ x, y });
  }
  return { people, props, summary: typeof j.summary === "string" ? j.summary : "" };
}

/** The scene plan with everyone where they were placed: their own starting place, no arrival marks. */
export function applyPlacement(plan: GeometryPlanData, p: Placement): GeometryPlanData {
  return {
    ...plan,
    actors: plan.actors.map((a) => {
      const n = p.people[a.characterId];
      if (!n) return a;
      const { marks: _marks, to: _to, ...rest } = a;
      return { ...rest, position: n.at, ...(n.facingDeg !== undefined ? { facingDeg: n.facingDeg } : {}) };
    }),
    furniture: (plan.furniture ?? []).map((f) => (p.props[f.id] ? { ...f, position: p.props[f.id] } : f)),
  };
}
