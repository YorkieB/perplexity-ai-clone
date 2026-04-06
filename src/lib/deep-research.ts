import { getPreferredChatModel } from './chat-preferences'
import { callLlm, callLlmChat, llmPrompt } from './llm'
import type { FocusMode, Source } from './types'

export const DEEP_RESEARCH_MAX_SUB_QUERIES = 5
export const DEEP_RESEARCH_MIN_SUB_QUERIES = 3
export const DEEP_RESEARCH_SEARCH_DELAY_MS = 250
export const DEEP_RESEARCH_SEARCH_POLICY = 'continue_on_error' as const

const MAX_SUB_QUERY_LENGTH = 180
const MAX_SYNTHESIS_SOURCES = 30
const MAX_SNIPPET_LENGTH = 600

interface DeepResearchPlanShape {
  subQueries?: unknown
  queries?: unknown
  plan?: unknown
}

interface PlanDeepResearchArgs {
  userQuery: string
  focusMode: FocusMode
  workspacePrompt?: string
  workspaceFilesContext?: string
  attachedFilesContext?: string
  model?: string
}

interface DeepResearchFinding {
  subQuery: string
  sources: Source[]
}

interface SynthesizeDeepResearchArgs {
  userQuery: string
  focusMode: FocusMode
  findings: DeepResearchFinding[]
  workspacePrompt?: string
  ragContext?: string
  workspaceFilesContext?: string
  attachedFilesContext?: string
  failedSubQueries?: string[]
  model?: string
}

function normalizeSubQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeSubQueries(values: unknown[]): string[] {
  const unique = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const cleaned = normalizeSubQuery(value)
    if (!cleaned) continue
    unique.add(cleaned.slice(0, MAX_SUB_QUERY_LENGTH))
    if (unique.size >= DEEP_RESEARCH_MAX_SUB_QUERIES) break
  }
  return Array.from(unique)
}

function parseDeepResearchPlan(rawPlan: string): string[] {
  try {
    const parsed = JSON.parse(rawPlan) as DeepResearchPlanShape
    if (Array.isArray(parsed.subQueries)) {
      return sanitizeSubQueries(parsed.subQueries)
    }
    if (Array.isArray(parsed.queries)) {
      return sanitizeSubQueries(parsed.queries)
    }
    if (Array.isArray(parsed.plan)) {
      return sanitizeSubQueries(parsed.plan)
    }
  } catch {
    // Fall back to line-based extraction below.
  }

  const lineCandidates = rawPlan
    .split('\n')
    .map((line) => line.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter((line) => line.length > 0)
  return sanitizeSubQueries(lineCandidates)
}

function buildFallbackSubQueries(userQuery: string): string[] {
  return sanitizeSubQueries([
    userQuery,
    `${userQuery} key facts and current state`,
    `${userQuery} risks, tradeoffs, and alternatives`,
  ])
}

function summarizeFindingsForPrompt(findings: DeepResearchFinding[]): string {
  const flattened = findings.flatMap((finding) =>
    finding.sources.map((source) => ({
      subQuery: finding.subQuery,
      source,
    }))
  )

  const bounded = flattened.slice(0, MAX_SYNTHESIS_SOURCES)
  return bounded
    .map(({ subQuery, source }, idx) => {
      const snippet =
        source.snippet.length > MAX_SNIPPET_LENGTH
          ? `${source.snippet.slice(0, MAX_SNIPPET_LENGTH)}...`
          : source.snippet
      return `[${
        idx + 1
      }] Sub-query: ${subQuery}\nTitle: ${source.title}\nURL: ${source.url}\nSnippet: ${snippet}\n`
    })
    .join('\n')
}

export async function planDeepResearchSubQueries({
  userQuery,
  focusMode,
  workspacePrompt = '',
  workspaceFilesContext = '',
  attachedFilesContext = '',
  model,
}: PlanDeepResearchArgs): Promise<string[]> {
  const plannerModel = model || getPreferredChatModel('gpt-4o-mini')
  const prompt = llmPrompt`You are preparing a deep web research plan.

Create 3-5 precise web search sub-queries for this user request.
Rules:
- Return JSON only.
- Use this shape: {"subQueries":["...", "..."]}.
- Keep each sub-query concise and web-searchable.
- Avoid duplicates.
- Respect the requested focus mode.

User request: ${userQuery}
Focus mode: ${focusMode}
Workspace custom instructions: ${workspacePrompt || '[none]'}
Workspace file context: ${workspaceFilesContext || '[none]'}
Attached file context: ${attachedFilesContext || '[none]'}`

  const raw = await callLlm(prompt, plannerModel, true)
  const parsed = parseDeepResearchPlan(raw)

  if (parsed.length < DEEP_RESEARCH_MIN_SUB_QUERIES) {
    return buildFallbackSubQueries(userQuery)
  }
  return parsed.slice(0, DEEP_RESEARCH_MAX_SUB_QUERIES)
}

export async function synthesizeDeepResearchReport({
  userQuery,
  focusMode,
  findings,
  workspacePrompt = '',
  ragContext = '',
  workspaceFilesContext = '',
  attachedFilesContext = '',
  failedSubQueries = [],
  model,
}: SynthesizeDeepResearchArgs): Promise<string> {
  const synthesisModel = model || getPreferredChatModel('gpt-4o-mini')
  const findingsContext = summarizeFindingsForPrompt(findings)
  const failureContext =
    failedSubQueries.length > 0
      ? `Some sub-queries failed and were skipped: ${failedSubQueries.join('; ')}`
      : 'All planned sub-queries completed.'

  const userPrompt = llmPrompt`User goal: ${userQuery}
Focus mode: ${focusMode}

Research findings:
${findingsContext || '[No usable web findings found]'}

Search execution notes:
${failureContext}

Retrieved knowledge:
${ragContext || '[none]'}

Workspace files:
${workspaceFilesContext || '[none]'}

Attached files:
${attachedFilesContext || '[none]'}

Produce a final answer that is accurate, source-grounded, and easy to scan.
When comparing options/sources, prefer markdown tables.
Cite source numbers like [1], [2] inline where useful.`

  return callLlmChat(
    [
      {
        role: 'system',
        content: workspacePrompt
          ? `You are a rigorous research assistant. Follow these workspace instructions: ${workspacePrompt}`
          : 'You are a rigorous research assistant.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    synthesisModel,
    { temperature: 0.3, max_tokens: 4096 }
  )
}
