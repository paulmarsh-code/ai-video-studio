// "Start from a picture or a one-line idea": prompts and reply parsing (D16).

import { describe, expect, it } from "vitest";
import { characterDescribePrompt, characterFillFromReply, cleanReply, descriptionOnly, venueDescribePrompt, venueFillFromReply } from "../src/lib/domain/describe";
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

  it("personality from the user drives mannerisms and voice; left out when empty", () => {
    const p = characterDescribePrompt("image", "", "dry, deadpan humour; talks with her hands");
    expect(p).toContain("Personality and mannerisms: dry, deadpan humour; talks with her hands. Use this for MANNERISMS and SUGGESTED VOICE");
    expect(characterDescribePrompt("image")).not.toContain("Personality and mannerisms:");
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
  it("atmosphere from the user drives setting and light; left out when empty", () => {
    expect(venueDescribePrompt("image", "", "outdoors, late evening, warm festoon lights")).toContain("Setting, atmosphere, light and time of day: outdoors, late evening, warm festoon lights.");
    expect(venueDescribePrompt("image")).not.toContain("Setting, atmosphere");
  });

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

describe("Asking for a change", () => {
  it("character change prompt carries the saved description, the change only, and the full reply format", async () => {
    const { characterChangePrompt } = await import("../src/lib/domain/describe");
    const p = characterChangePrompt({ appearance: "Dark bob.", wardrobe: "Orange dress.", anchors: ["bob", "cat-eye liner"] }, 'make the "dress" lilac');
    expect(p).toContain("Change only this: make the dress lilac");
    expect(p).toContain("APPEARANCE: Dark bob.");
    expect(p).toContain("IDENTITY ANCHORS: bob; cat-eye liner");
    expect(p).toContain("AGE RANGE:");
    expect(p).toContain("three equal vertical panels");
    expect(p).toContain("not a single picture of the person");
    expect(p).toContain("same three-panel layout as the attached board");
    expect(p).not.toMatch(/["“”]/);
  });

  it("the reply to a change prompt fills the fields like any other", async () => {
    const f = characterFillFromReply(REPLY.replace("tangerine centre panel", "lilac centre panel"));
    expect(f.wardrobe).toContain("lilac centre panel");
  });

  it("image change prompt asks for an edit of the attached image and repeats the brief", async () => {
    const { imageChangePrompt } = await import("../src/lib/domain/imagePrompts");
    const p = imageChangePrompt("remove the handbag", "FRONT VIEW: reference image of Jade.");
    expect(p.startsWith("Edit the attached image.")).toBe(true);
    expect(p).toContain("Change only this: remove the handbag");
    expect(p).toContain("FRONT VIEW: reference image of Jade.");
  });
});

describe("Direct GPT link (D17)", () => {
  it("splits a describe prompt into the text part and a board prompt", async () => {
    const { descriptionOnly, characterBoardPrompt, venueBoardPrompt } = await import("../src/lib/domain/describe");
    const full = characterDescribePrompt("image", "", "dry wit");
    const textPart = descriptionOnly(full);
    expect(textPart).toContain("IDENTITY ANCHORS:");
    expect(textPart).not.toContain("Step 2");
    expect(textPart).not.toContain("three equal vertical panels");
    const board = characterBoardPrompt("HAIR: dark bob");
    expect(board.startsWith("Draw this character exactly as described:\nHAIR: dark bob")).toBe(true);
    expect(board).toContain("Create ONE photorealistic image: a character reference board");
    expect(board).not.toContain("Step 2");
    expect(venueBoardPrompt("PLACE: bar", ["skyline", "bar", "lobby", "lounge"])).toContain("Top-left: looking towards the skyline");
  });
});

describe("Reference pictures for changes", () => {
  it("change prompt says what each picture is for and not to copy faces", async () => {
    const { characterChangePrompt, characterBoardPrompt } = await import("../src/lib/domain/describe");
    const p = characterChangePrompt({ appearance: "Dark bob." }, "What they wear: like the attached", [{ for: "What they wear" }]);
    expect(p).toContain("Also attached: one reference picture after the current board, in this order: 1. what they wear.");
    expect(p).toContain("Do not copy the face, body or identity of anyone in a reference picture");
    expect(characterChangePrompt({ appearance: "x" }, "y")).not.toContain("reference picture");
    expect(characterBoardPrompt("HAIR: bob", "photorealistic", [{ for: "What they wear" }, { for: "How they look" }])).toContain("The last 2 input images are references for: what they wear; how they look.");
  });
});

describe("Replies with a drawing attached", () => {
  it("drops SVG or code that a model adds after the description", () => {
    const reply = [
      "APPEARANCE: tall, dark curly hair",
      "WARDROBE: forest-green jacket",
      "MANNERISMS: taps the bar when thinking",
      "VOICE: Mid-Atlantic, measured, dry wit, pacing deliberate",
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200"><rect x="0" y="0"/></svg>',
    ].join("\n");
    const fill = characterFillFromReply(reply);
    expect(fill.voice).toBe("Mid-Atlantic, measured, dry wit, pacing deliberate.");
    expect(JSON.stringify(fill)).not.toMatch(/svg|rect|xml/);
    expect(cleanReply("VOICE: calm\n```svg\n<svg/>\n```")).toBe("VOICE: calm");
  });
  it("tells the text model not to draw", () => {
    expect(descriptionOnly("Describe them.\nStep 2: draw")).toMatch(/Do not draw anything/);
  });
});

describe("Reference pictures are sent small (D18b)", () => {
  it("shrinks a large PNG to a JPEG no larger than 1024 px, and leaves non-images alone", async () => {
    const sharp = (await import("sharp")).default;
    const { shrinkRef } = await import("../src/lib/providers/images");
    const big = await sharp({ create: { width: 1536, height: 2304, channels: 3, background: { r: 200, g: 120, b: 80 } } }).png({ compressionLevel: 0 }).toBuffer();
    const r = await shrinkRef({ data: big, mime: "image/png", name: "jade_front.png" });
    const meta = await sharp(r.data).metadata();
    expect(r.mime).toBe("image/jpeg");
    expect(r.name).toBe("jade_front.jpg");
    expect(Math.max(meta.width!, meta.height!)).toBe(1024);
    expect(r.data.length).toBeLessThan(big.length / 10);
    const pdf = { data: Buffer.from("%PDF-1.4 not an image"), mime: "application/pdf", name: "consent.pdf" };
    expect(await shrinkRef(pdf)).toBe(pdf);
  });
});
