/**
 * Social media API client for X (Twitter) and Threads.
 * X posting uses the API v2 via server proxy (OAuth 1.0a signed server-side).
 * Reading feeds and Threads interactions use the Agent Browser.
 */

import type { BrowserControl } from '@/contexts/BrowserControlContext'

const THREADS_COMPOSE_PATTERNS: RegExp[] = [
  /ref="([^"]+)"[^>]*(?:Start a thread|What's new|new thread|Create a thread)/i,
  /ref="([^"]+)"[^>]*placeholder="[^"]*thread[^"]*"/i,
  /ref="([^"]+)"[^>]*aria-label="[^"]*thread[^"]*"/i,
]

const THREADS_POST_PATTERNS: RegExp[] = [
  /ref="([^"]+)"[^>]*>\s*Post\s*</i,
  /ref="([^"]+)"[^>]*(?:^|\s)Post(?:\s|$)/i,
  /ref="([^"]+)"[^>]*aria-label="Post"/i,
  /ref="([^"]+)"[^>]*(?:Submit|Share thread)/i,
]

const THREADS_POST_SUCCESS_INDICATORS = /(?:Your thread|thread was posted|Posted|post shared)/i

function matchRef(snapshot: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(snapshot)
    if (match?.[1]) return match[1]
  }
  return null
}

// ── X API (via proxy) ───────────────────────────────────────────────────────

export interface TweetResult {
  id: string
  text: string
  url: string
}

export async function postTweet(
  text: string,
  replyToId?: string,
): Promise<TweetResult> {
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }

  const res = await fetch('/api/x/tweet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`X post failed (${res.status}): ${err}`)
  }
  const data = await res.json() as { data?: { id: string; text: string } }
  const id = data.data?.id || ''
  return { id, text: data.data?.text || text, url: `https://x.com/i/status/${id}` }
}

// ── Browser-based social reading ────────────────────────────────────────────

export async function readSocialFeed(
  platform: 'x' | 'threads',
  browserControl: BrowserControl,
  options?: { username?: string; query?: string },
): Promise<string> {
  browserControl.openBrowser()
  await new Promise(r => setTimeout(r, 500))

  let url: string
  if (platform === 'x') {
    if (options?.query) {
      url = `https://x.com/search?q=${encodeURIComponent(options.query)}&src=typed_query&f=live`
    } else if (options?.username) {
      url = `https://x.com/${options.username.replace('@', '')}`
    } else {
      url = 'https://x.com/home'
    }
  } else if (options?.username) {
    url = `https://www.threads.net/@${options.username.replace('@', '')}`
  } else if (options?.query) {
    url = `https://www.threads.net/search?q=${encodeURIComponent(options.query)}&serp_type=default`
  } else {
    url = 'https://www.threads.net/'
  }

  await browserControl.navigate(url)
  await new Promise(r => setTimeout(r, 3000))

  const text = await browserControl.extractText()
  if (!text || text.length < 50) {
    const snapshot = await browserControl.snapshot()
    return `Page loaded but content sparse. Snapshot:\n${snapshot.slice(0, 3000)}`
  }

  return text.slice(0, 5000)
}

export async function readComments(
  postUrl: string,
  browserControl: BrowserControl,
): Promise<string> {
  browserControl.openBrowser()
  await new Promise(r => setTimeout(r, 500))

  await browserControl.navigate(postUrl)
  await new Promise(r => setTimeout(r, 3000))

  // Scroll down to load replies
  await browserControl.scroll('down')
  await new Promise(r => setTimeout(r, 1500))

  const text = await browserControl.extractText()
  if (!text || text.length < 30) {
    return 'Could not extract comments. The page may require login or the post may have no replies.'
  }

  return text.slice(0, 6000)
}

export async function postToThreadsViaBrowser(
  text: string,
  browserControl: BrowserControl,
): Promise<string> {
  browserControl.openBrowser()
  await new Promise(r => setTimeout(r, 500))

  await browserControl.navigate('https://www.threads.net/')
  await new Promise(r => setTimeout(r, 3000))

  const snapshot = await browserControl.snapshot()
  const composeRef = matchRef(snapshot, THREADS_COMPOSE_PATTERNS)
  if (!composeRef) {
    return 'Could not find the compose area on Threads. The UI may have changed or you may need to log in. Snapshot:\n' + snapshot.slice(0, 2000)
  }

  await browserControl.click(composeRef)
  await new Promise(r => setTimeout(r, 1000))
  await browserControl.type(composeRef, text)
  await new Promise(r => setTimeout(r, 500))

  const postSnapshot = await browserControl.snapshot()
  const postRef = matchRef(postSnapshot, THREADS_POST_PATTERNS)
  if (!postRef) {
    return 'Typed the post but could not find the Post button. The Threads UI may have changed. You may need to post manually.'
  }

  await browserControl.click(postRef)
  await new Promise(r => setTimeout(r, 3000))

  const afterSnapshot = await browserControl.snapshot()
  if (!THREADS_POST_SUCCESS_INDICATORS.test(afterSnapshot)) {
    return 'Clicked Post but could not confirm the post was submitted. Please check Threads manually.'
  }

  return 'Posted to Threads successfully.'
}

export async function replyViaBrowser(
  postUrl: string,
  text: string,
  browserControl: BrowserControl,
): Promise<string> {
  browserControl.openBrowser()
  await new Promise(r => setTimeout(r, 500))

  await browserControl.navigate(postUrl)
  await new Promise(r => setTimeout(r, 3000))

  const snapshot = await browserControl.snapshot()

  // Look for reply input
  const replyMatch = /ref="([^"]+)"[^>]*(?:Reply|Add a comment|Post your reply)/i.exec(snapshot)
  if (replyMatch) {
    await browserControl.click(replyMatch[1])
    await new Promise(r => setTimeout(r, 800))
    await browserControl.type(replyMatch[1], text)
    await new Promise(r => setTimeout(r, 500))

    const postSnapshot = await browserControl.snapshot()
    const postBtn = /ref="([^"]+)"[^>]*(?:Reply|Post|Submit|Send)/i.exec(postSnapshot)
    if (postBtn) {
      await browserControl.click(postBtn[1])
      await new Promise(r => setTimeout(r, 2000))
      return 'Reply posted successfully.'
    }
    return 'Typed the reply but could not find the submit button.'
  }

  return 'Could not find the reply input on this page. Make sure you are logged in. Snapshot:\n' + snapshot.slice(0, 2000)
}
