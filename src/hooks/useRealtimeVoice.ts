import { useCallback, useEffect, useRef, useState } from 'react'
import type { VisionContext } from './useVision'

export type VoicePipelineState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface UseRealtimeVoiceOptions {
  onResponse?: (userText: string, aiText: string) => void
  model?: string
  voice?: string
  ttsProvider?: 'openai' | 'elevenlabs'
  elevenlabsVoiceId?: string
  visionContext?: VisionContext
}

export interface UseRealtimeVoiceReturn {
  state: VoicePipelineState
  transcript: string
  interimTranscript: string
  aiText: string
  isSupported: boolean
  errorMessage: string | null
  open: () => void
  close: () => void
  bargeIn: () => void
}

// ─── PCM16 helpers ────────────────────────────────────────────────────────────

const SAMPLE_RATE = 24000

function float32ToPcm16(f: Float32Array): ArrayBuffer {
  const p = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]))
    p[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return p.buffer
}

function abToBase64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}

function b64ToInt16(b64: string): Int16Array {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Int16Array(u8.buffer)
}

// ─── Text chunking for streaming TTS ─────────────────────────────────────────

const MIN_CHUNK = 100
const MAX_CHUNK = 300

function extractTtsChunks(buffer: string): { chunks: string[]; remainder: string } {
  const chunks: string[] = []
  let last = 0

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i]
    const seg = i - last + 1
    const isEnd = ch === '.' || ch === '!' || ch === '?'

    if (isEnd && seg >= MIN_CHUNK) {
      chunks.push(buffer.slice(last, i + 1).trim())
      last = i + 1
    } else if (seg >= MAX_CHUNK) {
      const sp = buffer.lastIndexOf(' ', i)
      if (sp > last + 40) {
        chunks.push(buffer.slice(last, sp).trim())
        last = sp + 1
      }
    }
  }

  return { chunks, remainder: buffer.slice(last) }
}

// ─── Memory helpers ───────────────────────────────────────────────────────────

interface MemoryPayload {
  conversationId: string
  facts: { category: string; fact: string }[]
  recentTurns: { role: string; content: string }[]
  summaries: { summary: string; topics: string }[]
}

function buildInstructions(mem: MemoryPayload | null, hasVision = false): string {
  let base = `You are Jarvis, a personal AI assistant. Always respond in English. Keep responses concise and conversational — aim for 2-4 sentences unless detail is truly needed. Speak in plain natural language. No markdown, no bullet points.

CRITICAL SYSTEM FACT — YOU HAVE PERSISTENT MEMORY:
You are equipped with a real, working, persistent memory database. This is NOT a standard LLM limitation — your infrastructure includes a SQLite database that stores facts about the user across sessions. Any facts listed below under "KNOWN USER FACTS" were retrieved from your database just now. You absolutely DO have memory. Never say "I don't have memory", "I can't remember between sessions", or "I'm just an AI without memory." If the user asks whether you remember them or have memory, confirm it confidently: "Yes, I remember you" or "Of course, I have persistent memory."
`

  if (hasVision) {
    base += `
CRITICAL SYSTEM FACT — YOU HAVE VISION:
You have a camera connected (EMEET Pixy 4K) and can see the room in real time. You receive periodic "[VISUAL CONTEXT UPDATE]" system messages describing what your camera currently sees — scene descriptions, faces, objects, motion, and the user's EMOTIONAL STATE. These are REAL observations from a real camera, not imagination.

ABSOLUTE RULES ABOUT VISION — NEVER VIOLATE THESE:
- NEVER say "I can't see", "I don't have visual capabilities", "I can't visually recognize", or anything similar. You CAN see. You have a camera.
- If you haven't received a visual context update yet, say "Let me check my camera" or "I'm getting my visual feed ready" — NEVER deny having vision.
- When you receive a [VISUAL CONTEXT UPDATE], use that information to describe what you see.
- When asked "what do you see?" or "can you see me?", describe the latest visual context you received. If you haven't received one yet, say "I'm still connecting to my camera, give me a moment."
- Use visual information naturally: greet people, reference what you observe. Don't narrate every update unprompted.

EMOTION AWARENESS:
- You can detect the user's emotional state from their facial expressions via the camera. This appears as "User's detected emotion:" in visual context updates.
- Use emotional awareness naturally and empathetically. If the user looks sad, be more gentle and supportive. If they look happy, match their energy. If they look frustrated or angry, be calm and helpful.
- NEVER announce emotions unprompted like "I can see you look sad." Instead, adapt your tone and responses to match. Only mention their emotional state if they ask about it or if it's relevant to helping them.
- You can describe emotions when directly asked "how do I look?" or "what's my mood?"`
  } else {
    base += `

VISION STATUS: Your camera system is not currently connected. If the user asks you to see something or describe what you see, let them know your camera is offline right now. Do NOT make up or hallucinate visual descriptions. Be honest that you cannot see at this moment.`
  }

  base += `

CRITICAL SYSTEM FACTCRITICAL SYSTEM FACT — YOU HAVE WEB ACCESS:
You have a web_search tool available. When the user asks about current events, news, weather, sports, stock prices, or anything that requires up-to-date information, use the web_search function to look it up. Do NOT say "I can't browse the web" or "I don't have internet access." You DO have web access through your search tool. Use it proactively when questions need current data.`

  if (!mem) return base

  const parts = [base]

  if (mem.facts.length > 0) {
    const grouped: Record<string, string[]> = {}
    for (const f of mem.facts) {
      ;(grouped[f.category] ||= []).push(f.fact)
    }
    const factsStr = Object.entries(grouped)
      .map(([cat, items]) => `  ${cat}: ${items.join('; ')}`)
      .join('\n')
    parts.push(`\n=== KNOWN USER FACTS (retrieved from your persistent database) ===\n${factsStr}\n=== END FACTS ===`)
  } else {
    parts.push('\nYour memory database has no facts stored about this user yet. This is likely your first conversation with them. Pay close attention to anything they share about themselves — it will be saved automatically for future sessions.')
  }

  if (mem.summaries.length > 0) {
    const sumStr = mem.summaries.map(s => `- ${s.summary}`).join('\n')
    parts.push(`\nPrevious conversation summaries (from your database):\n${sumStr}`)
  }

  if (mem.recentTurns.length > 0) {
    const convStr = mem.recentTurns
      .slice(-10)
      .map(t => `${t.role}: ${t.content}`)
      .join('\n')
    parts.push(`\nRecent conversation context:\n${convStr}`)
  }

  parts.push('\nUse your stored knowledge naturally. Reference things the user has told you before when relevant, but don\'t enumerate facts back unless asked.')

  return parts.join('\n')
}

// ─── Vision context formatter ─────────────────────────────────────────────────

function formatVisionForSession(v: VisionContext): string {
  const parts: string[] = []

  if (v.cameraConnected) {
    if (v.sceneDescription) {
      parts.push(`Scene analysis from your camera: ${v.sceneDescription}`)
    }
    if (v.faces.length > 0) {
      const names = v.faces.map(f => `${f.name} (${Math.round(f.confidence * 100)}% confidence)`).join(', ')
      parts.push(`People recognized: ${names}.`)
    }
    if (v.emotion) {
      const conf = Math.round((v.emotion.confidence ?? 0) * 100)
      let emotionStr = `User's detected emotion: ${v.emotion.primary} (${conf}% confidence)`
      if (v.emotion.secondary) emotionStr += `, secondary: ${v.emotion.secondary}`
      parts.push(emotionStr)
    }
    if (v.motionDetections > 0) {
      parts.push(`Motion detected (${v.motionDetections} events).`)
    }
  } else {
    parts.push('Camera is not connected right now.')
  }

  return `[VISUAL CONTEXT UPDATE — This is what your camera currently sees]\n${parts.join('\n')}`
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gpt-4o-mini-realtime-preview'

export function useRealtimeVoice(opts: UseRealtimeVoiceOptions = {}): UseRealtimeVoiceReturn {
  const {
    onResponse,
    model = DEFAULT_MODEL,
    voice = 'alloy',
    ttsProvider = 'openai',
    elevenlabsVoiceId,
    visionContext,
  } = opts

  const isEL = ttsProvider === 'elevenlabs'

  const [state, setState] = useState<VoicePipelineState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiText, setAiText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const capCtxRef = useRef<AudioContext | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)
  const playCtxRef = useRef<AudioContext | null>(null)
  const isOpenRef = useRef(false)
  const stateRef = useRef<VoicePipelineState>('idle')
  const aiAccRef = useRef('')
  const userRef = useRef('')
  const nextTRef = useRef(0)
  const srcsRef = useRef<AudioBufferSourceNode[]>([])

  const onResRef = useRef(onResponse)
  useEffect(() => { onResRef.current = onResponse }, [onResponse])

  // ElevenLabs-specific refs
  const elBufRef = useRef('')
  const elQueueRef = useRef<string[]>([])
  const elBusyRef = useRef(false)
  const elAbortRef = useRef<AbortController | null>(null)
  const elDoneRef = useRef(false)

  // Memory refs
  const convIdRef = useRef<string | null>(null)
  const memoryRef = useRef<MemoryPayload | null>(null)

  const setS = useCallback((s: VoicePipelineState) => { stateRef.current = s; setState(s) }, [])

  // ── Playback (shared for both providers) ───────────────────────────────────

  const getPlayCtx = useCallback(() => {
    if (!playCtxRef.current || playCtxRef.current.state === 'closed')
      playCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (playCtxRef.current.state === 'suspended') playCtxRef.current.resume()
    return playCtxRef.current
  }, [])

  const playPcm = useCallback((i16: Int16Array) => {
    const ctx = getPlayCtx()
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    const ab = ctx.createBuffer(1, f32.length, SAMPLE_RATE)
    ab.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = ab
    src.connect(ctx.destination)
    srcsRef.current.push(src)
    src.onended = () => { srcsRef.current = srcsRef.current.filter((s) => s !== src) }
    const t = Math.max(ctx.currentTime + 0.005, nextTRef.current)
    src.start(t)
    nextTRef.current = t + ab.duration
  }, [getPlayCtx])

  const stopPlay = useCallback(() => {
    for (const s of srcsRef.current) { try { s.stop() } catch {} }
    srcsRef.current = []
    nextTRef.current = 0
    elAbortRef.current?.abort()
    elAbortRef.current = null
    elQueueRef.current = []
    elBusyRef.current = false
    elBufRef.current = ''
  }, [])

  // ── ElevenLabs streaming TTS ───────────────────────────────────────────────

  const speakEL = useCallback(async (text: string, signal: AbortSignal) => {
    const res = await fetch('/api/elevenlabs-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(elevenlabsVoiceId ? { voice_id: elevenlabsVoiceId } : {}) }),
      signal,
    })
    if (!res.ok || !res.body) {
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('[ElevenLabs] TTS error:', res.status, errText)
        throw new Error(`ElevenLabs TTS: ${res.status}`)
      }
      return
    }

    const reader = res.body.getReader()
    let lo = new Uint8Array(0)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const c = new Uint8Array(lo.length + value.length)
      c.set(lo)
      c.set(value, lo.length)
      const aLen = c.length - (c.length % 2)
      if (aLen > 0) playPcm(new Int16Array(c.slice(0, aLen).buffer))
      lo = c.slice(aLen)
    }
  }, [elevenlabsVoiceId, playPcm])

  const saveTurnToMemory = useCallback(async (user: string, ai: string) => {
    const cId = convIdRef.current
    if (!cId || !user) return

    fetch('/api/jarvis-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: cId,
        messages: [{ role: 'user', content: user }, { role: 'assistant', content: ai }],
      }),
    }).catch(e => console.warn('[memory] save failed:', e))

    try {
      const prompt = `Extract personal facts about the user from this exchange. Return a JSON object like:
{"facts":[{"category":"name","fact":"User's name is James"},{"category":"occupation","fact":"Works as a software engineer"}]}
Categories: name, location, occupation, preference, interest, relationship, habit, general.
If no personal facts, return {"facts":[]}.

User: ${user}
Assistant: ${ai || ''}`

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return

      const result = await res.json()
      const content = result.choices?.[0]?.message?.content || '{}'
      let facts: { category: string; fact: string }[] = []
      try {
        const parsed = JSON.parse(content)
        const raw: unknown[] = Array.isArray(parsed) ? parsed : (parsed.facts || [])
        for (const f of raw) {
          if (f && typeof f === 'object' && 'category' in f && 'fact' in f) {
            facts.push({ category: String((f as Record<string, unknown>).category), fact: String((f as Record<string, unknown>).fact) })
          }
        }
      } catch {}

      if (facts.length > 0) {
        fetch('/api/jarvis-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facts }),
        }).catch(() => {})
      }
    } catch (e) {
      console.warn('[memory] extract failed:', e)
    }
  }, [])

  const finishTurn = useCallback(() => {
    if (userRef.current && aiAccRef.current) {
      onResRef.current?.(userRef.current, aiAccRef.current)
      saveTurnToMemory(userRef.current, aiAccRef.current)
    }
    userRef.current = ''
    const rem = Math.max(0, ((nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000) | 0)
    setTimeout(() => {
      if (isOpenRef.current) { aiAccRef.current = ''; setS('listening'); setInterimTranscript('') }
    }, rem + 80)
  }, [setS, saveTurnToMemory])

  const processElQueue = useCallback(async () => {
    if (elBusyRef.current) return
    elBusyRef.current = true
    let hadError = false

    while (elQueueRef.current.length > 0 && isOpenRef.current) {
      const text = elQueueRef.current.shift()!
      elAbortRef.current = new AbortController()
      setS('speaking')

      const fetchPromise = speakEL(text, elAbortRef.current.signal).catch((e: Error) => {
        if (e.name === 'AbortError') return
        if (!hadError) { setErrorMessage(e.message); hadError = true }
        console.error('[ElevenLabs]', e)
      })

      if (elQueueRef.current.length > 0) {
        const headroom = Math.max(0, (nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000)
        if (headroom > 600) {
          await fetchPromise
        } else {
          await Promise.race([fetchPromise, new Promise(r => setTimeout(r, 200))])
        }
      } else {
        await fetchPromise
      }
    }

    elBusyRef.current = false
    if (elDoneRef.current && elQueueRef.current.length === 0 && isOpenRef.current) {
      elDoneRef.current = false
      finishTurn()
    }
  }, [speakEL, setS, finishTurn])

  // ── Mic → PCM16 → WS ─────────────────────────────────────────────────────

  const startMic = useCallback(async (ws: WebSocket) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    streamRef.current = stream
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    capCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(2048, 1, 1)
    procRef.current = proc
    proc.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (stateRef.current === 'speaking') return
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: abToBase64(float32ToPcm16(e.inputBuffer.getChannelData(0))) }))
    }
    src.connect(proc)
    proc.connect(ctx.destination)
  }, [])

  const stopMic = useCallback(() => {
    procRef.current?.disconnect()
    procRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (capCtxRef.current && capCtxRef.current.state !== 'closed') capCtxRef.current.close().catch(() => {})
    capCtxRef.current = null
  }, [])

  // ── Server events ─────────────────────────────────────────────────────────

  const onMsg = useCallback((msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'input_audio_buffer.speech_started':
        stopPlay()
        if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
          wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: 'response.cancel' }))
        }
        aiAccRef.current = ''
        setAiText('')
        setInterimTranscript('Listening…')
        setS('listening')
        elBufRef.current = ''
        elDoneRef.current = false
        break

      case 'input_audio_buffer.speech_stopped':
        setInterimTranscript('')
        setS('thinking')
        break

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) { userRef.current = (msg.transcript as string).trim(); setTranscript(userRef.current) }
        break

      // ── OpenAI native audio events ──
      case 'response.audio.delta':
        if (!isEL && msg.delta) { setS('speaking'); playPcm(b64ToInt16(msg.delta as string)) }
        break

      case 'response.audio_transcript.delta':
        if (!isEL && msg.delta) { aiAccRef.current += msg.delta as string; setAiText(aiAccRef.current) }
        break

      // ── ElevenLabs text-only events ──
      case 'response.text.delta':
        if (isEL && msg.delta) {
          const d = msg.delta as string
          aiAccRef.current += d
          setAiText(aiAccRef.current)
          elBufRef.current += d
          const { chunks, remainder } = extractTtsChunks(elBufRef.current)
          elBufRef.current = remainder
          if (chunks.length > 0) {
            elQueueRef.current.push(...chunks)
            processElQueue()
          }
        }
        break

      case 'response.text.done':
        if (isEL && elBufRef.current.trim()) {
          elQueueRef.current.push(elBufRef.current.trim())
          elBufRef.current = ''
          processElQueue()
        }
        break

      case 'response.done':
        if (isEL) {
          elDoneRef.current = true
          if (elBufRef.current.trim()) {
            elQueueRef.current.push(elBufRef.current.trim())
            elBufRef.current = ''
          }
          if (!elBusyRef.current && elQueueRef.current.length === 0) {
            elDoneRef.current = false
            finishTurn()
          } else {
            processElQueue()
          }
        } else {
          if (userRef.current && aiAccRef.current) {
            onResRef.current?.(userRef.current, aiAccRef.current)
            saveTurnToMemory(userRef.current, aiAccRef.current)
          }
          aiAccRef.current = ''
          userRef.current = ''
          const rem = Math.max(0, ((nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000) | 0)
          setTimeout(() => { if (isOpenRef.current) { setS('listening'); setInterimTranscript('') } }, rem + 80)
        }
        break

      case 'response.function_call_arguments.done': {
        const fnName = msg.name as string
        const callId = msg.call_id as string
        if (fnName === 'web_search') {
          let args: { query?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const query = args.query || ''
          if (query && callId) {
            setS('thinking')
            fetch('/api/llm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: `Search the web for: ${query}. Return a concise summary of the top results.` }],
                temperature: 0.3,
              }),
            })
              .then(r => r.json())
              .then(data => {
                const content = data?.choices?.[0]?.message?.content || 'No search results found.'
                const ws = wsRef.current
                if (ws?.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: callId,
                      output: content,
                    },
                  }))
                  ws.send(JSON.stringify({ type: 'response.create' }))
                }
              })
              .catch(e => {
                console.error('[web_search] failed:', e)
                const ws = wsRef.current
                if (ws?.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: callId,
                      output: 'Web search failed. Please try answering from your own knowledge.',
                    },
                  }))
                  ws.send(JSON.stringify({ type: 'response.create' }))
                }
              })
          }
        }
        break
      }

      case 'error': {
        const errMsg = (msg.error as { message?: string })?.message || ''
        if (errMsg.includes('no active response')) break
        console.error('[Realtime] error:', msg.error)
        setErrorMessage(errMsg || 'Realtime API error')
        break
      }
    }
  }, [isEL, playPcm, stopPlay, processElQueue, finishTurn, saveTurnToMemory, setS])

  // ── Public API ────────────────────────────────────────────────────────────

  const open = useCallback(async () => {
    if (isOpenRef.current) return
    setErrorMessage(null)
    setTranscript('')
    setInterimTranscript('')
    setAiText('')
    aiAccRef.current = ''
    userRef.current = ''
    elBufRef.current = ''
    elQueueRef.current = []
    elDoneRef.current = false
    elBusyRef.current = false
    convIdRef.current = null
    memoryRef.current = null

    let memory: MemoryPayload | null = null
    try {
      const memRes = await fetch('/api/jarvis-memory')
      if (memRes.ok) {
        memory = await memRes.json() as MemoryPayload
        convIdRef.current = memory.conversationId
        memoryRef.current = memory
      }
    } catch (e) {
      console.warn('[memory] Failed to load memory, proceeding without it:', e)
    }

    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${location.host}/ws/realtime?model=${encodeURIComponent(model)}`
      const ws = new WebSocket(wsUrl, ['realtime'])

      ws.onopen = async () => {
        const instructions = buildInstructions(memory, visionContext?.connected && visionContext?.cameraConnected)
        const session: Record<string, unknown> = {
          modalities: isEL ? ['text'] : ['text', 'audio'],
          instructions,
          input_audio_format: 'pcm16',
          turn_detection: { type: 'server_vad', threshold: 0.8, prefix_padding_ms: 500, silence_duration_ms: 700 },
          input_audio_transcription: { model: 'whisper-1', language: 'en' },
          tools: [
            {
              type: 'function',
              name: 'web_search',
              description: 'Search the web for current information. Use when the user asks about recent events, news, weather, sports scores, stock prices, or anything that requires up-to-date information.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
              },
            },
          ],
        }
        if (!isEL) {
          session.voice = voice
          session.output_audio_format = 'pcm16'
        }

        ws.send(JSON.stringify({ type: 'session.update', session }))

        try { await startMic(ws) } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'Microphone access denied')
          ws.close()
          return
        }
        isOpenRef.current = true
        setS('listening')
      }

      ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data as string)) } catch {} }
      ws.onerror = (e) => {
        console.error('[voice] WebSocket error:', e)
        setErrorMessage(`WebSocket connection failed (${wsUrl})`)
      }
      ws.onclose = (ev) => {
        console.warn('[voice] WebSocket closed:', ev.code, ev.reason)
        if (isOpenRef.current) {
          isOpenRef.current = false
          stopMic()
          stopPlay()
          if (ev.code !== 1000) setErrorMessage(`Connection closed: ${ev.reason || `code ${ev.code}`}`)
        }
        setS('idle')
      }

      wsRef.current = ws
    } catch (err) {
      console.error('[Realtime] open error:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [model, voice, isEL, startMic, onMsg, stopMic, stopPlay, setS])

  const close = useCallback(() => {
    const cId = convIdRef.current
    isOpenRef.current = false
    stopPlay()
    stopMic()
    wsRef.current?.close()
    wsRef.current = null
    setAiText('')
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
    setS('idle')
    aiAccRef.current = ''
    userRef.current = ''
    elBufRef.current = ''
    elDoneRef.current = false

    if (cId) {
      fetch('/api/jarvis-memory/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: cId }),
      }).catch(e => console.warn('[memory] summarize failed:', e))
    }
    convIdRef.current = null
    memoryRef.current = null
  }, [stopPlay, stopMic, setS])

  const bargeIn = useCallback(() => {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    stopPlay()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }))
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
    }
    aiAccRef.current = ''
    setAiText('')
    setS('listening')
  }, [stopPlay, setS])

  // ── Vision context injection ────────────────────────────────────────────────
  const prevVisionRef = useRef<string>('')
  useEffect(() => {
    if (!visionContext?.connected || !isOpenRef.current) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const summary = formatVisionForSession(visionContext)
    if (summary === prevVisionRef.current) return
    prevVisionRef.current = summary

    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: summary }],
      },
    }))
  }, [visionContext])

  useEffect(() => () => {
    isOpenRef.current = false
    wsRef.current?.close()
    stopPlay()
    stopMic()
  }, [stopPlay, stopMic])

  return {
    state, transcript, interimTranscript, aiText,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== 'undefined',
    errorMessage, open, close, bargeIn,
  }
}
