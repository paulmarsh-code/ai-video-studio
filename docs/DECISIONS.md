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
