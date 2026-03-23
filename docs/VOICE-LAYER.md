# Voice layer (Phase 0)

Vendor-neutral types and a **no-op** session implementation live under `src/lib/voice/`. Nothing calls external voice APIs; there are **no** new environment variables and **no** UI wiring yet.

## Module layout

| Path | Role |
|------|------|
| `src/lib/voice/types.ts` | Session state, connection state, `VoiceTurn`, event map and payloads |
| `src/lib/voice/voiceSession.ts` | `VoiceSession` interface, `NullVoiceSession`, `VoiceSessionStub` alias |
| `src/lib/voice/index.ts` | Barrel re-exports |

Imports:

- `import { … } from '@/lib/voice'`
- Types only: `@/lib/voice/types`, `@/lib/voice/voiceSession`

## Types

### `VoiceSessionState`

High-level UX/session FSM:

`idle` → `connecting` → `listening` | `thinking` | `speaking` → `interrupted` | `error` (and back to `idle` as implementations define).

### `VoiceConnectionState`

Transport-style lifecycle (e.g. WebSocket): `disconnected` | `connecting` | `connected` | `failed`. Used with `connection_state_changed` events.

### `VoiceTurn`

Optional metadata for a voice-related turn:

- `source: 'voice'`
- `interrupted?` — user or system cut off assistant output
- `startedAt?` / `endedAt?` — epoch ms when useful

### Events (`VoiceEventMap` / `VoiceEventName`)

| Event | Payload |
|-------|---------|
| `user_speech_started` | `VoiceUserSpeechStartedPayload` (`timestamp`) |
| `user_speech_stopped` | `VoiceUserSpeechStoppedPayload` (`timestamp`) |
| `assistant_audio_started` | `VoiceAssistantAudioStartedPayload` (`timestamp`) |
| `assistant_audio_stopped` | `VoiceAssistantAudioStoppedPayload` (`timestamp`) |
| `error` | `VoiceErrorPayload` (`error`, `timestamp`) |
| `connection_state_changed` | `VoiceConnectionStateChangedPayload` (`state`, `timestamp`) |
| `state_changed` | `VoiceSessionStateChangedPayload` (`state`, `timestamp`) |

Subscribe with typed handlers: `VoiceEventHandler<E>`.

## Session API

### `VoiceSession`

- `connect()` / `disconnect()` — sync or async
- `on(event, handler)` / `off(event, handler)` — typed per event name
- Optional `sendAudioChunk?(chunk: ArrayBuffer | Uint8Array)`
- Optional `abortAssistant?()` — e.g. barge-in

### `NullVoiceSession` / `VoiceSessionStub`

Same class: implements `VoiceSession` with **no-ops** so the app builds without a real provider. `on` / `off` accept handlers but never invoke them.

## Messages (`src/lib/types.ts`)

Backward-compatible optional fields on `Message`:

- `modality?: 'text' | 'voice'`
- `voiceTurn?: VoiceTurn`

## Verification

```bash
npm run verify
```

## Next phases (not implemented here)

- **Phase 1:** Realtime provider (e.g. OpenAI Realtime) behind server-side credentials
- **Phase 2:** Thread integration + listening/speaking UI
- **Phase 3:** Polish (PTT, errors, headphones hint)
- **Phase 4 (later):** Custom STT + LLM + TTS implementing the same `VoiceSession` surface
