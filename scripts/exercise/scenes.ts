// The five generality test scenes (T7-T11, VP_Generality_Test_Scenes_T7-T11_v0.1), set up as
// the app would have them: characters with approved profiles, a venue with four named views,
// the scene's story, and a reply to the app's story request in its format, written as GPT
// writes them. Used by scripts/exercise.ts to check image 1, cameras and requests for any
// change, without drawing pictures. Made-up people and places.

export interface ExerciseCharacter { name: string; role: string; pronoun: "she" | "he" | "they"; appearance: string; wardrobe: string; voice: string }
export interface ExerciseScene {
  code: string;
  title: string;
  characters: ExerciseCharacter[];
  venue: { name: string; description: string; setting: "interior" | "exterior"; views: { name: string; directionDeg: number }[] };
  story: string;
  /** A reply to the app's story request, in its format. */
  reply: string;
}

export const SCENES: ExerciseScene[] = [
  {
    code: "T7",
    title: "The big trick",
    characters: [
      { name: "Kai", role: "skater", pronoun: "he", appearance: "Late 20s, slim, light brown skin, short bleached-blond hair with dark roots, a quiet grin.", wardrobe: "Mustard-yellow hoodie, black cargo trousers, white trainers; carries a skateboard with a green deck in his right hand.", voice: "a quiet, laid-back London voice in his late twenties" },
      { name: "Rosa", role: "Kai's friend, filming", pronoun: "she", appearance: "Early 30s, curvy build, olive skin, long dark curly hair in a high ponytail.", wardrobe: "Red puffer gilet over a white T-shirt, light-blue jeans, black trainers; holds a black phone in her right hand.", voice: "a loud, warm, encouraging voice in her early thirties" },
    ],
    venue: {
      name: "Riverside skate park", setting: "exterior",
      description: "An outdoor concrete skate park beside a brick railway viaduct: a deep concrete bowl, a street section with rails and ledges, a long graffiti wall, the viaduct's arches behind. Late afternoon, bright low sun, long shadows.",
      views: [{ name: "deep bowl and street section", directionDeg: 90 }, { name: "long graffiti wall and planting strip", directionDeg: 180 }, { name: "viaduct arches, walkway and maintenance doors", directionDeg: 0 }, { name: "access ramp, steps and brick plaza", directionDeg: 270 }],
    },
    story: `Kai and Rosa are at the big bowl in the skate park. Kai wants to land a trick he has practised all summer; Rosa wants it on camera. Kai drops into the bowl and carves across it while Rosa films on her phone from the edge. Rosa lowers the phone, grinning. Rosa: "That was clean! Do it again!" Kai stands on the far lip of the bowl, his board under his arm, and grins back. Kai: "Watch this next one."`,
    reply: `SCENE
SPOT: standing at the edge of the big concrete bowl
PROP: ledge - a low concrete ledge, knee-high, grey, with a metal edge
OTHER PEOPLE: few - a few skaters and BMX riders of different ages riding the street section; two people watching from the ledge
AREA: skate bowl - lowered - round, about 5 m across and 2 m deep, smooth grey concrete with metal coping

PANEL 1
ACTION: Kai stands on the rim of the skate bowl, the tail of his board under his back foot, ready to drop in; Rosa stands at the edge a few steps away, holding her phone up in her right hand to film.
IN FRAME: Kai, Rosa
PLACE: Kai - at the edge of the skate bowl; Rosa - at the edge of the skate bowl
DOING: Kai - stand; Rosa - stand
SPEAKER: none
LINE: none
EMOTION: focused
SECONDS: 3

PANEL 2
ACTION: Kai drops into the bowl and carves across the curve, knees bent, arms out for balance; Rosa films from the edge, phone steady in her right hand.
IN FRAME: Kai, Rosa
PLACE: Kai - in the skate bowl; Rosa - at the edge of the skate bowl
DOING: Kai - ride (skateboard); Rosa - stand
SPEAKER: none
LINE: none
EMOTION: fluid, thrilled
SECONDS: 5

PANEL 3
ACTION: Rosa lowers her phone with her right hand and grins as Kai rides up the far wall.
IN FRAME: Rosa, Kai
PLACE: Rosa - at the edge of the skate bowl; Kai - on the far wall of the skate bowl
DOING: Rosa - stand; Kai - ride (skateboard)
SPEAKER: Rosa
LINE: That was clean! Do it again!
EMOTION: delighted
SECONDS: 3

PANEL 4
ACTION: Kai stands on the far lip of the bowl, his board under his right arm, and grins back at Rosa.
IN FRAME: Kai, Rosa
PLACE: Kai - on the far lip of the skate bowl; Rosa - at the edge of the skate bowl
DOING: Kai - stand; Rosa - stand
SPEAKER: Kai
LINE: Watch this next one.
EMOTION: cocky
SECONDS: 3`,
  },
  {
    code: "T8",
    title: "First run",
    characters: [
      { name: "Elin", role: "ski instructor", pronoun: "she", appearance: "Mid-40s, tall and athletic, fair skin with a weathered tan, a long blonde plait.", wardrobe: "Red ski jacket, black ski trousers, white helmet with goggles pushed up on it, red skis and black poles.", voice: "a calm, patient Scandinavian-accented English voice in her forties" },
      { name: "Tom", role: "first-time skier", pronoun: "he", appearance: "Late 50s, broad and heavy-set, pale skin, grey beard, round glasses.", wardrobe: "Bright blue ski jacket, grey ski trousers, black helmet, rented silver skis and poles.", voice: "a nervous, jokey Yorkshire voice in his late fifties" },
    ],
    venue: {
      name: "Beginner slope", setting: "exterior",
      description: "The top of a gentle beginner slope at an Alpine ski resort: a small chairlift station, a wooden mountain café with a sun terrace, a line of pine trees, snowy peaks all round. Clear midday sun, bright white snow, deep blue sky.",
      views: [{ name: "beginner slope and valley below", directionDeg: 90 }, { name: "chairlift station", directionDeg: 270 }, { name: "wooden mountain café and sun terrace", directionDeg: 180 }, { name: "pine trees and snowy peaks", directionDeg: 0 }],
    },
    story: `Elin is taking Tom down his first ever ski run. They stand at the top of the beginner slope with their skis on. Tom stares down the slope, gripping his poles. Tom: "Are you sure this is the easy one?" Elin laughs and points down the slope with her pole. Elin: "Positive. Just follow my tracks." Elin pushes off down the slope; Tom takes a breath and shuffles after her.`,
    reply: `SCENE
SPOT: standing on the flat snow at the top of the beginner slope, just past the chairlift station
PROP: marker pole - orange, 1.5 m high, at the edge of the slope
OTHER PEOPLE: few - skiers and snowboarders of all ages coming off the chairlift and setting off down the slope; a beginners' group waiting in a line
AREA: beginner slope - slope - about 60 m long and 25 m wide, falls 10 m, groomed white snow

PANEL 1
ACTION: Elin and Tom stand side by side at the top of the beginner slope, skis on; Tom grips his poles with both hands and stares down the slope.
IN FRAME: Tom, Elin
PLACE: Tom - at the top of the beginner slope; Elin - at the top of the beginner slope
DOING: Tom - stand; Elin - stand
SPEAKER: Tom
LINE: Are you sure this is the easy one?
EMOTION: nervous
SECONDS: 3

PANEL 2
ACTION: Elin laughs and points down the slope with her right pole, her left hand on Tom's shoulder.
IN FRAME: Elin, Tom
PLACE: Elin - at the top of the beginner slope; Tom - beside Elin
DOING: Elin - stand; Tom - stand
SPEAKER: Elin
LINE: Positive. Just follow my tracks.
EMOTION: amused, reassuring
SECONDS: 3

PANEL 3
ACTION: Elin pushes off and skis down the slope in smooth turns; Tom takes a breath and shuffles forward after her, poles out wide.
IN FRAME: Elin, Tom
PLACE: Elin - partway down the beginner slope; Tom - at the top of the beginner slope
DOING: Elin - ride (skis); Tom - ride (skis)
SPEAKER: none
LINE: none
EMOTION: determined
SECONDS: 5`,
  },
  {
    code: "T9",
    title: "Campfire tea",
    characters: [
      { name: "Grace", role: "mother", pronoun: "she", appearance: "Early 60s, small and wiry, deep brown skin, short silver hair, reading glasses on a cord.", wardrobe: "Olive-green fleece, mustard knitted beanie, brown walking trousers, walking boots.", voice: "a dry, warm voice in her early sixties with a Caribbean lilt" },
      { name: "Leo", role: "her son", pronoun: "he", appearance: "Mid-30s, tall and broad-shouldered, brown skin, dark curly hair, short beard.", wardrobe: "Red-and-black checked flannel shirt over a grey T-shirt, dark jeans, brown boots.", voice: "a warm, playful London voice in his mid-thirties" },
    ],
    venue: {
      name: "Forest clearing", setting: "exterior",
      description: "A small clearing in a pine and birch forest, a lake glimpsed between the trees, a green dome tent at the edge of the clearing. Dusk, cool blue sky light, warm orange firelight on faces.",
      views: [{ name: "green dome tent and pines", directionDeg: 90 }, { name: "lake between the birches", directionDeg: 180 }, { name: "dense pine forest", directionDeg: 270 }, { name: "path into the woods", directionDeg: 0 }],
    },
    story: `Grace and her son Leo sit on two logs either side of a campfire outside their tent as the light fades. Leo wants to make his mum laugh; Grace is pretending she isn't cold. Leo lifts the kettle off the fire and pours tea into two enamel mugs. Leo: "Remember when Dad tried to cook on one of these?" He hands Grace a mug. Grace wraps both hands round it and laughs. Grace: "We lived on cereal for three days."`,
    reply: `SCENE
SPOT: sitting on two fallen logs either side of the campfire
PROP: campfire - a ring of stones about 1 m across, flames knee-high
PROP: fallen log - 40 cm high, about 2 m long, mossy bark
PROP: kettle - blackened metal, on a small grill over the fire
PROP: enamel mugs - two, white with blue rims
OTHER PEOPLE: none

PANEL 1
ACTION: Grace and Leo sit on logs either side of the campfire, the green tent behind them; Leo leans in and lifts the kettle off the fire with his right hand.
IN FRAME: Grace, Leo
PLACE: Grace - on the fallen log; Leo - beside the campfire
DOING: Grace - sit; Leo - sit
SPEAKER: none
LINE: none
EMOTION: cosy
SECONDS: 4

PANEL 2
ACTION: Leo pours tea from the kettle into an enamel mug held in his left hand, grinning at Grace.
IN FRAME: Leo, Grace
PLACE: Leo - beside the campfire; Grace - on the fallen log
DOING: Leo - cook (kettle); Grace - sit
SPEAKER: Leo
LINE: Remember when Dad tried to cook on one of these?
EMOTION: playful
SECONDS: 4

PANEL 3
ACTION: Leo hands Grace the mug; she wraps both hands round it and laughs, steam rising.
IN FRAME: Grace, Leo
PLACE: Grace - on the fallen log; Leo - beside the campfire
DOING: Grace - drink (enamel mug); Leo - sit
SPEAKER: Grace
LINE: We lived on cereal for three days.
EMOTION: laughing, warm
SECONDS: 4`,
  },
  {
    code: "T10",
    title: "Far enough",
    characters: [
      { name: "Dami", role: "party host", pronoun: "he", appearance: "Early 40s, tall and stocky, dark brown skin, shaved head, wide smile.", wardrobe: "White linen shirt open at the collar, navy shorts, tan loafers, gold watch; holds a champagne flute in his right hand.", voice: "a big, warm Nigerian-British voice in his early forties" },
      { name: "Chloe", role: "guest", pronoun: "she", appearance: "Late 20s, petite, pale freckled skin, long loose copper-red hair.", wardrobe: "Emerald-green sleeveless jumpsuit, white trainers, small round sunglasses pushed up on her head; holds a glass of rosé in her left hand.", voice: "a soft, curious Irish voice in her late twenties" },
    ],
    venue: {
      name: "Yacht deck at sea", setting: "exterior",
      description: "The open rear deck of a large white motor yacht out at sea: teak decking, a chrome rail round the edge, the cabin and raised upper deck behind, open sea all round, a hilly coastline far off on one side. Golden-hour sunset, warm low sun from one side, pink and orange sky.",
      views: [{ name: "stern rail and open sea", directionDeg: 90 }, { name: "cabin doors and upper deck", directionDeg: 270 }, { name: "port rail and distant coastline", directionDeg: 180 }, { name: "starboard rail and sunset", directionDeg: 0 }],
    },
    story: `Dami is throwing a party on his yacht. Chloe, a friend of a friend, has slipped away from the dancing to the rail to look at the sea. Dami raises his glass to his dancing guests, then spots Chloe on her own and wanders over to her. Chloe watches the coast, holding her drink. Chloe: "How far out are we?" Dami leans on the rail beside her and smiles. Dami: "Far enough that nobody can call us back."`,
    reply: `SCENE
SPOT: standing at the port rail of the rear deck
PROP: DJ booth - portable, waist-high, black, with a laptop and two speakers on it
OTHER PEOPLE: busy - about 25 party guests of all ages and builds dancing and chatting with drinks on the deck; a DJ at the booth; a waiter carrying a tray of drinks

PANEL 1
ACTION: Dami raises his champagne flute to his dancing guests in the middle of the deck; Chloe stands alone at the port rail behind him, looking out to sea.
IN FRAME: Dami, Chloe
PLACE: Dami - in the middle of the deck; Chloe - at the port rail
DOING: Dami - stand; Chloe - stand
SPEAKER: none
LINE: none
EMOTION: festive
SECONDS: 4

PANEL 2
ACTION: Chloe leans on the rail, the wind in her hair, her rosé in her left hand, watching the coast.
IN FRAME: Chloe
PLACE: Chloe - at the port rail
DOING: Chloe - stand
SPEAKER: Chloe
LINE: How far out are we?
EMOTION: wistful
SECONDS: 3

PANEL 3
ACTION: Dami walks over and leans on the rail beside Chloe, smiling.
IN FRAME: Dami, Chloe
PLACE: Dami - beside Chloe; Chloe - at the port rail
DOING: Dami - stand; Chloe - stand
SPEAKER: Dami
LINE: Far enough that nobody can call us back.
EMOTION: charming
SECONDS: 4`,
  },
  {
    code: "T11",
    title: "First jump",
    characters: [
      { name: "Niamh", role: "first-time jumper", pronoun: "she", appearance: "Late 40s, medium build, pale skin, shoulder-length auburn hair in a low ponytail.", wardrobe: "Purple jumpsuit, black soft helmet, clear goggles, black harness.", voice: "a breathless, excited Irish voice in her late forties" },
      { name: "Raf", role: "tandem instructor", pronoun: "he", appearance: "Early 30s, lean, olive skin, close-cropped black hair, stubble.", wardrobe: "Black jumpsuit with orange stripes down the arms, black helmet, tinted goggles, black harness, an altimeter on his left wrist.", voice: "a calm, clipped Spanish-accented English voice in his early thirties" },
    ],
    venue: {
      name: "Skydiving drop zone", setting: "exterior",
      description: "A small grass airfield used as a skydiving drop zone: a mown landing field, a metal hangar, a windsock, flat green farmland all round. Bright summer afternoon, scattered white clouds.",
      views: [{ name: "mown landing field and windsock", directionDeg: 90 }, { name: "metal hangar and jump plane", directionDeg: 180 }, { name: "flat farmland", directionDeg: 270 }, { name: "grass runway", directionDeg: 0 }],
    },
    story: `Niamh is doing her first tandem skydive, strapped to the front of her instructor, Raf. Inside the small plane they kneel at the open door, the wind roaring and the fields far below. Raf: "Head back, arms crossed. Ready?" They tumble out and fall belly-down above the clouds, arms spread, Niamh screaming with joy. They land on the grass field, their blue and white parachute collapsing behind them, and Niamh scrambles to her feet laughing. Niamh: "Again! Can we go again?"`,
    reply: `SCENE
SPOT: on the landing field
PROP: parachute - a large blue and white canopy
OTHER PEOPLE: few - a few skydivers packing parachutes on the grass by the hangar; a ground crew member walking out towards them

PANEL 1
ACTION: Inside the small plane, Raf kneels behind Niamh at the open door, strapped to her back, the fields far below.
IN FRAME: Raf, Niamh
PLACE: Raf - behind Niamh; Niamh - at the open door
DOING: Raf - kneel; Niamh - kneel
SPEAKER: Raf
LINE: Head back, arms crossed. Ready?
EMOTION: tense, thrilled
SECONDS: 3

PANEL 2
ACTION: Niamh and Raf fall belly-down above the clouds, arms spread wide, Niamh screaming with joy.
IN FRAME: Niamh, Raf
PLACE: Niamh - above the clouds; Raf - behind Niamh
DOING: Niamh - fall; Raf - fall
SPEAKER: none
LINE: none
EMOTION: exhilarated
SECONDS: 4

PANEL 3
ACTION: On the grass field, the blue and white parachute collapses behind them as Niamh scrambles to her feet, laughing.
IN FRAME: Niamh, Raf
PLACE: Niamh - on the landing field; Raf - beside Niamh
DOING: Niamh - stand; Raf - kneel
SPEAKER: Niamh
LINE: Again! Can we go again?
EMOTION: elated
SECONDS: 3`,
  },
];
