# Phase 2 complete — Thread history + focus vs Include web

**Status:** Implemented on branch [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/include-web-toggle-6a03) ([PR #8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)).

## Part A — Thread history (main chat path)

### `src/lib/llm.ts`

- `callLlm` now supports **`CallLlmChatOptions`**: `{ model, messages: LlmChatMessage[], jsonMode? }`.
- The existing **`callLlm(prompt, model, jsonMode?)`** signature is **unchanged** for `generateFollowUpQuestions`, Model Council, `fileAnalysis`, etc.

### `src/lib/threadContext.ts`

- **`buildPriorLlmMessages(priorMessages)`** turns prior `Message[]` into user / assistant pairs (model-council turns use `modelResponses` text).
- **`thread.messages.slice(0, -1)`** excludes the current user message.

### `src/App.tsx` — standard path builds

- **system:** assistant persona + workspace prompt + advanced instruction  
- **prior:** `buildPriorLlmMessages(...)`  
- **final user:** web snippets + file snippets + `User query:` + task instructions  

### `vite-plugins/openai-proxy.ts`

- **No change** — the proxy already forwards the POST body to `chat/completions`.

## Part B — Focus vs Include web

- **`useEffect`** — when **Include web** is off, **`focusMode`** is reset to **`'all'`**.
- **`FocusModeSelector`** — `webSearchEnabled={includeWebSearch}`: selector **disabled** when web is off, with a tooltip (*Focus applies to web search only. Turn on Include web…*).
- **`executeWebSearch`** — still only called when web search is on; no extra “effective focus” variable needed.

## Token / limit constants (`threadContext.ts`)

| Constant | Value |
|----------|------:|
| `MAX_PRIOR_MESSAGES` | 28 |
| `MAX_CHARS_PER_HISTORY_MESSAGE` | 8000 |
| `MAX_TOTAL_HISTORY_CHARS` | 40000 |

## Docs

- **`docs/PHASE-02-AI-PROMPT.md`** — behaviour, limits, focus rules (planning reference).

## How to test

```bash
npm install && npm run verify
```

**Manual:** `npm run dev` — **3+ turns**, ask e.g. *“What was my first question?”*; turn **Include web** off and confirm focus is disabled, tooltip, and value **All Sources**.

## Follow-ups (optional)

- Extend **Model Council** with the same history pattern if council models should see prior turns.

---

*Prerequisite: Phase 1 — `docs/PHASE-01-COMPLETE.md` · Telescope: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md`.*
