/**
 * Tool-calling support for the text chat pipeline.
 *
 * Wraps the Chat Completions API with tools so that Jarvis can call
 * browser_action, browser_task, rag_search, create_document, and web_search
 * from the regular text chat (not just voice).
 */

import type { BrowserControl } from '@/contexts/BrowserControlContext'
import type { MediaCanvasControl } from '@/contexts/MediaCanvasContext'
import { runToolLoop, type LlmToolMessage } from './llm'
import { runBrowserAgent } from './browser-agent'
import { ragSearch, ragCreateDocument } from './rag'
import { executeWebSearch } from './api'
import { generateImage, editImage, createVideo } from './media-api'

// ── Tool definitions ────────────────────────────────────────────────────────

const CHAT_TOOLS: Record<string, unknown>[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information using a search engine.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_action',
      description: 'Control a web browser for single-step interactions: navigate, click, type, scroll, snapshot, extract text, manage tabs.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['navigate', 'snapshot', 'click', 'type', 'extract_text', 'scroll', 'go_back', 'go_forward', 'new_tab', 'switch_tab', 'close_tab', 'list_tabs'],
          },
          url: { type: 'string' },
          ref: { type: 'string' },
          text: { type: 'string' },
          direction: { type: 'string', enum: ['up', 'down'] },
          tab_id: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_task',
      description: 'Execute a complex multi-step browser task autonomously. Use for research, comparison shopping, data extraction, and tasks requiring many browser interactions.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The complete goal to accomplish' },
          save_results: { type: 'boolean', description: 'Save findings to the knowledge base (default true)' },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description: 'Search the personal knowledge base for previously stored information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Natural language search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: 'Create and store a document in the knowledge base.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          format: { type: 'string', enum: ['md', 'docx', 'pdf'] },
        },
        required: ['title', 'content', 'format'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image from a text description using AI. The image opens in the Media Canvas.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the image to generate' },
          size: { type: 'string', enum: ['square', 'landscape', 'portrait'], description: 'Image orientation (default: square)' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Generate a short video (4-12 seconds) from a text description. The video opens in the Media Canvas.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the video to generate' },
          duration: { type: 'number', enum: [4, 8, 12], description: 'Video duration in seconds (default: 4)' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image',
      description: 'Edit the current image in the Media Canvas. Supports contrast/brightness/saturation adjustment, object removal, HD enhancement, background changes, and more.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'What to do to the image (e.g. "increase contrast", "remove the person", "enhance to HD")' },
        },
        required: ['instruction'],
      },
    },
  },
]

// ── Tool executor ───────────────────────────────────────────────────────────

function createToolExecutor(
  browserControl: BrowserControl | null,
  guideMode: boolean,
  onStatus?: (status: string) => void,
  mediaCanvasControl?: MediaCanvasControl | null,
  onMediaGenerating?: (generating: boolean) => void,
  onMediaGeneratingLabel?: (label: string) => void,
  openMediaCanvas?: () => void,
) {
  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    switch (name) {
      case 'web_search': {
        const query = args.query as string
        if (!query) return 'Error: missing query.'
        onStatus?.(`Searching the web for "${query}"...`)
        try {
          const results = await executeWebSearch(query, 'all', false)
          if ('error' in results) return `Search failed: ${(results as { message?: string }).message ?? 'unknown error'}`
          if (Array.isArray(results) && results.length === 0) return 'No results found.'
          return (results as Array<{ title: string; url: string; snippet: string }>)
            .slice(0, 5)
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
            .join('\n\n')
        } catch (e) {
          return `Search error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'browser_action': {
        if (!browserControl) return 'Browser is not available.'
        const action = args.action as string
        onStatus?.(`Browser: ${action}...`)

        switch (action) {
          case 'navigate': {
            if (!args.url) return 'Missing url.'
            browserControl.openBrowser()
            await new Promise(r => setTimeout(r, 300))
            const res = await browserControl.navigate(args.url as string)
            await new Promise(r => setTimeout(r, 1000))
            return res.ok ? `Navigated to ${res.url}. Title: ${res.title || '(no title)'}. Use snapshot to see elements.` : 'Navigation failed. The URL may be wrong — try Google search.'
          }
          case 'snapshot': return await browserControl.snapshot()
          case 'click': {
            if (!args.ref) return 'Missing ref.'
            const r = await browserControl.click(args.ref as string)
            await new Promise(r => setTimeout(r, 1200))
            return r.ok ? `Clicked ${args.ref}. Use snapshot to see the updated page.` : `Could not click ${args.ref}.`
          }
          case 'type': {
            if (!args.ref || !args.text) return 'Missing ref or text.'
            const r = await browserControl.type(args.ref as string, args.text as string)
            return r.ok ? `Typed "${args.text}" into ${args.ref}.` : `Could not type into ${args.ref}.`
          }
          case 'extract_text': return (await browserControl.extractText()) || '(empty page)'
          case 'scroll': {
            const dir = (args.direction === 'up' ? 'up' : 'down') as 'up' | 'down'
            await browserControl.scroll(dir)
            return `Scrolled ${dir}.`
          }
          case 'go_back': await browserControl.goBack(); return 'Went back.'
          case 'go_forward': await browserControl.goForward(); return 'Went forward.'
          case 'new_tab': {
            const res = await browserControl.newTab(args.url as string | undefined)
            if (!res.ok) return 'Failed to open new tab.'
            if (args.url) await new Promise(r => setTimeout(r, 1500))
            return `Opened new tab (id: ${res.tabId}).`
          }
          case 'switch_tab': {
            if (!args.tab_id) return 'Missing tab_id.'
            const r = await browserControl.switchTab(args.tab_id as string)
            return r.ok ? `Switched to tab ${args.tab_id}.` : `Tab not found.`
          }
          case 'close_tab': {
            if (!args.tab_id) return 'Missing tab_id.'
            const r = await browserControl.closeTab(args.tab_id as string)
            return r.ok ? `Closed tab ${args.tab_id}.` : `Could not close tab.`
          }
          case 'list_tabs': {
            const tabs = browserControl.listTabs()
            return tabs.length === 0 ? 'No tabs open.' : tabs.map(t => `${t.active ? '* ' : '  '}[${t.id}] ${t.title} — ${t.url}`).join('\n')
          }
          default: return `Unknown action: ${action}`
        }
      }

      case 'browser_task': {
        if (!browserControl) return 'Browser is not available.'
        const goal = args.goal as string
        if (!goal) return 'Missing goal.'
        onStatus?.(`Starting autonomous browser task: "${goal}"`)
        try {
          const result = await runBrowserAgent(goal, browserControl, {
            maxSteps: 25,
            model: 'gpt-4o-mini',
            guideMode,
            onStep: (step) => { onStatus?.(`[Step ${step.action}] ${step.result.slice(0, 100)}`) },
          })
          let output = result.summary
          if (result.savedDocuments.length > 0) {
            output += `\n\nSaved to knowledge base: ${result.savedDocuments.join(', ')}`
          }
          return output
        } catch (e) {
          return `Browser task failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'rag_search': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.('Searching knowledge base...')
        try {
          const results = await ragSearch(query, 5)
          if (results.length === 0) return 'No matching results in knowledge base.'
          return results.map(r => `[${r.document_title}] ${r.content}`).join('\n---\n')
        } catch {
          return 'Knowledge base search unavailable.'
        }
      }

      case 'create_document': {
        const { title, content, format } = args as { title?: string; content?: string; format?: string }
        if (!title || !content || !format) return 'Missing title, content, or format.'
        onStatus?.(`Creating document "${title}"...`)
        try {
          const res = await ragCreateDocument(title, content, format as 'md' | 'docx' | 'pdf')
          return `Created document "${title}" (id: ${res.documentId}).`
        } catch (e) {
          return `Failed to create document: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'generate_image': {
        const prompt = args.prompt as string
        if (!prompt) return 'Missing prompt.'
        onStatus?.('Generating image...')
        onMediaGenerating?.(true)
        onMediaGeneratingLabel?.('Generating image...')
        openMediaCanvas?.()
        try {
          const sizeMap: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
            square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536',
          }
          const result = await generateImage(prompt, { size: sizeMap[args.size as string] || '1024x1024' })
          mediaCanvasControl?.showImage(result, prompt)
          return 'Image generated successfully and displayed in the Media Canvas.'
        } catch (e) {
          return `Image generation failed: ${e instanceof Error ? e.message : String(e)}`
        } finally {
          onMediaGenerating?.(false)
          onMediaGeneratingLabel?.('')
        }
      }

      case 'generate_video': {
        const prompt = args.prompt as string
        if (!prompt) return 'Missing prompt.'
        onStatus?.('Generating video...')
        onMediaGenerating?.(true)
        onMediaGeneratingLabel?.('Generating video...')
        openMediaCanvas?.()
        try {
          const dur = ([4, 8, 12].includes(args.duration as number) ? args.duration : 4) as 4 | 8 | 12
          const result = await createVideo(prompt, { seconds: dur }, (progress) => {
            onMediaGeneratingLabel?.(`Generating video... ${Math.round(progress)}%`)
          })
          mediaCanvasControl?.showVideo(result, prompt)
          return 'Video generated successfully and playing in the Media Canvas.'
        } catch (e) {
          return `Video generation failed: ${e instanceof Error ? e.message : String(e)}`
        } finally {
          onMediaGenerating?.(false)
          onMediaGeneratingLabel?.('')
        }
      }

      case 'edit_image': {
        const instruction = args.instruction as string
        if (!instruction) return 'Missing instruction.'
        if (!mediaCanvasControl) return 'Media Canvas is not available.'
        const currentImage = mediaCanvasControl.getCurrentImageBase64()
        if (!currentImage) return 'No image is currently loaded in the Media Canvas. Generate one first with generate_image.'
        onStatus?.('Editing image...')
        onMediaGenerating?.(true)
        onMediaGeneratingLabel?.('Editing image...')
        try {
          const result = await editImage(currentImage, instruction, { quality: 'high' })
          mediaCanvasControl.applyEdit(result)
          return 'Image edited successfully. The updated image is displayed in the Media Canvas.'
        } catch (e) {
          return `Image edit failed: ${e instanceof Error ? e.message : String(e)}`
        } finally {
          onMediaGenerating?.(false)
          onMediaGeneratingLabel?.('')
        }
      }

      default:
        return `Unknown tool: ${name}`
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ChatWithToolsOptions {
  systemPrompt: string
  userPrompt: string
  model?: string
  browserControl?: BrowserControl | null
  guideMode?: boolean
  mediaCanvasControl?: MediaCanvasControl | null
  onMediaGenerating?: (generating: boolean) => void
  onMediaGeneratingLabel?: (label: string) => void
  openMediaCanvas?: () => void
  signal?: AbortSignal
  onStatus?: (status: string) => void
  onToolCall?: (name: string, args: Record<string, unknown>) => void
}

export async function runChatWithTools(options: ChatWithToolsOptions): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    model = 'gpt-4o-mini',
    browserControl = null,
    guideMode = false,
    mediaCanvasControl = null,
    onMediaGenerating,
    onMediaGeneratingLabel,
    openMediaCanvas,
    signal,
    onStatus,
    onToolCall,
  } = options

  const hasBrowser = Boolean(browserControl)
  let tools = CHAT_TOOLS
  if (!hasBrowser) {
    tools = tools.filter(t => {
      const fn = (t as { function?: { name?: string } }).function
      return fn?.name !== 'browser_action' && fn?.name !== 'browser_task'
    })
  }

  const executor = createToolExecutor(
    browserControl, guideMode, onStatus,
    mediaCanvasControl, onMediaGenerating, onMediaGeneratingLabel, openMediaCanvas,
  )

  const messages: LlmToolMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const result = await runToolLoop(messages, model, tools, executor, {
    maxRounds: 30,
    signal,
    onToolCall,
  })

  return result.content
}
