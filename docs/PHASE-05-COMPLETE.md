# Phase 5 complete — Share & export (Pages-lite)

**Status:** Implemented on branch [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/include-web-toggle-6a03) (commit [`597b89a`](https://github.com/YorkieB/perplexity-ai-clone/commit/597b89a), [PR #8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)).

Documentation-only updates may live on `cursor/repository-full-functionality-3433`; **merge or cherry-pick** implementation commits if needed on that branch.

## Behaviour

### `src/lib/exportMarkdown.ts`

- Builds Markdown for a **full thread**: title, ISO export time, optional workspace name, user/assistant sections, sources as links, model-council blocks, file excerpts capped at **`EXPORT_FILE_SNIPPET_MAX_CHARS` = 4000**.
- Builds Markdown for the **last assistant message** only.
- Helpers: `sanitizeFilenameBase`, `findLastAssistantMessage`, `downloadTextFile`, `copyTextToClipboard`.

### `src/components/ThreadExportActions.tsx`

- On the **active thread header**: **Copy last answer**; **Export** menu → **Download thread (.md)**, **Copy thread (Markdown)**, **Download last answer (.md)**.
- Toasts on success/failure; last-answer actions require an assistant message.

### `src/App.tsx`

- Renders the control bar and sets **`workspaceName`** from `thread.workspaceId` + the workspaces list.

## Docs

- `docs/PHASE-05-AI-PROMPT.md` — full agent prompt (scope, files, verification).
- `docs/PHASE-05-COMPLETE.md` — this file.

## Verification

```bash
npm run verify
```

**Manual:** Open a thread → use **Export** and **Copy last answer**; confirm `.md` downloads and clipboard content look right with sources and (if used) council replies.

---

*Prerequisites: Phases 1–4 — `docs/PHASE-01-COMPLETE.md` … `docs/PHASE-04-COMPLETE.md`.*
