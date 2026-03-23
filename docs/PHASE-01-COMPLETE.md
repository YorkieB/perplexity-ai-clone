# Phase 1 complete — Include web toggle

**Status:** Implemented on branch [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/pull/8) (PR [#8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)).

## What changed

### `UserSettings` + persistence (`src/lib/types.ts`)

- `includeWebSearch?: boolean` — treat missing as **on** (`!== false`).
- **`DEFAULT_USER_SETTINGS`** exported so every `user-settings` consumer shares the same defaults.

### `handleQuery` (`src/App.tsx`)

- **`executeWebSearch` runs only when `includeWebSearch` is true.**
- If web is off: **no Tavily call** and **no** “search not configured” / search-failure toasts from that path.
- Workspace prompt, file attachments, and advanced-mode text are **unchanged** for both modes.

### UI (`src/components/QueryInput.tsx`)

- **Include web** switch (glob icon) next to **Enable Advanced Analysis**.
- When web is off, a **one-line hint** explains local-only context.

### Settings (`src/components/SettingsDialog.tsx`)

- Same preference at the **top of the API Keys** tab (same `localStorage` key; stays in sync with the chat toggle).

### Consistency

- **`OAuthCallback`** and **`CloudFileBrowser`** use **`DEFAULT_USER_SETTINGS`** so partial stored objects stay aligned.

### Verification

- **`npm run verify`** — `package.json` defines `"verify": "npm run lint && npm run build"`; check passes.

## How to test

```bash
npm install
npm run verify
```

**Manual:** `npm run dev` → turn **Include web** on/off; try with and without `VITE_TAVILY_API_KEY`; with/without workspace and attachments. With web **off** and **no** Tavily key you should get an **LLM answer** without a Tavily error toast.

## Phase 2 ideas (not in Phase 1)

1. **Thread history in `callLlm`** — feed full thread history into the LLM if “thread history” should mean more than the current user message (per product intent; not done in Phase 1).
2. **Focus mode + web off** — optionally soften or disable focus mode when web is off, since it only affects the web query.

---

*Prompt used: `docs/PHASE-01-AI-PROMPT.md` · Telescope: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Layer 3–4 search).*
