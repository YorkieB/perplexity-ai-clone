# Phase 6 complete — Defaults & appearance

**Status:** Complete — delivers **`docs/PHASE-06-AI-PROMPT.md`** (default chat model, theme via **next-themes**, **real** desktop notifications). Implementation is typically on the feature branch / PR that carries Phases 1–6 (e.g. [`cursor/include-web-toggle-6a03`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/include-web-toggle-6a03), [PR #8](https://github.com/YorkieB/perplexity-ai-clone/pull/8)); add the exact **commit SHA** here after merge if needed.

**Governance:** No stub UI — anything exposed in Settings works end-to-end (see Phase 6 prompt).

## Shipped (spec checklist)

### Part A — Default chat model

- **`defaultChatModel`** (or equivalent) on **`UserSettings`** + **`DEFAULT_USER_SETTINGS`**
- **`QueryInput`** (or owner of `selectedModel`) initializes from persisted default and stays in sync with `user-settings`

### Part B — Theme

- **`ThemeProvider`** (`next-themes`) wrapping the app, aligned with existing dark-mode strategy
- **`themePreference`**: `'system' | 'light' | 'dark'` persisted on **`UserSettings`**
- **General** settings UI for theme + **Sonner** / UI still correct under provider

### Part C — Desktop notifications

- **`notificationsEnabled`** on **`UserSettings`** (default off)
- Module such as **`src/lib/desktopNotifications.ts`**: `isSupported`, permission on enable, **`notifyIfAllowed`**, denied → persist off + toast
- **Settings:** real Switch + permission flow
- **`App.tsx`:** after assistant completes, **`notifyIfAllowed`** when tab **hidden** and permission **granted** (no spam when tab visible)

## Verification

```bash
npm install && npm run verify
```

**Manual:** theme + default model persist and behave as expected; notifications — grant permission, background tab, complete a reply → OS notification; deny → toggle off, no silent failure.

---

*Prerequisites: Phases 1–5 — `docs/PHASE-01-COMPLETE.md` … `docs/PHASE-05-COMPLETE.md`.*
