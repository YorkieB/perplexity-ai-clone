import { callLlm, llmPrompt } from './llm'
import { getPreferredChatModel } from './chat-preferences'
import { Source, FocusMode } from './types'
import { isSafeScheme, parseUrlSafely } from './url-validation'
import { buildSearchQueryWithFocus, normalizeSourceUrlForDedupe } from './search-utils'

export interface TavilySearchResult {
  url: string
  title: string
  content: string
  score: number
}

export interface TavilySearchResponse {
  results: TavilySearchResult[]
  query: string
}

export interface SearchError {
  error: true
  message: string
}

function normalizeSearchResult(result: TavilySearchResult): Source | null {
  if (!result || typeof result.url !== 'string') return null

  const parsed = parseUrlSafely(result.url)
  if (!parsed) return null
  if (!isSafeScheme(parsed.scheme)) return null

  let url: URL
  try {
    url = new URL(result.url)
  } catch {
    return null
  }

  // Defensive: reject credential-bearing URLs even if provider returns one.
  if (url.username || url.password) return null

  const domain = url.hostname.replace(/^www\./, '')
  if (!domain) return null

  const title = typeof result.title === 'string' ? result.title : domain
  const snippet = typeof result.content === 'string' ? result.content : ''
  const score = typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : 0
  const confidence = Math.max(0, Math.min(100, Math.round(score * 100)))

  return {
    url: url.href,
    title,
    snippet,
    confidence,
    domain,
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
  }
}

function dedupeSourcesByNormalizedUrl(sources: Source[]): Source[] {
  const deduped = new Map<string, Source>()

  for (const source of sources) {
    const normalized = normalizeSourceUrlForDedupe(source.url)
    if (!normalized) continue

    const existing = deduped.get(normalized)
    if (!existing) {
      deduped.set(normalized, source)
      continue
    }

    const existingScore = existing.confidence ?? 0
    const incomingScore = source.confidence ?? 0

    // Keep the highest-confidence duplicate; for ties retain first occurrence.
    if (incomingScore > existingScore) {
      deduped.set(normalized, source)
    }
  }

  return Array.from(deduped.values())
}

export function buildWebSearchQuery(query: string, focusMode: FocusMode): string {
  return buildSearchQueryWithFocus(query, focusMode)
}

export async function executeWebSearch(
  query: string,
  focusMode: FocusMode = 'all',
  isDeepResearch: boolean = false
): Promise<Source[] | SearchError> {
  try {
    const apiKey = import.meta.env.VITE_TAVILY_API_KEY

    if (!apiKey) {
      console.error('Tavily API key not configured')
      return {
        error: true,
        message: 'Search service not configured. Please add VITE_TAVILY_API_KEY to your environment variables.',
      }
    }

    const enhancedQuery = buildWebSearchQuery(query, focusMode)
    if (import.meta.env.DEV) {
      console.debug('[API] Web search params', {
        query: enhancedQuery,
        focusMode,
        searchDepth: isDeepResearch ? 'advanced' : 'basic',
        maxResults: isDeepResearch ? 12 : 6,
      })
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: enhancedQuery,
        search_depth: isDeepResearch ? 'advanced' : 'basic',
        include_answer: false,
        max_results: isDeepResearch ? 12 : 6,
      }),
    })

    if (!response.ok) {
      console.error('Tavily API error:', response.status, response.statusText)
      return {
        error: true,
        message: `Search failed with status ${response.status}`,
      }
    }

    const payload: unknown = await response.json()
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { results?: unknown }).results)
    ) {
      console.warn('[API] Tavily search returned invalid payload shape; expected results array.', payload)
      return {
        error: true,
        message: 'Search service returned an invalid response payload.',
      }
    }

    const data = payload as TavilySearchResponse
    const normalizedSources: Source[] = data.results
      .map((result) => normalizeSearchResult(result))
      .filter((source): source is Source => source !== null)
    const dedupedSources = dedupeSourcesByNormalizedUrl(normalizedSources)

    if (normalizedSources.length !== data.results.length) {
      console.warn(
        `[API] Dropped ${String(data.results.length - normalizedSources.length)} search results with invalid or unsafe URLs.`,
      )
    }
    if (dedupedSources.length !== normalizedSources.length) {
      console.warn(
        `[API] Deduplicated ${String(normalizedSources.length - dedupedSources.length)} search results by normalized URL.`,
      )
    }

    return dedupedSources
  } catch (error) {
    console.error('Web search error:', error)
    return {
      error: true,
      message: 'Failed to perform web search. Please check your internet connection.',
    }
  }
}

export async function generateFollowUpQuestions(
  query: string,
  response: string,
  sources: Source[]
): Promise<string[]> {
  try {
    const prompt = llmPrompt`Based on this conversation, generate 3 concise follow-up questions that would help the user dig deeper.

User Query: ${query}

Assistant Response: ${response.substring(0, 500)}...

Sources covered: ${sources.map((s) => s.title).join(', ')}

Return a JSON object only, with this shape: {"questions": ["question1", "question2", "question3"]}. Each question must be specific and actionable.`

    const result = await callLlm(prompt, getPreferredChatModel('gpt-4o-mini'), true)
    const parsed: unknown = JSON.parse(result)
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { questions?: unknown }).questions)
    ) {
      return (parsed as { questions: unknown[] }).questions
        .filter((question): question is string => typeof question === 'string')
        .map((question) => question.trim())
        .filter((question) => question.length > 0)
        .slice(0, 3)
    }

    console.warn('[API] Follow-up generation returned invalid payload shape; using empty follow-ups.', parsed)
    return []
  } catch (error) {
    console.error('Failed to generate follow-up questions:', error)
    return []
  }
}

export interface ModelCouncilResult {
  models: Array<{
    model: string
    content: string
    generatedAt: number
    responseTime?: number
    tokenCount?: number
  }>
  convergence: {
    score: number
    commonThemes: string[]
    divergentPoints: string[]
  }
}

export async function executeModelCouncil(
  query: string,
  contextSection: string,
  fileContext: string,
  systemPrompt: string,
  selectedModels: string[] = ['gpt-4o', 'gpt-4o-mini']
): Promise<ModelCouncilResult> {
  const models = selectedModels.length > 0 ? selectedModels : ['gpt-4o', 'gpt-4o-mini']

  let answerStyleInstruction: string
  if (contextSection) {
    answerStyleInstruction =
      'Using the web search results provided above, give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
  } else if (fileContext) {
    answerStyleInstruction =
      'Analyze the provided files and answer the user query based on the file content.'
  } else {
    answerStyleInstruction = 'Provide a helpful, accurate answer based on your knowledge.'
  }

  const basePrompt = `You are an advanced AI research assistant.${
    systemPrompt ? ` ${systemPrompt}` : ''
  }${contextSection}${fileContext}

User query: ${query}

${answerStyleInstruction}`

  const responses = await Promise.all(
    models.map(async (model) => {
      const startTime = Date.now()
      try {
        const content = await callLlm(basePrompt, model)
        const responseTime = Date.now() - startTime
        const tokenCount = Math.ceil((basePrompt.length + content.length) / 4)
        return {
          model,
          content,
          generatedAt: Date.now(),
          responseTime,
          tokenCount,
        }
      } catch (error) {
        console.error(`Failed to get response from ${model}:`, error)
        const responseTime = Date.now() - startTime
        return {
          model,
          content: `Error: Failed to generate response from ${model}`,
          generatedAt: Date.now(),
          responseTime,
          tokenCount: 0,
        }
      }
    })
  )

  const analysisPrompt = llmPrompt`Analyze these responses from different AI models to the same query and identify:
1. A convergence score (0-100) indicating how much the models agree
2. Common themes that appear in all responses
3. Divergent points where models disagree or take different approaches

Query: ${query}

${responses
  .map(
    (r, i) => `
Model ${i + 1} (${r.model}):
${r.content}
`
  )
  .join('\n')}

Return a JSON object with this structure:
{
  "score": <number 0-100>,
  "commonThemes": ["theme1", "theme2"],
  "divergentPoints": ["difference1", "difference2"]
}`

  try {
    const analysisResult = await callLlm(analysisPrompt, getPreferredChatModel('gpt-4o-mini'), true)
    const parsed: unknown = JSON.parse(analysisResult)
    const hasExpectedShape =
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { score?: unknown }).score === 'number' &&
      Array.isArray((parsed as { commonThemes?: unknown }).commonThemes) &&
      Array.isArray((parsed as { divergentPoints?: unknown }).divergentPoints)
    if (!hasExpectedShape) {
      console.warn(
        '[API] Model council convergence payload missing expected shape; using normalized defaults.',
        parsed,
      )
    }
    const convergence = hasExpectedShape ? (parsed as { score: number; commonThemes: unknown[]; divergentPoints: unknown[] }) : {
      score: 0,
      commonThemes: [],
      divergentPoints: [],
    }
    
    return {
      models: responses,
      convergence: {
        score: convergence.score || 0,
        commonThemes: (convergence.commonThemes || []).filter((item): item is string => typeof item === 'string'),
        divergentPoints: (convergence.divergentPoints || []).filter((item): item is string => typeof item === 'string'),
      },
    }
  } catch (error) {
    console.error('Failed to analyze convergence:', error)
    return {
      models: responses,
      convergence: {
        score: 0,
        commonThemes: [],
        divergentPoints: [],
      },
    }
  }
}
