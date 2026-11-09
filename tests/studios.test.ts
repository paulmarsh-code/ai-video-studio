// Character, Venue and Storyboard studios: GPT image prompts and the data rules behind them.

import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import { characterRefPrompt, panelPrompt, venueViewPrompt } from "../src/lib/domain/imagePrompts";
import { CAST, SCENE1_PLAN } from "../src/lib/demo/paidOnTime";
import { getImageProvider } from "../src/lib/providers/images";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";

async function fresh() {
  const db = await openDb(":memory:");
  const projectId = seedDemo(db);
  const sceneId = repo.listScenes(db, projectId)[0].id;
  return { db, projectId, sceneId };
}

describe("GPT image prompts", () => {
  const jade = { appearance: "late twenties, shoulder-length dark curly hair", wardrobe: "an emerald satin dress", refs: { front: "asset-jade-front" } };

  it("character reference prompts state the view, a plain background, and the 1:2 limit", () => {
    const p = characterRefPrompt("Jade", jade, "back");
    expect(p.startsWith("BACK VIEW")).toBe(true);
    expect(p.trim().endsWith("the face must not be visible.")).toBe(true);
    expect(p).toContain("emerald satin dress");
    expect(p).toContain("not narrower than 1:2");
    expect(p).toContain("Exactly one person");
  });

  it("back and face prompts point to the front image; no doubled full stops", () => {
    const p = characterRefPrompt("Jade", { appearance: "Dark bob.", wardrobe: "Orange dress.", refs: { front: "f1" } }, "face");
    expect(p.startsWith("FACE CLOSE-UP")).toBe(true);
    expect(p).toContain("attached front reference image");
    expect(p).not.toContain("..");
    expect(characterRefPrompt("Jade", { refs: { front: "f1" } }, "front")).not.toContain("attached front reference");
  });

  it("prompts never carry quote marks, even if the profile does", () => {
    const p = characterRefPrompt("Jade", { appearance: 'wears a "Boss" badge' }, "front");
    expect(p).not.toMatch(/["“”]/);
  });

  it("venue view prompts have no people and carry the genre look", () => {
    const p = venueViewPrompt({ name: "Launch venue", description: "Screen wall at the far end" }, "screen wall", "horror");
    expect(p).toContain("No people");
    expect(p).toContain("low-key lighting");
    expect(p).toContain("indoor location");
  });

  it("venue prompts suit outdoor settings too", () => {
    const p = venueViewPrompt({ name: "Brighton seafront", description: "Shingle beach with the pier to the east.", setting: "exterior" }, "pier");
    expect(p).toContain("outdoor location");
    expect(p).not.toMatch(/interior|wall/i);
    expect(p).not.toContain("..");
  });

  it("panel prompts use the shot's camera, positions and visible cast, and list references to attach", () => {
    const shot = { code: "C2a", venueName: "v", sceneContext: "", presentIds: CAST.map((c) => c.id), visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], speakerId: "jade", dialogue: "Hi everyone.", actions: "Jade places her glass on the table.", durationSec: 4, audioMode: "native-on" as const, cameraId: "main" };
    const { text, attach } = panelPrompt({ description: "Jade joins the group", emotion: "warm", shot, cast: CAST, profiles: { jade }, plan: SCENE1_PLAN, venueName: "launch venue", genre: "comedy" });
    expect(text).toContain("Over-the-shoulder");
    expect(text).toMatch(/Exactly 2 people in this picture, from left to right: .*Jade.*Keep this left-to-right order/);
    expect(text).toContain("Exactly one of each person: Chase and Jade");
    expect(text).not.toContain("Marcus");
    expect(text).not.toMatch(/["“”]/); // the line is not drawn; no quotes reach the image prompt
    expect(text).not.toContain("Hi everyone");
    expect(attach).toEqual([{ label: "Jade reference", assetId: "asset-jade-front" }]);
  });

  it("attaches the background view image and, for an over-the-shoulder, the back image of the person seen from behind", () => {
    const shot = { code: "C2b", venueName: "v", sceneContext: "", presentIds: CAST.map((c) => c.id), visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], speakerId: "chase", dialogue: "We'll let you know.", actions: "", durationSec: 3, audioMode: "native-on" as const, cameraId: "reverse" };
    const views = SCENE1_PLAN.views.map((v) => ({ name: v.name, imageAssetId: `img-${v.name}` }));
    const profiles = { jade: { refs: { front: "jf", back: "jb" } }, chase: { refs: { front: "cf" } } };
    const { text, attach } = panelPrompt({ description: "Chase brushes her off.", shot, cast: CAST, profiles, plan: SCENE1_PLAN, venueName: "venue", venueViews: views });
    const bg = attach.find((a) => a.label.endsWith(" view"));
    expect(bg).toBeDefined();
    expect(text).toContain(`Use the attached ${bg!.label.replace(/ view$/, "")} image as the background`);
    if (text.includes("Jade in the soft foreground")) expect(attach).toContainEqual({ label: "Jade back", assetId: "jb" });
    expect(attach).toContainEqual({ label: "Chase reference", assetId: "cf" });
    expect(text).not.toContain("..");
  });

  it("is deterministic", () => {
    const a = characterRefPrompt("Jade", jade, "face");
    expect(characterRefPrompt("Jade", jade, "face")).toBe(a);
  });
});

describe("Image provider (D15)", () => {
  it("is manual-only unless an OpenAI key is configured", () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(getImageProvider()).toBeNull();
    process.env.OPENAI_API_KEY = "test-key";
    expect(getImageProvider()?.id).toBe("openai");
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  });
});

describe("Character Studio", () => {
  it("editing an approved character makes a draft; approving supersedes the old version", async () => {
    const { db, projectId } = await fresh();
    const jade = studio.listCharacters(db, projectId).find((c) => c.slug === "jade")!;
    const oldLock = jade.approved!.voiceLock;
    studio.saveCharacterDraft(db, jade.id, { profile: { appearance: "dark curly hair" }, voiceLock: "Warm, quick London voice." });
    // Prompts still use the approved v1 until v2 is approved.
    expect(repo.getCast(db, projectId).find((c) => c.id === "jade")!.voiceLock).toBe(oldLock);
    const v = studio.approveCharacterDraft(db, jade.id);
    expect(v).toBe(2);
    const after = studio.listCharacters(db, projectId).find((c) => c.slug === "jade")!;
    expect(after.versions.map((x) => x.status)).toEqual(["approved", "superseded"]);
    expect(repo.getCast(db, projectId).find((c) => c.id === "jade")!.voiceLock).toBe("Warm, quick London voice.");
  });

  it("blocks approval with no appearance, no voice lock, or quote marks", async () => {
    const { db, projectId } = await fresh();
    const { id } = studio.addCharacter(db, projectId, { name: "Priya Shah", pronoun: "she" });
    expect(() => studio.approveCharacterDraft(db, id)).toThrow(/voice lock/);
    studio.saveCharacterDraft(db, id, { profile: { appearance: "tall" }, voiceLock: 'Says "darling" a lot' });
    expect(() => studio.approveCharacterDraft(db, id)).toThrow(/quote marks/);
  });

  it("reference images go on the draft, keep through text edits, and reach panel prompts once approved", async () => {
    const { db, projectId } = await fresh();
    const jade = studio.listCharacters(db, projectId).find((c) => c.slug === "jade")!;
    studio.setCharacterRef(db, jade.id, "front", "img-1");
    studio.saveCharacterDraft(db, jade.id, { profile: { appearance: "dark curly hair" }, voiceLock: jade.approved!.voiceLock });
    expect(studio.getApprovedProfiles(db, projectId).jade?.refs?.front).toBeUndefined();
    studio.approveCharacterDraft(db, jade.id);
    expect(studio.getApprovedProfiles(db, projectId).jade?.refs?.front).toBe("img-1");
  });

  it("a real person can't be approved without a consent record", async () => {
    const { db, projectId } = await fresh();
    const { id } = studio.addCharacter(db, projectId, { name: "Sam", pronoun: "they" });
    studio.updateCharacterBasics(db, id, { name: "Sam", pronoun: "they", role: "", invented: false, consentRef: "" });
    studio.saveCharacterDraft(db, id, { profile: { appearance: "tall", anchors: ["red scarf"] }, voiceLock: "Calm Scottish voice." });
    expect(() => studio.approveCharacterDraft(db, id)).toThrow(/consent/);
    studio.updateCharacterBasics(db, id, { name: "Sam", pronoun: "they", role: "", invented: false, consentRef: "Sam Lee, signed release, 9 Nov 2026" });
    expect(studio.approveCharacterDraft(db, id)).toBe(1);
    expect(studio.getApprovedProfiles(db, projectId)["sam"]?.anchors).toEqual(["red scarf"]);
  });

  it("gives new characters unique slugs", async () => {
    const { db, projectId } = await fresh();
    expect(studio.addCharacter(db, projectId, { name: "Jade", pronoun: "she" }).slug).toBe("jade-2");
  });
});

describe("Venue Studio", () => {
  it("saves named views, keeps their images, and a change returns the venue to draft", async () => {
    const { db, projectId } = await fresh();
    const v = studio.listVenues(db, projectId)[0];
    expect(v.status).toBe("approved");
    studio.setVenueViewImage(db, v.id, "screen wall", "img-wall");
    studio.saveVenue(db, v.id, { name: v.name, description: v.description, views: [...v.views, { name: "kitchen door", directionDeg: 45 }] });
    const after = studio.getVenue(db, v.id)!;
    expect(after.status).toBe("draft");
    expect(after.views.find((x) => x.name === "screen wall")?.imageAssetId).toBe("img-wall");
    expect(after.views).toHaveLength(5);
    studio.approveVenue(db, v.id);
    expect(studio.getVenue(db, v.id)!.status).toBe("approved");
  });

  it("rejects duplicate view names", async () => {
    const { db, projectId } = await fresh();
    const v = studio.listVenues(db, projectId)[0];
    expect(() => studio.saveVenue(db, v.id, { name: v.name, description: "", views: [{ name: "bar", directionDeg: 0 }, { name: "Bar", directionDeg: 90 }] })).toThrow(/different name/);
  });
});

describe("Storyboard Studio", () => {
  it("a dialogue change flows to the shot and marks the animatic for re-check", async () => {
    const { db, sceneId } = await fresh();
    repo.saveAnimatic(db, sceneId, { lineAudio: {}, durations: {} });
    const c2b = repo.getScene(db, sceneId)!.panels.find((p) => p.code === "C2b")!;
    const res = studio.updatePanel(db, c2b.id, { code: "C2b", description: c2b.description, emotion: "smug", speakerId: "chase", line: "We'll be in touch, maybe next quarter." });
    expect(res).toEqual({ dialogueChanged: true, animaticMarked: true, shotUpdated: true });
    const s = repo.getScene(db, sceneId)!;
    const shot = s.shots.find((x) => x.panelId === c2b.id)!;
    expect(shot.spec.dialogue).toBe("We'll be in touch, maybe next quarter.");
    expect(shot.spec.durationSec).toBe(4);
    expect(s.panels.find((p) => p.id === c2b.id)!.status).toBe("draft");
    expect(repo.getAnimatic(db, sceneId)!.timeline.recheck?.[c2b.id]).toMatch(/Dialogue changed/);
  });

  it("a description-only change does not touch the dialogue or the animatic", async () => {
    const { db, sceneId } = await fresh();
    repo.saveAnimatic(db, sceneId, { lineAudio: {}, durations: {} });
    const c2a = repo.getScene(db, sceneId)!.panels.find((p) => p.code === "C2a")!;
    const d = c2a.dialogue[0];
    const res = studio.updatePanel(db, c2a.id, { code: "C2a", description: "Jade joins the group, smiling.", emotion: c2a.emotion, speakerId: d.characterId, line: d.text });
    expect(res.dialogueChanged).toBe(false);
    expect(res.animaticMarked).toBe(false);
    expect(repo.getAnimatic(db, sceneId)!.version).toBe(1);
  });

  it("adds panels with a draft shot, reorders them, and refuses quoted lines", async () => {
    const { db, sceneId } = await fresh();
    studio.addPanel(db, sceneId, { code: "C5", description: "Chase shrugs to Marcus.", emotion: "smug", speakerId: "chase", line: "Creators, eh?" });
    let s = repo.getScene(db, sceneId)!;
    expect(s.panels.at(-1)!.code).toBe("C5");
    const shot = s.shots.find((x) => x.panelId === s.panels.at(-1)!.id)!;
    expect(shot.spec.speakerId).toBe("chase");
    expect(shot.spec.code).toBe("EP01_S01_C5");
    studio.movePanel(db, s.panels.at(-1)!.id, -1);
    s = repo.getScene(db, sceneId)!;
    expect(s.panels.map((p) => p.code).slice(-2)).toEqual(["C5", "C4c"]);
    expect(() => studio.addPanel(db, sceneId, { code: "C6", description: "x", emotion: "", speakerId: "jade", line: '"Hi"' })).toThrow(/quote marks/);
    expect(() => studio.addPanel(db, sceneId, { code: "C5", description: "x", emotion: "" })).toThrow(/already called/);
  });

  it("approving a panel needs its image", async () => {
    const { db, sceneId } = await fresh();
    const p = repo.getScene(db, sceneId)!.panels[0];
    expect(() => studio.approvePanel(db, p.id)).toThrow(/image/);
    studio.setPanelImage(db, p.id, "img-panel");
    studio.approvePanel(db, p.id);
    expect(repo.getScene(db, sceneId)!.panels[0].status).toBe("approved");
  });
});
