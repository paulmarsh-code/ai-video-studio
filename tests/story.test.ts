// Story to storyboard (D18), tested with Paul's Glowvane scene as he wrote it.

import { describe, expect, it } from "vitest";
import { checkStoryboard, defaultPlan, estimateStory, MAX_LINE_WORDS, parseStoryReply, quotedLines, shotSpecFor, storyPrompt } from "../src/lib/domain/story";

export const GLOWVANE_STORY = `Jade is attending the product launch for glowvane she wrote the campaign and its a big night for her and she is excited , lots of industry people will be there and it could lead to more work.

She walks in to the venue and she is going to get a drink then mingle

As she walks through the venue she sees Chase and a couple collegues Chase is the Marketing director who was part of the hiring team who hired her, he is a bit full of himself and jades does not like him much but she needs to be prof and friendly

Jade greets the group and compleiments on the event and asks Chase what he thinks of the promo she made

Chase is showing off and being a bit of an arse and says 'Ive seen better'

The collegues look shocked as the promo has been a great success

That riles Jade who cant help her self and says "that figures why you havnt paid me yet and its past 30 day"

Chase lies and says your wroog its 90 days

Jade is really pissed off now

Chase says i,m bored now run along and makes a dimissive wave away gesture

Jade is fuming and says unbeliveable then walks off before she says somehtinbg she regrets`;

const CAST = [
  { id: "jade", name: "Jade", role: "content creator" },
  { id: "chase", name: "Chase", role: "marketing director" },
  { id: "marcus", name: "Marcus", role: "colleague" },
  { id: "nina", name: "Nina", role: "colleague" },
];

const REPLY = `Here is the storyboard:

**PANEL 1**
ACTION: Jade walks into the busy Glowvane launch, smiling, heading for the bar.
IN FRAME: Jade
SPEAKER: none
LINE: none
EMOTION: excited
SECONDS: 4

PANEL 2
ACTION: Jade spots Chase with Marcus and Nina and joins them.
IN FRAME: Jade, Chase, Marcus and Nina
SPEAKER: Jade
LINE: Great event, everyone. Chase, what did you think of the promo?
EMOTION: friendly, professional
SECONDS: 5

PANEL 3
ACTION: Chase shrugs, showing off to the group.
IN FRAME: Chase, Jade
SPEAKER: Chase
LINE: "I've seen better."
EMOTION: smug
SECONDS: 3

PANEL 4
ACTION: Marcus and Nina exchange shocked looks.
IN FRAME: Marcus, Nina
SPEAKER: none
LINE: none
EMOTION: shocked
SECONDS: 3

PANEL 5
ACTION: Jade bristles.
IN FRAME: Jade
SPEAKER: Jade
LINE: That figures. Is that why you haven't paid me yet? It's past 30 days.
EMOTION: riled
SECONDS: 5

PANEL 6
ACTION: Chase waves her away with the back of his hand, and a waiter passes behind.
IN FRAME: Chase, Waiter
SPEAKER: Chase
LINE: I'm bored now. Run along.
EMOTION: dismissive
SECONDS: 3

PANEL 7
ACTION: Jade turns and walks off.
IN FRAME: Jade
SPEAKER: Jade
LINE: Unbelievable.
EMOTION: fuming
SECONDS: 3
<?xml version="1.0"?><svg/>`;

describe("Telling the story", () => {
  it("asks GPT for labelled panels with the guide rails and the cast", () => {
    const p = storyPrompt({ story: GLOWVANE_STORY, characters: CAST, venue: "GLOWVANE launch party", targetSec: 60 });
    expect(p).toContain("about 60 seconds");
    expect(p).toContain("Jade (content creator), Chase (marketing director)");
    expect(p).toContain("at most one person speaking");
    expect(p).toContain(`about ${MAX_LINE_WORDS} words`);
    expect(p).toContain("app chooses the cameras");
    expect(p).toMatch(/PANEL 1\nACTION:.*\nIN FRAME:.*\nSPEAKER:.*\nLINE:.*\nEMOTION:.*\nSECONDS:/);
    expect(p).toContain("walks off before she says somehtinbg she regrets"); // the story goes in as written
  });

  it("carries the project brief, so lines and reactions fit the whole video", () => {
    const p = storyPrompt({ story: "x", characters: CAST, venue: "v", targetSec: 30, sceneTitle: "Launch night",
      brief: { format: "Mini drama", parts: 4, partSec: 30, audience: "freelance creators on TikTok", outline: "A creator chases late payment from a dismissive brand.", genre: "Comedy" } });
    expect(p).toContain("About the video (for tone and context; storyboard only this scene):");
    expect(p).toContain("- Who it's for: freelance creators on TikTok");
    expect(p).toContain("- What it is: Mini drama, 4 parts of about 30 s, about 2 min in total");
    expect(p).toContain("- The whole story in outline: A creator chases late payment");
    expect(p).toContain("Scene: Launch night\n<<<");
    expect(storyPrompt({ story: "x", characters: CAST, venue: "v", targetSec: 30 })).not.toContain("About the video");
  });

  it("finds the spoken lines while typing, in any quote style", () => {
    expect(quotedLines(GLOWVANE_STORY)).toEqual(["Ive seen better", "that figures why you havnt paid me yet and its past 30 day"]);
    const e = estimateStory(GLOWVANE_STORY);
    expect(e.lines).toBe(2);
    expect(e.talkSec).toBeGreaterThan(5);
    expect(e.longLines).toBe(0);
    expect(estimateStory(`He says "${"word ".repeat(MAX_LINE_WORDS + 5)}"`).longLines).toBe(1);
    expect(quotedLines("Jade's bag isn't hers")).toEqual([]); // apostrophes are not quotes
  });
});

describe("Reading GPT's panels", () => {
  const r = parseStoryReply(REPLY, CAST);
  it("reads every panel, ignoring chat and drawing code", () => {
    expect(r.panels).toHaveLength(7);
    expect(r.panels[1].inFrame).toEqual(["jade", "chase", "marcus", "nina"]);
    expect(r.panels[1].speakerId).toBe("jade");
  });
  it("strips quote marks and sizes spoken clips to the line", () => {
    expect(r.panels[2].line).toBe("I've seen better.");
    expect(r.panels[2].seconds).toBe(3);
    expect(r.panels[4].seconds).toBeGreaterThanOrEqual(5);
  });
  it("keeps silent panels inside Kling's 3 to 15 seconds", () => {
    expect(r.panels[0]).toMatchObject({ speakerId: undefined, line: "", seconds: 4 });
    expect(parseStoryReply("PANEL 1\nACTION: x\nSECONDS: 1", CAST).panels[0].seconds).toBe(3);
    expect(parseStoryReply("PANEL 1\nACTION: x\nSECONDS: 40", CAST).panels[0].seconds).toBe(15);
  });
  it("flags names that aren't in the scene", () => {
    expect(r.unknownNames).toEqual(["Waiter"]);
    expect(r.panels[5].inFrame).toEqual(["chase"]);
  });
});

describe("Guide rails", () => {
  const panels = parseStoryReply(REPLY, CAST).panels;
  it("passes a good storyboard", () => {
    const c = checkStoryboard(panels, 30);
    expect(c.issues).toEqual([]);
    expect(c.totalSec).toBe(panels.reduce((s, p) => s + p.seconds, 0));
    expect(c.lengthNote).toBe("");
  });
  it("catches a line too long for one clip, a line with no speaker and quote marks", () => {
    const bad = [
      { ...panels[1], line: "word ".repeat(MAX_LINE_WORDS + 2).trim() },
      { ...panels[2], speakerId: undefined },
      { ...panels[4], line: 'She said "no"' },
    ];
    const texts = checkStoryboard(bad, 30).issues.map((i) => `${i.panel}: ${i.text}`);
    expect(texts[0]).toMatch(/^1: The line is \d+ words, too long for one 15-second clip/);
    expect(texts).toContain("2: Choose who says this line.");
    expect(texts).toContain("3: Remove the quote marks from the line.");
  });
  it("compares the total with the target", () => {
    expect(checkStoryboard(panels, 90).lengthNote).toMatch(/short of your 90 s target/);
    expect(checkStoryboard([...panels, ...panels], 10).lengthNote).toMatch(/longer than your 10 s target/);
  });
});

describe("From panels to shots and a first floor plan", () => {
  const panels = parseStoryReply(REPLY, CAST).panels;
  const ids = CAST.map((c) => c.id);
  it("builds each shot from who is seen and who speaks", () => {
    const s = shotSpecFor(panels[3], { code: "EP01_S02_P4", venueName: "Launch", castIds: ids });
    expect(s).toMatchObject({ visibleIds: ["marcus", "nina"], excludedIds: ["jade", "chase"], audioMode: "off", subjectId: "marcus", durationSec: 3 });
    const t = shotSpecFor(panels[2], { code: "EP01_S02_P3", venueName: "Launch", castIds: ids });
    expect(t).toMatchObject({ speakerId: "chase", dialogue: "I've seen better.", audioMode: "native-on" });
  });
  it("places the two main talkers facing each other, with the line of action between them", () => {
    const plan = defaultPlan(ids, panels, [{ name: "bar", directionDeg: 180 }]);
    expect(plan.actors).toHaveLength(4);
    expect(plan.actors[0].characterId).toBe("jade"); // most lines
    expect(plan.lineOfAction).toEqual(["chase", "jade"]);
    expect(plan.views).toEqual([{ name: "bar", directionDeg: 180 }]);
    expect(defaultPlan(["jade"], [], []).actors).toEqual([{ characterId: "jade", position: { x: 0, y: 5 } }]);
  });
});

describe("Projects, scenes and saving the storyboard", () => {
  it("creates a project and scene from nothing, then saves the story's panels with shots and a first floor plan", async () => {
    const { openDb } = await import("../src/db/client");
    const studio = await import("../src/lib/studioRepo");
    const repo = await import("../src/lib/repo");
    const db = await openDb(":memory:");
    const pid = studio.createProject(db, { name: "Glowvane Launch", format: "Comedy web series", audience: "creators on TikTok", outline: "A creator chases late payment.", parts: 4, partSec: 30, aspect: "9:16", style: "photorealistic", genre: "comedy" });
    const p = repo.getProject(db, pid)!;
    expect(p.code).toBe("GLO");
    expect(p.brief).toMatchObject({ format: "Comedy web series", audience: "creators on TikTok", genre: "comedy", aspect: "9:16" });
    expect(repo.getProject(db, studio.createProject(db, { name: "Glowvane Launch", format: "", audience: "", outline: "", parts: 1, partSec: 30, aspect: "16:9", style: "", genre: "neutral" }))!.code).toBe("GLO2");

    for (const c of CAST) studio.addCharacter(db, pid, { name: c.name, pronoun: "they", role: c.role ?? "" });
    const venueId = studio.addVenue(db, pid, "Launch party");
    expect(() => studio.addScene(db, pid, { title: "Launch night", venueId, castIds: [] })).toThrow(/who is in the scene/);
    const sceneId = studio.addScene(db, pid, { title: "Launch night", venueId, castIds: ["jade", "chase", "marcus", "nina"] });
    expect(repo.listScenes(db, pid)[0]).toMatchObject({ number: 1, title: "Launch night", targetSec: 30 });
    expect(studio.briefOf(p)).toMatchObject({ parts: 4, partSec: 30, format: "Comedy web series" });

    const panels = parseStoryReply(REPLY, CAST).panels;
    const r = studio.saveStoryboard(db, sceneId, { story: GLOWVANE_STORY, targetSec: 60, panels });
    expect(r.panels).toBe(7);
    const s = repo.getScene(db, sceneId)!;
    expect(s.panels.map((x) => x.code)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(s.shots[2].spec).toMatchObject({ speakerId: "chase", dialogue: "I've seen better.", visibleIds: ["chase", "jade"] });
    expect(s.plan!.data.actors[0].characterId).toBe("jade");
    expect(s.scene.story).toBe(GLOWVANE_STORY);

    // Saving again replaces the draft panels (no approvals yet) but keeps the floor plan.
    studio.saveStoryboard(db, sceneId, { story: "shorter", targetSec: 30, panels: panels.slice(0, 2) });
    expect(repo.getScene(db, sceneId)!.panels).toHaveLength(2);
    expect(repo.getScene(db, sceneId)!.plan!.version).toBe(1);
    // A storyboard that breaks a guide rail is refused.
    expect(() => studio.saveStoryboard(db, sceneId, { story: "x", targetSec: 30, panels: [{ ...panels[1], speakerId: undefined }] })).toThrow(/Panel 1: Choose who says this line/);
  });
});

describe("The shape of the video", () => {
  it("says what it is, how many parts and how long", async () => {
    const { shapeLine } = await import("../src/lib/domain/story");
    expect(shapeLine({ format: "Advert", parts: 1, partSec: 30 })).toBe("Advert, one part of about 30 s");
    expect(shapeLine({ format: "Mini drama", parts: 4, partSec: 30 })).toBe("Mini drama, 4 parts of about 30 s, about 2 min in total");
    expect(shapeLine({ format: "Short film", parts: 3, partSec: 90 })).toBe("Short film, 3 parts of about 1 min 30 s, about 4 min 30 s in total");
    expect(shapeLine({ format: "Other" })).toBe("Other");
  });
});

describe("Show me an example", () => {
  it("has an example for every genre and for adverts, each with spoken lines and within the guide rails", async () => {
    const { STORY_EXAMPLES, exampleFor } = await import("../src/lib/domain/storyExamples");
    const { GENRES } = await import("../src/lib/domain/genre");
    for (const g of [...GENRES, "advert" as const]) {
      const e = estimateStory(STORY_EXAMPLES[g].story);
      expect(e.lines, g).toBeGreaterThanOrEqual(1);
      expect(e.longLines, g).toBe(0);
    }
    expect(exampleFor("comedy", "Advert")).toBe(STORY_EXAMPLES.advert);
    expect(exampleFor("horror", "Mini drama")).toBe(STORY_EXAMPLES.horror);
  });
});

describe("Scene setting (D18c): the same spot and crowd in every picture and clip", () => {
  const withScene = `SCENE\nSPOT: around a tall round cocktail table with a white cloth, near the bar\nBACKGROUND: about 30 well-dressed guests mingling with drinks\n\n${REPLY}`;
  it("asks GPT for the setting first and reads it back", () => {
    expect(storyPrompt({ story: "x", characters: CAST, venue: "v", targetSec: 30 })).toMatch(/SCENE\nSPOT: .*\nBACKGROUND: /);
    const r = parseStoryReply(withScene, CAST);
    expect(r.staging).toEqual({ spot: "around a tall round cocktail table with a white cloth, near the bar", crowd: "about 30 well-dressed guests mingling with drinks" });
    expect(r.panels).toHaveLength(7);
    expect(parseStoryReply("SCENE\nSPOT: on a park bench\nBACKGROUND: none\nPANEL 1\nACTION: x", CAST).staging).toEqual({ spot: "on a park bench", crowd: "" });
  });
  it("puts the table on the first floor plan", () => {
    const plan = defaultPlan(CAST.map((c) => c.id), parseStoryReply(REPLY, CAST).panels, [], { spot: "around a tall round cocktail table", crowd: "" });
    expect(plan.furniture).toEqual([{ id: "spot", name: "tall round cocktail table", position: { x: 0.25, y: 4.85 }, radiusM: 0.35 }]);
    expect(defaultPlan(["jade"], [], [], { spot: "around a table", crowd: "" }).furniture).toEqual([]);
  });
  it("picture requests carry the spot, the background guests and the approved scene picture", async () => {
    const { panelPrompt } = await import("../src/lib/domain/imagePrompts");
    const cast = CAST.map((c) => ({ id: c.id, name: c.name, pronoun: "she" as const, voiceLock: "" }));
    const shot = shotSpecFor(parseStoryReply(REPLY, CAST).panels[0], { code: "P1", venueName: "Launch", castIds: CAST.map((c) => c.id), staging: { spot: "around a tall cocktail table", crowd: "about 30 guests mingling" } });
    const p = panelPrompt({ description: "Jade arrives", shot, cast, profiles: {}, venueName: "Launch", continuity: { assetId: "a-p2", label: "approved scene picture (panel 2)" } });
    expect(p.text).toContain("Where: around a tall cocktail table. Keep it visible where the camera would see it.");
    expect(p.text).toContain("Background: about 30 guests mingling. Background guests are out of focus");
    expect(p.text).toContain("Only Jade in the foreground; other guests only in the background.");
    expect(p.text).toContain("Use the attached approved scene picture (panel 2) for continuity");
    expect(p.attach).toContainEqual({ label: "approved scene picture (panel 2)", assetId: "a-p2" });
    const bare = panelPrompt({ description: "Jade arrives", shot: { ...shot, spot: undefined, crowd: undefined }, cast, profiles: {}, venueName: "Launch" });
    expect(bare.text).toContain("Only Jade in frame.");
    expect(bare.text).not.toContain("Background:");
  });
  it("Kling prompts carry them too, and no longer say no other people", async () => {
    const { composeKlingPrompt: composePrompt } = await import("../src/lib/domain/composer");
    const cast = CAST.map((c) => ({ id: c.id, name: c.name, pronoun: "she" as const, voiceLock: "a calm voice" }));
    const shot = shotSpecFor(parseStoryReply(REPLY, CAST).panels[0], { code: "P1", venueName: "Launch", castIds: CAST.map((c) => c.id), staging: { spot: "around a tall cocktail table", crowd: "about 30 guests mingling" } });
    const t = composePrompt(shot, cast).text;
    expect(t).toContain("They are around a tall cocktail table. In the background: about 30 guests mingling, out of focus.");
    expect(t).toContain("Only Jade is in the foreground. Background guests stay out of focus");
    expect(t).not.toContain("No other people visible");
  });
  it("saving the setting updates every shot in the scene", async () => {
    const { openDb } = await import("../src/db/client");
    const studio = await import("../src/lib/studioRepo");
    const repo = await import("../src/lib/repo");
    const db = await openDb(":memory:");
    const pid = studio.createProject(db, { name: "Test", format: "Advert", audience: "", outline: "", parts: 1, partSec: 30, aspect: "9:16", style: "", genre: "comedy" });
    for (const c of CAST) studio.addCharacter(db, pid, { name: c.name, pronoun: "they", role: c.role });
    const sid = studio.addScene(db, pid, { title: "S", venueId: studio.addVenue(db, pid, "Bar"), castIds: CAST.map((c) => c.id) });
    const parsed = parseStoryReply(`SCENE\nSPOT: around a tall table\nBACKGROUND: guests\n${REPLY}`, CAST);
    studio.saveStoryboard(db, sid, { story: "x", targetSec: 30, panels: parsed.panels, staging: parsed.staging });
    expect(repo.getScene(db, sid)!.shots[0].spec.spot).toBe("around a tall table");
    expect(repo.getScene(db, sid)!.plan!.data.furniture![0].name).toBe("tall table");
    studio.saveSceneStaging(db, sid, { spot: "on the sofas", crowd: "none" });
    const s = repo.getScene(db, sid)!;
    expect(s.scene.staging).toEqual({ spot: "on the sofas", crowd: "" });
    expect(s.shots.every((x) => x.spec.spot === "on the sofas" && x.spec.crowd === undefined)).toBe(true);
  });
});

describe("Suggest the setting from a saved story", () => {
  it("asks for the setting only, insists on background people at events, and reads the reply", async () => {
    const { stagingPrompt, parseStaging } = await import("../src/lib/domain/story");
    const p = stagingPrompt({ story: GLOWVANE_STORY, venue: "GLOWVANE launch party", characters: CAST });
    expect(p).toContain("If the story is at an event, party, launch");
    expect(p).toContain("lots of industry people will be there");
    expect(p).toMatch(/SCENE\nSPOT: .*\nBACKGROUND: /);
    expect(storyPrompt({ story: "x", characters: CAST, venue: "v", targetSec: 30 })).toContain("If the story is at an event, party, launch");
    expect(parseStaging("Sure!\n**SPOT:** around a high table\nBACKGROUND: a busy launch crowd of about 40 guests\n")).toEqual({ spot: "around a high table", crowd: "a busy launch crowd of about 40 guests" });
  });
});
