# AI Video Production Studio

Mind First Group Ltd add-on product. Built to **Build Spec v1.4** (approved 8 Nov 2026).

Plan, check and log AI video shots *before* spending generation credits. The first provider is Kling 3.0 Omni, used through the Kling web app.

## Status: Phase 1 checkpoint 1 (8 Nov 2026)

| Area | State |
|---|---|
| Project scaffold (Next.js 15, React 19, TypeScript, Tailwind 4) | ✅ |
| Data layer: Drizzle + SQLite via sql.js, no native build needed (`src/db`), auto-migrate, demo seed, repository (`src/lib/repo.ts`) | ✅ (D12, D13) |
| Rules engine: geometry, duration, validator, Kling prompt composer (`src/lib/domain`) | ✅ |
| Tests: acceptance 1–7, 16, 18–20, blocking, persistence and regressions (`tests/`) | ✅ 49 passing |
| Projects, scene and shot list with live check status | ✅ |
| Shot Director: presence per character, locked dialogue, live checks, Kling prompt, Copy, prompt versions | ✅ |
| Floor plan editor (React Konva): drag people, furniture and cameras, aim handles, viewing cones, 180° line, versioned saves | ✅ |
| Animatic Release 1: timed storyboard player, subtitles with emotion tags, uploaded line audio, fit-to-line timing, versions | ✅ |
| Library L1: save characters, plans and shot set-ups; copy and change; stats from the take log | ✅ |
| Character and venue studios (editing), storyboard editing, take review (Phase 2) | ⏳ next |
| **Shot designer (D14):** app proposes cameras per shot from the film-grammar rules library (`docs/CINEMA_RULES.md`), options with reasons, multi-shot suggestions | ✅ |
| Floor plan impact warnings + undo; hidden-face (occlusion) check | ✅ |
| Phase 2 adds: take review, metrics, animatic R2, **animatic-to-rough-cut (D11)** | planned |

Decisions since the spec: see `docs/DECISIONS.md`.

## Run it

Needs Node.js 22 or newer. No C++ build tools needed.

```bash
npm install                                 # database is created in ./data on first run
npm test                                    # rules-engine acceptance tests
npm run dev                                 # http://localhost:3000
```

The database file is `data/studio.db`; set `STUDIO_DB` to change it. Delete it to re-seed the demo project.

## Design rules carried into code

- **One speaker per clip.** A second speaker is flagged.
- **Dialogue is locked.** The prompt carries it word for word, and any edit is caught.
- **Voice lock.** Each character's approved voice text is injected word for word.
- **Kling native audio only.** Audio or voice reference files are flagged (v1.3).
- **Quote marks appear only around the spoken line.** Quotes anywhere else are removed when the prompt is composed.
- **Duration comes from the dialogue:** 2.75 words per second plus 1 s, clamped to 3–15 s.
- **Silent shots** get audio off and a no-speech guard.
- **Excluded characters are never named** in the prompt.
- **Geometry from the top-down plan:** frame-left, centre and frame-right; the over-the-shoulder foreground; the background view; and the 180° line, with override reasons.

## Layout

```
src/lib/domain/    pure TypeScript rules engine (no framework imports)
src/lib/demo/      Paid On Time illustrative data (not approved assets)
src/app/           Next.js app
src/db/            Drizzle schema, client, demo seed
drizzle/           SQL migrations
tests/             acceptance tests (Vitest)
```

Demo data is illustrative and editable. It contains no Watford FC data, assets or likenesses.
