// A change to one panel in the user's own words (D39): "move Jade closer to Nina and have
// Marcus walk off to the right". Used by "Need to change something?": the words become
// positions, turns and postures on that panel's floor plan, shown before anything is redrawn.
// Left and right, nearer and further are as the picture shows them, from the panel's camera.
// Everything else goes through the same readers as the panels' own words (D36, D37).

import { blockingFromWords, posturesFromWords } from "./panelWords";
import { horizontalFov } from "./geometry";
import type { GeometryPlanData, PanelBlock, PlanCamera, Point, Pose } from "./types";

export type ChangeEntry = Omit<PanelBlock, "by">;
export interface WordsChange {
  /** Entries to set on the panel, keyed like `spec.blocking` (people, "prop:", "pose:"). */
  entries: Record<string, ChangeEntry>;
  /** What was understood, one line each, for the user to check. */
  understood: string[];
  /** Parts of the words that changed nothing. */
  unclear: string[];
}

const NAME = String.raw`([A-Z][a-z]+)`;
const POSES: Record<string, Pose> = { sitting: "sitting", seated: "sitting", sit: "sitting", lying: "lying", "lying down": "lying", lie: "lying", standing: "standing", stand: "standing", kneeling: "kneeling", kneel: "kneeling", crouching: "crouching", crouch: "crouching" };

/** Change one panel from the user's words. `plan` is the panel's plan as it is now (planForShot). */
export function changeFromWords(text: string, plan: GeometryPlanData, cam: PlanCamera | undefined, people: { id: string; name: string }[]): WordsChange {
  const b = plan.bounds ?? { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 };
  const clamp = (p: Point, m = 0.3): Point => ({ x: +Math.min(b.maxX - m, Math.max(b.minX + m, p.x)).toFixed(2), y: +Math.min(b.maxY - m, Math.max(b.minY + m, p.y)).toFixed(2) });
  const byFirst = (w: string) => people.find((p) => p.name.split(/\s+/)[0].toLowerCase() === w.toLowerCase() || p.name.toLowerCase() === w.toLowerCase());
  const first = (id: string) => people.find((p) => p.id === id)?.name.split(/\s+/)[0] ?? id;
  const pos = new Map(plan.actors.map((a) => [a.characterId, a.position]));
  const entries: Record<string, ChangeEntry> = {};
  const understood: string[] = [], unclear: string[] = [];
  // The picture's own directions, from the camera: right across the picture, and towards the lens.
  const f0 = cam ? { x: cam.lookAt.x - cam.position.x, y: cam.lookAt.y - cam.position.y } : { x: 0, y: 1 };
  const fl = Math.hypot(f0.x, f0.y) || 1;
  const fwd = { x: f0.x / fl, y: f0.y / fl }, right = { x: fwd.y, y: -fwd.x };
  const place = (id: string, at: Point, why: string) => { const p = clamp(at); entries[id] = { ...(entries[id] ?? {}), at: p }; delete entries[id].to; pos.set(id, p); understood.push(`${first(id)}: ${why}`); };
  const amount = (s: string) => (/\b(bit|little|slightly|touch|fraction)\b/i.test(s) ? 0.4 : /\b(lot|much|well|far)\b/i.test(s) ? 1.6 : 0.8);

  // Clauses: split at "and"/"then"/commas that start a new instruction.
  // "Swap Ava and Ben" stays one instruction; "Marcus and Nina walk off" becomes one each.
  const pre = text.replace(/\s+/g, " ")
    .replace(/\bswap\s+([A-Z][a-z]+)\s+(?:and|with)\s+([A-Z][a-z]+)/g, "swap $1 & $2")
    .replace(/\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(swap|switch|change)\b/g, "$1 & $2 $3")
    .replace(/\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(?!&)([a-z][^.;,]*)/g, (all, a: string, z: string, rest: string) => (/^(?:and|or|to|with|from|at|in|on)\b/.test(rest) ? all : `${a} ${rest}. ${z} ${rest}`));
  const clauses = pre.split(/[.;!\n]+|,?\s+(?:and\s+then|and|then|also)\s+(?=(?:please\s+)?(?:move|have|make|let|get|put|place|bring|shift|turn|swap|take|remove|sit|lie|stand|[A-Z]))|,\s+(?=(?:move|have|make|put|turn|swap|take|remove|[A-Z]))/).map((c) => c.trim()).filter(Boolean);
  for (const raw of clauses) {
    const before = understood.length;
    let c = raw.replace(/^(?:please|can you|could you|i want(?: you)? to|we need to|i'd like to)\s+/i, "").replace(/^(?:have|make|let|get)\s+(?=[A-Z])/i, "");
    let m: RegExpExecArray | null;
    // Swap two people.
    if ((m = new RegExp(String.raw`^swap\s+${NAME}\s+(?:and|with|&)\s+${NAME}|^${NAME}\s+(?:and|&)\s+${NAME}\s+(?:swap|switch|change)(?:\s+(?:places|sides|round))?`).exec(c))) {
      const a = byFirst(m[1] ?? m[3]), z = byFirst(m[2] ?? m[4]);
      const pa = a && pos.get(a.id), pz = z && pos.get(z.id);
      if (a && z && pa && pz) { place(a.id, pz, `swaps places with ${first(z.id)}`); place(z.id, pa, `swaps places with ${first(a.id)}`); continue; }
    }
    // Take a prop away, or put it back.
    if ((m = /^(?:take|remove|get rid of|lose)\s+(?:away\s+|out\s+)?(?:the\s+)?([a-z][\w\s'-]*?)(?:\s+away)?$/i.exec(c))) {
      const fu = (plan.furniture ?? []).find((f) => f.name.toLowerCase().includes(m![1].toLowerCase().replace(/s$/, "")) || m![1].toLowerCase().includes(f.name.toLowerCase()));
      if (fu) { entries[`prop:${fu.id}`] = { at: fu.position, gone: true }; understood.push(`the ${fu.name}: taken away`); continue; }
    }
    // "Move Jade …": the person, then where.
    m = new RegExp(String.raw`^(?:move|bring|shift|put|place|walk|step|stand|sit|seat|lie|lay)\s+${NAME}\s+(.*)$`, "i").exec(c);
    const lead = m ? byFirst(m[1]) : undefined;
    if (lead && pos.get(lead.id)) {
      const id = lead.id, here = pos.get(id)!, rest = m![2].trim();
      const verb = c.split(/\s+/)[0].toLowerCase();
      let n: RegExpExecArray | null;
      if ((n = new RegExp(String.raw`(?:closer|nearer|next|up|right\s+next)\s+to\s+${NAME}|beside\s+${NAME}|towards\s+${NAME}`).exec(rest))) {
        const z = byFirst(n[1] ?? n[2] ?? n[3]); const pz = z && pos.get(z.id);
        if (z && pz) {
          const d = { x: here.x - pz.x, y: here.y - pz.y }, l = Math.hypot(d.x, d.y) || 1;
          const gap = /\bnext\s+to|beside\b/i.test(n[0]) ? 0.7 : Math.max(0.7, Math.min(l - 0.5, l * 0.6));
          place(id, { x: pz.x + (d.x / l) * gap, y: pz.y + (d.y / l) * gap }, `${/next|beside/.test(n[0]) ? "next to" : "closer to"} ${first(z.id)}`);
          continue;
        }
      }
      if ((n = new RegExp(String.raw`(?:away|further)\s+from\s+${NAME}`).exec(rest))) {
        const z = byFirst(n[1]); const pz = z && pos.get(z.id);
        if (z && pz) { const d = { x: here.x - pz.x, y: here.y - pz.y }, l = Math.hypot(d.x, d.y) || 1; place(id, { x: here.x + (d.x / l) * amount(rest), y: here.y + (d.y / l) * amount(rest) }, `further from ${first(z.id)}`); continue; }
      }
      if ((n = /\bto\s+the\s+other\s+side\s+of\s+(?:the\s+)?([a-z][\w\s'-]*|[A-Z][a-z]+)/.exec(rest))) {
        const z = byFirst(n[1]); const fu = !z ? (plan.furniture ?? []).find((f) => f.name.toLowerCase().includes(n![1].toLowerCase().trim()) || n![1].toLowerCase().includes(f.name.toLowerCase())) : undefined;
        const c0 = z ? pos.get(z.id) : fu?.position;
        if (c0) { place(id, { x: 2 * c0.x - here.x, y: 2 * c0.y - here.y }, `to the other side of ${z ? first(z.id) : `the ${fu!.name}`}`); continue; }
      }
      if ((n = /\b(?:to\s+the\s+|more\s+to\s+the\s+|over\s+to\s+the\s+|)(left|right)\b/i.exec(rest)) && !/\bof\s+the\s+(?!picture|frame|shot|screen)/i.test(rest)) {
        const s = n[1].toLowerCase() === "right" ? 1 : -1, d = amount(rest);
        place(id, { x: here.x + right.x * s * d, y: here.y + right.y * s * d }, `${d < 0.6 ? "a little " : ""}to the ${n[1].toLowerCase()} of the picture`);
        continue;
      }
      if (/\b(?:closer\s+to|nearer|towards)\s+(?:the\s+)?(?:camera|lens|front)|\bforward\b|\bto\s+the\s+front\b/i.test(rest)) {
        const d = amount(rest); place(id, { x: here.x - fwd.x * d, y: here.y - fwd.y * d }, "nearer the camera"); continue;
      }
      if (/\b(?:further|farther)\s+(?:back|away)|\baway\s+from\s+the\s+camera|\bback\b|\bto\s+the\s+back\b/i.test(rest)) {
        const d = amount(rest); place(id, { x: here.x + fwd.x * d, y: here.y + fwd.y * d }, "further from the camera"); continue;
      }
      // Anything else ("next to the bar", "onto the sofa"): as a statement for the panel readers.
      // "Put Ava on the sofa" means sitting on it.
      const seat = /^(?:on|onto|in)\s+(?:(?:the|her|his|their|a)\s+)?(?:\w+\s+)?(?:sofa|couch|settee|chair|armchair|bench|stool|seat|bed)\b/i.test(rest);
      c = `${lead.name.split(/\s+/)[0]} ${/^(sit|seat)$/.test(verb) || (seat && !/^stand$/.test(verb)) ? "sits" : /^(lie|lay)$/.test(verb) ? "lies" : "stands"} ${rest}`;
    }
    // "Jade should be sitting (on the sofa)", "Marcus is lying down".
    if ((m = new RegExp(String.raw`^${NAME}\s+(?:should\s+be|needs\s+to\s+be|must\s+be|is|to\s+be)\s+(sitting|seated|lying(?:\s+down)?|standing|kneeling|crouching)\b(.*)$`).exec(c))) {
      const who = byFirst(m[1]);
      if (who) { entries[`pose:${who.id}`] = { at: { x: 0, y: 0 }, pose: POSES[m[2].toLowerCase()] }; understood.push(`${first(who.id)}: ${POSES[m[2].toLowerCase()]}`); if (!m[3].trim()) continue; c = `${m[1]} ${m[2]}${m[3]}`; }
    }
    // Walking off to one side of the picture: past the edge of the frame on that side.
    if ((m = new RegExp(String.raw`^${NAME}\s+(?:walks?|walking|heads?|goes|go|storms?|strides?|leaves?|exits?)\s+(?:off|out|away)?\s*(?:to(?:wards)?\s+the\s+|out\s+of\s+(?:the\s+)?(?:picture|frame|shot)\s+(?:on\s+the\s+|to\s+the\s+)?)(left|right)\b`, "i").exec(c))) {
      const who = byFirst(m[1]); const here = who && pos.get(who.id);
      if (who && here) {
        const s = m[2].toLowerCase() === "right" ? 1 : -1;
        let d = 3;
        if (cam) {
          const depth = (here.x - cam.position.x) * fwd.x + (here.y - cam.position.y) * fwd.y;
          const lat = (here.x - cam.position.x) * right.x + (here.y - cam.position.y) * right.y;
          const half = Math.max(0.5, depth) * Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
          d = Math.max(1.5, half - s * lat + 0.8);
        }
        const to = clamp({ x: here.x + right.x * s * d, y: here.y + right.y * s * d });
        // Leaving this picture only: later panels follow their own words, not where the walk ended.
        entries[who.id] = { ...(entries[who.id] ?? {}), at: here, to, only: true };
        delete entries[who.id].facingDeg;
        entries[`pose:${who.id}`] = { at: { x: 0, y: 0 }, pose: "standing", only: true };
        understood.push(`${first(who.id)}: walks off to the ${m[2].toLowerCase()} of the picture (this panel only)`);
        continue;
      }
    }
    // "Turn Jade to face Chase", "turn Marcus away": as statements.
    c = c.replace(new RegExp(String.raw`^turn\s+${NAME}\s+`, "i"), (_x, nm: string) => `${nm} turns `).replace(/^(\w+)\s+turns\s+(?!to|away|towards|round|around|back)/, "$1 turns to ");
    // Everything else: the panel readers, from where everyone is now.
    const now = { ...plan, actors: plan.actors.map((a) => ({ ...a, position: pos.get(a.characterId) ?? a.position })) };
    const subjectId = byFirst((/^([A-Z][a-z]+)/.exec(c) ?? [])[1] ?? "")?.id;
    const app = blockingFromWords(now, [{ action: c, subjectId, visibleIds: [] }], people)[0];
    for (const [k, e] of Object.entries(app)) {
      const { by: _by, why, ...rest } = e;
      void _by;
      entries[k] = { ...(entries[k] ?? {}), ...rest };
      if (!k.includes(":") && rest.to === undefined) delete entries[k].to;
      if (!k.includes(":")) pos.set(k, rest.to ?? rest.at);
      understood.push(`${k.startsWith("prop:") ? `the ${(plan.furniture ?? []).find((f) => `prop:${f.id}` === k)?.name ?? k.slice(5)}` : first(k)}: ${why}`);
    }
    const poses = posturesFromWords(now, [{ action: c, subjectId, visibleIds: [], blocking: Object.fromEntries(Object.entries(app).map(([k, e]) => [k, { ...e, by: "app" as const }])) }], people)[0];
    for (const [id, pe] of Object.entries(poses)) {
      if (pe.by !== "app" || pe.why === "walks") continue;
      entries[`pose:${id}`] = { at: { x: 0, y: 0 }, pose: pe.pose };
      understood.push(`${first(id)}: ${pe.pose}${pe.on ? ` on ${pe.on}` : ""}`);
    }
    if (understood.length === before) unclear.push(raw);
  }
  return { entries, understood, unclear };
}
