// D109: characters are never mixed up. Each reference carries its person's name, the check looks
// for one person drawn with another's face, clothes or things, and a mix-up is never approvable.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { withNameBanner } from "../src/lib/namedRefs";
import { judgePicture, MIXED_UP } from "../src/lib/domain/pictureCheck";

describe("Characters linked to their names (D109)", () => {
  it("a reference gets its first name in capitals above it", async () => {
    const pic = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#888" } }).png().toBuffer();
    const out = await sharp(await withNameBanner(pic, "Jade Okafor")).metadata();
    expect(out.width).toBe(400);
    expect(out.height).toBeGreaterThan(600);
  });
  it("one character with another's things fails the picture and asks for a redraw", () => {
    const e = { order: ["Jade", "Nina"], props: [], crowd: "none" as const };
    const r = judgePicture(e as never, JSON.stringify({ left_to_right: ["Jade", "Nina"], mixed_up: ["Nina is holding Jade's satchel"] }));
    expect(r.pass).toBe(false);
    expect(r.redraw).toBe(true);
    expect(r.problems.join(" ")).toContain(`${MIXED_UP} Nina is holding Jade's satchel.`);
    expect(judgePicture(e as never, JSON.stringify({ left_to_right: ["Jade", "Nina"], mixed_up: [] })).problems.join(" ")).not.toContain(MIXED_UP);
  });
});

describe("Props named like characters (D110)", () => {
  it("a prop's picture is labelled with its whole name", async () => {
    const pic = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#888" } }).png().toBuffer();
    expect((await sharp(await withNameBanner(pic, "the cocktail table")).metadata()).height).toBeGreaterThan(300);
  });
});
