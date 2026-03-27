/**
 * Local post scheduler.
 * Stores scheduled posts in localStorage and fires them when due.
 */

import { randomIdSegment } from '@/lib/secure-random'
import { postTweet } from './social-api'

export interface ScheduledPost {
  id: string
  platform: 'x' | 'threads'
  text: string
  scheduledTime: string // ISO 8601
  createdAt: string
  status: 'pending' | 'posted' | 'failed'
  error?: string
  resultUrl?: string
}

const STORAGE_KEY = 'jarvis-scheduled-posts'

function loadPosts(): ScheduledPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePosts(posts: ScheduledPost[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
}

export function schedulePost(
  platform: 'x' | 'threads',
  text: string,
  scheduledTime: string,
): ScheduledPost {
  const post: ScheduledPost = {
    id: `sched-${Date.now()}-${randomIdSegment()}`,
    platform,
    text,
    scheduledTime,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  const posts = loadPosts()
  posts.push(post)
  savePosts(posts)
  return post
}

export function getScheduledPosts(): ScheduledPost[] {
  return loadPosts()
}

export function cancelScheduledPost(id: string): boolean {
  const posts = loadPosts()
  const idx = posts.findIndex(p => p.id === id)
  if (idx < 0) return false
  posts[idx].status = 'failed'
  posts[idx].error = 'Cancelled by user'
  savePosts(posts)
  return true
}

export function listScheduledPostsSummary(): string {
  const posts = loadPosts().filter(p => p.status === 'pending')
  if (posts.length === 0) return 'No scheduled posts.'
  return posts.map((p, i) => {
    const time = new Date(p.scheduledTime)
    const relative = formatRelativeTime(time)
    return `${i + 1}. [${p.platform.toUpperCase()}] "${p.text.slice(0, 60)}${p.text.length > 60 ? '...' : ''}" — ${relative} (${time.toLocaleString()}) [id: ${p.id}]`
  }).join('\n')
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = date.getTime() - now
  if (diff < 0) return 'overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/**
 * Check for due posts and fire them.
 * Called on an interval from App.tsx.
 * Only handles X via API; Threads requires browser control (handled separately).
 */
export async function checkAndFireScheduled(
  onThreadsPost?: (text: string) => Promise<void>,
): Promise<void> {
  const posts = loadPosts()
  const now = Date.now()
  let changed = false

  for (const post of posts) {
    if (post.status !== 'pending') continue
    if (new Date(post.scheduledTime).getTime() > now) continue

    changed = true
    try {
      if (post.platform === 'x') {
        const result = await postTweet(post.text)
        post.status = 'posted'
        post.resultUrl = result.url
      } else if (post.platform === 'threads' && onThreadsPost) {
        await onThreadsPost(post.text)
        post.status = 'posted'
      } else {
        post.error = 'Threads posting requires browser — will retry when browser is available'
      }
    } catch (e) {
      post.status = 'failed'
      post.error = e instanceof Error ? e.message : String(e)
    }
  }

  if (changed) savePosts(posts)
}
