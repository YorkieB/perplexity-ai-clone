# Phase 4 — Answer instructions & privacy

## Part A — Global answer instructions

Stored in `UserSettings` (`answerRole`, `answerTone`, `answerStructure`, `answerConstraints`) under the `user-settings` localStorage key.

Merged only in **`buildAssistantSystemContent`** (`src/lib/threadContext.ts`):

1. Base line: `You are an advanced AI research assistant.`
2. **Global** — non-empty fields as labeled lines (`Role:`, `Tone:`, `Structure:`, `Constraints:`), each truncated to `MAX_ANSWER_INSTRUCTION_FIELD_CHARS` (4000).
3. **Workspace + mode** — `customSystemPrompt` and advanced-mode instruction as today (`workspaceAndMode`).

Used for the main chat system message and Model Council (`executeModelCouncil`).

Settings UI: **Assistant** tab, explicit **Save answer instructions** (same pattern as API key saves).

## Part B — Privacy

**Privacy** tab: **Clear all conversations** and **Clear all workspaces**, each behind an **AlertDialog**.

`App.tsx` passes `onClearAllThreads` / `onClearAllWorkspaces`: `setThreads([])` / `setWorkspaces([])` and resets `activeThreadId` / `activeWorkspaceId` to `null`, with a success toast.
