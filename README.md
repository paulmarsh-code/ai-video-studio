# AI Video Production Studio

Mind First Group Ltd add-on product. Built to **Build Spec v1.4** (approved 8 Nov 2026).

Plan, check and log AI video shots *before* spending generation credits. The first provider is Kling 3.0 Omni, used through the Kling web app.

## Status: Phase 1 checkpoint 1 (8 Nov 2026)

| Area | State |
|---|---|
| Project scaffold (Next.js 15, React 19, TypeScript, Tailwind 4) | ✅ |
| Data schema (`prisma/schema.prisma`, SQLite) | ✅ written; **validate on first run** (see below) |
| Rules engine: geometry, duration, validator, Kling prompt composer (`src/lib/domain`) | ✅ |
| Acceptance tests 1–7 and 16, plus regressions (`tests/`) | ✅ 19 passing |
| Checkpoint page showing three Paid On Time shots composed and checked | ✅ |
| Shot Director form, geometry editor (React Konva), persistence, library L1, animatic R1 | ⏳ next |
| Phase 2 adds: take review, metrics, animatic R2, **animatic-to-rough-cut (D11)** | planned |

Decisions since the spec: see `docs/DECISIONS.md`.

## Run it

```bash
npm install
npx prisma validate && npx prisma db push   # creates dev.db (needs internet for Prisma engines)
npm test                                    # rules-engine acceptance tests
npm run dev                                 # http://localhost:3000
```

`.env` holds `DATABASE_URL="file:./dev.db"`.

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
prisma/            data schema
tests/             acceptance tests (Vitest)
```

Demo data is illustrative and editable. It contains no Watford FC data, assets or likenesses.
