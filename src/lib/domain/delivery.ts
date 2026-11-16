// How each line is delivered (D138). A line with only a feeling ("angry, confrontational") came
// out flat or overplayed. Paul's best take (Jade's greeting, 7 Nov) was directed like an actor:
// who she is in that moment and what she wants, how the words come out, what her face does, one
// small physical action. The app writes that for every spoken panel; the user can change it.

export interface DeliveryPanel {
  order: number;
  speaker: string;
  line: string;
  emotion?: string;
  description?: string;
}

/** The request to the text model: one delivery for each spoken panel, as JSON. */
export function deliveryPrompt(o: { story: string; audience?: string; characters: { name: string; about?: string }[]; panels: DeliveryPanel[]; around: { order: number; description: string; speaker?: string; line?: string }[] }): string {
  const cast = o.characters.map((c) => `- ${c.name}${c.about ? `: ${c.about}` : ""}`).join("\n");
  const scene = o.around.map((p) => `${p.order}. ${p.description}${p.line ? ` ${p.speaker}: "${p.line}"` : ""}`).join("\n");
  const want = o.panels.map((p) => `${p.order}. ${p.speaker}: "${p.line}"${p.emotion ? ` (feeling: ${p.emotion})` : ""}${p.description ? ` What happens: ${p.description}` : ""}`).join("\n");
  return [
    "You are directing actors for a short live-action video. For each spoken line below, write how the actor delivers it, the way a director briefs an actor before a take.",
    "",
    `The story: ${o.story.trim()}`,
    o.audience ? `Who it is for: ${o.audience.trim()}` : "",
    "",
    "The people:",
    cast,
    "",
    "The scene, panel by panel:",
    scene,
    "",
    "The lines to direct:",
    want,
    "",
    "For each line, one or two sentences, at most 35 words, in British English, covering in this order:",
    "1. who they are in this moment and what they want from the other person;",
    "2. how the words come out: tone, pace and rhythm (for example warm professional enthusiasm, spontaneous conversational rhythm; or controlled, clipped, each word deliberate);",
    "3. what the face does, by its features (eyes, brows, mouth), expressive but restrained;",
    "4. one small physical action that fits the moment (a step closer, a glance at the contract, a shrug).",
    "Natural, subtle acting, no exaggerated gestures. Keep the line's own feeling. Don't repeat or change the words of the line, and don't add speech.",
    "",
    'Reply with JSON only: [{"panel": <number>, "delivery": "<text>"}, ...], one entry per line above.',
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
}

/** The deliveries in the model's reply, by panel number; anything unreadable is left out. */
export function parseDeliveries(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const arr = JSON.parse(json) as { panel?: unknown; delivery?: unknown }[];
    for (const x of Array.isArray(arr) ? arr : []) {
      const n = Number(x.panel);
      const d = typeof x.delivery === "string" ? x.delivery.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim() : "";
      if (Number.isFinite(n) && d) out.set(n, d);
    }
  } catch { /* nothing readable */ }
  return out;
}
