# Voice layer

This document describes the **vendor-neutral** voice surface (`VoiceSession`) and the **OpenAI Realtime** implementation used in dev/preview. Full **UI wiring** (thread integration, controls) is tracked as a later phase.

---

## Phase 0 — Types and stub

Vendor-neutral types and a **no-op** session live under `src/lib/voice/`.

### Module layout

| Path | Role |
|------|------|
| `src/lib/voice/types.ts` | `VoiceSessionState`, `VoiceConnectionState`, `VoiceTurn`, `VoiceEventMap` payloads |
| `src/lib/voice/voiceSession.ts` | `VoiceSession` interface, `NullVoiceSession` no-op implementation |
| `src/lib/voice/index.ts` | Barrel re-exports (see below for Phase 1 additions) |

Imports:

- `import { … } from '@/lib/voice'`
- Types only: `@/lib/voice/types`, `@/lib/voice/voiceSession`

### `VoiceSessionState`

`idle` | `connecting` | `listening` | `thinking` | `speaking` | `interrupted` | `disconnected` | `error` — see FSM comment on `VoiceSessionState` in `types.ts`.

### `VoiceConnectionState`

`disconnected` | `connecting` | `connected` | `failed` — used with `connection_state_changed`.

### Events (`VoiceEventMap`)

| Event | Payload |
|-------|---------|
| `user_speech_started` / `user_speech_stopped` | `timestamp` |
| `assistant_audio_started` / `assistant_audio_stopped` | `timestamp` |
| `transcription` | `text`, `isFinal`, `timestamp` — user speech as text (e.g. input audio transcription) |
| `response_text` | `text`, `isFinal`, `timestamp` — assistant text (streaming deltas and completion) |
| `error` | `error`, `timestamp` |
| `connection_state_changed` | `state`, `timestamp` |
| `state_changed` | `state` (`VoiceSessionState`), `timestamp` |

### `VoiceSession` API

- `state` — read-only `VoiceSessionState` (same as the last `state_changed` event; synchronous, no subscription required)
- `connect()` / `disconnect()`
- `on` / `off` with typed handlers
- Optional `sendAudioChunk` / `abortAssistant`

### `NullVoiceSession`

No network, no mic; safe default for builds without a provider.

The name `VoiceSessionStub` is a deprecated alias for `NullVoiceSession` (same value); new code should import `NullVoiceSession` only.

### Messages (`src/lib/types.ts`)

Optional on `Message`:

- `modality?: 'text' | 'voice'`
- `voiceTurn?: VoiceTurn` (`source: 'voice'`, optional `interrupted`, `startedAt` / `endedAt`)

---

## Phase 1 — OpenAI Realtime (WebRTC)

### Dev / preview proxy (`vite-plugins/openai-proxy.ts`)

| Route | Behavior |
|-------|------------|
| `POST /api/llm` | Unchanged: proxies to `{base}/chat/completions` with server `OPENAI_API_KEY`. |
| `POST /api/realtime/session` | Proxies to OpenAI `POST {base}/realtime/client_secrets` with the **long-lived** key. Returns upstream JSON (including ephemeral `value`). |

`OPENAI_BASE_URL` / `OPENAI_API_KEY` follow the same rules as chat (see `.env.example`).

**Default session body** (merged with optional JSON from the client request): realtime session, model **`gpt-realtime`**, audio output voice **`marin`**.

The file header documents dev + `vite preview`, ephemeral token + WebRTC, and that **production** still needs an equivalent server route if you deploy static assets only.

### Client: `OpenAIRealtimeVoiceSession` (`src/lib/voice/openaiRealtimeVoiceSession.ts`)

Implements `VoiceSession`:

1. **`connect()`** — `POST` same-origin `sessionUrl` (default `/api/realtime/session`) → read ephemeral `value`.
2. Browser flow per OpenAI Realtime (GA): `getUserMedia`, `RTCPeerConnection`, `POST` **`https://api.openai.com/v1/realtime/calls`** with SDP and `Authorization: Bearer <ephemeral>`, **`oai-events`** data channel for GA events.

**`sendAudioChunk`:** documented no-op; microphone audio uses WebRTC, not manual chunks.

**Remote audio:** played via a hidden `<audio autoplay>` bound to the remote stream.

**`abortAssistant()`** — sends `response.cancel` on the data channel (includes `response_id` when known).

### Event mapping (GA → `VoiceEventMap`)

Server event names are normalized in `realtimeServerEvents.ts` (e.g. `response.output_audio.delta` → `response.audio.delta`). Examples include:

- `input_audio_buffer.speech_started` / `speech_stopped` → `user_speech_*`
- `conversation.item.input_audio_transcription.completed` → `transcription`
- `response.output_text.delta` / `.done` and `response.output_audio_transcript.delta` → `response_text`
- `response.created`, `response.audio.delta`, `response.done`, `response.cancelled` → assistant lifecycle / `state_changed` (`interrupted` if audio was active; otherwise `listening` on cancel)
- Errors → `error` + `VoiceSessionState` `error` when appropriate

See `openaiRealtimeVoiceSession.ts` for the full switch and edge cases (e.g. inferring assistant audio when deltas are omitted).

### Errors (`src/lib/voice/errors.ts`)

`VoiceRealtimeError` with codes such as:

`SESSION_BOOTSTRAP_FAILED` | `WEBRTC_NEGOTIATION_FAILED` | `MISSING_EPHEMERAL_KEY` | `DATA_CHANNEL_FAILED` | `NOT_SUPPORTED` | `USER_MEDIA_DENIED` | `INTERNAL_ERROR`

### Exports (`src/lib/voice/index.ts`)

Also re-exports: `OpenAIRealtimeVoiceSession`, `OpenAIRealtimeVoiceSessionOptions`, `RealtimeClientSecretPayload`, `VoiceRealtimeError`, `VoiceRealtimeErrorCode`.

### Environment

Realtime shares **`OPENAI_API_KEY`** with chat — **no new secrets**. Browser only receives the **short-lived** client secret from `client_secrets`, never the long-lived key.

---

## Verification

```bash
npm run verify
```

### Manual (dev)

1. Set `OPENAI_API_KEY` in `.env`.
2. `npm run dev`
3. Instantiate `OpenAIRealtimeVoiceSession`, call `connect()`, speak, listen; use **`abortAssistant()`** or interrupt; observe `response.cancelled` / `state_changed` (`interrupted`) and playback stopping per API behavior.

Requires **HTTPS or localhost** for `getUserMedia` / WebRTC as usual.

---

## Next (not in Phase 1)

- **Thread integration + voice UI** — wire sessions to `App` / `QueryInput`, persist voice turns.
- **Polish** — push-to-talk, headphones hint, error toasts, rate limits.
- **Later:** custom STT + LLM + TTS implementing `VoiceSession`.
