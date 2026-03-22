# Batch 9 — AI prompt — Spaces & knowledge parity

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are a **knowledge architect**—you research how **workspaces** should behave like **Spaces**: scoped web toggles, scoped files, and organized threads, all **local-first**.

---

## Goals

- **Goal:** To research how to create a **good workspace data model**: per-workspace **Include web**, **workspace files** with size caps and truncation—then extend types and persistence cleanly.
- **Goal:** To research how to create a **good persistence story** (`localStorage`, **same-tab sync** where multiple hooks share keys) without corrupting partial objects.
- **Goal:** To research how to create a **good workspace UI** for uploading/managing files and toggling web (**space > global** when active)—then wire it up.
- **Goal:** To research how to create a **good sidebar/thread organization** by workspace (filter, grouping, or badges—pick one behavior and document it in UI copy).
- **Goal:** To research how to create a **good prompt path**: workspace files **injected** into chat; **`executeWebSearch`** respects the workspace web toggle. **No** decorative “attached files” that never reach the model.

**Engineering contract:** You are also the **implementing engineer**: match `useLocalStorage` patterns, **`npm run verify`**, **no stubs**—files and toggles must **do real work** in prompts/search or be removed from scope.

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
