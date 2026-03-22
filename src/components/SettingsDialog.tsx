import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { UserSettings } from '@/lib/types'
import { buildAuthUrl, isTokenExpired } from '@/lib/oauth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Key, CloudArrowUp, Link as LinkIcon, CheckCircle, Warning, XCircle } from '@phosphor-icons/react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useKV<UserSettings>('user-settings', {
    apiKeys: {},
    oauthTokens: {},
    oauthClientIds: {},
    oauthClientSecrets: {},
    connectedServices: {
      googleDrive: false,
      oneDrive: false,
      github: false,
      dropbox: false,
    },
  })

  const [localApiKeys, setLocalApiKeys] = useState({
    digitalOcean: settings?.apiKeys.digitalOcean || '',
  })

  const [localClientIds, setLocalClientIds] = useState({
    googleDrive: settings?.oauthClientIds.googleDrive || '',
    oneDrive: settings?.oauthClientIds.oneDrive || '',
    github: settings?.oauthClientIds.github || '',
    dropbox: settings?.oauthClientIds.dropbox || '',
  })

  const [localClientSecrets, setLocalClientSecrets] = useState({
    googleDrive: settings?.oauthClientSecrets.googleDrive || '',
    oneDrive: settings?.oauthClientSecrets.oneDrive || '',
    github: settings?.oauthClientSecrets.github || '',
    dropbox: settings?.oauthClientSecrets.dropbox || '',
  })

  const [showKeys, setShowKeys] = useState({
    digitalOcean: false,
    googleDrive: false,
    oneDrive: false,
    github: false,
    dropbox: false,
  })

  const [showSecrets, setShowSecrets] = useState({
    googleDrive: false,
    oneDrive: false,
    github: false,
    dropbox: false,
  })

  useEffect(() => {
    setLocalApiKeys({
      digitalOcean: settings?.apiKeys.digitalOcean || '',
    })
    setLocalClientIds({
      googleDrive: settings?.oauthClientIds.googleDrive || '',
      oneDrive: settings?.oauthClientIds.oneDrive || '',
      github: settings?.oauthClientIds.github || '',
      dropbox: settings?.oauthClientIds.dropbox || '',
    })
    setLocalClientSecrets({
      googleDrive: settings?.oauthClientSecrets.googleDrive || '',
      oneDrive: settings?.oauthClientSecrets.oneDrive || '',
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

  const handleOAuthConnect = (provider: 'googleDrive' | 'oneDrive' | 'github' | 'dropbox') => {
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

  const handleDisconnect = (provider: 'googleDrive' | 'oneDrive' | 'github' | 'dropbox') => {
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

  const getConnectionStatus = (provider: 'googleDrive' | 'oneDrive' | 'github' | 'dropbox') => {
    const isConnected = settings?.connectedServices[provider]
    const token = settings?.oauthTokens[provider]

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

  const cloudServices = [
    {
      id: 'googleDrive' as const,
      name: 'Google Drive',
      description: 'Access files from your Google Drive',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    {
      id: 'oneDrive' as const,
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys" className="gap-2">
              <Key size={16} />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="oauth" className="gap-2">
              <CloudArrowUp size={16} />
              OAuth Connections
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

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveApiKeys}>Save API Keys</Button>
              </div>
            </div>
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
