import { UserSettings } from './types'

export const DEFAULT_USER_SETTINGS: UserSettings = {
  // Workspace `includeWebSearch` inherits this global default when workspace override is undefined.
  includeWebSearch: true,
  proactiveVision: false,
  voiceGuidanceMode: 'copilot',
  nativeControlEnabled: true,
  apiKeys: {},
  oauthTokens: {},
  oauthClientIds: {},
  oauthClientSecrets: {},
  connectedServices: {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false, spotify: false,
  },
}