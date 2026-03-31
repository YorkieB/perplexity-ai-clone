export interface VoiceSettings {
  stability: number
  similarity_boost: number
  style: number
}

export interface VoiceProfile {
  id: string
  name: string
  elevenLabsVoiceId: string
  voiceSettings?: Partial<VoiceSettings>
  category?: string
  description?: string
  previewUrl?: string
}

export interface VoiceRegistry {
  defaultVoiceId: string | null
  voices: VoiceProfile[]
}

const STORAGE_KEY = 'jarvis-voice-registry'

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
}

export function getDefaultVoiceSettings(): VoiceSettings {
  return { ...DEFAULT_VOICE_SETTINGS }
}

export function getVoiceRegistry(): VoiceRegistry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as VoiceRegistry
  } catch { /* ignored */ }
  return { defaultVoiceId: null, voices: [] }
}

export function saveVoiceRegistry(registry: VoiceRegistry): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry))
}

export function addVoiceToRegistry(profile: VoiceProfile): VoiceRegistry {
  if (!profile.id?.trim()) throw new Error('VoiceProfile.id is required')
  if (!profile.name?.trim()) throw new Error('VoiceProfile.name is required')
  if (!profile.elevenLabsVoiceId?.trim()) {
    throw new Error('VoiceProfile.elevenLabsVoiceId is required')
  }

  const reg = getVoiceRegistry()
  const existing = reg.voices.findIndex(v => v.id === profile.id)
  if (existing >= 0) {
    reg.voices[existing] = profile
  } else {
    reg.voices.push(profile)
  }
  saveVoiceRegistry(reg)
  return reg
}

export function removeVoiceFromRegistry(profileId: string): VoiceRegistry {
  const reg = getVoiceRegistry()
  reg.voices = reg.voices.filter(v => v.id !== profileId)
  if (reg.defaultVoiceId === profileId) {
    reg.defaultVoiceId = null
  }
  saveVoiceRegistry(reg)
  return reg
}

export function setDefaultVoice(profileId: string | null): VoiceRegistry {
  const reg = getVoiceRegistry()
  reg.defaultVoiceId = profileId
  saveVoiceRegistry(reg)
  return reg
}

export function getVoiceByName(name: string): VoiceProfile | undefined {
  const reg = getVoiceRegistry()
  const lower = name.toLowerCase()
  return reg.voices.find(v => v.name.toLowerCase() === lower)
}

export function getVoiceProfileMap(): Map<string, VoiceProfile> {
  const reg = getVoiceRegistry()
  const map = new Map<string, VoiceProfile>()
  for (const v of reg.voices) {
    map.set(v.name.toLowerCase(), v)
  }
  return map
}

export function getDefaultVoiceProfile(): VoiceProfile | undefined {
  const reg = getVoiceRegistry()
  if (!reg.defaultVoiceId) return undefined
  return reg.voices.find(v => v.id === reg.defaultVoiceId)
}
