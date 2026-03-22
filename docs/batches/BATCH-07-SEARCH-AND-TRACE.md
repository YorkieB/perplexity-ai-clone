# Batch 7 — AI prompt — Search & transparency

**Paste this entire file as the first message to a new coding agent.**

---

## Prerequisite

Phases **1–6** merged or present on your working branch (`docs/PHASE-01-COMPLETE.md` … `docs/PHASE-06-COMPLETE.md`).

---

## Goal

Close major **gaps in the Search constellation** (telescope Layer 2–3): users can **see how search was performed**, get **deduplicated / grouped sources**, and **reliable related questions** — without changing the core Tavily integration contract unless necessary.

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

No placeholder panels. If step trace has nothing to show, hide it.
