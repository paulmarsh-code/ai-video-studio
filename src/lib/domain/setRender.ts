// The fixed set (D97): each venue as a simple 3D set, like a video game level, seen from where a
// camera really stands. Paul's redesign (14 November): the floor plan is settled first, then a
// 360° background is built around each camera position, and each shot takes its slice by its shot
// type: a wide slice for a wide shot, a narrow one for a close-up, a moving one for a pan. Panels
// from one position then share one background pixel for pixel, and the props in it are pictures
// standing at fixed spots, so GPT never draws them again.
//
// Pure: pictures come in already decoded (RGBA), the result goes out as RGBA. The camera model is
// the app's own (`pictureXY`), inverted, so a person's stand-in drawn by the layout picture lands
// on exactly the floor spot this renderer shows.

import type { GeometryPlanData, PlanCamera, PlanFurniture, Point } from "./types";
import { horizontalFov } from "./geometry";
import { cameraZ, floorZ } from "./levels";
import { propHeight, propKind } from "./story";

export interface Texture { data: Uint8Array | Buffer; width: number; height: number }

/** One wall of the room shell: the side it stands on and the picture covering it. */
export interface SetWall { side: "minX" | "maxX" | "minY" | "maxY"; texture?: Texture; name?: string }

/** A prop that is part of the set (D97): a picture standing at a fixed spot at its real size. */
export interface SetPiece {
  id: string;
  name: string;
  at: Point;
  widthM: number;
  heightM: number;
  texture?: Texture;
  /** Flat things (a backdrop, a sign, a screen) face this point; round ones turn to the camera. */
  facing?: Point;
}

export interface SetModel {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Ceiling height in metres; undefined outdoors (open sky above the walls). */
  ceilingM?: number;
  /** How high the wall pictures reach, in metres. */
  wallM: number;
  walls: SetWall[];
  pieces: SetPiece[];
  floor: [number, number, number];
  ceiling: [number, number, number];
  sky: [number, number, number];
  /** Optional pictures repeated across the floor and ceiling, each covering `tileM` metres. */
  floorTexture?: Texture;
  ceilingTexture?: Texture;
  tileM?: number;
}

const FLAT = /\b(?:backdrop|back\s?drop|banner|sign|signage|screen|board|poster|wall|panel|step[-\s]and[-\s]repeat|curtain|flag|display|logo)\b/i;
/** Someone's own thing, which goes where they go: "Elin's skis", "skateboard … used by Kai" (D98). */
const PERSONAL = /\b(?:held|used|carried|ridden|worn)\s+by\b/i;
const OWNED = /^[A-Z][\w-]*['’]s\b/;

/**
 * Props that stand on the floor and are worth fixing: not held, not someone's own thing, not small
 * things on a table. A prop with no height set gets the one its words give (D98: the first scene's
 * table had none, and so had no place in the set).
 */
export function isSetPiece(f: PlanFurniture): boolean {
  if (f.heldBy || f.onId) return false;
  const text = `${f.name} ${f.detail ?? ""}`;
  if (OWNED.test(f.name.trim()) || PERSONAL.test(text) || propKind(text, f.name) === "small") return false;
  return pieceHeight(f) >= 0.5;
}

export const pieceHeight = (f: PlanFurniture) => f.heightM ?? propHeight(`${f.name} ${f.detail ?? ""}`, f.name);

/** The point everything is measured from (D95): used as the facing point for flat set pieces. */
export function setModel(plan: GeometryPlanData, opts: { walls: SetWall[]; textures: Record<string, Texture | undefined>; wallM: number; ceilingM?: number; floor: [number, number, number]; ceiling: [number, number, number]; sky: [number, number, number]; anchor?: Point; floorTexture?: Texture; ceilingTexture?: Texture; tileM?: number }): SetModel {
  const b = plan.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };
  const mid = opts.anchor ?? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => {
    const flat = FLAT.test(f.name);
    return {
      id: f.id, name: f.name, at: f.position,
      widthM: Math.max(0.2, f.radiusM * 2), heightM: pieceHeight(f),
      texture: opts.textures[f.id],
      ...(flat ? { facing: mid } : {}),
    } satisfies SetPiece;
  });
  return { bounds: b, wallM: opts.wallM, ceilingM: opts.ceilingM, walls: opts.walls, pieces, floor: opts.floor, ceiling: opts.ceiling, sky: opts.sky, floorTexture: opts.floorTexture, ceilingTexture: opts.ceilingTexture, tileM: opts.tileM };
}

/** Which wall a venue view covers: the wall its look direction faces (0 = +x, 90 = +y). */
export function wallForDirection(deg: number): SetWall["side"] {
  const d = ((deg % 360) + 360) % 360;
  return d < 45 || d >= 315 ? "maxX" : d < 135 ? "maxY" : d < 225 ? "minX" : "minY";
}

function sample(t: Texture, u: number, v: number): [number, number, number, number] {
  // Bilinear, clamped.
  const x = Math.min(t.width - 1.001, Math.max(0, u * t.width - 0.5)), y = Math.min(t.height - 1.001, Math.max(0, v * t.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i00 = (y0 * t.width + x0) * 4, i10 = i00 + 4, i01 = i00 + t.width * 4, i11 = i01 + 4;
  const d = t.data;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) out[c] = (d[i00 + c] * (1 - fx) + d[i10 + c] * fx) * (1 - fy) + (d[i01 + c] * (1 - fx) + d[i11 + c] * fx) * fy;
  return out;
}

const mod1 = (x: number) => x - Math.floor(x);

interface Ray { o: { x: number; y: number; z: number }; d: { x: number; y: number; z: number } }

/** The colour seen along one ray, and how far away it is. */
function trace(set: SetModel, plan: GeometryPlanData, r: Ray): [number, number, number, number] {
  const b = set.bounds;
  let best = Infinity, col: [number, number, number] = set.sky;
  // Floor (z = 0; raised areas are not part of the set yet).
  if (r.d.z < -1e-6) {
    const t = -r.o.z / r.d.z;
    if (t > 0 && t < best) {
      best = t;
      const hx = r.o.x + r.d.x * t, hy = r.o.y + r.d.y * t;
      col = set.floor;
      if (set.floorTexture) { const tile = set.tileM ?? 4; const s0 = sample(set.floorTexture, mod1(hx / tile), mod1(hy / tile)); col = [s0[0], s0[1], s0[2]]; }
      // A soft shadow under each set piece.
      let shade = 1;
      for (const p of set.pieces) {
        const dd = Math.hypot(hx - p.at.x, hy - p.at.y) / Math.max(0.25, p.widthM * 0.6);
        if (dd < 1) shade = Math.min(shade, 0.62 + 0.38 * dd * dd);
      }
      // A little fall-off of light towards the walls, so the floor isn't one flat colour.
      const edge = Math.min(hx - b.minX, b.maxX - hx, hy - b.minY, b.maxY - hy);
      const lift = 0.88 + 0.12 * Math.min(1, Math.max(0, edge) / 4);
      col = [col[0] * shade * lift, col[1] * shade * lift, col[2] * shade * lift];
    }
  }
  // Ceiling.
  if (set.ceilingM !== undefined && r.d.z > 1e-6) {
    const t = (set.ceilingM - r.o.z) / r.d.z;
    if (t > 0 && t < best) {
      best = t;
      col = set.ceiling;
      if (set.ceilingTexture) { const tile = (set.tileM ?? 4) * 1.5; const s0 = sample(set.ceilingTexture, mod1((r.o.x + r.d.x * t) / tile), mod1((r.o.y + r.d.y * t) / tile)); col = [s0[0], s0[1], s0[2]]; }
    }
  }
  // Walls.
  for (const w of set.walls) {
    const vertical = w.side === "minX" || w.side === "maxX";
    const c = w.side === "minX" ? b.minX : w.side === "maxX" ? b.maxX : w.side === "minY" ? b.minY : b.maxY;
    const dd = vertical ? r.d.x : r.d.y;
    if (Math.abs(dd) < 1e-9) continue;
    const t = (c - (vertical ? r.o.x : r.o.y)) / dd;
    if (!(t > 0 && t < best)) continue;
    const hx = r.o.x + r.d.x * t, hy = r.o.y + r.d.y * t, hz = r.o.z + r.d.z * t;
    if (hz < 0 || (set.ceilingM !== undefined && hz > set.ceilingM)) continue;
    // Along the wall, left to right as seen from inside the room.
    const along = w.side === "maxX" ? (hy - b.minY) / (b.maxY - b.minY) : w.side === "minX" ? (b.maxY - hy) / (b.maxY - b.minY)
      : w.side === "maxY" ? (b.maxX - hx) / (b.maxX - b.minX) : (hx - b.minX) / (b.maxX - b.minX);
    if (along < -0.001 || along > 1.001) continue;
    best = t;
    if (w.texture && hz <= set.wallM) {
      const s = sample(w.texture, along, 1 - hz / set.wallM);
      col = [s[0], s[1], s[2]];
    } else col = set.ceilingM !== undefined ? set.ceiling : set.sky;
  }
  // Set pieces, nearest wins; transparent parts of their pictures show what is behind.
  const hits: { t: number; c: [number, number, number, number] }[] = [];
  for (const p of set.pieces) {
    const base = floorZ(plan, p.at);
    let nx: number, ny: number;
    if (p.facing) { nx = p.facing.x - p.at.x; ny = p.facing.y - p.at.y; } else { nx = r.o.x - p.at.x; ny = r.o.y - p.at.y; }
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const den = r.d.x * nx + r.d.y * ny;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.at.x - r.o.x) * nx + (p.at.y - r.o.y) * ny) / den;
    if (!(t > 0 && t < best)) continue;
    const hx = r.o.x + r.d.x * t, hy = r.o.y + r.d.y * t, hz = r.o.z + r.d.z * t - base;
    // Seen from in front, the picture's left is the plane's left; from behind, mirrored.
    const sx = -ny, sy = nx;
    const s = (hx - p.at.x) * sx + (hy - p.at.y) * sy;
    const front = den < 0;
    const u = 0.5 + (front ? s : -s) / p.widthM, v = 1 - hz / p.heightM;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const c = p.texture ? sample(p.texture, u, v) : [150, 150, 150, 255] as [number, number, number, number];
    if (c[3] < 8) continue;
    hits.push({ t, c });
  }
  hits.sort((a, b2) => b2.t - a.t);
  for (const h of hits) {
    const a = h.c[3] / 255;
    col = [col[0] * (1 - a) + h.c[0] * a, col[1] * (1 - a) + h.c[1] * a, col[2] * (1 - a) + h.c[2] * a];
  }
  return [col[0], col[1], col[2], 255];
}

/**
 * What a camera sees of the set: a picture `width` × `height`, made with the app's camera model
 * so it lines up with the layout picture. `ss` samples each pixel ss × ss times for smooth edges.
 */
export function renderView(set: SetModel, plan: GeometryPlanData, cam: PlanCamera, width: number, height: number, ss = 2): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const fx = cam.lookAt.x - cam.position.x, fy = cam.lookAt.y - cam.position.y;
  const fl = Math.hypot(fx, fy) || 1;
  const fw = { x: fx / fl, y: fy / fl }, rt = { x: fw.y, y: -fw.x };
  const portrait = plan.aspect === "9:16";
  const tanH = Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
  const focalOverW = 1 / (2 * tanH), focalOverH = (portrait ? 2 / 3 : 3 / 2) / (2 * tanH);
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const o = { x: cam.position.x, y: cam.position.y, z: cameraZ(plan, cam) };
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    let r = 0, g = 0, bl = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (px + (sx + 0.5) / ss) / width, v = (py + (sy + 0.5) / ss) / height;
      // pictureXY inverted: x = 0.5 + (lateral / depth) · focalOverW; y = 0.5 − tan(elev − tilt) · focalOverH.
      const lat = (u - 0.5) / focalOverW;
      const elev = Math.atan((0.5 - v) / focalOverH) + tilt;
      const d = { x: fw.x + rt.x * lat, y: fw.y + rt.y * lat, z: Math.tan(elev) };
      const c = trace(set, plan, { o, d });
      r += c[0]; g += c[1]; bl += c[2];
    }
    const k = (py * width + px) * 4, n = ss * ss;
    out[k] = r / n; out[k + 1] = g / n; out[k + 2] = bl / n; out[k + 3] = 255;
  }
  return out;
}

/**
 * The 360° around one camera position (D97): every direction from that spot, `width` wide (all
 * 360°) and `height` tall, from `upDeg` above level to `upDeg` below. Column 0 looks along +x and
 * the picture turns clockwise from left to right, as a camera panning right does.
 */
export function render360(set: SetModel, plan: GeometryPlanData, at: Point, heightM: number, width: number, height: number, upDeg = 55): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const o = { x: at.x, y: at.y, z: floorZ(plan, at) + heightM };
  const span = Math.tan((upDeg * Math.PI) / 180);
  for (let py = 0; py < height; py++) {
    const tz = span * (1 - (2 * (py + 0.5)) / height);
    for (let px = 0; px < width; px++) {
      // Left to right turns clockwise, as panning right does in a camera's own picture.
      const a = ((px + 0.5) / width) * 2 * Math.PI;
      const c = trace(set, plan, { o, d: { x: Math.cos(a), y: -Math.sin(a), z: tz } });
      const k = (py * width + px) * 4;
      out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2]; out[k + 3] = 255;
    }
  }
  return out;
}

/** Where a camera's shot falls across its position's 360° picture: left and right edges, 0 to 1. */
export function sliceIn360(plan: GeometryPlanData, cam: PlanCamera): { left: number; right: number } {
  const look = Math.atan2(cam.lookAt.y - cam.position.y, cam.lookAt.x - cam.position.x);
  const half = (horizontalFov(plan, cam) * Math.PI) / 360;
  // Column px looks along angle −(px / width) · 2π, so a direction at angle φ is at px = −φ / 2π.
  const at = (ang: number) => ((((-ang / (2 * Math.PI)) % 1) + 1) % 1);
  return { left: at(look + half), right: at(look - half) };
}
