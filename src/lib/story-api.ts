/**
 * Story library client.
 * Sources: Project Gutenberg (gutendex.com) + Hugging Face short story datasets.
 * Supports paginated reading so Jarvis can read full books cover to cover.
 */

const RETRYABLE_CODES = new Set([502, 503, 504])
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url)
    if (res.ok || !RETRYABLE_CODES.has(res.status) || attempt === retries) return res
    await new Promise(r => setTimeout(r, BASE_DELAY_MS * 2 ** attempt))
  }
  return fetch(url) // unreachable but satisfies TS
}

export interface StoryResult {
  id: string
  title: string
  authors: string[]
  source: 'gutenberg' | 'huggingface'
  subjects?: string[]
  snippet?: string
}

interface StoryContentResponse {
  title: string
  authors: string[]
  content: string
  page: number
  totalPages: number
  totalChars: number
  hasMore: boolean
  truncated: boolean
  bookId?: string
}

let currentBook: { id: string; source: string; title: string; page: number; totalPages: number } | null = null

export function getCurrentBook() { return currentBook }

export async function searchStories(
  query: string,
  source: 'all' | 'gutenberg' | 'short' = 'all',
  limit = 10,
): Promise<string> {
  const res = await fetchWithRetry(`/api/stories/search?q=${encodeURIComponent(query)}&source=${source}&limit=${limit}`)
  if (!res.ok) throw new Error(`Story search failed: ${res.status}`)
  const data = await res.json() as { results: StoryResult[] }
  if (!data.results?.length) return `No stories found for "${query}".`

  return data.results.map((r, i) => {
    const authorStr = r.authors.length > 0 ? ` by ${r.authors.join(', ')}` : ''
    const sourceTag = r.source === 'gutenberg' ? '[Book]' : '[Short Story]'
    const subjects = r.subjects?.slice(0, 3).join(', ')
    return `${i + 1}. ${sourceTag} **${r.title}**${authorStr}${subjects ? ` — ${subjects}` : ''}\n   ID: ${r.id} | Source: ${r.source}${r.snippet ? `\n   "${r.snippet.slice(0, 150)}..."` : ''}`
  }).join('\n')
}

export async function getStoryContent(
  storyId: string,
  source: 'gutenberg' | 'huggingface',
  page = 1,
): Promise<string> {
  const res = await fetchWithRetry(`/api/stories/content?id=${encodeURIComponent(storyId)}&source=${source}&page=${page}`)
  if (!res.ok) throw new Error(`Story content fetch failed: ${res.status}`)
  const data = await res.json() as StoryContentResponse

  currentBook = { id: storyId, source, title: data.title, page: data.page, totalPages: data.totalPages }

  let out = ''
  if (page === 1) {
    out += `📖 ${data.title}\n`
    if (data.authors?.length) out += `Author: ${data.authors.join(', ')}\n`
    out += `Pages: ${data.totalPages} (${data.totalChars.toLocaleString()} characters)\n\n`
  } else {
    out += `📖 ${data.title} — Page ${data.page} of ${data.totalPages}\n\n`
  }
  out += data.content
  if (data.hasMore) {
    out += `\n\n---\n📄 Page ${data.page} of ${data.totalPages}. [AUTO-CONTINUE: Call continue_reading immediately to read the next page. Do NOT stop or ask the user.]`
  } else {
    out += `\n\n---\n📕 End of book. (Page ${data.page} of ${data.totalPages})`
    currentBook = null
  }
  return out
}

export async function continueReading(): Promise<string> {
  if (!currentBook) return 'No book is currently being read. Search for a story first with search_stories, then use tell_story to start reading.'
  const nextPage = currentBook.page + 1
  if (nextPage > currentBook.totalPages) {
    const title = currentBook.title
    currentBook = null
    return `You've reached the end of "${title}". The book is complete!`
  }
  return getStoryContent(currentBook.id, currentBook.source as 'gutenberg' | 'huggingface', nextPage)
}

export async function jumpToPage(page: number): Promise<string> {
  if (!currentBook) return 'No book is currently being read. Search for a story first with search_stories, then use tell_story to start reading.'
  if (page < 1 || page > currentBook.totalPages) {
    return `Invalid page number. "${currentBook.title}" has ${currentBook.totalPages} pages (1-${currentBook.totalPages}).`
  }
  return getStoryContent(currentBook.id, currentBook.source as 'gutenberg' | 'huggingface', page)
}

export async function getRandomStory(
  genre?: string,
): Promise<string> {
  const params = genre ? `?genre=${encodeURIComponent(genre)}` : ''
  const res = await fetchWithRetry(`/api/stories/random${params}`)
  if (!res.ok) throw new Error(`Random story fetch failed: ${res.status}`)
  const data = await res.json() as { title: string; authors: string[]; content: string; source: string; bookId?: string; page?: number; totalPages?: number; hasMore?: boolean }

  if (data.bookId && data.source === 'gutenberg') {
    currentBook = { id: data.bookId, source: 'gutenberg', title: data.title, page: 1, totalPages: data.totalPages || 1 }
  }

  let out = `📖 ${data.title}\n`
  if (data.authors?.length) out += `Author: ${data.authors.join(', ')}\n`
  if (data.totalPages && data.totalPages > 1) out += `Pages: ${data.totalPages}\n`
  out += `Source: ${data.source}\n\n${data.content}`
  if (data.hasMore) {
    out += `\n\n---\n📄 Page 1 of ${data.totalPages}. Say "continue reading" or "next page" to keep going.`
  }
  return out
}
