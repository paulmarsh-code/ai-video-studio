// "Show me an example" on the story step (D18): one short example per genre, plus one for
// adverts. Each shows the level of detail that works: who is there and what they want,
// the moments in order, and spoken lines in quote marks. Invented people and places only.
// Later these are joined by approved scenes from the library (stories real creators wrote).

import type { Genre } from "./genre";

export const STORY_EXAMPLES: Record<Genre | "advert", { title: string; story: string }> = {
  neutral: {
    title: "A chance meeting",
    story: `Sam is waiting for a delayed train on a quiet platform at dusk. She's nervous because she's late for a job interview.

An older man, Ray, sits down beside her with a flask of tea and offers her a cup.

Sam hesitates, then takes it and says 'Thanks. It's been one of those days.'

Ray smiles and says 'They usually get better after the tea.'

The train pulls in. Sam stands, hands back the cup and gives him a grateful nod before she boards.`,
  },
  comedy: {
    title: "The wrong order",
    story: `Leo is on a first date with Priya at a busy pizza place. He wants to look sophisticated, but he can't read the Italian menu.

The waiter arrives. Leo confidently points at the menu and orders "the one at the top, twice."

Two enormous plates of anchovies arrive. Priya stares at them, then at Leo.

Leo says "I love anchovies. Big anchovy guy."

Priya pushes her plate towards him and says "Then you'll love mine too."

Leo takes a brave bite, his eyes water, and he gives a thumbs up.`,
  },
  drama: {
    title: "The letter",
    story: `Ellie, in her thirties, is clearing out her late father's kitchen. She is tired and hasn't cried yet.

Her brother Tom arrives with boxes. They have barely spoken in a year.

Ellie finds an unopened letter in a drawer addressed to both of them. She holds it up without a word.

Tom says "Open it. I can't."

Ellie reads it in silence, then her face softens and she hands it to Tom.

Tom reads, sits down slowly and says "He knew we'd end up here together."

Ellie sits beside him. For the first time, they laugh and cry at the same time.`,
  },
  horror: {
    title: "Room 9",
    story: `Mia, a night receptionist, is alone at the desk of an empty roadside motel. Rain on the windows. She's bored and scrolling her phone.

The phone on the desk rings. The display says Room 9.

Mia answers. A whisper says "Can you come up? Something's in here with me."

Mia frowns and checks the board: room 9 has been empty all week. Its key is hanging on the hook.

She looks up the dark staircase. The light on the landing flickers and goes out.

The key on the hook starts to swing on its own.`,
  },
  scifi: {
    title: "Last transmission",
    story: `Commander Okafor is alone on the bridge of a damaged research ship, lit only by red emergency lights. Her crew are in cryosleep.

A screen crackles. A message from Earth, years old, starts to play: her daughter, aged ten, waving.

Okafor touches the screen and says "I'm still coming home, love."

An alarm sounds. The ship's computer says "Hull breach in sector four. Thirty seconds."

Okafor wipes her eyes, straps in and grabs the manual controls with both hands.`,
  },
  action: {
    title: "The handover",
    story: `Kai, a courier on a motorbike, has to deliver a sealed case across the city in ten minutes. Two men in a black car are following him.

At a red light the car pulls up beside him. The passenger winds down his window and says "Hand it over and you walk away."

Kai glances at the light, then at the case.

He says "Not today," and pulls a wheelie through the junction as the light turns green.

The black car swerves to follow and clips a market stall. Fruit flies everywhere.

Kai weaves through the traffic and is gone.`,
  },
  documentary: {
    title: "The baker's morning",
    story: `Four in the morning in a small village bakery. Margaret, 70, has baked here for fifty years. She moves slowly but surely.

She shapes the first loaves while the radio plays quietly.

Speaking to us, she says "People think it's about the bread. It's about who comes in for it."

At seven the first customer, a young dad with a toddler, comes in. Margaret hands the child a warm roll before he's even asked.

She watches them leave and smiles to herself.`,
  },
  advert: {
    title: "Brew, 30-second advert",
    story: `Dan, a tired dad in his forties, stumbles into the kitchen at 6 a.m. Toys everywhere, toddler shouting upstairs.

He reaches for the Brew coffee machine and presses one button.

The coffee pours. He takes the first sip and closes his eyes. Everything goes calm and quiet.

He opens his eyes, smiles and says 'Right. Let's do this.'

He scoops up the toddler, who is suddenly giggling.

End card: the Brew machine on the counter with the line "Brew. Your first good decision of the day."`,
  },
};

export function exampleFor(genre: Genre, format?: string) {
  return /advert|commercial|\bad\b/i.test(format ?? "") ? STORY_EXAMPLES.advert : STORY_EXAMPLES[genre];
}
