// Layout sketch (D18f): the floor plan seen through the shot's camera, drawn as simple labelled
// figures. It goes to GPT with every panel picture so positions, sizes and the camera angle
// come from the geometry, not from GPT's reading of words like "frame-left".
// Pure: returns an SVG string; the server turns it into a PNG.

import { horizontalFov } from "./geometry";
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
}): string {
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
  const camH = cam.heightM ?? EYE_HEIGHT;
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const toScreen = (p: { x: number; y: number }, z: number) => {
    const rel = { x: p.x - cam.position.x, y: p.y - cam.position.y };
    const d0 = rel.x * f.x + rel.y * f.y;
    const lateral = rel.x * r.x + rel.y * r.y;
    const v0 = z - camH;
    // Rotate (depth, height) by the tilt: looking down brings the floor up the frame.
    const depth = d0 * Math.cos(tilt) + v0 * Math.sin(tilt);
    const v = -d0 * Math.sin(tilt) + v0 * Math.cos(tilt);
    return { depth, x: W / 2 + (lateral / depth) * focal, y: H / 2 - (v / depth) * focal };
  };

  type Item = { depth: number; svg: string };
  const items: Item[] = [];
  const near = 0.25;

  // Other people: the same grey figures in the same places in every camera view of the scene.
  if (i.crowd === "few" || i.crowd === "busy") {
    const n = i.crowd === "busy" ? 22 : 6;
    // Background people stay behind the cast: never between the camera and the characters.
    const castDepths = i.plan.actors.map((a) => toScreen(a.position, 1).depth).filter((d) => d > near);
    const behind = (castDepths.length ? Math.max(...castDepths) : 0) + 0.6;
    const occupied = [...i.plan.actors.map((a) => a.position), ...(i.plan.furniture ?? []).map((x) => x.position)];
    const C = occupied.length ? { x: occupied.reduce((s, p) => s + p.x, 0) / occupied.length, y: occupied.reduce((s, p) => s + p.y, 0) / occupied.length } : { x: 0, y: 5 };
    for (let k = 0; k < n; k++) {
      const ring = 2.6 + (k % 3) * 0.9;
      const ang = (k * 137.5 * Math.PI) / 180; // golden angle: spread evenly, same every time
      const pos = { x: C.x + ring * Math.cos(ang), y: C.y + ring * Math.sin(ang) };
      if (occupied.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 1.1)) continue;
      if (Math.hypot(pos.x - cam.position.x, pos.y - cam.position.y) < 1.2) continue;
      const head = toScreen(pos, 1.6);
      if (head.depth < Math.max(1, behind)) continue;
      const feet = toScreen(pos, 0);
      const half = (0.2 / head.depth) * focal;
      items.push({ depth: head.depth, svg: `<g opacity="0.55"><rect x="${(head.x - half).toFixed(1)}" y="${(head.y + half * 0.5).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.max(0, feet.y - head.y - half * 0.5).toFixed(1)}" rx="${(half * 0.6).toFixed(1)}" fill="#9ca3af"/><circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${(half * 0.55).toFixed(1)}" fill="#9ca3af"/></g>` });
    }
  }

  for (const fu of i.plan.furniture ?? []) {
    const text = `${fu.name} ${fu.detail ?? ""}`;
    const kind = propKind(text, fu.name);
    const h = fu.heightM ?? TABLE_HEIGHT;
    const c = toScreen(fu.position, h);
    if (c.depth < near) continue;
    const floor = toScreen(fu.position, 0);
    const label = `<text x="${c.x.toFixed(1)}" y="${(floor.y + 26).toFixed(1)}" font-size="22" text-anchor="middle" fill="#404040" font-family="sans-serif">${esc(fu.name)}</text>`;
    if (kind === "table") {
      const rx = (fu.radiusM / c.depth) * focal;
      const ry = Math.max(4, rx * Math.min(0.5, Math.abs(EYE_HEIGHT - h) / c.depth));
      items.push({
        depth: c.depth,
        svg: `<g><rect x="${(c.x - rx * 0.12).toFixed(1)}" y="${c.y.toFixed(1)}" width="${(rx * 0.24).toFixed(1)}" height="${Math.max(0, floor.y - c.y).toFixed(1)}" fill="#a3a3a3"/>`
          + `<ellipse cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#e5e5e5" stroke="#525252" stroke-width="3"/>${label}</g>`,
      });
    } else {
      // Flat things and columns: an upright block at their real width and height.
      const w = ((kind === "flat" ? fu.radiusM * 2 : Math.max(0.3, fu.radiusM * 2)) / c.depth) * focal;
      items.push({
        depth: c.depth,
        svg: `<g><rect x="${(c.x - w / 2).toFixed(1)}" y="${c.y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, floor.y - c.y).toFixed(1)}" fill="${kind === "flat" ? "#ede9fe" : "#e5e5e5"}" stroke="#525252" stroke-width="3"/>${label}</g>`,
      });
    }
  }

  i.people.forEach((p, k) => {
    const a = i.plan.actors.find((x) => x.characterId === p.id);
    if (!a) return;
    const h = p.heightM ?? 1.72;
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
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#fafafa"/>`,
    `<rect y="${Math.max(0, horizon)}" width="${W}" height="${Math.max(0, H - Math.max(0, horizon))}" fill="#f0f0f0"/>`,
    `<line x1="0" y1="${horizon}" x2="${W}" y2="${horizon}" stroke="#d4d4d4" stroke-width="2" stroke-dasharray="12 10"/>`,
    i.backgroundView ? `<text x="${W / 2}" y="44" font-size="28" text-anchor="middle" fill="#737373" font-family="sans-serif">behind: ${esc(i.backgroundView)}</text>` : "",
    ...items.map((x) => x.svg),
    (cam.tiltDeg || (cam.heightM && Math.abs(cam.heightM - EYE_HEIGHT) > 0.3)) ? `<text x="${W / 2}" y="${H - 20}" font-size="26" text-anchor="middle" fill="#404040" stroke="#fff" stroke-width="5" paint-order="stroke" font-family="sans-serif">camera ${(cam.heightM ?? EYE_HEIGHT).toFixed(1)} m up, ${Math.abs(cam.tiltDeg ?? 0).toFixed(0)}° ${(cam.tiltDeg ?? 0) < 0 ? "down" : "up"}</text>` : "",
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="#a3a3a3" stroke-width="4"/>`,
    "</svg>",
  ].join("");
}
