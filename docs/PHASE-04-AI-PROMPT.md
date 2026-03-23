# Phase 4 — AI agent prompt (global answer instructions + privacy)

**Status:** Implemented — see **`docs/PHASE-04-COMPLETE.md`** (PR [#8](https://github.com/YorkieB/perplexity-ai-clone/pull/8), commit `723181b` on `cursor/include-web-toggle-6a03`).

**Use this entire block as the initial message** when opening a new agent (historical / replay).

---

## Prerequisite

Phases **1–3** are in your branch (Include web, thread history + `threadContext`, Model Council + priors). See `docs/PHASE-01-COMPLETE.md` … `docs/PHASE-03-COMPLETE.md`.

---

## Role

**Phase 4** ships two slices that match `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` **Settings** (Layer 3–4):

- **Part A — Global answer instructions** — natural-language fields (role, tone, structure, optional constraints / “always-never” style) stored in **`UserSettings`**, merged into the **system** message everywhere assistant behaviour is defined (main chat + Model Council — reuse `buildAssistantSystemContentFromCombined` or extend it; **do not** fork divergent prompt assembly).
- **Part B — Privacy** — user can **clear all threads** and **clear all workspaces** from Settings, with **confirmation dialogs** and safe UX (no accidental data loss).

**Out of scope:** Deep Research agent, Pages export, billing, connectors beyond existing OAuth, theme engine, push notifications.

---

## Part A — Answer instructions

### Product intent

- Users set **global** defaults that shape assistant behaviour **before** workspace-specific prompts (telescope: behavioural contract; workspace `customSystemPrompt` remains **additive** — document order in code: global instructions → workspace instructions → task).
- Fields are **plain text** (no JSON schema UI). Suggested shape (adjust names if cleaner):

  - `answerRole?: string`
  - `answerTone?: string`
  - `answerStructure?: string`
  - `answerConstraints?: string` (free text for “always / never”, formatting, length, etc.)

- Empty fields contribute nothing. Truncate very long values **before** sending to the model if needed (constant at top of helper, e.g. 2–4k chars each).

### Technical

- Extend **`UserSettings`** + **`DEFAULT_USER_SETTINGS`** in `src/lib/types.ts`.
- Persist via existing **`user-settings`** / `useLocalStorage` (same pattern as Phase 1).
- **Settings UI:** new subsection (e.g. “Answer instructions” on an existing tab or a new tab) with labeled text areas + save behaviour consistent with the rest of Settings (debounced save or explicit Save — match existing Settings patterns).
- **Prompt merge:** extend **`buildAssistantSystemContentFromCombined`** (or single helper used by **both** main path and council) so global fields are included when non-empty.

---

## Part B — Privacy — clear data

### Product intent

- **Clear all conversations** — removes all threads; active thread selection should reset sanely (e.g. `null`).
- **Clear all workspaces** — removes workspaces; active workspace id reset.
- **Confirm** each destructive action (`AlertDialog`).

### Technical

- **Do not** only `localStorage.removeItem` without updating React state — hooks must reflect empty state.
- Preferred: **`App.tsx`** passes callbacks into **`SettingsDialog`** (or a child) such as `onClearAllThreads` / `onClearAllWorkspaces` that call the **third** return value from `useLocalStorage` (`deleteStored`) for `threads` and `workspaces`, **or** functional `setThreads([])` / `setWorkspaces([])` per hook API — whichever matches your hook.
- If the hook exposes **delete**, use it so `localStorage` and in-memory state stay aligned.
- Reset **`activeThreadId` / `activeWorkspaceId`** when clearing the respective data.
- Optional: **Export** nothing; optional “Clear answer instructions” is **out of scope** unless trivial.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** set answer instructions → new message reflects tone/role; clear threads → sidebar empty; clear workspaces → workspaces empty; confirm dialogs work.

---

## Deliverable

- Summary of new `UserSettings` fields, merge order in system prompt, and how clear-data flows through `App` → `SettingsDialog`.

---

*Telescope reference: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Settings (answer instructions; privacy).*
