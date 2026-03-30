import type { VoiceTurn } from './voice/types'

export type FocusMode = 'all' | 'academic' | 'reddit' | 'youtube' | 'news' | 'code' | 'finance' | 'chat'

export type TimeRange = 'any' | 'day' | 'week' | 'month' | 'year'

export type AvailableModel = 'gpt-4o' | 'gpt-4o-mini' | 'claude-3.5-sonnet' | 'claude-3-opus' | 'claude-3-haiku' | 'gemini-2.0-flash'

export interface Source {
  url: string
  title: string
  snippet: string
  rawContent?: string
  confidence?: number
  domain?: string
  favicon?: string
}

export interface SearchImage {
  url: string
  description?: string
}

export interface SearchVideo {
  url: string
  videoId: string
  title: string
  thumbnail: string
}

export interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  content: string
  uploadedAt: number
}

export interface ModelResponse {
  model: string
  content: string
  generatedAt: number
  convergenceScore?: number
  responseTime?: number
  tokenCount?: number
}

export type A2EModelId =
  | 'a2e-text-to-image'
  | 'a2e-nano-banana'
  | 'a2e-image-to-video'
  | 'a2e-talking-photo'
  | 'a2e-talking-video'
  | 'a2e-avatar-video'
  | 'a2e-tts'
  | 'a2e-voice-clone'
  | 'a2e-caption-removal'
  | 'a2e-dubbing'
  | 'a2e-live-stream'
  | 'a2e-virtual-try-on'
  | 'a2e-motion-transfer'
  | 'a2e-face-swap'
  | 'a2e-watermark'
  | 'a2e-custom-avatar'

export type A2EMediaType = 'image' | 'video' | 'audio' | 'info'

export interface A2ETask {
  id: string
  modelId: A2EModelId
  status: 'completed' | 'failed'
  mediaType: A2EMediaType
  resultUrls: string[]
  error?: string
  detail?: string
}

/** Server/chat envelope for special assistant turns (e.g. Manager–Worker clarification gate). */
export interface ChatMessageMetadata {
  type: 'clarification_required' | 'success' | (string & {})
  preTaskEstimate?: unknown | null
}

export type DeepResearchStepKey = 'planning' | 'searching' | 'synthesizing'
export type DeepResearchStepStatus = 'pending' | 'active' | 'done' | 'error'

export interface DeepResearchProgressStep {
  key: DeepResearchStepKey
  label: string
  status: DeepResearchStepStatus
  detail?: string
}

export interface DeepResearchFailure {
  subQuery: string
  message: string
}

export interface DeepResearchTimings {
  planningMs: number
  searchingMs: number
  synthesizingMs: number
  totalMs: number
}

export interface DeepResearchMeta {
  progress: DeepResearchProgressStep[]
  subQueries: string[]
  totalSearches: number
  completedSearches: number
  failedSearches: DeepResearchFailure[]
  timings?: DeepResearchTimings
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: ChatMessageMetadata
  sources?: Source[]
  images?: SearchImage[]
  videos?: SearchVideo[]
  tavilyAnswer?: string
  files?: UploadedFile[]
  createdAt: number
  modelUsed?: string
  focusMode?: FocusMode
  isDeepResearch?: boolean
  deepResearchMeta?: DeepResearchMeta
  followUpQuestions?: string[]
  isModelCouncil?: boolean
  modelResponses?: ModelResponse[]
  modality?: 'text' | 'voice'
  voiceTurn?: VoiceTurn
  a2eTask?: A2ETask
  isStreaming?: boolean
  reasoning?: string
}

export interface Thread {
  id: string
  workspaceId?: string
  title: string
  createdAt: number
  messages: Message[]
  updatedAt: number
}

export interface Workspace {
  id: string
  name: string
  description: string
  customSystemPrompt: string
  createdAt: number
  includeWebSearch?: boolean
  workspaceFiles?: WorkspaceFile[]
}

export interface WorkspaceFile {
  id: string
  name: string
  content: string
  type: string
  size: number
  mimeType?: string
  addedAt?: number
  uploadedAt: number
}

export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

export interface UserSettings {
  apiKeys: {
    /** OpenAI API key (sk-…) for chat + TTS via /api/llm and /api/tts when not using .env only. */
    openai?: string
    digitalOcean?: string
    /** ElevenLabs API key when `ttsProvider` is `elevenlabs` (or set `ELEVENLABS_API_KEY` in .env for server-only). */
    elevenLabs?: string
    /** ElevenLabs voice id from the dashboard (per voice). */
    elevenLabsVoiceId?: string
    googledrive?: string
    onedrive?: string
    github?: string
    dropbox?: string
    /** Suno API key for music generation. */
    suno?: string
    /** Plaid Client ID for bank connections. */
    plaid?: string
    /** Plaid Secret for bank connections. */
    plaidSecret?: string
    /** X (Twitter) API Key for posting. */
    xApiKey?: string
    /** X (Twitter) API Secret. */
    xApiSecret?: string
    /** X (Twitter) Access Token. */
    xAccessToken?: string
    /** X (Twitter) Access Token Secret. */
    xAccessTokenSecret?: string
  }
  /** Plaid access token (stored after bank link). */
  plaidAccessToken?: string
  /** Plaid environment: sandbox, development, or production. */
  plaidEnvironment?: 'sandbox' | 'development' | 'production'
  /** Read-aloud / voice chat TTS backend. Default OpenAI. */
  ttsProvider?: 'openai' | 'elevenlabs'
  includeWebSearch?: boolean
  oauthTokens: {
    googledrive?: OAuthToken
    onedrive?: OAuthToken
    github?: OAuthToken
    dropbox?: OAuthToken
    /** Spotify Web API (PKCE); used for “My playlists” + embed. */
    spotify?: OAuthToken
  }
  oauthClientIds: {
    googledrive?: string
    onedrive?: string
    github?: string
    dropbox?: string
    /** Spotify Dashboard “Client ID” (PKCE — no secret stored). */
    spotify?: string
  }
  oauthClientSecrets: {
    googledrive?: string
    onedrive?: string
    github?: string
    dropbox?: string
  }
  connectedServices: {
    googledrive: boolean
    onedrive: boolean
    github: boolean
    dropbox: boolean
    spotify: boolean
  }
  voiceRegistry?: {
    defaultVoiceId: string | null
    voices: Array<{
      id: string
      name: string
      elevenLabsVoiceId: string
      voiceSettings?: { stability?: number; similarity_boost?: number; style?: number }
    }>
  }
  enableVoiceAnalysis?: boolean
}

export interface CloudFile {
  id: string
  name: string
  type: string
  size: number
  source: 'googledrive' | 'onedrive' | 'github' | 'dropbox'
  path: string
  modifiedAt: number
}
