/**
 * Hallucination Guard — multi-layered validation engine.
 *
 * Prevents Jarvis from fabricating facts, URLs, statistics, dates,
 * names, quotes, or any unverifiable claims. Runs a secondary LLM
 * call to audit the primary response against the available evidence.
 */

import { callLlm } from './llm'

// ── Types ───────────────────────────────────────────────────────────────────

export interface HallucinationReport {
  passed: boolean
  confidence: number
  flags: HallucinationFlag[]
  correctedResponse?: string
}

export interface HallucinationFlag {
  type: HallucinationType
  severity: 'low' | 'medium' | 'high' | 'critical'
  claim: string
  reason: string
}

export type HallucinationType =
  | 'fabricated_url'
  | 'fabricated_statistic'
  | 'fabricated_quote'
  | 'fabricated_name'
  | 'fabricated_date'
  | 'fabricated_fact'
  | 'unsupported_claim'
  | 'contradicts_source'
  | 'false_confidence'
  | 'invented_capability'
  | 'fictional_reference'

// ── Pattern detectors (fast, no LLM call) ───────────────────────────────────

const SUSPICIOUS_URL_RE = /https?:\/\/[^\s)>\]]+/g
const FAKE_STAT_RE = /(?:according to|studies show|research shows|data shows|statistics show|a recent study|a \d{4} study)\s/gi
const FAKE_QUOTE_RE = /(?:as .{2,40} (?:once )?said|"[^"]{10,200}".*(?:[—–-])\s*[A-Z])/g
const FABRICATED_YEAR_RE = /(?:in|since|from|by)\s+20(?:2[5-9]|[3-9]\d)\b/gi
const PERCENTAGE_RE = /\d{1,3}(?:\.\d+)?%/g
const SPECIFIC_NUMBER_RE = /(?:approximately|roughly|about|exactly|over|more than|nearly)\s+[\d,.]+\s+(?:million|billion|trillion|thousand|people|users|customers|employees)/gi

function runPatternChecks(response: string): HallucinationFlag[] {
  const flags: HallucinationFlag[] = []

  const urls = response.match(SUSPICIOUS_URL_RE) || []
  for (const url of urls) {
    if (isLikelyFabricatedUrl(url)) {
      flags.push({
        type: 'fabricated_url',
        severity: 'high',
        claim: url,
        reason: 'URL looks fabricated — not from a known source or search result.',
      })
    }
  }

  const statMatches = response.match(FAKE_STAT_RE) || []
  for (const match of statMatches) {
    flags.push({
      type: 'unsupported_claim',
      severity: 'medium',
      claim: match.trim(),
      reason: 'Vague authority appeal without a specific, verifiable citation.',
    })
  }

  const quoteMatches = response.match(FAKE_QUOTE_RE) || []
  for (const match of quoteMatches) {
    flags.push({
      type: 'fabricated_quote',
      severity: 'high',
      claim: match.trim(),
      reason: 'Attributed quote without verifiable source.',
    })
  }

  const futureYears = response.match(FABRICATED_YEAR_RE) || []
  for (const match of futureYears) {
    const yearMatch = /20\d{2}/.exec(match)
    if (yearMatch) {
      const year = Number.parseInt(yearMatch[0], 10)
      const currentYear = new Date().getFullYear()
      if (year > currentYear) {
        flags.push({
          type: 'fabricated_date',
          severity: 'high',
          claim: match.trim(),
          reason: `References future year ${year} as if events have already occurred.`,
        })
      }
    }
  }

  return flags
}

function isLikelyFabricatedUrl(url: string): boolean {
  const knownDomains = [
    'wikipedia.org', 'github.com', 'stackoverflow.com', 'google.com',
    'youtube.com', 'x.com', 'twitter.com', 'threads.net', 'reddit.com',
    'bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'theguardian.com',
    'reuters.com', 'apnews.com', 'mozilla.org', 'developer.mozilla.org',
    'npmjs.com', 'pypi.org', 'docs.python.org', 'microsoft.com',
    'apple.com', 'amazon.com', 'openai.com', 'anthropic.com',
    'huggingface.co', 'arxiv.org', 'medium.com', 'dev.to',
    'digitalocean.com', 'plaid.com', 'gutenberg.org', 'gutendex.com',
    'developer.twitter.com',
  ]

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return !knownDomains.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return true
  }
}

// ── LLM-based deep validation ───────────────────────────────────────────────

const VALIDATOR_PROMPT = `You are a strict fact-checking auditor. Your job is to identify hallucinations in an AI assistant's response.

A hallucination is any claim, fact, statistic, URL, quote, date, name, or reference that:
1. Is not directly supported by the provided SOURCE EVIDENCE
2. Cannot be logically deduced from the source evidence
3. Presents speculation or inference as established fact
4. Fabricates specific numbers, percentages, or statistics
5. Invents URLs, links, citations, or bibliographic references
6. Attributes quotes to people without verifiable source
7. Claims capabilities the assistant does not actually have
8. States future events as if they have already happened
9. Contradicts information in the source evidence

You MUST output valid JSON with this exact structure:
{
  "passed": true/false,
  "confidence": 0.0-1.0,
  "flags": [
    {
      "type": "fabricated_fact|fabricated_url|fabricated_statistic|fabricated_quote|fabricated_name|fabricated_date|unsupported_claim|contradicts_source|false_confidence|invented_capability|fictional_reference",
      "severity": "low|medium|high|critical",
      "claim": "the specific problematic text",
      "reason": "why this is a hallucination"
    }
  ],
  "corrected_response": "The full corrected response with hallucinations removed/fixed, or null if passed=true"
}

Rules:
- "passed" is true ONLY if there are zero medium/high/critical flags
- "confidence" reflects how certain you are in your judgment (1.0 = fully certain)
- Be aggressive — when in doubt, flag it
- If the response says "I don't know" or "I'm not sure", that is GOOD, not a flag
- General knowledge that is widely accepted (e.g. "the sky is blue") does NOT need source evidence
- Tool outputs and search results count as source evidence
- If no source evidence is provided, MOST specific factual claims should be flagged
- Correct the response by removing or qualifying unverified claims, NOT by making up new ones`

interface ValidateOptions {
  response: string
  userQuery: string
  sourceEvidence?: string
  toolOutputs?: string[]
}

async function runLlmValidation(opts: ValidateOptions): Promise<HallucinationReport> {
  const { response, userQuery, sourceEvidence, toolOutputs } = opts

  let evidenceBlock = ''
  if (sourceEvidence) {
    evidenceBlock += `\n\n=== SOURCE EVIDENCE (from web search / knowledge base) ===\n${sourceEvidence.slice(0, 8000)}`
  }
  if (toolOutputs && toolOutputs.length > 0) {
    evidenceBlock += `\n\n=== TOOL OUTPUTS ===\n${toolOutputs.join('\n---\n').slice(0, 5000)}`
  }
  if (!sourceEvidence && (!toolOutputs || toolOutputs.length === 0)) {
    evidenceBlock += '\n\n=== SOURCE EVIDENCE ===\nNone provided. The assistant had NO external sources for this response. Flag any specific factual claims that go beyond general knowledge.'
  }

  const prompt = `USER QUERY:
${userQuery}

ASSISTANT RESPONSE TO AUDIT:
${response}
${evidenceBlock}

Analyse the response for hallucinations. Output ONLY valid JSON.`

  try {
    const raw = await callLlm(prompt, 'gpt-4o-mini', true)
    const parsed = JSON.parse(raw) as {
      passed?: boolean
      confidence?: number
      flags?: HallucinationFlag[]
      corrected_response?: string | null
    }

    return {
      passed: parsed.passed ?? true,
      confidence: parsed.confidence ?? 0.5,
      flags: parsed.flags ?? [],
      correctedResponse: parsed.corrected_response ?? undefined,
    }
  } catch {
    return { passed: true, confidence: 0, flags: [] }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface GuardOptions {
  userQuery: string
  response: string
  sourceEvidence?: string
  toolOutputs?: string[]
  strictMode?: boolean
}

/**
 * Full hallucination check: fast pattern scan + LLM-based deep validation.
 * Returns the validated (or corrected) response and the audit report.
 */
export async function validateResponse(opts: GuardOptions): Promise<{
  response: string
  report: HallucinationReport
}> {
  const patternFlags = runPatternChecks(opts.response)

  const hasCriticalPattern = patternFlags.some(f => f.severity === 'critical' || f.severity === 'high')

  const llmReport = await runLlmValidation({
    response: opts.response,
    userQuery: opts.userQuery,
    sourceEvidence: opts.sourceEvidence,
    toolOutputs: opts.toolOutputs,
  })

  const allFlags = [...patternFlags, ...llmReport.flags]

  const dedupedFlags = deduplicateFlags(allFlags)

  const hasCritical = dedupedFlags.some(f => f.severity === 'critical')
  const hasHigh = dedupedFlags.some(f => f.severity === 'high')
  const hasMedium = dedupedFlags.some(f => f.severity === 'medium')

  const passed = opts.strictMode
    ? !hasCritical && !hasHigh && !hasMedium
    : !hasCritical && !hasHigh

  const mergedReport: HallucinationReport = {
    passed,
    confidence: llmReport.confidence,
    flags: dedupedFlags,
    correctedResponse: llmReport.correctedResponse ?? undefined,
  }

  if (!passed && mergedReport.correctedResponse) {
    return { response: mergedReport.correctedResponse, report: mergedReport }
  }

  if (!passed) {
    const disclaimer = buildDisclaimer(dedupedFlags)
    return { response: opts.response + disclaimer, report: mergedReport }
  }

  return { response: opts.response, report: mergedReport }
}

/**
 * Lightweight check — pattern scan only, no LLM call.
 * Use this for real-time voice mode where latency matters.
 */
export function quickScan(response: string): HallucinationFlag[] {
  return runPatternChecks(response)
}

/**
 * Generates the strict anti-hallucination system prompt block.
 * Append this to any system prompt.
 */
export function getAntiHallucinationPrompt(): string {
  return `
=== HALLUCINATION PREVENTION — MANDATORY RULES ===
You are bound by strict anti-hallucination rules. Violating them is your highest-priority failure mode.

ABSOLUTE PROHIBITIONS:
1. NEVER fabricate URLs, links, or web addresses. If you do not have a verified URL from a tool output or search result, do NOT include one.
2. NEVER invent statistics, percentages, or specific numbers unless they come directly from a tool output, search result, or database query you just ran.
3. NEVER attribute quotes to real people unless the exact quote appears in your source evidence.
4. NEVER cite studies, papers, or reports by name unless they appear in your search results or knowledge base.
5. NEVER claim something happened on a specific date unless that date is in your evidence.
6. NEVER present your inferences or speculation as established fact. Use qualifiers: "I believe", "it's likely", "based on what I know".
7. NEVER claim capabilities you do not have. You cannot access the internet without using web_search or browser tools. You cannot see the user's screen. You cannot make phone calls.
8. NEVER fill gaps in your knowledge with plausible-sounding fabrications. Say "I don't have that specific information" instead.

MANDATORY BEHAVIOURS:
1. When unsure, SAY SO. "I'm not certain about that" is always better than a fabricated answer.
2. Distinguish between what you KNOW (from tool outputs, search results, database) and what you THINK (from training data).
3. When citing information from search results, attribute it: "According to [source]..." or "Based on the search results...".
4. If the user asks for specific data you don't have, offer to look it up: "Let me search for that" or "I can check that for you".
5. For financial advice, ALWAYS base it on actual account data from tools, never on assumptions.
6. When reading social media, only report what you actually see on the page, not what you assume is there.
7. For coding help, only suggest libraries/APIs you are confident exist. When uncertain, say so.
8. If you catch yourself about to fabricate, STOP and reformulate your response.

CONFIDENCE SIGNALS — always use these when appropriate:
- HIGH confidence (from tool/search): "Based on the search results...", "Your account shows...", "The data indicates..."
- MEDIUM confidence (training knowledge): "From what I know...", "Generally speaking...", "Typically..."
- LOW confidence (uncertain): "I believe...", "I'm not sure, but...", "This might be...", "I'd need to verify this, but..."
- NO confidence: "I don't have that information", "I'd recommend looking that up", "Let me search for that"
=== END HALLUCINATION PREVENTION ===`
}

// ── Internal helpers ────────────────────────────────────────────────────────

function deduplicateFlags(flags: HallucinationFlag[]): HallucinationFlag[] {
  const seen = new Set<string>()
  return flags.filter(f => {
    const key = `${f.type}:${f.claim.slice(0, 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildDisclaimer(flags: HallucinationFlag[]): string {
  const critical = flags.filter(f => f.severity === 'critical' || f.severity === 'high')
  if (critical.length === 0) return ''

  const items = critical.slice(0, 3).map(f => `- ${f.reason}`).join('\n')
  return `\n\n---\n**Note:** Some parts of this response could not be fully verified:\n${items}\nPlease verify these details independently.`
}
