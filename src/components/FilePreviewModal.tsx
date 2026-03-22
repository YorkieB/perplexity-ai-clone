import { UploadedFile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { X, DownloadSimple, FileText } from '@phosphor-icons/react'
  file: UploadedFile | null
  onOpenChange: (open: boolean) => void

  if (!file) return null
  file: UploadedFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FilePreviewModal({ file, open, onOpenChange }: FilePreviewModalProps) {
  if (!file) return null

  const isImage = file.type.startsWith('image/')
  const isText = file.type.startsWith('text/')
  const isPDF = file.type === 'application/pdf'

    }
    const link = document.createElement('a')
    link.href = file.content
    link.download = file.name
    document.body.appendChild(link)
    link.click()
            </pre>
  }

  const renderPreviewContent = () => {
    if (isImage) {
      return (
              PDF preview is not available in browser
            <B
              Download to view
          </div>
      )

      <div cla
       
     

        </div>
    )

    <Dialog open={open

            <d
              <div className="flex items-center gap-3 mt-2 text-sm
                <span>•</span>
              </div>
            <Button
              size
              className
              
       


          <Butto
          </Bu
            <DownloadSimple size={16} className="mr-2" />
          </Button>
      </DialogContent>
  )
              PDF preview is not available in browser



              Download to view

          </div>

      )











        </div>

    )











                <span>•</span>

              </div>

            <Button

















            <DownloadSimple size={16} className="mr-2" />

          </Button>

      </DialogContent>

  )

