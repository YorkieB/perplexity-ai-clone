# Phase 6 — AI agent prompt (defaults & appearance)

**Use this entire block as the initial message** when opening a new agent.

---

## Prerequisite

Phases **1–5** are in your branch. See `docs/PHASE-01-COMPLETE.md` through `docs/PHASE-05-COMPLETE.md`.

---

## Governance

- **No stubs:** do not ship toggles, settings, or copy that imply behaviour that is not implemented. Placeholder UI violates repository governance and will fail integrity / review expectations.
- **Ship only what works:** Part A and Part B below are in scope. **Notifications are out of scope for Phase 6** unless you implement the **full** browser notification flow in the same change (permission, denied state, success path, errors) — if that is too large, **omit notifications entirely** and document them for a later phase.

---

## Role

**Phase 6** implements **General**-style settings from `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Layer 3 **Settings**: default model/mode; theme) — **client-only**, no backend. This phase covers **default chat model** and **theme** only.

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

---

## Out of scope (Phase 6)

- **Notifications** — unless fully implemented (see Governance). Otherwise defer to a future phase with a dedicated spec.
- Push notification backend, email, accounts, billing, Deep Research agent, new LLM providers.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** change theme → UI flips light/dark/system; change default model → new tab / refresh → query bar shows new default; settings persist across reload.

---

## Deliverable

- List new `UserSettings` fields, where `ThemeProvider` sits, and how `QueryInput` reads `defaultChatModel`.

---

*Telescope reference: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Settings → General. Phase 6 implements **default model** and **theme**; **notifications** are deferred unless implemented end-to-end in the same PR.*
