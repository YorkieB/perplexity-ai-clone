import { useEffect, useState } from 'react'
import { pickPreferredSpeechVoice } from '@/lib/speech-synthesis-voice'

/**
 * Resolves when browser finishes loading voices (often async after first interaction).
 */
export function usePreferredSpeechVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    if (typeof globalThis.speechSynthesis === 'undefined') return

    const sync = () => {
      const voices = globalThis.speechSynthesis.getVoices()
      setVoice(
        pickPreferredSpeechVoice(voices, 'en-GB', {
          excludeMicrosoft: true,
          preferBritishFemale: true,
        })
      )
    }

    sync()
    globalThis.speechSynthesis.addEventListener('voiceschanged', sync)

    const t = globalThis.setTimeout(sync, 250)

    return () => {
      globalThis.speechSynthesis.removeEventListener('voiceschanged', sync)
      globalThis.clearTimeout(t)
    }
  }, [])

  return voice
}
