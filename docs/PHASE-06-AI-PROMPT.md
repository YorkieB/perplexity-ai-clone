# Phase 6 — AI agent prompt (defaults & appearance)

**Use this entire block as the initial message** when opening a new agent.

---

## Prerequisite

Phases **1–5** are in your branch. See `docs/PHASE-01-COMPLETE.md` through `docs/PHASE-05-COMPLETE.md`.

---

## Governance

- **Nothing fake:** any setting or control you add must **actually work** end-to-end, or it must **not** be shown. Stubs and “not wired yet” copy violate governance and fail integrity expectations.
- **If it’s in this phase, it ships real:** default model, theme, and **desktop notifications** are all **in scope** as **fully wired** behaviour — not placeholders.

---

## Role

**Phase 6** implements **General**-style settings from `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` (Layer 3 **Settings**: default model/mode; theme; notifications) — **client-only** (browser APIs), no push server.

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

### Part C — Desktop notifications (browser — fully wired)

**Requirement:** the user can turn notifications **on** and receive **real** system notifications when appropriate — not a label that does nothing.

1. **`UserSettings`:** `notificationsEnabled: boolean` (default `false`) in **`DEFAULT_USER_SETTINGS`**.
2. **Small module** (e.g. `src/lib/desktopNotifications.ts`):
   - Detect support: `'Notification' in window` — if unsupported, expose **`isSupported(): boolean`** so Settings can **disable** the toggle and show a short, honest explanation (no fake ON state).
   - **`requestEnable()`:** call **`Notification.requestPermission()`** when the user turns the switch on; map **`granted` / `denied` / `default`** to persisted state and **toast** on denial; if denied, **`notificationsEnabled`** must become **`false`** in storage.
   - **`notifyIfAllowed(title: string, body: string, opts?)`:** only call **`new Notification(...)`** when `notificationsEnabled && Notification.permission === 'granted'`; catch errors and optionally toast once.
3. **Settings UI:** a real **Switch** bound to `notificationsEnabled` + permission flow on first enable (no “coming later” copy).
4. **Wire to the app:** when an **assistant message finishes** (success path in **`App.tsx`** `handleQuery` / equivalent), if the document is **not visible** (e.g. **`document.visibilityState === 'hidden'`** or tab in background) **and** notifications are enabled **and** permission is granted, call **`notifyIfAllowed`** with a useful title (e.g. app name or thread title) and a short body (first line of reply or “Response ready”). If the tab is **visible**, do not spam notifications for every message (optional: only when hidden — document behaviour in a comment).
5. **HTTPS / localhost:** the Notification API requires secure context except localhost; if you detect failure, handle gracefully.

---

## Out of scope

- **Server-side** push (FCM, APNs), email digests, accounts, billing, Deep Research agent, new LLM providers.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** theme + default model as before. **Notifications:** enable → grant permission → switch to another tab → run a query → expect a **real** OS notification when the assistant completes; deny permission → toggle should reflect off and no silent failure.

---

## Deliverable

- List new `UserSettings` fields, `ThemeProvider` location, `defaultChatModel` wiring, and the **`desktopNotifications`** helper API + where **`notifyIfAllowed`** is called.

---

*Telescope reference: `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` — Settings → General (default model/mode; theme; notifications).*
