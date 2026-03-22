export type FocusMode = 'all' | 'academic' | 'reddit' | 'youtube' | 'news' | 'code'

export type AvailableModel = 'gpt-4o' | 'gpt-4o-mini' | 'claude-3.5-sonnet' | 'claude-3-opus' | 'claude-3-haiku' | 'gemini-2.0-flash'

export interface Source {
  url: string
  title: string
  snippet: string
  confidence?: number
  domain?: string
  favicon?: string
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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  files?: UploadedFile[]
  createdAt: number
  modelUsed?: string
  focusMode?: FocusMode
  isDeepResearch?: boolean
  followUpQuestions?: string[]
  isModelCouncil?: boolean
  modelResponses?: ModelResponse[]
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
}

export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

export interface UserSettings {
  apiKeys: {
    digitalOcean?: string
    googledrive?: string
    onedrive?: string
    github?: string
    dropbox?: string
  }
  oauthTokens: {
    googledrive?: OAuthToken
    onedrive?: OAuthToken
    github?: OAuthToken
    dropbox?: OAuthToken
  }
  oauthClientIds: {
    googledrive?: string
    onedrive?: string
    github?: string
    dropbox?: string
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
  }
  /** When true (default), run Tavily/web search before answering. When false, skip web search and use workspace prompt, thread context, files, and model knowledge only. */
  includeWebSearch?: boolean
  /** Global assistant behaviour (merged before workspace prompt in the system message). */
  answerRole?: string
  answerTone?: string
  answerStructure?: string
  answerConstraints?: string
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  apiKeys: {},
  oauthTokens: {},
  oauthClientIds: {},
  oauthClientSecrets: {},
  connectedServices: {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
  },
  includeWebSearch: true,
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
