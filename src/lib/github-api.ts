/**
 * GitHub API client for searching repos/code and fetching files.
 * All calls go through the proxy to avoid CORS and rate-limit issues.
 */

export async function searchGitHub(
  query: string,
  type: 'repositories' | 'code' = 'repositories',
  limit = 10,
): Promise<string> {
  const res = await fetch(`/api/github/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`)
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status}`)
  const data = await res.json() as { items: Array<{ full_name?: string; name?: string; description?: string; stargazers_count?: number; html_url?: string; path?: string; repository?: { full_name: string } }> }
  if (!data.items?.length) return `No ${type} found for "${query}".`

  if (type === 'repositories') {
    return data.items
      .slice(0, limit)
      .map((r, i) => {
        const stars = r.stargazers_count
          ? ' (' + r.stargazers_count.toLocaleString() + ' stars)'
          : ''
        return `${i + 1}. **${r.full_name}** — ${r.description?.slice(0, 120) || 'No description'}${stars}`
      })
      .join('\n')
  }
  return data.items.slice(0, limit).map((r, i) =>
    `${i + 1}. **${r.repository?.full_name}/${r.path}** — [link](${r.html_url})`
  ).join('\n')
}

export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const res = await fetch(`/api/github/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`GitHub file fetch failed: ${res.status}`)
  const data = await res.json() as { content: string; encoding: string; name: string; size: number }

  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''))
  }
  return data.content
}
