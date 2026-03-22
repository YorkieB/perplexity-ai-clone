# Batch 7 — AI prompt — Search & transparency

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are an **autonomous implementation agent** for this repository: a senior **TypeScript / React / Vite** engineer who ships **complete, working features** (no placeholders). You read existing code before changing it, match project conventions, install dependencies when needed, and finish with **`npm run verify`** passing. **No stubs:** do not add fake search steps, empty “transparency” panels, or UI that suggests behavior that is not implemented—**hide** or **omit** rather than fake.

---

## Goals

1. **Transparent search UX** — When web search runs successfully, users understand **what** was queried and **how** (focus, advanced) via a real, data-backed trace; when web is off, **no** trace block.
2. **Cleaner sources** — `Source[]` is **deduplicated** by normalized URL without breaking `SourceCard` or downstream consumers.
3. **Scannable citations** — Sources are **grouped by domain** with expand/collapse where it helps; single-source groups behave like today.
4. **Reliable follow-ups** — Related questions appear **consistently** after answers (including council paths where applicable), with a sensible empty state.
5. **Shippable quality** — Optional dev-only logging only; production UI stays clean.

---

## Prerequisite

Phases **1–6** merged or present on your working branch (`docs/PHASE-01-COMPLETE.md` … `docs/PHASE-06-COMPLETE.md`).

---

## Deliverables

1. **Source deduplication** — When building `Source[]` for a message, **dedupe by normalized URL** (strip hash, trailing slash policy documented in code). Keep highest score / first occurrence; do not break existing `SourceCard` consumers.

2. **Source grouping (clustering)** — In the thread UI, **group sources by registrable domain** (e.g. collapsible “example.com (3)” ) with expand to list. If a group has one source, render as today. Use existing design tokens / components.

3. **Search step trace (transparency)** — When **web search ran** (`executeWebSearch` returned results, not only error), show a **collapsible “Search steps”** (or “How we searched”) section: query sent, focus mode label, advanced on/off, **timestamp optional**, **no fake steps**. If web was skipped (Include web off), **omit** this block entirely.

4. **Related questions** — Ensure `generateFollowUpQuestions` results are **shown consistently** (existing component); **empty state** if LLM returns none; **no duplicate** chips vs message content. Fix any bug where follow-ups don’t appear after council path if applicable.

5. **Telemetry in dev only** — Optional `import.meta.env.DEV` log of search params for debugging — **not** user-visible spam.

---

## Out of scope

- New search **providers** (Bing, etc.), image search backends, server-side ranking, Deep Research (Batch 8).

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** Run a query with web on → see grouped/deduped sources + step trace expand/collapse; related questions appear; toggle web off → no step trace.

---

## Governance

**No stubs.** No placeholder panels, no invented steps. If the step trace has nothing truthful to show, **hide** the block entirely.
