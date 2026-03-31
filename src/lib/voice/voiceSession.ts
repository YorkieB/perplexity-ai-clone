import type { VoiceEventHandler, VoiceEventName, VoiceSessionState } from '@/lib/voice/types'

/**
 * Vendor-neutral voice session: connect, subscribe to typed events, optional audio/control hooks.
 * Implementations may no-op on optional methods until a provider exists.
 */
export interface VoiceSession {
  /**
   * Current high-level UX state (same value as the last `state_changed` event).
   * Callers can read this synchronously without subscribing to events.
   */
  readonly state: VoiceSessionState

  connect(): void | Promise<void>
  disconnect(): void | Promise<void>

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): void
  off<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): void

  /**
   * Send encoded audio to the provider. Implementations may ignore until capture is wired.
   */
  sendAudioChunk?(chunk: ArrayBuffer | Uint8Array): void

  /**
   * Stop assistant output (e.g. barge-in). Implementations may no-op.
   */
  abortAssistant?(): void
}

/**
 * Safe default implementation: no network, no mic; all methods are no-ops.
 * Use when the app must compile without a real voice provider (Phase 0).
 */
export class NullVoiceSession implements VoiceSession {
  get state(): VoiceSessionState {
    return 'idle'
  }

  connect(): void {}

  disconnect(): void {}

  on<E extends VoiceEventName>(_event: E, _handler: VoiceEventHandler<E>): void {}

  off<E extends VoiceEventName>(_event: E, _handler: VoiceEventHandler<E>): void {}

  sendAudioChunk(chunk: ArrayBuffer | Uint8Array): void {
    if (chunk.byteLength < 0) return
  }

  abortAssistant(): void {}
}

/**
 * @deprecated Use {@link NullVoiceSession} instead. Kept only for backward compatibility; the
 *   canonical no-op implementation is {@link NullVoiceSession}.
 */
export const VoiceSessionStub = NullVoiceSession
