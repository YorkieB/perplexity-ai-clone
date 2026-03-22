# Phase 5 — Share & export (Pages-lite, client-only)

## Goal

Implement **client-only** export aligned with Telescope “Pages” ideas: users can take conversation content out of the app as **Markdown** — **no** public URLs, server-side hosting, auth, SEO, or versioning.

## Product scope (in)

- **Export full thread** to Markdown: download `.md` file and **copy entire thread** to clipboard as Markdown.
- **Export last assistant answer**: download `.md` and **copy last answer** to clipboard (last `role: assistant` in the thread).
- Markdown should include: thread title, export timestamp, optional workspace name (when thread is tied to a workspace), user/assistant turns, sources as links where available, model-council responses as per-model sections, attached file excerpts (truncated).

## Out of scope

- Public share links, hosted Pages, server APIs, auth-gated exports, revision history, Deep Research / Labs / billing.

## Technical guidance

1. **`src/lib/exportMarkdown.ts`** — Pure helpers: `threadToMarkdown`, `assistantMessageToMarkdown`, `findLastAssistantMessage`, `sanitizeFilenameBase`, `downloadTextFile`, `copyTextToClipboard`. Cap embedded file text with `EXPORT_FILE_SNIPPET_MAX_CHARS`.
2. **`src/components/ThreadExportActions.tsx`** — UI on the active thread header: primary actions for copy last answer + dropdown for thread download/copy and last-answer download. Use toasts for success/failure.
3. **`App.tsx`** — Render export controls when `activeThread` is set; pass `workspaceName` resolved from `thread.workspaceId` + `workspaces` list.
4. **Docs** — This file is the agent prompt; **`docs/PHASE-05-COMPLETE.md`** summarizes shipped behaviour after merge.
5. **README** — Link `docs/PHASE-05-AI-PROMPT.md` under Documentation.

## Verification

```bash
npm install && npm run verify
```

Manual: open a thread with multiple turns → Export → download and copy; verify last answer actions; empty thread / no assistant yet → controls disabled or toasts as implemented.

## Copy-paste for a new agent

> Implement **Phase 5** per `docs/PHASE-05-AI-PROMPT.md`: Markdown export (thread + last answer), download `.md`, clipboard copy, client-only. Update README documentation link. Run `npm run verify`.
