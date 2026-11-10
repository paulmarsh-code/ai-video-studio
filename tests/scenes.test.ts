// General scenes (D19c): the layout rules must hold for any project, not just Jade's Entrance.
// Each made-up scene goes through the same path as a real one (default plan, arrival spots,
// camera design) and must meet the same promises.
import { describe, expect, it } from "vitest";
import { addMovementMarks, defaultPlan, shotSpecFor, type DraftPanel, type SceneStaging } from "../src/lib/domain/story";
import { designScene, facingOf } from "../src/lib/domain/director";
import { cameraPlacementProblem, horizontalFov, occlusions, planForShot, readCamera } from "../src/lib/domain/geometry";

const P = (action: string, inFrame: string[], speakerId?: string, line = ""): DraftPanel => ({ action, inFrame, speakerId, line, emotion: "neutral", seconds: line ? 4 : 3 });

const SCENES: { title: string; cast: string[]; staging: Partial<SceneStaging>; aspect: "9:16" | "16:9"; panels: DraftPanel[] }[] = [
  {
    title: "two friends at a bar", cast: ["amy", "ben"], aspect: "9:16",
    staging: { spot: "sitting side by side at the bar counter", props: [{ name: "bar counter", detail: "long, waist-high at 105 cm, dark wood" }], crowd: "few - a few drinkers", crowdLevel: "few" },
    panels: [
      P("Amy and Ben sit at the bar, drinks in hand.", ["amy", "ben"]),
      P("Amy turns to Ben.", ["amy", "ben"], "amy", "You never told me you were moving."),
      P("Ben shrugs.", ["ben", "amy"], "ben", "It all happened so fast."),
      P("Amy stares at him, hurt.", ["amy"]),
    ],
  },
  {
    title: "dinner table of six", cast: ["mum", "dad", "kim", "leo", "gran", "sam"], aspect: "16:9",
    staging: { spot: "seated around the dining table", props: [{ name: "dining table", detail: "long, 2 m long, white cloth, roast in the middle" }], crowd: "", crowdLevel: "none" },
    panels: [
      P("The family sits around the dinner table.", ["mum", "dad", "kim", "leo", "gran", "sam"]),
      P("Mum raises her glass.", ["mum", "dad", "kim", "leo", "gran", "sam"], "mum", "To Gran, eighty today!"),
      P("Gran smiles, embarrassed.", ["gran", "mum"], "gran", "Oh, stop it."),
      P("Leo and Kim exchange a look.", ["leo", "kim"]),
      P("Dad stands up, tapping his glass.", ["dad", "mum", "gran"], "dad", "Speech!"),
    ],
  },
  {
    title: "someone walks into an empty office", cast: ["raj", "tess"], aspect: "16:9",
    staging: { spot: "standing at Tess's desk", props: [{ name: "desk", detail: "white, 75 cm high, laptop and lamp on it" }], crowd: "", crowdLevel: "none" },
    panels: [
      P("Raj enters the dark office, looking around.", ["raj"]),
      P("He walks over to Tess at her desk.", ["raj", "tess"]),
      P("Raj leans in.", ["raj", "tess"], "raj", "Why are you still here?"),
      P("Tess looks up from her laptop.", ["tess", "raj"], "tess", "Someone has to finish it."),
      P("Raj turns away and walks off.", ["raj", "tess"]),
    ],
  },
  {
    title: "a launch party in portrait", cast: ["jade", "chase", "marcus", "nina"], aspect: "9:16",
    staging: { spot: "standing around the cocktail table", props: [{ name: "cocktail table", detail: "round, chest-high at 110 cm, white cloth" }, { name: "logo wall", detail: "3 m wide x 2.5 m tall" }], crowd: "busy - 40 guests", crowdLevel: "busy" },
    panels: [
      P("Jade enters the busy launch party.", ["jade"]),
      P("She walks through the crowd and spots the group.", ["jade", "chase", "marcus", "nina"]),
      P("Jade approaches the group.", ["jade", "chase", "marcus", "nina"]),
      P("Jade asks Chase about her promotion.", ["jade", "chase"], "jade", "So what did you think?"),
      P("Chase smirks at the group.", ["chase", "jade", "marcus", "nina"], "chase", "Lucky break, wasn't it?"),
      P("Marcus and Nina exchange glances.", ["marcus", "nina"]),
      P("Jade turns away and walks off.", ["jade", "chase", "marcus", "nina"]),
    ],
  },
];

describe.each(SCENES)("General scene: $title", (sc) => {
  const base = defaultPlan(sc.cast, sc.panels, [{ name: "back wall", directionDeg: 90 }, { name: "entrance", directionDeg: 270 }], sc.staging, sc.aspect);
  const subjects = sc.panels.map((p) => ({ action: p.action, subjectId: p.speakerId ?? p.inFrame[0] }));
  const { plan, at } = addMovementMarks(base, subjects);
  const shots = sc.panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p, { code: `P${i + 1}`, venueName: "v", castIds: sc.cast, staging: sc.staging }), at: at[i], subjectId: p.speakerId ? undefined : p.inFrame[0] } }));
  const d = designScene(plan, shots, (id) => id);

  it("every panel gets a camera, inside the room", () => {
    for (const s of d.shots) {
      expect(s.options.length, s.shotCode).toBeGreaterThan(0);
      expect(cameraPlacementProblem(plan, s.options[0].camera), s.shotCode).toBeFalsy();
    }
  });
  it("everyone the panel needs is in frame, and no needed face is hidden", () => {
    for (const [i, s] of d.shots.entries()) {
      const spec = shots[i].spec;
      const sp = planForShot(plan, spec);
      const cam = s.options[0].camera;
      const r = readCamera(sp, cam);
      const needed = cam.preset === "single-cu" ? [spec.speakerId ?? spec.subjectId ?? spec.visibleIds[0]] : spec.visibleIds;
      for (const id of needed) expect(r.actors.find((a) => a.characterId === id)?.inView, `${s.shotCode} ${id}`).toBe(true);
      expect(occlusions(r, needed, spec.presentIds).filter((o) => o.level === "face"), s.shotCode).toEqual([]);
      expect(horizontalFov(sp, cam)).toBeGreaterThan(0);
    }
  });
  it("the panel's main person is never filmed from behind, except when the camera follows them in", () => {
    for (const [i, s] of d.shots.entries()) {
      const spec = shots[i].spec;
      const id = spec.speakerId ?? spec.subjectId ?? spec.visibleIds[0];
      const sp = planForShot(plan, spec);
      const pos = sp.actors.find((a) => a.characterId === id)!.position;
      const fwd = facingOf(sp, id, d.lineOfAction);
      if (!fwd || spec.at?.[id] === "arriving") continue;
      const cam = s.options[0].camera.position;
      const v = { x: cam.x - pos.x, y: cam.y - pos.y };
      const l = Math.hypot(v.x, v.y);
      expect((fwd.x * v.x + fwd.y * v.y) / l, s.shotCode).toBeGreaterThan(-0.35);
    }
  });
});
