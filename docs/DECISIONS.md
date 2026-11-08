# Decisions log

Decisions made since Build Spec v1.4 was approved. Each one is folded into the next spec version.

| Date | # | Decision | By |
|---|---|---|---|
| 8 Nov 2026 | D1 | Build Spec v1.4 approved as the build baseline | Paul |
| 8 Nov 2026 | D2 | Builder: Claude Code, in a private Mind First GitHub repository | Paul |
| 8 Nov 2026 | D11 | **Animatic-to-rough-cut moves from "Later" into Phase 2** | Paul |
| 8 Nov 2026 | D12 | Database layer: **Drizzle ORM + better-sqlite3** instead of Prisma (still SQLite, still portable to PostgreSQL) | Claude (build), for Paul's review |
| 8 Nov 2026 | D13 | Database driver: **sql.js** (pure JavaScript and WebAssembly SQLite) instead of better-sqlite3, so it installs on any PC and any Node version with no C++ build tools | Claude (build), for Paul's review |

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
