# Phase 6 — AI agent prompt (defaults & appearance)

**Use this entire block as the initial message** when opening a new agent.

---

## Prerequisite

Phases **1–5** are in your branch. See `docs/PHASE-01-COMPLETE.md` through `docs/PHASE-05-COMPLETE.md`.

---

## Role

**Phase 6** implements **General**-style settings from `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Layer 3 **Settings**: default model/mode; theme; notifications) — **client-only**, no backend.

### Part A — Default chat model

- Persist a **`defaultChatModel`** (string) in **`UserSettings`** + **`DEFAULT_USER_SETTINGS`** (`src/lib/types.ts`).
- **`QueryInput`** (or single place that owns `selectedModel` state) should **initialize** from this default when the component mounts and when settings sync (same `user-settings` / `useLocalStorage` pattern as other prefs).
- Values must match models your **`/api/llm` proxy** accepts (e.g. `gpt-4o-mini`, `gpt-4o`). Use a **Select** with a **small fixed list** or the same list as existing model UI — **do not** promise OpenRouter-only IDs unless the app already documents them.
- Changing the default in Settings should **not** rewrite in-flight threads; it affects **new sessions / next load** behaviour. Document that in code comments if ambiguous.

### Part B — Theme (light / dark / system)

- Wrap the app with **`ThemeProvider`** from **`next-themes`** (already a dependency) in **`main.tsx`** or **`App.tsx`**, with `attribute="class"` on `<html>` and **`dark`** class aligned with your Tailwind dark mode strategy (`data-appearance` vs `class` — **match `src/index.css` / existing dark selectors**; inspect before changing globals).
- Persist **`themePreference`**: `'system' | 'light' | 'dark'` in **`UserSettings`** (or a dedicated key if you must avoid schema churn — prefer extending `UserSettings`).
- **Settings UI:** a **General** tab or section: theme radio/select + short description.
- **`Sonner`** / toasts already use `useTheme` in `src/components/ui/sonner.tsx` — ensure they still look correct after `ThemeProvider` wraps the tree.

### Part C — Notifications (stub)

- Add **`notificationsEnabled?: boolean`** to **`UserSettings`** (default `false` or `true` per product taste) and a **toggle** in General settings with copy: *“Browser notifications are not implemented yet”* or similar — **no** `Notification.requestPermission` unless you fully implement UX; this is a **placeholder** for roadmap parity.

---

## Out of scope

- Push notifications backend, email, accounts, billing, Deep Research agent, new LLM providers.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** change theme → UI flips light/dark/system; change default model → new tab / refresh → query bar shows new default; toggles persist across reload.

---

## Deliverable

- List new `UserSettings` fields, where `ThemeProvider` sits, and how `QueryInput` reads `defaultChatModel`.

---

*Telescope reference: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Settings → General (default model/mode; theme; notifications).*
