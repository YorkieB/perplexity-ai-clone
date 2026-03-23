# Voice layer

This document describes the **vendor-neutral** voice surface (`VoiceSession`), the **OpenAI Realtime** WebRTC client, and how voice is **integrated into the same threads** as text (`useLocalStorage('threads')`).

---

## Phase 0 — Types and stub

Vendor-neutral types and a **no-op** session live under `src/lib/voice/`.

### Module layout

| Path | Role |
|------|------|
| `src/lib/voice/types.ts` | `VoiceSessionState`, `VoiceConnectionState`, `VoiceTurn`, `VoiceEventMap` payloads |
| `src/lib/voice/voiceSession.ts` | `VoiceSession` interface, `NullVoiceSession`, `VoiceSessionStub` alias |
| `src/lib/voice/index.ts` | Barrel re-exports |

Imports:

- `import { … } from '@/lib/voice'`
- Types only: `@/lib/voice/types`, `@/lib/voice/voiceSession`

### `VoiceSessionState`

`idle` | `connecting` | `listening` | `thinking` | `speaking` | `interrupted` | `error`

### `VoiceConnectionState`

`disconnected` | `connecting` | `connected` | `failed` — used with `connection_state_changed`.

### Events (`VoiceEventMap`)

| Event | Payload |
|-------|---------|
| `user_speech_started` / `user_speech_stopped` | `timestamp` |
| `assistant_audio_started` / `assistant_audio_stopped` | `timestamp` |
| `error` | `error`, `timestamp` |
| `connection_state_changed` | `state`, `timestamp` |
| `state_changed` | `state` (`VoiceSessionState`), `timestamp` |

### `VoiceSession` API

- `connect()` / `disconnect()`
- `on` / `off` with typed handlers
- Optional `sendAudioChunk` / `abortAssistant`

### `NullVoiceSession` / `VoiceSessionStub`

No network, no mic; safe default for builds without a provider.

---

## Phase 1 — OpenAI Realtime (WebRTC)

### Dev / preview proxy (`vite-plugins/openai-proxy.ts`)

| Route | Behavior |
|-------|------------|
| `POST /api/llm` | Proxies to `{base}/chat/completions` with server `OPENAI_API_KEY`. |
| `POST /api/realtime/session` | Proxies to OpenAI `POST {base}/realtime/client_secrets` with the **long-lived** key. Returns upstream JSON (including ephemeral `value`). |

**Default session** (merged with optional client body): model **`gpt-realtime`**, audio output voice **`marin`**, **input transcription** `gpt-4o-mini-transcribe` (so user speech can appear as text in the app). PCM input format is set in defaults.

### Client: `OpenAIRealtimeVoiceSession` (`src/lib/voice/openaiRealtimeVoiceSession.ts`)

1. **`connect()`** — `POST` `/api/realtime/session` → ephemeral `value`.
2. WebRTC: `getUserMedia`, `RTCPeerConnection`, `POST` **`/v1/realtime/calls`** with SDP + `Authorization: Bearer <ephemeral>`, **`oai-events`** data channel.

**`sendAudioChunk`:** no-op; mic audio goes over WebRTC.

**Remote audio:** hidden `<audio autoplay>` for the remote stream.

**`abortAssistant()`** — `response.cancel` on the data channel (with `response_id` when known).

**Transcript hooks** (for thread text):

- `onUserTranscriptComplete?(text)` — from `conversation.item.input_audio_transcription.completed` (and fallback type match).
- `onAssistantTranscriptComplete?(text, { interrupted })` — from `response.output_audio_transcript.delta` / `.done`, with finalization on `response.done` / `response.cancelled` so turns complete even if transcript events differ.

### Event mapping (GA → `VoiceEventMap`)

See `openaiRealtimeVoiceSession.ts` for the full mapping (speech buffer, response lifecycle, errors).

### Errors (`src/lib/voice/errors.ts`)

`VoiceRealtimeError` — codes include `SESSION_BOOTSTRAP_FAILED`, `WEBRTC_NEGOTIATION_FAILED`, `MISSING_EPHEMERAL_KEY`, `DATA_CHANNEL_FAILED`, `NOT_SUPPORTED`, `USER_MEDIA_DENIED`.

### Environment

Realtime shares **`OPENAI_API_KEY`** with chat — **no new secrets** for dev.

---

## Phase 2 — Threads + UI

Voice uses the **same** `threads` store and `setThreads` paths as text — **no second store**.

### `App.tsx`

- **`appendVoiceUserMessage`** / **`appendVoiceAssistantMessage`** mirror text flow (`handleQuery`-style updates).
- If there is **no** active thread, the **first user transcript** creates a thread (`generateThreadTitle` from text), sets `activeThreadId`, and attaches **`workspaceId`** when a workspace is active.
- **User messages:** `modality: 'voice'`, `source: 'voice'`, `voiceTurn: { source: 'voice' }`.
- **Assistant messages:** same, plus `voiceTurn.interrupted` when the turn ends in cancellation; **`modelUsed: 'gpt-realtime'`**.

### `Message` (`src/lib/types.ts`)

Optional fields (backward compatible):

- `modality?: 'text' | 'voice'`
- `source?: 'text' | 'voice'` — channel for the message
- `voiceTurn?: VoiceTurn`

### UI & accessibility

| Piece | Role |
|-------|------|
| `src/contexts/VoiceSessionContext.tsx` | Wraps `MainApp`; owns one **`OpenAIRealtimeVoiceSession`**; **`useVoiceSession()`** — state, **`startVoice`**, **`stopVoice`**. |
| `src/components/VoiceSessionBar.tsx` | Status: **Voice: &lt;state&gt;** with `role="status"`, `aria-live="polite"`; **End voice** with `aria-label="End voice session"`. |
| `src/components/QueryInput.tsx` | Mic toggles start/stop; `aria-label`, `aria-pressed`. |
| `src/components/Message.tsx` | **Voice** chip (mic + label, optional “interrupted”) — not color-only. |

---

## Verification

```bash
npm run verify
```

### Manual (dev)

1. `OPENAI_API_KEY` in `.env`, `npm run dev`.
2. Open or start a thread; use the **mic** — speak and confirm **user** and **assistant** lines appear with **Voice** labeling.
3. Refresh: threads in **localStorage** should still contain those messages.

Requires **localhost** or **HTTPS** for `getUserMedia` / WebRTC.

---

## Next (polish / future)

- **Phase 3-style:** push-to-talk, headphones hint, error toasts, rate limits.
- **Later:** custom STT + LLM + TTS implementing `VoiceSession`.
