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

Paul found the storyboard confusing. If he did, others will. It's now two parts, with a switcher at the top and both listed under each scene in the side panel ("Scene setting", "Storyboard"):

1. **Scene setting.** Filled in from the story (D23). The user corrects it, adds prop pictures and clicks **Save scene**, which saves and moves on to part 2. A scene opens on part 1 until its positions are approved.
2. **Storyboard** (first called "Layout and pictures"; renamed at Paul's request). Check and approve the character and prop positions, then the cameras. Once both are approved, **Draw pictures** appears. There's no separate approve card: each picture is approved on its own, with a running count ("7 of 11 approved"); when all are approved it leads on to the animatic. Warnings and comments sit under each picture.

**Redraw pictures** shows while any picture isn't approved. It is only enabled for pictures whose inputs have changed since they were drawn: the scene setting, the words, the layout, a prop picture, or the approved pictures they follow. Each picture stores a fingerprint of its prompt and attachments (`check.drawnFrom`) to tell. With nothing changed it says what to change, since the same inputs give much the same picture. "Need to change something?" on a picture is the way to fix one picture.

## D25 — More ways of looking, shot effects, and cameras that go up and down (2026-11-10)

1. **Who looks at whom, from far more wording** (`gaze.ts`, `tests/gaze.test.ts`, 55 cases with made-up names):
   - Verbs: looks, glances, stares, glares, gazes, peers, peeks, squints, scowls, frowns, smiles, grins, smirks, winks, nods, sneers, points, waves, turns, rolls their eyes at, fixes their eyes on, and more.
   - Direct objects: spots, notices, watches, eyes, studies, scans, addresses, asks, tells, confronts, faces, sizes up.
   - Meeting or catching someone's gaze or eye; ignoring or avoiding them (looks away).
   - Pairs: exchange a look, look at each other, lock eyes, make eye contact.
   - "Everyone turns to …".
   - she/he/they carrying on from the clause before, and "her"/"him" as the person they're talking with.
   - Directions: down, up, away, around, back, left, right, behind, back over their shoulder (at someone).
   - Looking in or through things: mirrors (rear-view, wing, side, bathroom), windows, windscreens, doors and doorways, keyholes, peepholes, binoculars, telescopes, spyglasses, eyeglasses, periscopes, viewfinders, screens, blinds, gaps.
   - Their own reflection in a mirror, water or glass.
   - Looking out of a vehicle: "looks out of the car/taxi/bus/train/plane/helicopter/boat window", "out through the windscreen", "out of the porthole", "the window of the train".
2. **Shot effects.** Each thing looked through or into has its own look in the picture and video prompt:
   - binoculars: two overlapping circles;
   - a telescope or eyeglass: one round vignette;
   - a keyhole: its shape;
   - a peephole: a fish-eye view;
   - a rear-view or side mirror: a tight shot of the mirror and its reflection;
   - a window or doorway: a frame within the frame;
   - blinds or gaps: strips between dark edges;
   - a reflection in a mirror: over the shoulder into the mirror;
   - a reflection in water: a high angle down at a rippling reflection;
   - a reflection in glass: a faint see-through reflection;
   - out of a car or taxi: the side window frame and door, or through the windscreen with the dashboard along the bottom;
   - out of a plane: the small oval window, the wing or clouds outside;
   - out of a train, tram or bus: scenery blurred by speed past the window;
   - out of a ship or boat: a round porthole;
   - from a helicopter or cockpit: the curved canopy and the ground far below.
3. **Cameras that go up and down.** Cameras have a height and a tilt (`heightM`, `tiltDeg`; eye level and level by default).
   - Wording sets them automatically (`vertical.ts`). "Looks down", "over the edge", "the street below" or a reflection in water gives a high camera. "Looks into the hole/well/box" gives a steep overhead camera, moved to just behind and above the person. "Looks up", "up at the window", "overhead" or "towers over" gives a low camera.
   - The tilt is worked out from the camera's distance, so the person stays in frame.
   - Picture and video prompts say the angle ("high angle from about 2.8 m up, tilted down about 25°") instead of "eye level".
   - The layout sketch, the floor plan viewfinder and the 360° background cut all follow the height and tilt.
   - The floor plan has quick choices (eye level, high, low, overhead, ground level) plus height and tilt sliders.
4. Layout rules are now version 7, so existing scenes show "Update the layout".

Limit: the floor is flat in the floor plan. A cliff edge or a hole is described in words and shown by the camera's angle, but the ground below isn't modelled as lower.

## D26 — Lying down, falling and jumping (2026-11-10)

How a body is placed changes where the camera goes. Read from the panel's words, for any scene (`vertical.ts`, `bodyFor`, `bodyEffect`; tests in `tests/vertical.test.ts` with made-up names).

1. **Lying down and looking up** ("lies on her back on the grass looking at the stars", "lying in bed staring at the ceiling", "on the sofa looking up at Ben"): a top shot from directly above, looking straight down onto their face (camera moved right above them, tilt about −88°). The prompt says what they lie on fills the frame, and that what they see (the sky outdoors, the ceiling indoors or on a bed or sofa) is a different shot.
2. **Lying down otherwise** ("lay on the beach reading", "sprawls across the couch"): a low camera, level with them. Eyes are about 0.6 m up on a bed, sofa, bench or lounger, and about 0.3 m on grass, sand or a floor.
3. **Falling or jumping from a height** (off a cliff, roof, building, bridge, balcony, ledge, over the edge, pushed off): the camera stays at the top and looks almost straight down as they drop away. Jumping reads as leaping out, arms forward; falling as flailing. Motion blur, clothes and hair streaming upward, the ground or water far below.
4. **Free fall** (jumps out of a plane or helicopter, skydives, parachutes, base jumps): a camera falling alongside them at the same height, open sky and clouds, the ground spread far below, with no plane interior or floor in the picture.
5. **Falling to the floor** (collapses to the floor, trips onto the pavement, knocked to the ground): a camera at floor level, level.
6. Not triggered by "lies to him", "jumps for joy", "falls in love", "lay the table" or standing at an edge (that stays a looking-down high angle, D25).
7. Picture and video prompts get a "Body and angle" line, and the camera line says "top shot from directly above" or "low camera, level" where it applies.
8. Layout rules are now version 8, so existing scenes show "Update the layout".

Limit: still a flat floor. The drop, the sky and the plane are described in words and shown by the camera angle; the plan does not model height differences.

## D27 — Shot language: sizes, framings, angles, heights, Dutch, point of view, moves and lenses (2026-11-10)

Paul shared the standard shot vocabulary (camera angles, camera heights, and Adobe's guide to shot types). The app now reads these names from a panel's words, chooses the camera to match, and writes the shot and what it means into every picture and video prompt. All of it is general: wording and geometry only, nothing tied to one project (`shotLanguage.ts`, `vertical.ts`, `director.ts`; tests in `tests/shotLanguage.test.ts` with made-up names).

1. **Shot sizes**: extreme close-up, close-up, medium close-up, medium shot, cowboy, medium long, full, long and wide. A named size sets the lens so the subject fills that much of the frame from where the camera stands. A close-up comes out on a long lens (about 85–135 mm), as the guide recommends, with a soft background. Naming a close-up makes the moment a "peak", so a close-up camera is offered; naming a wide or establishing shot makes it an establishing moment. The floor plan has a Shot size choice that sets the lens the same way.
2. **Framings**:
   - Over-the-shoulder and reverse shots: the matching cameras go first.
   - Two-shot: a camera side-on to the pair, swung round up to 70° until no one else is in the picture.
   - Three-shot: the option that sees three people goes first.
   - Profile: a camera at right angles to the way the subject faces, on the side already chosen.
   - Establishing and master shots: wide.
   - Insert shots: the insert camera.
   - Reaction and single shots: a close-up.
   - "Looks back over her shoulder" is a look, not an over-the-shoulder shot.
3. **Point of view** ("Ben's POV", "through Ava's eyes", "what she sees"): the camera is at that person's eyes, looking at whoever they look at, or else at whoever the panel has in the picture. That person is left out of the picture and the clip (at most their hands at the bottom edge). Lying down and looking up gives a POV straight up.
4. **Angles and heights**:
   - Named in the panel, they win over everything else: eye level, shoulder level (1.45 m), hip level (1.0 m), knee level (0.5 m), ground level (on the floor), high angle, low angle, bird's-eye view (directly overhead, straight down), and worm's-eye or nadir (on the ground near their feet, looking steeply up).
   - Otherwise, the feeling of the moment sets a gentle angle, from strong words only, so ordinary conversation stays at eye level: vulnerable, helpless or begging gives a high angle; triumphant, menacing or standing tall gives a low angle; utterly alone or dwarfed gives a bird's-eye view.
   - Body and looking up or down (D25, D26) still come before mood.
5. **Dutch angle**: named ("Dutch angle", "canted", "tilted frame"), it gives a 20° roll; from the feeling (dizzy, drunk, panics, nightmare, chaos), a 15° roll. It combines with any height. Prompts say the frame is tilted and the horizon on a slant. The viewfinder and layout sketch draw the roll, and the floor plan has a Dutch angle slider.
6. **Lens**: every picture and video prompt now says the lens in millimetres and what it does to the picture:
   - wide: more of the space, people further apart, deep focus;
   - normal: as the eye sees;
   - long: background compressed and soft.
7. **Why this angle**: prompts add the guide's meaning:
   - high angle: smaller, more vulnerable;
   - low angle: taller, more in charge;
   - bird's-eye: small and isolated;
   - worm's-eye: towering;
   - Dutch: uneasy.
8. **Camera moves** named in the panel go into the video prompt in place of the genre's usual move: tracking, pan, tilt, dolly in and out, dolly zoom (vertigo effect), push-in and push-out, zoom in and out, handheld, crane, orbit, whip pan and static.
9. Layout rules are now version 9.

Limits: English wording only; the room is still a flat floor; a bird's-eye or crane height is described rather than checked against a ceiling.

## D28 — Suggested shots, which you can change (2026-11-10)

The app now suggests a named shot for every panel, using the guide's rules for building a scene (`shotSuggest.ts`, tests in `tests/shotSuggest.test.ts` with made-up names).

1. **The rules**:
   - the first shot is an establishing shot;
   - an arrival is a full shot that tracks them in;
   - a conversation starts on a two-shot (or a medium long shot for a group), then goes over the shoulder;
   - the big line or feeling is a close-up (with a slow push-in for strong feeling);
   - an object the moment turns on gets an insert shot;
   - seeing someone who isn't in the picture is a point of view;
   - a group is a medium long shot or three-shot, and two people a two-shot;
   - a lone reaction is a medium close-up or close-up;
   - someone leaving is a long shot.
2. **Angles** come from the feeling and the body (D25–D27): high, low, bird's-eye, worm's-eye or Dutch. **No two shots in a row are the same size** (the guide's progression), apart from over-the-shoulder shots in a conversation.
3. A panel whose words already name a shot keeps them.
4. When the app chooses the cameras, each panel's suggestion is saved on its shot (`ShotSpec.shot`, `shotBy: "app"`), and the camera chooser follows it like words in the panel (D27).
5. **On the storyboard**, each panel shows "Shot: … · suggested" and why. **Change** offers three lists: the shot, the angle and height, and the camera move for the video.
   - Choosing one saves it as your choice (`shotBy: "you"`, kept when the app suggests again) and chooses the cameras again, so the camera view sketch updates straight away.
   - "Back to the suggestion" undoes it.
   - Once the cameras are approved, the shot is locked with them.
6. Picture and video prompts start their camera lines with "Shot: …".

## D29 — Room size per venue, and raised and lowered floors (2026-11-10)

Two limits from D25–D28 are now fixed (`room.ts`, `levels.ts`; tests in `tests/roomLevels.test.ts` with made-up names; browser test `room.js`).

1. **Room size per venue.** Every floor plan used to be a 9 × 10 m room inherited from the first demo.
   - Each venue now has a size (`venues.room`, migration 0007). It is guessed from the venue's name first, then its description: tiny (lift, car, booth), small (bedroom, office), medium (café, living room, pub), large (bar, restaurant), hall (ballroom, warehouse, event space, launch), or outdoors (30 × 30 m). Unrecognised names stay 9 × 10.
   - The venue page shows the size and whether it was guessed or set, with width and depth boxes and quick sizes.
   - Saving a size brings every floor plan at that venue to it. Everyone, every mark, prop, camera and raised area moves together, so they keep the same place relative to the group. The group stands in the same place relative to the room whatever its size.
   - New plans use the venue's size, and "Update the layout" brings older plans to it.
   - In a small room, arrival marks and the space kept behind them for a camera shrink to fit.
   - The floor plan shows the room size with a link to change it, and draws big rooms smaller so they fit.
2. **Raised and lowered floors.** A plan can have areas (`GeometryPlanData.levels`) with a height above or below the floor: a stage (+1 m), a balcony (+4 m, railing), the top of some stairs (+3 m, steps), a pit, or the drop past a cliff (−30 m) or roof edge (−20 m).
   - Anyone, any prop and any camera standing in an area is at its height. A camera's own height counts from the floor it stands on.
   - They are made from the scene's words: where the group stands ("on the stage", "on the balcony looking down on the hall", "at the edge of the cliff", "on the rooftop", "at the top of the stairs", "by the pool"), or a balcony or stage the venue's description mentions (placed at the back).
   - On the floor plan they can be added, moved, sized, given a height and an edge, and removed.
3. **What changes with heights**:
   - The camera reading knows when someone is out of the top or bottom of the frame.
   - Cameras aim in 3D: a level camera whose subject is on a stage, balcony or in a pit tilts to their face (`R-LEVEL`), and high and low angles count from each person's own floor.
   - No camera can stand over a drop.
   - The layout sketch draws raised areas as blocks (only the sides facing the camera, and the top only from above, with a railing), and drops and pits as a dashed edge over empty space with the far floor below.
   - Background people stay off the cast's stage or balcony and away from any drop.
   - The viewfinder places heads and tables at their real heights.
   - Picture and video prompts say who is above or below the camera and by how much, that the camera is up there with them, any drop, balcony or stage in view, and that the crowd is down on the main floor.
4. Layout rules are now version 10.

Limits: areas are rectangles with flat tops (stairs are one step up to their top, not a slope); terrain that rises gradually isn't modelled.

## D30 — Why pictures went backwards after D27–D29, and the fix (2026-11-10)

Paul's run of Jade's Entrance (portrait, 9:16) lost people from shots: Chase was missing in 1, 2 and 11, and Marcus and Nina in 5. Jade was on the wrong side of the table in 3 and 9, Chase in the wrong place in 8, the screen changed in 7 and 10, and the background behind Marcus and Nina in 6 was wrong. Replaying his saved scene found these causes:

1. **The lens for a named shot size was wrong in portrait** (D27). A size says how tall a slice of the person fills the frame. A portrait lens angle is for the frame's height (D19), but the size was converted across the width, which made every lens about three times too narrow. Group shots came out at 8–27°, so the app's own reading of each camera had Chase, Jade, Marcus and the backdrop out of frame. Because the reading dropped them, the prompts dropped them too: the left-to-right order had only one or two people, the backdrop wasn't named (so GPT invented a screen), and the picture check passed pictures with Chase missing. Fixed in `fovForSize`; the built two-shot camera's lens is converted the same way.
2. **The app's suggested sizes (D28) narrowed the lens, and were applied to every option.** A suggested "medium close-up" landed on a group camera. Now only a size the user chose, in the panel's words or the shot list, may narrow the lens. A suggestion only widens it, and its words still go into the prompt.
3. **Suggestions ignored who is in frame.** Group moments now get group-sized shots. With three or more in frame, a continuing conversation is a medium shot (not over-the-shoulder) and a big moment is a medium shot with a push-in. The "not the same size twice" rule only steps closer for one or two people.
4. **The two-shot swung round to cut others out** (D27), which changed the background. It now stays square-on, with others nearby allowed at the edges ("some of Chase"); it swings only when that clearly helps.
5. **Gestures and walking away.** A gesture is now aimed at the person the subject is looking at ("Chase's gesture is aimed at Jade"). Someone walking away from a person they're still reacting to has their body walking away and their head turned back over the shoulder, with any gesture thrown back. A middle-finger gesture is spelt out. These go in picture and video prompts (`gestures.ts`, `aimDetail`).
6. **Lens millimetres** now come from the long-side angle in both orientations.
7. **Room size**: Paul's venue name ("launch-party venue") was read as a hall (18 × 22 m), which made the venue look bigger. That is the guess, not his venue; he can set the real size on the venue page.
8. Layout rules are now version 11. Tests: `tests/portraitShots.test.ts` (a portrait group scene keeps everyone in frame whatever the suggested size), plus updated two-shot tests.

Lesson: the D27–D28 tests were all landscape. Tests now cover portrait, and a replay of the user's saved scene is part of checking a change to cameras.

## D31 — Edge people, walking in, eye lines, light, and a portrait viewfinder (2026-11-10)

From Paul's second run of Jade's Entrance after D30 (replayed from his saved data).

1. **People partly in the frame.** The camera reading used each person's middle only. Nina, one degree outside the edge in panel 4, counted as out of the picture, and the prompt then said "Nobody stands anywhere else". The same happened to Chase in the panel 6 two-shot. A body is about half a metre wide, so someone whose middle is just past the edge now counts as partly in the picture (`SeenActor.partial`).
   - The prompt lists them in the left-to-right order "only partly in the picture, cut by the left/right edge", and adds "do not leave anyone out".
   - The picture check allows them but doesn't require them (`PictureExpectation.edge`, on its own line).
   - They are never chosen as the over-the-shoulder foreground.
2. **Walking in over several panels.** Panels 1 ("enters") and 2 ("walks through the crowd") both put Jade on the same arrival spot, at the same distance. Someone still arriving in the next panel now moves on along their path: entering, then a new "crossing" mark halfway to their place, then approaching. Cameras and gaze treat "crossing" like the other arrival marks.
3. **Eye lines.** "Looks at Jade" alone let GPT turn faces to the lens (the check caught this on 4 and 5). Prompts now add which side of the picture each look goes to, from the floor plan: "Chase looks to the right of the picture, at Jade". Panel 11's "Chase could look more to his right" is covered by the same line.
4. **The same light in every picture.** Panel 3 came out much darker. The venue description's lighting sentences (festoon lights, uplighting, haze; not time-of-day words or the screen) now go into every picture prompt: "Lighting, identical in every picture of this scene … not darker, not brighter."
5. **Bag hand.** The prompt now spells out the mirror: a bag in someone's left hand is on the right of the picture when they face the camera, and on the left when they are seen from behind.
6. **The viewfinder was landscape in a portrait project.** On the floor plan it drew 16:9, using the portrait lens's long-side angle as if it were the width. It showed about 70° of the room and the 360° view (bar on the left, screen on the right), while the pictures correctly get the narrower portrait slice (about 42°, screen wall). The viewfinder now has the video's shape and the real angle across its width, so it shows exactly what the pictures get.
7. Layout rules are now version 12. Tests: edge people, the crossing mark, lighting (`tests/portraitShots.test.ts`).

Explained to Paul rather than changed:
- In panels 9 and 10 the GLOWVANE banner behind Chase and Marcus is where the floor plan puts it (back-left from the front cameras); 3, 7 and 11 missed it, and the check flagged that.
- Looking at the screen wall, the bar is on the left (his venue description says so too).
- The prop named "champagne flutes" is described as a display plinth, which muddles the check's wording; renaming it fixes that.
- The room is still the guessed 18 × 22 m hall until he sets the real size.

## D32 — Props can be renamed or removed after positions are approved (2026-11-10)

Paul's floor plan had a prop named "champagne flutes" whose description was a display plinth, and a "GLOWVANE illuminated logo backdrop" his venue doesn't have. Both came from the auto-filled setting. Once positions were approved, prop names were read-only and props couldn't be removed, so there was no way to fix either. The picture check kept failing on both: it looked for flutes standing on their own, and for a logo banner that GPT, with no logo anywhere in the venue pictures, often didn't draw.

- Each prop in the setting now carries a reference to its floor plan item (`KeyProp.ref`).
- With positions approved, a prop can be renamed: the plan item keeps its place and takes the new name; a change of capitals alone keeps the plan's name.
- A prop can be removed: it leaves the floor plan. This only happens when the list carries plan references, so an older list can't remove anything by accident.
- The setting card's hint says so. Tests are in `tests/story.test.ts`; the browser test now expects renaming to be allowed.

## D33 — Bag hand, walking off towards the way out, eye contact over the shoulder, two-shots in a group (2026-11-10)

From Paul's third run of Jade's Entrance.

1. **Bag hand.** Jade's bag kept swapping hands (3 and 8), even with D31's mirror note. When a character's description says which hand (e.g. "carries a tan satchel in her left hand"), every picture now says which side of the frame the bag shows on, given which way they face: "Jade's satchel is in her left hand, so it shows on the right of the picture (facing us)" ("Carried: …; never swap hands between pictures"). Jade's description doesn't say which hand yet, so Paul needs to add it. This works for any item a character holds or wears on one side, not only bags, for every character: "phone in his right hand", "guitar over her left shoulder", "watch on his left wrist" (`carriedItems`, with tests). All D30–D33 fixes are general rules from the plan, the camera and the words; none are fitted to one project.
2. **Walking off.** In 11 Jade stood with crossed legs. Walking away now heads for the venue's way out (a view named entrance, exit, door, lobby or foyer), placed from this camera ("behind the camera, so walking towards the camera and past it"), caught mid-stride with legs apart and never crossed, with the head turned back (`exitFrom`, `aimDetail`).
3. **Eye contact with the over-the-shoulder person.** In 5 Chase didn't look at Jade. Looking at the foreground person is next to the lens, so the eye line now says so plainly: "Chase looks at Jade's face, Jade being the person in the foreground with their back to us: his eyes meet hers, to the right of the picture, never into the lens."
4. **Two-shots in a group.** In 6 the two-shot camera stood about 1.5 m from Jade, so she was just beside the lens and missing. The camera now steps back until nobody near it is left just out of frame, and anyone standing right by the pair (within 1.6 m) is kept at least at the edge. It prefers stepping back to a lens wider than 60°. In Paul's scene, panel 6 now has Chase at the left and Jade at the right edge.
5. **Panels 1 and 2 at the same distance**: panel 2 was still the approved picture from the old layout (drawn at the arrival spot); its new halfway-across camera needs a redraw. Nothing to change in the app.
6. Layout rules are now version 13.

## D34 — The blocking frame: GPT finishes the shot instead of imagining it (2026-11-10)

Paul: positions, direction of travel, held items (which hand) and the 360° background must be right every time; fixing them one picture at a time would never end. The cause was structural. GPT got the background, a separate layout sketch, character pictures and a long description, and had to compose the shot in its head, so position, direction and background were described rather than given.

1. **The blocking frame** (`blockingImage.ts`, `/api/blocking/[shotId]`) is the shot itself, built before anything is drawn:
   - the 360° background this camera sees, laid out at the picture's size with the horizon where the camera puts it (`backgroundForFrame`), and a soft blurred continuation beyond the view pictures' height;
   - a pale stand-in for each character at their exact place and size, labelled with their name and FACING CAMERA, BACK TO CAMERA or SIDE-ON facing left/right (a nose shows side-on, eyes show facing us). Far figures' tags sit above their heads, and tags never overlap;
   - an orange "walking this way" arrow on the floor for anyone moving: arrivals head for their place, someone walking off heads for the way out (`movesFor`);
   - a yellow tag on the correct side of the picture for anything held in a hand, on a shoulder or on an arm, mirrored for someone facing us;
   - the key props outlined in place;
   - the venue's own balconies and drops are left to the background; areas the cast stands on are outlined.
2. **Drawing** sends the blocking frame first, as the picture to finish, instead of the separate background and sketch. The prompt opens with `blockingInstruction`: image 1 is this shot; each stand-in becomes the named character exactly there, that size, facing that way; walk along the arrow; held items where the tags are; room, background, light, camera, angle and lens unchanged; remove every outline, label, arrow and tag; other images are only for how people and props look. On the by-hand route the frame is the first attachment.
3. **Held items from reference pictures** (`heldItemsServer.ts`). Which hand holds the bag, phone or drink is read once from each character's approved front picture with the text model's vision, and kept with that version (redone if the picture changes). The model only reports which side of the picture each item is on; the character's own side is worked out by rule, because a front picture is a mirror. Descriptions win where both name the item, and description parsing now finds the item however many words describe it.
4. **The check** compares with the blocking frame, and asks where each held item is in the picture. The side is judged by rule ("Jade's satchel is on the right of the picture; it belongs on the left").
5. **Targeted corrections.** A picture that fails its check is edited, not redrawn: image 1 is the failed picture, image 2 the blocking frame, then the references. "Fix ONLY these problems and change nothing else." Up to twice, then it's shown with what's still off (`correctionPrompt`).
6. All of this is general: geometry from the floor plan and camera, words from the venue, characters and panels. Without a 360° view (fewer than two venue pictures) the app falls back to the layout sketch as before. Tests: `tests/blocking.d34.test.ts`; the browser test now expects edit-based corrections.

Honest limit: an image model still can't be forced. This gives it the composition as a picture to keep rather than words to interpret, and catches and corrects what slips through.

### D34a — Held items: one answer per item, sides from positions (2026-11-11)

Paul's panel 1 still had Jade's bag in the wrong hand. The reading of her reference picture had said "tan leather handbag, right hand" (the model mixed up its own left and right), while her description says "satchel … in her left hand". Because the two names differed, both were kept, so the frame had tags on both sides and the check passed either way.
- Different words for the same kind of thing (bag/handbag/satchel/purse…, phone/smartphone, glass/flute/drink, watch/wristwatch…) now count as one item, and the description wins (`itemGroup`).
- The reference reading no longer asks for left or right. It asks for positions across the image (the item's and the face's, 0–100), and the character's own side is worked out by rule.
- Readings made the old way are ignored and redone (`HELD_READ_VERSION` 2).
- The check matches held items by kind of thing, so "handbag" on the wrong side fails a "satchel" expectation.

### D34b — The reference picture decides the hand; walking spelt out; corrections must show (2026-11-11)

Looking at Jade's reference picture: the satchel is on the left of the image, so it is in her RIGHT hand, since she faces us. Paul's description said "in her left hand", which is the side of the picture, not her hand. That mirror is what had been catching GPT, the check and the description alike. D34a made the description win, so the frames tagged the wrong side and GPT faithfully followed them (Paul: "GPT followed your image refs").
- The reference picture now wins on which side; it is also what GPT copies.
- Where a description disagrees, the storyboard shows a "Which hand holds what" warning with the correct wording (`heldConflicts`). Readings are made when the storyboard opens.
- Walking: a "Walking:" line in the prompt says which way across the picture and whether away from or towards the camera, and which side of them we see, because GPT turned the halfway-across walker to face the lens despite the frame.
- Corrections: a hand fix now says move it from this side of the picture to that side, into the other hand, leaving the first hand empty. Every correction must be visibly made; returning the same picture is not acceptable.

### D35 — Positions per panel: one floor plan, stepped panel by panel (2026-11-11)

The scene's floor plan says where everyone starts, but a scene moves: someone walks off in panel 4, a prop is taken away, someone turns. Paul wanted to set that per panel, in one place, stepping through like a music player: ‹ Scene plan › ‹ Panel 1 › ‹ Panel 2 ›…

- **The panel stepper** on the floor plan page (`PlanEditor.tsx`): arrows and numbered chips step from the scene plan through every panel. The address keeps the step (`?panel=4`), and each panel on the storyboard links straight to its own step ("Positions for this panel").
- **On a panel**, the plan shows that panel's positions and only that panel's camera, with its camera view and what it sees in words. Drag anyone to where they are in this panel; click someone and drag the blue handle to turn them (or use the facing slider; "auto" faces the others as before). "Walks during this panel" adds an orange arrow to a ring you drag to where the walk ends; "Walks off" aims it at the venue's way out (a view named entrance, exit, door…), or else sideways out of the camera's sight, up to 6 m. Props can be dragged for the panel, or taken away and brought back.
- **Carrying on.** Whatever is set on a panel carries on to the panels after it until it's set again ("this panel only" stops that). A walk carries its end spot; a set facing carries on, a walking direction doesn't. A panel whose own words move someone (an arrival or crossing mark, D19b) takes over from what was carried. Carried positions are worked out again from scratch whenever a panel is saved, moved or deleted, or gains a mark (`carryBlocking`, `recarry`), so clearing a placement clears what it carried. The ring shows where each placement comes from: black ring set here, dashed carried, amber the panel's words; faded people are in the room but not in the picture.
- **Data.** Each shot keeps `spec.blocking`: people by character id, props by `prop:` and the prop's id, each with `at`, optional `to`, `facingDeg`, `only`, `gone`, and `by` ("you" or "carried"). `planForShot` applies it, so the blocking frame (D34), the camera choice, the layout sketch, the picture prompt, the check and the video prompt all see the panel's positions. Changing the room size moves these positions with everything else.
- **Words.** The video prompt says how far someone walks during the clip and where the walk ends as this camera sees it ("…and out of the picture on the left", "away from the camera, ending on the right of the picture"). The picture prompt's props come from the panel's plan, so a prop taken away isn't asked for.
- **Locks.** Panel positions can be saved while the positions are approved (the cameras are then chosen again to see the new places), but not while the cameras are approved: use "Change cameras" first, as for changing a shot (D28).
- General for any scene: nothing here knows about any one story. Tests: `tests/blocking.d35.test.ts`; browser test: stepping, walk off, a prop taken away, carry to the next panel, save, storyboard links.

A different place is a different scene: the kitchen, the stairs and the bedroom are each a scene with its own venue, floor plan and props, and the characters' references keep them the same across all of them.

### D36 — The app sets each panel's positions from its words (2026-11-11)

Paul: the app does the heavy lifting. The user describes the scene; the app reads it and builds the storyboard, using the same scene planners the user can then adjust. And these tools only matter if they make the pictures consistent.

So the per-panel positions (D35) are now filled in by the app from each panel's words, the same way a user would set them on the panel stepper (`panelWords.ts`, `blockingFromWords`):
- **Leaving**: "walks off", "storms out", "leaves the kitchen", "heads for the door", "goes upstairs", "turns to leave". They walk to the venue's way out (a view named entrance, exit, door, hall, stairs…, or the one named: "heads for the stairs"), and are gone from later panels (not drawn, not in the frame, not in the prompts) until a panel shows them again.
- **Going somewhere**: "walks over to the window", "crosses to the sofa": a walk to beside the prop, or to near that wall of the room. "Walks over to Mia", "joins Ben": a walk to beside them. "Steps closer": half a metre towards their partner.
- **Being somewhere**: "sits on the sofa", "lies on his bed", "gets into bed" puts them on it; "stands by the window", "waits at the bar" beside it.
- **Turning**: "turns to Chase", "facing Chase", "turns to the window", "turns away (from Ben)". A walk always faces the way it goes.
- **Props in hand**: "picks up the glass", "takes out his phone" puts the prop in their hands: it goes where they go, in the frame, and the picture prompt says "has the phone in his right hand" (the free hand: the right, unless the right already holds something they always carry). "Puts it down on the bar" sets it down there.
- **Who does it**: the name just before the verb ("as Aron walks off"), else the name starting the sentence or clause ("Jade, fuming, gives Chase the finger and turns away": Jade), else whoever did the last thing (she, he, and).
- **Your changes win.** The app's placements (`by: "app"`, with what it read in `why`) are worked out again whenever the words change, the storyboard is saved, the positions are approved, or a panel's positions are saved, around anything you've set. On the floor plan they show with a teal ring and "from the words: walks off"; "Not this: keep them where they were" makes it yours. Arrival marks (D19b) still handle arriving.
- **Cameras**: no camera stands on, or within 0.9 m of, the path of someone walking during the panel, so nobody walks into the lens.
- **Existing scenes**: layout rules 14. The storyboard offers "Update the layout", which reads the words, approves the positions where they are and chooses the cameras again.

Everything feeds the blocking frame (D34): where each person stands, which way they face, the walk arrow, who isn't there, and what's in whose hand are drawn into image 1 for GPT to finish, and checked afterwards. That's how the plan makes the pictures consistent rather than just describing them. All rules are general; tests use made-up scenes (`tests/panelWords.d36.test.ts`), replayed on Paul's Jade's Entrance: Jade faces Chase in panel 4, steps closer in 7, walks off to the entrance in 11.

### D37 — Posture carries on from panel to panel (2026-11-11)

Paul: "Aron is lying on his bed… picks up his phone… re-reads the text." Next panel: "He is upset, puts his phone down and stares at the ceiling." Nothing says he moved, so he is still lying. But "Aron sits up…" changes it. Posture must carry on unless the words change it.

- **Read from the words** (`posturesFromWords`, `panelWords.ts`): lying ("lies on his bed", "is lying down", "lies back", "gets into bed", "curled up on the sofa"; not "lies to her"), sitting ("sits up", "sits on the edge of the bed", "seated at the table"), standing ("gets up", "stands up", "gets out of bed", "rises", "jumps to his feet"), kneeling and crouching. The last one in a panel wins for each person, worked out with the same who-does-it rules as D36. "The phone sits on the desk" is a thing, not a person.
- **Carried on** to the next panels until the words, or you, change it. What they lie or sit on is kept ("the single bed") and named in the prompts.
- **Walking means standing**: someone walking in a panel is on their feet in the picture; "walks to the sofa and sits down" ends sitting, and that carries on.
- **The scene setting** can start everyone off ("sitting round the kitchen table").
- **Stored per shot** (`spec.posture`, with by app/carried/you, where it came from, and the posture before when it changed), worked out with the per-panel positions (D36) every time the words or positions change. You can set a posture on any panel with the stepper's posture control; it carries on from there ("back to the words" undoes it).
- **Everything uses it**:
  - the blocking frame: seated, kneeling and crouching stand-ins are shorter, and someone lying is drawn flat on what they lie on, labelled "LYING ON SINGLE BED";
  - the picture prompt: "Posture: Aron is lying on the single bed, still lying as in the panel before: he has not got up" or "Aron has just sat up and is sitting on the single bed now (he was lying before)";
  - the video prompt: "Aron stays lying on the single bed throughout; he does not get up" or "Aron sits up on the single bed during the clip, from lying";
  - the camera: a carried "lying" counts, so "stares at the ceiling" while still lying gets the overhead camera (D26);
  - the floor plan's viewfinder draws seated and lying people;
  - the picture check asks each person's posture and a wrong one becomes a correction ("Aron is standing; Aron must be lying on the single bed").
- General for any scene; tests use Paul's two examples with made-up names (`tests/posture.d37.test.ts`).

### D38: Only what improves consistency, continuity or the finished video (2026-11-11)

Paul: "I want to be careful not to build complexity into the app that is not needed. We only want to add enhancements that improve consistency and continuity and improve the viewing experience of the end product." This is now the test for every change, written into `CLAUDE.md`. Each change must name the visible failure it fixes and how it reaches the generation: the blocking frame, a prompt line, the camera choice or the picture check.

### D39: Changing who stands where, in words, from "Need to change something?" (2026-11-11)

Paul: the app does the work, so the planner should only appear when the user needs to change something, inside "Need to change something?", and the user should be able to write the change and see the planner adjust: "move Jade closer to Nina and have Marcus walk off to the right".

The D38 test: the visible failure is a person in the wrong place, facing the wrong way or in the wrong posture in a picture; the fix reaches the generation through the blocking frame the picture is redrawn from.

- **On the storyboard**, "Need to change something?" now asks "Is anyone in the wrong place, facing the wrong way or in the wrong posture?". An answer opens that panel's floor plan with the words already applied: the plan, this panel's camera view and what it sees, and "Done: Jade: closer to Nina; Marcus: walks off to the right of the picture (this panel only)", or what wasn't understood. More can be typed there, or people dragged, then "Save and redraw the picture" saves the positions and redraws the picture fresh from the new blocking frame (with any other changes asked for). The separate "Positions for this panel" link on each card is gone.
- **The words** (`changeWords.ts`): move/put/bring someone closer to, next to, or further from someone; to the left or right, nearer the camera or further back (as the picture shows them, from the panel's camera); to the other side of a prop or person; swap two people; turn someone to face someone or something; someone should be sitting, lying…; walk off to the left or right (out of the picture on that side, for this panel only); take a prop away. Anything else goes through the panel-word readers (D36, D37): "sits on the sofa", "walks to the bar".
- **Carrying on**: a change carries on to the next panels unless "This panel only" is ticked, except a walk-off, which is for its panel only (later panels follow their own words).
- **Cameras stay as they are**: saving a panel's positions no longer re-chooses cameras and works while the cameras are approved, so fixing one picture never moves another panel's camera.
- **Simpler card** (D38): on each person, only "This panel only", "Undo this change" and, for the app's own placements, "Not this". The facing slider, walk checkbox and walk-off button are gone; words, dragging and the turn handle do those. The floor plan page keeps its panel stepper, with the same words box.
- Tests: `tests/changeWords.d39.test.ts`; browser test on a copy of Jade's Entrance: the change opens panel 5's plan with both changes applied, a second typed change, save, the picture redrawn, positions saved.

### D40: An ⓘ beside every box whose words the app reads (2026-11-11)

Paul: where the user writes something to get a result, put an information icon that shows the words the app recognises, so the words used are read correctly.

D38 test: words the app can't read leave people, postures, props or cameras wrong in the picture; the guides help the words reach the floor plan, and so the blocking frame and prompts.

- **The guides** live in one file (`wordGuides.ts`): who stands where (the change request and the planner's box), what happens in a panel (panel words, the draft panels and the story box), where they are (scene setting), describing a prop (sizes and kinds), describing the venue (kind of place for room size, light, balcony or stage, the way out) and which hand or shoulder (wardrobe). Each lists example phrases by group and a short tip.
- **Always true**: `tests/wordGuides.d40.test.ts` runs every example through the part of the app that reads it (the change reader, panel words, arrival marks, postures, gaze, gestures, camera words, setting levels, prop sizes, room kinds, lighting, exits, held items), plus phrases each check must reject. Change a reader and a guide that no longer matches fails the build.
- **The ⓘ** (`WordsHelp`): a small "i" beside the box's label; click for the note, Escape or clicking elsewhere closes it. Only on boxes the app itself reads, not on free-text changes that go straight to GPT, and not on the shot picker (fixed choices).
- **GPT writes panels in these words too**: the story-to-panels request now asks for plain wording of who moves, sits, lies down, gets up, turns or leaves, naming them each time, with examples, so panels made from a story are read correctly.
- Also: "put Ava on the sofa" now means sitting on it.

### D41: Fewer and lighter corrections (2026-11-11)

Paul's OpenAI spend was about $0.088 (7p) a picture and about 2.2 pictures a panel: a full run of Jade's Entrance cost around £1.60 rather than the 50p it used to. His week: image output 47% of spend, the reference pictures sent in 37%, prompt text 12%, checks 5%. The picture check and its automatic corrections (D34) made each panel up to three full-price image calls, each sending the blocking frame and every reference again.

- **One automatic correction**, not two. If the picture still doesn't match, the panel shows what's wrong with a **"Try one more fix"** button (about 7p); otherwise redraw it or change it.
- **A correction sends only what it needs**: the picture to fix, the blocking frame, and the references of the people and props its problems name (`correctionRefs`). "Jade's satchel is in the wrong hand" sends Jade's references; "the room is the wrong way round" sends none. The picture being fixed already shows everyone else correctly.
- Consistency: unchanged for anything the check finds. The check still runs after every picture and every fix, and the problem's own people still get their references.
- Expected saving, in Paul's numbers: a panel that fails its check now costs at most two pictures automatically instead of three, and each fix sends 2 to 3 pictures instead of 7 to 8. Roughly a third off a full run.
- Tests: `tests/corrections.d41.test.ts`; browser test: wrong once → one automatic fix sending 2 pictures instead of 4; wrong twice → stops at 2 pictures and offers "Try one more fix", which fixes it.

### D42: Nobody who belongs in the picture is moved out of it (2026-11-11)

Paul moved Jade to the right on panel 1's planner (via "Need to change something?"), and the redraw put her on the left. Cause: the drag took her out of the panel's camera view. The blocking frame had no stand-in for her, but the prompt still said she was in the picture, so GPT placed her where it liked, and the check passed because it only checks who the camera sees. His words, "direction wrong with jades approach", weren't understood.

D38 test: the visible failure was Jade on the wrong side; the fix reaches the camera choice and so the blocking frame.

- **The camera follows** (`aimToInclude`, `aimPanelCameras`): when a change leaves someone who must be in the picture outside the camera's view, or cut by its edge, that panel gets its own camera ("Wide (P1), turned"). It stays where it stands at the same height and tilt, and turns as little as will bring them in, keeping everyone still in the shot. If that can't be done, it uses a somewhat wider lens (up to 60° across). If even that isn't enough, it keeps just those who must be in the picture. Other panels' cameras, approved or not, are never touched. Someone near the edge but inside the frame doesn't move the camera.
- **You see it before saving**: the planner shows the turned camera and the camera view, and says "Jade is outside the camera's view here, so this panel's camera turns to keep everyone in the picture… To keep the camera, move them back into the blue area instead."
- **Words**: "Jade comes in from the right" (or left) places her well over on that side of the picture, inside the frame, at the same distance. "Move Ben to the left/right" now stops at the edge of the frame instead of pushing someone out. Changes are read against the panel's own camera, the one the picture was drawn with.
- Added to the ⓘ guide; tests in `tests/changeWords.d39.test.ts` and `tests/aim.d42.test.ts`; browser test of Paul's case on a copy of Jade's Entrance: drag out of view → warning and turned camera → saved with Jade in view, no warning after.

### D43: Move one panel's camera from its planner (2026-11-11)

Paul tried to move the camera in a panel's planner and couldn't: it was fixed, and the only way was the whole scene's cameras after "Change cameras", which unlocks every panel's camera at once.

D38 test: a camera in the wrong place for one picture is a visible failure; the fix reaches the camera and so the blocking frame.

- In a panel's planner (from "Need to change something?" or the floor plan's panel stepper), drag the camera to move it, or its white handle to aim it. The camera view follows as you drag. "(moved, not saved yet)" shows until it's saved.
- It's for this panel only: saving gives the panel its own camera ("Wide (P1), for this panel"), or changes the one it already has. A shared or approved camera is left exactly as it was, and no other panel changes (`panelCamera`, shared with D42's turned cameras).
- Anyone who must be in the picture is still kept in view (D42): if the moved camera leaves them out, it turns just enough, and the planner says so.
- The whole scene's cameras are still set on the floor plan page after "Change cameras", for re-shooting the scene.
- Tests: `tests/aim.d42.test.ts` (own camera where you put it; shared camera and other panels untouched; moving again reuses it); browser test on a copy of Jade's Entrance: drag panel 1's camera, view updates, saved as its own camera, panel 2 unchanged.

### D44: Seeing and changing someone's approach (2026-11-11)

Paul wanted Jade to approach the group from a different angle in panel 1. He moved Jade and the camera, typed "the angle jade approaches the group", got "Not understood", and felt "Show it on the plan" did nothing. The planner didn't show her path to the group at all, so the angle couldn't be seen, and the camera had to be placed by hand.

D38 test: an arrival from the wrong direction is a visible failure; the fixes reach the blocking frame (her start and walk arrow) and the camera choice.

- **Her path is drawn**: on a panel where someone arrives, crosses or approaches (D19b), an orange dashed arrow runs from where they start to their place with the others, labelled "Jade walks to the group". Dragging her start moves the arrow, so the angle of approach is what you see. This is the same walk the blocking frame draws for GPT.
- **"Let the app place the camera"** on the panel: the app chooses this panel's camera with the same film rules it uses for the whole scene, from where everyone is now (for example behind or beside someone arriving, on the scene's side of the line). It says what it chose and why. Saved as the panel's own camera (D43). Left and right in typed changes are as the picture shows them, so a camera placed afterwards can put the same person on the other side of the picture.
- **Words**: "Jade approaches the group from the left" (and "approaches Ben from the right") is understood.
- **When words change nothing**, the planner now says "Nothing changed. The app couldn't tell who should go where from …", and offers wording that works with the names used (e.g. "Jade comes in from the right", "Jade approaches the group from the left") as buttons that apply it.
- Tests: suggestions are all understood words (`tests/changeWords.d39.test.ts`); browser test on a copy of Jade's Entrance: Paul's words → "Nothing changed" with suggestions → suggestion applied → path drawn → app places the camera → saved as panel 1's own camera with Jade in view.

### D45: The path you can see, and nobody drops out unnoticed (2026-11-11)

On Paul's real panel 1 the orange path was drawn but he couldn't see it: thin, dashed, and running along the dashed amber line of action. Chase dropped out of the redrawn picture because the camera Paul moved left him just outside the frame; panel 1's "in frame" list is only Jade, so nothing kept or flagged him, and the check passed.

- **A path you can see**: arrivals' paths and walks are now a bold solid orange arrow ("Jade's path to the group"), and the line of action isn't drawn on a panel's planner, only on the scene plan.
- **Nobody drops out unnoticed**: if someone who was in the panel's original shot isn't in the picture with the camera as it is now (moved by you, or turned), the planner says so: "Chase was in this panel's original shot but isn't in the picture with this camera. Use “Let the app place the camera”, or move the camera so they're in the blue area."
- On Paul's own data, "Let the app place the camera" for his positions gives a wide shot with Chase, Marcus and Nina on the left and Jade on the right walking to them; the warning then goes. Browser test on a copy of his scene.

### D46: One form for changing a panel (2026-11-11)

To move Jade on panel 1, Paul had to type something into "Is anyone in the wrong place…" just to reach the planner, move her, then delete the words. He asked for "Need to change something?" to open one form with the planner showing and the other changes below it, and a single Submit.

D38 test: no new feature. The same planner (D39) and the same picture changes reach the generation as before (the blocking frame and the change prompt); this only takes away a step that made people type words they didn't mean.

- On a panel that has a camera, "Need to change something?" opens "Change panel N": that panel's planner on top (drag people, the camera or the path, or type a change into it), then "Anything else about the picture?" with the other questions (what else should change, anything else, pictures to show what you mean). The separate "who stands where" box is gone from this form, because the planner is it.
- One "Submit changes" bar at the bottom, pinned on screen as you scroll. It stays disabled until something changes. The planner's own Save and Cancel are hidden in this form.
- **Positions or camera changed**: they're saved for this panel (and carried on as before, D35), then the picture is redrawn fresh from the new layout, with any other changes added to the prompt ("follow the layout exactly, not any earlier picture").
- **Only a picture change**: the current picture is edited, as before.
- Cancel closes the form and draws nothing. Panels with no camera yet keep the plain form.
- Browser test on a copy of Paul's scene: one click opens the planner with no typing; no separate place box; Submit waits for a change; no planner Save inside; moved positions → one fresh redraw; picture-only change → edit of the current picture; Cancel → nothing drawn.

### D47: Nobody drops out of a panel's shot, and the scene's own logo is allowed (2026-11-11)

Paul redrew panel 1 with the new form. Jade came out where his layout put her, but Chase was missing again and the GLOWVANE logo was a new design (a white sunburst, where earlier pictures had a dark backdrop with a gold "G").

What happened, from his data:
- **Chase**: panel 1's own camera (the one Paul had moved) has Chase about 3° past the left edge. The planner warned, but nothing stopped it, so the request said "Exactly 3 people", and the check passed because panel 1's "in frame" list is only Jade.
- **The logo**: the last line of every picture request said "No text, no logos", while the props asked for a "GLOWVANE illuminated logo backdrop". The fresh picture left the backdrop out, the check flagged it, and the correction added one with a logo it made up. The backdrop has no picture and its words don't describe the logo, so every picture has had a different one (four different logos in five pictures).

D38 test: a person missing from the shot and a logo that changes between pictures are visible failures. The fixes reach the camera choice, the prompt's last line, and the prop's reference picture.

- **Keeping everyone in the shot**: whoever the panel's original camera has in the picture (where everyone is now) is kept in.
  - First the camera turns, keeping its place and lens, when a turn is enough. This shows live on the planner, as D42 does for the people who must be in it.
  - When a turn isn't enough, the app uses its own camera for the panel that has everyone in it, the one nearest where the camera was, so the angle chosen stays as close as it can (`nearestKeeping`). In the change form this happens as it opens, with a note: "Chase wasn't in the picture with this camera, so the app moved it to keep everyone in." On saving, it's applied to any panel still missing someone, and the panel card says what was done.
  - Only when they're just past the edge (in front of the camera, at most 15° outside the frame). A camera turned right round, with the group behind it, or framed tight on purpose is left as set. The planner says who isn't in the picture and offers "Keep everyone in".
- **The scene's own logo**: when a prop carries a logo or lettering (logo, sign, banner, poster, lettering, wordmark, billboard, placard, menu board), the last line of the picture and video prompts says "No other text or logos: the only lettering and logo are on the <prop>, exactly as described" (or "as in its attached picture"). Scenes without one keep "No text, no logos" (`signage.ts`).
- **A logo needs a picture**: a prop with a logo or lettering but no picture is flagged on the storyboard ("Logos and signs: … GPT makes it up and it comes out different in every picture") and next to the prop in the scene setting. The picture is sent with every panel picture the prop is in, as for any prop (D19c), and the check compares against it.
- Tests: `tests/signsAndKeep.d47.test.ts`. Browser tests on a copy of Paul's scene:
  - opening panel 1's form moves the camera to keep Chase in and says so, and the request has all four people;
  - the request no longer forbids the logo;
  - the sign notices show on the board and in the scene setting;
  - a camera turned round on purpose is left alone, with "Keep everyone in" offered;
  - D46's form test still passes.

### D48: The room at its real depth in every picture (2026-11-11)

On Paul's panel 1 the GLOWVANE backdrop came out much closer than the plan puts it, with the group drawn about 2.5 times bigger than their stand-ins.

What the app sent GPT, rebuilt from his data:
- **The far wall was drawn too near.** The 360° background puts each venue view on the ring as if it spanned 90° from the middle of the room. GPT drew the bar view from a few metres away with a narrower lens. In the frame, the bar's foot was where a wall about 9 m away would be, but the plan puts it 18 m away: right behind the group (8 m). The backdrop (11 m) had nowhere to be but in front of the bar, next to the group, and the bar view's own tables and bottles set a scale that made the group grow.
- **"Full shot" against a frame that cut her feet.** Paul's camera, about 2.5 m from Jade, cuts her at the ankles in the 2:3 picture (a 2:3 picture is a little shorter than the 9:16 frame it was designed for). The words said "the whole body head to toe", so GPT moved the camera back and tilted it down, and squeezed the room up behind her.

D38 test: things at the wrong distance are a visible failure in any scene with a 360° background. The fixes reach the blocking frame and prompt lines.

- **Each view measured once**: the vision model reads where each view picture's eye level is and where its floor meets the far wall (`calibrationPrompt`), kept on the venue with the picture it was measured on. This runs the first time the ring is built after a view changes, about 1p a picture.
- **At the room's scale**: a view whose far wall is drawn nearer than the room puts it is made smaller on the ring, around its eye level, so the wall's foot lands as far below eye level as the room's size says (`viewScale`).
  - It is only ever made smaller, never bigger (never below a third of the ordinary fit), so a doubtful reading can't blow a picture up.
  - Around it, and over the view's own open floor and the tables standing on it, a soft continuation of its colours, so the layout's people and props stand on a plain floor.
  - Without a GPT link, or when a reading can't be used, the ring is as before.
- **Sizes in words**: the request says how much of the picture's height each standing person fills ("head to toe about 17% of the picture's height", or "from the head down past the bottom edge"), and each prop 1.5 m or taller ("about 19% of the picture's height"), from the same geometry as the frame (`pictureShare`).
- **The shot the picture really gives**: when the shot is a full shot but the picture cuts the main person's feet, the request says so: "full shot, but the bottom edge cuts Jade at the ankles … do not move the camera back or tilt it down". When the picture cuts them higher, the size is named for what it is, for example "medium long shot" (`framedSize`, `withSize`). Video prompts are unchanged: the 9:16 frame does show the feet.
- Tests: `tests/backgroundDepth.d48.test.ts`. On a copy of Paul's scene:
  - the frame rebuilt with readings of his four views puts the bar's foot behind the backdrop, which is behind the group;
  - the four views are measured once and kept;
  - the request carries the sizes and the ankle-cut framing;
  - D47's browser test still passes.
- Still to judge on a real picture: whether GPT now keeps the depth. If not, the next step is to make the 2:3 picture show the full height of the 9:16 frame, rather than adding more words.

### D49: Measure the picture, one set of facts, and a way to test (2026-11-11)

An independent ChatGPT review of the picture pipeline (pack v1.1, `video-production/review`) concluded: keep all five consistency tools; give them an order of authority (plan and camera, then image 1, then references, then the room pictures, then words); stop the request contradicting itself; and make the app measure whether a picture matches the plan rather than adding instructions. Paul approved test plan v0.1 (B1 to B4) with ChatGPT's four refinements. D38 test: panel 1 was drawn with the group about 2.5 times too big and still passed as "matches the layout", and its request contradicted itself on the bag hand, the lighting and the logo. The fixes reach the picture check, the request text and the correction.

- **B1, a measured check.**
  - The vision model now also reports, for each main person, a box round their visible body, the top of their head, and their feet (or "hidden" or "below the bottom edge"). It also says whether the room's upright lines lean.
  - The app projects where each person should be from the plan, using the same geometry as image 1 (`pictureXY`), and compares:
    - **size:** head-to-feet height between 0.67 and 1.5 times the plan, for standing people whose whole height should show;
    - **place across:** within 20% of the picture's width;
    - **eye level:** everyone's heads shifted together by more than 10% of the height (6% if the upright lines lean) means the camera was tilted or moved;
    - **framing:** feet shown when the plan cuts them at the bottom edge means the camera moved back.
  - Anything it can't see (feet hidden, no heads) is listed as "not measured", never counted as a pass.
  - Results are given in three areas, **blocking**, **characters' look** and **room and props**, each passed or failed on its own. A geometry failure fails the picture however good it looks.
  - Replaying panel 1's oversized picture with measurements read off it, the check fails it. It finds Chase about 2.9 times too big, Nina 2.5 times, and heads 29% too high. A picture that follows the plan passes.
- **B2, a wrong composition is redrawn, not edited.** Size, eye level, framing and place-across failures are drawn again from image 1, with what went wrong added to the request. Edits stay for local things: a bag, clothes or a missing prop. The panel's button then says "Redraw it from the layout".
- **B3, one set of facts, a full or short request.**
  - The full and short requests are built in the same pass from the same values (`panelPrompt` returns both; the short one only when image 1 is a blocking frame).
  - The short one has image 1's job, what the references are for, who and in what order, walking, held items, sizes, props, what to keep, the moment, the camera, one light and the text rule. Panel 1's full request is about 10,200 characters; the short one about 4,000.
  - The setting `STORYBOARD_REQUEST=short` chooses the short one; full is the default.
  - Contradictions removed from both, by the order of authority:
    - which hand holds what is said once, from the reference picture, so the description's own "in her left hand" goes (`sceneDescription`);
    - instructions written for reference sheets go;
    - a prop with a picture is described by its picture alone;
    - the venue's lighting wins over the genre's "even lighting";
    - the moment is said once;
    - a still has no "tracking shot" (`withoutMove`);
    - "Exactly 4 main characters" rather than "people", since the guests are people too;
    - someone walking in isn't "around the table" yet;
    - no internal decision numbers.
  - `requestConflicts` scans each request before it's sent. Panel 1's full and short requests show none.
- **B4, test mode.** With `STORYBOARD_TEST=1`:
  - the automatic correction is off, so the first picture is the one scored;
  - each panel shows the request version, its length and any contradictions found;
  - each panel gets **Draw again from the layout** (about 7p) and **Check again** (about 1p);
  - every draw is saved in `data/tests/<time>_<panel>_<kind>_<picture>/`: the exact request, every input picture in the order sent (image 1 first), the model, quality, size and endpoint, the result and the check. The images API takes no seed, and the record says so;
  - every check adds a line to `data/tests/results.csv`: pass or fail by area, size against the plan per person, the eye-level shift, and what wasn't measured.
- Not done, as agreed: a 3D room, logo compositing, more locks, a compulsory second pass.
- Tests: `tests/measuredCheck.d49.test.ts`. Browser tests on a copy of Paul's scene, in test mode:
  - "Check again" fails the oversized panel 1 picture by area, with Marcus's size "not measured";
  - "Redraw it from the layout" draws fresh, not an edit, and records everything;
  - a draw from the change form with the short request makes no automatic fix;
  - D46's and D47's browser tests still pass.
- Next: Paul confirms the real check rejects panel 1's current picture ("Check again"), then runs T1 to T3 (test plan v0.2).

### D50: Read the measurements off a grid; venue scaling off (2026-11-11)

Paul ran "Check again" on panel 1's latest picture on his own machine. The check failed it on blocking, rightly: the group is about twice the planned size and the camera is tilted, with heads about 29% higher than planned. The numbers were off, though.

- **Feet misread.** The vision model read the heads well (within about 3% of the picture), but put the far group's feet about a quarter of the picture too low. It reported Chase at 60% of the height where he is about 37%. On a correct picture that error could fail it wrongly.
  - The check now also sends a copy of the picture with a numbered measuring grid (a line every 5% down and every 10% across), and says to read every position off it (`withGrid`). It also defines the head (hair included) and feet (the bottom of the shoes), and notes that people further back have their feet higher up the picture.
  - This adds one picture to each check, a fraction of a penny.
- **D48's venue scaling switched off.** The vision model read eye level very high in Paul's four venue pictures (36–38% from the top). The views were shrunk to about 40–55%, and image 1 became mostly blur. GPT still drew the group about twice too big, just as with the old frame, so the background wasn't the main cause of the squeezing.
  - The ordinary fit is back. `RING_CALIBRATION=1` turns the measured scale on again for testing.
  - Kept from D48: sizes in words, and the ankle-cut framing line.
- Next: Paul runs "Check again" once more (about 1p) to see that the grid brings the numbers close to a careful reading: Chase about 37%, Nina about 35%, Jade about 78%, heads about 20% from the top. Then T1 to T3.

### D51: Compare the picture with the plan drawn on it, instead of measuring (2026-11-11)

Paul ran "Check again" after D50. The verdict was right again (fails on blocking), but the grid didn't fix the numbers: the model put Chase at 66% of the picture's height (about 37% in fact) and Jade at 62% across (about 70%). The vision model can't be trusted to read exact positions. A check that mismeasures can pass a wrong picture or fail a right one. The check is what decides a redraw from the layout and what the redraw request says, and it is the score for tests T1 to T5.

- **Failure fixed (D38).** Panel 1's group is drawn about twice the planned size, with the camera tilted down. The check must say so reliably, and must not fail a correct picture. It reaches generation through the picture check: its verdict and wording go into the redraw.
- **The plan is drawn on the picture (`withPlan`, replacing `withGrid`).** Each main person gets a dashed, named box. The box runs from their planned head height to their planned feet, at their planned place across. A white dashed line marks the planned eye level, where the camera's height falls in the picture. When people stand close, the names are staggered so they don't overlap.
- **What the check asks.** It sends the picture, then the same picture with the plan drawn on it (image 2), then the approved shot (image 3), then the references. For each person the model answers one of:
  - fits;
  - bigger (with how many times taller);
  - smaller;
  - elsewhere;
  - hidden.
  It also says whether heads are on the line, well above it or well below it. Comparing a person with a box drawn beside them is a judgement the model can make; reading an exact percentage was not.
- **How the answers are judged.**
  - For a standing person, "bigger", "smaller" or "elsewhere" fails blocking and calls for a redraw.
  - Heads well above or below the line fail blocking.
  - Close-ups and people not in the shot are skipped.
  - "Hidden", or no answer, is listed under "Couldn't judge" and is never counted as a pass.
- **`OPENAI_CHECK_MODEL`.** This sets the model for the check alone. The default is unchanged (the text model, else gpt-5-mini). If the judgements still wobble, a stronger vision model can be tried on the check alone, at a higher cost per check.
- **Test records.**
  - Each check saves `check_plan_overlay.png`, so you can see what the model was comparing.
  - `results.csv` now has `size_vs_plan` (fit and times, for example "Chase bigger x2.1") and `eye_level`.
  - An older `results.csv` with different columns is kept as `results_before_<time>.csv`, not mixed in.
- **Tested.** This ran on a copy of Paul's scene with his real panel 1 picture.
  - The boxes and eye line sit where the plan puts the group: small, at the table, heads on the eye line. The drawn group is plainly about twice that height, with heads far above the line.
  - With a stand-in reply, the panel says Chase and Nina are about twice their planned height, heads are well above the planned eye level, and Marcus couldn't be judged. It offers "Redraw it from the layout".
  - The real model's judgement waits on Paul's run.
- **Next.** Paul pulls, restarts in test mode and clicks "Check again" (about 1p). He expects Chase and Nina "bigger" (about 2×), heads "well above", and Marcus probably hidden. Jade is drawn left of her box and taller, so "elsewhere" or "bigger" would be right for her. If the judgements match what can be seen, T1 to T3 follow.

### D52: The plan check is its own short request; heads read as numbers; a margin on size (2026-11-11)

Paul ran D51's "Check again" on panel 1. Only Jade was flagged (2× too tall). The model said Chase, Marcus and Nina "fit" their boxes and that heads were "on the line". Both were plainly wrong: the group is about twice its boxes, and everyone's heads are about a fifth of the way down the picture, where the plan has them halfway down. Paul saw the eye level was all wrong at a glance. He also pointed out that Jade, in the foreground, should look big. The dashed boxes, whose tops sit on the eye-level line, most likely led the model to judge the boxes instead of the people. The plan questions were also buried in one long request, with 8 pictures and a dozen other questions.

- **Failure fixed (D38).** A picture with the camera raised and tilted down, and the far group twice too big, passed on eye level and on the group's size. It reaches generation through the picture check, whose verdict and wording go into the redraw.
- **Its own request.** The plan questions are asked separately, at the same time as the main check. The request carries just the picture and the same picture with the plan drawn on it (D51). It names each main character with one line on how to recognise them: the first sentence of their clothes that names a colour (`lookLine`). It says the boxes are where people should be, not where they are. The main check no longer carries the plan. This adds well under 1p per check.
- **Heads as numbers, eye level decided here.**
  - The model gives the top of each person's head as a fraction of the picture's height. It read heads well before D51 (about 20% on panel 1, which is right); feet were the problem.
  - The eye level is judged by rule. It takes the middle of the differences between where the heads are and where the plan puts them, so one misread head doesn't decide it.
  - More than 8% of the picture's height above or below fails, with the numbers. On panel 1 that reads: "The camera is too high or tilted down: heads are about 19% of the way down the picture, but image 1 has them about 48% down, on the eye-level line."
  - The rule behind it: with a level camera at eye height, every standing person's head is on the eye-level line, near or far.
- **Size, with a margin.**
  - Each person is compared with their box: about the same, taller, shorter, away from it, or hidden.
  - Taller fails only at 1.5× or more; shorter only at two-thirds or less; away from it always fails.
  - Someone the plan cuts at the bottom edge (Jade here) isn't failed for looking taller. Their visible height runs from their head to the edge, so it follows where their head is, which the eye level already covers. Being shown whole when the plan cuts them still fails, because the camera has pulled back.
- **Test records.**
  - `check.json` keeps both raw answers (`replies.check`, `replies.plan`), so a wrong verdict can be traced to what the model actually said.
  - The `eye_level` column in `results.csv` reads, for example, "above: heads 19% down, planned 48%".
- **Tested.** This ran on a copy of Paul's scene with his real panel 1 picture and a stand-in answer like the one expected. The panel failed Chase and Nina at about twice their height and failed the camera with the head heights. It didn't fail Jade, listed Marcus (hidden) under "Couldn't judge", and offered "Redraw it from the layout". The real model's answer waits on Paul's run.
- **Next.** Paul pulls, restarts in test mode and clicks "Check again" (about 1p). If the verdict matches what he sees, T1 to T3 follow. If the heads come back wrong, `check.json` shows the model's numbers, and a stronger check model (`OPENAI_CHECK_MODEL`) is the next thing to try.

### D53: A person detector measures; the vision model only says who is who (2026-11-11)

Paul ran D52's "Check again". It caught the camera fault, but on numbers the model had made up. It put the group's heads 34–36% down the picture; the run before it said about 22%, and the real figure is about 20%. It also called a group twice its planned size "about the same". Four runs in a row, asked four different ways, the vision model guessed positions and sizes. Rewording won't make it measure.

- **Failure fixed (D38).** The check passed pictures whose people are twice their planned size. It also judged the eye level from numbers that change from run to run. It reaches generation through the picture check, whose verdict and wording go into the redraw.
- **The detector.** YOLOX-S (Apache 2.0, free for commercial use) runs through `onnxruntime-node` (MIT) on Paul's computer.
  - It costs nothing per picture and takes about a second.
  - Its 36 MB file is fetched from the YOLOX release the first time a check runs. It is checked against its SHA-256 fingerprint and kept in `data/models` (`PEOPLE_MODEL` can point elsewhere).
  - On Paul's panel 1 it outlined everyone exactly: Chase with his head 19% down and feet 58%; Nina 21% to 56%; Marcus cut off by the table; Jade 16% to 91%; the crowd's heads all about 23% down.
- **Who is who.** Everyone found is outlined and numbered left to right on a copy of the picture (`withMarks`). The vision model is asked only which number is each main character, with the one-line look from D52. Matching people is something it does well. A number can belong to one person only.
- **Measured by rule.** For each main character:
  - **Place across.** It fails when the outline's centre is further from the planned place than the larger of their planned width and 15% of the picture.
  - **Hidden.** An outline less than 1.9 times as tall as it is wide, and not cut by the bottom edge, is someone partly hidden (behind a table or another person). Their size isn't measured, and that is said.
  - **Size.** It is the outline's height against the planned height. 1.5× or more is too close, two-thirds or less too far. Someone the plan cuts at the bottom edge but who is shown whole means the camera has pulled back.
  - **Eye level.** It uses the middle of the head differences, 8% either way, as in D52.
  - Each problem carries the measured figures: "Chase Whitmore is drawn about 2.3 times the planned height (39% of the picture's height, planned 17%)".
- **Fallback.** If the detector can't run (no file and no internet, say), the check uses the D52 estimate. `measuredBy` in the result says which was used: "detector" or "estimate".
- **Test records.**
  - `check_people_found.png` is what the model was shown.
  - `check_plan_overlay.png` now shows each person's measured outline (solid) next to their planned box (dashed), in the same colour.
  - `check.json` has each person's outline number, head and place.
- **Paul's eye-level question.** The white line comes from the plan's camera (1.6 m, level), which puts every standing head on the middle line, near or far. GPT's picture points the camera about 30° down. Paul can keep the level camera, so this picture is redrawn. Or he can tilt that camera down in the layout to keep GPT's framing, and image 1, the request and the check all follow. The plan decides.
- **Tested.** Unit tests cover the detector's output decoding, keeping the surest guess, numbering, and the measured judgement on the detector's real outlines from Paul's picture. In the browser, in test mode, on a copy of Paul's scene with his real picture, the detector fetched and verified itself. The whole check took about 10 seconds. It failed Chase (2.3×) and Nina (1.9×), failed the camera (heads 19% down, planned 48%), passed Jade (1.4×, a little left but within her place), and listed Marcus as partly hidden.
- **On Paul's machine.** `git pull`, then `npm install` (adds onnxruntime-node; on Windows nothing extra downloads at install), then restart in test mode and click "Check again". The first check fetches the detector.
- **Follow-up (same day).** On Paul's computer the app wouldn't build ("Can't resolve 'onnxruntime-node'"): he had pulled but not yet run `npm install`. A missing package must not break the check.
  - The runtime is now loaded when a check runs, not when the app is built (`import(/* webpackIgnore: true */ ...)`). Without the package, the app builds and the check falls back to the estimate.
  - The panel then lists under "Couldn't judge" that exact sizes and heads are the vision model's estimate because the detector isn't running, with the fix: run `npm install` and restart.
  - Both ways were tested in the browser on Paul's picture.

### T1–T3 results (2026-11-11), panel 1, measured by D53

Nine draws were made: three per run, three runs. The check measured each one; the figures below leave out "looking at the camera" (see D54).

| Run | Model and request | Heads (planned 48% down) | Group's size (planned 17% of height) | Blocking passed |
| --- | --- | --- | --- | --- |
| T1 | gpt-image-2, full request | 21–25% down: camera pointed down in all 3 | up to 2.7× | 0 of 3 |
| T2 | gpt-image-2, short request | 22–27% down: all 3 | up to 2.8× | 0 of 3 |
| T3 | gpt-image-2.6-sunburst, short request (two were "Redraw it from the layout") | 45–49% down: right in all 3 | about 1.5–1.7× | see D54 |

- **The old model is the camera fault, not the request.** Full and short requests on gpt-image-2 gave the same result. The newer model follows image 1's camera every time.
- **What T3 still gets wrong** (Paul saw the second): it draws the group a little too close, and puts the table several metres in front of them instead of among them. D54 and D55 make the check see both.
- **Not yet known:** the newer model's price. Paul is to check the OpenAI usage page before it becomes the default.

### D54: Eye contact judged on face close-ups; numbers on chests; close-ups confirm the match (2026-11-11)

"Looking at the camera" failed 8 of the 9 draws. In the final one, Chase and Marcus face the camera (as the plan has them) but look at each other, and Paul could see it. The model took facing the camera for eye contact, on faces about 40 pixels tall. The close-ups made for this then showed a worse problem: in Paul's real check, the model had matched Chase and Marcus to two people standing just behind them. Each number sat at the corner of its outline, and where outlines overlapped, number 3 was beside Chase's face. So two of T3's "fits" had been measured on the wrong people.

- **Failure fixed (D38).** Pictures were failed for eye contact that isn't there, which would trigger needless redraws. People were also measured on the wrong outline, which can pass a wrong picture. Both reach generation through the picture check and its redraw.
- **Numbers on the chest.** Each person found is numbered in a circle on their chest, a fifth of the way down their outline, not at a corner. Outlines are drawn thinner.
- **Face close-ups.** Each matched main character is cropped head and shoulders from the picture (`headCrop`, at least 48 pixels) and enlarged. The close-ups go in one short request. For each, the model is given the character's one-line look and asked two things:
  - **is_them**: does the person in the middle fit the description?
  - **eyes**: into the lens, elsewhere, or can't tell. Facing the camera while looking at someone else is "elsewhere"; so is someone seen from behind or side-on.
- **The rules.**
  - A "no" on is_them means the outline was someone else's. That person isn't measured, and isn't judged for eye contact; the panel says so.
  - Only "into the lens" fails.
  - "Can't tell", and a face too small to crop, are listed under "Couldn't judge".
  - The main check no longer asks about eye contact when the close-ups are asked. If they couldn't be asked, it says eye contact wasn't judged.
- **Test records.** `check_faces.png` shows the close-ups, named, and `check.json` keeps the answer.
- **Tested.** This ran on Paul's final T3 picture in the browser, with the real detector and stand-in answers. The close-ups show Chase, Marcus and Nina each looking at the others, and Jade from behind. With them matched correctly, the group measures Chase 1.7×, Marcus 1.6× and Nina 1.5× (so blocking fails on size), and nobody is failed for eye contact.

### D55: Props the detector knows are measured against the plan (2026-11-11)

Paul pointed out that in all three T3 pictures the cocktail table is a long way in front of Chase, Marcus and Nina. The plan has it among them, under a metre from each. The check passed "Room and props". Its question only catches a prop that's clearly behind when it should be in front, or the other way round. "Among the people" against "well in front of them" slipped through.

- **Failure fixed (D38).** A table drawn several metres from the group it belongs with passed. It reaches generation through the picture check: the problem, with figures, goes into the redraw.
- **Measured like the people.** The detector already sees furniture: table, chair, sofa, bench, plant pot, bed and television. A key prop whose name says it's one of these (`detectorKind`: a "cocktail table" is a table; a bar counter, a plinth or a logo wall isn't) gets a planned place from the plan's projection: where its foot meets the floor in the picture, and where across. The nearest detected object of that kind is compared with it. If its foot is more than 8% of the picture's height lower, the prop is well in front; if higher, well behind. If it's more than 15% across, it's in the wrong place across. Each fails "Room and props" with the figures and asks for a redraw.
- **Only when the camera is right.** Props are judged only when the eye level passes. If the camera has moved, everything moves, and the camera problem already says so.
- **Not found** (nothing of that kind near its place) is listed under "Couldn't judge", never passed. Props the detector doesn't know stay with the vision model's description.
- **Tested.** On Paul's final T3 picture: "The cocktail table is well in front of where image 1 puts it: its foot is about 91% of the way down the picture, but image 1 has it about 67% down, among the people." The detector also found the table in the other T3 pictures and in T1.

### D56: Image 1 shows only the plan's furniture, and draws the plan's table solid (2026-11-11)

After D55 caught it, Paul redrew panel 1. The cocktail table was still well in front of the group. The cause was in image 1. Image 1's background is the venue picture for that direction, and the bar view has a real table in it, with a white cloth, flutes and hydrangeas, at the front centre of the frame. The plan's cocktail table was only a thin grey outline and pole among the stand-ins. GPT copied the solid, photographic table. The detector finds the venue picture's table exactly where all three T3 pictures put theirs.

- **Failure fixed (D38).** The plan's prop was drawn in the wrong place because the room picture held a different one. It reaches generation through image 1. It also follows the order of authority: the room pictures decide the room's look, not where anything stands.
- **Loose furniture is cleared from image 1's background.** The background is put through the person detector (`looseFurniture`). Furniture standing on the floor below the horizon that isn't near a plan prop of its kind is softened into the room: tables, chairs, sofas, benches, plant pots, beds. The patch reaches half its height again above it, so glasses and flowers on a table go too. The softening is the same blur image 1 already uses for the floor beyond the venue pictures. The plan's own props stay, and so does anything up on the walls (a screen, a sign). If the detector can't run, the background is used as it is.
- **The plan's table is drawn solid.** Instead of an outline and a pole, it's a draped table from its top to the floor, at its real size, with its label. Image 1 shows it as plainly as the people.
- **Tested.** Unit test for which furniture is cleared and kept. Paul's panel 1 image 1 was rendered before and after: the bar view's table at the front centre and a second one behind the stand-ins are gone, and the plan's cocktail table stands solid among Chase, Marcus and Nina.
- **Next.** Paul redraws panel 1 with the newer model; the check (D55) measures where the table lands. If GPT still moves it, the next step is the prop's own picture cut out in its place (T4's idea, for props).
