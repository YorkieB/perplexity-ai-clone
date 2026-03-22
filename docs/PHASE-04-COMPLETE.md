# Phase 4 complete — Global answer instructions + privacy

**Status:** Implemented on branch [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/include-web-toggle-6a03) (commit [`723181b`](https://github.com/YorkieB/perplexity-ai-clone/commit/723181b), [PR #8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)).

## New `UserSettings` fields (`src/lib/types.ts`)

| Field | Notes |
|-------|--------|
| `answerRole?` | Optional string; empty / omitted ignored in prompt |
| `answerTone?` | Optional string |
| `answerStructure?` | Optional string |
| `answerConstraints?` | Optional string |

## System prompt merge (`buildAssistantSystemContent` in `src/lib/threadContext.ts`)

**Order:**

1. **Base:** `You are an advanced AI research assistant.`
2. **Global answer instructions:** non-empty fields as labeled lines: `Role:`, `Tone:`, `Structure:`, `Constraints:` (each truncated with shared `truncate()` to **`MAX_ANSER_INSTRUCTION_FIELD_CHARS` = 4000**).
3. **Workspace + advanced mode:** same `workspaceAndMode` string as before (`customSystemPrompt` + advanced instruction).

**Main chat** and **Model Council** both use this single helper via **`AssistantSystemContentParams`** — no separate prompt assembly in `api.ts` beyond `buildAssistantSystemContent(assistantSystem)`.

## Settings UI

- **Assistant** tab: four text areas + **Save answer instructions** (same explicit-save pattern as API keys).
- **Privacy** tab: **Clear all conversations** / **Clear all workspaces**, each with **`AlertDialog`** confirmation.

## `App` → `Settings` flow (Part B)

- **`App.tsx`** defines `handleClearAllThreads` / `handleClearAllWorkspaces`: `setThreads([])` or `setWorkspaces([])`, `setActiveThreadId(null)` / `setActiveWorkspaceId(null)`, and `toast.success(...)`.
- Passed into **`SettingsDialog`** as `onClearAllThreads` / `onClearAllWorkspaces`.

## API signature

- **`executeModelCouncil(..., assistantSystem: AssistantSystemContentParams, ...)`** — replaces the old workspace-only string; **`App`** builds one `assistantSystem` object for both council and the standard path.

## Docs

- `docs/PHASE-04-AI-PROMPT.md` — behaviour and limits.
- `docs/PHASE-02-AI-PROMPT.md` — council line updated to reference `buildAssistantSystemContent`.

## Verification

```bash
npm run verify
```

**Manual:** set answer instructions → new reply should reflect them; Privacy clears → sidebar lists empty and active selection resets; confirm dialogs block accidental clears.

---

*Prerequisites: Phases 1–3 — `docs/PHASE-01-COMPLETE.md` … `docs/PHASE-03-COMPLETE.md`.*
