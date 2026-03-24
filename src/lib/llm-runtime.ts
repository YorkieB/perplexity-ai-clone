/**
 * Per-session LLM routing: DigitalOcean token or OpenAI key from Settings (sent per request);
 * otherwise the dev/proxy uses OPENAI_API_KEY from .env when no client Authorization is sent.
 */
export type LlmRuntimeConfig =
  | {
      provider: 'digitalocean'
      digitalOceanApiKey: string
      /** When set, sent to /api/tts while chat uses DigitalOcean. */
      openaiApiKey?: string
      ttsProvider?: 'openai' | 'elevenlabs'
      elevenLabsApiKey?: string
      elevenLabsVoiceId?: string
    }
  | {
      provider: 'openai'
      openaiApiKey: string
      ttsProvider?: 'openai' | 'elevenlabs'
      elevenLabsApiKey?: string
      elevenLabsVoiceId?: string
    }
  | null

let runtime: LlmRuntimeConfig = null

export function setLlmRuntimeConfig(config: LlmRuntimeConfig) {
  runtime = config
}

export function getLlmRuntimeConfig(): LlmRuntimeConfig {
  return runtime
}
