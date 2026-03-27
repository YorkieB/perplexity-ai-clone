import { useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { A2ETask } from '@/lib/types'
import { A2E_STREAMING_API_ROOT, A2E_STREAMING_HELP, getA2eStreamingConsoleUrl } from '@/lib/a2e-streaming'
import {
  studioTextToImage,
  studioNanoBanana,
  studioImageToVideo,
  studioTalkingPhoto,
  studioTalkingVideo,
  studioTts,
  studioVoiceTrain,
  studioCaptionRemoval,
  studioDubbing,
  studioAvatarVideo,
  studioVirtualTryOn,
  studioMotionTransfer,
  studioFaceSwap,
  studioWatermark,
  studioCustomAvatar,
  A2E_TEXT_TO_IMAGE_REQ_KEYS,
  A2E_T2I_REQ_KEY_STORAGE,
  A2E_T2I_REQ_KEY_DOCUMENTATION,
  fetchRemainingCoins,
} from '@/lib/a2e-api'
import { ExternalLink } from 'lucide-react'
import { A2ECommandCenter } from '@/components/A2ECommandCenter'

interface A2EStudioPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when a Studio job finishes so the UI can show the result modal. */
  onTaskComplete?: (task: A2ETask) => void
}

type FormProps = { busy: boolean; setBusy: (b: boolean) => void; onTaskDone?: (task: A2ETask) => void }

export function A2EStudioPanel({ open, onOpenChange, onTaskComplete }: A2EStudioPanelProps) {
  const [busy, setBusy] = useState(false)
  const [coins, setCoins] = useState<number | null>(null)

  const done = (task: A2ETask) => {
    onTaskComplete?.(task)
  }

  const formProps: FormProps = { busy, setBusy, onTaskDone: done }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (o) {
          fetchRemainingCoins()
            .then((c) => setCoins(c.coins))
            .catch(() => setCoins(null))
        }
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="shrink-0 space-y-1 border-b border-border px-6 pt-6 pr-14">
          <DialogHeader className="p-0">
            <DialogTitle>A2E Studio</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Run creative jobs through the local <code className="text-xs">/api/a2e</code> proxy.
            {coins != null && (
              <span className="ml-2 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] tabular-nums">
                Credits: {coins}
              </span>
            )}
          </p>
        </div>

        <Tabs defaultValue="hub" className="flex min-h-0 flex-1 flex-col gap-0 px-6 pt-4">
          <div className="shrink-0 pb-3">
            <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">Task type</p>
            <TabsList className="inline-flex h-auto w-full max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-muted/50 p-1.5 shadow-sm [scrollbar-width:thin]">
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="hub">
                Hub
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="t2i">
                Text→Image
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="nano">
                Nano
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="i2v">
                Image→Video
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="tp">
                Talking Photo
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="tv">
                Talking Video
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="avatar">
                Avatar
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="tts">
                TTS
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="voice">
                Voice clone
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="cap">
                Captions
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="dub">
                Dubbing
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="vto">
                Try-on
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="motion">
                Motion
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="faceswap">
                Face swap
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="wm">
                Watermark
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="twin">
                Avatar train
              </TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm" value="live">
                Live stream
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-gutter:stable]">
            <div className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
              <TabsContent value="hub" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <p className="text-muted-foreground text-sm">
                  Everything A2E in one place: embedded console, streaming links, and extra REST tools from the API catalog.
                </p>
                <A2ECommandCenter />
              </TabsContent>
              <TabsContent value="t2i" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <T2IForm {...formProps} />
              </TabsContent>
              <TabsContent value="nano" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <NanoForm {...formProps} />
              </TabsContent>
              <TabsContent value="i2v" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <I2VForm {...formProps} />
              </TabsContent>
              <TabsContent value="tp" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <TPForm {...formProps} />
              </TabsContent>
              <TabsContent value="tv" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <TVForm {...formProps} />
              </TabsContent>
              <TabsContent value="avatar" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <AvatarForm {...formProps} />
              </TabsContent>
              <TabsContent value="tts" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <TTSForm {...formProps} />
              </TabsContent>
              <TabsContent value="voice" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <VoiceForm {...formProps} />
              </TabsContent>
              <TabsContent value="cap" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <CapForm {...formProps} />
              </TabsContent>
              <TabsContent value="dub" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <DubForm {...formProps} />
              </TabsContent>
              <TabsContent value="vto" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <VtoForm {...formProps} />
              </TabsContent>
              <TabsContent value="motion" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <MotionForm {...formProps} />
              </TabsContent>
              <TabsContent value="faceswap" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <FaceSwapForm {...formProps} />
              </TabsContent>
              <TabsContent value="wm" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <WatermarkForm {...formProps} />
              </TabsContent>
              <TabsContent value="twin" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <TwinForm {...formProps} />
              </TabsContent>
              <TabsContent value="live" className="mt-0 block flex-none space-y-4 focus-visible:outline-none">
                <LiveStreamInfo />
              </TabsContent>
            </div>
          </div>
        </Tabs>

        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Uses your <code className="rounded bg-muted px-1 py-0.5 text-[11px]">A2E_API_KEY</code> via the local proxy for REST.{' '}
            <span className="text-foreground/90">Live streaming</span> opens the{' '}
            <a
              href={getA2eStreamingConsoleUrl()}
              className="text-accent font-medium underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              streaming console
            </a>{' '}
            (see <strong className="font-medium">Live stream</strong> tab).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function T2IForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name, setName] = useState('T2I task')
  const [prompt, setPrompt] = useState('')
  const [reqKey, setReqKey] = useLocalStorage<'high_aes_general_v21_L' | 'high_aes'>(
    A2E_T2I_REQ_KEY_STORAGE,
    'high_aes_general_v21_L'
  )
  const [w, setW] = useState(1024)
  const [h, setH] = useState(768)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-t2i-name">
          Name
        </Label>
        <Input id="a2e-t2i-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-t2i-reqkey">
          Image style (req_key)
        </Label>
        <Select value={reqKey} onValueChange={(v) => setReqKey(v as 'high_aes_general_v21_L' | 'high_aes')}>
          <SelectTrigger id="a2e-t2i-reqkey" className="w-full">
            <SelectValue placeholder="Style" />
          </SelectTrigger>
          <SelectContent>
            {A2E_TEXT_TO_IMAGE_REQ_KEYS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-[11px] leading-snug">{A2E_T2I_REQ_KEY_DOCUMENTATION}</p>
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-t2i-prompt">
          Prompt
        </Label>
        <Textarea
          id="a2e-t2i-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="min-h-[100px] resize-y"
          placeholder="Describe the image you want…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="block" htmlFor="a2e-t2i-w">
            Width
          </Label>
          <Input id="a2e-t2i-w" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label className="block" htmlFor="a2e-t2i-h">
            Height
          </Label>
          <Input id="a2e-t2i-h" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />
        </div>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !prompt.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioTextToImage({
              name,
              prompt: prompt.trim(),
              req_key: reqKey,
              width: w,
              height: h,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Images ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Generate
      </Button>
    </div>
  )
}

function NanoForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name, setName] = useState('Nano task')
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-nano-name">
          Name
        </Label>
        <Input id="a2e-nano-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-nano-prompt">
          Prompt
        </Label>
        <Textarea
          id="a2e-nano-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="min-h-[100px] resize-y"
          placeholder="Describe the edit or image…"
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-nano-refs">
          Reference image URLs (one per line, optional)
        </Label>
        <Textarea
          id="a2e-nano-refs"
          value={refs}
          onChange={(e) => setRefs(e.target.value)}
          rows={2}
          placeholder="https://..."
        />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !prompt.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const input_images = refs
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
            const task = await studioNanoBanana({
              name,
              prompt: prompt.trim(),
              input_images: input_images.length ? input_images : undefined,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Done' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Run Nano Banana
      </Button>
    </div>
  )
}

function I2VForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('I2V')
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [neg, setNeg] = useState(
    'six fingers, bad hands, lowres, low quality, worst quality, moving camera view point, still image'
  )
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-i2v-image">
          Image URL
        </Label>
        <Input id="a2e-i2v-image" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-i2v-motion">
          Motion prompt
        </Label>
        <Textarea
          id="a2e-i2v-motion"
          placeholder="Describe the motion…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-i2v-neg">
          Negative prompt
        </Label>
        <Textarea id="a2e-i2v-neg" value={neg} onChange={(e) => setNeg(e.target.value)} rows={2} className="resize-y" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !imageUrl.trim() || !prompt.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioImageToVideo({
              name,
              image_url: imageUrl.trim(),
              prompt: prompt.trim(),
              negative_prmpt: neg,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Video ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start
      </Button>
    </div>
  )
}

function TPForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Talking photo')
  const [imageUrl, setImageUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [neg, setNeg] = useState(
    'vivid colors, overexposed, flickering, blurry details, subtitles, logo, worst quality, low quality'
  )
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tp-image">
          Image URL
        </Label>
        <Input id="a2e-tp-image" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tp-audio">
          Audio URL
        </Label>
        <Input id="a2e-tp-audio" placeholder="https://…" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tp-prompt">
          Prompt
        </Label>
        <Textarea id="a2e-tp-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="resize-y" />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tp-neg">
          Negative prompt
        </Label>
        <Textarea id="a2e-tp-neg" value={neg} onChange={(e) => setNeg(e.target.value)} rows={2} className="resize-y" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !imageUrl.trim() || !audioUrl.trim() || !prompt.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioTalkingPhoto({
              name,
              image_url: imageUrl.trim(),
              audio_url: audioUrl.trim(),
              prompt: prompt.trim(),
              negative_prompt: neg,
              duration: 3,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Video ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start
      </Button>
    </div>
  )
}

function TVForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Talking video')
  const [videoUrl, setVideoUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [neg, setNeg] = useState('blurry, distorted')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tv-video">
          Source video URL
        </Label>
        <Input id="a2e-tv-video" placeholder="https://…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tv-audio">
          Audio URL
        </Label>
        <Input id="a2e-tv-audio" placeholder="https://…" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tv-prompt">
          Prompt
        </Label>
        <Textarea id="a2e-tv-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="resize-y" />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tv-neg">
          Negative prompt
        </Label>
        <Textarea id="a2e-tv-neg" value={neg} onChange={(e) => setNeg(e.target.value)} rows={2} className="resize-y" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !videoUrl.trim() || !audioUrl.trim() || !prompt.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioTalkingVideo({
              name,
              video_url: videoUrl.trim(),
              audio_url: audioUrl.trim(),
              prompt: prompt.trim(),
              negative_prompt: neg,
              duration: 5,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Done' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start
      </Button>
    </div>
  )
}

function AvatarForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [title] = useState('Avatar video')
  const [anchorId, setAnchorId] = useState('')
  const [anchorType, setAnchorType] = useState('0')
  const [audioSrc, setAudioSrc] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-av-anchor">
          anchor_id
        </Label>
        <Input
          id="a2e-av-anchor"
          placeholder="From character_list"
          value={anchorId}
          onChange={(e) => setAnchorId(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-av-type">
          anchor_type
        </Label>
        <Input
          id="a2e-av-type"
          className="max-w-[100px]"
          value={anchorType}
          onChange={(e) => setAnchorType(e.target.value)}
          placeholder="0|1"
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-av-audio">
          audioSrc URL
        </Label>
        <Input
          id="a2e-av-audio"
          placeholder="TTS or upload URL"
          value={audioSrc}
          onChange={(e) => setAudioSrc(e.target.value)}
        />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !anchorId.trim() || !audioSrc.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioAvatarVideo({
              title,
              anchor_id: anchorId.trim(),
              anchor_type: Number(anchorType) || 0,
              audioSrc: audioSrc.trim(),
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Avatar video done' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Generate
      </Button>
    </div>
  )
}

function TTSForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [msg, setMsg] = useState('')
  const [ttsId, setTtsId] = useState('')
  const [rate, setRate] = useState(1)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tts-msg">
          Text to speak
        </Label>
        <Textarea
          id="a2e-tts-msg"
          placeholder="…"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          className="min-h-[88px] resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tts-id">
          tts_id <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="a2e-tts-id"
          placeholder="From voice_list"
          value={ttsId}
          onChange={(e) => setTtsId(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-tts-rate">
          speechRate
        </Label>
        <Input id="a2e-tts-rate" type="number" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !msg.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioTts({
              msg: msg.trim(),
              speechRate: rate,
              ...(ttsId.trim() ? { tts_id: ttsId.trim() } : {}),
            })
            toast.success('Audio URL: ' + (task.resultUrls[0] || 'ok'))
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Synthesize
      </Button>
    </div>
  )
}

function VoiceForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name, setName] = useState('My voice')
  const [url, setUrl] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-voice-name">
          Name
        </Label>
        <Input id="a2e-voice-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-voice-url">
          Training audio URL
        </Label>
        <Input
          id="a2e-voice-url"
          placeholder="mp3 / wav / m4a, 10–60s"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !url.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioVoiceTrain({ name, voice_urls: [url.trim()], model: 'a2e', language: 'en' })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Training complete' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Train
      </Button>
    </div>
  )
}

function CapForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Remove captions')
  const [source, setSource] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-cap-src">
          Source video URL
        </Label>
        <Input id="a2e-cap-src" placeholder="https://…" value={source} onChange={(e) => setSource(e.target.value)} />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !source.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioCaptionRemoval(name, source.trim())
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Done' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Remove captions
      </Button>
    </div>
  )
}

function DubForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Dub')
  const [source, setSource] = useState('')
  const [sourceLang, setSourceLang] = useState('zh')
  const [targetLang, setTargetLang] = useState('en')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="block" htmlFor="a2e-dub-src">
          Source video or audio URL
        </Label>
        <Input id="a2e-dub-src" placeholder="https://…" value={source} onChange={(e) => setSource(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="block" htmlFor="a2e-dub-sl">
            source_lang
          </Label>
          <Input id="a2e-dub-sl" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="block" htmlFor="a2e-dub-tl">
            target_lang
          </Label>
          <Input id="a2e-dub-tl" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} />
        </div>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !source.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioDubbing({
              name,
              source_url: source.trim(),
              source_lang: sourceLang,
              target_lang: targetLang,
              num_speakers: 1,
              drop_background_audio: false,
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Dub ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start dubbing
      </Button>
    </div>
  )
}

function VtoForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name, setName] = useState('Try-on')
  const [urls, setUrls] = useState('')
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Four URLs in order: person image, person mask, clothing image, clothing mask (one URL per line).
      </p>
      <div className="space-y-2">
        <Label htmlFor="a2e-vto-name">Name</Label>
        <Input id="a2e-vto-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-vto-urls">Image URLs</Label>
        <Textarea
          id="a2e-vto-urls"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={5}
          placeholder={'https://…person\nhttps://…person-mask\nhttps://…cloth\nhttps://…cloth-mask'}
          className="resize-y font-mono text-xs"
        />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy}
        onClick={async () => {
          const list = urls
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => /^https?:\/\//i.test(s))
          if (list.length < 4) {
            toast.error('Need exactly four http(s) URLs')
            return
          }
          setBusy(true)
          try {
            const task = await studioVirtualTryOn({ name, image_urls: list.slice(0, 4) })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Try-on ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start try-on
      </Button>
    </div>
  )
}

function MotionForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Motion')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [pos, setPos] = useState('a person, natural motion')
  const [neg, setNeg] = useState('blurry, ugly, duplicate, poorly drawn, deformed')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="a2e-mot-img">Reference image URL</Label>
        <Input id="a2e-mot-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-mot-vid">Source video URL</Label>
        <Input id="a2e-mot-vid" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-mot-pos">Positive prompt</Label>
        <Textarea id="a2e-mot-pos" value={pos} onChange={(e) => setPos(e.target.value)} rows={2} className="resize-y" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-mot-neg">Negative prompt</Label>
        <Textarea id="a2e-mot-neg" value={neg} onChange={(e) => setNeg(e.target.value)} rows={2} className="resize-y" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !imageUrl.trim() || !videoUrl.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioMotionTransfer({
              name,
              image_url: imageUrl.trim(),
              video_url: videoUrl.trim(),
              positive_prompt: pos.trim(),
              negative_prompt: neg.trim(),
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Motion video ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start motion transfer
      </Button>
    </div>
  )
}

function FaceSwapForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name] = useState('Face swap')
  const [faceUrl, setFaceUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="a2e-fs-face">Face image URL</Label>
        <Input id="a2e-fs-face" value={faceUrl} onChange={(e) => setFaceUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-fs-vid">Video URL</Label>
        <Input id="a2e-fs-vid" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !faceUrl.trim() || !videoUrl.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioFaceSwap({
              name,
              face_url: faceUrl.trim(),
              video_url: videoUrl.trim(),
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Face swap ready' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start face swap
      </Button>
    </div>
  )
}

function WatermarkForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [wt, setWt] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('Generated by AI')
  const [wmImageUrl, setWmImageUrl] = useState('')
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="a2e-wm-media">Media URL</Label>
        <Input id="a2e-wm-media" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={wt} onValueChange={(v) => setWt(v as 'text' | 'image')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text watermark</SelectItem>
            <SelectItem value="image">Image watermark</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {wt === 'text' ? (
        <div className="space-y-2">
          <Label htmlFor="a2e-wm-txt">Text</Label>
          <Input id="a2e-wm-txt" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="a2e-wm-wimg">Watermark image URL</Label>
          <Input id="a2e-wm-wimg" value={wmImageUrl} onChange={(e) => setWmImageUrl(e.target.value)} placeholder="https://…" />
        </div>
      )}
      <Button
        className="w-full sm:w-auto"
        disabled={busy || !mediaUrl.trim() || (wt === 'image' && !wmImageUrl.trim())}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioWatermark({
              media_url: mediaUrl.trim(),
              watermark_type: wt,
              ...(wt === 'text' ? { text: text.trim() } : { watermark_image_url: wmImageUrl.trim() }),
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Watermark applied' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Apply watermark
      </Button>
    </div>
  )
}

function TwinForm({ busy, setBusy, onTaskDone }: FormProps) {
  const [name, setName] = useState('My avatar')
  const [gender, setGender] = useState<'female' | 'male'>('female')
  const [videoUrl, setVideoUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [bg, setBg] = useState('')
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Provide a video URL (recommended) or an image URL. Optional background color like rgb(61,165,82).
      </p>
      <div className="space-y-2">
        <Label htmlFor="a2e-tw-name">Name</Label>
        <Input id="a2e-tw-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Gender</Label>
        <Select value={gender} onValueChange={(v) => setGender(v as 'female' | 'male')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="female">female</SelectItem>
            <SelectItem value="male">male</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-tw-vid">Video URL (optional if image)</Label>
        <Input id="a2e-tw-vid" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…mp4" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-tw-img">Image URL (optional if video)</Label>
        <Input id="a2e-tw-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…png" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a2e-tw-bg">video_backgroud_color (optional)</Label>
        <Input id="a2e-tw-bg" value={bg} onChange={(e) => setBg(e.target.value)} placeholder="rgb(61,165,82)" />
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={busy || (!videoUrl.trim() && !imageUrl.trim())}
        onClick={async () => {
          setBusy(true)
          try {
            const task = await studioCustomAvatar({
              name: name.trim(),
              gender,
              ...(videoUrl.trim() ? { video_url: videoUrl.trim() } : {}),
              ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
              ...(bg.trim() ? { video_backgroud_color: bg.trim() } : {}),
            })
            toast[task.status === 'completed' ? 'success' : 'error'](
              task.status === 'completed' ? 'Avatar training updated' : task.error || 'Failed'
            )
            onTaskDone?.(task)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Start training
      </Button>
    </div>
  )
}

function LiveStreamInfo() {
  const consoleUrl = getA2eStreamingConsoleUrl()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm leading-relaxed">
          <span className="font-medium text-foreground">Streaming avatars</span> are real-time (WebRTC / low-latency),
          not the same as generating a file with REST <code className="rounded bg-muted px-1 text-[11px]">/api/v1/...</code>.
          This app proxies those REST calls; live sessions are opened in A2E’s workspace or integrated with their streaming
          SDK + token flow.
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Use <span className="text-foreground">REST + Studio</span> here to create avatars (
          <code className="text-[11px]">character_list</code>, training) and voices — same as on{' '}
          <code className="text-[11px]">video.a2e.ai</code>.
        </li>
        <li>
          <span className="text-foreground">Start a live session</span> in the A2E streaming console (button below). Sign in with
          the same account as your API key when applicable.
        </li>
        <li>
          <span className="text-foreground">Embed in your own site</span>: follow A2E’s streaming docs (often Agora +
          room token). Search <span className="text-foreground">streaming</span> on the API site.
        </li>
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" className="gap-2" asChild>
          <a href={consoleUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open streaming console
          </a>
        </Button>
        <Button type="button" variant="outline" className="gap-2" asChild>
          <a href={A2E_STREAMING_API_ROOT} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            API documentation
          </a>
        </Button>
        <Button type="button" variant="outline" className="gap-2" asChild>
          <a href={A2E_STREAMING_HELP.tutorial} target="_blank" rel="noopener noreferrer">
            Tutorial
          </a>
        </Button>
        <Button type="button" variant="outline" className="gap-2" asChild>
          <a href={A2E_STREAMING_HELP.discord} target="_blank" rel="noopener noreferrer">
            Discord support
          </a>
        </Button>
      </div>

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Optional: set <code className="rounded bg-muted px-1">VITE_A2E_STREAMING_URL</code> in <code className="rounded bg-muted px-1">.env</code> if your
        team uses a different console URL. Current:{' '}
        <span className="break-all font-mono text-[10px]">{consoleUrl}</span>
      </p>
    </div>
  )
}
