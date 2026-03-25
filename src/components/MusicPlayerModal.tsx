import { useCallback, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  useMusicPlayerRegister,
  useMusicPlayerItems,
  useMusicPlayerGenerating,
  type MusicPlayerControl,
} from '@/contexts/MusicPlayerContext'

interface MusicPlayerModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function MusicPlayerModal({ open, onOpenChange }: MusicPlayerModalProps) {
  const { register, unregister } = useMusicPlayerRegister()
  const { tracks, addTrack, activeTrackId, setActiveTrackId } = useMusicPlayerItems()
  const { generating, generatingLabel } = useMusicPlayerGenerating()
  const audioRef = useRef<HTMLAudioElement>(null)

  const activeTrack = tracks.find(t => t.id === activeTrackId)

  useEffect(() => {
    if (!open) return
    const control: MusicPlayerControl = {
      showTrack(track) {
        addTrack(track)
      },
      isOpen: () => open,
      openPlayer: () => onOpenChange(true),
    }
    register(control)
    return () => unregister()
  }, [open, register, unregister, addTrack, onOpenChange])

  useEffect(() => {
    if (activeTrack && audioRef.current) {
      audioRef.current.src = activeTrack.audioUrl
      audioRef.current.load()
    }
  }, [activeTrack])

  const handleDownload = useCallback(async () => {
    if (!activeTrack) return
    try {
      const res = await fetch(activeTrack.audioUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeTrack.title || 'song'}.mp3`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Download started')
    } catch {
      toast.error('Failed to download track')
    }
  }, [activeTrack])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            Music Player
          </DialogTitle>
        </DialogHeader>

        {generating && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">{generatingLabel || 'Generating music...'}</p>
          </div>
        )}

        {!generating && activeTrack && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-base">{activeTrack.title}</h3>
              {activeTrack.tags && (
                <div className="flex flex-wrap gap-1">
                  {activeTrack.tags.split(',').map(tag => (
                    <span key={tag.trim()} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
              {activeTrack.duration && (
                <p className="text-xs text-muted-foreground">
                  Duration: {Math.floor(activeTrack.duration / 60)}:{String(Math.floor(activeTrack.duration % 60)).padStart(2, '0')}
                </p>
              )}
              <p className="text-xs text-muted-foreground italic">
                &ldquo;{activeTrack.prompt}&rdquo;
              </p>
            </div>

            {/* Audio player */}
            <audio ref={audioRef} controls className="w-full" autoPlay>
              <source src={activeTrack.audioUrl} type="audio/mpeg" />
            </audio>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
                Download MP3
              </Button>
            </div>
          </div>
        )}

        {!generating && !activeTrack && tracks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No tracks yet. Ask Jarvis to generate a song!
          </p>
        )}

        {/* Track list */}
        {tracks.length > 1 && (
          <div className="border-t border-border pt-3 mt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">All Tracks</p>
            {tracks.map(track => (
              <button
                key={track.id}
                onClick={() => setActiveTrackId(track.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  track.id === activeTrackId
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span className="font-medium">{track.title}</span>
                {track.tags && <span className="text-xs text-muted-foreground ml-2">{track.tags}</span>}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
