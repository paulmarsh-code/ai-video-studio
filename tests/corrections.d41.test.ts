// Corrections send only what they need (D41): the picture, the blocking frame, and the
// references of the people and props the problems name. Made-up names.
import { describe, expect, it } from "vitest";
import { correctionRefs } from "../src/lib/domain/pictureCheck";

const attach = [
  { label: "blocking frame (the shot to finish)", assetId: "", href: "/api/blocking/s1" },
  { label: "Ava Stone reference", assetId: "ava-front" }, { label: "Ava Stone back", assetId: "ava-back" },
  { label: "Ben Cole reference", assetId: "ben-front" }, { label: "Cal reference", assetId: "cal-front" },
  { label: "cocktail table picture", assetId: "table" }, { label: "approved scene picture (panel 2)", assetId: "anchor" },
  { label: "bar view", assetId: "bar" },
];

describe("Corrections send only the references they need (D41)", () => {
  it("the people and props a problem names", () => {
    expect(correctionRefs(["Ava's satchel is on the left of the picture; move it to the right side.", "The table doesn't look like its picture: no cloth."], attach)).toEqual(["ava-front", "ava-back", "table"]);
  });
  it("someone missing gets their reference", () => {
    expect(correctionRefs(["Ben Cole is missing; he stands frame-left."], attach)).toEqual(["ben-front"]);
  });
  it("a problem about the room alone needs no references", () => {
    expect(correctionRefs(["The room is the wrong way round: the bar belongs on the left.", "No background people, but the scene has them."], attach)).toEqual([]);
  });
  it("short or partial words don't match by accident", () => {
    expect(correctionRefs(["Calm the lighting down."], attach)).toEqual([]);
  });
});
