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
