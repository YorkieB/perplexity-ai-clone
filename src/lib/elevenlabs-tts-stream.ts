/**
 * ElevenLabs streaming TTS (PCM s16le mono @ 24kHz) — mirrors the Electron main process
 * `handleElevenLabsStreamingTts` handler (`/api/elevenlabs-tts`).
 */

export async function fetchElevenLabsPcm(
  text: string,
  options?: { signal?: AbortSignal; voiceId?: string; modelId?: string },
): Promise<Buffer> {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    throw new Error('Empty text')
  }
  const key = (process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY || '').trim()
  if (!key) {
    throw new Error('Missing ELEVENLABS_API_KEY')
  }
  const voiceId =
    options?.voiceId?.trim() ||
    (process.env.ELEVENLABS_VOICE_ID || process.env.VITE_ELEVENLABS_VOICE_ID || '').trim() ||
    'pNInz6obpgDQGcFmaJgB'

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000&optimize_streaming_latency=3`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: options?.modelId ?? 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
      signal: options?.signal,
    },
  )

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText)
    throw new Error(`ElevenLabs TTS: ${String(upstream.status)} ${errText}`)
  }

  const ab = await upstream.arrayBuffer()
  return Buffer.from(ab)
}
