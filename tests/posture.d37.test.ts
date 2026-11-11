// Posture from panel to panel (D37): any scene; made-up names.
import { describe, expect, it } from "vitest";
import { blockingFromWords, posturesFromWords, postureWords, startPose } from "../src/lib/domain/panelWords";
import { carryBlocking } from "../src/lib/domain/blocking";
import { planForShot } from "../src/lib/domain/geometry";
import type { GeometryPlanData, ShotSpec } from "../src/lib/domain/types";

const people = [{ id: "aron", name: "Aron" }, { id: "jane", name: "Jane" }];
const bedroom: GeometryPlanData = {
  bounds: { minX: -2.25, maxX: 2.25, minY: 0, maxY: 5.5 },
  actors: [{ characterId: "aron", position: { x: 0, y: 2 } }],
  furniture: [{ id: "bed", name: "single bed", position: { x: 1, y: 4 }, radiusM: 1, heightM: 0.5 }, { id: "phone", name: "phone", position: { x: 1.9, y: 4.6 }, radiusM: 0.05 }, { id: "unit", name: "bedside drawer unit", position: { x: 1.9, y: 4.6 }, radiusM: 0.25 }],
  cameras: [], views: [{ name: "bedroom door", directionDeg: 270 }, { name: "window", directionDeg: 90 }],
};
const P = (action: string) => ({ action, subjectId: "aron", visibleIds: ["aron"] });
function run(plan: GeometryPlanData, actions: string[], start?: Parameters<typeof posturesFromWords>[3]) {
  const panels = actions.map(P);
  const app = blockingFromWords(plan, panels, people);
  const specs = carryBlocking(app.map((b) => ({ spec: { blocking: b } as unknown as ShotSpec })));
  return posturesFromWords(plan, panels.map((p, k) => ({ ...p, blocking: specs[k].blocking })), people, start);
}

describe("Posture carries on until the words change it (D37)", () => {
  it("lying on the bed, then upset and staring at the ceiling: still lying", () => {
    const p = run(bedroom, [
      "Aron is lying on his bed, he picks up his phone from the drawer unit next to the bed and on his phone re-reads the text Jane sent him.",
      "He is upset, puts his phone down and stares at the ceiling.",
    ]);
    expect(p[0].aron).toMatchObject({ pose: "lying", on: "the single bed", by: "app" });
    expect(p[1].aron).toMatchObject({ pose: "lying", on: "the single bed", by: "carried" });
    expect(postureWords("Aron", p[1].aron, "he")).toBe("Aron is lying on the single bed, still lying as in the panel before: he has not got up");
  });
  it("lying, then 'Aron sits up': sitting on the bed, changed from lying", () => {
    const p = run(bedroom, [
      "Aron is lying on his bed, he picks up his phone from the drawer unit next to the bed and on his phone re-reads the text Jane sent him.",
      "Aron sits up and he needs to do something about the situation.",
    ]);
    expect(p[1].aron).toMatchObject({ pose: "sitting", on: "the single bed", from: "lying", by: "app" });
    expect(postureWords("Aron", p[1].aron, "he")).toBe("Aron has just sat up and is sitting on the single bed now (he was lying before)");
  });
  it("getting up, walking off and kneeling are read; lies to someone is not lying down", () => {
    const p = run(bedroom, ["Aron lies back on the bed.", "Aron gets up.", "Aron lies to Jane on the phone.", "Aron kneels by the window.", "Aron walks to the bedroom door."]);
    expect(p[0].aron.pose).toBe("lying");
    expect(p[1].aron).toMatchObject({ pose: "standing", from: "lying" });
    expect(p[2].aron).toBeUndefined(); // standing, as before: nothing to say
    expect(p[3].aron.pose).toBe("kneeling");
    expect(p[4].aron).toMatchObject({ pose: "standing", why: "walks", from: "kneeling" });
  });
  it("walking somewhere and sitting down: standing while walking, then sitting carries on", () => {
    const room: GeometryPlanData = { ...bedroom, furniture: [{ id: "sofa", name: "grey sofa", position: { x: -1.5, y: 4 }, radiusM: 0.9 }] };
    const p = run(room, ["Aron walks over to the sofa and sits down.", "He sighs."]);
    expect(p[0].aron).toMatchObject({ pose: "standing", end: "sitting" });
    expect(p[1].aron).toMatchObject({ pose: "sitting", by: "carried" });
  });
  it("a thing that sits somewhere isn't a person sitting", () => {
    const p = run(bedroom, ["The phone sits on the drawer unit, buzzing."]);
    expect(p[0].aron).toBeUndefined();
  });
  it("the scene setting can start everyone sitting; the panel plan carries the posture", () => {
    expect(startPose("sitting round the kitchen table", bedroom)).toMatchObject({ pose: "sitting" });
    const p = run(bedroom, ["Aron laughs."], startPose("sitting on the single bed", bedroom));
    expect(p[0].aron).toMatchObject({ pose: "sitting", on: "the single bed", by: "carried" });
    const sp = planForShot(bedroom, { posture: p[0] });
    expect(sp.actors[0]).toMatchObject({ pose: "sitting", poseOn: "the single bed" });
  });
});

describe("Posture reaches the camera and the prompts (D37)", () => {
  it("still lying and staring at the ceiling: the camera looks down from above", async () => {
    const { verticalFor } = await import("../src/lib/domain/vertical");
    const v = verticalFor(" Aron is lying on the single bed. He is upset, puts his phone down and stares at the ceiling.");
    expect(v?.kind).toBe("overhead");
  });
  it("the video prompt says he stays lying, or sits up", async () => {
    const { composeKlingPrompt } = await import("../src/lib/domain/composer");
    const cast = [{ id: "aron", name: "Aron", pronoun: "he" as const, voiceLock: "" }];
    const base = { code: "S", visibleIds: ["aron"], excludedIds: [], presentIds: ["aron"], audioMode: "off", durationSec: 4, emotion: "upset", sceneContext: "Aron alone in his bedroom.", venueName: "bedroom", actions: "He stares at the ceiling.", subjectId: "aron" } as unknown as ShotSpec;
    const stay = composeKlingPrompt({ ...base, posture: { aron: { pose: "lying", on: "the single bed", by: "carried" } } }, cast).text;
    expect(stay).toContain("Aron stays lying on the single bed throughout; he does not get up.");
    const up = composeKlingPrompt({ ...base, posture: { aron: { pose: "sitting", on: "the single bed", by: "app", from: "lying" } } }, cast).text;
    expect(up).toContain("Aron sits up on the single bed during the clip, from lying.");
  });
  it("the blocking frame draws someone lying flat, labelled", async () => {
    const { layoutSketchSvg } = await import("../src/lib/domain/layoutSketch");
    const plan = planForShot(bedroom, { posture: { aron: { pose: "lying", on: "the single bed", by: "app" } }, blocking: { aron: { at: { x: 1, y: 4 }, by: "app" } } });
    const cam = { id: "c", name: "c", preset: "wide" as const, position: { x: 0, y: 0.6 }, lookAt: { x: 1, y: 4 }, fovDeg: 60 };
    const svg = layoutSketchSvg({ plan, camera: cam, people: [{ id: "aron", name: "Aron" }], size: "portrait", overlay: true });
    expect(svg).toContain("LYING ON SINGLE BED");
    expect(svg).toContain('stroke-linecap="round"');
  });
});

describe("The picture check reads posture (D37)", () => {
  it("someone standing who should be lying is a problem to correct", async () => {
    const { judgePicture, checkPrompt } = await import("../src/lib/domain/pictureCheck");
    const e = { order: ["Aron"], props: [], crowd: "none" as const, postures: [{ name: "Aron", pose: "lying" as const, on: "the single bed" }] };
    expect(checkPrompt(e, [])).toContain("Postures to check: Aron");
    const bad = judgePicture(e, JSON.stringify({ left_to_right: ["Aron"], postures: [{ name: "Aron", pose: "standing" }] }));
    expect(bad.problems.join(" ")).toContain("Aron is standing; Aron must be lying on the single bed");
    expect(judgePicture(e, JSON.stringify({ left_to_right: ["Aron"], postures: [{ name: "Aron", pose: "lying" }] })).pass).toBe(true);
  });
});

describe("Postures are saved with the storyboard (D37)", () => {
  it("editing panel words sets and carries postures on the shots", async () => {
    const { openDb } = await import("../src/db/client");
    const { seedDemo } = await import("../src/db/seed");
    const repo = await import("../src/lib/repo");
    const studio = await import("../src/lib/studioRepo");
    const db = await openDb(":memory:");
    const projectId = seedDemo(db);
    const sceneId = repo.listScenes(db, projectId)[0].id;
    studio.unlockScene(db, sceneId, "positions");
    const s = repo.getScene(db, sceneId)!;
    const who = repo.getCast(db, projectId).find((c) => c.id === s.shots[0].spec.visibleIds[0])!;
    const first = who.name.split(/\s+/)[0];
    const edit = (k: number, text: string) => { const p = s.panels[k]; studio.updatePanel(db, p.id, { code: p.code, description: text, emotion: p.emotion, speakerId: (p.dialogue as { characterId: string }[])[0]?.characterId, line: (p.dialogue as { text: string }[])[0]?.text }); };
    edit(0, `${first} is lying on the sofa, re-reading a text on the phone.`);
    edit(1, `${first} is upset and stares at the ceiling.`);
    const shotOf = (k: number) => repo.getScene(db, sceneId)!.shots.find((x) => x.panelId === s.panels[k].id)!;
    expect(shotOf(0).spec.posture?.[who.id]).toMatchObject({ pose: "lying", by: "app" });
    expect(shotOf(1).spec.posture?.[who.id]).toMatchObject({ pose: "lying", by: "carried" });
    edit(1, `${first} sits up, needing to do something about it.`);
    expect(shotOf(1).spec.posture?.[who.id]).toMatchObject({ pose: "sitting", from: "lying" });
  });
});
