// Shot language (D27): named sizes, framings, moves, angles, Dutch, point of view; made-up names.
import { describe, expect, it } from "vitest";
import { fovForSize, lensMm, lensText, namedShot, shotLines } from "../src/lib/domain/shotLanguage";
import { dutchFor, povFor, verticalFor, verticalText } from "../src/lib/domain/vertical";
import { addMovementMarks, defaultPlan, shotSpecFor } from "../src/lib/domain/story";
import { designScene } from "../src/lib/domain/director";
import { readCamera, planForShot } from "../src/lib/domain/geometry";

describe("Shot names (D27)", () => {
  it.each([
    ["Extreme close-up on her eyes", "ecu", undefined, undefined],
    ["Close-up on Ava as she reads the letter", "cu", undefined, undefined],
    ["Medium close-up of Ben", "mcu", undefined, undefined],
    ["Medium shot, waist up", "ms", undefined, undefined],
    ["Cowboy shot of the sheriff", "cowboy", undefined, undefined],
    ["Medium long shot as they talk", "mls", undefined, undefined],
    ["Full shot, head to toe", "fs", undefined, undefined],
    ["Long shot of the lone figure", "ls", undefined, undefined],
    ["Establishing shot of the harbour at dawn", "ws", "establishing", undefined],
    ["Over-the-shoulder shot from behind Ben", undefined, "ots", undefined],
    ["Two-shot of Ava and Ben", undefined, "two-shot", undefined],
    ["Three-shot at the bar", undefined, "three-shot", undefined],
    ["Profile shot of Ava at the window", undefined, "profile", undefined],
    ["Ben's POV of the door", undefined, "pov", undefined],
    ["Reaction shot: Ava hears the news", undefined, "reaction", undefined],
    ["Insert shot of the ring", "ecu", "insert", undefined],
    ["Tracking shot as she walks the corridor", undefined, undefined, "tracking"],
    ["The camera pans across the crowd", undefined, undefined, "pan"],
    ["Slow push-in on his face", undefined, undefined, "push-in"],
    ["Dolly zoom as he realises", undefined, undefined, "dolly-zoom"],
    ["Handheld, chaotic", undefined, undefined, "handheld"],
  ])("%s", (text, size, framing, move) => {
    const n = namedShot(text);
    expect(n.size).toBe(size);
    expect(n.framing).toBe(framing);
    expect(n.move).toBe(move);
  });
  it("looking back over a shoulder is not an over-the-shoulder shot", () => {
    expect(namedShot("She looks back over her shoulder at Ben").framing).toBeUndefined();
  });
  it("lens length and what it does", () => {
    expect(lensMm(40)).toBeGreaterThan(45);
    expect(lensMm(40)).toBeLessThan(52);
    expect(lensText(75)).toMatch(/^wide lens/);
    expect(lensText(40)).toMatch(/^normal lens/);
    expect(lensText(20)).toMatch(/^long lens.*compressed/);
    expect(fovForSize("cu", 2.5)).toBeLessThan(fovForSize("ms", 2.5));
    expect(fovForSize("cu", 4)).toBeLessThan(fovForSize("cu", 2));
  });
});

describe("Named and mood angles (D27)", () => {
  it.each([
    ["Low angle on Ben as he steps forward", "low"],
    ["High-angle shot of the empty room", "high"],
    ["Bird's-eye view of the square", "birds-eye"],
    ["Worm's-eye view of the tower", "worms-eye"],
    ["From hip level, Ben draws", "level"],
    ["Knee-level shot of feet on the stairs", "low"],
    ["Camera on the floor as the door opens", "low"],
    ["She kneels, helpless, at his mercy", "high"],
    ["He stands tall, triumphant", "low"],
    ["She is utterly alone in the vast hall", "birds-eye"],
    ["She smiles at Ben", undefined],
  ])("%s", (text, kind) => { expect(verticalFor(text)?.kind).toBe(kind); });
  it("Dutch angle: only when named (D93: no longer from the feeling)", () => {
    expect(dutchFor("Dutch angle on the doorway")).toBe(20);
    expect(dutchFor("He staggers, drunk and dizzy")).toBeUndefined();
    expect(dutchFor("She smiles at Ben")).toBeUndefined();
    expect(verticalFor("Ava panics and looks down at the street below")).toMatchObject({ kind: "high" });
    expect(verticalFor("Ava panics and looks down at the street below")?.rollDeg).toBeUndefined();
  });
  it("prompt words for each height and angle", () => {
    expect(verticalText({ heightM: 1.45, tiltDeg: 0 })).toContain("shoulder-level");
    expect(verticalText({ heightM: 1.0, tiltDeg: 0 })).toContain("hip-level");
    expect(verticalText({ heightM: 0.5, tiltDeg: 0 })).toContain("knee-level");
    expect(verticalText({ heightM: 0.15, tiltDeg: 0 })).toContain("ground-level");
    expect(verticalText({ heightM: 0.1, tiltDeg: 55 })).toContain("worm's-eye");
    expect(verticalText({ heightM: 6, tiltDeg: -90 })).toContain("bird's-eye");
    expect(verticalText({ heightM: 1.6, tiltDeg: 0, rollDeg: 20 })).toContain("Dutch angle");
    expect(verticalText({})).toBe("eye level");
  });
  it("whose point of view", () => {
    const people = [{ id: "a", name: "Ava" }, { id: "b", name: "Ben" }];
    expect(povFor("Ben's POV: Ava at the door", people, "a")).toBe("b");
    expect(povFor("We see what Ava sees", people, "b")).toBe("a");
    expect(povFor("Through Ben's eyes, the room spins", people, "a")).toBe("b");
    expect(povFor("POV shot down the corridor", people, "a")).toBe("a");
    expect(povFor("Ava smiles", people, "a")).toBeUndefined();
  });
  it("prompt lines: size, lens, point of view and what the angle means", () => {
    const lines = shotLines({ cam: { size: "cu" }, kind: "low", fovDeg: 20, text: "Close-up on Ava", name: (id) => id });
    expect(lines.join(" ")).toContain("close-up: the face fills the frame");
    expect(lines.join(" ")).toContain("long lens");
    expect(lines.join(" ")).toContain("taller, stronger");
    const pov = shotLines({ cam: { povId: "b" }, kind: "level", fovDeg: 45, text: "Ben's POV", name: () => "Ben" });
    expect(pov.join(" ")).toContain("Ben is not in the picture");
  });
});

describe("The camera chooser follows named shots (D27)", () => {
  const cast = ["mia", "tom", "ana"];
  const panels = [
    { action: "Mia, Tom and Ana stand together at the bar.", inFrame: cast },
    { action: "Close-up on Mia as she listens.", inFrame: ["mia"] },
    { action: "Two-shot of Mia and Tom.", inFrame: ["mia", "tom"] },
    { action: "Tom's POV: he looks at Mia.", inFrame: ["mia"], subject: "tom" },
    { action: "Profile shot of Ana.", inFrame: ["ana"] },
    { action: "Dutch angle as Ana panics.", inFrame: ["ana"] },
    { action: "Low angle on Tom, triumphant.", inFrame: ["tom"] },
  ].map((p) => ({ ...p, line: "", emotion: "calm", seconds: 3 }));
  const staging = { spot: "standing around a tall table at the bar", props: [], crowd: "", crowdLevel: "none" as const };
  const base = defaultPlan(cast, panels as never, [{ name: "bar", directionDeg: 90 }], staging, "16:9");
  const { plan } = addMovementMarks(base, panels.map((p) => ({ action: p.action, subjectId: p.inFrame[0] })));
  const shots = panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "bar", castIds: cast, staging }), subjectId: p.subject ?? p.inFrame[0] } }));
  const d = designScene(plan, shots, (id) => id[0].toUpperCase() + id.slice(1));
  const first = (k: number) => d.shots[k].options[0].camera;
  const pos = (k: number, id: string) => planForShot(plan, shots[k].spec).actors.find((a) => a.characterId === id)!.position;

  it("a close-up sets a long lens on the subject", () => {
    expect(first(1).size).toBe("cu");
    expect(first(1).fovDeg!).toBeLessThan(30);
  });
  it("a two-shot sees both people, square-on (others may show at the edges, D30)", () => {
    const seen = readCamera(planForShot(plan, shots[2].spec), first(2)).actors.filter((a) => a.inView).map((a) => a.characterId);
    expect(seen).toEqual(expect.arrayContaining(["mia", "tom"]));
    expect(first(2).preset).toBe("two-shot");
  });
  it("a point of view is Tom's eyes, looking at Mia, and Tom isn't in it", () => {
    const c = first(3);
    expect(c.povId).toBe("tom");
    const t = pos(3, "tom"), m = pos(3, "mia");
    expect(Math.hypot(c.position.x - t.x, c.position.y - t.y)).toBeLessThan(0.3);
    expect(Math.hypot(c.lookAt.x - m.x, c.lookAt.y - m.y)).toBeLessThan(0.1);
    expect(readCamera(planForShot(plan, shots[3].spec), c).actors.find((a) => a.characterId === "tom")?.inView).toBeFalsy();
  });
  it("a profile shot is side-on to Ana", () => {
    const c = first(4), a = pos(4, "ana");
    const toCam = { x: c.position.x - a.x, y: c.position.y - a.y };
    const l = Math.hypot(toCam.x, toCam.y);
    expect(l).toBeGreaterThan(1);
    expect(d.shots[4].options[0].kind).toContain("Profile");
  });
  it("Dutch and low angles", () => {
    expect(first(5).rollDeg).toBe(20);
    expect(first(6).tiltDeg!).toBeGreaterThan(0);
    expect(first(0).rollDeg).toBeUndefined();
  });
});

describe("Picture prompts carry the shot language (D27)", () => {
  it("a point of view leaves its owner out, and a close-up says its lens and framing", async () => {
    const { panelPrompt } = await import("../src/lib/domain/imagePrompts");
    const cast = ["mia", "tom", "ana"];
    const people = cast.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), pronoun: "she" as const, voiceLock: "" }));
    const panels = [
      { action: "Tom's POV: Mia at the table.", inFrame: ["mia"], subject: "tom" },
      { action: "Close-up on Mia, low angle, triumphant.", inFrame: ["mia"] },
    ].map((p) => ({ ...p, line: "", emotion: "calm", seconds: 3 }));
    const staging = { spot: "standing around a tall table", props: [], crowd: "", crowdLevel: "none" as const };
    const plan = defaultPlan(cast, panels as never, [{ name: "bar", directionDeg: 90 }], staging, "16:9");
    const shots = panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "bar", castIds: cast, staging }), subjectId: p.subject ?? p.inFrame[0] } }));
    const d = designScene(plan, shots, (id) => people.find((x) => x.id === id)!.name);
    plan.cameras = d.shots.map((s, i) => ({ ...s.options[0].camera, id: `c${i}` }));
    const pov = panelPrompt({ description: panels[0].action, shot: { ...shots[0].spec, cameraId: "c0" }, cast: people, profiles: {}, plan, venueName: "bar" }).text;
    expect(pov).toContain("we see exactly what Tom sees");
    expect(pov).not.toMatch(/Tom \(in the foreground/);
    const cu = panelPrompt({ description: panels[1].action, shot: { ...shots[1].spec, cameraId: "c1" }, cast: people, profiles: {}, plan, venueName: "bar" }).text;
    expect(cu).toContain("Framing: close-up");
    expect(cu).toMatch(/Lens: long lens, about \d+ mm/);
    expect(cu).toContain("low angle");
    expect(cu).toContain("Why this angle: they look taller");
  });
});
