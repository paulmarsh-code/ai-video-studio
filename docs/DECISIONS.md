# Decisions log

Decisions made since Build Spec v1.4 was approved. Each one is folded into the next spec version.

| Date | # | Decision | By |
|---|---|---|---|
| 8 Nov 2026 | D1 | Build Spec v1.4 approved as the build baseline | Paul |
| 8 Nov 2026 | D2 | Builder: Claude Code, in a private Mind First GitHub repository | Paul |
| 8 Nov 2026 | D11 | **Animatic-to-rough-cut moves from "Later" into Phase 2** | Paul |
| 8 Nov 2026 | D12 | Database layer: **Drizzle ORM + better-sqlite3** instead of Prisma (still SQLite, still portable to PostgreSQL) | Claude (build), for Paul's review |
| 8 Nov 2026 | D13 | Database driver: **sql.js** (pure JavaScript and WebAssembly SQLite) instead of better-sqlite3, so it installs on any PC and any Node version with no C++ build tools | Claude (build), for Paul's review |
| 9 Nov 2026 | D14 | **The app directs:** once the storyboard, characters and setting are approved, the app proposes camera angles from established film grammar, suggests multi-shot clips where safe, and the user fine-tunes on the floor plan with impact warnings | Paul |

## D11: Animatic-to-rough-cut in Phase 2

When a Kling take is approved, it replaces its storyboard panel in the animatic timeline. The storyboard reel gradually becomes the finished episode, keeping the original timing and structure. Within the app, the workflow then runs continuously from story idea to final edit.

Requirements:

- **Slot replacement.** An approved take fills the picture slot of its linked panel through the panel ID and shot ID link (Stage 4A.3).
- **Length mismatch.** By default the take is trimmed, or its last frame held, so the episode timing stays locked. The user can choose to ripple the later clips instead. A take is never stretched or slowed without the user knowing.
- **Audio.** The slot switches from preview audio to the take's Kling native audio. Panels that have no approved take keep their placeholder or browser voice, so the reel always plays from start to end.
- **Versions.** The storyboard-only animatic is kept. A toggle switches between "Storyboard" and "Current cut". Each swap creates a new animatic version.
- **Progress.** The view shows, for example, "12 of 15 shots approved", with unapproved slots marked.
- **Export.** The MP4 export of the current cut uses the same ffmpeg pipeline as the animatic. The "ANIMATIC: NOT FINAL" watermark appears only while placeholder slots remain.

Acceptance tests (to be added to spec §6):

- **AT-21:** Approve a take for C4a. The C4a panel in the Scene 1 animatic is replaced by the take with its native audio. The total scene runtime does not change (trim/hold mode).
- **AT-22:** Switch to ripple mode with a take that is 0.4 s longer than its panel. Every later clip shifts by 0.4 s, and the scene runtime grows by 0.4 s.
- **AT-23:** Toggle between "Storyboard" and "Current cut". Both play correctly, and the storyboard-only version is unchanged.

Phase 2 exit evidence: each Paid On Time episode from 2 to 4 is shown progressing from a storyboard reel to the finished cut in the same timeline. This is also captured as marketing material.

## D12: Drizzle instead of Prisma

Prisma has to download engine binaries from binaries.prisma.sh. The cloud build environment blocks that site, so no Prisma code could be run or tested there. Drizzle is pure TypeScript and uses better-sqlite3, which installs from npm, so every database path now runs under the automated tests.

The intent of spec §2 is unchanged: structured SQLite persistence that can migrate to PostgreSQL (`drizzle-orm/pg-core`). Migrations are in `drizzle/` and are applied automatically on start. The domain layer has no dependency on the database library.

## D13: sql.js instead of better-sqlite3

On Paul's Windows PC (Node 26), better-sqlite3 tried to compile from source and failed because the Visual Studio C++ build tools are not installed. Most creators will not have those tools either.

sql.js is SQLite compiled to WebAssembly, so it needs no native code. The database is held in memory and written to `data/studio.db` after every change, using an atomic temp-file-and-rename. One database instance is shared per server process. This suits the single-user local app for Phases 1–2. Hosted multi-user use moves to PostgreSQL, which is the same route as before.

Test added: data survives closing and reopening the database file.

## D14: The app is the director

Paul's direction (9 Nov 2026):
1. When the storyboard, characters and setting are approved, the app chooses the camera angles for each shot. It uses proven film grammar: see `docs/CINEMA_RULES.md` for the rules and their sources (Arijon, Katz, Mascelli, Murch, Brown).
2. Where appropriate, it groups shots into Kling multi-shot clips: one speaker plus silent cutaways, or silent coverage, within 15 s and 6 cuts.
3. The user can adjust anything. The floor plan then shows the impact on every shot: screen side, shoulder, background, hidden faces, 180° line, and shots with approved takes that would need a re-shoot.
4. The rules library and the viewfinder comparisons are also sales and marketing material ("directed by a century of film grammar").

Implemented in `src/lib/domain/director.ts`, `impact.ts` and `geometry.ts` (occlusion), the Design shots page, and the floor plan's Impact panel.

## D15: Images come from GPT. Manual upload now, a direct link later

Paul's direction (9 Nov 2026): build the real Character, Venue and Storyboard steps now. For now he makes the images in ChatGPT and uploads them by hand. Later, an API or MCP link to GPT will automate it.

1. **The app writes every image prompt.** Prompts are built from approved data only, so the same inputs always give the same text (`src/lib/domain/imagePrompts.ts`):
   - character references: front, back and face;
   - venue views: one per named view, with no people;
   - storyboard panels: built from the approved characters, the venue, and the shot's camera framing on the floor plan, plus the genre's look.
   Each prompt lists the reference images to attach in ChatGPT.
2. **Manual route (now).** Copy GPT prompt, make the image in ChatGPT, upload. Character images narrower than 1:2 are rejected before upload, a lesson from testing.
3. **Automated route (later).** `src/lib/providers/images.ts` defines the `ImageProvider` interface. Setting `OPENAI_API_KEY`, and optionally `OPENAI_IMAGE_MODEL` (default `gpt-image-1`), turns on a "Generate with GPT" button beside every upload. An MCP connector can implement the same interface. With no provider configured, the app never claims an image was generated.
   - The OpenAI route has not been run against a live key yet. Test it with a real key before relying on it.
4. **Approval rules.**
   - Approved character versions are never edited. Any change, including a new reference image, creates a draft, and prompts keep using the approved version until the draft is approved.
   - Any venue change returns the venue to draft.
   - A storyboard dialogue change updates the shot's locked line, speaker and duration, and flags that panel in the animatic for a re-check.

## D16: Start from a picture or a one-line idea

Paul's direction (9 Nov 2026): writing detailed character and venue descriptions is a skill most creators don't have. The user should be able to give a picture, and the app turns it into a likeness (not an exact copy) that fills in the fields. The same applies to venues.

1. **Two ways in, for characters and venues:**
   - **From a picture:** a photo, sketch, mood board or AI image.
   - **From an idea:** one sentence.
   Both produce the same fields.
2. **The app writes a describe prompt** (`src/lib/domain/describe.ts`). It asks for a fixed labelled reply, which the app parses into the fields:
   - **Characters:** age, build, face, hair, skin, eyes, grooming, outfit, accessories, colour palette, identity anchors, mannerisms and a suggested voice.
   - **Venues:** setting, place, layout, materials, light, signature features and four named views with directions.
   The parser tolerates markdown, bullets and wrapped lines.
3. **Identity anchors** are the 3–5 features that must match in every image. They are a new character field and are written into every reference and panel prompt.
4. **Built-in rules:**
   - It is a likeness inspired by the picture, never a copy of a real person's face.
   - No names, brands, logos or known characters. ChatGPT flags known people or characters (`KNOWN: yes`), and the app warns the user.
   - Before using a picture, the user must say who is in it: "Inspiration only" (an invented character) or "A real person who has agreed". A real person needs a consent record, and approval is blocked without one.
5. **Manual route now:** copy the prompt into ChatGPT with the picture, paste the reply, and the fields fill in for checking.
   - **Automated route:** with `OPENAI_API_KEY` set, a "Describe with GPT" button calls `/api/describe` (`OPENAI_TEXT_MODEL`, default `gpt-4o`). This has not yet been tested with a live key.
6. **Proof test** (planned): rebuild the four Paid On Time characters from one image each, and from one sentence each. Make the three views in fresh chats and compare consistency against the hand-written descriptions.

### D16a: One prompt, one reference sheet (9 Nov 2026)

Paul's feedback: going picture → ChatGPT → app → ChatGPT was a step too many. Now the describe prompt also asks ChatGPT for **one reference-sheet image**: three panels for a character (front, back and face), or a 2×2 grid of the four views for a venue. The user pastes the text reply and uploads the sheet once, and the app cuts it into separate images.

- **ChatGPT doesn't draw equal panels.** On Paul's first real sheet the front, back and face panels took about 32%, 26% and 42% of the width. The app finds the joins by looking for edges that run the whole height of the image: it found 666 and 1193 px of 2048, against joins at about 665 and 1190 by eye (`src/lib/domain/sheet.ts`, tested on that sheet). The user can drag the cut lines before cutting.
- **Narrow pieces are padded, never cropped,** to the 1:2 minimum, using the sheet's own background.
- **The first sheet cropped the head off the front view,** and the face looked away from the camera. The prompt now requires a clear gap above the head and below the shoes, and eyes to camera.
- **If ChatGPT writes only the description,** a short "sheet request" can be copied and sent in the same chat.

### D16b: Asking for changes, personality, and a tidier page (9 Nov 2026)

Paul's feedback, all built:
- **Ask for a change, two ways.**
  - **For the whole character or venue:** "Change it" asks "Is there anything you want to change?" Yes opens guided boxes. For characters: how they look, what they're wearing, personality or mannerisms, anything else. For venues: the place itself, light and time of day, anything else. The answers become one change prompt. That prompt carries the saved description, says to change only this, and asks for the full labelled reply plus a new sheet. Paste the reply, fill in the fields and cut the sheet as before. The user attaches the current image so everything else stays the same.
  - **For a single image (a reference view, venue view or storyboard panel):** "Not right? Ask for a change" makes an edit prompt for that image. The current image is attached, only the change is made, and the original brief is repeated. Uploading the result replaces the image; the old one is kept as an earlier version.
- **Personality.** A picture can't show personality, so "From a picture" and "From an idea" have a Personality and mannerisms box. It drives the mannerisms, the suggested voice and the resting expression.
- **Tidier character page.** The front, back and face boxes stay hidden until the sheet is cut, or until "Or upload them one at a time" is chosen.
- **Buttons show their state.** Every action button shows when it is working and a ✓ when done, and stays done until something changes. Approved items show a ✓ badge.

### D16c: One Create button, a clean page (9 Nov 2026)

Paul's direction: the flow is **picture or idea → copy the prompt → in ChatGPT, paste it with the picture → paste the description and upload the 3-image board → Create**.
- **One Create button.** It fills in and saves the fields as a draft, cuts the board and attaches the images. The separate "Fill in the fields" and "Cut" buttons are gone. Venues work the same way: Create saves the description and the four views, then attaches the four board panels in order.
- **Nothing shows until there's something to show.** A new character or venue shows only its name and the open start panel. The description fields stay hidden (with an "Or fill in the details by hand" link), and the right-hand side is empty until Create has made the images.
- **Simple image boxes.** Each box has the image and "Need to change something?" only. Inside it, the user describes the change, copies the change prompt, attaches the current image and uploads the new one. The "Reference images…" text is gone.
- **The panel stays open after Create** to show the result, and offers "Change it" for further changes.

### D16d: Character creation, step by step (9 Nov 2026)

Paul's direction: too much on the screen. The Characters page is now **Character creation**:
- **One character at a time.** A row of names switches between characters, and **+ Add character** sits underneath.
- **A new character is built in three steps** (`CharacterWizard`):
  1. **Name, pronoun and role, and where the look comes from.** The options are an inspiration picture (an invented character with a similar look), a real person who has agreed, or no picture (describe an idea). A real person requires an **uploaded consent form** (PDF or image) before the picture can be uploaded, and the consent record is saved with the character. Then: Upload picture, "✓ Picture uploaded successfully", Next.
  2. **Personality and mannerisms,** then Next.
  3. **Copy [name]'s description** (the button shows "Copied"), with the message: "Go over to ChatGPT, paste the copied description and upload the picture you used". Then paste the reply, upload the image board and click **Create**.
- **After Create,** the page shows the full details on the left and front, back and face on the right. Later edits go through "Need to change this character?".

### D16e: Changing a character changes all three views and the description (9 Nov 2026)

Paul's test: he deliberately used a picture of someone dressed wrongly for a bartender role, then asked for a change to the outfit through the link under one image. ChatGPT made a good edit, but of that one image only. The other two views, and the saved description that every storyboard and Kling prompt uses, still showed the old outfit.
- **"Need to change something?" now sits directly under the three images** and changes the character. It produces an updated labelled description plus a new three-view board, and **Create** replaces the description and all three images together.
- **The per-image link is now a small "Fix just this image"**, for one-off problems with a single picture, such as a cropped head.

### D16f: Venues match characters, and change requests attach the current board (9 Nov 2026)

- **Venue creation page** (`/projects/[id]/venues`). It shows one venue at a time with a name switcher, and **+ Add venue** underneath. The old per-venue links redirect to it. A new venue is built in three steps (`VenueWizard`):
  1. Name, plus a picture of the place or an idea. Upload, then "✓ Picture uploaded successfully".
  2. **Describe the atmosphere:** indoors or outdoors, plus light, time of day and mood. This goes into the prompt.
  3. **Copy [venue]'s description**, then paste the reply, upload the 4-view board and click **Create**. The board labels use the view names from the reply.
  
  After Create, the details are on the left. The four views are on the right with no per-image links, and "Need to change something?" sits underneath them.
- **Change requests attach the current board.** Paul's second test of the bartender change still returned a single picture. The prompt had told him to attach the single front image, and ChatGPT copied that layout. Now the app builds the current board in the browser (front, back and face for a character; the 2×2 grid for a venue), offered as **Download current image board**. The prompt says to reply with "ONE new image board in exactly the same layout", and the board request says it "must be a three-panel board, not a single picture". If ChatGPT still returns one picture, **Copy board request** in the same chat asks again.

### D16g: Changes run as their own simple flow (9 Nov 2026)

Paul's direction: break the change flow down the same way as creation.
1. Click **Need to change something?** under the images, then **Yes**, fill in only what should change, and click **Submit changes**. The button shows "✓ Submitted".
2. **The page clears.** The fields and old images are hidden, as if starting again, and it shows "Your changes" plus the same final step as a new character or venue: **Copy [name]'s updated description**, an instruction to paste it into ChatGPT with the current image board (downloadable there), then paste the reply, upload the board and click **Create**. There's also a **Cancel changes** link.
3. **After Create,** the details and the new images return. The old images are kept as an earlier version.

New characters, new venues and changes now share one final-step component (`CreateStep`). The old combined panel (`StartFromPanel`) has been removed.

The one-click "Describe with GPT" button lived in that panel, so it is no longer on screen. The `/api/describe` connection point is unchanged and will be wired into the shared step when the GPT link is switched on.

### D16h: Changes that don't affect the look skip the image step (9 Nov 2026)

Paul's direction: if nothing changes what the person looks like, it should update differently.
- **Only "Personality or mannerisms?" answered:** **Submit changes** saves the new mannerisms straight away as a draft version. There's no ChatGPT step and no new board, the images stay, and the page doesn't clear. The message tells the user to check the voice lock still fits, then approve.
- **Anything about looks or clothes answered** (how they look, what they're wearing, anything else): the full change flow (D16g). Any personality change in the same request goes into that prompt too.
- **Venue questions are all about the look,** so venue changes always use the full flow.

## D17: Direct GPT link, one click from picture to finished character or venue (9 Nov 2026)

Paul's direction: when the user clicks Create, the app should talk to GPT itself. It sends the prompt and picture, gets back the description and the image board, and updates everything.

- **Create with GPT** (and **Recreate with GPT** for changes) appears in the shared final step when `OPENAI_API_KEY` is set. The manual ChatGPT route stays underneath as "Or do it by hand in ChatGPT", and is the only route when no key is set.
- **One click does three things** (`/api/gpt/create`):
  1. The text model writes the labelled description. It gets the description-only half of the prompt, everything before "Step 2", plus the picture where there is one.
  2. The image model draws the one-image board from that description (`characterBoardPrompt` / `venueBoardPrompt`), at 1536×1024.
  3. The board is stored, and the browser cuts and saves it exactly as for a manual upload: the same code, the same checks.
- **Which pictures go where** (likeness rules from D16):
  - **Inspiration picture:** sent to the text model only, to be described. The image model draws from the description, so a stranger's face is not copied.
  - **Real person with an uploaded consent form:** the photo is also sent to the image model, for the likeness.
  - **Place picture:** described, and used as the image reference.
  - **Changes:** the current views (front, back and face, or the four venue views) go as references, so it stays the same person or place.
- **If the board fails** (for example, the safety system refuses), GPT's description is kept in the reply box and the error is shown. The user can finish by hand with "Copy board request".
- **Settings** (`.env.local`):
  - `OPENAI_API_KEY` (required)
  - `OPENAI_IMAGE_MODEL`, default `gpt-image-2`
  - `OPENAI_IMAGE_QUALITY`, default `medium`
  - `OPENAI_TEXT_MODEL`, default `gpt-5-mini`
  - `OPENAI_BASE_URL`, used for tests
  
  The key is used only on the server and is never sent to the browser.
- **Cost.** OpenAI's guide, checked 9 Nov 2026, gives GPT Image 2 at 1536×1024 as about $0.005 (low), $0.041 (medium) and $0.165 (high) per image. A character or change is therefore one image plus one short text call: roughly 4–5p at medium quality. API use is billed separately from any ChatGPT subscription, and OpenAI may require organisation verification before GPT Image models can be used.
- **Testing.** Every check passed against a stand-in server that answers like the OpenAI API and logs each call (models, sizes, reference counts, and which pictures were sent where). **Not yet run against the real OpenAI API**: the first real run will confirm the model names and how OpenAI's policies treat real-person photos.

### D17a: Clean landing pages, and Create saves in one step (9 Nov 2026)

- **Characters and Venues open clean.** They show the breadcrumb, the row of names and **+ Add character** / **+ Add venue**, and nothing else. Choosing a name opens it, and the breadcrumb extends to "… / Characters / Jade". "Characters" in the breadcrumb returns to the clean page.
- **Bug fixed: a half-made character could be approved.** Create used to save the description first and then attach the images one by one. Saving made the page redraw and show Approve while the images were still attaching. Approving in that gap gave v2 approved, then a stray v3 draft from the late images. Now the board and the views are uploaded first, and the description and images are saved together in one step (`saveCharacterAction(..., refs)`, and `saveVenueAction` with `imageAssetId` on each view). This applies to new characters and venues and to both change flows.
- **Bug fixed: stale page after Create.** The builder asked for two reloads, and the older one could land last. It now does one (`goTo` in `src/lib/nav.ts`).

## D17b — Pictures to illustrate a change; replies cut at any drawing code (2026-11-09)

**Decision:** Each "looks" question in *Need to change something?* (character: how they look, what they wear, anything else; place: the place, light, anything else) takes an optional picture ("a jacket like this"). Personality has no picture. Pictures are stored as `change-reference` assets and listed in the change prompt after the current board: "use each reference picture only for what it illustrates; do not copy the face, body or identity of anyone in it" (places: leave out people, signs and text). By hand, the final step shows the pictures and offers them as downloads to attach after the board. With GPT, they go to the text model after the current front view and to the image model after the current views, and the board prompt says what the last N images are for.

**Also:** a text model added an SVG drawing after its description, which landed in the suggested voice. The text request now says "do not draw anything", and every reply (pasted or from GPT) is cut at the first sign of code (fenced block, `<?xml`, `<svg`, HTML) before it is read or sent to the image model.

## D18 — Tell the story, get the storyboard; projects and scenes from nothing (2026-11-09)

**Decision (Paul):** creators describe the video in their own words; the app supplies guide rails rather than forms. Built on his Glowvane scene as written (typos included).

1. **New project** is a three-step wizard. Step 1 asks what they're making (advert, mini drama, short film, series episode, social content, music video, other), how many parts, about how long each part is, and the shape (9:16 or 16:9), and shows a one-line summary such as "Mini drama, 4 parts of about 30 s, about 2 min in total". Step 2 asks who it's for (audience and where it's shown), the genre and the look. Step 3 is the story in outline. The brief is stored on the project (`briefOf` also reads the older episodes/episodeSec fields) and can be edited later.
2. **+ Add scene** takes a name, the venue and who is in the scene, using approved venues and characters only. The scene's target length starts from the brief's part length. Scenes gain `cast`, `story` and `target_sec` (migration 0002).
3. **The story step** is one big box with guide rails beside it:
   - target length (15, 30, 60 or 90 s);
   - Kling's 3 to 15 s clips, with one speaker per clip;
   - a live count of spoken lines found in quote marks and the time they take;
   - the time left for action;
   - lines too long for one clip;
   - "Show me an example" for the project's genre, or the advert example.

   **Library examples (planned, Paul 9 Nov):** "Show me an example" becomes a dropdown of finished library videos by title, filtered to the same genre and kind of video (for example a comedy-horror mini drama lists 'I lost my head' and 'Death becomes you'). Choosing one shows that video's material for the step the user is on (its scene story on the story step, its character description on the character step, and so on) with an option to watch the finished video. Built-in examples fill the list until the library has real ones. Each library video can be rated 1 to 5 stars by signed-in users: one rating per account, none on your own work. The dropdown shows the average and the number of ratings ("★ 4.6 (23)"), best rated first within the matching genre and kind. **Marketing rights (Paul 9 Nov):** submitting a video to the library also grants Mind First a non-exclusive, royalty-free licence to use it in its own promotion (YouTube, social, website), with optional credit to the creator. It is shown beside the submit button with its own tick box, not buried in the terms. A video showing a real person qualifies only if that person's consent form covers promotional use. Removing a video from the library stops new use; posts already published may stay. Wording to be checked by a solicitor. **Access (Paul 9 Nov):** only paying users can view library uploads or upload their own. Founding testers count as paying. The built-in examples stay open to everyone. Free-trial users can view the library but not upload (agreed). The website shows a public teaser: titles, genres, kinds of video and star ratings, with no videos or stories (agreed).
4. **Create the panels.** A single GPT call (or ChatGPT by hand) turns the story into labelled panels: ACTION, IN FRAME, SPEAKER, LINE, EMOTION and SECONDS. The project brief and the story are sent as written.
   - Quoted words are kept, with only spelling corrected.
   - Names that aren't in the scene are treated as background and shown to the user.
   - Spoken panels are sized to their line, and silent panels are clamped to 3 to 15 s.
5. **Check the panels.** The user can edit, reorder, add or delete panels. Every guide rail is checked live, and saving is blocked until the panels marked in red are fixed.
6. **Save storyboard.** Panels and their shots are created in one step: visible and excluded characters, speaker, locked line, length and audio. For a new scene, a first floor plan is also made from the story. The main talker faces the group, and the line of action runs between the two who talk most. With that plan, Design shots works straight away.
   - The storyboard can be rewritten from the story while no panel is approved.

**Next:** panel pictures after the app picks the cameras, made in one click for all panels with the same change flow as characters; then simplify the storyboard page.

## D18a — Storyboard pictures in three steps: cameras, pictures, approve (2026-11-09)

After the story is saved, the storyboard is one screen with three steps across the top and the panels as a picture grid below (portrait or landscape to match the project):

1. **Cameras.** One click picks every panel's camera. It uses the director's top-rated option from the film grammar rules, saves the result as a new floor plan version and assigns each shot. Design shots stays available for picking other options.
2. **Pictures.** "Create N pictures with GPT" draws every panel without a picture, one after another, at about 4p each. Each drawing uses the panel request: the chosen camera's framing, the approved characters' pictures (the back view for an over-the-shoulder foreground), and the venue view behind them. It waits until cameras are chosen, so each picture matches its shot. A failure is shown on that panel and the rest carry on. By hand: copy the picture request, attach the listed pictures in ChatGPT, then upload.
3. **Approve.** Approve each picture, or all of them at once. A new picture always returns its panel to draft.

**Need to change something?** on any picture asks two things, "What should change in this picture?" and "Anything else?", and accepts an optional reference picture. GPT redraws from the current picture, then the character and venue pictures, then the reference. By hand, it shows the change request to copy and the pictures to attach.

The old per-panel editor is tucked under "Edit the words on a panel", along with "Add a panel". Rewriting from the story is offered until any panel is approved.

## D18b — Sturdier GPT requests: smaller reference pictures, longer wait, one retry (2026-11-09)

Paul's first real storyboard run drew 7 of 11 panels. The other 4 failed every time with "fetch failed": the connection to OpenAI dropped, so the request never got an answer. The failures matched the panels with the most people, each sending four or five full-size reference pictures.

- Reference pictures are now sent at no more than 1024 px on the longest side, as JPEG, to both the image model and the text model. A full-size PNG board is several MB; the smaller version is about a tenth of that. This also cuts the input cost.
- The server now waits up to 10 minutes for OpenAI instead of Node's default 5.
- If the connection fails, the request is retried once. If it fails again, the error includes the network cause.
- Failures are explained in plain words in the summary and on each panel (safety check, account limit, timeout, refused request), and logged in the terminal with the number of reference pictures.
- `sharp` and `undici` are now direct dependencies.

## D18c — Scene setting and continuity: the same spot and crowd in every picture and clip (2026-11-09)

Paul's first real storyboard (11 panels) showed two problems. The group's cocktail table vanished after panel 2, and Chase ended up leaning on the bar. The launch event also had no other guests. This caught the problems for about 40p of pictures, before any Kling credits were spent.

- **Scene setting.** Each scene now stores where the characters are (for example around a tall round cocktail table) and who else is there (for example about 30 well-dressed guests mingling). The story request asks GPT for both first, in SPOT and BACKGROUND lines. A crowd rule makes GPT describe background people whenever the story is at an event, party, bar or other busy place, or mentions other people. Both lines can be edited when checking the panels, and on the storyboard. **Suggest from the story** fills them in for scenes saved before this existed, with a ChatGPT route as well.
- **Every shot carries the setting.** Saving the setting updates every shot in the scene.
  - Picture requests add "Where: …" and "Background: …". Background guests are out of focus, smaller than the main characters, never look at the camera and never look like the main characters. A single character is "the only one in the foreground", where before they were "the only one in frame".
  - **Kling prompts** add the spot and background people to the scene line. They no longer say "No other people visible" when the scene has a crowd, otherwise every clip would come out empty too.
- **Continuity picture.** The approved picture showing the most people is attached to every other panel's request as the "approved scene picture (panel N)". GPT is told to keep the same spot, furniture, background guests, light and clothes, and to change only the camera angle and the moment.
- **First floor plan.** When the setting names a table, bar, counter, sofa or similar, it is placed between the group.
- **Redraw the unapproved pictures** redraws, in one go, every picture not yet approved, using the new setting and the continuity picture.

## D18d — Group scenes: blocking around the spot, close-ups, people at the edge of frame (2026-11-09)

From Paul's second run on Jades Entrance. Panels 3, 4, 6, 9 and 11 were close to approval; 5, 8 and 10 were wrong. His data showed four causes:

1. **The setting was never saved.** He suggested it but didn't press Save. **Suggest from the story now saves straight away.** The Pictures step warns when the setting is empty.
2. **The first floor plan put Marcus and Nina between Chase and Jade.** In panel 10 the close-up on Chase was shot from Jade's side, so Marcus filled Jade's place. **The plan now places people around the spot:** the two main talkers face each other across the table, and everyone else stands on the far side, never between them. The table sits in the middle. Saving the setting rebuilds a floor plan the app made itself and clears its cameras, so the app chooses them again. A plan the user has edited is kept.
3. **People not named in a panel were banned from it.** In panels 5 and 8 the group vanished from the table. In a group scene, anyone with a setting spot is now *nearby*, not excluded. If the camera would see them, picture and Kling prompts show them partly at the edge of frame, out of focus and silent. Their reference pictures are attached.
4. **The foreground shoulder rule.** A foreground person "seen from behind over the shoulder" is now used only on over-the-shoulder cameras. A close-up shows only its subject, with "the others are out of frame".

Also:
- A venue view used as the background is described as an empty room to fill with the described guests.
- The continuity picture keeps the spot, furniture, light and clothes, but if it shows fewer guests than the setting, GPT adds them.

Checked by replaying Paul's own scene data with the fixes. Every request now carries the table and the crowd. Panels 5 and 8 include Marcus and Nina at the edge. Panel 10 shows the whole group, with Jade where she should be.

## D18e — Strict positions, posture and precise gestures in every request (2026-11-09)

From Paul's third run. Marcus and Nina swapped places (panels 3 and 7) or vanished (4, 5, 8 and 10), Chase leaned on the table, the table changed height, and a "dismissive wave" was drawn as a stop sign. These are general fixes, not fixes for this one scene.

- **Order and count.** Every multi-person picture now states "Exactly N people in this picture, from left to right: A, B, C and D. Keep this left-to-right order; do not swap anyone." The order comes from the camera's view of the floor plan.
- **Supporting people are never optional.** People at the spot whom the camera sees are "clearly in the picture… less prominent than [subject] but never left out". They used to be "partly visible, softly out of focus", which GPT treated as optional.
- **Place and posture.** The spot stays the same height and size, and everyone keeps their own place and posture: standing upright, unless the spot says they sit. No one leans on furniture unless the moment says so. The same rule goes into Kling prompts. The continuity picture keeps the furniture at the same height and size.
- **Gestures.** Common gestures are spelled out precisely in picture and Kling prompts: shoo-away, stop, shrug, eye-roll, pointing, facepalm and toast. The story request asks GPT to describe gestures precisely, and the setting request asks for the size, height and colour of what people gather around, and whether they stand or sit.

## D18f — Layout sketch: the geometry goes to GPT as a picture (2026-11-09)

Words like "frame-left" are read loosely, so positions drift even when the floor plan is right. For each panel with a camera, the app now draws a layout sketch from the floor plan through that camera:
- labelled figures where each person stands, nearer people drawn bigger;
- the furniture at its height;
- the eye line;
- the venue view behind.

The sketch is rendered as SVG, then turned into a PNG with sharp. It is attached last to every GPT picture request and change, with "use it for positions, sizes, angle and the table; copy nothing of its style". It can also be downloaded on the by-hand route from `/api/layout/[shotId]`.

The sketches also showed that the camera chooser places cameras badly for a group around a table: people stand in front of the subject in two-shots, and the wide shot is too far back. That, together with approving and locking positions and cameras and adding key props, is the next work (D19).

## D19 (part 1) — Camera chooser fixes for groups and portrait frames; sketches on the board (2026-11-10)

Paul's principles (general, for every project): positions and props are fixed by the geometry and approved once; cameras are approved once; pictures and clips only follow them.

Part 1 fixes the camera chooser, which the layout sketches showed was placing cameras badly for a group around a table:

- **Portrait lens angle.** A preset's lens angle now applies to the frame's long side. A 9:16 frame sees a narrower width (`horizontalFov`, from `plan.aspect`). Before, portrait "wide" shots were extreme wide-angles with tiny people. The project's shape is stored on new floor plans and added when cameras are chosen. Older plans without it count as landscape, so they behave as before.
- **People nearby block the view.** Face and body occlusion now count everyone standing there who isn't framed out, not just the panel's named people. A hidden face still rules a camera out.
- **Overlap is costly.** Any visible person covered by another costs more, especially in group and wide shots where everyone must be seen. The over-the-shoulder partner is exempt. A group or wide camera with someone much nearer the lens than the rest is penalised.
- **Group and wide distance fit the group.** Cameras stand far enough back for everyone to fit across the frame, and the ideal distance is scored the same way.
- **Sketches on the board.** Before a picture exists, each panel shows its camera view from the floor plan, so the angle can be checked before paying for a picture. Once a picture exists, there is a "See the layout" link.

Result on Jades Entrance: the over-the-shoulder shots and close-ups are correct, and four group shots show all four around the table, unblocked. The two-shots at panels 2 and 9 and the opening wide still overlap slightly.

**Part 2 (next):** key props in the scene build. Approve and lock positions, then cameras, with lock enforcement on the floor plan, Design shots and setting saves. Pictures only from approved geometry.

## D19 (part 2) — Key props, other people, approve-and-lock, and the picture check (2026-11-10)

Paul's expectations, for every project:
- Characters are never out of position, because positions are approved.
- Shots are never geometrically wrong, because cameras are approved.
- An important prop is in the shot and the same as in earlier shots.
- Other people expected at a busy event are always there.

**Scene elements.** The scene setting now holds four things:
- where the characters are, and whether they stand or sit;
- **key props** (name, plus size, height and colour);
- **other people** (none, a few or busy, plus a description).

GPT returns them first in the story reply (SPOT, PROP and OTHER PEOPLE lines), and they can be edited at both the check step and on the storyboard. Key props go on the floor plan. The prop the group gathers around stands in the middle of the group, the others a few metres away. Each gets a height taken from its words: "chest-high" or "110 cm" gives 1.1 m, "coffee table" 0.45 m, a desk 0.75 m. Every shot carries the props and the other people. Picture prompts list the key props as "identical in every picture" and name which props this camera sees ("In this picture: the cocktail table (left). It must be clearly visible."). Kling prompts list them too. The layout sketch draws props at their height and draws the other people as grey figures in fixed places behind the cast, the same in every camera view.

**Approve and lock.** The storyboard has four steps: Positions, Cameras, Pictures, Approve.
- Positions show a top-down view of people and props. Approving locks that plan version.
- The cameras can only be chosen once positions are approved. Approving them locks them, and every camera has to exist.
- Pictures can only be drawn once cameras are approved.
- The server enforces this:
  - The floor plan editor refuses to move, add or remove people or props while positions are locked, and refuses any camera change while cameras are locked.
  - Design shots and "choose cameras" refuse while cameras are locked.
  - A setting change never rebuilds a locked plan.
  - A new storyboard keeps the positions lock and drops the cameras lock.
- Unlocking is deliberate, with a confirmation. Unlocking positions also unlocks cameras.

**Close-ups follow the panel.** A close-up is only allowed when the panel shows one or two people, or for an emotional peak. A panel that lists the group gets a shot of the group.

**Picture check.** After each GPT picture, the vision model receives the picture, the layout sketch and the characters' front pictures. It reports who it sees left to right, the props it sees and whether there are background people. Pass or fail is decided by rule against the approved layout: everyone present, in the right order, the key props visible, and background people if the scene has them. On a fail, the app redraws once with the problems spelled out; if it still fails, it keeps the picture and the panel shows why. Results are saved on the panel. A check costs well under 1p.

Replay of Jades Entrance with the table and a busy crowd: every camera view shows the table and the guests behind the cast. The over-the-shoulder and close-up shots are correct, and most group shots show all four unblocked. Panels 1, 2 and 7 still have some overlap: approve-then-lock lets the user pick another option in Design shots before approving, and the picture check catches any picture that still comes out wrong.

## D19a — Fixes from the first locked run (2026-11-10)

Paul approved most pictures by mistake, moved Marcus on the floor plan, and asked a change to fix Marcus and the table size. His data showed four general faults:

1. **A move on a locked floor plan was refused quietly.** The plan page now shows a clear banner when positions or cameras are locked, explaining how to unlock them on the storyboard.
2. **Two prop lists drifted apart.** Props edited in the scene setting after positions were locked differed from the floor plan's, so the request named one set while the sketch and check used the other (hence "the branded backdrop is missing"). Once positions are approved, the floor plan's props are the only list. Approving positions or cameras copies them to the setting and every shot. Picture prompts read them from the plan. The setting card shows them read-only, and a setting save keeps them.
3. **A change edited the old picture, which never moves anyone.** Picture changes now start with "Is anyone or anything not where the layout sketch shows, or the wrong size?" A place or size answer redraws fresh from the panel's full request and the layout sketch, with the user's words as what the last attempt got wrong. Other changes still edit the current picture. The form explains that moving someone for every shot is done on the floor plan, after unlocking positions.
4. **There was no undo for an approval.** Approved pictures now have an "Undo" link.

Also:
- **Floor plans saved by hand are named "Floor plan edited by you".** Before, they inherited the app-made plan's name, so a later setting change could rebuild them and lose the user's edits.
- **Stale pictures.** Each picture remembers the floor plan version it was drawn from. Approving a new camera layout sends older pictures back to draft, marked "Drawn from an earlier layout", ready for "Redraw the unapproved".

## D19b — Props that stay the same, arrivals, and cameras that always fit (2026-11-10)

Paul's redraw of "Jade's Entrance" after D19a: the table was in every shot but lost its cream cover and changed its display; shot 1 looked as if Jade had already arrived and Chase was missing; Marcus was misplaced in shot 4; shot 10 had a screen right beside the group; shot 11 was a close-up where he wanted the wider shot. Replaying his saved scene through the code found these general causes and fixes:

1. **The prop list said "matte black top".** The picture followed the list, so the cover only appeared when GPT improvised. With positions locked, a prop's look (name and description) can now still be edited; its place can't. Every picture says to show each key prop "exactly as described, every time, with nothing extra on or around it".
2. **There was no "arriving" place.** The floor plan had one spot per person, so "Jade enters" was drawn with Jade at the table. Approving positions now adds movement marks from the story's wording: *arriving* (about 3 m out) and *approaching* (a step or two away). They come in from the camera's side of the group (people standing off the line of action are placed facing the camera), so a camera can stand behind the arriving person, inside the room, and see the group across the room. Arrival shots now use that framing.
3. **The background read as being right behind the group.** Pictures now say the background is "across the room several metres away. Nothing stands right behind them." On approving positions, a big flat prop (a backdrop, a screen) standing within 3.5 m of where the group gathers is moved back to about 4 m, as a new plan would place it. Props are drawn by kind in the layout sketch (table, flat panel, column), with heights and widths read from their descriptions; the name decides the kind first ("cocktail table … slim pedestal" is a table).
4. **An exit counted as an emotional peak.** Walking off now always counts as an exit and gets a wide or group shot.
5. **Cameras:** tall props that hide a face rule a camera out, and low props cost a little. A group too wide for the normal lens at a distance the room allows gets a wider lens (up to the wide angle), so the camera can face the group from inside the room. Everyone the panel needs must be wholly inside the frame. Someone else whose face is hidden behind another person costs heavily (the picture tends to drop or move them: Marcus in shots 4 and 8), and anyone cut by the frame edge costs a little. If nothing fits a moment, the app falls back to a wide shot, then to following the panel's main person. A panel is never left without a camera.

To apply on an existing scene: correct the table's description in the scene setting, then Change positions → Approve positions (adds the marks, refreshes prop sizes and the backdrop's place) → Let the app choose the cameras → Approve cameras → Redraw the unapproved.

## D19c — Prop pictures, faces, and layouts made under older rules (2026-11-10)

Paul redrew Jade's Entrance after D19b and saw little change. His saved data showed why, and each cause has a general fix:

1. **The layout was still the old one.** He edited the props but didn't re-approve positions or re-choose cameras, and the app gave no warning. Every plan now records the version of the layout rules that made it (`rules`). When the rules have improved since, the storyboard shows "The app's layout rules have improved" with one button, **Update the layout**. It keeps everyone's approved place, adds arrival spots, refreshes prop sizes, and chooses the cameras again for the user to check and approve.
2. **Prop pictures.** Each key prop in the scene setting can have a reference picture, including while positions are locked. It's stored with the floor plan and sent with every panel picture where the camera sees that prop, with the line "Use the attached … picture for exactly how it looks".
3. **What a prop is, is locked with the positions.** Renaming "branded backdrop" to "bar counter" while locked had put the bar where the backdrop stood. Now, once positions are approved, a prop's name is fixed; only its description and picture can change. When positions are not locked and the plan was edited by hand, edits in the setting are merged into the plan by name (places kept, new props placed, removed ones taken off), so nothing typed there is lost at approval.
4. **Prop height came from what stood on it.** "Chest-high at 110 cm … a glass 15 cm tall" read as 15 cm. The first height mentioned is now the prop's own. Long props (a bar, a counter) take their width from the description.
5. **Faces.** The camera chooser now knows which way people face: the two people on the line of action face each other, others face the spot they're gathered round, and someone arriving faces the group. The panel's main person is never filmed from behind, except someone still arriving, filmed walking in. Anyone else the panel needs costs heavily when seen from behind. Close-ups are placed in front of where the subject is looking.
6. **Arrivals start further back.** Up to 5 m from the group, on the path that leaves room behind the person for a camera. An opening shot is rewarded for showing the people already there: Jade in the foreground, Chase, Marcus and Nina across the room.
7. **Other camera fixes.** A bystander hidden behind an over-the-shoulder partner now counts as hidden. A prop right in front of the lens is penalised, and a camera can't stand inside a prop. Screen sides are kept for the two people on the line of action only: bystanders swap sides in a reverse angle, as in any film.
8. **General scenes in the tests.** `tests/scenes.test.ts` runs four made-up scenes through the same path: two friends at a bar (portrait), a dinner table of six (landscape), someone walking into an empty office, and a launch party. Every one must give every panel a camera inside the room, keep every needed person in frame with no hidden face, and never film the main person from behind (except an arrival). A change that only suits one scene fails here.

## D19d — Suggestions never overwrite, and pictures told how far away things are (2026-11-10)

From Paul's next redraw:

1. **"Suggest from the story" replaced his table description and picture.** It replaced the whole setting with GPT's reply, including the "matte black" table, and dropped the picture. Suggestions now only fill gaps. A spot or crowd is taken only where empty. A prop already listed keeps its description and picture (an empty description is filled from a same-named suggestion). New suggested props are added only when positions aren't locked. With positions locked, edits now reach the plan by prop name, never by list position: that's how "champagne flutes" had ended up with the display plinth's description.
2. **GPT lined everyone up like a group photo** (shots 1–3), and props drifted: the plinth stood in front of Jade in one shot and behind her in the next. A left-to-right list doesn't say how far away anyone is. Every picture now gets a "Distance and direction" line from the floor plan: each person's distance from the camera and whether they face the camera, are seen side-on or are seen from behind. When distances differ a lot it adds "whoever is further away is smaller and further back in the room, not lined up beside …". Each prop in view now has its distance too, and whether it stands among the people, in front of them or behind everyone, with "nothing else like it anywhere else in the picture".
3. **Approach shots.** Someone walking up to the group (the "approaching" mark) may now be filmed from behind as they walk, like an arrival, so the group stays in the picture. Before, the app had to choose between her face and the group in portrait and chose a lone shot of Jade.
4. **The picture check** no longer counts the over-the-shoulder foreground person as an extra.
5. Layout rules are now version 3, so existing scenes show "Update the layout".

On background changes: the background behind the group follows the camera direction. Shots 1–3 look towards the bar, the over-the-shoulder shot towards the lounge, and the group shots towards the screen wall, where the logo backdrop stands. That's correct for the floor plan. If a scene should keep one background, the floor plan is where to change it.

## D19e — Nobody drops out of the picture (2026-11-10)

Paul's next redraw: in shots 4 and 8 (over-the-shoulder) Marcus and Nina were missing; Nina was missing in 5; Jade was missing in 6. Shot 3 had Jade still short of the table though the panel says "as she reaches them". Shot 1 had her too close to the lens. Her bag changed hands, and the skirt's orange panel was lost from behind.

The picture check passed these shots because, by the plan, those people really were out of frame: the over-the-shoulder and two-shot framings had cropped them. Paul expects everyone standing together to stay in the picture. That's the general rule now:

1. **Everyone standing with the group stays in frame.** Each cast member present (not excluded) whom a camera leaves out, or sees only as a shoulder, costs 2.5. Close-ups are the exception, being chosen for a moment on purpose. In a small standing group, group shots now win over over-the-shoulder shots that crop people.
2. **"Reaches them" means at the table.** Wording like "as she reaches them", "joins the group" or "arrives at the table" means the person is in their place by the end of the panel, so no "approaching" mark is used.
3. **Arrivals are filmed from further back.** The camera stands 2–3 m behind the person walking in, not 1.5 m. The arrival mark leaves room behind it for that.
4. **Clothes and carried items.** The reference line now says every pattern, stripe and colour block is kept, and bags stay in the same hand or on the same shoulder.
5. Layout rules are now version 4, so existing scenes show "Update the layout".

Known trade-off: with everyone kept in frame, a scene of a small group gets similar-looking group shots. Variety comes from the moment and the close-ups.

Addendum (D19e): **approved pictures are kept when the cameras change.** Approving a new camera layout used to send every picture drawn on an earlier layout back to draft, including ones Paul had approved (shots 7, 9 and 10 were fine). An approved picture is the user's judgement, so it now stays approved with the note "Approved by you on an earlier layout and kept. Redraw it only if it no longer fits." Unapproved ones still go back to draft, marked to redraw.

## D19f — Backs of clothes, and the room keeps its order (2026-11-10)

1. **Jade's clothes changed when seen from behind** (the skirt's orange panel lost, the bag in the other hand). Only the over-the-shoulder figure got the back reference image. Anyone else seen from behind, like Jade walking in, got only the front image, so GPT invented the back. Now anyone whose back is to the camera by the floor plan gets their back image as well as the front one, with "copy the back of their clothes, hair and bag exactly from the attached back image".
2. **The room's layout swapped between shots** (banner then bar to the left of the screen wall in some shots, the other way round in others). Only the one venue view straight ahead was described. Each picture now also says which venue views lie to its left and right ("the bar is to the left of the screen wall; the lounge seating is to the right … stays on that side"), worked out from the views' directions and the camera's.

## D20 — The room as a 360° ring; places round the table; start and finish positions (2026-11-10)

Paul's direction: every camera should have a 360° reference of the room, and the camera's own position, angle and lens should decide which part is cut out as the background. Characters are fixed for a shot unless moving, in which case they have a start and a finish. Each frame should say where people stand relative to the table and which way they face. Props never move unless a panel says someone moves them.

1. **360° ring.** A venue's view pictures (screen wall, bar, lounge, entrance) are joined round a ring in compass order, each taking the ring halfway to its neighbours (`panorama.ts`, `backgroundImage.ts`). For each shot, rays through the frame's left and right edges are cast from the camera's position to the room's walls, and where they land is read as an angle from the middle of the room. That slice is cut from the ring and sent to GPT as the background, replacing the single nearest view. Turning the camera slides the room the right way, a longer lens cuts a narrower slice, and moving the camera gives parallax. With fewer than two view pictures the old single view is used. Served at `/api/background/[shotId]`. Later: a true 360° picture per venue (uploaded or generated) can replace the joined ring with no other change.
2. **Places round the table.** Every picture now has an "Around the table" line: each person in frame is either "at the table, on its left/right, behind/in front of it" or "about N m from the table, not at it", plus whom they face (their talking partner, the table, the group). It ends with "Nobody stands anywhere else."
3. **Start and finish.** Each person is where the previous panel left them. A panel that moves someone records where they start (`from`); the still picture shows where they end. "Reaches them" or "joins the group" starts from the last mark and ends at their place. The video prompt says "Jade walks from … to … during the shot". Positions are re-read from the panel text every time positions are approved, so editing the story changes them.
4. **Props stay put** unless a panel says someone moves one ("pushes the table aside", "knocks over the plinth"). The positions step lists those panels; the picture for that panel says the prop starts in its usual place, and every other prop stays where it is.
5. Layout rules are now version 5, so existing scenes show "Update the layout".

## D21 — Three things that must always hold, and the check that enforces them (2026-11-10)

Paul's three non-negotiables:

1. Characters are always consistent.
2. Moving the camera shows the venue in 360°, and a chosen shot (position, distance to the subject, lens) cuts its background from the 360° reference with the perspective kept.
3. Props, like characters, stay consistent and in place unless the scene moves them.

Where each stands:

1. **Characters.** Front, back and face references are attached: the back one whenever someone is seen from behind (D19f). Each picture says to copy every pattern, stripe and colour block, and which hand holds what. New: the automatic check now gets each character's front and back references and reports, per person, whether the clothes match and what differs. A difference fails the check and triggers the one automatic redraw with the difference named ("Jade's clothes differ from the reference: skirt has no orange panel").
2. **Venue in 360°.** The background is cut from the venue ring for each camera (D20). New: the floor plan's viewfinder shows the real venue ring behind the people and updates live as a camera is dragged, aimed or zoomed. A **Lens** slider (15°–90°) sets each camera's lens, and choosing a preset resets it. The ring is served small at `/api/venue-ring/[sceneId]`, with `?meta=1` giving where it starts, so the browser cuts the slice itself. The check now also asks which venue area is at the left and right of the background, and fails if they are the wrong way round. Backdrops and screens are drawn on the floor plan as panels facing the group, not as circles.
3. **Props.** Places come from the floor plan; looks come from the description and picture (D19c, D19d); props move only if a panel says so (D20). New: the check gets each prop's picture and reports each prop's side of the frame, its depth (among the people, behind everyone, in front of everyone) and whether it matches its picture. A prop on the wrong side, drawn beside the people when it belongs behind them, or not matching its picture fails the check.

Known limits: the 360° ring is joined from separate pictures, so its joins aren't seamless. Camera height and tilt aren't modelled yet (the camera is always at eye level, looking level). The check relies on a vision model, which can miss small differences.

## D21b — Who looks at whom; arrivals worked out afresh; props seen across their real extent (2026-11-10)

From Paul's next redraw (much better: geometry and positions right in shots 1–3, 5–8 and 10–11):

1. **Jade was nearer in shot 1 than in shot 2.** His floor plan still had the arrival spot from an earlier version, only 1.2 m from the wall. So no camera could stand behind her, and shots 1 and 2 got two different cameras, one of which saw only Jade (GPT added a table beside her). Arrival and approach spots are the app's own and are now worked out afresh from the story every time positions are approved, never kept from an older layout. Shots 1 and 2 now share one spot and one kind of shot: Jade in the foreground with the group across the room.
2. **Shot 4: a display next to Marcus, and Jade missing.** The 3 m logo backdrop was treated as a 1.5 m circle round its centre. A camera that only grazed its end counted it as "in front of everyone, 1 m from the camera". Props are now seen through points across their real extent: a long thing is a line facing the group, anything else a ring. Shot 4 is now a group shot with all four.
3. **Nobody looking at anyone** (shots 9–11). Bodies had a facing direction, but eyes had no instruction. Every picture and video prompt now has a "Who looks at whom" line, by general rules:
   - The panel text wins ("looks at", "turns to", "spots", "exchange glances").
   - The speaker looks at their partner on the line of action (or the group).
   - Everyone else looks at the speaker, or at the panel's main person when nobody speaks.
   - Someone still arriving goes unnoticed: the others keep talking among themselves.
   - Nobody looks at the camera.

   The check now fails a picture where a main character looks into the lens.
4. Layout rules are now version 6, so existing scenes show "Update the layout".

## D22 — Side navigation, finished projects in the library, deleting a project (2026-11-10)

Paul asked for easier navigation: the left-hand panel should list the projects being worked on, each opening like a folder in the order the work flows.

1. **Side panel tree** (`SideNav`). Projects → each live project → Overview, Brief, Characters, Venues (each venue), Scenes (each scene → Scene set-up, Floor plan & cameras, Storyboard, Shot design, Animatic, plus "+ New scene"), then "+ New project", and the Library. The project and scene you're in open by themselves. Anything opened or closed is remembered in the browser (per viewer, safe to lose).
2. **Save project to library.** A finished project moves off the live list into the library's "Finished projects", whole (`projects.archived_at`, migration 0006). It can be opened from there and brought back to live projects at any time.
3. **Delete project.** It deletes the project and all its characters, venues, scenes, shots and pictures (only picture files inside the studio's own `data` folder). You have to type the project's name to confirm, as it can't be undone.
4. The positions thumbnail now draws long props (backdrops, counters) as panels facing the group, as the floor plan does.

## D23 — The scene setting fills itself in (2026-11-10)

Paul found the scene setting's "Suggest from the story", "Or ask ChatGPT" and "Save setting" controls confusing. Now, when a scene opens on the storyboard with any empty box (where they are, key props, other people) and GPT is connected, the app fills the gaps from the story by itself, once, and says so. Nothing typed or attached is ever replaced. The user then corrects anything, adds prop pictures and clicks **Save changes**. "Fill the empty boxes from the story" shows only while a box is still empty. The ChatGPT copy-and-paste route shows only when GPT isn't connected.

## D24 — The storyboard in two parts, one button each (2026-11-10)

Paul found the storyboard confusing. If he did, others will. It's now two parts, with a switcher at the top and both listed under each scene in the side panel:

1. **Scene setting.** Filled in from the story (D23). The user corrects it, adds prop pictures and clicks **Save scene**, which saves and moves on to part 2. A scene opens on part 1 until its positions are approved.
2. **Layout and pictures.** Check and approve the character and prop positions, then the cameras. Once both are approved, **Draw pictures** appears. There's no separate approve card: each picture is approved on its own, with a running count ("7 of 11 approved"); when all are approved it leads on to the animatic. Warnings and comments sit under each picture.

**Redraw pictures** shows while any picture isn't approved. It is only enabled for pictures whose inputs have changed since they were drawn: the scene setting, the words, the layout, a prop picture, or the approved pictures they follow. Each picture stores a fingerprint of its prompt and attachments (`check.drawnFrom`) to tell. With nothing changed it says what to change, since the same inputs give much the same picture. "Need to change something?" on a picture is the way to fix one picture.
