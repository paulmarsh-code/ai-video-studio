// The blocking frame and corrections (D34): any scene; made-up names.
import { describe, expect, it } from "vitest";
import { layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import { blockingInstruction } from "../src/lib/domain/imagePrompts";
import { correctionPrompt, judgePicture } from "../src/lib/domain/pictureCheck";
import { parseHeldItems } from "../src/lib/heldItemsServer";
import { movesFor } from "../src/lib/blockingImage";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 1, y: 5 } }, { characterId: "ben", position: { x: -1, y: 5 } }],
  furniture: [{ id: "t", name: "cocktail table", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 1.1 }],
  cameras: [], views: [{ name: "screen wall", directionDeg: 90 }, { name: "main entrance", directionDeg: 270 }],
  lineOfAction: ["ava", "ben"] as [string, string],
};
const front = { id: "c", name: "c", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 70 };
const back = { id: "c2", name: "c2", preset: "wide" as const, position: { x: 0, y: 9 }, lookAt: { x: 0, y: 5 }, fovDeg: 70 };
const people = [{ id: "ava", name: "Ava Stone" }, { id: "ben", name: "Ben" }];

describe("Blocking frame (D34)", () => {
  it("is see-through: stand-ins with names and facing, no room drawn", () => {
    const svg = layoutSketchSvg({ plan, camera: front, people, size: "portrait", overlay: true });
    expect(svg).not.toContain('fill="#fafafa"');
    expect(svg).toContain(">AVA<");
    expect(svg).toMatch(/SIDE-ON, FACING (LEFT|RIGHT)|FACING CAMERA/);
  });
  it("marks a held item on the mirrored side for someone facing us, and the same side from behind", () => {
    const held = { ava: [{ side: "left" as const, what: "tan satchel", where: "hand" }] };
    const facingUs = { ...plan, actors: [{ characterId: "ava", position: { x: 0, y: 5 } }] };
    // Ava faces the camera in the first plan if she looks towards it: use moves to point her.
    const svgF = layoutSketchSvg({ plan: facingUs, camera: front, people: [people[0]], size: "portrait", overlay: true, moves: { ava: { x: 0, y: 2 } }, held });
    const svgB = layoutSketchSvg({ plan: facingUs, camera: front, people: [people[0]], size: "portrait", overlay: true, moves: { ava: { x: 0, y: 8 } }, held });
    const tagX = (svg: string) => Number(svg.match(/<rect x="([\d.]+)"[^>]*fill="#fef3c7"/)![1]);
    expect(svgF).toContain("FACING CAMERA");
    expect(svgB).toContain("BACK TO CAMERA");
    // Facing us, her left hand is on the right of the picture; from behind, on the left.
    expect(tagX(svgF)).toBeGreaterThan(384);
    expect(tagX(svgB)).toBeLessThan(384);
    expect(svgF).toContain(">SATCHEL<");
  });
  it("draws a walking arrow for anyone on the move", () => {
    const svg = layoutSketchSvg({ plan, camera: front, people, size: "portrait", overlay: true, moves: { ava: { x: 1, y: 8 } } });
    expect(svg).toContain("WALKING THIS WAY");
  });
  it("arrivals head for their place; someone walking off heads for the way out", () => {
    const shotPlan = { actors: [{ characterId: "ava", position: { x: 3, y: 2 } }, { characterId: "ben", position: { x: -1, y: 5 } }] };
    expect(movesFor(plan, { at: { ava: "arriving" }, visibleIds: ["ava"] }, shotPlan, "Ava walks in.")).toEqual({ ava: { x: 1, y: 5 } });
    const off = movesFor(plan, { speakerId: "ben", visibleIds: ["ben"] }, plan, "Ben turns away and walks off.");
    expect(off.ben.y).toBeLessThan(5); // the entrance is at 270°, towards -y
  });
  it("the instruction makes image 1 the shot to finish, and references only for looks", () => {
    const t = blockingInstruction(["Ava reference", "cocktail table picture"]);
    expect(t).toMatch(/^IMAGE 1 IS THIS SHOT/);
    expect(t).toContain("Remove every stand-in outline, label, arrow and tag");
    expect(t).toContain("never for where anyone stands");
  });
});

describe("Held items and corrections (D34)", () => {
  it("reads held items from a front picture as picture sides and mirrors them to the character's own side", () => {
    expect(parseHeldItems('{"items":[{"what":"tan satchel","picture_side":"right","where":"hand"},{"what":"phone","picture_side":"left","where":"hand"}]}')).toEqual([
      { what: "tan satchel", side: "left", where: "hand" }, { what: "phone", side: "right", where: "hand" }]);
    expect(parseHeldItems("no json")).toEqual([]);
  });
  it("judges a held item on the wrong side of the picture", () => {
    const e = { order: ["Ava"], props: [], crowd: "none" as const, held: [{ name: "Ava", item: "satchel", side: "left" as const }] };
    const bad = judgePicture(e, JSON.stringify({ left_to_right: ["Ava"], held: [{ name: "Ava", item: "tan satchel", picture_side: "right" }] }));
    expect(bad.pass).toBe(false);
    expect(bad.problems.join(" ")).toContain("Ava's satchel is on the right of the picture; it belongs on the left");
    expect(judgePicture(e, JSON.stringify({ left_to_right: ["Ava"], held: [{ name: "Ava", item: "satchel", picture_side: "left" }] })).pass).toBe(true);
  });
  it("a correction edits the picture, fixing only what's listed", () => {
    const t = correctionPrompt(["Ava's satchel is on the right of the picture; it belongs on the left."], true);
    expect(t).toMatch(/^Edit image 1/);
    expect(t).toContain("Image 2 is the approved shot");
    expect(t).toContain("change nothing else");
  });
});
