# Batch 9 — AI prompt — Spaces & knowledge parity

**Paste this entire file as the first message to a new coding agent.**

---

## Prerequisite

Phases **1–6**; Batch **7** merged recommended so search UI patterns are stable. Batch **8** optional (Deep Research can reference workspace files later).

---

## Goal

Advance **Knowledge constellation** (telescope): **workspaces** behave closer to **Spaces** — **per-workspace web toggle**, **files attached to a workspace** (local persistence), and **clear thread organization** by workspace in the sidebar.

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

No fake “synced” labels. Local-only is honest in UI if not already stated.
