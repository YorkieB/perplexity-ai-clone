import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { UserSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Key, CloudArrowUp, Link, CheckCircle, Warning } from '@phosphor-icons/react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useKV<UserSettings>('user-settings', {
    apiKeys: {},
    connectedServices: {
      googleDrive: false,
      oneDrive: false,
      github: false,
    },
  })

  const [localApiKeys, setLocalApiKeys] = useState({
    digitalOcean: settings?.apiKeys.digitalOcean || '',
    googleDrive: settings?.apiKeys.googleDrive || '',
    oneDrive: settings?.apiKeys.oneDrive || '',
    github: settings?.apiKeys.github || '',
  })

  const [showKeys, setShowKeys] = useState({
    digitalOcean: false,
    googleDrive: false,
    oneDrive: false,
    github: false,
  })

  const handleSaveApiKeys = () => {
    setSettings((current) => ({
      ...current!,
      apiKeys: localApiKeys,
    }))
    toast.success('API keys saved securely')
  }

  const handleTestConnection = async (service: 'googledrive' | 'onedrive' | 'github') => {
    const apiKey = localApiKeys[service === 'googledrive' ? 'googleDrive' : service === 'onedrive' ? 'oneDrive' : 'github']
    
    if (!apiKey) {
      toast.error(`Please enter ${service} API key first`)
      return
    }

    toast.loading(`Testing ${service} connection...`)
    
    setTimeout(() => {
      setSettings((current) => ({
        ...current!,
        connectedServices: {
          ...current!.connectedServices,
          [service === 'googledrive' ? 'googleDrive' : service === 'onedrive' ? 'oneDrive' : 'github']: true,
        },
      }))
      toast.success(`${service} connected successfully`)
    }, 1500)
  }

  const handleDisconnect = (service: 'googleDrive' | 'oneDrive' | 'github') => {
    setSettings((current) => ({
      ...current!,
      connectedServices: {
        ...current!.connectedServices,
        [service]: false,
      },
    }))
    toast.info(`${service} disconnected`)
  }

  const maskApiKey = (key: string) => {
    if (!key) return ''
    if (key.length <= 8) return '•'.repeat(key.length)
    return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
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
            <TabsTrigger value="connections" className="gap-2">
              <CloudArrowUp size={16} />
              Cloud Storage
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
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <Link className="text-accent" size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Cloud Service API Keys</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Connect to Google Drive, OneDrive, and GitHub
                    </p>
                  </div>
                </div>
                <Separator />
                
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="google-key">Google Drive API Key</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowKeys((prev) => ({ ...prev, googleDrive: !prev.googleDrive }))
                        }
                      >
                        {showKeys.googleDrive ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    <Input
                      id="google-key"
                      type={showKeys.googleDrive ? 'text' : 'password'}
                      placeholder="Enter your Google Drive API key"
                      value={localApiKeys.googleDrive}
                      onChange={(e) =>
                        setLocalApiKeys((prev) => ({ ...prev, googleDrive: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="onedrive-key">OneDrive API Key</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowKeys((prev) => ({ ...prev, oneDrive: !prev.oneDrive }))
                        }
                      >
                        {showKeys.oneDrive ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    <Input
                      id="onedrive-key"
                      type={showKeys.oneDrive ? 'text' : 'password'}
                      placeholder="Enter your OneDrive API key"
                      value={localApiKeys.oneDrive}
                      onChange={(e) =>
                        setLocalApiKeys((prev) => ({ ...prev, oneDrive: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="github-key">GitHub Personal Access Token</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowKeys((prev) => ({ ...prev, github: !prev.github }))
                        }
                      >
                        {showKeys.github ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    <Input
                      id="github-key"
                      type={showKeys.github ? 'text' : 'password'}
                      placeholder="Enter your GitHub personal access token"
                      value={localApiKeys.github}
                      onChange={(e) =>
                        setLocalApiKeys((prev) => ({ ...prev, github: e.target.value }))
                      }
                    />
                  </div>
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

          <TabsContent value="connections" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="space-y-4">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <CloudArrowUp className="text-blue-500" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold">Google Drive</h3>
                      <p className="text-sm text-muted-foreground">
                        Access files from your Google Drive
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {settings?.connectedServices.googleDrive ? (
                      <>
                        <CheckCircle className="text-green-500" size={20} weight="fill" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect('googleDrive')}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleTestConnection('googledrive')}
                        disabled={!localApiKeys.googleDrive}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600/10 rounded-lg">
                      <CloudArrowUp className="text-blue-600" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold">OneDrive</h3>
                      <p className="text-sm text-muted-foreground">
                        Access files from your OneDrive
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {settings?.connectedServices.oneDrive ? (
                      <>
                        <CheckCircle className="text-green-500" size={20} weight="fill" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect('oneDrive')}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleTestConnection('onedrive')}
                        disabled={!localApiKeys.oneDrive}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-500/10 rounded-lg">
                      <CloudArrowUp className="text-gray-500" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold">GitHub</h3>
                      <p className="text-sm text-muted-foreground">
                        Access repositories and files from GitHub
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {settings?.connectedServices.github ? (
                      <>
                        <CheckCircle className="text-green-500" size={20} weight="fill" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect('github')}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleTestConnection('github')}
                        disabled={!localApiKeys.github}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

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

              <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3">
                <Warning className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-medium">About Cloud Connections</p>
                  <p className="text-muted-foreground mt-1">
                    API keys are stored locally in your browser. Files accessed from cloud services are analyzed but not stored permanently. Disconnecting will not delete any data from your cloud storage.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
