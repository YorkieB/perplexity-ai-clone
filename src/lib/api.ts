import { callLlm, llmPrompt } from './llm'
import { Source, FocusMode, SearchTrace } from './types'
import { dedupeSourcesByNormalizedUrl, getSourceHostname } from './source-utils'

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

export interface SearchExecutionResult {
  sources: Source[]
  trace: SearchTrace
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

async function executeWebSearchInternal(
  query: string,
  focusMode: FocusMode = 'all',
  isDeepResearch: boolean = false
): Promise<SearchExecutionResult | SearchError> {
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
    const executedAt = Date.now()
    if (import.meta.env.DEV) {
      console.debug('[search] executeWebSearch params', {
        query: enhancedQuery,
        focusMode,
        advanced: isDeepResearch,
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

    const data: TavilySearchResponse = await response.json()

    const rawSources: Source[] = data.results.map((result) => {
      const domain = getSourceHostname(result.url)
      return {
        url: result.url,
        title: result.title,
        snippet: result.content,
        confidence: Math.round(result.score * 100),
        domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      }
    })

    const sources = dedupeSourcesByNormalizedUrl(rawSources)

    return {
      sources,
      trace: {
        query: enhancedQuery,
        focusMode,
        advanced: isDeepResearch,
        executedAt,
        resultCount: sources.length,
      },
    }
  } catch (error) {
    console.error('Web search error:', error)
    return {
      error: true,
      message: 'Failed to perform web search. Please check your internet connection.',
    }
  }
}

export async function executeWebSearch(
  query: string,
  focusMode: FocusMode = 'all',
  isDeepResearch: boolean = false
): Promise<Source[] | SearchError> {
  const result = await executeWebSearchInternal(query, focusMode, isDeepResearch)
  if ('error' in result) return result
  return result.sources
}

export async function executeWebSearchWithTrace(
  query: string,
  focusMode: FocusMode = 'all',
  isDeepResearch: boolean = false
): Promise<SearchExecutionResult | SearchError> {
  return executeWebSearchInternal(query, focusMode, isDeepResearch)
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
      const normalized = parsed.questions
        .filter((question: unknown): question is string => typeof question === 'string')
        .map((question) => question.trim())
        .filter(Boolean)

      const unique: string[] = Array.from(new Set(normalized))
      return unique.slice(0, 3)
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
