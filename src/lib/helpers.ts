import { UploadedFile } from './types'

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function generateThreadTitle(firstMessage: string): string {
  const maxLength = 50
  if (firstMessage.length <= maxLength) {
    return firstMessage
  }
  return firstMessage.substring(0, maxLength).trim() + '...'
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 7) {
    return new Date(timestamp).toLocaleDateString()
  }
  if (days > 0) {
    return `${days}d ago`
  }
  if (hours > 0) {
    return `${hours}h ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'Just now'
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export async function processFile(file: File): Promise<UploadedFile> {
  const maxSize = 10 * 1024 * 1024
  
  if (file.size > maxSize) {
    throw new Error(`File size exceeds 10MB limit`)
  }
  
  const allowedTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`File type not supported: ${file.type}`)
  }
  
  let content = ''
  
  if (file.type.startsWith('text/') || file.type === 'application/json') {
    content = await file.text()
  } else if (file.type.startsWith('image/')) {
    content = await readFileAsDataURL(file)
  } else if (file.type === 'application/pdf') {
    content = `[PDF: ${file.name}]`
  }
  
  return {
    id: generateId(),
    name: file.name,
    type: file.type,
    size: file.size,
    content,
    uploadedAt: Date.now(),
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
