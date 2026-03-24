import type { A2ETask } from '@/lib/types'
import { toast } from 'sonner'

export function guessExtension(task: A2ETask, url: string): string {
  const path = url.split('?')[0] ?? url
  const last = path.split('.').pop()?.toLowerCase()
  if (last && last.length <= 5 && /^[a-z0-9]+$/.test(last)) return last
  if (task.mediaType === 'image') return 'png'
  if (task.mediaType === 'video') return 'mp4'
  if (task.mediaType === 'audio') return 'mp3'
  return 'bin'
}

export function downloadFilename(task: A2ETask, url: string, index: number): string {
  const ext = guessExtension(task, url)
  const safe = String(task.modelId).replace(/[^a-z0-9-_]/gi, '_')
  return `a2e-${safe}-${index + 1}.${ext}`
}

export async function downloadMediaUrl(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
    toast.success('Download started')
  } catch {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.message('If the file did not save, open the link and use your browser’s Save as…')
  }
}
