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
