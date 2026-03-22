import { useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings, CloudFile, DEFAULT_USER_SETTINGS } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  CloudArrowDown,
  Folder,
  FileText,
  MagnifyingGlass,
  CheckCircle
} from '@phosphor-icons/react'

interface CloudFileBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectFiles: (files: CloudFile[]) => void
}

export function CloudFileBrowser({ open, onOpenChange, onSelectFiles }: CloudFileBrowserProps) {
  const [settings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)

  const connectedServicesData = settings?.connectedServices ?? {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
  }

  const [activeService, setActiveService] = useState<'googledrive' | 'onedrive' | 'github' | 'dropbox' | null>(null)
  const [files, setFiles] = useState<CloudFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const connectedServices = [
    {
      id: 'googledrive' as const,
      name: 'Google Drive',
      icon: CloudArrowDown,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      connected: connectedServicesData.googledrive,
    },
    {
      id: 'onedrive' as const,
      name: 'OneDrive',
      icon: CloudArrowDown,
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10',
      connected: connectedServicesData.onedrive,
    },
    {
      id: 'github' as const,
      name: 'GitHub',
      icon: CloudArrowDown,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      connected: connectedServicesData.github,
    },
    {
      id: 'dropbox' as const,
      name: 'Dropbox',
      icon: CloudArrowDown,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      connected: connectedServicesData.dropbox,
    },
  ]

  const handleLoadFiles = async (service: 'googledrive' | 'onedrive' | 'github' | 'dropbox') => {
    setIsLoading(true)
    setActiveService(service)
    
    setTimeout(() => {
      const mockFiles: CloudFile[] = [
        {
          id: '1',
          name: 'Research Notes.txt',
          type: 'text/plain',
          size: 15420,
          source: service,
          path: '/Documents/Research Notes.txt',
          modifiedAt: Date.now() - 86400000,
        },
        {
          id: '2',
          name: 'Project Proposal.pdf',
          type: 'application/pdf',
          size: 524288,
          source: service,
          path: '/Documents/Project Proposal.pdf',
          modifiedAt: Date.now() - 172800000,
        },
        {
          id: '3',
          name: 'Data Analysis.csv',
          type: 'text/csv',
          size: 87654,
          source: service,
          path: '/Spreadsheets/Data Analysis.csv',
          modifiedAt: Date.now() - 259200000,
        },
      ]
      setFiles(mockFiles)
      setIsLoading(false)
      toast.success(`Loaded files from ${service}`)
    }, 1000)
  }

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) {
        newSet.delete(fileId)
      } else {
        newSet.add(fileId)
      }
      return newSet
    })
  }

  const handleImport = () => {
    const selectedFileObjects = files.filter((f) => selectedFiles.has(f.id))
    if (selectedFileObjects.length === 0) {
      toast.error('Please select at least one file')
      return
    }
    onSelectFiles(selectedFileObjects)
    toast.success(`${selectedFileObjects.length} file(s) imported`)
    onOpenChange(false)
  }

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Import from Cloud Storage</DialogTitle>
          <DialogDescription>
            Select files from your connected cloud services
          </DialogDescription>
        </DialogHeader>

        {!activeService && (
          <div className="py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {connectedServices.map((service) => (
                <button
                  key={service.id}
                  onClick={() => service.connected && handleLoadFiles(service.id)}
                  disabled={!service.connected}
                  className={`p-6 border rounded-lg transition-all ${
                    service.connected
                      ? 'hover:border-primary hover:bg-accent/50 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className={`p-4 rounded-full ${service.bgColor}`}>
                      <service.icon className={service.color} size={32} />
                    </div>
                    <h3 className="font-semibold">{service.name}</h3>
                    {service.connected ? (
                      <Badge variant="outline" className="text-green-500">
                        <CheckCircle size={14} className="mr-1" weight="fill" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not Connected</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {!connectedServices.some((s) => s.connected) && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  No cloud services connected. Go to Settings to connect your accounts.
                </p>
              </div>
            )}
          </div>
        )}

        {activeService && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setActiveService(null)}>
                ← Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Folder className="text-muted-foreground" size={16} />
                <span className="text-sm font-medium">
                  {connectedServices.find((s) => s.id === activeService)?.name}
                </span>
              </div>
            </div>

            <div className="relative">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={16}
              />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-muted-foreground">Loading files...</p>
                </div>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {filteredFiles.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <FileText size={48} className="mx-auto mb-3 opacity-50" />
                      <p>No files found</p>
                    </div>
                  ) : (
                    filteredFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => toggleFileSelection(file.id)}
                        className={`w-full p-4 border rounded-lg text-left transition-all hover:bg-accent/50 ${
                          selectedFiles.has(file.id) ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div
                              className={`p-2 rounded ${
                                selectedFiles.has(file.id) ? 'bg-primary/20' : 'bg-muted'
                              }`}
                            >
                              <FileText
                                size={20}
                                className={selectedFiles.has(file.id) ? 'text-primary' : ''}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{file.name}</h4>
                              <p className="text-xs text-muted-foreground mt-1">{file.path}</p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span>{formatFileSize(file.size)}</span>
                                <span>•</span>
                                <span>{formatDate(file.modifiedAt)}</span>
                              </div>
                            </div>
                          </div>
                          {selectedFiles.has(file.id) && (
                            <CheckCircle size={20} className="text-primary" weight="fill" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedFiles.size} file(s) selected
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={selectedFiles.size === 0}>
                  Import Selected
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
