// The words the app understands (D40), shown behind an ⓘ beside every box where the app reads
// what the user writes to place people, props, postures and cameras. One list per box, kept
// here so the help and the app never disagree: `tests/wordGuides.d40.test.ts` runs every
// example through the part of the app that reads it.

export type GuideCheck = "change" | "move" | "arrive" | "posture" | "look" | "gesture" | "camera" | "setting-pose" | "setting-level" | "prop-size" | "prop-kind" | "venue-room" | "venue-light" | "venue-level" | "venue-exit" | "held";

export interface WordGuide {
  title: string;
  intro: string;
  groups: { heading: string; examples: string[]; check: GuideCheck }[];
  tip?: string;
}

export const WORD_GUIDES = {
  change: {
    title: "Changing who stands where",
    intro: "Write the change in plain words. The app moves people on this panel's floor plan so you can see it before the picture is redrawn.",
    groups: [
      { heading: "Closer or further apart", examples: ["move Ava closer to Ben", "put Ava next to Ben", "move Ava further from Ben"], check: "change" },
      { heading: "As the picture shows it", examples: ["move Ben a bit to the left", "move Ben to the right", "move Ben closer to the camera", "move Ben further back", "Ava comes in from the right", "Ava approaches the group from the left"], check: "change" },
      { heading: "Swap or cross over", examples: ["swap Ava and Ben", "move Ava to the other side of the table"], check: "change" },
      { heading: "Facing", examples: ["turn Ben to face Ava", "turn Ben away from Ava"], check: "change" },
      { heading: "Sitting, lying, standing", examples: ["Ava should be sitting", "Ben is lying down", "put Ava on the sofa"], check: "change" },
      { heading: "Walking off", examples: ["have Ben walk off to the right", "Ava walks off to the left"], check: "change" },
      { heading: "Props", examples: ["take the table away"], check: "change" },
    ],
    tip: "Use the names as they are in the app, and prop names from the scene setting. Left and right are as you look at the picture. Join changes with “and”. If you drag someone out of the camera's view, the camera turns to keep them in.",
  },
  panel: {
    title: "What happens in a panel",
    intro: "The app reads these words to place people on the floor plan for this panel and the ones after, and to choose the camera. Say who does what.",
    groups: [
      { heading: "Arriving", examples: ["Ava enters the room", "Ava approaches the group", "Ava joins them"], check: "arrive" },
      { heading: "Going somewhere or leaving", examples: ["Ava walks over to the window", "Ben crosses to Ava", "Ava steps closer", "Ben walks off", "Ben leaves the room", "Ben heads for the door"], check: "move" },
      { heading: "Sitting, lying, getting up", examples: ["Ava sits on the sofa", "Ben lies on his bed", "Ben sits up", "Ava gets up", "Ben kneels"], check: "posture" },
      { heading: "Turning and looking", examples: ["Ava turns to Ben", "Ben turns away", "Ava looks at Ben", "Ava and Ben exchange glances", "Ben looks out of the window"], check: "look" },
      { heading: "Props in hand", examples: ["Ben picks up the glass", "Ava takes out her phone", "Ben puts the glass down on the bar"], check: "move" },
      { heading: "Gestures", examples: ["a dismissive wave", "shrugs", "rolls her eyes", "points at Ben", "raises a glass"], check: "gesture" },
      { heading: "Camera, from the words", examples: ["low angle", "high angle", "from Ava's point of view", "Dutch angle", "lying on her back looking up at the sky", "falls from the cliff"], check: "camera" },
    ],
    tip: "Postures and places carry on to the next panels until the words change them, so a panel only needs to say what changes. Use prop names from the scene setting.",
  },
  setting: {
    title: "Where they are",
    intro: "Where the group is for the whole scene. The app reads whether they sit or stand, and anything they stand on that's raised or lowered.",
    groups: [
      { heading: "Sitting or lying from the start", examples: ["sitting round the kitchen table", "lying on the beach"], check: "setting-pose" },
      { heading: "Raised or lowered", examples: ["on the stage", "on the balcony", "at the edge of the cliff", "on the roof edge", "at the top of the stairs", "at the bottom of the stairs", "on the bridge", "by the pool"], check: "setting-level" },
    ],
    tip: "Standing is assumed unless you say otherwise. Name the prop they gather round, as it's named in Key props.",
  },
  props: {
    title: "Describing a prop",
    intro: "The app reads the size and kind of thing from these words, so the prop is the right height and shape in every picture.",
    groups: [
      { heading: "Height", examples: ["chest-high at 110 cm", "1.2 m tall", "waist-high", "a low coffee table"], check: "prop-size" },
      { heading: "Width", examples: ["2 m wide", "90 cm across"], check: "prop-size" },
      { heading: "Drawn flat against the room", examples: ["backdrop", "screen", "banner", "sign"], check: "prop-kind" },
      { heading: "Drawn upright and narrow", examples: ["plinth", "pedestal", "lamp", "plant"], check: "prop-kind" },
    ],
    tip: "Put the prop's own size first, then what's on it.",
  },
  venue: {
    title: "Describing the venue",
    intro: "The app reads the kind of place for the room size, sentences about light for every picture's lighting, and any balcony or stage.",
    groups: [
      { heading: "Kind of place (room size)", examples: ["lift", "bedroom", "office", "café", "living room", "bar", "restaurant", "hall", "warehouse", "rooftop", "park", "street"], check: "venue-room" },
      { heading: "Light", examples: ["warm low lighting", "neon glow", "candlelight", "daylight through tall windows"], check: "venue-light" },
      { heading: "Raised areas", examples: ["a balcony", "a mezzanine", "a stage"], check: "venue-level" },
      { heading: "The way out (name a view)", examples: ["main entrance", "exit", "door", "hallway", "stairs"], check: "venue-exit" },
    ],
    tip: "The name counts first: “Ember Room cocktail bar” is a bar. You can set the exact room size on the venue page. Time of day alone (“evening”) isn't read as lighting: say what the light is.",
  },
  character: {
    title: "Which hand, which shoulder",
    intro: "Anything a character always holds or wears on one side is kept on that side in every picture. Say whose left or right.",
    groups: [
      { heading: "Held or worn on one side", examples: ["a tan satchel in her right hand", "phone in his left hand", "a guitar over her left shoulder", "a watch on his left wrist", "in her right hand, a coffee cup"], check: "held" },
    ],
    tip: "Their own left or right, not the side of the picture. If the reference picture shows it on the other side, the app follows the picture and warns you.",
  },
} satisfies Record<string, WordGuide>;

export type GuideName = keyof typeof WORD_GUIDES;
