import { callLlm, llmPrompt } from './llm'
import { getPreferredChatModel } from './chat-preferences'
import { Source, FocusMode } from './types'
import { isSafeScheme, parseUrlSafely } from './url-validation'
import {
  dedupeRankedSourcesByNormalizedUrl,
  type RankedSourceCandidate,
  sanitizeFollowUpQuestions,
} from './search-utils'

export interface TavilySearchResult {
  url: string
  title: string
  content: string
  score: number
}

export interface SearchError {
  error: true
  message: string
}

function normalizeSearchResult(result: TavilySearchResult): RankedSourceCandidate | null {
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
    source: {
      url: url.href,
      title,
      snippet,
      confidence,
      domain,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    },
    score,
  }
}

function hasResultsArray(value: unknown): value is { results: TavilySearchResult[] } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { results?: unknown }
  return Array.isArray(candidate.results)
}

function getFocusModeSearchModifier(focusMode: FocusMode): string {
  switch (focusMode) {
    case 'academic':
      return ' site:edu OR site:arxiv.org OR site:scholar.google.com'
    case 'reddit':
      return ' site:reddit.com'
    case 'youtube':
      return ' site:youtube.com'
    case 'news':
      return ' (news OR latest OR breaking)'
    case 'code':
      return ' site:github.com OR site:stackoverflow.com OR site:docs OR (code OR api OR library)'
    case 'all':
    default:
      return ''
  }
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

    const focusModifier = getFocusModeSearchModifier(focusMode)
    const enhancedQuery = query + focusModifier

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

    const data: unknown = await response.json()
    if (!hasResultsArray(data)) {
      console.warn('[API] Tavily search returned invalid payload shape; expected results array.', {
        payloadType: typeof data,
      })
      return {
        error: true,
        message: 'Search failed: invalid response payload from provider.',
      }
    }

    const rankedCandidates = data.results
      .map((result) => normalizeSearchResult(result))
      .filter((candidate): candidate is RankedSourceCandidate => candidate !== null)

    if (rankedCandidates.length !== data.results.length) {
      console.warn(
        `[API] Dropped ${String(data.results.length - rankedCandidates.length)} search results with invalid or unsafe URLs.`,
      )
    }

    const sources: Source[] = dedupeRankedSourcesByNormalizedUrl(rankedCandidates)
    return sources
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
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { questions?: unknown }).questions)) {
      console.warn('[API] Follow-up generation returned invalid payload shape; expected questions array.', {
        payloadType: typeof parsed,
      })
      return []
    }

    const questions = ((parsed as { questions: unknown[] }).questions)
      .filter((item): item is string => typeof item === 'string')

    return sanitizeFollowUpQuestions(questions, response, 3)
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
    const convergencePayload: unknown = JSON.parse(analysisResult)
    const convergenceRecord = (convergencePayload && typeof convergencePayload === 'object')
      ? (convergencePayload as { score?: unknown; commonThemes?: unknown; divergentPoints?: unknown })
      : {}

    const hasExpectedShape =
      typeof convergenceRecord.score === 'number' &&
      Array.isArray(convergenceRecord.commonThemes) &&
      Array.isArray(convergenceRecord.divergentPoints)
    if (!hasExpectedShape) {
      console.warn(
        '[API] Model council convergence payload missing expected shape; using normalized defaults.',
        {
          payloadType: typeof convergencePayload,
        },
      )
    }

    const normalizedScore = typeof convergenceRecord.score === 'number' && Number.isFinite(convergenceRecord.score)
      ? Math.max(0, Math.min(100, Math.round(convergenceRecord.score)))
      : 0
    const normalizedCommonThemes = Array.isArray(convergenceRecord.commonThemes)
      ? convergenceRecord.commonThemes.filter((item): item is string => typeof item === 'string')
      : []
    const normalizedDivergentPoints = Array.isArray(convergenceRecord.divergentPoints)
      ? convergenceRecord.divergentPoints.filter((item): item is string => typeof item === 'string')
      : []

    return {
      models: responses,
      convergence: {
        score: normalizedScore,
        commonThemes: normalizedCommonThemes,
        divergentPoints: normalizedDivergentPoints,
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
