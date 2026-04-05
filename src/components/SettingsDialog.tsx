import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings } from '@/lib/types'
import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import { buildAuthUrl, isTokenExpired } from '@/lib/oauth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Key, CloudArrowUp, Link as LinkIcon, CheckCircle, Warning, XCircle, Microphone, MagnifyingGlass, Play, Stop, Trash, Plus, Star, Monitor } from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VoiceProfile } from '@/lib/voice-registry'
import { PlaidLinkButton } from '@/components/PlaidLinkButton'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type OAuthCloudProvider = 'googledrive' | 'onedrive' | 'github' | 'dropbox'

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)

  const [localApiKeys, setLocalApiKeys] = useState({
    digitalOcean: settings?.apiKeys.digitalOcean || '',
    suno: settings?.apiKeys.suno || '',
    plaid: settings?.apiKeys.plaid || '',
    plaidSecret: settings?.apiKeys.plaidSecret || '',
    xApiKey: settings?.apiKeys.xApiKey || '',
    xApiSecret: settings?.apiKeys.xApiSecret || '',
    xAccessToken: settings?.apiKeys.xAccessToken || '',
    xAccessTokenSecret: settings?.apiKeys.xAccessTokenSecret || '',
  })

  const [localClientIds, setLocalClientIds] = useState({
    googledrive: settings?.oauthClientIds.googledrive || '',
    onedrive: settings?.oauthClientIds.onedrive || '',
    github: settings?.oauthClientIds.github || '',
    dropbox: settings?.oauthClientIds.dropbox || '',
  })

  const [localClientSecrets, setLocalClientSecrets] = useState({
    googledrive: settings?.oauthClientSecrets.googledrive || '',
    onedrive: settings?.oauthClientSecrets.onedrive || '',
    github: settings?.oauthClientSecrets.github || '',
    dropbox: settings?.oauthClientSecrets.dropbox || '',
  })

  const [showKeys, setShowKeys] = useState({
    digitalOcean: false,
    suno: false,
    plaid: false,
    plaidSecret: false,
    xApiKey: false,
    xApiSecret: false,
    xAccessToken: false,
    xAccessTokenSecret: false,
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
  })

  const [showSecrets, setShowSecrets] = useState({
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
  })

  useEffect(() => {
    setLocalApiKeys({
      digitalOcean: settings?.apiKeys.digitalOcean || '',
      suno: settings?.apiKeys.suno || '',
      plaid: settings?.apiKeys.plaid || '',
      plaidSecret: settings?.apiKeys.plaidSecret || '',
      xApiKey: settings?.apiKeys.xApiKey || '',
      xApiSecret: settings?.apiKeys.xApiSecret || '',
      xAccessToken: settings?.apiKeys.xAccessToken || '',
      xAccessTokenSecret: settings?.apiKeys.xAccessTokenSecret || '',
    })
    setLocalClientIds({
      googledrive: settings?.oauthClientIds.googledrive || '',
      onedrive: settings?.oauthClientIds.onedrive || '',
      github: settings?.oauthClientIds.github || '',
      dropbox: settings?.oauthClientIds.dropbox || '',
    })
    setLocalClientSecrets({
      googledrive: settings?.oauthClientSecrets.googledrive || '',
      onedrive: settings?.oauthClientSecrets.onedrive || '',
      github: settings?.oauthClientSecrets.github || '',
      dropbox: settings?.oauthClientSecrets.dropbox || '',
    })
  }, [settings])

  const handleSaveApiKeys = () => {
    setSettings((current) => ({
      ...current!,
      apiKeys: localApiKeys,
    }))
    toast.success('API keys saved securely')
  }

  const handleSaveOAuthCredentials = () => {
    setSettings((current) => ({
      ...current!,
      oauthClientIds: localClientIds,
      oauthClientSecrets: localClientSecrets,
    }))
    toast.success('OAuth credentials saved securely')
  }

  const handleOAuthConnect = (provider: OAuthCloudProvider) => {
    const clientId = localClientIds[provider]
    const clientSecret = localClientSecrets[provider]

    if (!clientId || !clientSecret) {
      toast.error(`Please enter ${provider} Client ID and Client Secret first`)
      return
    }

    setSettings((current) => ({
      ...current!,
      oauthClientIds: localClientIds,
      oauthClientSecrets: localClientSecrets,
    }))

    const authUrl = buildAuthUrl(provider, clientId)
    if (!authUrl) {
      toast.error(`Failed to generate auth URL for ${provider}`)
      return
    }

    toast.info(`Redirecting to ${provider} authorization...`)
    
    setTimeout(() => {
      window.location.href = authUrl
    }, 500)
  }

  const handleDisconnect = (provider: 'googledrive' | 'onedrive' | 'github' | 'dropbox') => {
    setSettings((current) => ({
      ...current!,
      connectedServices: {
        ...current!.connectedServices,
        [provider]: false,
      },
      oauthTokens: {
        ...current!.oauthTokens,
        [provider]: undefined,
      },
    }))
    toast.info(`${provider} disconnected`)
  }

  const getConnectionStatus = (provider: 'googledrive' | 'onedrive' | 'github' | 'dropbox') => {
    const isConnected = settings?.connectedServices?.[provider]
    const token = settings?.oauthTokens?.[provider]

    if (!isConnected || !token) {
      return { status: 'disconnected', label: 'Not Connected', icon: XCircle, color: 'text-muted-foreground' }
    }

    if (isTokenExpired(token)) {
      return { status: 'expired', label: 'Token Expired', icon: Warning, color: 'text-amber-500' }
    }

    return { status: 'connected', label: 'Connected', icon: CheckCircle, color: 'text-green-500' }
  }

  const maskApiKey = (key: string) => {
    if (!key) return ''
    if (key.length <= 8) return '•'.repeat(key.length)
    return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4)
  }

  // ── Voice Library State ──
  const [voiceSearch, setVoiceSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    public_owner_id: string
    voice_id: string
    name: string
    accent?: string
    gender?: string
    age?: string
    descriptive?: string
    use_case?: string
    category?: string
    language?: string
    description?: string
    preview_url?: string
  }>>([])
  const [myVoices, setMyVoices] = useState<Array<{
    voice_id: string
    name: string
    category?: string
    labels?: Record<string, string>
    preview_url?: string
    description?: string
  }>>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [myVoicesLoaded, setMyVoicesLoaded] = useState(false)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [addingVoiceName, setAddingVoiceName] = useState('')
  const [addingVoiceId, setAddingVoiceId] = useState<string | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const registeredVoices: VoiceProfile[] = settings?.voiceRegistry?.voices ?? []
  const defaultVoiceId = settings?.voiceRegistry?.defaultVoiceId ?? null

  const loadMyVoices = useCallback(async () => {
    if (myVoicesLoaded) return
    try {
      const el = settings?.apiKeys?.elevenLabs?.trim()
      const res = await fetch('/api/elevenlabs/my-voices', {
        headers: el ? { 'xi-api-key': el } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setMyVoices(data.voices ?? [])
        setMyVoicesLoaded(true)
      }
    } catch (e) {
      console.warn('Failed to load ElevenLabs voices:', e)
    }
  }, [myVoicesLoaded, settings?.apiKeys?.elevenLabs])

  const searchSharedVoices = useCallback(async (query: string) => {
    setVoicesLoading(true)
    try {
      const params = new URLSearchParams({ page_size: '20' })
      if (query.trim()) params.set('search', query.trim())
      const el = settings?.apiKeys?.elevenLabs?.trim()
      const res = await fetch(`/api/elevenlabs/voices?${params}`, {
        headers: el ? { 'xi-api-key': el } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.voices ?? [])
      }
    } catch (e) {
      console.warn('Failed to search shared voices:', e)
    } finally {
      setVoicesLoading(false)
    }
  }, [settings?.apiKeys?.elevenLabs])

  const handleVoiceSearchChange = useCallback((value: string) => {
    setVoiceSearch(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchSharedVoices(value), 400)
  }, [searchSharedVoices])

  const previewVoice = useCallback((previewUrl: string | undefined, voiceId: string) => {
    if (!previewUrl) return
    if (previewAudio) {
      previewAudio.pause()
      previewAudio.src = ''
    }
    if (previewingId === voiceId) {
      setPreviewingId(null)
      setPreviewAudio(null)
      return
    }
    const audio = new Audio(previewUrl)
    audio.onended = () => { setPreviewingId(null); setPreviewAudio(null) }
    audio.play().catch(() => toast.error('Could not play preview'))
    setPreviewAudio(audio)
    setPreviewingId(voiceId)
  }, [previewAudio, previewingId])

  const addVoiceToSettings = useCallback((voiceId: string, name: string, elVoiceId: string, description?: string, previewUrl?: string) => {
    const profile: VoiceProfile = {
      id: voiceId,
      name: name || 'Unnamed',
      elevenLabsVoiceId: elVoiceId,
      description,
      previewUrl,
    }
    setSettings((current) => {
      const reg = current?.voiceRegistry ?? { defaultVoiceId: null, voices: [] }
      const existing = reg.voices.findIndex(v => v.id === profile.id)
      const voices = [...reg.voices]
      if (existing >= 0) voices[existing] = profile
      else voices.push(profile)
      return { ...current!, voiceRegistry: { ...reg, voices } }
    })
    toast.success(`"${name}" added to voice library`)
    setAddingVoiceId(null)
    setAddingVoiceName('')
  }, [setSettings])

  const removeVoiceFromSettings = useCallback((profileId: string) => {
    setSettings((current) => {
      const reg = current?.voiceRegistry ?? { defaultVoiceId: null, voices: [] }
      return {
        ...current!,
        voiceRegistry: {
          defaultVoiceId: reg.defaultVoiceId === profileId ? null : reg.defaultVoiceId,
          voices: reg.voices.filter(v => v.id !== profileId),
        },
      }
    })
    toast.info('Voice removed')
  }, [setSettings])

  const setDefaultVoiceInSettings = useCallback((profileId: string | null) => {
    setSettings((current) => ({
      ...current!,
      voiceRegistry: {
        ...(current?.voiceRegistry ?? { defaultVoiceId: null, voices: [] }),
        defaultVoiceId: profileId,
      },
    }))
    toast.success(profileId ? 'Default voice updated' : 'Default voice cleared')
  }, [setSettings])

  const cloudServices = [
    {
      id: 'googledrive' as const,
      name: 'Google Drive',
      description: 'Access files from your Google Drive',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    {
      id: 'onedrive' as const,
      name: 'OneDrive',
      description: 'Access files from your OneDrive',
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10',
      docsUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    },
    {
      id: 'github' as const,
      name: 'GitHub',
      description: 'Access repositories and files from GitHub',
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      docsUrl: 'https://github.com/settings/developers',
    },
    {
      id: 'dropbox' as const,
      name: 'Dropbox',
      description: 'Access files from your Dropbox account',
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      docsUrl: 'https://www.dropbox.com/developers/apps',
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Settings</DialogTitle>
          <DialogDescription>
            Manage your API keys and cloud storage connections
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api-keys" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="api-keys" className="gap-2">
              <Key size={16} />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="voices" className="gap-2">
              <Microphone size={16} />
              Voices
            </TabsTrigger>
            <TabsTrigger value="desktop" className="gap-2">
              <Monitor size={16} />
              Desktop
            </TabsTrigger>
            <TabsTrigger value="oauth" className="gap-2">
              <CloudArrowUp size={16} />
              OAuth
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="flex-1 overflow-y-auto space-y-6 mt-4">
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Key className="text-primary" size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">DigitalOcean Spaces</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Store and manage uploaded files in DigitalOcean Spaces
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="digitalocean-key">Access Key</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, digitalOcean: !prev.digitalOcean }))
                      }
                    >
                      {showKeys.digitalOcean ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="digitalocean-key"
                    type={showKeys.digitalOcean ? 'text' : 'password'}
                    placeholder="Enter your DigitalOcean Spaces access key"
                    value={localApiKeys.digitalOcean}
                    onChange={(e) =>
                      setLocalApiKeys((prev) => ({ ...prev, digitalOcean: e.target.value }))
                    }
                  />
                  {localApiKeys.digitalOcean && !showKeys.digitalOcean && (
                    <p className="text-xs text-muted-foreground">
                      Current key: {maskApiKey(localApiKeys.digitalOcean)}
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="suno-key">Suno API Key</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, suno: !prev.suno }))
                      }
                    >
                      {showKeys.suno ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="suno-key"
                    type={showKeys.suno ? 'text' : 'password'}
                    placeholder="Enter your Suno API key for music generation"
                    value={localApiKeys.suno}
                    onChange={(e) =>
                      setLocalApiKeys((prev) => ({ ...prev, suno: e.target.value }))
                    }
                  />
                  {localApiKeys.suno && !showKeys.suno && (
                    <p className="text-xs text-muted-foreground">
                      Current key: {maskApiKey(localApiKeys.suno)}
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <h3 className="font-semibold text-base">Plaid — Bank Connection</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your bank account so Jarvis can provide financial advice based on your income and spending.
                </p>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="plaid-client-id">Plaid Client ID</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, plaid: !prev.plaid }))}>
                      {showKeys.plaid ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="plaid-client-id"
                    type={showKeys.plaid ? 'text' : 'password'}
                    placeholder="Enter your Plaid Client ID"
                    value={localApiKeys.plaid}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, plaid: e.target.value }))}
                  />
                  {localApiKeys.plaid && !showKeys.plaid && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.plaid)}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <Label htmlFor="plaid-secret">Plaid Secret</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, plaidSecret: !prev.plaidSecret }))}>
                      {showKeys.plaidSecret ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="plaid-secret"
                    type={showKeys.plaidSecret ? 'text' : 'password'}
                    placeholder="Enter your Plaid Secret"
                    value={localApiKeys.plaidSecret}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, plaidSecret: e.target.value }))}
                  />
                  {localApiKeys.plaidSecret && !showKeys.plaidSecret && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.plaidSecret)}</p>
                  )}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Bank Account</p>
                    <p className="text-xs text-muted-foreground">
                      {settings?.plaidAccessToken ? 'Connected — Jarvis can access your financial data.' : 'Not connected yet.'}
                    </p>
                  </div>
                  {settings?.plaidAccessToken ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      <span className="text-sm text-green-500 font-medium">Connected</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSettings((prev) => ({ ...prev, plaidAccessToken: undefined }))
                          toast.success('Bank account disconnected')
                        }}
                      >
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <PlaidLinkButton
                      disabled={!localApiKeys.plaid || !localApiKeys.plaidSecret}
                      onSuccess={(accessToken) => {
                        setSettings((prev) => ({ ...prev, plaidAccessToken: accessToken }))
                      }}
                    />
                  )}
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <h3 className="font-semibold text-base">X (Twitter) — Social Posting</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your X developer account so Jarvis can post tweets, reply to threads, and schedule posts.
                  Get API keys at <a href="https://developer.twitter.com/en/portal/dashboard" className="underline" target="_blank" rel="noreferrer">developer.twitter.com</a>.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-api-key">API Key</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, xApiKey: !prev.xApiKey }))}>
                      {showKeys.xApiKey ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="x-api-key"
                    type={showKeys.xApiKey ? 'text' : 'password'}
                    placeholder="Enter your X API Key"
                    value={localApiKeys.xApiKey}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, xApiKey: e.target.value }))}
                  />
                  {localApiKeys.xApiKey && !showKeys.xApiKey && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.xApiKey)}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-api-secret">API Secret</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, xApiSecret: !prev.xApiSecret }))}>
                      {showKeys.xApiSecret ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="x-api-secret"
                    type={showKeys.xApiSecret ? 'text' : 'password'}
                    placeholder="Enter your X API Secret"
                    value={localApiKeys.xApiSecret}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, xApiSecret: e.target.value }))}
                  />
                  {localApiKeys.xApiSecret && !showKeys.xApiSecret && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.xApiSecret)}</p>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-access-token">Access Token</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, xAccessToken: !prev.xAccessToken }))}>
                      {showKeys.xAccessToken ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="x-access-token"
                    type={showKeys.xAccessToken ? 'text' : 'password'}
                    placeholder="Enter your X Access Token"
                    value={localApiKeys.xAccessToken}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, xAccessToken: e.target.value }))}
                  />
                  {localApiKeys.xAccessToken && !showKeys.xAccessToken && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.xAccessToken)}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-access-token-secret">Access Token Secret</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowKeys((prev) => ({ ...prev, xAccessTokenSecret: !prev.xAccessTokenSecret }))}>
                      {showKeys.xAccessTokenSecret ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Input
                    id="x-access-token-secret"
                    type={showKeys.xAccessTokenSecret ? 'text' : 'password'}
                    placeholder="Enter your X Access Token Secret"
                    value={localApiKeys.xAccessTokenSecret}
                    onChange={(e) => setLocalApiKeys((prev) => ({ ...prev, xAccessTokenSecret: e.target.value }))}
                  />
                  {localApiKeys.xAccessTokenSecret && !showKeys.xAccessTokenSecret && (
                    <p className="text-xs text-muted-foreground">Current: {maskApiKey(localApiKeys.xAccessTokenSecret)}</p>
                  )}
                </div>
                {localApiKeys.xApiKey && localApiKeys.xAccessToken && (
                  <p className="text-sm text-emerald-500">X credentials configured — Jarvis can post tweets and replies.</p>
                )}
              </Card>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveApiKeys}>Save API Keys</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="voices" className="flex-1 overflow-y-auto space-y-6 mt-4">
            <div className="space-y-6">
              {/* My Voice Library */}
              <Card className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Microphone className="text-emerald-500" size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">My Voice Library</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Voices registered for Jarvis to use during conversations, impersonations, and storytelling.
                    </p>
                  </div>
                </div>
                <Separator />

                {registeredVoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No voices added yet. Browse the ElevenLabs library below to add voices.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {registeredVoices.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Microphone size={14} className="text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{v.name}</span>
                              {defaultVoiceId === v.id && (
                                <Badge variant="default" className="text-xs">Default</Badge>
                              )}
                            </div>
                            {v.description && (
                              <p className="text-xs text-muted-foreground">{v.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {v.previewUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => previewVoice(v.previewUrl!, v.id)}
                            >
                              {previewingId === v.id ? <Stop size={14} /> : <Play size={14} />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultVoiceInSettings(defaultVoiceId === v.id ? null : v.id)}
                            title={defaultVoiceId === v.id ? 'Remove as default' : 'Set as default Jarvis voice'}
                          >
                            <Star size={14} weight={defaultVoiceId === v.id ? 'fill' : 'regular'} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVoiceFromSettings(v.id)}
                          >
                            <Trash size={14} className="text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* My ElevenLabs Voices */}
              <Card className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-violet-500/10 rounded-lg">
                      <Microphone className="text-violet-500" size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">My ElevenLabs Voices</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your personal and cloned voices from ElevenLabs.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={loadMyVoices} disabled={myVoicesLoaded}>
                    {myVoicesLoaded ? 'Loaded' : 'Load Voices'}
                  </Button>
                </div>
                <Separator />

                {myVoices.length === 0 && myVoicesLoaded && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No personal voices found. Create voices in your ElevenLabs dashboard.
                  </p>
                )}

                {myVoices.length > 0 && (
                  <div className="grid gap-2">
                    {myVoices.map((v) => {
                      const alreadyAdded = registeredVoices.some(rv => rv.elevenLabsVoiceId === v.voice_id)
                      return (
                        <div key={v.voice_id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="font-medium text-sm">{v.name}</span>
                              {v.category && <span className="text-xs text-muted-foreground ml-2">({v.category})</span>}
                              {v.description && <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {v.preview_url && (
                              <Button variant="ghost" size="sm" onClick={() => previewVoice(v.preview_url!, v.voice_id)}>
                                {previewingId === v.voice_id ? <Stop size={14} /> : <Play size={14} />}
                              </Button>
                            )}
                            {(() => {
                              if (alreadyAdded) {
                                return <Badge variant="outline" className="text-xs">Added</Badge>
                              }
                              if (addingVoiceId === v.voice_id) {
                                return (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      className="h-7 w-32 text-xs"
                                      placeholder="Display name"
                                      value={addingVoiceName}
                                      onChange={(e) => setAddingVoiceName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && addingVoiceName.trim()) {
                                          addVoiceToSettings(v.voice_id, addingVoiceName.trim(), v.voice_id, v.description, v.preview_url)
                                        }
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 px-2"
                                      disabled={!addingVoiceName.trim()}
                                      onClick={() => addVoiceToSettings(v.voice_id, addingVoiceName.trim(), v.voice_id, v.description, v.preview_url)}
                                    >
                                      <Plus size={12} />
                                    </Button>
                                  </div>
                                )
                              }
                              return (
                                <Button variant="outline" size="sm" onClick={() => { setAddingVoiceId(v.voice_id); setAddingVoiceName(v.name) }}>
                                  <Plus size={14} className="mr-1" /> Add
                                </Button>
                              )
                            })()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* Browse ElevenLabs Library */}
              <Card className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <MagnifyingGlass className="text-blue-500" size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Browse ElevenLabs Library</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Search thousands of community voices for impersonations and characters.
                    </p>
                  </div>
                </div>
                <Separator />

                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    className="pl-9"
                    placeholder="Search voices (e.g. narrator, deep male, British accent...)"
                    value={voiceSearch}
                    onChange={(e) => handleVoiceSearchChange(e.target.value)}
                    onFocus={() => { if (searchResults.length === 0) searchSharedVoices('') }}
                  />
                </div>

                {voicesLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
                )}

                {searchResults.length > 0 && (
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                    {searchResults.map((v) => {
                      const alreadyAdded = registeredVoices.some(rv => rv.elevenLabsVoiceId === v.voice_id)
                      const tags = [v.gender, v.age, v.accent, v.language].filter(Boolean)
                      return (
                        <div key={v.voice_id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{v.name}</span>
                              {tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                            {v.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            {v.preview_url && (
                              <Button variant="ghost" size="sm" onClick={() => previewVoice(v.preview_url!, v.voice_id)}>
                                {previewingId === v.voice_id ? <Stop size={14} /> : <Play size={14} />}
                              </Button>
                            )}
                            {(() => {
                              if (alreadyAdded) {
                                return <Badge variant="outline" className="text-xs">Added</Badge>
                              }
                              if (addingVoiceId === v.voice_id) {
                                return (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      className="h-7 w-28 text-xs"
                                      placeholder="Display name"
                                      value={addingVoiceName}
                                      onChange={(e) => setAddingVoiceName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && addingVoiceName.trim()) {
                                          addVoiceToSettings(v.voice_id, addingVoiceName.trim(), v.voice_id, v.description, v.preview_url)
                                        }
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 px-2"
                                      disabled={!addingVoiceName.trim()}
                                      onClick={() => addVoiceToSettings(v.voice_id, addingVoiceName.trim(), v.voice_id, v.description, v.preview_url)}
                                    >
                                      <Plus size={12} />
                                    </Button>
                                  </div>
                                )
                              }
                              return (
                                <Button variant="outline" size="sm" onClick={() => { setAddingVoiceId(v.voice_id); setAddingVoiceName(v.name) }}>
                                  <Plus size={14} />
                                </Button>
                              )
                            })()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* Voice Analysis */}
              <Card className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">Voice Analysis</h3>
                    <p className="text-xs text-muted-foreground">
                      Analyse your voice in real time during voice mode. Jarvis will be aware of your vocal state
                      (emotion, speaking rate, pitch) and adapt his responses accordingly.
                      Requires the Python voice analysis service running on port 5199.
                    </p>
                  </div>
                  <Switch
                    checked={settings?.enableVoiceAnalysis ?? false}
                    onCheckedChange={(checked) => {
                      setSettings((prev) => ({ ...prev, enableVoiceAnalysis: checked }))
                    }}
                  />
                </div>
              </Card>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="desktop" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <Card className="p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Monitor className="text-primary" size={22} />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-lg">Desktop automation</h3>
                  <p className="text-sm text-muted-foreground">
                    Controls for the Jarvis desktop app: screen-aware tips, voice during browser tasks, and OS-level tools
                    (mouse, keyboard, PowerShell). Requires <code className="text-xs bg-muted px-1 rounded">npm run desktop</code>.
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="proactive-vision">Proactive vision</Label>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Periodically analyze your screen (30s+ between runs) and surface brief suggestions when something stands out.
                  </p>
                </div>
                <Switch
                  id="proactive-vision"
                  checked={settings?.proactiveVision ?? false}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, proactiveVision: checked }))}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>Voice during browser tasks</Label>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Copilot: short spoken line per action. Guide: speaks the model&apos;s narration. Off: silent.
                  </p>
                </div>
                <Select
                  value={settings?.voiceGuidanceMode ?? 'copilot'}
                  onValueChange={(value: 'copilot' | 'guide' | 'off') =>
                    setSettings((prev) => ({ ...prev, voiceGuidanceMode: value }))
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copilot">Copilot</SelectItem>
                    <SelectItem value="guide">Guide</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="native-control">Allow native OS control in chat</Label>
                  <p className="text-xs text-muted-foreground max-w-md">
                    When off, mouse, screen capture, clipboard, and PowerShell tools are hidden from the text agent (safer).
                  </p>
                </div>
                <Switch
                  id="native-control"
                  checked={settings?.nativeControlEnabled !== false}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, nativeControlEnabled: checked }))}
                />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="oauth" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="p-4 bg-accent/50 rounded-lg flex items-start gap-3">
              <Warning className="text-accent-foreground flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                <p className="font-medium">OAuth Setup Required</p>
                <p className="text-muted-foreground mt-1">
                  To connect cloud services, you need to create OAuth applications and provide Client ID and Client Secret for each service. These credentials allow secure access to your files.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {cloudServices.map((service) => {
                const status = getConnectionStatus(service.id)
                const StatusIcon = status.icon

                return (
                  <Card key={service.id} className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 ${service.bgColor} rounded-lg`}>
                          <CloudArrowUp className={service.color} size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{service.name}</h3>
                            <Badge variant={status.status === 'connected' ? 'default' : 'outline'} className={status.color}>
                              <StatusIcon size={14} className="mr-1" weight="fill" />
                              {status.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {service.description}
                          </p>
                          <a
                            href={service.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                          >
                            <LinkIcon size={12} />
                            Get OAuth credentials
                          </a>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`${service.id}-client-id`}>Client ID</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setShowKeys((prev) => ({ ...prev, [service.id]: !prev[service.id] }))
                            }
                          >
                            {showKeys[service.id] ? 'Hide' : 'Show'}
                          </Button>
                        </div>
                        <Input
                          id={`${service.id}-client-id`}
                          type={showKeys[service.id] ? 'text' : 'password'}
                          placeholder="Enter Client ID"
                          value={localClientIds[service.id]}
                          onChange={(e) =>
                            setLocalClientIds((prev) => ({ ...prev, [service.id]: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`${service.id}-client-secret`}>Client Secret</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setShowSecrets((prev) => ({ ...prev, [service.id]: !prev[service.id] }))
                            }
                          >
                            {showSecrets[service.id] ? 'Hide' : 'Show'}
                          </Button>
                        </div>
                        <Input
                          id={`${service.id}-client-secret`}
                          type={showSecrets[service.id] ? 'text' : 'password'}
                          placeholder="Enter Client Secret"
                          value={localClientSecrets[service.id]}
                          onChange={(e) =>
                            setLocalClientSecrets((prev) => ({ ...prev, [service.id]: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      {status.status === 'connected' || status.status === 'expired' ? (
                        <>
                          {status.status === 'expired' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOAuthConnect(service.id)}
                            >
                              Reconnect
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDisconnect(service.id)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleOAuthConnect(service.id)}
                          disabled={!localClientIds[service.id] || !localClientSecrets[service.id]}
                        >
                          Connect with OAuth
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}

              <Card className="p-6 border-dashed border-muted-foreground/30">
                <div className="flex items-center justify-between opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <CloudArrowUp className="text-purple-500" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold">Cursor IDE</h3>
                      <p className="text-sm text-muted-foreground">
                        Direct integration with Cursor (Coming soon)
                      </p>
                    </div>
                  </div>
                  <Button size="sm" disabled>
                    Coming Soon
                  </Button>
                </div>
              </Card>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button onClick={handleSaveOAuthCredentials}>Save OAuth Credentials</Button>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3">
              <Warning className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                <p className="font-medium">About OAuth Connections</p>
                <p className="text-muted-foreground mt-1">
                  OAuth credentials and tokens are stored securely in your browser. The redirect URI for OAuth callbacks should be set to: <code className="bg-muted px-1 rounded">{window.location.origin}/oauth/callback</code>
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
