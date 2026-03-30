import { UserSettings } from './types'

export const DEFAULT_USER_SETTINGS: UserSettings = {
  includeWebSearch: true,
  autoModelEnabled: false,
  queryVoiceTranscriptMode: 'append',
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