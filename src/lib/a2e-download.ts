import type { A2ETask } from '@/lib/types'
import { toast } from 'sonner'

// SECURITY (ADD-WARN-01): Only allow safe URL schemes for download links.
const SAFE_DOWNLOAD_SCHEMES = new Set(['https:', 'http:'])

function isSafeDownloadUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return SAFE_DOWNLOAD_SCHEMES.has(protocol)
  } catch {
    return false
  }
}

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
  const safe = String(task.modelId).replaceAll(/[^a-z0-9-_]/gi, '_')
  return `a2e-${safe}-${index + 1}.${ext}`
}

export async function downloadMediaUrl(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()

    if ('showSaveFilePicker' in globalThis) {
      const picker = await (globalThis as typeof globalThis & {
        showSaveFilePicker: (opts: { suggestedName: string }) => Promise<{
          createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
        }>
      }).showSaveFilePicker({ suggestedName: filename })
      const writable = await picker.createWritable()
      await writable.write(blob)
      await writable.close()
      toast.success('Download saved')
      return
    }

    toast.error('Secure download is not supported in this browser. Please use desktop mode.')
  } catch {
    if (!isSafeDownloadUrl(url)) {
      console.warn('[a2e-download] Blocked unsafe download URL scheme:', url.slice(0, 64))
      toast.error('Download blocked: unsafe URL scheme.')
      return
    }

    // Fail closed on fetch/download failures instead of navigating the browser to remote URLs.
    toast.error('Download failed. Please retry or use a trusted direct source.')
  }
}
