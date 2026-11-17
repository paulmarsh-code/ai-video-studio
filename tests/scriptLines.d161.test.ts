// D161: script-style lines ("Chase: …") count as exact spoken lines, like words in quote marks.
import { describe, expect, it } from "vitest";
import { estimateStory, quoteScriptLines, quotedLines, storyPrompt } from "../src/lib/domain/story";

const brief = `Scene title: Chase is caught out
Where: The launch party, at the bar.
Who's in it: Chase and Jade.
Chase grins, mocking her.
Chase: Bro, you're gonna love this. That Jade I told you about rocks up waving her contract at me… thirty days… thirty days.
On Jade: it lands. Silent.
**Chase:** Yeah, let 'em wait.
11. Jade: I heard you, Chase, and you're not getting away with it.
Then she turns and storms off.`;

describe("Script-style lines (D161)", () => {
  it("counts each 'Name: words' line as a spoken line, and not the headings", () => {
    expect(quotedLines(brief)).toEqual([
      "Bro, you're gonna love this. That Jade I told you about rocks up waving her contract at me… thirty days… thirty days.",
      "Yeah, let 'em wait.",
      "I heard you, Chase, and you're not getting away with it.",
    ]);
    expect(estimateStory(brief).lines).toBe(3);
  });
  it("with the cast known, only their names are speakers", () => {
    expect(quoteScriptLines("Bar: busy and loud.\nAva: Hello there.", ["Ava Stone"])).toBe('Bar: busy and loud.\nAva says: "Hello there."');
  });
  it("the drafting request has them in quote marks, so they're used word for word", () => {
    const p = storyPrompt({ story: brief, characters: [{ id: "chase", name: "Chase Whitmore" }, { id: "jade", name: "Jade" }] as never, venue: "GLOWVANE", targetSec: 60 });
    expect(p).toContain(`Chase says: "Yeah, let 'em wait."`);
    expect(p).toContain('11. Jade says: "I heard you, Chase, and you\'re not getting away with it."');
  });
});
