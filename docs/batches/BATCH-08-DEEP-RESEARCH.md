# Batch 8 — AI prompt — Deep Research MVP

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are a **research systems researcher**—you study how to **plan → retrieve → synthesize** multi-step answers using the app’s existing **LLM** and **web search** hooks.

---

## Goals

- **Goal:** To research how to create a **good Deep Research entry point** (distinct from “Advanced analysis”), including honest behavior when **Include web** is off—then implement one clear policy (disabled with explanation **or** documented LLM-only path).
- **Goal:** To research how to create a **good planner** output (3–5 sub-queries) and a **safe search loop** over **`executeWebSearch`** with documented caps and rate awareness.
- **Goal:** To research how to create a **good synthesis pass**—one final answer that uses **all** gathered snippets (tables in prompt when comparing sources).
- **Goal:** To research how to create a **good progress UI** tied to **real** async work (no decorative steps); errors must be **visible** with a chosen continue vs abort policy.
- **Goal:** To research how to **persist** useful metadata (`isDeepResearch`, optional `deepResearchMeta`) **or** skip it—**never** stub fake fields.

This is **not** Comet, Labs, or server-side jobs — all in-browser with existing `/api/llm` + Tavily.

**Engineering contract:** You are also the **implementing engineer**: read the codebase first, match conventions, **`npm run verify`**, **no stubs**—every progress step maps to a real LLM or search call (or explicit user-visible skip/abort with honest copy).

---

## Prerequisite

Batch **7** merged (or at minimum Phases 1–6 + stable `executeWebSearch` / UI).

---

## Deliverables

1. **User entry** — Clear UI to start “Deep research” (distinct from existing “Advanced analysis” if needed — document the difference in UI copy). Must respect **`includeWebSearch`**; if web off, either **disable** deep research with explanation **or** run **file + workspace + LLM-only** synthesis with honest labelling (pick one behaviour and document).

2. **Planner** — One **LLM** call produces **3–5 sub-queries** (JSON or structured text you parse safely) from the user question + workspace context.

3. **Search loop** — For each sub-query, call **`executeWebSearch`** (reuse; respect focus mode, advanced depth policy you define once). **Cap** max sub-queries (e.g. 5) and **sequential or limited parallel** with **rate** awareness — document constants.

4. **Synthesis** — Single final **`callLlm`** (chat messages ok) that ingests **all** snippets + user goal; output is the assistant message; **markdown tables** encouraged in prompt when comparing sources.

5. **Progress UI** — Step list: planning → searching (i/n) → synthesizing; **errors** on a failed sub-search must not silently drop — **toast** and continue or abort with user-visible summary (choose one policy).

6. **Persistence** — Store on the **Message** type a flag like `isDeepResearch: true` (may already exist) + optional **`deepResearchMeta`** (sub-queries used, timings) for export (Phase 5) — **optional** if timeboxed.

---

## Out of scope

- Background workers, Web Workers mandatory, server queue, Comet, Labs, new APIs.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** Start deep research on a multi-part question; observe progress; final answer cites multiple searches; failure path readable.

---

## Governance

**No stubs.** Every progress step must correspond to **real work** (LLM call, search call, or explicit user-visible abort/skip with honest copy). No fake progress ticks or static step lists.
