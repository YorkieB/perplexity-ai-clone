# Batch 9 complete — Workspace knowledge parity (Spaces-like)

**Status:** Implemented on branch [`cursor/workspace-knowledge-parity-aec2`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/workspace-knowledge-parity-aec2).

**Feature commit:** `95a9db0` — *Add workspace-level web toggle and file context persistence*.

**Verification / tooling:** `2576ef5` — *Fix verify by aligning eslint deps and chart typings*.

Prompt reference: [batches/BATCH-09-SPACES-KNOWLEDGE.md](batches/BATCH-09-SPACES-KNOWLEDGE.md).

## What shipped

### 1) Workspace model extension

**`Workspace`** in **`src/lib/types.ts`**:

- `includeWebSearch?: boolean`
- `workspaceFiles?: WorkspaceFile[]`

**`WorkspaceFile`** — lightweight persisted fields: `id`, `name`, `type`, `size`, `content`, `uploadedAt`.

### 2) Persistence + defaults

- **`src/lib/defaults.ts`**: shared **`DEFAULT_USER_SETTINGS`** (global **`includeWebSearch: true`** documented in code).
- **`UserSettings`** includes **`includeWebSearch`** (centralized with defaults).
- Replaced duplicated inline user-settings defaults with **`DEFAULT_USER_SETTINGS`** in:
  - **`SettingsDialog.tsx`**
  - **`OAuthCallback.tsx`**
  - **`CloudFileBrowser.tsx`**
- Existing **`useLocalStorage`** same-tab sync remains for workspaces / settings consumers.

### 3) Workspace detail UI (web toggle + files)

When a workspace is selected in **`App.tsx`**:

- **Workspace Web Search** switch.
- **Use global default** reset (sets `includeWebSearch` back to **`undefined`**).
- **Workspace Files**: upload, preview, remove — reusing **`processFile`**, **`FileAttachment`**, **`FilePreviewModal`**.

### 4) Thread ↔ workspace (sidebar)

**`AppSidebar.tsx`**:

- **Filter by active workspace** when a workspace is active.
- With **no** active workspace: show **all** threads with **workspace badges**.

**`App.tsx`**: selecting a thread sets workspace context from **`thread.workspaceId`** when present.

### 5) Prompt context + web precedence

**`handleQuery`** in **`App.tsx`**:

- Workspace files injected into prompt context (**`Workspace Files:`** section).
- **Effective web** precedence: **workspace override > global default**.
- If web is disabled for the workspace context, **`executeWebSearch`** is skipped.

### 6) Local size / truncate policy (documented in code)

**`App.tsx`**:

- `MAX_WORKSPACE_FILES = 12` (per workspace).
- `MAX_WORKSPACE_FILE_CONTENT_CHARS = 12000` (truncate persisted content).
- Images stored as **lightweight placeholder text** (not full base64) — comment documents **localStorage** quota rationale.

## Verification fixes (same integration effort)

Initial **`npm install && npm run verify`** failed on pre-existing dependency / type issues; fixed and re-ran:

- **`@eslint/js` → `^9.39.1`** in **`package.json`** (with **`package-lock.json`** update).
- **Recharts** typing fixes in **`src/components/ui/chart.tsx`**.

**Final:** `npm install && npm run verify` — **pass** (lint + build).

## How to test (manual)

1. Select a workspace → toggle **Workspace Web Search**, use **Use global default** → send a query and confirm **`executeWebSearch`** matches precedence.
2. Upload workspace files → ask questions → confirm **`Workspace Files:`** appears in prompt behavior (and size caps behave).
3. Sidebar: with workspace active, threads **filter**; with none active, **badges** show thread workspace.
