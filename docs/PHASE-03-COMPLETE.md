# Phase 3 complete — Model Council + thread history

**Status:** Implemented on branch [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/include-web-toggle-6a03) (commit `305ce39`, [PR #8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)).

## Signature

`executeModelCouncil` takes an optional **6th** argument:

```ts
priorMessages: Message[] = []
```

**Full signature:**

```ts
executeModelCouncil(
  query,
  contextSection,
  fileContext,
  systemPrompt,
  selectedModels?,
  priorMessages?
)
```

**`App.tsx`** passes **`thread.messages.slice(0, -1)`** — same rule as the main path (everything before the current user message).

## How priors are wired

- **`buildPriorLlmMessages(priorMessages)`** — same helper and caps as Phase 2 (`threadContext.ts`).
- **`buildAssistantSystemContentFromCombined(systemPrompt)`** — shared system line; used by both the main assistant path and council (`systemPrompt` is still workspace + advanced, i.e. `systemPrompt + modeInstruction` from `App`).
- **`buildCouncilResearchUserContent(contextSection, fileContext, query)`** — final user turn: web/file blocks + `User query:` + the original council task branch (web vs files vs general knowledge), **not** the main path’s “prior conversation when relevant” wording.

Each council model call uses:

```ts
callLlm({ model, messages: sharedCouncilMessages, jsonMode: false })
```

with **one shared `messages` array** (system + priors + research user). **No** legacy `callLlm(basePrompt, model)` for the council answer step.

## Convergence step

**Unchanged:** still `callLlm(analysisPrompt, 'gpt-4o-mini', true)` — single-shot JSON on **current query + model outputs** only.

## Files touched

| File | Change |
|------|--------|
| `src/lib/threadContext.ts` | `buildAssistantSystemContentFromCombined`, `buildCouncilResearchUserContent` |
| `src/lib/api.ts` | `executeModelCouncil` uses chat messages + prior list |
| `src/App.tsx` | Passes priors; main path system line uses `buildAssistantSystemContentFromCombined` |
| `docs/PHASE-02-AI-PROMPT.md` | Model Council subsection (on implementation branch) |

## How to test

```bash
npm install && npm run verify
```

**Manual:** `npm run dev` — **2+ turns**, then Model Council with a follow-up that **depends on earlier turns**; also try a **single-message** thread.

---

*Prerequisites: `docs/PHASE-01-COMPLETE.md`, `docs/PHASE-02-COMPLETE.md` · Prompt: `docs/PHASE-03-AI-PROMPT.md`.*
