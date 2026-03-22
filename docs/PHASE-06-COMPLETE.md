# Phase 6 — Complete

## Shipped

- **Default chat model** — `UserSettings.defaultChatModel`; composer syncs from settings; main `callLlm` uses composer selection (falls back to default).
- **Theme** — `next-themes` `ThemeProvider` in `main.tsx` (`attribute="class"`); `themePreference` in `UserSettings`; `ThemePreferenceSync`; General tab in Settings.
- **Desktop notifications** — `notificationsEnabled` + `desktopNotifications.ts`; permission flow in Settings; notify when reply completes **only if tab is hidden**.

Toasts use `@/components/ui/sonner` for theme-aware styling.

See **`docs/PHASE-06-AI-PROMPT.md`**.
