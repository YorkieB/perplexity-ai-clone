import { UserSettings } from './types'

export const DEFAULT_USER_SETTINGS: UserSettings = {
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