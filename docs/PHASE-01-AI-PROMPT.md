# Phase 1 — AI agent prompt (copy into a new agent)

**Use this entire block as the initial message** when opening a new agent. It assumes the repo is `ai-search-engine` (React + Vite + TypeScript), branch `cursor/repository-full-functionality-3433` or your working branch.

---

## Role

You are an implementation agent. Your job is **Phase 1: search context controls** — ship a working **“Include web”** toggle and wire it so answers respect **web vs workspace + files** behaviour, matching the intent in `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Layer 4 search micro-behaviours).

## Product intent (must match)

- **Include web ON** (default): behaviour should stay aligned with today — web search (Tavily when configured) **plus** workspace instructions and any attached files in the prompt.
- **Include web OFF**: **do not** call Tavily / web search. The model still answers using **workspace custom system prompt** (when a workspace is active), **thread history** (already in messages), and **attached file content** in the prompt.
- **No workspace, web OFF, no files**: user should still get an LLM answer from general knowledge (or a clear inline message that web is off and no local context was provided — choose the least surprising UX; prefer still calling the LLM with the user query only).

## Technical scope

1. **State**
   - Add persisted user preference for “include web” (default `true`). Prefer extending `UserSettings` in `src/lib/types.ts` and the existing `user-settings` localStorage path via `useLocalStorage` in `SettingsDialog` / or a dedicated key — **be consistent** with how settings are stored today.

2. **UI**
   - Expose a clear **Include web** control on the main chat path (e.g. near existing advanced / focus controls in `QueryInput` or the thread header in `App.tsx`). Label should be understandable; optional short hint when web is off.

3. **Logic**
   - In `src/App.tsx` inside the query handler: when “include web” is **false**, **skip** `executeWebSearch` entirely (no Tavily). When **true**, keep current search flow.
   - Ensure **workspace `customSystemPrompt`**, **file attachments**, and **advanced mode** instructions still apply in both modes.
   - If search is skipped, **do not** show a misleading “search failed” toast because Tavily is missing; only toast real errors.

4. **Types / helpers**
   - Thread any new props cleanly; avoid `any`. Keep exports typed.

## Files you will likely touch

- `src/lib/types.ts` — optional `UserSettings` field (e.g. `includeWebSearch?: boolean`).
- `src/components/QueryInput.tsx` — toggle UI + pass flag into `onSubmit` (extend callback signature if needed).
- `src/App.tsx` — `handleQuery`: branch on include-web before `executeWebSearch`.
- `src/components/SettingsDialog.tsx` — optional global default for “include web” if you store it in `UserSettings`.
- Minor updates in any parent that wires `QueryInput`.

Do **not** implement Deep Research, Pages, Labs, Comet, billing, or multi-provider search in this phase.

## Verification (mandatory before you finish)

From repo root:

```bash
npm install
npm run verify
```

Fix all lint and build errors. **Do not** mark work complete if `npm run verify` fails.

Optional manual check: run `npm run dev`, toggle Include web, send a query with web **on** vs **off**, with and without Tavily key, and with a workspace selected.

## Deliverable

- A small, reviewable PR-style change set: typed UI + logic + persistence.
- Brief summary in your final message: what changed, how to test, any follow-ups for Phase 2.

## Out of scope (Phase 2+)

- “Best model” auto-selector, voice, dedicated trace UI, Pages export, Deep Research agent loop, new backends beyond Tavily.

---

*Phase reference: telescope doc `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Layer 3 search features (“Include Web” toggle) and Layer 4 search micro-behaviours.*
