// "Start from a picture or a one-line idea": prompts and reply parsing (D16).

import { describe, expect, it } from "vitest";
import { characterDescribePrompt, characterFillFromReply, venueDescribePrompt, venueFillFromReply } from "../src/lib/domain/describe";
import { characterRefPrompt } from "../src/lib/domain/imagePrompts";

const REPLY = `**AGE RANGE:** mid-twenties
**BUILD AND HEIGHT:** slim, about 165 cm, upright posture
- FACE: soft oval face, small straight nose, knowing half-smile
- HAIR: glossy dark chocolate-brown chin-length bob
  with a short blunt fringe
SKIN: fair with light freckles
EYES: warm brown, almond-shaped
MAKE-UP AND GROOMING: black cat-eye liner, pearl studs
OUTFIT: sleeveless A-line mini shift dress, tangerine centre panel, ivory sides; cropped cream bouclé jacket; black patent Mary Janes
ACCESSORIES: tan leather top-handle satchel
COLOUR PALETTE: tangerine, ivory, cream, black
IDENTITY ANCHORS: chin-length bob with blunt fringe; cat-eye liner; tangerine-and-ivory shift dress; tan satchel
MANNERISMS: composed, observant, still hands
SUGGESTED VOICE: warm, quick London voice, quietly amused`;

describe("Character describe prompts", () => {
  it("picture prompt asks for a likeness, not a copy, and flags known people", () => {
    const p = characterDescribePrompt("image");
    expect(p).toContain("a likeness, not a copy");
    expect(p).toContain("KNOWN: yes");
    expect(p).toContain("IDENTITY ANCHORS:");
    expect(p).toContain("Do not use brand names");
    expect(p).not.toMatch(/["“”]/);
  });

  it("idea prompt carries the one-liner without quote marks", () => {
    const p = characterDescribePrompt("idea", 'a "sharp" 1960s-style PR exec');
    expect(p).toContain("a sharp 1960s-style PR exec");
    expect(p).not.toMatch(/["“”]/);
  });
});

describe("Parsing ChatGPT's reply", () => {
  it("fills the character fields, tolerating markdown, bullets and wrapped lines", () => {
    const f = characterFillFromReply(REPLY);
    expect(f.missing).toEqual([]);
    expect(f.appearance).toContain("Glossy dark chocolate-brown chin-length bob with a short blunt fringe.");
    expect(f.appearance).toContain("Warm brown, almond-shaped eyes.");
    expect(f.wardrobe).toContain("Tan leather top-handle satchel.");
    expect(f.wardrobe).toContain("Colour palette: tangerine, ivory, cream, black.");
    expect(f.anchors).toEqual(["chin-length bob with blunt fringe", "cat-eye liner", "tangerine-and-ivory shift dress", "tan satchel"]);
    expect(f.voice).toBe("Warm, quick London voice, quietly amused.");
    expect(f.known).toBe(false);
  });

  it("ignores ChatGPT's chat around the image", () => {
    const f = characterFillFromReply(`Step 1\n${REPLY}\nHere is the reference sheet you asked for.\n[image]`);
    expect(f.voice).toBe("Warm, quick London voice, quietly amused.");
    const g = characterFillFromReply(`${REPLY}\nStep 2: generating the sheet now\nOUTFIT: something else`);
    expect(g.wardrobe).not.toContain("something else");
  });

  it("asks for one reference sheet image with the views in a fixed layout", () => {
    const p = characterDescribePrompt("image");
    expect(p).toContain("three equal vertical panels");
    expect(p).toMatch(/Left panel: front view[\s\S]*Middle panel: back view[\s\S]*Right panel: face close-up/);
    expect(venueDescribePrompt("idea", "rooftop bar")).toContain("2 by 2 grid");
  });

  it("reports missing fields and a known-person flag", () => {
    const f = characterFillFromReply("KNOWN: yes\nHAIR: short grey crop");
    expect(f.known).toBe(true);
    expect(f.missing).toContain("OUTFIT");
    expect(f.appearance).toBe("Short grey crop.");
  });

  it("anchors reach the reference prompts", () => {
    const f = characterFillFromReply(REPLY);
    const p = characterRefPrompt("Jade", { appearance: f.appearance, wardrobe: f.wardrobe, anchors: f.anchors }, "back");
    expect(p).toContain("Identity anchors, which must match exactly: chin-length bob with blunt fringe; cat-eye liner");
  });
});

describe("Venue describe", () => {
  it("picture prompt removes people and brand signs", () => {
    const p = venueDescribePrompt("image");
    expect(p).toContain("Leave out any people");
    expect(p).toContain("VIEWS:");
  });

  it("parses setting, description, anchors and the four views", () => {
    const f = venueFillFromReply(`SETTING: outdoors
PLACE: a shingle beach on an English seafront at dusk
LAYOUT: the pier ahead, beach huts to the left, the promenade behind
MATERIALS AND DECOR: grey shingle, weathered timber groynes
LIGHT AND TIME OF DAY: low warm sun, pink sky
IDENTITY ANCHORS: Victorian pier; striped beach huts
VIEWS:
pier: ahead
beach huts: left
promenade cafés: behind
the sea: right`);
    expect(f.setting).toBe("exterior");
    expect(f.description).toContain("A shingle beach on an English seafront at dusk.");
    expect(f.description).toContain("Signature features that must match in every view: Victorian pier; striped beach huts.");
    expect(f.views).toEqual([
      { name: "pier", directionDeg: 90 },
      { name: "beach huts", directionDeg: 180 },
      { name: "promenade cafés", directionDeg: 270 },
      { name: "sea", directionDeg: 0 },
    ]);
    expect(f.missing).toEqual([]);
  });
});
