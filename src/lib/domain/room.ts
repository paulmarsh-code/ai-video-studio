// Room size per venue (D29). Every floor plan used to be a 9 × 10 m room, inherited from the
// first demo. Now each venue has its own size: set on the venue page, or guessed from its name
// and description (a lift is tiny, a bedroom small, a bar medium, a hall large, outdoors open).
// The group stands in the same place relative to the room whatever its size, so a small room
// brings the walls (and the 360° background) close, and a large one pushes them back.

import type { GeometryPlanData, Point } from "./types";

export interface RoomSize { widthM: number; depthM: number }

export const DEFAULT_ROOM: RoomSize = { widthM: 9, depthM: 10 };

const KINDS: { re: RegExp; size: RoomSize; label: string }[] = [
  { re: /\b(lift|elevator|cockpit|booth|cubicle|phone\s?box|toilet|loo|wc|cupboard|closet|car\s+interior|inside\s+the\s+car|back\s+seat|taxi|cab)\b/i, size: { widthM: 2.5, depthM: 3 }, label: "a very small space" },
  { re: /\b(bedroom|bathroom|office|study|kitchen|cell|interview\s+room|meeting\s+room|small\s+room|flat|apartment|bedsit|van|caravan|dressing\s+room|corridor|hallway|consulting\s+room|surgery|changing\s+room|back\s+office)\b/i, size: { widthM: 4.5, depthM: 5.5 }, label: "a small room" },
  { re: /\b(living\s+room|lounge|sitting\s+room|cafe|coffee\s+shop|shop|boutique|classroom|studio|salon|pub|diner|waiting\s+room|ward|library|boardroom)\b/i, size: { widthM: 7, depthM: 8 }, label: "a medium room" },
  { re: /\b(bar|restaurant|club|nightclub|gallery|lobby|reception|bistro|lounge\s+bar|cocktail\s+bar|hospitality\s+suite)\b/i, size: { widthM: 10, depthM: 11 }, label: "a large room" },
  { re: /\b(hall|ballroom|warehouse|church|cathedral|gym|gymnasium|theatre|theater|auditorium|function\s+room|event\s+space|events?\s+venue|showroom|concourse|atrium|launch|conference|banqueting|exhibition|hangar|factory|terminal|station)\b/i, size: { widthM: 18, depthM: 22 }, label: "a hall" },
  { re: /\b(deck|yacht|boat|barge|ferry|raft|clearing|campsite|patio|terrace|yard|balcony|porch|jetty|bandstand)\b/i, size: { widthM: 8, depthM: 12 }, label: "a small open space" },
  { re: /\b(outdoors?|outside|exterior|street|road|park|beach|garden|field|meadow|rooftop|roof\s+terrace|square|car\s+park|parking|cliff|stadium|pitch|forest|woods?|mountain|hill|desert|harbour|harbor|dock|pier|riverside|lake|countryside|courtyard|playground|market)\b/i, size: { widthM: 30, depthM: 30 }, label: "open ground outdoors" },
];

/** A room size guessed from the venue's words and setting. */
export function guessRoom(text0: string, setting?: string): RoomSize & { label: string } {
  const text = text0.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // café → cafe
  // The most specific match wins: a "hotel bar" is a bar, a "car park" outdoors.
  // Outdoors, only the outdoor kinds are read (D81): "flat green farmland" made an airfield a
  // small room, as a flat.
  const open = KINDS.slice(-2);
  for (const k of setting === "exterior" ? open : KINDS) if (k.re.test(text)) return { ...k.size, label: k.label };
  if (setting === "exterior") return { widthM: 30, depthM: 30, label: "open ground outdoors" };
  return { ...DEFAULT_ROOM, label: "a medium-large room" };
}

/** The room a venue uses: what the user set, else the guess. */
export function roomFor(venue: { name?: string; description?: string; setting?: string; room?: unknown } | undefined): RoomSize & { label: string; guessed: boolean } {
  const r = venue?.room as Partial<RoomSize> | null | undefined;
  if (r && typeof r.widthM === "number" && typeof r.depthM === "number" && r.widthM > 0 && r.depthM > 0) return { widthM: r.widthM, depthM: r.depthM, label: "set by you", guessed: false };
  // The venue's name says what kind of place it is ("Ember Room cocktail bar"); its description
  // may mention smaller things inside it (a hall with a bar), so it is only read if the name says nothing.
  const byName = guessRoom(venue?.name ?? "", undefined);
  const named = byName.label !== "a medium-large room";
  return { ...(named ? byName : guessRoom(`${venue?.name ?? ""} ${venue?.description ?? ""}`, venue?.setting)), guessed: true };
}

export function boundsFor(r: RoomSize): NonNullable<GeometryPlanData["bounds"]> {
  return { minX: +(-r.widthM / 2).toFixed(2), maxX: +(r.widthM / 2).toFixed(2), minY: 0, maxY: +r.depthM.toFixed(2) };
}

/** Where the group stands in a room this size: the same place, relative to the room, as always. */
export function groupCentre(r: RoomSize): Point {
  return { x: +((0.25 * r.widthM) / 9).toFixed(2), y: +(0.485 * r.depthM).toFixed(2) };
}

export function roomOf(plan: Pick<GeometryPlanData, "bounds">): RoomSize {
  const b = plan.bounds;
  return b ? { widthM: b.maxX - b.minX, depthM: b.maxY - b.minY } : DEFAULT_ROOM;
}

/**
 * Put a plan into a room of a new size, keeping everything in the same place relative to the
 * group (and so to each other): people, marks, props, cameras and raised areas all move by the
 * same amount. Anything that would end up outside the new walls is brought just inside.
 */
export function applyRoom(plan: GeometryPlanData, r: RoomSize): GeometryPlanData {
  const from = groupCentre(roomOf(plan)), to = groupCentre(r);
  const dx = to.x - from.x, dy = to.y - from.y;
  const b = boundsFor(r);
  const clamp = (p: Point, m = 0.3): Point => ({ x: +Math.min(b.maxX - m, Math.max(b.minX + m, p.x + dx)).toFixed(2), y: +Math.min(b.maxY - m, Math.max(b.minY + m, p.y + dy)).toFixed(2) });
  return {
    ...plan,
    bounds: b,
    actors: plan.actors.map((a) => ({ ...a, position: clamp(a.position), marks: a.marks?.map((m) => ({ ...m, position: clamp(m.position) })) })),
    furniture: plan.furniture?.map((f) => ({ ...f, position: clamp(f.position) })),
    cameras: plan.cameras.map((c) => ({ ...c, position: clamp(c.position, 0.05), lookAt: { x: +(c.lookAt.x + dx).toFixed(2), y: +(c.lookAt.y + dy).toFixed(2) } })),
    levels: plan.levels?.map((l) => {
      const x0 = Math.max(b.minX, l.x + dx), y0 = Math.max(b.minY, l.y + dy);
      const x1 = Math.min(b.maxX, l.x + dx + l.w), y1 = Math.min(b.maxY, l.y + dy + l.d);
      return { ...l, x: +x0.toFixed(2), y: +y0.toFixed(2), w: +Math.max(0.5, x1 - x0).toFixed(2), d: +Math.max(0.5, y1 - y0).toFixed(2) };
    }),
  };
}
