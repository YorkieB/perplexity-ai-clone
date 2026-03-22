# Phase 2 — AI prompt & search context

## Multi-turn memory (main chat path)

The standard assistant reply uses **OpenAI Chat Completions** via `POST /api/llm` with a `messages` array:

1. **`system`** — `You are an advanced AI research assistant.` plus workspace `customSystemPrompt` (when active) and advanced-mode instruction text.
2. **Prior turns** — Built by `buildPriorLlmMessages()` in `src/lib/threadContext.ts` from `thread.messages.slice(0, -1)` (everything before the current user message). Roles are `user` / `assistant` with plain text; model-council replies are condensed from `modelResponses`.
3. **Final `user`** — Current-turn web snippets, file snippets, the user query, and task instructions (web vs files vs general knowledge).

Legacy single-string `callLlm(prompt, model)` remains for follow-up questions, JSON helpers, and convergence analysis.

### Model Council (Phase 3)

Each council model uses the same `messages` shape as the main path: **system** (`buildAssistantSystemContentFromCombined`), **prior** (`buildPriorLlmMessages`), **final user** (`buildCouncilResearchUserContent` — legacy council task text, not the main-path “prior conversation when relevant” wording). Convergence analysis stays a single-shot `callLlm` with JSON mode on the current query plus model outputs.

### Limits (see `threadContext.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_PRIOR_MESSAGES` | 28 | Max prior user+assistant messages kept |
| `MAX_CHARS_PER_HISTORY_MESSAGE` | 8000 | Per-message cap after extraction |
| `MAX_TOTAL_HISTORY_CHARS` | 40000 | Total budget; oldest messages dropped first |

## Proxy

`vite-plugins/openai-proxy.ts` forwards the request body unchanged to `chat/completions`; no proxy change was required for `messages[]`.

## Focus mode vs Include web

Focus modes only change **web search** query shaping (`executeWebSearch`). When **Include web** is off:

- `executeWebSearch` is not called (Phase 1).
- UI: focus selector is disabled with a tooltip; focus resets to `all` so the control does not imply a non-web effect.
