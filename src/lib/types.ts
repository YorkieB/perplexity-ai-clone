export interface Source {
  url: string
  title: string
  snippet: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  createdAt: number
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
