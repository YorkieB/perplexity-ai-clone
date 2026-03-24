import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getA2eStreamingConsoleUrl } from '@/lib/a2e-streaming'
import {
  listAwsVideos,
  detectLanguage,
  setAutoPublicPool,
  getR2PresignedUrl,
  listCustomBackgrounds,
  addCustomBackground,
  deleteCustomBackground,
  addFaceSwapImage,
  listFaceSwapImages,
  continueVideoTwinTraining,
  quickAddAvatarFromT2I,
  startProductAvatar,
  addFaceSwapPreview,
  getFaceSwapPreviewStatus,
} from '@/lib/a2e-rest-complete'
import { ExternalLink } from 'lucide-react'

function JsonBlock({ value }: { value: unknown }) {
  const text = value === undefined ? '' : JSON.stringify(value, null, 2)
  return (
    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-2 text-[11px] leading-snug">{text}</pre>
  )
}

export function A2ECommandCenter() {
  const consoleUrl = getA2eStreamingConsoleUrl()

  const [langText, setLangText] = useState('Hello, how are you?')
  const [langOut, setLangOut] = useState<string | null>(null)

  const [awsPage, setAwsPage] = useState('1')
  const [awsSize, setAwsSize] = useState('10')
  const [awsOut, setAwsOut] = useState<unknown>(null)

  const [publicPool, setPublicPool] = useState(false)

  const [r2Key, setR2Key] = useState('path/upload.bin')
  const [r2Bucket, setR2Bucket] = useState('')
  const [r2Out, setR2Out] = useState<unknown>(null)

  const [bgList, setBgList] = useState<unknown>(null)
  const [bgAdd, setBgAdd] = useState('')
  const [bgDel, setBgDel] = useState('')

  const [fsFace, setFsFace] = useState('')
  const [fsList, setFsList] = useState<unknown>(null)

  const [prevFace, setPrevFace] = useState('')
  const [prevVid, setPrevVid] = useState('')
  const [prevStatus, setPrevStatus] = useState<unknown>(null)

  const [twinId, setTwinId] = useState('')
  const [t2iId, setT2iId] = useState('')

  const run = async (label: string, fn: () => Promise<unknown>, set?: (v: unknown) => void) => {
    try {
      const v = await fn()
      set?.(v)
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ScrollArea className="h-[min(520px,55vh)] pr-3">
      <div className="space-y-8">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Streaming console (in-app)</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Full A2E console in an embedded frame. If the frame stays blank, the site blocks embedding (X-Frame-Options) — use{' '}
            <a href={consoleUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
              Open in browser
            </a>
            .
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-black/5">
            <iframe
              title="A2E console"
              src={consoleUrl}
              className="h-[min(420px,50vh)] w-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={consoleUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open streaming console
            </a>
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Language detect</h3>
          <Textarea value={langText} onChange={(e) => setLangText(e.target.value)} rows={2} className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => run('Detected', () => detectLanguage(langText), (v) => setLangOut(String(v)))}>
              Detect language
            </Button>
            {langOut && <span className="text-sm text-muted-foreground">→ {langOut}</span>}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Avatar video jobs (awsList)</h3>
          <div className="flex flex-wrap gap-2">
            <Input className="w-24" value={awsPage} onChange={(e) => setAwsPage(e.target.value)} placeholder="page" />
            <Input className="w-24" value={awsSize} onChange={(e) => setAwsSize(e.target.value)} placeholder="size" />
            <Button type="button" size="sm" onClick={() => run('Loaded', () => listAwsVideos({ current: awsPage, pageSize: awsSize }), setAwsOut)}>
              Load page
            </Button>
          </div>
          {awsOut != null && <JsonBlock value={awsOut} />}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Auto public pool (dedicated-line accounts)</h3>
          <div className="flex items-center gap-2">
            <Switch id="a2e-pool" checked={publicPool} onCheckedChange={(v) => setPublicPool(v)} />
            <Label htmlFor="a2e-pool" className="text-sm">
              isAutoToPublicPool
            </Label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => run('Updated', () => setAutoPublicPool(publicPool))}
            >
              Apply
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">R2 presigned upload</h3>
          <Input value={r2Key} onChange={(e) => setR2Key(e.target.value)} placeholder="key / path" className="font-mono text-xs" />
          <Input value={r2Bucket} onChange={(e) => setR2Bucket(e.target.value)} placeholder="bucket (optional)" className="font-mono text-xs" />
          <Button type="button" size="sm" onClick={() => run('Presigned', () => getR2PresignedUrl(r2Key.trim(), r2Bucket.trim() || undefined), setR2Out)}>
            Get upload URL
          </Button>
          {r2Out != null && <JsonBlock value={r2Out} />}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Custom backgrounds</h3>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => run('Listed', () => listCustomBackgrounds(), setBgList)}>
              List backgrounds
            </Button>
          </div>
          {bgList != null && <JsonBlock value={bgList} />}
          <div className="flex flex-wrap gap-2">
            <Input value={bgAdd} onChange={(e) => setBgAdd(e.target.value)} placeholder="img_url to add" className="min-w-[200px] flex-1" />
            <Button type="button" size="sm" onClick={() => run('Added', () => addCustomBackground(bgAdd.trim()), () => listCustomBackgrounds().then(setBgList))}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={bgDel} onChange={(e) => setBgDel(e.target.value)} placeholder="_id to delete" className="font-mono text-xs" />
            <Button type="button" size="sm" variant="destructive" onClick={() => run('Deleted', () => deleteCustomBackground(bgDel.trim()), () => listCustomBackgrounds().then(setBgList))}>
              Delete
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Face swap images</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => run('Listed', () => listFaceSwapImages(), setFsList)}>
            List saved faces
          </Button>
          {fsList != null && <JsonBlock value={fsList} />}
          <div className="flex flex-wrap gap-2">
            <Input value={fsFace} onChange={(e) => setFsFace(e.target.value)} placeholder="face_url" className="min-w-[200px] flex-1" />
            <Button type="button" size="sm" onClick={() => run('Added', () => addFaceSwapImage(fsFace.trim()), () => listFaceSwapImages().then(setFsList))}>
              Add face image
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Face swap preview</h3>
          <Input value={prevFace} onChange={(e) => setPrevFace(e.target.value)} placeholder="face_url" />
          <Input value={prevVid} onChange={(e) => setPrevVid(e.target.value)} placeholder="video_url" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => run('Preview started', () => addFaceSwapPreview(prevFace.trim(), prevVid.trim()))}
            >
              Start preview
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => run('Status', () => getFaceSwapPreviewStatus(), setPrevStatus)}>
              Preview status
            </Button>
          </div>
          {prevStatus != null && <JsonBlock value={prevStatus} />}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Video twin (continue training)</h3>
          <Input value={twinId} onChange={(e) => setTwinId(e.target.value)} placeholder="userVideoTwin _id" className="font-mono text-xs" />
          <Button type="button" size="sm" onClick={() => run('Continue training', () => continueVideoTwinTraining(twinId.trim()))}>
            Continue training (Studio Avatar)
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Text-to-image → quick add avatar</h3>
          <Input value={t2iId} onChange={(e) => setT2iId(e.target.value)} placeholder="userText2image task _id" className="font-mono text-xs" />
          <Button type="button" size="sm" onClick={() => run('Quick add', () => quickAddAvatarFromT2I(t2iId.trim()))}>
            quickAddAvatar
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Product avatar</h3>
          <p className="text-muted-foreground text-xs">OpenAPI body is empty; may succeed only for eligible accounts.</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => run('Product avatar', () => startProductAvatar())}>
            Start product avatar
          </Button>
        </section>
      </div>
    </ScrollArea>
  )
}
