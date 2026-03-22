# Batch 9 — AI prompt — Spaces & knowledge parity

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are an **autonomous implementation agent** for this repository: a senior **TypeScript / React / Vite** engineer who extends **data models, persistence, and UI** coherently. You read existing code before changing it, match `useLocalStorage` and sync patterns, install dependencies when needed, and finish with **`npm run verify`** passing. **No stubs:** workspace files and toggles must **affect prompts and/or search** as specified; do not show “files attached” that are never injected into context.

---

## Goals

1. **Spaces-like workspaces** — **Per-workspace Include web** (precedence **space > global** when active) and **workspace-scoped files** with documented size limits and truncation.
2. **Durable local knowledge** — Files and settings persist via **`localStorage`** with **same-tab sync** where multiple hooks read the same keys.
3. **Discoverable organization** — Sidebar/thread lists reflect **workspace context** (filter, grouping, or badges—behavior explicit in UI copy).
4. **Prompt integration** — Chat inside a workspace **injects workspace file content** into the prompt path; **`executeWebSearch`** respects the workspace web toggle.
5. **Honest scope** — UI states **local-only** where applicable—no fake cloud sync.

---

## Prerequisite

Phases **1–6**; Batch **7** merged recommended so search UI patterns are stable. Batch **8** optional (Deep Research can reference workspace files later).

---

## Deliverables

1. **Workspace model** — Extend `Workspace` (or linked structure) to support:
   - `includeWebSearch?: boolean` **per workspace** (default: inherit global or on — **document default** in `DEFAULT_USER_SETTINGS` / workspace creation).
   - **`attachedFiles` or `workspaceFiles`**: array of lightweight file refs `{ id, name, type, size, content }` **or** stored keys — **size cap** and **truncate** policy in code comments.

2. **Persistence** — `localStorage` via existing patterns; **same-tab sync** if multiple hooks read workspaces.

3. **UI — Workspace detail** — When a workspace is selected, user can **upload/manage files** for that space (reuse file upload helpers from chat where possible). **Web toggle** for this space visible and **overrides** global default when in workspace context (define precedence: **space > global** when active).

4. **Thread ↔ workspace** — Threads already have `workspaceId`; **sidebar** lists threads **grouped or filtered** by active workspace when viewing that workspace (behaviour clearly defined: filter vs all threads with badges).

5. **Prompt context** — When chatting **inside** a workspace, inject **workspace files** into prompt construction (same spirit as chat file attachments but scoped to space). Respect **space web toggle** for `executeWebSearch`.

---

## Out of scope

- Cloud sync, sharing links, collaboration, server file store.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** Create workspace → upload file → toggle web → ask question → confirm files + toggle affect search and prompt; sidebar organization matches spec.

---

## Governance

**No stubs.** No fake “synced” or “backed up” labels. Local-only scope must be **honest** in UI. Workspace files must be **read and used** in prompts or removed from the feature scope—not decorative.
