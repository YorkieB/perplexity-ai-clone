# Batch 10 complete — Voice & platform polish

**Status:** Implemented on branch [`cursor/platform-voice-data-b2e3`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/platform-voice-data-b2e3).

**Feature commit:** `b822442` — *Add voice input, local export, auto model, and usage estimates*.

**Supporting commits (verify / lint / typings):** `e9acbae` (align `@eslint/js` with ESLint 9), `737cf3e` (lint after Batch 10), `b00ee21` / `1d0b441` / `11b5a98` (Recharts v3 chart tooltip/legend typing and optional payload handling).

Prompt reference: [batches/BATCH-10-VOICE-AND-PLATFORM.md](batches/BATCH-10-VOICE-AND-PLATFORM.md).

## What shipped

### Voice input (Web Speech API)

- **`SpeechRecognition` / `webkitSpeechRecognition`** feature detection in **`QueryInput`**.
- **Mic** control: start/stop dictation when supported; **unsupported** state with clear message when not available.
- **Transcript:** **append** to existing draft (documented in code comments).
- **Secure context:** HTTPS / localhost requirement noted in code.

### Export all local app data

- **Privacy & Data** section in **`SettingsDialog`**.
- Export **JSON** for explicit app-owned keys: **`threads`**, **`workspaces`**, **`user-settings`**.
- **Warning / confirmation** before export; export contains only what is already stored locally.

### Best-model heuristic (optional + honest)

- **Auto model** toggle in **`QueryInput`**.
- Local heuristic uses **attachment presence**, **prompt length**, and **basic complexity** signals; **manual override** supported.
- Routed model propagates to **`App.tsx`** and **`callLlm(...)`**.
- UI copy states the heuristic is **local** and **not** guaranteed optimal.

### Usage / quota display (local estimates only)

- Usage indicator in the app **header** (or headers): approximate **chars/tokens** from recent messages.
- Disclaimer: **local estimate only** (no server quota).

## Verification & repo fixes

- **`package.json`:** `"verify": "npm run lint && npm run build"` (if not already present on the branch).
- **`@eslint/js` → `^9.39.1`** aligned with **ESLint 9**.
- **`src/components/ui/chart.tsx`:** Recharts typing (v3), nullable/optional tooltip payload handling.

```bash
npm install && npm run verify
```

**Result:** pass (lint + build).

## How to test (manual)

1. **Voice:** In a supported browser/context, use the mic → transcript appends; in unsupported environments, see fallback (no dead control).
2. **Export:** Settings → Privacy & Data → export → JSON contains listed keys; confirmation appears first.
3. **Auto model:** Toggle on/off, override model → **`callLlm`** uses the effective model; copy stays honest.
4. **Usage:** Header shows estimates with **local estimate only** disclaimer.
