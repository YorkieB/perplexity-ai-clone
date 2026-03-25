/**
 * Story library client.
 * Sources: Project Gutenberg (gutendex.com) + Hugging Face short story datasets.
 * All calls go through the server proxy.
 */

export interface StoryResult {
  id: string
  title: string
  authors: string[]
  source: 'gutenberg' | 'huggingface'
  subjects?: string[]
  snippet?: string
}

export async function searchStories(
  query: string,
  source: 'all' | 'gutenberg' | 'short' = 'all',
  limit = 10,
): Promise<string> {
  const res = await fetch(`/api/stories/search?q=${encodeURIComponent(query)}&source=${source}&limit=${limit}`)
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
  maxChars = 8000,
): Promise<string> {
  const res = await fetch(`/api/stories/content?id=${encodeURIComponent(storyId)}&source=${source}&maxChars=${maxChars}`)
  if (!res.ok) throw new Error(`Story content fetch failed: ${res.status}`)
  const data = await res.json() as { title: string; authors: string[]; content: string; truncated: boolean; totalChars: number }

  let out = `Title: ${data.title}\n`
  if (data.authors?.length) out += `Author: ${data.authors.join(', ')}\n`
  out += `\n${data.content}`
  if (data.truncated) out += `\n\n[Story truncated — ${data.totalChars.toLocaleString()} characters total. Ask for more to continue reading.]`
  return out
}

export async function getRandomStory(
  genre?: string,
): Promise<string> {
  const params = genre ? `?genre=${encodeURIComponent(genre)}` : ''
  const res = await fetch(`/api/stories/random${params}`)
  if (!res.ok) throw new Error(`Random story fetch failed: ${res.status}`)
  const data = await res.json() as { title: string; authors: string[]; content: string; source: string }

  let out = `Title: ${data.title}\n`
  if (data.authors?.length) out += `Author: ${data.authors.join(', ')}\n`
  out += `Source: ${data.source}\n\n${data.content}`
  return out
}
