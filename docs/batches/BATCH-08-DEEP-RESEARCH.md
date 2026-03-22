# Batch 8 — AI prompt — Deep Research MVP

**Paste this entire file as the first message to a new coding agent.**

---

## Prerequisite

Batch **7** merged (or at minimum Phases 1–6 + stable `executeWebSearch` / UI).

---

## Goal

Ship a **credible Deep Research** flow (telescope **Execution constellation**): an **orchestrated multi-step** research pass — **plan → multiple searches → synthesize** — with **visible progress**, **cancellable** or **single-flight** guard, and **respect** for Include web / focus / workspace prompts.

This is **not** Comet, Labs, or server-side jobs — all in-browser with existing `/api/llm` + Tavily.

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

Every step must **do real work** or **not be shown**. No fake progress ticks.
