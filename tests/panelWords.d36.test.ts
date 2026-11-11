// Positions from the panels' words (D36): any scene; made-up names and places.
import { describe, expect, it } from "vitest";
import { blockingFromWords } from "../src/lib/domain/panelWords";
import { carryBlocking } from "../src/lib/domain/blocking";
import { planForShot } from "../src/lib/domain/geometry";
import type { GeometryPlanData, ShotSpec } from "../src/lib/domain/types";

const people = [{ id: "aron", name: "Aron Hale" }, { id: "mia", name: "Mia" }, { id: "dad", name: "Dad" }];
const kitchen: GeometryPlanData = {
  bounds: { minX: -2.25, maxX: 2.25, minY: 0, maxY: 5.5 },
  actors: [{ characterId: "aron", position: { x: 0.8, y: 2.7 } }, { characterId: "mia", position: { x: -0.8, y: 2.7 } }, { characterId: "dad", position: { x: 0, y: 3.4 } }],
  furniture: [{ id: "t", name: "kitchen table", position: { x: 0, y: 2.7 }, radiusM: 0.6 }, { id: "mug", name: "mug", position: { x: 0.3, y: 2.7 }, radiusM: 0.05 }],
  cameras: [], lineOfAction: ["aron", "mia"],
  views: [{ name: "kitchen window", directionDeg: 90 }, { name: "hall door", directionDeg: 0 }, { name: "fridge", directionDeg: 180 }, { name: "cooker", directionDeg: 270 }],
};
const P = (action: string, subjectId?: string, visibleIds: string[] = ["aron", "mia", "dad"]) => ({ action, subjectId, visibleIds });
const near = (a: { x: number; y: number } | undefined, b: { x: number; y: number }, d = 0.6) => !!a && Math.hypot(a.x - b.x, a.y - b.y) <= d;

describe("Positions from the words (D36)", () => {
  it("someone who leaves walks to the way out, and is gone from later panels until they're back", () => {
    const out = blockingFromWords(kitchen, [P("The family chat over breakfast."), P("Aron leaves the kitchen and goes upstairs.", "aron"), P("Mia and Dad carry on talking.", "mia", ["mia", "dad"]), P("Aron comes back and sits at the table.", "aron")], people);
    expect(out[0]).toEqual({});
    expect(out[1].aron.to!.x).toBeGreaterThan(1.5); // the hall door is at 0°, towards +x
    expect(out[1].aron.why).toBe("walks off");
    expect(out[2].aron).toMatchObject({ gone: true });
    expect(out[3].aron.gone).toBeUndefined();
    // Gone from the panel's plan: not drawn, not in the prompts.
    const specs = carryBlocking(out.map((b) => ({ spec: { blocking: b } as unknown as ShotSpec })));
    expect(planForShot(kitchen, specs[2]).actors.map((a) => a.characterId)).toEqual(["mia", "dad"]);
  });
  it("lying on a bed and taking out a phone: on the bed, phone in hand, and both carry on", () => {
    const bedroom: GeometryPlanData = {
      bounds: { minX: -2.25, maxX: 2.25, minY: 0, maxY: 5.5 },
      actors: [{ characterId: "aron", position: { x: -1.5, y: 1 } }],
      furniture: [{ id: "bed", name: "single bed", position: { x: 1, y: 4 }, radiusM: 1 }, { id: "phone", name: "phone", position: { x: 1.8, y: 4.6 }, radiusM: 0.05 }, { id: "lap", name: "laptop", position: { x: -1.6, y: 4.8 }, radiusM: 0.2 }],
      cameras: [], views: [{ name: "bedroom door", directionDeg: 270 }, { name: "window", directionDeg: 90 }],
    };
    const out = blockingFromWords(bedroom, [P("Aron lies on his bed and takes out his phone.", "aron", ["aron"]), P("He scrolls, bored.", "aron", ["aron"])], people);
    expect(out[0].aron.at).toEqual({ x: 1, y: 4 });
    expect(out[0]["prop:phone"]).toMatchObject({ with: "aron" });
    const specs = carryBlocking(out.map((b) => ({ spec: { blocking: b } as unknown as ShotSpec })));
    const p2 = planForShot(bedroom, specs[1]);
    expect(p2.actors[0].position).toEqual({ x: 1, y: 4 });
    expect(p2.furniture?.find((f) => f.id === "phone")).toMatchObject({ heldBy: "aron" });
    expect(near(p2.furniture?.find((f) => f.id === "phone")?.position, { x: 1, y: 4 }, 0.3)).toBe(true);
  });
  it("going to a place, to someone, and turning", () => {
    const out = blockingFromWords(kitchen, [P("Mia walks over to the kitchen window.", "mia"), P("Dad turns to Mia.", "dad"), P("Aron crosses to Mia.", "aron"), P("Mia turns away from Aron.", "mia")], people);
    expect(out[0].mia.to!.y).toBeGreaterThan(4); // the window wall is at 90°, +y
    expect(out[1].dad.facingDeg).toBeDefined();
    const toMia = Math.atan2(out[0].mia.to!.y - 3.4, out[0].mia.to!.x - 0) * 180 / Math.PI;
    expect(Math.abs(out[1].dad.facingDeg! - toMia)).toBeLessThan(2);
    expect(near(out[2].aron.to, out[0].mia.to!, 1.0)).toBe(true);
    expect(out[3].mia.facingDeg).toBeDefined();
  });
  it("picking up and putting down a prop", () => {
    const out = blockingFromWords(kitchen, [P("Dad picks up the mug.", "dad"), P("He puts it down on the kitchen window sill.", "dad")], people);
    expect(out[0]["prop:mug"]).toMatchObject({ with: "dad" });
    expect(out[1]["prop:mug"].with).toBeUndefined();
  });
  it("nothing from looks, chat or the camera; the user's own placement wins", () => {
    const out = blockingFromWords(kitchen, [P("Mia and Dad exchange glances."), P("Aron faces the camera and smiles.", "aron"), P("Aron walks off.", "aron")], people);
    expect(out[0]).toEqual({});
    expect(out[1]).toEqual({});
    const own = blockingFromWords(kitchen, [{ ...P("Aron walks off.", "aron"), own: { aron: { at: { x: 0, y: 1 }, by: "you" as const } } }], people);
    expect(own[0].aron).toBeUndefined();
  });
  it("turning to someone and then walking off faces the way they walk", () => {
    const out = blockingFromWords(kitchen, [P("Aron turns to Mia, then walks off.", "aron")], people);
    expect(out[0].aron.to).toBeDefined();
    expect(out[0].aron.facingDeg).toBeUndefined();
  });
});

describe("Cameras and walks (D36)", () => {
  it("no camera stands in the path of someone walking during the panel", async () => {
    const { designScene } = await import("../src/lib/domain/director");
    const plan: GeometryPlanData = { ...kitchen, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, actors: [{ characterId: "aron", position: { x: 0.8, y: 5 } }, { characterId: "mia", position: { x: -0.8, y: 5 } }], furniture: [], views: [{ name: "hall door", directionDeg: 270 }, { name: "window", directionDeg: 90 }] };
    const spec = { code: "S_1", visibleIds: ["aron", "mia"], excludedIds: [], presentIds: ["aron", "mia"], audioMode: "off", durationSec: 4, emotion: "", subjectId: "aron", blocking: { aron: { at: { x: 0.8, y: 5 }, to: { x: 0.8, y: 0.3 }, by: "app" } } } as unknown as ShotSpec;
    const d = designScene(plan, [{ id: "s1", code: "S_1", spec, description: "Aron walks off." }], (id) => id);
    expect(d.shots[0].options.length).toBeGreaterThan(0);
    for (const o of d.shots[0].options) {
      const c = o.camera.position;
      const t = Math.max(0, Math.min(1, (5 - c.y) / 4.7));
      expect(Math.hypot(c.x - 0.8, c.y - (5 - 4.7 * t))).toBeGreaterThanOrEqual(0.9);
    }
  });
});
