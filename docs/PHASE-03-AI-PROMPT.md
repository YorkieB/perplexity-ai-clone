# Phase 3 — AI agent prompt (Model Council + thread history)

**Status:** Implemented — see **`docs/PHASE-03-COMPLETE.md`** (PR [#8](https://github.com/YorkieB/perplexity-ai-clone/pull/8), commit `305ce39` on `cursor/include-web-toggle-6a03`).

**Use this entire block as the initial message** when opening a new agent (historical / replay).

---

## Prerequisite

- **Phase 1** complete: Include web, `UserSettings.includeWebSearch`, `DEFAULT_USER_SETTINGS` (`docs/PHASE-01-COMPLETE.md`).
- **Phase 2** complete: `callLlm` supports **`CallLlmChatOptions`** (`messages: LlmChatMessage[]`), **`src/lib/threadContext.ts`** with **`buildPriorLlmMessages`**, main chat path uses system + prior + final user (`docs/PHASE-02-COMPLETE.md`).

If your branch does not have `threadContext.ts` and chat-style `callLlm`, **merge or rebase Phase 2 first**.

---

## Role

You are an implementation agent. **Phase 3** implements the **optional follow-up from Phase 2**: **Model Council** should see the **same prior conversation** as the main chat path, so multi-turn threads are coherent when the user enables Model Council.

**Out of scope for Phase 3:** Deep Research agent, Pages, “best model” auto-select, new search providers, billing.

---

## Product intent

- When the user runs **Model Council** in a thread that already has **prior turns**, each council model should receive:
  - The same **system** framing as the standard path (assistant persona + workspace + advanced instructions — match `App.tsx` conventions).
  - The same **prior** history as **`buildPriorLlmMessages(priorMessages)`** (reuse constants / limits from `threadContext.ts`; do not fork divergent truncation rules unless you extract shared helpers).
  - A **final user** message that contains the **research task**: web/file context snippets + `User query:` + the same task instructions currently embedded in `executeModelCouncil`’s `basePrompt` (today: single user blob).

- **First message in thread** (no priors): behaviour should match current council behaviour (no prior array, or empty priors).

- **Convergence analysis** (`llmPrompt` + JSON): may stay **single-shot** on the **current query + council outputs** unless you have a strong reason to add history; **not required** for Phase 3.

---

## Technical scope

1. **`src/lib/api.ts` — `executeModelCouncil`**
   - Extend the function to accept **prior thread context**, e.g. `priorMessages: Message[]` (slice `thread.messages` to exclude the latest user message — **same rule as Phase 2**), or pass `thread` + let the function slice.
   - For **each** `selectedModel`, build **`messages`** for `callLlm({ model, messages, jsonMode: false })` — **not** the legacy single-string `callLlm(basePrompt, model)` for the council answer step.
   - Reuse **`buildPriorLlmMessages`** from `threadContext.ts` for the prior segment; build **system** and **final user** strings to mirror the structure used in `App.tsx` for the standard path (extract shared string builders if duplication is risky — small refactor OK).

2. **`src/App.tsx`**
   - Where you call `executeModelCouncil(...)`, pass **`priorMessages`** derived from the active **`thread`** (before appending the assistant council message), consistent with how the standard path obtains priors.

3. **Types**
   - Export / import types from `llm.ts` as needed (`LlmChatMessage`, `CallLlmChatOptions`). No `any`.

4. **Tests / verification**
   - **`npm install && npm run verify`** must pass.

---

## Edge cases

- **Model council message** types in history: `threadContext` already maps model-council rows; ensure council **re-run** does not corrupt prior message extraction (follow existing `buildPriorLlmMessages` rules).
- **Token limits:** reuse **Phase 2** caps; if council prompts are heavier, optional small note in summary — avoid silent duplication of constants in three places (prefer one import).

---

## How to test (manual)

- `npm run dev`
- Create a thread with **2+ prior Q&A turns**, then enable **Model Council** and ask something that **depends on earlier turns** (e.g. “Summarize what we discussed above”).
- Confirm **no regression** when **only one** user message exists (council still works).

---

## Deliverable

- Short summary: signature changes, how priors are passed, confirmation convergence step unchanged (or why changed).
- List files touched.

---

*References: `docs/PHASE-02-COMPLETE.md` (follow-up: Model Council + history) · `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (multi-turn memory, execution).*
