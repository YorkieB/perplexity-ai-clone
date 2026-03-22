# Phase 6 — General settings (agent prompt)

## Goal

Ship **real**, end-to-end behaviour for **default chat model**, **theme (light / dark / system)**, and **browser desktop notifications** — client-only, no push server. No placeholders: every control must persist and affect runtime behaviour.

## Part A — Default chat model

- `UserSettings.defaultChatModel: string` (e.g. `gpt-4o-mini`, `gpt-4o`) in `DEFAULT_USER_SETTINGS`.
- `src/lib/chatModels.ts`: `CHAT_MODEL_IDS`, `normalizeChatModel`, `DEFAULT_CHAT_MODEL`.
- **QueryInput**: `useLocalStorage('user-settings')`; initialize `selectedModel` from `defaultChatModel`; `useEffect` when `settings.defaultChatModel` changes (Settings updates). Pass `selectedModel` as the last `onSubmit` argument.
- **App `handleQuery`**: `effectiveChatModel = normalizeChatModel(chatModel ?? userSettings?.defaultChatModel)` for the main `callLlm` path; set `modelUsed` accordingly. Follow-up / empty-state calls omit `chatModel` → use saved default.
- Changing default in Settings does **not** alter past messages (document in Settings copy).

## Part B — Theme

- `UserSettings.themePreference: 'system' | 'light' | 'dark'`.
- **`main.tsx`**: wrap app with `ThemeProvider` from `next-themes` — `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
- **`index.html`**: `suppressHydrationWarning` on `<html>` for theme class hydration.
- **`ThemePreferenceSync`** (`src/components/ThemePreferenceSync.tsx`): reads `user-settings` and calls `setTheme` when `themePreference` changes.
- **Settings → General**: theme `Select` updates both `UserSettings` and `setTheme`.
- Tailwind dark mode uses **class** `.dark` on `html` (see `src/main.css`).

## Part C — Desktop notifications

- `UserSettings.notificationsEnabled: boolean` (default `false`).
- **`src/lib/desktopNotifications.ts`**: `isNotificationApiSupported`, `isSecureContextForNotifications`, `canUseDesktopNotifications`, `requestEnableNotifications`, `notificationBodyFromResponse`, `notifyIfAllowed`.
- **Settings**: Switch disabled with explanation when API unsupported; on enable, `Notification.requestPermission()`; if denied, persist `false` and toast.
- **App `handleQuery`**: after a successful assistant reply, if `document.visibilityState === 'hidden'` and notifications are enabled and permission is `granted`, call `notifyIfAllowed` with thread title and snippet body. **Do not** notify when tab is visible.

## Toasts

- Use **`Toaster` from `@/components/ui/sonner`** (wraps Sonner with `useTheme`) so toasts track light/dark.

## Out of scope

Server push (FCM/APNs), email, accounts, billing, new LLM providers.

## Verify

```bash
npm run verify
```

Manual: theme + default model; notifications with tab backgrounded.

## Copy-paste

> Implement Phase 6 per `docs/PHASE-06-AI-PROMPT.md` and run `npm run verify`.
