# Phase 5 — AI agent prompt (share & export — Pages-lite)

**Use this entire block as the initial message** when opening a new agent.

---

## Prerequisite

Phases **1–4** are in your branch. See `docs/PHASE-01-COMPLETE.md` through `docs/PHASE-04-COMPLETE.md` (Include web, thread history, Model Council + priors, answer instructions + privacy).

---

## Role

**Phase 5** delivers **share & export** behaviour aligned with `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` **Pages** (Layer 3) in a **client-only MVP** — no new servers, no hosted public URLs, no SEO pipeline.

**In scope**

1. **Export thread to Markdown** — downloadable `.md` file with title, timestamps optional, user/assistant turns, and **sources** listed when present.
2. **Export last answer only** (optional secondary action) — assistant message + its sources for the active turn.
3. **Copy to clipboard** — at least one of: copy full thread as Markdown, or copy last answer as Markdown (match export format).

**Out of scope**

- Hosted “public link”, authentication, server-side rendering, versioning history, Labs, Deep Research agent, billing.

---

## Product intent

- Researchers can **take answers out of the app** for notes, email, or archiving.
- Markdown is the **lingua franca**; keep formatting readable (headings, bullet sources).
- **Privacy:** warn if copying/exporting could include sensitive file excerpts (lightweight: one line in dialog or tooltip — no blocking unless trivial).

---

## Technical guidance

1. **New module** e.g. `src/lib/exportMarkdown.ts` — pure functions:

   - `buildThreadMarkdown(thread: Thread): string`
   - `buildAssistantMessageMarkdown(message: Message, threadTitle?: string): string` (or fold into one builder with options)

   Map `Message` content (markdown/plain), `Source` list as links or bullets, handle `modelResponses` / council messages in a readable way (section per model or summary line).

2. **UI entry points** — minimal surface area:

   - Thread header menu, **`AppSidebar`**, or **`Message`** actions: **Export thread**, **Copy thread as Markdown**.
   - Optional: **Export last answer** on the latest assistant message.

   Use existing **DropdownMenu** / **Button** patterns from the app.

3. **Download** — `Blob` + `URL.createObjectURL` + temporary `<a download>`; revoke object URL after click.

4. **Clipboard** — `navigator.clipboard.writeText` with **try/catch** + **toast** success/failure.

5. **Filenames** — sanitize thread title for `download="ai-search-<slug>.md"`; fallback `thread-<id>.md`.

6. **Types** — no `any`; reuse `Thread`, `Message`, `Source` from `src/lib/types.ts`.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** export a thread with sources and with Model Council message; open `.md` in an editor; test clipboard in Chrome/Edge.

---

## Deliverable

- Short summary: where the actions live in the UI, function names, any size limits (if you truncate huge messages for export).

---

*Telescope reference: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Pages features (convert / auto-format / share); this phase is **offline export only**.*
