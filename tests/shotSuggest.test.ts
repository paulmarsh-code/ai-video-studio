// Suggested shots (D28): the guide's scene-building rules, any scene; made-up names.
import { describe, expect, it } from "vitest";
import { splitShot, suggestShots } from "../src/lib/domain/shotSuggest";
import { addMovementMarks, defaultPlan, shotSpecFor } from "../src/lib/domain/story";
import { designScene } from "../src/lib/domain/director";

const cast = ["ava", "ben", "cal"];
const name = (id: string) => id[0].toUpperCase() + id.slice(1);
const panels = [
  { action: "The rooftop bar at dusk, Ben and Cal waiting by the rail.", inFrame: ["ben", "cal"] },
  { action: "Ava walks in and joins them.", inFrame: ["ava", "ben", "cal"] },
  { action: "Ava greets Ben.", inFrame: ["ava", "ben"], speaker: "ava", line: "You made it." },
  { action: "Ben answers.", inFrame: ["ava", "ben"], speaker: "ben", line: "Wouldn't miss it for anything." },
  { action: "Ava hears the news, stunned.", inFrame: ["ava"], speaker: "ava", line: "No.", emotion: "shocked" },
  { action: "Cal reads the letter.", inFrame: ["cal"] },
  { action: "Ben kneels, helpless, begging her to stay.", inFrame: ["ben"] },
  { action: "Ava walks away across the roof.", inFrame: ["ava"] },
  { action: "Close-up on Cal.", inFrame: ["cal"] },
];
const shots = panels.map((p, i) => ({
  id: `s${i}`, code: `P${i + 1}`, description: p.action,
  spec: { ...shotSpecFor({ action: p.action, inFrame: p.inFrame, line: p.line ?? "", emotion: p.emotion ?? "calm", seconds: 3, speaker: p.speaker } as never, { code: `P${i + 1}`, venueName: "roof", castIds: cast }), speakerId: p.speaker, dialogue: p.line, emotion: p.emotion, subjectId: p.speaker ?? p.inFrame[0] },
}));

describe("Suggested shots (D28)", () => {
  const s = suggestShots(shots as never, name);
  it.each([
    [0, /^establishing shot/],
    [1, /full shot.*tracking shot/],
    [2, /two-shot/],
    [3, /over-the-shoulder shot/],
    [4, /^close-up.*push-in/],
    [5, /insert shot/],
    [6, /high angle/],
    [7, /^long shot/],
  ])("panel %i", (k, re) => { expect(s[k as number].shot).toMatch(re); expect(s[k as number].why.length).toBeGreaterThan(10); });
  it("a panel that names its own shot keeps it", () => {
    expect(s[8].shot).toBe("");
    expect(s[8].why).toContain("already names");
  });
  it("no two shots in a row the same size", () => {
    const sizes = s.map((x) => x.shot.split(",")[0]).filter(Boolean);
    for (let k = 1; k < sizes.length; k++) if (!/over-the-shoulder/.test(s[k].shot)) expect(sizes[k]).not.toBe(sizes[k - 1]);
  });
  it("splits shot words back into shot, angle and move", () => {
    expect(splitShot("medium close-up, reaction shot, low angle, slow push-in")).toEqual({ shot: "medium close-up, reaction shot", angle: "low angle", move: "slow push-in" });
  });
  it("the camera chooser follows a chosen shot", () => {
    const staging = { spot: "standing at the rail of a rooftop bar", props: [], crowd: "", crowdLevel: "none" as const };
    const ps = panels.map((p) => ({ ...p, line: p.line ?? "", emotion: "calm", seconds: 3 }));
    const base = defaultPlan(cast, ps as never, [{ name: "skyline", directionDeg: 90 }], staging, "16:9");
    const { plan } = addMovementMarks(base, ps.map((p) => ({ action: p.action, subjectId: p.inFrame[0] })));
    const withShot = shots.map((x, i) => i === 5 ? { ...x, spec: { ...x.spec, shot: "medium shot, low angle, Dutch angle", shotBy: "you" as const } } : x);
    const d = designScene(plan, withShot as never, name);
    const c = d.shots[5].options[0].camera;
    expect(c.size).toBe("ms");
    expect(c.tiltDeg!).toBeGreaterThan(0);
    expect(c.rollDeg).toBe(20);
  });
});
