/**
 * Autonomous browser agent loop.
 *
 * Takes a high-level goal ("Research the top 3 AI coding assistants and compare pricing")
 * and drives the browser through plan-execute-observe cycles using the Chat Completions
 * tool-calling API, until the task is done or the step limit is reached.
 */

import type { BrowserControl } from '@/contexts/BrowserControlContext'
import { callLlmWithTools, type LlmToolMessage } from './llm'
import { ragIngestText, ragSearch } from './rag'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentStep {
  action: string
  args: Record<string, unknown>
  result: string
  narration?: string
  timestamp: number
}

export interface AgentRunResult {
  success: boolean
  summary: string
  steps: AgentStep[]
  savedDocuments: string[]
}

export interface AgentRunOptions {
  maxSteps?: number
  model?: string
  guideMode?: boolean
  /** When set, controls spoken output: guide = narrate model “thinking”; copilot = short per-action lines; off = silent. */
  voiceGuidanceMode?: 'copilot' | 'guide' | 'off'
  onStep?: (step: AgentStep) => void
  onThinking?: (thought: string) => void
  /** Fire-and-forget TTS hook (e.g. playTts). Copilot: one short line per action; guide: one line per model turn. */
  onSpeakNarration?: (text: string) => void
  signal?: AbortSignal
}

function copilotNarration(action: string, args: Record<string, unknown>): string {
  switch (action) {
    case 'browser_navigate':
      return `Opening ${String((args.url as string) ?? 'page').slice(0, 80)}`
    case 'browser_snapshot':
      return 'Taking a look at the page'
    case 'browser_click':
      return `Clicking element ${String((args.ref as string) ?? '')}`
    case 'browser_type':
      return 'Typing into the form'
    case 'browser_scroll':
      return `Scrolling ${args.direction === 'up' ? 'up' : 'down'}`
    case 'browser_extract_text':
      return 'Reading the page text'
    case 'browser_go_back':
      return 'Going back'
    case 'browser_new_tab':
      return (args.url as string) ? 'Opening a new tab' : 'Opening a new tab'
    case 'browser_switch_tab':
      return 'Switching tabs'
    case 'browser_close_tab':
      return 'Closing a tab'
    case 'browser_list_tabs':
      return 'Listing open tabs'
    case 'save_to_knowledge_base':
      return 'Saving a note to your knowledge base'
    case 'search_knowledge_base':
      return 'Searching your knowledge base'
    case 'task_complete':
      return 'Wrapping up'
    default:
      return 'Continuing'
  }
}

// ── Tool definitions for the inner loop ─────────────────────────────────────

const BROWSER_TOOLS: Record<string, unknown>[] = [
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the current tab.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to navigate to' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_snapshot',
      description: 'Get the accessibility tree of the current page showing interactive elements with ref IDs.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element by its ref ID from the most recent snapshot.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Element ref ID (e.g. e5)' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into a form field by its ref ID.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Element ref ID' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['ref', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the page up or down.',
      parameters: {
        type: 'object',
        properties: { direction: { type: 'string', enum: ['up', 'down'] } },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_extract_text',
      description: 'Get the full text content of the current page (up to 8000 chars).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_go_back',
      description: 'Go back to the previous page in browser history.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_new_tab',
      description: 'Open a new browser tab, optionally navigating to a URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Optional URL to open in the new tab' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_switch_tab',
      description: 'Switch to a different browser tab by its tab ID.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'string', description: 'Tab ID to switch to' } },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_close_tab',
      description: 'Close a browser tab by its tab ID.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'string', description: 'Tab ID to close' } },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_list_tabs',
      description: 'List all open browser tabs with their IDs, URLs, and titles.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_knowledge_base',
      description: 'Save extracted information or research findings to the knowledge base for future reference.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title for the saved content' },
          content: { type: 'string', description: 'The content to save' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the knowledge base for previously saved information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Call this when you have finished the task. Provide a summary of what was accomplished.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of what was accomplished and key findings' },
        },
        required: ['summary'],
      },
    },
  },
]

// ── System prompt ───────────────────────────────────────────────────────────

function buildAgentSystemPrompt(goal: string, guideMode: boolean): string {
  let prompt = `You are Jarvis, an autonomous browser agent. The user has given you a goal and you must accomplish it by browsing the web autonomously.

GOAL: ${goal}

You control a real web browser that the user can see. Plan your steps, execute them, and observe the results. Keep working until the goal is fully accomplished.

WORKFLOW:
1. Think about what steps you need to take to accomplish the goal.
2. IMPORTANT: Do NOT guess URLs. If you don't know the exact URL, start by navigating to https://www.google.com and searching for what you need. Use the search results to find the correct pages.
3. Use browser_navigate to go to a URL. Only navigate to well-known URLs you are confident about (e.g. https://www.amazon.com, https://www.google.com). For anything else, use Google Search first.
4. Use browser_snapshot to see the page elements and their ref IDs.
5. Use browser_click and browser_type to interact with the page (refs come from snapshots).
6. After each interaction, use browser_snapshot again to see the updated page.
7. Use browser_extract_text to read longer page content.
8. Use multiple tabs (browser_new_tab, browser_switch_tab, browser_list_tabs) when comparing across websites.
9. Use save_to_knowledge_base to save important findings for future reference.
10. When done, call task_complete with a comprehensive summary.

RULES:
- NEVER guess or make up URLs. If unsure, Google it first. Wrong URLs waste steps and hit 404 pages.
- Always snapshot after navigating or clicking — refs are only valid from the most recent snapshot.
- Wait for pages to fully load before taking actions. Do not rush between navigations.
- If a click fails, snapshot again to refresh refs and retry.
- If you cannot find an element, try scrolling first, then snapshot.
- Work systematically: plan before acting, verify results after each step.
- When comparing across sites, use SEPARATE TABS (browser_new_tab) instead of navigating away from a page you might need again.
- Stay on one page until you have extracted all the information you need before moving on.
- Save key findings to the knowledge base as you go, not just at the end.
- Be thorough but efficient: don't navigate unnecessarily.
- If something fails 3 times, try an alternative approach or report what you found so far.`

  if (guideMode) {
    prompt += `

GUIDE MODE: Before each action, briefly explain what you are about to do in a "thinking" field. This narration will be spoken aloud to the user. Be conversational: "Let me open Amazon to check their price..." / "I can see the product page, the price is $299. Let me check Best Buy now..."`
  }

  return prompt
}

// ── Tool executor ───────────────────────────────────────────────────────────

async function executeBrowserTool(
  name: string,
  args: Record<string, unknown>,
  bc: BrowserControl,
  savedDocs: string[],
): Promise<string> {
  switch (name) {
    case 'browser_navigate': {
      const url = args.url as string
      if (!url) return 'Error: missing url parameter.'
      bc.openBrowser()
      await new Promise(r => setTimeout(r, 300))
      const res = await bc.navigate(url)
      // Extra wait for page to settle (JS frameworks, redirects, etc.)
      await new Promise(r => setTimeout(r, 1000))
      return res.ok
        ? `Navigated to ${res.url}. Title: ${res.title || '(no title)'}. Use browser_snapshot to see what is on the page.`
        : `Failed to navigate to ${url}. The URL may be wrong — try searching on Google instead.`
    }
    case 'browser_snapshot': {
      return await bc.snapshot()
    }
    case 'browser_click': {
      const ref = args.ref as string
      if (!ref) return 'Error: missing ref parameter.'
      let res = await bc.click(ref)
      if (!res.ok) {
        await bc.snapshot()
        res = await bc.click(ref)
      }
      if (res.ok) {
        await new Promise(r => setTimeout(r, 1200))
        return `Clicked ${ref}. Use browser_snapshot to see the updated page.`
      }
      return `Could not click ${ref}. The element may have changed — run browser_snapshot to refresh refs.`
    }
    case 'browser_type': {
      const ref = args.ref as string
      const text = args.text as string
      if (!ref || !text) return 'Error: missing ref or text parameter.'
      const res = await bc.type(ref, text)
      return res.ok ? `Typed "${text}" into ${ref}.` : `Could not type into ${ref}. Run browser_snapshot to refresh.`
    }
    case 'browser_scroll': {
      const dir = args.direction === 'up' ? 'up' : 'down'
      await bc.scroll(dir)
      return `Scrolled ${dir}. Use browser_snapshot to see new content.`
    }
    case 'browser_extract_text': {
      const text = await bc.extractText()
      return text || '(empty page)'
    }
    case 'browser_go_back': {
      await bc.goBack()
      await new Promise(r => setTimeout(r, 700))
      return 'Went back. Use browser_snapshot to see the page.'
    }
    case 'browser_new_tab': {
      const url = args.url as string | undefined
      const res = await bc.newTab(url)
      if (!res.ok) return 'Failed to open new tab (tab limit may be reached).'
      if (url) await new Promise(r => setTimeout(r, 1500))
      return `Opened new tab (id: ${res.tabId}). Use browser_snapshot to see it.`
    }
    case 'browser_switch_tab': {
      const tabId = args.tab_id as string
      if (!tabId) return 'Error: missing tab_id parameter.'
      const res = await bc.switchTab(tabId)
      return res.ok ? `Switched to tab ${tabId}. Use browser_snapshot to see the page.` : `Tab ${tabId} not found.`
    }
    case 'browser_close_tab': {
      const tabId = args.tab_id as string
      if (!tabId) return 'Error: missing tab_id parameter.'
      const res = await bc.closeTab(tabId)
      return res.ok ? `Closed tab ${tabId}.` : `Could not close tab ${tabId}.`
    }
    case 'browser_list_tabs': {
      const tabs = bc.listTabs()
      if (tabs.length === 0) return 'No tabs open.'
      return tabs.map(t => `${t.active ? '* ' : '  '}[${t.id}] ${t.title} — ${t.url}`).join('\n')
    }
    case 'save_to_knowledge_base': {
      const title = args.title as string
      const content = args.content as string
      if (!title || !content) return 'Error: missing title or content.'
      try {
        const res = await ragIngestText(content, title, 'browser-agent')
        savedDocs.push(title)
        return `Saved "${title}" to knowledge base (id: ${res.documentId}).`
      } catch (e) {
        return `Failed to save: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    case 'search_knowledge_base': {
      const query = args.query as string
      if (!query) return 'Error: missing query.'
      try {
        const results = await ragSearch(query, 5)
        if (results.length === 0) return 'No matching results in knowledge base.'
        return results.map(r => `[${r.document_title}] ${r.content}`).join('\n---\n')
      } catch {
        return 'Knowledge base search unavailable.'
      }
    }
    case 'task_complete': {
      return '__TASK_COMPLETE__'
    }
    default:
      return `Unknown tool: ${name}`
  }
}

// ── Main agent loop ─────────────────────────────────────────────────────────

export async function runBrowserAgent(
  goal: string,
  browserControl: BrowserControl,
  options?: AgentRunOptions,
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 25
  const model = options?.model ?? 'gpt-4o-mini'
  const guideMode = options?.guideMode ?? false
  const voiceMode = options?.voiceGuidanceMode ?? (guideMode ? 'guide' : 'copilot')
  const effectiveGuideMode = voiceMode === 'guide'
  const signal = options?.signal

  const steps: AgentStep[] = []
  const savedDocs: string[] = []
  let stepCount = 0
  let completed = false
  let finalSummary = ''

  browserControl.openBrowser()
  await new Promise(r => setTimeout(r, 500))

  const messages: LlmToolMessage[] = [
    { role: 'system', content: buildAgentSystemPrompt(goal, effectiveGuideMode) },
    { role: 'user', content: `Please accomplish this goal: ${goal}` },
  ]

  const clearsGuideHighlight = new Set([
    'browser_navigate',
    'browser_new_tab',
    'browser_go_back',
    'browser_switch_tab',
    'browser_close_tab',
    'browser_snapshot',
    'browser_scroll',
    'browser_extract_text',
  ])

  try {
  while (stepCount < maxSteps && !completed) {
    if (signal?.aborted) {
      finalSummary = 'Task was cancelled by the user.'
      break
    }

    const result = await callLlmWithTools(messages, model, BROWSER_TOOLS, { signal })

    if (!result.tool_calls || result.tool_calls.length === 0) {
      finalSummary = result.content ?? 'Agent finished without a summary.'
      completed = true
      break
    }

    // The assistant message with tool_calls
    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.tool_calls,
    })

    if (result.content && effectiveGuideMode) {
      options?.onThinking?.(result.content)
      options?.onSpeakNarration?.(result.content)
    }

    for (const tc of result.tool_calls) {
      if (signal?.aborted) break

      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* */ }

      const toolName = tc.function.name
      if (clearsGuideHighlight.has(toolName)) {
        await browserControl.highlightRef?.(null)
      } else if (
        effectiveGuideMode &&
        browserControl.highlightRef &&
        (toolName === 'browser_click' || toolName === 'browser_type')
      ) {
        const ref = args.ref as string | undefined
        if (ref) {
          await browserControl.highlightRef(ref, toolName === 'browser_click' ? 'Click' : 'Type here')
        }
      }

      const toolResult = await executeBrowserTool(toolName, args, browserControl, savedDocs)

      if (toolName === 'task_complete') {
        await browserControl.highlightRef?.(null)
        finalSummary = (args.summary as string) || 'Task completed.'
        completed = true
        messages.push({ role: 'tool', tool_call_id: tc.id, name: toolName, content: finalSummary })
        const step: AgentStep = {
          action: 'task_complete',
          args,
          result: finalSummary,
          narration: effectiveGuideMode ? finalSummary : undefined,
          timestamp: Date.now(),
        }
        steps.push(step)
        options?.onStep?.(step)
        if (voiceMode === 'copilot') {
          options?.onSpeakNarration?.(`Done: ${finalSummary.slice(0, 120)}`)
        }
        stepCount++
        break
      }

      const step: AgentStep = {
        action: toolName,
        args,
        result: toolResult.length > 500 ? toolResult.slice(0, 500) + '...' : toolResult,
        narration: effectiveGuideMode && result.content ? result.content : undefined,
        timestamp: Date.now(),
      }
      steps.push(step)
      options?.onStep?.(step)
      if (voiceMode === 'copilot') {
        options?.onSpeakNarration?.(copilotNarration(toolName, args))
      }
      stepCount++

      messages.push({ role: 'tool', tool_call_id: tc.id, name: toolName, content: toolResult })
    }
  }

  if (!completed && stepCount >= maxSteps) {
    finalSummary = `Reached the step limit (${maxSteps}). Here is what was accomplished so far:\n` +
      steps.filter(s => s.action === 'save_to_knowledge_base' || s.action === 'browser_extract_text')
        .map(s => s.result).join('\n')
    if (!finalSummary.includes('accomplished')) {
      finalSummary = `Reached step limit (${maxSteps}). The task may be incomplete. Review the browser for current state.`
    }
  }
  } finally {
    await browserControl.highlightRef?.(null)
  }

  return {
    success: completed,
    summary: finalSummary,
    steps,
    savedDocuments: savedDocs,
  }
}
