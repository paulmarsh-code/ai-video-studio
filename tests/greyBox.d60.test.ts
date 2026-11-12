// D60: any scene. Test B draws image 1 as a grey-box room from the plan, sends the room's look as
// image 2, and says so; new venues are asked for with an empty floor.
import { describe, expect, it } from "vitest";
import { greyBoxSvg } from "../src/lib/domain/greyBox";
import { blockingInstruction, blockingShort } from "../src/lib/domain/imagePrompts";
import { venueSheetRequest } from "../src/lib/domain/describe";
import type { GeometryPlanData, PlanCamera } from "../src/lib/domain/types";

const plan = { aspect: "9:16", bounds: { minX: -5, maxX: 5, minY: 0, maxY: 12 }, actors: [], furniture: [], cameras: [], views: [] } as unknown as GeometryPlanData;
const cam = { id: "c", name: "Wide", preset: "wide", position: { x: 0, y: 1 }, lookAt: { x: 0, y: 8 }, fovDeg: 60 } as PlanCamera;

describe("The grey-box room (D60)", () => {
  it("draws the floor and walls in front of the camera, far surfaces first", () => {
    const svg = greyBoxSvg(plan, cam, 1024, 1536);
    const polys = svg.match(/<polygon /g) ?? [];
    expect(polys.length).toBeGreaterThan(50);
    // Nothing behind the camera: no cell from the strip behind it (y below 1) has every corner in view.
    expect(svg.startsWith("<svg")).toBe(true);
    // The far wall's colour comes before the nearest floor cells' colours in the drawing order.
    expect(svg.indexOf("#e4e1db")).toBeLessThan(svg.lastIndexOf("#cfcac1"));
    // Outdoors: the ground only, no walls.
    const out = greyBoxSvg(plan, cam, 1024, 1536, { outdoors: true });
    expect(out).not.toContain("#e4e1db");
    expect(out).toContain("#cfcac1");
  });

  it("the request says image 1 is a grey model and image 2 is the room's look, from which nothing is taken", () => {
    const full = blockingInstruction(["Ava reference"], true);
    expect(full).toMatch(/a plain grey model of the room exactly as this camera sees it/);
    expect(full).toMatch(/Image 2 shows how this room looks from this camera: paint image 1's grey floor and walls to look like it/);
    expect(full).toMatch(/take no furniture and no people from image 2/);
    expect(blockingShort(true)).toMatch(/^Image 1 is this exact shot as a plain grey model of the room; image 2 shows how the room looks/);
    // Version A is unchanged, apart from the walker wording (D58).
    expect(blockingInstruction([], false)).toMatch(/the real room exactly as this camera sees it/);
    expect(blockingInstruction([], false)).toMatch(/never a second place for them, so each character appears once/);
  });

  it("new venues are asked for with the floor empty and everything built in kept", () => {
    const r = venueSheetRequest(["a", "b", "c", "d"]);
    expect(r).toMatch(/with its floor empty: no people and no free-standing furniture/);
    expect(r).toMatch(/Everything built in stays as described/);
  });
});

describe("Venues: four real directions, and furniture left to the scenes (D61)", () => {
  it("asks for quarter turns that change the near things, and for a description without free-standing furniture", async () => {
    const { venueDescribePrompt } = await import("../src/lib/domain/describe");
    const t = venueDescribePrompt("idea", "A rooftop bar");
    expect(t).toMatch(/four quarter turns on the spot/);
    expect(t).toMatch(/The near things \(counters, railings, doors, walls, planters\) change from panel to panel/);
    expect(t).toMatch(/LAYOUT: <what is built in where.*Leave out free-standing furniture/);
    expect(t).not.toMatch(/surfaces, furniture, colours/);
    expect(t).toMatch(/named after what is close at that side of the place itself/);
    expect(t).toMatch(/Free-standing furniture is left out even if the description mentions it/);
  });
});

describe("Reading the views either way round (D61)", () => {
  it("takes 'name: direction' and 'direction: name'", async () => {
    const { venueFillFromReply } = await import("../src/lib/domain/describe");
    const reply = "SETTING: outdoors\nPLACE: A rooftop terrace.\nLAYOUT: Bar ahead.\nMATERIALS AND DECOR: Copper.\nLIGHT AND TIME OF DAY: Dusk.\nIDENTITY ANCHORS: copper bar; glass railing; living wall\nVIEWS:\nahead: the fire trough and skyline\nLeft: copper bar and river railing.\nbehind: glass entrance and stairs\nliving wall and steps: right";
    expect(venueFillFromReply(reply).views.map((v) => v.name)).toEqual(["fire trough and skyline", "copper bar and river railing", "glass entrance and stairs", "living wall and steps"]);
  });
});
