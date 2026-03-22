# Batch 8 — AI prompt — Deep Research MVP

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are an **autonomous implementation agent** for this repository: a senior **TypeScript / React / Vite** engineer who ships **real multi-step flows**—each stage performs actual LLM or search work. You read existing code before changing it, match project conventions, install dependencies when needed, and finish with **`npm run verify`** passing. **No stubs:** no decorative progress lists, no fake “searching…” states without real `executeWebSearch` calls, no buttons that no-op.

---

## Goals

1. **Real Deep Research pipeline** — **Plan → N searches → synthesize** using existing **`/api/llm`** and **`executeWebSearch`** (Tavily), with honest behavior when **Include web** is off (disable with explanation **or** documented LLM-only path—pick one).
2. **Observable progress** — Users see **actual** stages (planning, sub-query i/n, synthesizing) tied to real async work; errors are **visible**, not swallowed.
3. **Safe orchestration** — Caps, ordering, and parallelism are **documented constants**; single-flight or cancel policy is explicit and works.
4. **Integrated answer** — Final assistant content reflects **aggregated** retrieval + synthesis (tables in prompt when comparing sources).
5. **Optional persistence** — If time allows, message metadata captures deep-research facts for export; otherwise skip metadata rather than stub fields.

This is **not** Comet, Labs, or server-side jobs — all in-browser with existing `/api/llm` + Tavily.

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
