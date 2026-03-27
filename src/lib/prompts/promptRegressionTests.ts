/**
 * Automated regression checks for Jarvis routing, tool policy, and retrieval gate behaviour.
 *
 * Runs against a live {@link semanticRouter} (embeddings API required). Call from Node/Electron
 * or CI with `OPENAI_API_KEY` set. Optional: pair with {@link validatePrompt} when registering prompts.
 */

import SessionIndex from '@/memory/sessionIndex'
import RetrievalGate, { type LongTermIndex } from '@/rag/retrievalGate'
import { applyOverrides } from '@/lib/router/overrideRules'
import { semanticRouter } from '@/lib/router/semanticRouter'
import { loadToolsForIntent } from '@/lib/toolLoader'

export { validatePrompt } from './promptValidator'

const LOG = '[RegressionTests]'

/** Embedding dimension for `text-embedding-3-small` (deterministic zero vectors, no network). */
const EMBED_DIM = 1536

const MUST_USE_CONTEXT_ROUTES = new Set(['code_instruction', 'clarification_needed', 'voice_task'])

/** Single scenario exercised against the router + tool loader + retrieval gate. */
export interface RegressionTestCase {
  id: string
  description: string
  category: 'routing' | 'context_awareness' | 'tool_policy' | 'structural'
  userMessage: string
  expectedRoute: string
  expectedShouldSearchWeb: boolean
  expectedToolsLoaded: string[]
  mustNotSearchWeb: boolean
  mustUseContext: boolean
}

/** Canonical regression matrix (extend at runtime via {@link addRegressionTest}). */
export const REGRESSION_TEST_CASES: RegressionTestCase[] = [
  {
    id: 'original-failure-1',
    description: 'Recode instruction must NEVER trigger web search',
    category: 'routing',
    userMessage: 'recode this to use useCallback for the click handler',
    expectedRoute: 'code_instruction',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'original-failure-2',
    description: 'Back-reference must NEVER trigger web search',
    category: 'routing',
    userMessage: 'I have just given it you above',
    expectedRoute: 'clarification_needed',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'route-code-1',
    description: 'Fix instruction on shared code',
    category: 'routing',
    userMessage: 'fix the TypeScript errors in this',
    expectedRoute: 'code_instruction',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'route-code-2',
    description: 'Refactor instruction',
    category: 'routing',
    userMessage: 'refactor this into smaller functions',
    expectedRoute: 'code_instruction',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'route-voice-1',
    description: 'Voice emotion modification',
    category: 'routing',
    userMessage: 'make the voice sound angrier',
    expectedRoute: 'voice_task',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: ['voice_synthesis'],
    mustNotSearchWeb: false,
    mustUseContext: true,
  },
  {
    id: 'route-knowledge-1',
    description: 'Knowledge lookup should allow web search',
    category: 'routing',
    userMessage: 'what are the latest updates to React 19',
    expectedRoute: 'knowledge_lookup',
    expectedShouldSearchWeb: true,
    expectedToolsLoaded: ['web_search', 'rag_search'],
    mustNotSearchWeb: false,
    mustUseContext: false,
  },
  {
    id: 'route-clarification-1',
    description: 'See above reference',
    category: 'routing',
    userMessage: 'see my previous message',
    expectedRoute: 'clarification_needed',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'route-clarification-2',
    description: 'Already gave reference',
    category: 'routing',
    userMessage: 'I already gave you that',
    expectedRoute: 'clarification_needed',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'route-conv-1',
    description: 'Simple acknowledgement is conversational',
    category: 'routing',
    userMessage: 'thanks',
    expectedRoute: 'conversational',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: false,
    mustUseContext: false,
  },
  {
    id: 'context-1',
    description: 'Action verb on this → code_instruction not search',
    category: 'context_awareness',
    userMessage: 'update this function',
    expectedRoute: 'code_instruction',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'context-2',
    description: 'Use what I gave → clarification_needed',
    category: 'context_awareness',
    userMessage: 'use what I gave you',
    expectedRoute: 'clarification_needed',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
  {
    id: 'structural-1',
    description: 'code_instruction route must have zero tools',
    category: 'tool_policy',
    userMessage: 'recode this component',
    expectedRoute: 'code_instruction',
    expectedShouldSearchWeb: false,
    expectedToolsLoaded: [],
    mustNotSearchWeb: true,
    mustUseContext: true,
  },
]

/** Outcome for one {@link RegressionTestCase}. */
export interface RegressionTestResult {
  testId: string
  description: string
  passed: boolean
  actualRoute: string
  expectedRoute: string
  actualShouldSearchWeb: boolean
  expectedShouldSearchWeb: boolean
  actualToolsLoaded: string[]
  blockerFailed: boolean
  error?: string
}

/** Aggregated run of {@link runRegressionTests}. */
export interface RegressionSuiteResult {
  passed: boolean
  hasBlockers: boolean
  totalTests: number
  passedTests: number
  failedTests: number
  blockerTests: number
  results: RegressionTestResult[]
  durationMs: number
}

export interface RunRegressionTestsOptions {
  /** If set, only cases whose {@link RegressionTestCase.category} is listed run. */
  categories?: RegressionTestCase['category'][]
  /** Stop the suite on the first {@link RegressionTestResult.blockerFailed}. */
  stopOnBlocker?: boolean
}

type RunRegressionTestsOptionsInternal = RunRegressionTestsOptions & {
  onlyBlockers?: boolean
}

const runtimeTests: RegressionTestCase[] = []

function allCases(): RegressionTestCase[] {
  return [...REGRESSION_TEST_CASES, ...runtimeTests]
}

function sortedToolNames(names: string[]): string[] {
  return [...names].sort()
}

function toolListsEqual(a: string[], b: string[]): boolean {
  const x = sortedToolNames(a)
  const y = sortedToolNames(b)
  if (x.length !== y.length) return false
  return x.every((v, i) => v === y[i])
}

/** Resolve route: hard overrides first, then embedding router (matches orchestrator ordering without cache). */
async function resolveRoute(userMessage: string): Promise<string> {
  const o = applyOverrides(userMessage)
  if (o !== null && o.matched) {
    return o.route
  }
  const r = await semanticRouter.classify(userMessage)
  return r.route
}

function makeRegressionSessionIndex(): SessionIndex {
  return new SessionIndex({
    sessionId: 'prompt-regression',
    embedTexts: async (texts: string[]) =>
      texts.map(() => Array.from({ length: EMBED_DIM }, () => 0)),
  })
}

function makeStubLongTermIndex(): LongTermIndex {
  return {
    query: () =>
      Promise.resolve({ hit: false, chunks: [], bestScore: 0, metadatas: [] }),
  }
}

function evaluateBlockers(
  test: RegressionTestCase,
  actualRoute: string,
  actualToolNames: string[],
): { blockerFailed: boolean; parts: string[] } {
  const parts: string[] = []
  let blockerFailed = false

  if (test.mustNotSearchWeb && actualToolNames.includes('web_search')) {
    blockerFailed = true
    parts.push('mustNotSearchWeb violated: web_search is loaded for this route')
  }

  if (test.mustUseContext && !MUST_USE_CONTEXT_ROUTES.has(actualRoute)) {
    blockerFailed = true
    parts.push(
      `mustUseContext violated: route "${actualRoute}" is not in [code_instruction, clarification_needed, voice_task]`,
    )
  }

  return { blockerFailed, parts }
}

function buildTestResult(
  test: RegressionTestCase,
  actualRoute: string,
  actualShouldSearchWeb: boolean,
  actualToolNames: string[],
): RegressionTestResult {
  const { blockerFailed, parts } = evaluateBlockers(test, actualRoute, actualToolNames)

  const routeOk = actualRoute === test.expectedRoute
  const toolsOk = toolListsEqual(actualToolNames, test.expectedToolsLoaded)
  const searchOk = actualShouldSearchWeb === test.expectedShouldSearchWeb
  const passed = routeOk && toolsOk && searchOk && !blockerFailed

  const errors: string[] = []
  if (!routeOk) {
    errors.push(`route: expected "${test.expectedRoute}", got "${actualRoute}"`)
  }
  if (!toolsOk) {
    errors.push(
      `tools: expected [${test.expectedToolsLoaded.join(', ')}], got [${actualToolNames.join(', ')}]`,
    )
  }
  if (!searchOk) {
    errors.push(
      `shouldSearchWeb: expected ${String(test.expectedShouldSearchWeb)}, got ${String(actualShouldSearchWeb)}`,
    )
  }
  errors.push(...parts)

  return {
    testId: test.id,
    description: test.description,
    passed,
    actualRoute,
    expectedRoute: test.expectedRoute,
    actualShouldSearchWeb,
    expectedShouldSearchWeb: test.expectedShouldSearchWeb,
    actualToolsLoaded: sortedToolNames(actualToolNames),
    blockerFailed,
    error: passed ? undefined : errors.join('; '),
  }
}

async function runOneCase(
  test: RegressionTestCase,
  gate: RetrievalGate,
): Promise<RegressionTestResult> {
  const actualRoute = await resolveRoute(test.userMessage)
  const tools = loadToolsForIntent(actualRoute)
  const actualToolNames = tools.map((t) => t.name)
  const gateResult = await gate.check(test.userMessage, actualRoute)
  return buildTestResult(test, actualRoute, gateResult.shouldSearchWeb, actualToolNames)
}

function errorResultFromThrow(test: RegressionTestCase, err: unknown): RegressionTestResult {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    testId: test.id,
    description: test.description,
    passed: false,
    actualRoute: '',
    expectedRoute: test.expectedRoute,
    actualShouldSearchWeb: false,
    expectedShouldSearchWeb: test.expectedShouldSearchWeb,
    actualToolsLoaded: [],
    blockerFailed: true,
    error: msg,
  }
}

async function executeCaseWithLogging(
  test: RegressionTestCase,
  gate: RetrievalGate,
): Promise<RegressionTestResult> {
  let row: RegressionTestResult
  try {
    row = await runOneCase(test, gate)
  } catch (err: unknown) {
    row = errorResultFromThrow(test, err)
  }
  console.info(`${LOG} ${row.testId}: ${row.passed ? 'PASS' : 'FAIL'} — ${row.description}`)
  return row
}

/**
 * Executes regression cases against {@link semanticRouter}, {@link applyOverrides}, {@link loadToolsForIntent}, and {@link RetrievalGate}.
 *
 * When {@link RunRegressionTestsOptions.stopOnBlocker} stops the suite early, {@link RegressionSuiteResult.passed}
 * is false even if every executed row passed, because not every planned case ran.
 */
export async function runRegressionTests(
  options?: RunRegressionTestsOptions,
): Promise<RegressionSuiteResult> {
  return runRegressionTestsInternal(options ?? {})
}

async function runRegressionTestsInternal(
  options: RunRegressionTestsOptionsInternal,
): Promise<RegressionSuiteResult> {
  const started = performance.now()
  await semanticRouter.init()

  let cases = allCases()
  if (options.onlyBlockers === true) {
    cases = cases.filter((t) => t.mustNotSearchWeb || t.mustUseContext)
  }
  if (options.categories !== undefined && options.categories.length > 0) {
    const allow = new Set(options.categories)
    cases = cases.filter((t) => allow.has(t.category))
  }

  const sessionIndex = makeRegressionSessionIndex()
  const gate = new RetrievalGate(sessionIndex, makeStubLongTermIndex())

  const results: RegressionTestResult[] = []
  let blockerTests = 0

  for (const test of cases) {
    const row = await executeCaseWithLogging(test, gate)
    results.push(row)
    if (row.blockerFailed) {
      blockerTests++
    }
    if (options.stopOnBlocker === true && row.blockerFailed) {
      break
    }
  }

  const passedTests = results.filter((r) => r.passed).length
  const failedTests = results.length - passedTests
  const hasBlockers = results.some((r) => r.blockerFailed)
  const ranAllPlanned = results.length === cases.length
  const passed = ranAllPlanned && failedTests === 0

  console.info(
    `${LOG} ${String(passedTests)}/${String(results.length)} passed. Blockers: ${String(blockerTests)}`,
  )

  return {
    passed,
    hasBlockers,
    totalTests: results.length,
    passedTests,
    failedTests,
    blockerTests,
    results,
    durationMs: Math.round(performance.now() - started),
  }
}

/**
 * Runs only cases flagged {@link RegressionTestCase.mustNotSearchWeb} or {@link RegressionTestCase.mustUseContext}
 * (pre-deployment gate).
 */
export async function runBlockerTestsOnly(): Promise<RegressionSuiteResult> {
  return runRegressionTestsInternal({ onlyBlockers: true })
}

/** Append a custom case (e.g. from product QA). */
export function addRegressionTest(test: RegressionTestCase): void {
  runtimeTests.push(test)
  console.info(`${LOG} Added test: ${test.id}`)
}
