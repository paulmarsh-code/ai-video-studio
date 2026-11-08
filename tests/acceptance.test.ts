// Acceptance tests from Build Spec v1.4 §6 that the rules engine can prove without a UI:
// tests 1–7 and 16. Run with: npm test

import { describe, expect, it } from "vitest";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import { deriveDuration } from "../src/lib/domain/duration";
import { checkLineOfAction, describeFrame, readCamera } from "../src/lib/domain/geometry";
import { stripQuotes } from "../src/lib/domain/text";
import type { ShotSpec } from "../src/lib/domain/types";
import { validatePrompt, validateShot } from "../src/lib/domain/validator";
import { ALL_IDS, CAST, SCENE1_PLAN } from "../src/lib/demo/paidOnTime";

const base = (over: Partial<ShotSpec>): ShotSpec => ({
  code: "EP01_S01_TEST",
  venueName: "GLOWVANE launch-party venue",
  sceneContext: "At the GLOWVANE launch party, Jade has just joined Chase and his colleagues at a cocktail table.",
  presentIds: ALL_IDS,
  visibleIds: [],
  excludedIds: [],
  actions: "",
  durationSec: 4,
  audioMode: "native-on",
  ...over,
});

const codes = (f: { code: string }[]) => f.map((x) => x.code);

describe("1. Visible set", () => {
  it("excludes Marcus and Nina from the prompt but keeps them in the scene record", () => {
    const shot = base({
      visibleIds: ["jade"],
      excludedIds: ["chase", "marcus", "nina"],
      speakerId: "jade",
      dialogue: "Unbelievable.",
      cameraId: "jade-cu",
      durationSec: 3,
    });
    const p = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
    expect(p.text).not.toMatch(/Marcus|Nina/);
    expect(p.text).toContain("Only Jade is in frame. No other people visible.");
    expect(shot.presentIds).toEqual(expect.arrayContaining(["marcus", "nina"]));
    expect(SCENE1_PLAN.actors.map((a) => a.characterId)).toEqual(expect.arrayContaining(["marcus", "nina"]));
    expect(validatePrompt(p.text, shot, CAST).filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("2. Speaker exclusivity", () => {
  it("a Chase line produces the exclusivity guard and no other dialogue", () => {
    const shot = base({
      visibleIds: ["chase", "jade"],
      speakerId: "chase",
      dialogue: "You're lucky we booked you at all.",
      cameraId: "reverse",
      durationSec: 4,
    });
    const p = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
    expect(p.text).toContain("Only Chase has intelligible dialogue");
    expect(p.text.match(/says exactly once/g)).toHaveLength(1);
    expect(p.text).toContain('He says exactly once: "You\'re lucky we booked you at all."');
    expect(p.text).toContain("Jade listens silently.");
  });

  it("flags a second speaker", () => {
    const f = validateShot(
      base({ visibleIds: ["chase", "jade"], speakerId: "chase", dialogue: "Hello.", otherDialogue: { jade: "Hi." }, durationSec: 3 }),
      CAST,
    );
    expect(codes(f)).toContain("MULTIPLE_SPEAKERS");
  });
});

describe("3. Quote rule", () => {
  it("flags a quoted phrase in an action field and rewords it in the prompt", () => {
    const shot = base({
      visibleIds: ["marcus", "nina"],
      actions: 'Marcus and Nina look shocked, as if thinking "did he really just say that".',
      audioMode: "off",
      durationSec: 3,
    });
    expect(codes(validateShot(shot, CAST))).toContain("QUOTES_OUTSIDE_DIALOGUE");
    const p = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
    expect(p.text).not.toMatch(/["“”]/);
    expect(p.text).toContain("did he really just say that");
    expect(stripQuotes('say "hello" now')).toBe("say hello now");
  });
});

describe("4. Duration from dialogue", () => {
  it("'Unbelievable.' gives about 3–4 s", () => {
    const d = deriveDuration("Unbelievable.");
    expect(d).toBeGreaterThanOrEqual(3);
    expect(d).toBeLessThanOrEqual(4);
  });
  it("a 19-word line gives about 7–8 s", () => {
    const line =
      "So which of your brand partners would actually want their name on a launch this badly organised, honestly, tonight?";
    expect(line.split(/\s+/)).toHaveLength(19);
    const d = deriveDuration(line);
    expect(d).toBeGreaterThanOrEqual(7);
    expect(d).toBeLessThanOrEqual(8);
  });
  it("warns when the duration leaves spare seconds", () => {
    const f = validateShot(base({ visibleIds: ["jade"], speakerId: "jade", dialogue: "Unbelievable.", durationSec: 10 }), CAST);
    expect(codes(f)).toContain("DURATION_MISMATCH");
  });
});

describe("5. Silent shot", () => {
  it("recommends audio off and adds the no-speech guard", () => {
    const shot = base({ visibleIds: ["marcus", "nina"], actions: "Marcus and Nina stare, open-mouthed.", durationSec: 3 });
    const p = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
    expect(p.settings.recommendedAudio).toBe("off");
    expect(p.text).toContain("No one speaks. No dialogue, no humming, no vocal sounds.");
    expect(codes(validateShot(shot, CAST))).toContain("SILENT_SHOT_AUDIO_ON");
  });
});

describe("6. Geometry", () => {
  it("main OTS reads Chase frame-left, Jade frame-right, screen wall behind Jade", () => {
    const cam = SCENE1_PLAN.cameras.find((c) => c.id === "main")!;
    const line = describeFrame(readCamera(SCENE1_PLAN, cam), CAST, ["chase", "jade"], "jade");
    expect(line).toBe("Chase frame-left, Jade frame-right, screen wall behind Jade");
  });
  it("Chase is the soft foreground in the main OTS", () => {
    const cam = SCENE1_PLAN.cameras.find((c) => c.id === "main")!;
    const chase = readCamera(SCENE1_PLAN, cam).actors.find((a) => a.characterId === "chase")!;
    expect(chase.foreground).toBe(true);
  });
  it("the planned reverse camera stays on the correct side of the line", () => {
    expect(checkLineOfAction(SCENE1_PLAN, CAST)).toEqual([]);
  });
  it("a camera placed across the 180° line warns", () => {
    const plan = {
      ...SCENE1_PLAN,
      cameras: [
        ...SCENE1_PLAN.cameras,
        { id: "bad", name: "Bad reverse", preset: "reverse-ots" as const, position: { x: -1.5, y: 6.5 }, lookAt: { x: 0, y: 5 } },
      ],
    };
    const f = checkLineOfAction(plan, CAST);
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("CROSSES_LINE_OF_ACTION");
    expect(f[0].severity).toBe("warning");
  });
  it("an override with a reason is recorded, not warned", () => {
    const plan = {
      ...SCENE1_PLAN,
      cameras: [
        ...SCENE1_PLAN.cameras,
        { id: "bad", name: "Bad reverse", preset: "reverse-ots" as const, position: { x: -1.5, y: 6.5 }, lookAt: { x: 0, y: 5 }, overrideReason: "deliberate disorientation" },
      ],
    };
    expect(checkLineOfAction(plan, CAST)[0].severity).toBe("info");
  });
});

describe("7. Voice lock", () => {
  it("editing Chase's voice text in the prompt is caught", () => {
    const shot = base({ visibleIds: ["chase", "jade"], speakerId: "chase", dialogue: "You're lucky we booked you at all.", durationSec: 4 });
    const p = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
    expect(validatePrompt(p.text, shot, CAST)).toEqual([]);
    const edited = p.text.replace("quietly condescending", "warm and friendly");
    expect(codes(validatePrompt(edited, shot, CAST))).toContain("VOICE_LOCK_CHANGED");
  });
  it("editing the approved dialogue in the prompt is caught", () => {
    const shot = base({ visibleIds: ["jade"], speakerId: "jade", dialogue: "Unbelievable.", durationSec: 3 });
    const p = composeKlingPrompt(shot, CAST);
    expect(codes(validatePrompt(p.text.replace("Unbelievable.", "Unbelievable!"), shot, CAST))).toContain("DIALOGUE_CHANGED");
  });
});

describe("Regression: found in sample review 8 Nov 2026", () => {
  it("a single close-up never describes its subject as over-the-shoulder foreground", () => {
    const shot = base({ visibleIds: ["jade"], speakerId: "jade", dialogue: "Unbelievable.", cameraId: "jade-cu", durationSec: 3 });
    expect(composeKlingPrompt(shot, CAST, SCENE1_PLAN).text).not.toContain("over the shoulder");
  });
  it("the reverse OTS puts Jade in the soft foreground and the bar behind Chase", () => {
    const shot = base({ visibleIds: ["chase", "jade"], speakerId: "chase", dialogue: "You're lucky we booked you at all.", cameraId: "reverse", durationSec: 4 });
    const t = composeKlingPrompt(shot, CAST, SCENE1_PLAN).text;
    expect(t).toContain("Jade in the soft foreground");
    expect(t).toContain("Background behind Chase: the bar.");
  });
  it("big intensity against a restrained voice lock is flagged", () => {
    const f = validateShot(base({ visibleIds: ["jade"], speakerId: "jade", dialogue: "Unbelievable.", intensity: "big", durationSec: 3 }), CAST);
    expect(codes(f)).toContain("INTENSITY_CONFLICTS_WITH_VOICE_LOCK");
  });
});

describe("16. Native audio rule", () => {
  it("an attached audio reference warns and the prompt carries the voice lock instead", () => {
    const shot = base({
      visibleIds: ["chase"],
      speakerId: "chase",
      dialogue: "You're lucky we booked you at all.",
      audioReferenceCodes: ["VOX-01_Chase_voice_v2_8s.mp3"],
      durationSec: 4,
    });
    expect(codes(validateShot(shot, CAST))).toContain("AUDIO_REFERENCE_ATTACHED");
    const p = composeKlingPrompt(shot, CAST);
    expect(p.text).toContain(CAST.find((c) => c.id === "chase")!.voiceLock);
    expect(p.settings.audioReferences).toBe("none");
  });
});
