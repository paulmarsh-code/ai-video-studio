// Layout sketch (D18f): the floor plan seen through the shot's camera, drawn as simple labelled
// figures. It goes to GPT with every panel picture so positions, sizes and the camera angle
// come from the geometry, not from GPT's reading of words like "frame-left".
// Pure: returns an SVG string; the server turns it into a PNG.

import { cameraZ, floorZ, levelAt } from "./levels";
import { facingOf, horizontalFov } from "./geometry";
import { itemNoun } from "./imagePrompts";
import { propKind } from "./story";
import type { GeometryPlanData, PlanCamera } from "./types";

export interface SketchPerson { id: string; name: string; heightM?: number; }

const COLOURS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#4d7c0f"];
const EYE_HEIGHT = 1.6; // camera at eye level
const BODY_WIDTH = 0.46;
const TABLE_HEIGHT = 1.1; // a standing cocktail table

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layoutSketchSvg(i: {
  plan: GeometryPlanData;
  camera: PlanCamera;
  people: SketchPerson[];
  /** Who this panel is about; drawn with a heavier outline. */
  subjectId?: string;
  size: "portrait" | "landscape";
  /** E.g. "bar": the venue view behind, named at the top. */
  backgroundView?: string;
  /** Other people in the scene (D19): drawn as grey figures in fixed places around the room. */
  crowd?: "none" | "few" | "busy";
  /**
   * Blocking frame (D34): drawn see-through, to lay over the real background for this camera.
   * Stand-ins are neutral and labelled with name and facing; no room, horizon or captions.
   */
  overlay?: boolean;
  /** Where someone is heading in this picture (D34): an arrow on the floor shows the way. */
  moves?: Record<string, { x: number; y: number }>;
  /** What each person holds on one side (D34), marked at that side of the picture. */
  held?: Record<string, { side: "left" | "right"; what: string; where: string }[]>;
  /** Flat props' own pictures (D57), by prop id, as data: addresses: drawn at their place in the blocking frame. */
  propPictures?: Record<string, string>;
}): string {
  const OV = !!i.overlay;
  const W = i.size === "portrait" ? 768 : 1152;
  const H = i.size === "portrait" ? 1152 : 768;
  const cam = i.camera;
  const fx = cam.lookAt.x - cam.position.x, fy = cam.lookAt.y - cam.position.y;
  const fl = Math.hypot(fx, fy) || 1;
  const f = { x: fx / fl, y: fy / fl };
  const r = { x: f.y, y: -f.x }; // right-hand side when looking along f (same as readCamera)
  // The preset's field of view spans the frame's width.
  const tanH = Math.tan((horizontalFov(i.plan, cam) * Math.PI) / 360);
  const focal = W / 2 / tanH;
  // The camera's own height and tilt (D25): a high camera tilted down, a low one tilted up.
  // The lens's height above the room's floor, standing on any raised area (D29).
  const camH = cameraZ(i.plan, cam);
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const toScreen = (p: { x: number; y: number }, z: number) => {
    const rel = { x: p.x - cam.position.x, y: p.y - cam.position.y };
    const d0 = rel.x * f.x + rel.y * f.y;
    const lateral = rel.x * r.x + rel.y * r.y;
    const v0 = z + floorZ(i.plan, p) - camH; // heights count from the floor under each point (D29)
    // Rotate (depth, height) by the tilt: looking down brings the floor up the frame.
    const depth = d0 * Math.cos(tilt) + v0 * Math.sin(tilt);
    const v = -d0 * Math.sin(tilt) + v0 * Math.cos(tilt);
    return { depth, x: W / 2 + (lateral / depth) * focal, y: H / 2 - (v / depth) * focal };
  };

  type Item = { depth: number; svg: string };
  const items: Item[] = [];
  const near = 0.25;

  // Raised and lowered areas (D29): the top drawn as a slab, with its sides down to the floor;
  // a drop or pit drawn as an edge with the far-below floor darker.
  for (const l of i.plan.levels ?? []) {
    // Over a real background (D34) the room's own balconies and drops are already in the
    // picture; only an area the cast stands on is outlined.
    if (OV && !i.plan.actors.some((x) => levelAt(i.plan, x.position) === l)) continue;
    const corners = [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.d }, { x: l.x, y: l.y + l.d }];
    // Shift each corner 1 cm inward, so it reads as standing on this level, not the floor around it.
    const inner = corners.map((c) => ({ x: c.x + (c.x === l.x ? 0.01 : -0.01), y: c.y + (c.y === l.y ? 0.01 : -0.01) }));
    const at = (p: { x: number; y: number }, z: number) => toScreen(p, z - floorZ(i.plan, p));
    const clip = (pts: { x: number; y: number }[], z: number) => {
      const out: { x: number; y: number }[] = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b2 = pts[(k + 1) % pts.length];
        const da = at(a, z).depth - near, db = at(b2, z).depth - near;
        if (da > 0) out.push(a);
        if ((da > 0) !== (db > 0)) { const t = da / (da - db); out.push({ x: a.x + (b2.x - a.x) * t, y: a.y + (b2.y - a.y) * t }); }
      }
      return out;
    };
    const poly = (pts: { x: number; y: number }[], z: number) => pts.map((p) => { const q = at(p, z); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ");
    const top = clip(inner, l.heightM);
    if (top.length < 3) continue;
    const far = Math.max(...top.map((p) => at(p, l.heightM).depth));
    const raised = l.heightM > 0;
    let svg = "";
    if (raised) {
      // Only the sides that face the camera (corners run anticlockwise), then the top if the
      // lens is above it; from below you see the front, not the top.
      for (let k = 0; k < top.length; k++) {
        const a = top[k], b2 = top[(k + 1) % top.length];
        const facing = (b2.y - a.y) * (cam.position.x - a.x) - (b2.x - a.x) * (cam.position.y - a.y) > 0;
        if (facing) svg += `<polygon points="${poly([a, b2], l.heightM)} ${poly([b2, a], 0)}" fill="#d6d3d1" stroke="#78716c" stroke-width="2"/>`;
      }
      if (camH > l.heightM) svg += `<polygon points="${poly(top, l.heightM)}" fill="#e7e5e4" fill-opacity="0.9" stroke="#57534e" stroke-width="3"/>`;
      if (l.edge === "railing") {
        for (let k = 0; k < top.length; k++) {
          const a = top[k], b2 = top[(k + 1) % top.length];
          svg += `<polygon points="${poly([a, b2], l.heightM + 1)} ${poly([b2, a], l.heightM)}" fill="none" stroke="#57534e" stroke-width="2" stroke-dasharray="3 5"/>`;
        }
      }
    } else {
      // A drop or pit: nothing to stand on at floor level (pale), the far floor below darker,
      // and the edge as a heavy dashed line.
      svg += `<polygon points="${poly(top, 0)}" fill="#e0f2fe"/>`;
      svg += `<polygon points="${poly(top, l.heightM)}" fill="#94a3b8" fill-opacity="0.6" stroke="#64748b" stroke-width="2"/>`;
      svg += `<polygon points="${poly(top, 0)}" fill="none" stroke="#334155" stroke-width="4" stroke-dasharray="14 8"/>`;
    }
    const cz = Math.max(0, l.heightM);
    const pts = top.map((p) => at(p, cz));
    const mid = { x: pts.reduce((t, q) => t + q.x, 0) / pts.length, y: Math.min(H - 60, pts.reduce((t, q) => t + q.y, 0) / pts.length), depth: Math.max(...pts.map((q) => q.depth)) };
    if (mid.depth > near) svg += `<text x="${mid.x.toFixed(1)}" y="${mid.y.toFixed(1)}" font-size="22" text-anchor="middle" fill="#44403c" font-family="sans-serif">${esc(l.name)} (${l.heightM > 0 ? "+" : ""}${Math.round(l.heightM * 10) / 10} m)</text>`;
    items.push({ depth: far + 50, svg: `<g>${svg}</g>` });
  }

  // Other people: the same grey figures in the same places in every camera view of the scene.
  if (!OV && (i.crowd === "few" || i.crowd === "busy")) {
    const n = i.crowd === "busy" ? 22 : 6;
    // Background people stay behind the cast: never between the camera and the characters.
    const castDepths = i.plan.actors.map((a) => toScreen(a.position, 1).depth).filter((d) => d > near);
    const behind = (castDepths.length ? Math.max(...castDepths) : 0) + 0.6;
    const occupied = [...i.plan.actors.map((a) => a.position), ...(i.plan.furniture ?? []).map((x) => x.position)];
    const C = occupied.length ? { x: occupied.reduce((s, p) => s + p.x, 0) / occupied.length, y: occupied.reduce((s, p) => s + p.y, 0) / occupied.length } : { x: 0, y: 5 };
    for (let k = 0; k < n; k++) {
      // When the cast is up on a stage or balcony, the crowd is down on the floor beyond its edge.
      const castLevel = i.plan.actors.map((x) => levelAt(i.plan, x.position)).find((l) => l && l.heightM !== 0);
      const ring = 2.6 + (k % 3) * 0.9 + (castLevel ? Math.max(castLevel.w, castLevel.d) / 2 : 0);
      const ang = (k * 137.5 * Math.PI) / 180; // golden angle: spread evenly, same every time
      const pos = { x: C.x + ring * Math.cos(ang), y: C.y + ring * Math.sin(ang) };
      if (occupied.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 1.1)) continue;
      // Nobody stands over a drop, and the stage or balcony the cast is on is theirs (D29).
      const lv = levelAt(i.plan, pos);
      if (lv && (lv.heightM < -0.5 || i.plan.actors.some((x) => levelAt(i.plan, x.position) === lv))) continue;
      if (Math.hypot(pos.x - cam.position.x, pos.y - cam.position.y) < 1.2) continue;
      const head = toScreen(pos, 1.6);
      if (head.depth < Math.max(1, behind)) continue;
      const feet = toScreen(pos, 0);
      const half = (0.2 / head.depth) * focal;
      items.push({ depth: head.depth, svg: `<g opacity="0.55"><rect x="${(head.x - half).toFixed(1)}" y="${(head.y + half * 0.5).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.max(0, feet.y - head.y - half * 0.5).toFixed(1)}" rx="${(half * 0.6).toFixed(1)}" fill="#9ca3af"/><circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${(half * 0.55).toFixed(1)}" fill="#9ca3af"/></g>` });
    }
  }

  for (const fu of i.plan.furniture ?? []) {
    if (fu.heldBy) continue; // in someone's hand (D36): it's tagged on them instead
    const text = `${fu.name} ${fu.detail ?? ""}`;
    const kind = propKind(text, fu.name);
    const h = fu.heightM ?? TABLE_HEIGHT;
    const c = toScreen(fu.position, h);
    if (c.depth < near) continue;
    const floor = toScreen(fu.position, 0);
    const label = `<text x="${c.x.toFixed(1)}" y="${(floor.y + 26).toFixed(1)}" font-size="22" text-anchor="middle" fill="#404040"${OV ? ' stroke="#fff" stroke-width="5" paint-order="stroke"' : ""} font-family="sans-serif">${esc(fu.name)}</text>`;
    if (kind === "table") {
      const rx = (fu.radiusM / c.depth) * focal;
      const ry = Math.max(4, rx * Math.min(0.5, Math.abs(EYE_HEIGHT - h) / c.depth));
      // A solid, draped stand-in from top to floor (D56), as plain to see as the people: a thin
      // outline and pole lost out to a real table standing in the venue picture.
      const fx = rx * 1.08;
      items.push({
        depth: c.depth,
        svg: `<g><path d="M ${(c.x - rx).toFixed(1)} ${c.y.toFixed(1)} L ${(c.x - fx).toFixed(1)} ${floor.y.toFixed(1)} Q ${c.x.toFixed(1)} ${(floor.y + ry).toFixed(1)} ${(c.x + fx).toFixed(1)} ${floor.y.toFixed(1)} L ${(c.x + rx).toFixed(1)} ${c.y.toFixed(1)} Z" fill="#ece8df" fill-opacity="${OV ? 0.92 : 1}" stroke="#525252" stroke-width="3"/>`
          + `<ellipse cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#f7f5f0" fill-opacity="${OV ? 0.95 : 1}" stroke="#525252" stroke-width="3"/>${label}</g>`,
      });
    } else if (kind === "flat" && OV && i.propPictures?.[fu.id]) {
      // A flat prop with a picture (D57): its own picture at its real place and size, so the sign
      // GPT draws is the one at the planned spot. A pale panel lost out to wherever GPT chose.
      const w = ((fu.radiusM * 2) / c.depth) * focal, h = Math.max(0, floor.y - c.y);
      items.push({
        depth: c.depth,
        svg: `<g><image href="${i.propPictures[fu.id]}" x="${(c.x - w / 2).toFixed(1)}" y="${c.y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice"/>`
          + `<rect x="${(c.x - w / 2).toFixed(1)}" y="${c.y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#525252" stroke-width="2"/>${label}</g>`,
      });
    } else {
      // Flat things and columns: an upright block at their real width and height.
      const w = ((kind === "flat" ? fu.radiusM * 2 : Math.max(0.3, fu.radiusM * 2)) / c.depth) * focal;
      items.push({
        depth: c.depth,
        svg: `<g><rect x="${(c.x - w / 2).toFixed(1)}" y="${c.y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, floor.y - c.y).toFixed(1)}" fill="${kind === "flat" ? "#ede9fe" : "#e5e5e5"}" fill-opacity="${OV ? 0.6 : 1}" stroke="#525252" stroke-width="3"/>${label}</g>`,
      });
    }
  }

  const tags: { x: number; y: number; w: number; h: number }[] = [];
  i.people.forEach((p, k) => {
    const a = i.plan.actors.find((x) => x.characterId === p.id);
    if (!a) return;
    // Posture (D37): sitting, kneeling and crouching figures are shorter; lying ones lie flat
    // across the picture on what they lie on, so the frame shows the body as it is.
    const seatProp = a.poseOn ? (i.plan.furniture ?? []).find((x) => a.poseOn!.toLowerCase().includes(x.name.toLowerCase())) : undefined;
    const seatZ = seatProp?.heightM ?? (a.poseOn && /\b(bed|sofa|couch|settee|bench|chair|seat|stool|armchair)\b/i.test(a.poseOn) ? 0.5 : a.pose === "lying" ? 0.12 : 0.45);
    const h = a.pose === "sitting" ? seatZ + 0.85 : a.pose === "kneeling" ? 1.25 : a.pose === "crouching" ? 1.0 : (p.heightM ?? 1.72);
    const poseWord = a.pose && a.pose !== "standing" ? `${a.pose.toUpperCase()}${a.poseOn ? ` ON ${a.poseOn.replace(/^the\s+/i, "").toUpperCase()}` : ""}` : "";
    if (a.pose === "lying") {
      const col = COLOURS[k % COLOURS.length];
      const bold = p.id === i.subjectId;
      const lw = (p.heightM ?? 1.72) / 2 - 0.1;
      const hp = { x: a.position.x + r.x * lw, y: a.position.y + r.y * lw }, fp = { x: a.position.x - r.x * lw, y: a.position.y - r.y * lw };
      const H0 = toScreen(hp, seatZ + 0.15), F0 = toScreen(fp, seatZ + 0.12), c0 = toScreen(a.position, seatZ + 0.15);
      if (c0.depth < near || (H0.x < 0 && F0.x < 0) || (H0.x > W && F0.x > W)) return;
      const thick = Math.max(12, (0.32 / c0.depth) * focal);
      const headR = Math.max(8, (0.12 / c0.depth) * focal);
      const fsN = Math.max(20, Math.min(44, thick * 0.9)), fs2 = Math.max(16, Math.min(26, fsN * 0.6));
      const ty = Math.max(fsN + 8, Math.min(H - fs2 * 2, Math.min(H0.y, F0.y) - thick - fs2 * 1.6));
      const fill = OV ? "#e5e7eb" : col;
      items.push({
        depth: c0.depth,
        svg: `<g><line x1="${F0.x.toFixed(1)}" y1="${F0.y.toFixed(1)}" x2="${H0.x.toFixed(1)}" y2="${H0.y.toFixed(1)}" stroke="${col}" stroke-width="${(thick + (bold ? 10 : 6)).toFixed(1)}" stroke-linecap="round"/>`
          + `<line x1="${F0.x.toFixed(1)}" y1="${F0.y.toFixed(1)}" x2="${H0.x.toFixed(1)}" y2="${H0.y.toFixed(1)}" stroke="${fill}" stroke-opacity="0.93" stroke-width="${thick.toFixed(1)}" stroke-linecap="round"/>`
          + `<circle cx="${H0.x.toFixed(1)}" cy="${(H0.y - headR * 0.4).toFixed(1)}" r="${headR.toFixed(1)}" fill="${fill}" stroke="${col}" stroke-width="${bold ? 8 : 5}"/>`
          + `<text x="${c0.x.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fsN.toFixed(0)}" font-weight="700" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="6" paint-order="stroke" font-family="sans-serif">${esc(p.name.split(/\s+/)[0].toUpperCase())}</text>`
          + `<text x="${c0.x.toFixed(1)}" y="${(ty + fs2 * 1.3).toFixed(1)}" font-size="${fs2.toFixed(0)}" font-weight="700" text-anchor="middle" fill="${col}" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">${esc(poseWord)}</text></g>`,
      });
      return;
    }
    const head = toScreen(a.position, h - 0.12);
    if (head.depth < near) return;
    const feet = toScreen(a.position, 0);
    const half = (BODY_WIDTH / 2 / head.depth) * focal;
    const headR = (0.12 / head.depth) * focal;
    const shoulders = toScreen(a.position, h - 0.3);
    if (head.x + half < 0 || head.x - half > W) return; // out of frame
    const col = COLOURS[k % COLOURS.length];
    const bold = p.id === i.subjectId;
    const fs = Math.max(20, Math.min(64, half * 0.55));
    const labelY = Math.min(H - 24, Math.max(fs + 8, (shoulders.y + feet.y) / 2));
    if (OV) {
      // Which way they face, from the floor plan (or the way they walk), in picture words.
      const to = i.moves?.[p.id];
      const fwd0 = to ? { x: to.x - a.position.x, y: to.y - a.position.y } : facingOf(i.plan, p.id, i.plan.lineOfAction);
      const fl0 = fwd0 ? Math.hypot(fwd0.x, fwd0.y) || 1 : 1;
      const fwd = fwd0 ? { x: fwd0.x / fl0, y: fwd0.y / fl0 } : undefined;
      const toCam = { x: cam.position.x - a.position.x, y: cam.position.y - a.position.y };
      const tl = Math.hypot(toCam.x, toCam.y) || 1;
      const cf = fwd ? (fwd.x * toCam.x + fwd.y * toCam.y) / tl : 1;
      const lat = fwd ? fwd.x * r.x + fwd.y * r.y : 0;
      const facing0 = cf > 0.5 ? "FACING CAMERA" : cf < -0.35 ? "BACK TO CAMERA" : `SIDE-ON, FACING ${lat > 0 ? "RIGHT" : "LEFT"}`;
      const facing = poseWord ? `${poseWord}, ${facing0}` : facing0;
      const fsN = Math.min(fs, 44);
      const fs2 = Math.max(16, Math.min(26, fsN * 0.6));
      // Small, far-off figures get their name tag above the head, staggered so neighbours'
      // tags don't overlap; near figures carry it on the chest.
      const small = half < 45;
      // Near figures carry their name on the head (heads don't overlap the way bodies do),
      // kept inside the frame.
      // Tags never overlap (D34): each moves (up for far figures, down for near ones) until clear.
      const lw = Math.max(p.name.split(/\s+/)[0].length * fsN * 0.66, facing.length * fs2 * 0.6) + 12, lh = fsN + fs2 * 1.4;
      let tagY = small ? head.y - headR - 14 - fs2 * 1.2 : Math.min(H - fs2 * 2, Math.max(fsN + 8, head.y + fsN * 0.35));
      const clash = (y: number) => tags.some((t) => Math.abs(t.x - head.x) < (t.w + lw) / 2 && Math.abs(t.y - y) < (t.h + lh) / 2);
      for (let n = 0; n < 12 && clash(tagY); n++) tagY += small ? -(lh + 4) : lh + 4;
      tags.push({ x: head.x, y: tagY, w: lw, h: lh });
      let svg = `<g><rect x="${(head.x - half).toFixed(1)}" y="${shoulders.y.toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.max(0, feet.y - shoulders.y).toFixed(1)}" rx="${(half * 0.6).toFixed(1)}" fill="#e5e7eb" fill-opacity="0.93" stroke="${col}" stroke-width="${bold ? 8 : 5}"/>`
        + `<circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${headR.toFixed(1)}" fill="#e5e7eb" fill-opacity="0.93" stroke="${col}" stroke-width="${bold ? 8 : 5}"/>`;
      // A nose on the head points the way they face (side-on), or a face mark (towards us).
      if (/SIDE-ON/.test(facing)) svg += `<polygon points="${(head.x + Math.sign(lat) * headR * 1.6).toFixed(1)},${head.y.toFixed(1)} ${(head.x + Math.sign(lat) * headR * 0.8).toFixed(1)},${(head.y - headR * 0.35).toFixed(1)} ${(head.x + Math.sign(lat) * headR * 0.8).toFixed(1)},${(head.y + headR * 0.35).toFixed(1)}" fill="${col}"/>`;
      else if (/FACING CAMERA/.test(facing)) svg += `<circle cx="${(head.x - headR * 0.35).toFixed(1)}" cy="${(head.y - headR * 0.1).toFixed(1)}" r="${(headR * 0.12).toFixed(1)}" fill="#111"/><circle cx="${(head.x + headR * 0.35).toFixed(1)}" cy="${(head.y - headR * 0.1).toFixed(1)}" r="${(headR * 0.12).toFixed(1)}" fill="#111"/>`;
      if (small) svg += `<line x1="${head.x.toFixed(1)}" y1="${(head.y - headR).toFixed(1)}" x2="${head.x.toFixed(1)}" y2="${(tagY + fs2 * 1.5).toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
      svg += `<text x="${head.x.toFixed(1)}" y="${(small ? tagY - fs2 * 0.2 : tagY).toFixed(1)}" font-size="${fsN.toFixed(0)}" font-weight="700" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="6" paint-order="stroke" font-family="sans-serif">${esc(p.name.split(/\s+/)[0].toUpperCase())}</text>`
        + `<text x="${head.x.toFixed(1)}" y="${(small ? tagY + fs2 * 1.1 : tagY + fs2 * 1.3).toFixed(1)}" font-size="${fs2.toFixed(0)}" font-weight="700" text-anchor="middle" fill="${col}" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">${facing}</text>`;
      // Anything held on one side (D34): marked on that side of the picture, mirrored when
      // they face us. Side-on, the text says which hand.
      for (const it of i.held?.[p.id] ?? []) {
        if (/SIDE-ON/.test(facing) || !/^(hand|shoulder|arm)$/.test(it.where)) continue;
        const pictureSide = /FACING CAMERA/.test(facing) ? (it.side === "left" ? 1 : -1) : (it.side === "left" ? -1 : 1);
        const hz = it.where === "shoulder" ? h - 0.35 : it.where === "wrist" ? 0.95 : 0.8;
        const hp = toScreen(a.position, hz);
        const mx = head.x + pictureSide * (half + Math.max(10, half * 0.25));
        const noun = itemNoun(it.what).toUpperCase();
        const bw = Math.max(70, fs2 * (noun.length * 0.62 + 1));
        svg += `<rect x="${(mx - bw / 2).toFixed(1)}" y="${(hp.y - fs2 * 0.8).toFixed(1)}" width="${bw.toFixed(1)}" height="${(fs2 * 1.5).toFixed(1)}" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="3"/>`
          + `<text x="${mx.toFixed(1)}" y="${(hp.y + fs2 * 0.25).toFixed(1)}" font-size="${(fs2 * 0.85).toFixed(0)}" font-weight="700" text-anchor="middle" fill="#92400e" font-family="sans-serif">${esc(noun)}</text>`;
      }
      // The way they are walking (D34): an arrow on the floor from their feet.
      if (to) {
        const len = Math.min(1.8, Math.hypot(to.x - a.position.x, to.y - a.position.y));
        const end = { x: a.position.x + (fwd?.x ?? 0) * len, y: a.position.y + (fwd?.y ?? 0) * len };
        const s0r = toScreen(a.position, 0.02), s1 = toScreen(end, 0.02);
        // Start where the feet are, or at the bottom edge when the feet are below the frame.
        const tcl = s0r.y > H - 20 && s1.y < s0r.y ? (s0r.y - (H - 20)) / (s0r.y - s1.y) : 0;
        const s0 = { x: s0r.x + (s1.x - s0r.x) * tcl, y: s0r.y + (s1.y - s0r.y) * tcl };
        if (s1.depth > near) {
          const ang = Math.atan2(s1.y - s0.y, s1.x - s0.x), ah = 40;
          svg += `<line x1="${s0.x.toFixed(1)}" y1="${s0.y.toFixed(1)}" x2="${s1.x.toFixed(1)}" y2="${s1.y.toFixed(1)}" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"/>`
            + `<polygon points="${s1.x.toFixed(1)},${s1.y.toFixed(1)} ${(s1.x - ah * Math.cos(ang - 0.45)).toFixed(1)},${(s1.y - ah * Math.sin(ang - 0.45)).toFixed(1)} ${(s1.x - ah * Math.cos(ang + 0.45)).toFixed(1)},${(s1.y - ah * Math.sin(ang + 0.45)).toFixed(1)}" fill="#f59e0b"/>`
            + `<text x="${Math.min(W - 120, Math.max(120, s1.x)).toFixed(1)}" y="${Math.min(H - 12, Math.max(40, s1.y + (s1.y > s0.y ? 44 : -22))).toFixed(1)}" font-size="26" font-weight="700" text-anchor="middle" fill="#b45309" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">WALKING THIS WAY</text>`;
        }
      }
      items.push({ depth: head.depth, svg: `${svg}</g>` });
      return;
    }
    items.push({
      depth: head.depth,
      svg: `<g><rect x="${(head.x - half).toFixed(1)}" y="${shoulders.y.toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.max(0, feet.y - shoulders.y).toFixed(1)}" rx="${(half * 0.6).toFixed(1)}" fill="${col}" fill-opacity="0.8" stroke="${col}" stroke-width="${bold ? 8 : 4}"/>`
        + `<circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${headR.toFixed(1)}" fill="${col}" fill-opacity="0.8" stroke="${col}" stroke-width="${bold ? 8 : 4}"/>`
        + `<text x="${head.x.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="${fs.toFixed(0)}" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">${esc(p.name)}</text></g>`,
    });
  });

  items.sort((a, b) => b.depth - a.depth); // far first, so nearer figures overlap them
  // The horizon moves with the tilt: down when looking up, up when looking down.
  const horizon = Math.max(-H, Math.min(2 * H, H / 2 + Math.tan(tilt) * focal));
  if (OV) {
    // See-through: only the stand-ins, props, raised areas and arrows, for laying over the
    // background this camera really sees (D34).
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      cam.rollDeg ? `<g transform="translate(${W / 2} ${H / 2}) rotate(${cam.rollDeg}) translate(${-W / 2} ${-H / 2})">` : "<g>",
      ...items.map((x) => x.svg),
      "</g></svg>",
    ].join("");
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#fafafa"/>`,
    cam.rollDeg ? `<g transform="translate(${W / 2} ${H / 2}) rotate(${cam.rollDeg}) scale(${(Math.cos(Math.abs(cam.rollDeg) * Math.PI / 180) + Math.sin(Math.abs(cam.rollDeg) * Math.PI / 180) * Math.max(W / H, H / W)).toFixed(3)}) translate(${-W / 2} ${-H / 2})">` : "<g>",
    `<rect y="${Math.max(0, horizon)}" width="${W}" height="${Math.max(0, H - Math.max(0, horizon))}" fill="#f0f0f0"/>`,
    `<line x1="0" y1="${horizon}" x2="${W}" y2="${horizon}" stroke="#d4d4d4" stroke-width="2" stroke-dasharray="12 10"/>`,
    i.backgroundView ? `<text x="${W / 2}" y="44" font-size="28" text-anchor="middle" fill="#737373" font-family="sans-serif">behind: ${esc(i.backgroundView)}</text>` : "",
    ...items.map((x) => x.svg),
    "</g>",
    (cam.rollDeg || cam.povId) ? `<text x="${W / 2}" y="${H - 52}" font-size="26" text-anchor="middle" fill="#404040" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">${[cam.povId ? `point of view: ${esc(i.people.find((p) => p.id === cam.povId)?.name ?? cam.povId)}'s eyes` : "", cam.rollDeg ? `Dutch angle ${Math.round(cam.rollDeg)}°` : ""].filter(Boolean).join(" · ")}</text>` : "",
    (cam.tiltDeg || (cam.heightM && Math.abs(cam.heightM - EYE_HEIGHT) > 0.3) || floorZ(i.plan, cam.position)) ? `<text x="${W / 2}" y="${H - 20}" font-size="26" text-anchor="middle" fill="#404040" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">camera ${(cam.heightM ?? EYE_HEIGHT).toFixed(1)} m up${floorZ(i.plan, cam.position) ? ` on ${esc(levelAt(i.plan, cam.position)!.name)}` : ""}, ${Math.abs(cam.tiltDeg ?? 0).toFixed(0)}° ${(cam.tiltDeg ?? 0) < 0 ? "down" : "up"}</text>` : "",
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="#a3a3a3" stroke-width="4"/>`,
    "</svg>",
  ].join("");
}
