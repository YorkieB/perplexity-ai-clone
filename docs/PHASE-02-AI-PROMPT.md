# Phase 2 — AI agent prompt (copy into a new agent)

**Use this entire block as the initial message** when opening a new agent.

**Prerequisite:** Phase 1 is merged or your branch includes `includeWebSearch` / `DEFAULT_USER_SETTINGS` / Include web UI (see `docs/PHASE-01-COMPLETE.md`). If those pieces are missing, complete Phase 1 first.

---

## Role

You are an implementation agent. **Phase 2** has two parts (both should ship in one coherent PR unless split for size):

1. **Full-thread context for the LLM** — answers should use **conversation history**, not only the latest user message (telescope intent: multi-turn memory).
2. **Focus mode vs Include web** — when **Include web** is off, focus modes are irrelevant to search; **soften UX** (disable selector, reset to `all`, and/or short helper copy) so users are not misled.

---

## Part A — Thread history in the main chat path

### Product intent

- For the **standard** assistant reply (not necessarily Model Council), the model should see **prior user and assistant turns** in the active thread, within reasonable **length limits**.
- The **current** user message stays the main query; web results + file snippets + workspace instructions remain **additive context** as today.
- Do **not** break **follow-up question generation** or **Model Council** flows unless you intentionally extend them; at minimum, keep existing behaviour working.

### Technical approach (you choose details, but justify in summary)

- Prefer **chat-style** requests to `POST /api/llm`: a `messages` array `[{ role, content }, ...]` matching OpenAI Chat Completions, instead of a single giant user string — **if** you extend `src/lib/llm.ts` and `vite-plugins/openai-proxy.ts` to forward a `messages` body when provided.
- Alternatively, build a **single structured transcript** (clear separators, roles labeled) and keep one `user` message — acceptable if documented and truncated safely.
- Add a small helper (e.g. `src/lib/threadContext.ts`) that:
  - Takes the active `Thread` (or `messages` array) and produces either `messages[]` or transcript text.
  - **Skips** or **summarizes** huge assistant blobs if needed; enforce a **max messages** and/or **max chars** budget (constants at top of file).
  - Maps `Message` content safely (assistant messages may include markdown; keep plain text or strip minimally).

### Files you will likely touch

- `src/App.tsx` — where `callLlm` / prompt is built for the main reply path.
- `src/lib/llm.ts` — extend to support multi-turn (messages array or overloaded signature).
- `vite-plugins/openai-proxy.ts` — forward `messages` if the client sends them (must remain valid OpenAI JSON).
- `src/lib/types.ts` — only if new types help (e.g. `ChatMessage`).

### Edge cases

- **First message in thread:** behaviour matches today (no history).
- **Model Council path:** can remain single-shot per model unless you explicitly add history (optional stretch goal).
- **`generateFollowUpQuestions`:** may stay as-is using last answer + query.

---

## Part B — Focus mode when Include web is off

### Product intent

- **Focus mode** only changes **web search** query shaping. If web search is **not** run (`includeWebSearch === false`), showing a rich focus selector implies it does something — **it does not** for search.
- Pick **one** consistent UX (preferred order):
  1. **Disable** `FocusModeSelector` when web is off + tooltip/helper: “Focus applies to web search only,” **or**
  2. **Force** internal focus to `'all'` for search when web is off (display can show disabled state), **or**
  3. **Hide** the selector when web is off in surfaces where it appears.

Ensure **no** dead code paths: `executeWebSearch` should not receive a misleading focus modifier when web is skipped (already skipped in Phase 1 — double-check call sites).

### Files you will likely touch

- `src/components/QueryInput.tsx` — wire `includeWebSearch` into focus UI.
- `src/App.tsx` — if focus is forced to `'all'` when web off, do it **once** before any search call (defensive).

---

## Verification (mandatory)

```bash
npm install
npm run verify
```

Manual: `npm run dev` — thread with **3+ turns** and confirm the assistant **uses prior context** (e.g. “What did I ask first?”). Toggle **Include web** off and confirm focus UX matches Part B.

---

## Deliverable

- Typed changes, no new `any` without reason.
- Final message: summary, files touched, how to test, token/limit constants you chose.

## Out of scope (Phase 3+)

- “Best model” auto-select, voice, Pages, Deep Research agent, new search providers, billing.

---

*References: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Chat/LLM: multi-turn memory; Search: focus when web context applies). Phase 1: `docs/PHASE-01-COMPLETE.md`.*
