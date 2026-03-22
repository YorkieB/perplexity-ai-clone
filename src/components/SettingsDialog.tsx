import { useState, useEffect } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings, DEFAULT_USER_SETTINGS } from '@/lib/types'
import { buildAuthUrl, isTokenExpired } from '@/lib/oauth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Key,
  CloudArrowUp,
  Link as LinkIcon,
  CheckCircle,
  Warning,
  XCircle,
  Globe,
  NotePencil,
  ShieldWarning,
} from '@phosphor-icons/react'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClearAllThreads: () => void
  onClearAllWorkspaces: () => void
}

export function SettingsDialog({ open, onOpenChange, onClearAllThreads, onClearAllWorkspaces }: SettingsDialogProps) {
  const [settings, setSettings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)

  const [localApiKeys, setLocalApiKeys] = useState({
    digitalOcean: settings?.apiKeys.digitalOcean || '',
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

  const [localAnswerInstructions, setLocalAnswerInstructions] = useState({
    answerRole: '',
    answerTone: '',
    answerStructure: '',
    answerConstraints: '',
  })

  useEffect(() => {
    setLocalApiKeys({
      digitalOcean: settings?.apiKeys.digitalOcean || '',
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
    setLocalAnswerInstructions({
      answerRole: settings?.answerRole ?? '',
      answerTone: settings?.answerTone ?? '',
      answerStructure: settings?.answerStructure ?? '',
      answerConstraints: settings?.answerConstraints ?? '',
    })
  }, [settings])

  const handleSaveAnswerInstructions = () => {
    setSettings((current) => ({
      ...current!,
      answerRole: localAnswerInstructions.answerRole.trim() || undefined,
      answerTone: localAnswerInstructions.answerTone.trim() || undefined,
      answerStructure: localAnswerInstructions.answerStructure.trim() || undefined,
      answerConstraints: localAnswerInstructions.answerConstraints.trim() || undefined,
    }))
    toast.success('Answer instructions saved')
  }

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

  const handleOAuthConnect = (provider: 'googledrive' | 'onedrive' | 'github' | 'dropbox') => {
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
            API keys, assistant defaults, OAuth, and privacy controls
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api-keys" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 h-auto p-1">
            <TabsTrigger value="api-keys" className="gap-1.5 text-xs sm:text-sm px-2">
              <Key size={16} className="shrink-0" />
              <span className="truncate">API Keys</span>
            </TabsTrigger>
            <TabsTrigger value="oauth" className="gap-1.5 text-xs sm:text-sm px-2">
              <CloudArrowUp size={16} className="shrink-0" />
              <span className="truncate">OAuth</span>
            </TabsTrigger>
            <TabsTrigger value="assistant" className="gap-1.5 text-xs sm:text-sm px-2">
              <NotePencil size={16} className="shrink-0" />
              <span className="truncate">Assistant</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5 text-xs sm:text-sm px-2">
              <ShieldWarning size={16} className="shrink-0" />
              <span className="truncate">Privacy</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="flex-1 overflow-y-auto space-y-6 mt-4">
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <Globe className="text-accent" size={20} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">Include web in answers</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        When on, the app runs web search (Tavily) before answering. When off, answers use your workspace instructions, chat history, attached files, and the model&apos;s knowledge only.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                      <Label htmlFor="settings-include-web" className="cursor-pointer text-sm font-medium">
                        Include web search
                      </Label>
                      <Switch
                        id="settings-include-web"
                        checked={settings?.includeWebSearch !== false}
                        onCheckedChange={(checked) =>
                          setSettings((current) => ({
                            ...(current ?? DEFAULT_USER_SETTINGS),
                            includeWebSearch: checked,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </Card>

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

          <TabsContent value="assistant" className="flex-1 overflow-y-auto space-y-6 mt-4">
            <Card className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <NotePencil className="text-primary" size={20} />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-lg">Answer instructions</h3>
                  <p className="text-sm text-muted-foreground">
                    Global defaults for how the assistant behaves. Applied before workspace-specific prompts. Leave fields empty to skip.
                  </p>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="answer-role">Role</Label>
                  <Textarea
                    id="answer-role"
                    placeholder="e.g. You are a careful technical writer…"
                    value={localAnswerInstructions.answerRole}
                    onChange={(e) =>
                      setLocalAnswerInstructions((p) => ({ ...p, answerRole: e.target.value }))
                    }
                    className="min-h-[72px] resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="answer-tone">Tone</Label>
                  <Textarea
                    id="answer-tone"
                    placeholder="e.g. Neutral, concise, friendly…"
                    value={localAnswerInstructions.answerTone}
                    onChange={(e) =>
                      setLocalAnswerInstructions((p) => ({ ...p, answerTone: e.target.value }))
                    }
                    className="min-h-[72px] resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="answer-structure">Structure</Label>
                  <Textarea
                    id="answer-structure"
                    placeholder="e.g. Use headings, lead with a summary…"
                    value={localAnswerInstructions.answerStructure}
                    onChange={(e) =>
                      setLocalAnswerInstructions((p) => ({ ...p, answerStructure: e.target.value }))
                    }
                    className="min-h-[72px] resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="answer-constraints">Constraints</Label>
                  <Textarea
                    id="answer-constraints"
                    placeholder="Always / never rules, length limits, formatting…"
                    value={localAnswerInstructions.answerConstraints}
                    onChange={(e) =>
                      setLocalAnswerInstructions((p) => ({ ...p, answerConstraints: e.target.value }))
                    }
                    className="min-h-[96px] resize-y"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button onClick={handleSaveAnswerInstructions}>Save answer instructions</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="flex-1 overflow-y-auto space-y-6 mt-4">
            <Card className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <ShieldWarning className="text-destructive" size={20} />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-lg">Local data</h3>
                  <p className="text-sm text-muted-foreground">
                    Conversations and workspaces are stored in this browser. These actions cannot be undone.
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col sm:flex-row gap-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto">
                      Clear all conversations
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all conversations?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes every chat thread stored on this device. Your current selection will be cleared.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => onClearAllThreads()}
                      >
                        Clear conversations
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto">
                      Clear all workspaces
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all workspaces?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes every workspace and its custom instructions stored on this device.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => onClearAllWorkspaces()}
                      >
                        Clear workspaces
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
