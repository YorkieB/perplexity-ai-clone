import { VoiceRealtimeError } from '@/lib/voice/errors'
import { normalizeRealtimeServerEventType } from '@/lib/voice/realtimeServerEvents'
import type {
  VoiceEventHandler,
  VoiceEventMap,
  VoiceEventName,
  VoiceSessionState,
} from '@/lib/voice/types'
import type { VoiceSession } from '@/lib/voice/voiceSession'

/** Successful `POST /v1/realtime/client_secrets` JSON (browser receives only this). */
export interface RealtimeClientSecretPayload {
  value?: string
  /** Unix timestamp in seconds (OpenAI client secret expiry). */
  expires_at?: number
}

export interface OpenAIRealtimeVoiceSessionOptions {
  /**
   * Same-origin URL that returns OpenAI `client_secrets` JSON (`value` = ephemeral key).
   * Default: `/api/realtime/session` (Vite dev/preview proxy).
   */
  sessionUrl?: string
  /**
   * Browser posts SDP here with `Authorization: Bearer <ephemeral>` per OpenAI WebRTC docs.
   * Default: `https://api.openai.com/v1/realtime/calls`
   */
  realtimeCallsUrl?: string
  /** Optional body for `POST sessionUrl` (merged server-side with defaults). */
  sessionRequestBody?: Record<string, unknown>
  rtcConfiguration?: RTCConfiguration
}

type ListenerMap = {
  [K in VoiceEventName]: Set<VoiceEventHandler<K>>
}

/**
 * OpenAI Realtime GA: ephemeral client secret from your backend, then WebRTC to
 * `POST /v1/realtime/calls` and `oai-events` data channel for lifecycle events.
 *
 * Requires a secure context and browser WebRTC (`getUserMedia`, `RTCPeerConnection`).
 */
export class OpenAIRealtimeVoiceSession implements VoiceSession {
  private readonly sessionUrl: string
  private readonly realtimeCallsUrl: string
  private readonly sessionRequestBody: Record<string, unknown> | undefined
  private readonly rtcConfiguration: RTCConfiguration

  /** Identity token for the current connect attempt; replaced instead of incrementing (avoids Number overflow). */
  private connectToken: object = {}
  /** Ensures two concurrent `connect()` calls cannot interleave and corrupt `this.pc` / cleanup. */
  private connectInFlight: Promise<void> | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private localStream: MediaStream | null = null
  private remoteAudio: HTMLAudioElement | null = null

  /** Data-channel `open` wait: cleared in {@link cleanupTracksAndPc} so disconnect never leaves a stale timer. */
  private dataChannelOpenTimeoutId: number | null = null
  /** Reject fn for the pending data-channel open Promise; nulled when settled or cleared in cleanup. */
  private dataChannelOpenWaitReject: ((reason?: unknown) => void) | null = null

  private readonly listeners: ListenerMap = {
    user_speech_started: new Set(),
    user_speech_stopped: new Set(),
    assistant_audio_started: new Set(),
    assistant_audio_stopped: new Set(),
    transcription: new Set(),
    response_text: new Set(),
    error: new Set(),
    connection_state_changed: new Set(),
    state_changed: new Set(),
  }

  private assistantOutputActive = false
  private activeResponseId: string | null = null
  private currentSessionState: VoiceSessionState = 'idle'

  constructor(options: OpenAIRealtimeVoiceSessionOptions = {}) {
    this.sessionUrl = options.sessionUrl ?? '/api/realtime/session'
    this.realtimeCallsUrl = options.realtimeCallsUrl ?? 'https://api.openai.com/v1/realtime/calls'
    this.sessionRequestBody = options.sessionRequestBody
    this.rtcConfiguration = options.rtcConfiguration ?? {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    }
  }

  get state(): VoiceSessionState {
    return this.currentSessionState
  }

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): void {
    this.listeners[event].add(handler as VoiceEventHandler<VoiceEventName>)
  }

  off<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): void {
    this.listeners[event].delete(handler as VoiceEventHandler<VoiceEventName>)
  }

  private emit<E extends VoiceEventName>(event: E, payload: VoiceEventMap[E]): void {
    for (const h of this.listeners[event]) {
      try {
        ;(h as VoiceEventHandler<E>)(payload)
      } catch {
        /* consumer */
      }
    }
  }

  private emitConnection(state: VoiceEventMap['connection_state_changed']['state']): void {
    this.emit('connection_state_changed', { state, timestamp: Date.now() })
  }

  private setSessionState(state: VoiceSessionState): void {
    this.currentSessionState = state
    this.emit('state_changed', { state, timestamp: Date.now() })
  }

  private emitError(err: Error): void {
    this.emit('error', { error: err, timestamp: Date.now() })
    this.setSessionState('error')
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- WebRTC setup with SDP negotiation, ICE, DataChannel, and MediaStream branches; splitting would break sequential handshake flow
  async connect(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined' || typeof navigator?.mediaDevices?.getUserMedia !== 'function') {
      const err = new VoiceRealtimeError(
        'NOT_SUPPORTED',
        'WebRTC / getUserMedia is not available in this environment.'
      )
      this.emitError(err)
      throw err
    }

    if (this.connectInFlight) {
      return this.connectInFlight
    }

    const attempt = this.runConnectAttempt()
    this.connectInFlight = attempt
    try {
      await attempt
    } finally {
      this.connectInFlight = null
    }
  }

  private async runConnectAttempt(): Promise<void> {
    this.disconnectWithoutNotifyingIdle()
    const token = {}
    this.connectToken = token
    this.setSessionState('connecting')
    this.emitConnection('connecting')

    try {
      const sessionRes = await fetch(this.sessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.sessionRequestBody ?? {}),
      })
      const sessionText = await sessionRes.text()
      if (token !== this.connectToken) {
        return
      }
      if (!sessionRes.ok) {
        throw new VoiceRealtimeError(
          'SESSION_BOOTSTRAP_FAILED',
          `Realtime session HTTP ${sessionRes.status}: ${sessionText}`
        )
      }
      let secret: RealtimeClientSecretPayload
      try {
        secret = JSON.parse(sessionText) as RealtimeClientSecretPayload
      } catch (e) {
        throw new VoiceRealtimeError('SESSION_BOOTSTRAP_FAILED', 'Invalid JSON from session endpoint', {
          cause: e,
        })
      }
      const ephemeral = secret.value?.trim()
      if (!ephemeral) {
        throw new VoiceRealtimeError('MISSING_EPHEMERAL_KEY', 'Session response missing ephemeral `value`')
      }
      if (secret.expires_at && secret.expires_at * 1000 < Date.now() + 5000) {
        throw new VoiceRealtimeError(
          'MISSING_EPHEMERAL_KEY',
          'Ephemeral key expired or expiring imminently',
        )
      }

      const pc = new RTCPeerConnection(this.rtcConfiguration)
      this.pc = pc

      pc.onconnectionstatechange = () => {
        if (pc !== this.pc) return
        if (pc.connectionState === 'failed') {
          this.emitConnection('failed')
          this.emitError(
            new VoiceRealtimeError('WEBRTC_NEGOTIATION_FAILED', `Peer connection ${pc.connectionState}`)
          )
        }
      }

      const remoteAudio = document.createElement('audio')
      remoteAudio.autoplay = true
      remoteAudio.setAttribute('playsinline', 'true')
      remoteAudio.style.display = 'none'
      document.body.appendChild(remoteAudio)
      this.remoteAudio = remoteAudio

      pc.ontrack = (ev) => {
        if (pc !== this.pc) return
        const [stream] = ev.streams
        if (stream && remoteAudio) {
          remoteAudio.srcObject = stream
          remoteAudio.play().catch(() => {
            /* may require user gesture; autoplay policy */
          })
        }
        // If the data channel omits `response.output_audio.delta` (common for WebRTC media path), treat remote audio as assistant output once a response exists.
        if (ev.track.kind === 'audio' && !this.assistantOutputActive && this.activeResponseId) {
          this.assistantOutputActive = true
          this.emit('assistant_audio_started', { timestamp: Date.now() })
          this.setSessionState('speaking')
        }
      }

      let localStream: MediaStream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (e) {
        throw new VoiceRealtimeError('USER_MEDIA_DENIED', 'Microphone access was denied or unavailable.', {
          cause: e,
        })
      }
      if (token !== this.connectToken) {
        localStream.getTracks().forEach((t) => t.stop())
        return
      }
      this.localStream = localStream
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream)
      }

      const dc = pc.createDataChannel('oai-events')
      this.dc = dc

      dc.onmessage = (ev) => {
        this.handleServerEvent(ev.data)
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(this.realtimeCallsUrl, {
        method: 'POST',
        body: offer.sdp ?? '',
        headers: {
          Authorization: `Bearer ${ephemeral}`,
          'Content-Type': 'application/sdp',
        },
      })
      const answerSdp = await sdpRes.text()
      if (token !== this.connectToken) {
        return
      }
      if (!sdpRes.ok) {
        throw new VoiceRealtimeError(
          'WEBRTC_NEGOTIATION_FAILED',
          `Realtime calls HTTP ${sdpRes.status}: ${answerSdp}`
        )
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      await new Promise<void>((resolve, reject) => {
        if (dc.readyState === 'open') {
          resolve()
          return
        }
        this.dataChannelOpenWaitReject = reject
        this.dataChannelOpenTimeoutId = window.setTimeout(() => {
          this.dataChannelOpenTimeoutId = null
          const rj = this.dataChannelOpenWaitReject
          this.dataChannelOpenWaitReject = null
          rj?.(new VoiceRealtimeError('DATA_CHANNEL_FAILED', 'Data channel open timeout'))
        }, 30_000)
        dc.addEventListener(
          'open',
          () => {
            if (this.dataChannelOpenTimeoutId !== null) {
              clearTimeout(this.dataChannelOpenTimeoutId)
              this.dataChannelOpenTimeoutId = null
            }
            this.dataChannelOpenWaitReject = null
            resolve()
          },
          { once: true }
        )
        dc.addEventListener(
          'error',
          () => {
            if (this.dataChannelOpenTimeoutId !== null) {
              clearTimeout(this.dataChannelOpenTimeoutId)
              this.dataChannelOpenTimeoutId = null
            }
            this.dataChannelOpenWaitReject = null
            reject(new VoiceRealtimeError('DATA_CHANNEL_FAILED', 'Data channel error'))
          },
          { once: true }
        )
      })

      if (token !== this.connectToken) {
        return
      }

      this.emitConnection('connected')
      this.setSessionState('listening')
    } catch (e) {
      // Always release pc / mic / hidden audio for this attempt. Stale generations must still
      // cleanup: otherwise rapid reconnect or data-channel timeout leaves OS mic handles open.
      this.cleanupTracksAndPc()
      if (token !== this.connectToken) {
        return
      }
      let err: VoiceRealtimeError
      if (e instanceof VoiceRealtimeError) {
        err = e
      } else {
        const msg = e instanceof Error ? e.message : 'Voice connection failed'
        err = new VoiceRealtimeError('INTERNAL_ERROR', msg, { cause: e })
      }
      this.emitError(err)
      throw err
    }
  }

  disconnect(): void {
    this.connectToken = {}
    this.cleanupTracksAndPc()
    this.emitConnection('disconnected')
    this.setSessionState('disconnected')
  }

  /** Internal: release resources without emitting idle (used before reconnect). */
  private disconnectWithoutNotifyingIdle(): void {
    this.connectToken = {}
    this.cleanupTracksAndPc()
  }

  private cleanupTracksAndPc(): void {
    if (this.dataChannelOpenTimeoutId !== null) {
      clearTimeout(this.dataChannelOpenTimeoutId)
      this.dataChannelOpenTimeoutId = null
    }
    if (this.dataChannelOpenWaitReject) {
      const rj = this.dataChannelOpenWaitReject
      this.dataChannelOpenWaitReject = null
      rj(
        new VoiceRealtimeError(
          'DATA_CHANNEL_FAILED',
          'Disconnected before data channel opened',
        ),
      )
    }

    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null

    this.dc?.close()
    this.dc = null

    this.pc?.close()
    this.pc = null

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null
      this.remoteAudio.remove()
      this.remoteAudio = null
    }

    this.assistantOutputActive = false
    this.activeResponseId = null
  }

  sendAudioChunk(_chunk: ArrayBuffer | Uint8Array): void {
    /* WebRTC sends mic audio via the added MediaStreamTrack; chunk APIs are for future/non-WebRTC paths. */
  }

  abortAssistant(): void {
    const dc = this.dc
    if (!dc || dc.readyState !== 'open') {
      return
    }
    const cancel: Record<string, unknown> = { type: 'response.cancel' }
    if (this.activeResponseId) {
      cancel.response_id = this.activeResponseId
    }
    try {
      dc.send(JSON.stringify(cancel))
    } catch (e) {
      const err =
        e instanceof Error ? e : new Error(`Failed to send response.cancel: ${String(e)}`)
      this.emitError(err)
    }
  }

  private handleServerEvent(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return
    }
    const type = normalizeRealtimeServerEventType((parsed as { type: string }).type)
    const now = Date.now()

    switch (type) {
      case 'input_audio_buffer.speech_started':
        this.emit('user_speech_started', { timestamp: now })
        if (this.currentSessionState === 'speaking' || this.currentSessionState === 'thinking') {
          this.setSessionState('interrupted')
        } else {
          this.setSessionState('listening')
        }
        break

      case 'input_audio_buffer.speech_stopped':
        this.emit('user_speech_stopped', { timestamp: now })
        this.setSessionState('listening')
        break

      case 'response.created': {
        const rid = (parsed as { response?: { id?: string } }).response?.id
        if (rid) {
          this.activeResponseId = rid
        }
        this.setSessionState('thinking')
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = String((parsed as { transcript?: string }).transcript ?? '').trim()
        if (transcript) {
          this.emit('transcription', { text: transcript, isFinal: true, timestamp: now })
        }
        break
      }

      case 'response.text.delta': {
        const delta = String((parsed as { delta?: string }).delta ?? '')
        if (delta) {
          this.emit('response_text', { text: delta, isFinal: false, timestamp: now })
        }
        break
      }

      case 'response.text.done':
        this.emit('response_text', { text: '', isFinal: true, timestamp: now })
        break

      case 'response.audio_transcript.delta': {
        const delta = String((parsed as { delta?: string }).delta ?? '')
        if (delta) {
          this.emit('response_text', { text: delta, isFinal: false, timestamp: now })
        }
        break
      }

      case 'response.audio.delta':
        if (!this.assistantOutputActive) {
          this.assistantOutputActive = true
          this.emit('assistant_audio_started', { timestamp: now })
          this.setSessionState('speaking')
        }
        break

      case 'response.done': {
        const wasActive = this.assistantOutputActive
        this.assistantOutputActive = false
        this.activeResponseId = null
        if (wasActive) {
          this.emit('assistant_audio_stopped', { timestamp: now })
        }
        this.setSessionState('listening')
        break
      }

      case 'response.cancelled': {
        const wasActive = this.assistantOutputActive
        this.assistantOutputActive = false
        this.activeResponseId = null
        if (wasActive) {
          this.emit('assistant_audio_stopped', { timestamp: now })
          this.setSessionState('interrupted')
        } else {
          this.setSessionState('listening')
        }
        break
      }

      case 'error': {
        const msg =
          (parsed as { error?: { message?: string } }).error?.message ??
          (parsed as { message?: string }).message ??
          'Realtime error event'
        this.emitError(new Error(msg))
        break
      }

      default:
        break
    }
  }
}
