import { useState } from 'react'
import { SearchVideo } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Play } from '@phosphor-icons/react'

interface VideoCardProps {
  video: SearchVideo
}

export function VideoCard({ video }: VideoCardProps) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <Card className="shrink-0 w-72 overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1`}
            title={video.title}
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
        <div className="p-2">
          <p className="text-xs font-medium line-clamp-2">{video.title}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="shrink-0 w-72 overflow-hidden group hover:border-accent transition-colors">
      <button onClick={() => setPlaying(true)} className="relative w-full block">
        <img
          src={video.thumbnail}
          alt={video.title}
          loading="lazy"
          className="w-full object-cover"
          style={{ aspectRatio: '16/9' }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={24} weight="fill" className="text-black ml-0.5" />
          </div>
        </div>
      </button>
      <div className="p-2">
        <p className="text-xs font-medium line-clamp-2">{video.title}</p>
      </div>
    </Card>
  )
}

interface VideoRowProps {
  videos: SearchVideo[]
}

export function VideoRow({ videos }: VideoRowProps) {
  if (videos.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Videos
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {videos.map((video) => (
          <VideoCard key={video.videoId} video={video} />
        ))}
      </div>
    </div>
  )
}
