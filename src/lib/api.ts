import { callLlm, llmPrompt } from './llm'
import { Source, FocusMode } from './types'

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

export const DEEP_RESEARCH_MIN_SUB_QUERIES = 3
export const DEEP_RESEARCH_MAX_SUB_QUERIES = 5
export const DEEP_RESEARCH_MAX_SNIPPETS_FOR_SYNTHESIS = 40

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
  isDeepResearch: boolean = false,
  signal?: AbortSignal
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
      signal,
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

    const data: TavilySearchResponse = await response.json()

    const sources: Source[] = data.results.map((result) => {
      const url = new URL(result.url)
      const domain = url.hostname.replace('www.', '')
      
      return {
        url: result.url,
        title: result.title,
        snippet: result.content,
        confidence: Math.round(result.score * 100),
        domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      }
    })

    return sources
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    console.error('Web search error:', error)
    return {
      error: true,
      message: 'Failed to perform web search. Please check your internet connection.',
    }
  }
}

function stripListPrefix(value: string): string {
  return value.replace(/^[-*\d.)\s]+/, '').trim()
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const query of queries) {
    const normalized = query.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(query.trim())
  }
  return unique
}

function parseSubQueries(raw: string): string[] {
  let candidateQueries: string[] = []

  try {
    const parsed = JSON.parse(raw) as unknown

    if (Array.isArray(parsed)) {
      candidateQueries = parsed.filter((item): item is string => typeof item === 'string')
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.subQueries)) {
        candidateQueries = obj.subQueries.filter((item): item is string => typeof item === 'string')
      } else if (Array.isArray(obj.queries)) {
        candidateQueries = obj.queries.filter((item): item is string => typeof item === 'string')
      }
    }
  } catch {
    candidateQueries = raw
      .split('\n')
      .map((line) => stripListPrefix(line))
      .filter(Boolean)
  }

  return dedupeQueries(candidateQueries.map((q) => stripListPrefix(q)).filter(Boolean))
}

function fallbackSubQueries(userQuery: string): string[] {
  return [
    userQuery,
    `${userQuery} latest data and evidence`,
    `${userQuery} counterarguments and caveats`,
  ]
}

export async function planDeepResearchSubQueries(params: {
  query: string
  focusMode: FocusMode
  workspaceContext?: string
  model?: string
  signal?: AbortSignal
}): Promise<string[]> {
  const { query, focusMode, workspaceContext = '', model = 'gpt-4o-mini', signal } = params
  const prompt = llmPrompt`You are planning a deep research run.

Create exactly ${DEEP_RESEARCH_MIN_SUB_QUERIES} to ${DEEP_RESEARCH_MAX_SUB_QUERIES} focused web-search sub-queries for the user goal.

Rules:
- Cover breadth first, then depth (definitions, current evidence, and caveats/trade-offs where relevant).
- Keep each sub-query short and directly searchable.
- Respect the selected focus mode.
- Avoid duplicate intent.

User goal: ${query}
Focus mode: ${focusMode}
Workspace context: ${workspaceContext || '[none]'}

Return only valid JSON:
{
  "subQueries": ["...", "...", "..."]
}`

  const raw = await callLlm(prompt, model, true, signal)
  const parsed = parseSubQueries(raw)
  const withFallback = dedupeQueries([...parsed, ...fallbackSubQueries(query)])
  return withFallback.slice(0, DEEP_RESEARCH_MAX_SUB_QUERIES)
}

export interface DeepResearchSearchBundle {
  subQuery: string
  sources: Source[]
}

export async function synthesizeDeepResearchAnswer(params: {
  query: string
  focusMode: FocusMode
  subQueries: string[]
  bundles: DeepResearchSearchBundle[]
  workspaceContext?: string
  fileContext?: string
  model?: string
  signal?: AbortSignal
}): Promise<string> {
  const {
    query,
    focusMode,
    subQueries,
    bundles,
    workspaceContext = '',
    fileContext = '',
    model = 'gpt-4o-mini',
    signal,
  } = params

  const flattened = bundles
    .flatMap((bundle) =>
      bundle.sources.map((source) => ({
        subQuery: bundle.subQuery,
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        confidence: source.confidence ?? null,
      }))
    )
    .slice(0, DEEP_RESEARCH_MAX_SNIPPETS_FOR_SYNTHESIS)

  const prompt = llmPrompt`You are a rigorous research assistant. Synthesize the research packet into a final answer.

User goal: ${query}
Focus mode: ${focusMode}
Planned sub-queries: ${subQueries}
Workspace context: ${workspaceContext || '[none]'}
File context: ${fileContext || '[none]'}

Research packet (JSON): ${flattened}

Output requirements:
- Start with a direct answer in 2-4 sentences.
- Then provide key findings grounded in the packet.
- Use markdown tables when comparing options, sources, or claims.
- Include uncertainties or conflicting evidence explicitly.
- Add a short "Sources consulted" section listing the most important URLs.
`

  return callLlm(prompt, model, false, signal)
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

    const result = await callLlm(prompt, 'gpt-4o-mini', true)
    const parsed = JSON.parse(result)

    if (parsed.questions && Array.isArray(parsed.questions)) {
      return parsed.questions.slice(0, 3)
    }
    
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
    const analysisResult = await callLlm(analysisPrompt, 'gpt-4o-mini', true)
    const convergence = JSON.parse(analysisResult)
    
    return {
      models: responses,
      convergence: {
        score: convergence.score || 0,
        commonThemes: convergence.commonThemes || [],
        divergentPoints: convergence.divergentPoints || [],
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
