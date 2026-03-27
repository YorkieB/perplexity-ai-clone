/**
 * Knowledge Graph extraction — builds a graph of entities and relationships
 * from a conversation thread's messages using heuristic NLP patterns.
 *
 * No external API required; runs entirely client-side.
 */

import type { Message } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType = 'concept' | 'technology' | 'person' | 'organization' | 'source'

export interface KGNode {
  id: string
  label: string
  type: EntityType
  /** Number of times this entity appeared across the thread */
  weight: number
  /** Message IDs where this entity appeared */
  messageIds: string[]
}

export interface KGEdge {
  source: string
  target: string
  /** Number of messages where both endpoints co-occurred */
  weight: number
}

export interface KnowledgeGraph {
  nodes: KGNode[]
  edges: KGEdge[]
}

// ---------------------------------------------------------------------------
// Known entity dictionaries
// ---------------------------------------------------------------------------

const TECH_KEYWORDS = new Set([
  // Languages & runtimes
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin', 'swift',
  'c++', 'c#', 'ruby', 'php', 'scala', 'elixir', 'clojure', 'haskell', 'dart',
  'r', 'matlab', 'sql', 'graphql',
  // Frameworks & libs
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nextjs', 'nuxt', 'remix',
  'express', 'fastapi', 'django', 'flask', 'spring', 'rails', 'laravel',
  'tailwind', 'bootstrap', 'material-ui', 'shadcn', 'radix',
  'd3', 'd3.js', 'three.js', 'p5.js',
  // AI/ML
  'openai', 'gpt-4', 'gpt-4o', 'claude', 'gemini', 'llama', 'mistral',
  'langchain', 'llamaindex', 'hugging face', 'pytorch', 'tensorflow', 'keras',
  'transformers', 'embedding', 'rag', 'vector database', 'faiss', 'pinecone',
  'chromadb', 'weaviate',
  // Cloud & infra
  'aws', 'azure', 'gcp', 'vercel', 'netlify', 'docker', 'kubernetes', 'k8s',
  'terraform', 'ansible', 'github', 'gitlab', 'ci/cd', 'nginx', 'apache',
  // Databases
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'supabase',
  'firebase', 'dynamodb', 'cassandra', 'elasticsearch',
  // Protocols & concepts
  'rest', 'graphql', 'websocket', 'grpc', 'oauth', 'jwt', 'https', 'http',
  'api', 'sdk', 'cli', 'ide',
])

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'that',
  'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
  'our', 'you', 'your', 'i', 'my', 'me', 'he', 'she', 'his', 'her',
  'not', 'no', 'so', 'if', 'then', 'than', 'when', 'where', 'which',
  'who', 'what', 'how', 'why', 'also', 'just', 'more', 'some', 'any',
  'all', 'each', 'both', 'most', 'other', 'into', 'about', 'up', 'out',
  'use', 'used', 'using', 'make', 'made', 'making', 'get', 'set', 'let',
  'new', 'old', 'good', 'great', 'well', 'like', 'need', 'want', 'know',
  'here', 'there', 'very', 'much', 'many', 'way', 'very', 'really',
  'yes', 'sure', 'ok', 'okay', 'hi', 'hello', 'thanks', 'thank',
  'jarvis', 'user', 'assistant', 'message', 'response', 'answer', 'question',
])

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Strip markdown syntax, code fences, and URLs from text before parsing.
 */
function cleanText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')   // fenced code blocks
    .replace(/`[^`]+`/g, ' ')           // inline code
    .replace(/https?:\/\/\S+/g, ' ')    // URLs
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')      // italic
    .replace(/#{1,6}\s*/g, ' ')         // headings
    .replace(/[[\]()]/g, ' ')           // brackets
    .replace(/[|>]/g, ' ')              // table pipes / blockquotes
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classify an entity string into one of the EntityType buckets.
 */
function classifyEntity(raw: string): EntityType {
  const lower = raw.toLowerCase()
  if (TECH_KEYWORDS.has(lower)) return 'technology'
  // Heuristic: two or more capitalised words → likely an organisation or person
  const words = raw.split(/\s+/)
  if (words.length >= 2 && words.every((w) => /^[A-Z]/.test(w))) {
    // Names like "Elon Musk", "Google LLC", "OpenAI", "Sam Altman"
    return words.length === 2 ? 'person' : 'organization'
  }
  if (words.length === 1 && /^[A-Z]/.test(raw) && raw.length > 3) {
    return 'organization'
  }
  return 'concept'
}

/**
 * Extract candidate entity strings from a chunk of cleaned text.
 * Returns lowercase-normalised entity strings.
 */
function extractCandidates(text: string): string[] {
  const found = new Set<string>()

  // 1. Known tech keywords (case-insensitive scan)
  for (const kw of TECH_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/[.+]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) found.add(kw)
  }

  // 2. Capitalised noun phrases (1–3 words, each starting with uppercase)
  const capPhrase = /\b([A-Z][a-zA-Z]{2,})(?:\s+[A-Z][a-zA-Z]{2,}){0,2}\b/g
  let m: RegExpExecArray | null
  while ((m = capPhrase.exec(text)) !== null) {
    const phrase = m[0].trim()
    const words = phrase.split(/\s+/)
    // Skip if any word is a stop-word
    if (words.some((w) => STOP_WORDS.has(w.toLowerCase()))) continue
    // Skip very short single words that are just sentence starters
    if (words.length === 1 && phrase.length < 4) continue
    found.add(phrase)
  }

  // 3. Quoted phrases (often concepts being defined)
  const quoted = /[""]([^"""]{3,40})[""]|"([^"]{3,40})"/g
  while ((m = quoted.exec(text)) !== null) {
    const phrase = (m[1] ?? m[2]).trim()
    if (!STOP_WORDS.has(phrase.toLowerCase())) found.add(phrase)
  }

  return Array.from(found)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a KnowledgeGraph from an array of conversation messages.
 * Only assistant messages are analysed (they contain the research content).
 */
export function buildKnowledgeGraph(messages: Message[]): KnowledgeGraph {
  const nodeMap = new Map<string, KGNode>() // key = lowercase label
  const edgeMap = new Map<string, KGEdge>() // key = `${idA}__${idB}`

  // Process assistant messages
  const assistantMessages = messages.filter(
    (m) => m.role === 'assistant' && m.content.trim().length > 20
  )

  for (const msg of assistantMessages) {
    const text = cleanText(msg.content)
    const candidates = extractCandidates(text)

    // Track entities seen in THIS message (for edge building)
    const seenInMsg: string[] = []

    for (const candidate of candidates) {
      const key = candidate.toLowerCase()
      if (STOP_WORDS.has(key) || key.length < 3) continue

      if (nodeMap.has(key)) {
        const existing = nodeMap.get(key)!
        existing.weight += 1
        if (!existing.messageIds.includes(msg.id)) {
          existing.messageIds.push(msg.id)
        }
      } else {
        nodeMap.set(key, {
          id: key,
          label: candidate,
          type: classifyEntity(candidate),
          weight: 1,
          messageIds: [msg.id],
        })
      }
      seenInMsg.push(key)
    }

    // Build edges between entities that co-occur in the same message
    for (let i = 0; i < seenInMsg.length; i++) {
      for (let j = i + 1; j < seenInMsg.length; j++) {
        const a = seenInMsg[i] < seenInMsg[j] ? seenInMsg[i] : seenInMsg[j]
        const b = seenInMsg[i] < seenInMsg[j] ? seenInMsg[j] : seenInMsg[i]
        const edgeKey = `${a}__${b}`
        if (edgeMap.has(edgeKey)) {
          edgeMap.get(edgeKey)!.weight += 1
        } else {
          edgeMap.set(edgeKey, { source: a, target: b, weight: 1 })
        }
      }
    }

    // Also add sources as nodes and connect to concepts mentioned alongside
    for (const source of msg.sources ?? []) {
      const domain = source.domain ?? new URL(source.url).hostname.replace(/^www\./, '')
      const key = `src:${domain}`
      if (!nodeMap.has(key)) {
        nodeMap.set(key, {
          id: key,
          label: domain,
          type: 'source',
          weight: 1,
          messageIds: [msg.id],
        })
      } else {
        const n = nodeMap.get(key)!
        n.weight += 1
        if (!n.messageIds.includes(msg.id)) n.messageIds.push(msg.id)
      }
      // Connect each source to the top concept(s) in this message
      const topConcepts = seenInMsg.slice(0, 3)
      for (const c of topConcepts) {
        const a = key < c ? key : c
        const b = key < c ? c : key
        const ek = `${a}__${b}`
        if (!edgeMap.has(ek)) edgeMap.set(ek, { source: a, target: b, weight: 1 })
      }
    }
  }

  // Prune: keep only nodes with weight >= 1 that have at least one edge,
  // or nodes with weight >= 2 (appeared in multiple turns).
  const connectedIds = new Set<string>()
  for (const edge of edgeMap.values()) {
    connectedIds.add(edge.source)
    connectedIds.add(edge.target)
  }
  const significantNodes = Array.from(nodeMap.values()).filter(
    (n) => connectedIds.has(n.id) || n.weight >= 2
  )
  const significantIds = new Set(significantNodes.map((n) => n.id))

  // Keep edges where both endpoints survived pruning
  const filteredEdges = Array.from(edgeMap.values()).filter(
    (e) => significantIds.has(e.source) && significantIds.has(e.target)
  )

  // Cap graph size to avoid overwhelming the UI
  const MAX_NODES = 60
  const sortedNodes = significantNodes
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_NODES)
  const finalIds = new Set(sortedNodes.map((n) => n.id))
  const finalEdges = filteredEdges.filter(
    (e) => finalIds.has(e.source) && finalIds.has(e.target)
  )

  return { nodes: sortedNodes, edges: finalEdges }
}
