import { callLlm, llmPrompt } from './llm'
import { Source, FocusMode, DeepResearchMeta, DeepResearchFailure } from './types'

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

export const DEEP_RESEARCH_MAX_SUB_QUERIES = 5
export const DEEP_RESEARCH_MIN_SUB_QUERIES = 3
export const DEEP_RESEARCH_SEARCH_CONCURRENCY = 1

const DEEP_RESEARCH_PLANNER_MODEL = 'gpt-4o-mini'
const DEEP_RESEARCH_SYNTHESIS_MODEL = 'gpt-4o-mini'
const DEEP_RESEARCH_SNIPPET_LIMIT = 700

export interface DeepResearchProgressUpdate {
  stage: 'planning' | 'searching' | 'synthesizing'
  currentSearch?: number
  totalSearches?: number
  subQuery?: string
}

export interface DeepResearchResult {
  content: string
  sources: Source[]
  meta: DeepResearchMeta
  failures: DeepResearchFailure[]
}

interface ExecuteDeepResearchParams {
  query: string
  focusMode: FocusMode
  systemPrompt?: string
  fileContext?: string
  onProgress?: (update: DeepResearchProgressUpdate) => void
  onSubSearchError?: (error: DeepResearchFailure) => void
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

function parsePlannerSubQueries(rawPlannerResponse: string): string[] {
  const tryParse = (raw: string): string[] | null => {
    try {
      const parsed = JSON.parse(raw) as { subQueries?: unknown }
      if (!Array.isArray(parsed.subQueries)) {
        return null
      }

      return parsed.subQueries
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    } catch {
      return null
    }
  }

  const direct = tryParse(rawPlannerResponse)
  if (direct) {
    return direct
  }

  const jsonMatch = rawPlannerResponse.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return []
  }

  return tryParse(jsonMatch[0]) || []
}

function buildFallbackSubQueries(query: string): string[] {
  return [
    query,
    `${query} latest developments`,
    `${query} expert analysis and critique`,
  ]
}

function normalizePlannedQueries(query: string, plannedQueries: string[]): string[] {
  const withFallback = plannedQueries.length > 0 ? plannedQueries : buildFallbackSubQueries(query)

  const deduped = Array.from(
    new Set(
      withFallback
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

  if (deduped.length < DEEP_RESEARCH_MIN_SUB_QUERIES) {
    const fallbackQueries = buildFallbackSubQueries(query)
    for (const fallbackQuery of fallbackQueries) {
      if (deduped.length >= DEEP_RESEARCH_MIN_SUB_QUERIES) {
        break
      }
      if (!deduped.includes(fallbackQuery)) {
        deduped.push(fallbackQuery)
      }
    }
  }

  return deduped.slice(0, DEEP_RESEARCH_MAX_SUB_QUERIES)
}

function dedupeSourcesByUrl(sources: Source[]): Source[] {
  const seenUrls = new Set<string>()
  const deduped: Source[] = []

  for (const source of sources) {
    if (!seenUrls.has(source.url)) {
      seenUrls.add(source.url)
      deduped.push(source)
    }
  }

  return deduped
}

function clipSnippet(snippet: string): string {
  if (snippet.length <= DEEP_RESEARCH_SNIPPET_LIMIT) {
    return snippet
  }
  return `${snippet.slice(0, DEEP_RESEARCH_SNIPPET_LIMIT)}...`
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
    console.error('Web search error:', error)
    return {
      error: true,
      message: 'Failed to perform web search. Please check your internet connection.',
    }
  }
}

export async function executeDeepResearch({
  query,
  focusMode,
  systemPrompt = '',
  fileContext = '',
  onProgress,
  onSubSearchError,
}: ExecuteDeepResearchParams): Promise<DeepResearchResult> {
  const startedAt = Date.now()

  onProgress?.({ stage: 'planning' })
  const planningStartedAt = Date.now()

  let subQueries = buildFallbackSubQueries(query).slice(0, DEEP_RESEARCH_MAX_SUB_QUERIES)
  try {
    const plannerPrompt = llmPrompt`You are a research planner.
Create a focused research plan for this user question.

User question:
${query}

Focus mode:
${focusMode}

Workspace instructions (if any):
${systemPrompt || 'None'}

Attached file context (if any):
${fileContext || 'None'}

Return JSON only using this exact shape:
{
  "subQueries": ["query 1", "query 2", "query 3"]
}

Rules:
- Produce between ${DEEP_RESEARCH_MIN_SUB_QUERIES} and ${DEEP_RESEARCH_MAX_SUB_QUERIES} sub-queries.
- Each sub-query should target a distinct research angle.
- Keep each sub-query concise and web-search friendly.
- Do not include explanations or extra keys.`

    const plannerResponse = await callLlm(plannerPrompt, DEEP_RESEARCH_PLANNER_MODEL, true)
    const parsedSubQueries = parsePlannerSubQueries(plannerResponse)
    subQueries = normalizePlannedQueries(query, parsedSubQueries)
  } catch (error) {
    console.error('Deep research planner failed, falling back to default sub-queries:', error)
    subQueries = normalizePlannedQueries(query, [])
  }

  const planningDuration = Date.now() - planningStartedAt

  const searchingStartedAt = Date.now()
  const successfulSubQueries: string[] = []
  const failedSubQueries: DeepResearchFailure[] = []
  const groupedSources: Array<{ subQuery: string; sources: Source[] }> = []

  for (let index = 0; index < subQueries.length; index++) {
    const subQuery = subQueries[index]

    onProgress?.({
      stage: 'searching',
      currentSearch: index + 1,
      totalSearches: subQueries.length,
      subQuery,
    })

    const searchResult = await executeWebSearch(subQuery, focusMode, true)

    if ('error' in searchResult) {
      const failure = {
        subQuery,
        reason: searchResult.message,
      }
      failedSubQueries.push(failure)
      onSubSearchError?.(failure)
      continue
    }

    if (searchResult.length === 0) {
      const failure = {
        subQuery,
        reason: 'No sources returned for this sub-query.',
      }
      failedSubQueries.push(failure)
      onSubSearchError?.(failure)
      continue
    }

    groupedSources.push({
      subQuery,
      sources: searchResult,
    })
    successfulSubQueries.push(subQuery)
  }

  const searchingDuration = Date.now() - searchingStartedAt

  onProgress?.({ stage: 'synthesizing' })
  const synthesisStartedAt = Date.now()

  const researchContext = groupedSources.length > 0
    ? groupedSources
        .map(
          (group, groupIndex) => `### Sub-query ${groupIndex + 1}: ${group.subQuery}
${group.sources
  .map(
    (source, sourceIndex) => `[${groupIndex + 1}.${sourceIndex + 1}] ${source.title}
URL: ${source.url}
Snippet: ${clipSnippet(source.snippet)}
`
  )
  .join('\n')}`
        )
        .join('\n\n')
    : 'No successful web sources were collected.'

  const failedContext = failedSubQueries.length > 0
    ? failedSubQueries
        .map((failure, index) => `${index + 1}. ${failure.subQuery} — ${failure.reason}`)
        .join('\n')
    : 'None'

  const synthesisPrompt = llmPrompt`You are an advanced research assistant synthesizing a multi-step web research run.
${systemPrompt ? `\nWorkspace instructions:\n${systemPrompt}\n` : ''}
${fileContext ? `\nAttached file context:\n${fileContext}\n` : ''}

User goal:
${query}

Research packets:
${researchContext}

Failed sub-searches:
${failedContext}

Instructions:
- Synthesize evidence across the successful sources.
- Be explicit about uncertainties and conflicting evidence.
- If comparing multiple options or sources, use markdown tables when helpful.
- If any sub-searches failed, include a short "Coverage gaps" section.
- Keep the answer practical and structured.`

  const synthesizedContent = await callLlm(synthesisPrompt, DEEP_RESEARCH_SYNTHESIS_MODEL)
  const synthesisDuration = Date.now() - synthesisStartedAt

  const finalContent = failedSubQueries.length > 0
    ? `> Deep research note: ${failedSubQueries.length} sub-search${failedSubQueries.length > 1 ? 'es' : ''} failed. Coverage is partial.\n\n${synthesizedContent}`
    : synthesizedContent

  const sources = dedupeSourcesByUrl(groupedSources.flatMap((group) => group.sources))
  const totalDuration = Date.now() - startedAt

  return {
    content: finalContent,
    sources,
    failures: failedSubQueries,
    meta: {
      plannerModel: DEEP_RESEARCH_PLANNER_MODEL,
      synthesisModel: DEEP_RESEARCH_SYNTHESIS_MODEL,
      subQueries,
      successfulSubQueries,
      failedSubQueries,
      timingsMs: {
        planning: planningDuration,
        searching: searchingDuration,
        synthesis: synthesisDuration,
        total: totalDuration,
      },
      limits: {
        maxSubQueries: DEEP_RESEARCH_MAX_SUB_QUERIES,
        searchConcurrency: DEEP_RESEARCH_SEARCH_CONCURRENCY,
        searchDepth: 'advanced',
      },
    },
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
  
  const basePrompt = `You are an advanced AI research assistant.${
    systemPrompt ? ` ${systemPrompt}` : ''
  }${contextSection}${fileContext}

User query: ${query}

${
  contextSection
    ? 'Using the web search results provided above, give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
    : fileContext
    ? 'Analyze the provided files and answer the user query based on the file content.'
    : 'Provide a helpful, accurate answer based on your knowledge.'
}`

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
