/**
 * Tool-calling support for the text chat pipeline.
 *
 * Wraps the Chat Completions API with tools so that Jarvis can call
 * browser_action, browser_task, rag_search, create_document, and web_search
 * from the regular text chat (not just voice).
 */

import type { BrowserControl } from '@/contexts/BrowserControlContext'
import type { MediaCanvasControl } from '@/contexts/MediaCanvasContext'
import type { CodeEditorControl } from '@/contexts/CodeEditorContext'
import type { MusicPlayerControl } from '@/contexts/MusicPlayerContext'
import { runToolLoop, type LlmToolMessage } from './llm'
import { runBrowserAgent } from './browser-agent'
import { ragSearch, ragCreateDocument } from './rag'
import { executeWebSearch } from './api'
import { generateImage, editImage, createVideo } from './media-api'
import { searchHuggingFace, fetchDatasetSample } from './hf-api'
import { searchGitHub, fetchGitHubFile } from './github-api'
import { generateMusic } from './suno-api'
import { runCode } from './code-runner'
import { getBalances, getTransactions, getSpendingSummary } from './plaid-api'
import { searchStories, getStoryContent, getRandomStory, continueReading, jumpToPage, getCurrentBook } from './story-api'
import { postTweet, readSocialFeed, readComments, replyViaBrowser } from './social-api'
import { schedulePost, listScheduledPostsSummary, cancelScheduledPost } from './social-scheduler'
import { validateResponse } from './hallucination-guard'
import { splitThinkingFromModelContent } from './thinking-tags'
import { trackToolOutcome, analyzeExchangeAsync, getLearningStats } from './learning-engine'

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
  {
    type: 'function',
    function: {
      name: 'show_code',
      description: 'Display code in the interactive Code Editor. Supports syntax highlighting, editing, copy, download, and execution (Python & JavaScript).',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code to display' },
          language: { type: 'string', description: 'Programming language (python, javascript, typescript, html, css, json, rust, java, cpp, sql, etc.)' },
          filename: { type: 'string', description: 'Optional filename for the code' },
        },
        required: ['code', 'language'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute code and return the output. Supports Python (via Pyodide/WASM) and JavaScript.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code to execute' },
          language: { type: 'string', enum: ['python', 'javascript'], description: 'Language to execute' },
        },
        required: ['code', 'language'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_create_file',
      description: 'Create a new file in the IDE. Returns the file ID.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename with extension (e.g. "app.py", "index.html")' },
          code: { type: 'string', description: 'Initial code content' },
          language: { type: 'string', description: 'Programming language' },
        },
        required: ['filename', 'code', 'language'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_edit_file',
      description: 'Replace the entire content of a file in the IDE.',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The file ID to edit' },
          new_code: { type: 'string', description: 'The new complete code content' },
        },
        required: ['file_id', 'new_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_replace_text',
      description: 'Find and replace text within the active file. Use to fix errors, refactor code, or make targeted edits.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Text to find' },
          replace: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
        },
        required: ['search', 'replace'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_files',
      description: 'List all files currently open in the IDE.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_read_file',
      description: 'Read the contents of a file in the IDE. Use the active file if no file_id given.',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'File ID to read (omit for active file)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_open_file',
      description: 'Switch the active tab to a specific file.',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'File ID to open/focus' },
        },
        required: ['file_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_delete_file',
      description: 'Delete/close a file from the IDE.',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'File ID to delete' },
        },
        required: ['file_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_rename_file',
      description: 'Rename a file in the IDE.',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'File ID to rename' },
          new_name: { type: 'string', description: 'New filename' },
        },
        required: ['file_id', 'new_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_run_and_fix',
      description: 'Run the active file, check for errors, and if there are errors, return them so you can fix them. Use this for iterative development — run, check errors, fix, run again.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_find_in_file',
      description: 'Search for text in the active file. Returns matching lines with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_preview',
      description: 'Toggle the live preview panel for HTML/CSS/JS files.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_huggingface',
      description: 'Search Hugging Face for datasets or models by keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: { type: 'string', enum: ['datasets', 'models'], description: 'What to search for (default: datasets)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_dataset_sample',
      description: 'Fetch a sample of rows from a Hugging Face dataset.',
      parameters: {
        type: 'object',
        properties: {
          dataset_id: { type: 'string', description: 'The dataset ID (e.g. "squad", "imdb")' },
          split: { type: 'string', description: 'Dataset split (default: train)' },
          config: { type: 'string', description: 'Dataset config (default: default)' },
        },
        required: ['dataset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_github',
      description: 'Search GitHub for repositories or code.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: { type: 'string', enum: ['repositories', 'code'], description: 'What to search for (default: repositories)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_github_file',
      description: 'Fetch the contents of a file from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          path: { type: 'string', description: 'File path within the repo' },
        },
        required: ['owner', 'repo', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_music',
      description: 'Generate a full song from a text description using Suno AI. Returns a playable audio track in the Music Player.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description of the song to generate' },
          style: { type: 'string', description: 'Optional music style/genre tags (e.g. "rock, energetic, guitar")' },
          instrumental: { type: 'boolean', description: 'Generate instrumental only without lyrics (default: false)' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account_balances',
      description: 'Get current balances for all linked bank accounts. Shows available and current balances.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Get recent bank transactions with dates, amounts, merchants, and categories. Defaults to last 30 days.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (default: 30 days ago)' },
          end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (default: today)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spending_summary',
      description: 'Get a comprehensive financial summary: income vs expenditure, spending by category, top merchants, and account balances.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (default: 30 days ago)' },
          end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (default: today)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_stories',
      description: 'Search for stories from Project Gutenberg (70,000+ classic books) and short story collections. Returns titles, authors, and sources.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (title, author, subject, or theme)' },
          source: { type: 'string', enum: ['all', 'gutenberg', 'short'], description: 'Where to search: all (default), gutenberg (classic books), short (short stories)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tell_story',
      description: 'Start reading a story/book. Use the ID and Source values from search_stories results. Books are paginated — use continue_reading to read subsequent pages. For short stories reads the full text. Set random=true for a surprise story.',
      parameters: {
        type: 'object',
        properties: {
          story_id: { type: 'string', description: 'The story ID from search_stories results (e.g. "11" for Gutenberg or "hf-tinystories-1450265" for short stories)' },
          source: { type: 'string', enum: ['gutenberg', 'huggingface'], description: 'Story source from search_stories results' },
          random: { type: 'boolean', description: 'Get a random story instead of by ID (default: false)' },
          genre: { type: 'string', description: 'Genre for random stories (e.g. adventure, fairy tale, mystery, fantasy)' },
          page: { type: 'number', description: 'Page number to start from (default: 1). Use to jump to a specific page.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'continue_reading',
      description: 'Continue reading the current book — fetches the next page. You MUST call this automatically after every page when reading a book. Do NOT wait for the user to ask. Keep reading until the book ends or the user says stop.',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Optional specific page number to jump to. If omitted, reads the next page.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_to_x',
      description: 'Post a tweet to X (Twitter). IMPORTANT: Always confirm with the user before calling this tool. Show them the exact text you plan to post.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The tweet text (max 280 characters)' },
          reply_to_id: { type: 'string', description: 'Tweet ID to reply to (optional)' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_social_feed',
      description: 'Read posts from X or Threads using the browser. Can view home feed, a user profile, or search results.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['x', 'threads'], description: 'Social platform' },
          username: { type: 'string', description: 'Username/handle to view (without @)' },
          query: { type: 'string', description: 'Search query to find posts' },
        },
        required: ['platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_comments',
      description: 'Read replies/comments on a specific post by navigating to it in the browser.',
      parameters: {
        type: 'object',
        properties: {
          post_url: { type: 'string', description: 'Full URL of the post to read comments on' },
        },
        required: ['post_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_reply',
      description: 'Generate a suggested reply to a social media post or comment. Show it to the user for approval before posting.',
      parameters: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'The post/comment text you are replying to' },
          tone: { type: 'string', description: 'Desired tone (e.g. friendly, professional, witty, supportive)' },
          platform: { type: 'string', enum: ['x', 'threads'], description: 'Target platform' },
        },
        required: ['context', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_reply',
      description: 'Post a reply to a social post. For X, uses API; for Threads, uses browser. IMPORTANT: Always get user approval first.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['x', 'threads'], description: 'Target platform' },
          text: { type: 'string', description: 'The reply text' },
          post_url: { type: 'string', description: 'URL of the post being replied to' },
          tweet_id: { type: 'string', description: 'For X: the tweet ID to reply to' },
        },
        required: ['platform', 'text', 'post_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_post',
      description: 'Schedule a post to be published later. Also used to list or cancel scheduled posts.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['schedule', 'list', 'cancel'], description: 'Schedule, list pending, or cancel a post' },
          platform: { type: 'string', enum: ['x', 'threads'], description: 'Target platform (for schedule action)' },
          text: { type: 'string', description: 'Post text (for schedule action)' },
          scheduled_time: { type: 'string', description: 'ISO 8601 datetime for when to post (for schedule action)' },
          post_id: { type: 'string', description: 'Scheduled post ID (for cancel action)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'learning_stats',
      description: 'Show what Jarvis has learned about the user over time — preferences, corrections, patterns, knowledge, and tool performance. Use when the user asks "what have you learned about me?" or wants to see learning progress.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

// ── Tool executor ───────────────────────────────────────────────────────────

interface ToolExecutorDeps {
  browserControl: BrowserControl | null
  guideMode: boolean
  onStatus?: (status: string) => void
  mediaCanvasControl?: MediaCanvasControl | null
  onMediaGenerating?: (generating: boolean) => void
  onMediaGeneratingLabel?: (label: string) => void
  openMediaCanvas?: () => void
  codeEditorControl?: CodeEditorControl | null
  openCodeEditor?: () => void
  musicPlayerControl?: MusicPlayerControl | null
  openMusicPlayer?: () => void
  onMusicGenerating?: (generating: boolean) => void
  onMusicGeneratingLabel?: (label: string) => void
}

function createToolExecutor(deps: ToolExecutorDeps) {
  const {
    browserControl, guideMode, onStatus,
    mediaCanvasControl, onMediaGenerating, onMediaGeneratingLabel, openMediaCanvas,
    codeEditorControl, openCodeEditor,
    musicPlayerControl, openMusicPlayer, onMusicGenerating, onMusicGeneratingLabel,
  } = deps
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

      case 'show_code': {
        const code = args.code as string
        const language = args.language as string
        if (!code || !language) return 'Missing code or language.'
        if (codeEditorControl) {
          codeEditorControl.showCode(code, language, args.filename as string | undefined)
        } else {
          openCodeEditor?.()
        }
        return 'Code is now displayed in the Code Editor. The user can view, edit, run, copy, or download it.'
      }

      case 'run_code': {
        const code = args.code as string
        const language = args.language as string
        if (!code || !language) return 'Missing code or language.'
        onStatus?.(`Running ${language} code...`)
        try {
          const result = await runCode(code, language)
          let output = ''
          if (result.stdout) output += result.stdout
          if (result.stderr) output += (output ? '\n' : '') + `[stderr] ${result.stderr}`
          if (result.error) output += (output ? '\n' : '') + `[error] ${result.error}`
          if (!output) output = '(no output)'
          return `Execution completed in ${result.elapsed}ms:\n${output}`
        } catch (e) {
          return `Execution failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'ide_create_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const filename = args.filename as string
        const code = args.code as string
        const language = args.language as string
        if (!filename) return 'Missing filename.'
        const fileId = codeEditorControl.createFile(filename, code || '', language || 'javascript')
        return `File "${filename}" created (ID: ${fileId}). It is now the active file in the IDE.`
      }

      case 'ide_edit_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const fileId = args.file_id as string
        const newCode = args.new_code as string
        if (!fileId || newCode == null) return 'Missing file_id or new_code.'
        const ok = codeEditorControl.editFile(fileId, newCode)
        return ok ? `File ${fileId} updated successfully.` : `File ${fileId} not found.`
      }

      case 'ide_replace_text': {
        if (!codeEditorControl) return 'IDE is not available.'
        const searchStr = args.search as string
        const replaceStr = args.replace as string
        if (!searchStr) return 'Missing search text.'
        const count = codeEditorControl.replaceText(searchStr, replaceStr || '', !!args.replace_all)
        return count > 0 ? `Replaced ${count} occurrence(s).` : 'No matches found.'
      }

      case 'ide_get_files': {
        if (!codeEditorControl) return 'IDE is not available.'
        const files = codeEditorControl.getFiles()
        if (files.length === 0) return 'No files open in the IDE.'
        const active = codeEditorControl.getActiveFile()
        return files.map(f => `${f.id === active?.id ? '→ ' : '  '}${f.filename} [${f.language}] (ID: ${f.id})`).join('\n')
      }

      case 'ide_read_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const fid = args.file_id as string | undefined
        if (fid) {
          const content = codeEditorControl.getFileContent(fid)
          return content != null ? content : `File ${fid} not found.`
        }
        const active = codeEditorControl.getActiveFile()
        if (!active) return 'No active file.'
        return `File: ${active.filename} (${active.language})\n---\n${active.code}`
      }

      case 'ide_open_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const ok = codeEditorControl.openFile(args.file_id as string)
        return ok ? 'File opened.' : 'File not found.'
      }

      case 'ide_delete_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const ok = codeEditorControl.deleteFile(args.file_id as string)
        return ok ? 'File deleted.' : 'File not found.'
      }

      case 'ide_rename_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const ok = codeEditorControl.renameFile(args.file_id as string, args.new_name as string)
        return ok ? `File renamed to "${args.new_name}".` : 'File not found.'
      }

      case 'ide_run_and_fix': {
        if (!codeEditorControl) return 'IDE is not available.'
        const active = codeEditorControl.getActiveFile()
        if (!active) return 'No active file to run.'
        onStatus?.(`Running ${active.filename}...`)
        try {
          const result = await codeEditorControl.runActiveFile()
          let output = ''
          if (result.stdout) output += `[stdout]\n${result.stdout}\n`
          if (result.stderr) output += `[stderr]\n${result.stderr}\n`
          if (result.error) output += `[error]\n${result.error}\n`
          if (!output.trim()) output = '(no output)'
          const hasError = !!(result.error || result.stderr)
          return `Ran "${active.filename}" in ${result.elapsed}ms.\n${output}${hasError ? '\n⚠️ Errors detected — read the error output and use ide_replace_text or ide_edit_file to fix them, then run again.' : '\n✅ No errors.'}`
        } catch (e) {
          return `Execution failed: ${e instanceof Error ? e.message : String(e)}\nUse ide_read_file to check the code, then fix with ide_replace_text.`
        }
      }

      case 'ide_find_in_file': {
        if (!codeEditorControl) return 'IDE is not available.'
        const query = args.query as string
        if (!query) return 'Missing query.'
        const matches = codeEditorControl.findInFile(query)
        if (matches.length === 0) return `No matches for "${query}".`
        return `Found ${matches.length} match(es):\n${matches.slice(0, 20).map(m => `  Line ${m.line}, Col ${m.column}: ${m.text}`).join('\n')}`
      }

      case 'ide_toggle_preview': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.togglePreview()
        return 'Preview panel toggled.'
      }

      case 'search_huggingface': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching Hugging Face for "${query}"...`)
        try {
          return await searchHuggingFace(query, (args.type as 'datasets' | 'models') || 'datasets')
        } catch (e) {
          return `HuggingFace search failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'fetch_dataset_sample': {
        const datasetId = args.dataset_id as string
        if (!datasetId) return 'Missing dataset_id.'
        onStatus?.(`Fetching sample from dataset "${datasetId}"...`)
        try {
          return await fetchDatasetSample(datasetId, args.split as string, args.config as string)
        } catch (e) {
          return `Dataset fetch failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'search_github': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching GitHub for "${query}"...`)
        try {
          return await searchGitHub(query, (args.type as 'repositories' | 'code') || 'repositories')
        } catch (e) {
          return `GitHub search failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'fetch_github_file': {
        const { owner, repo, path } = args as { owner?: string; repo?: string; path?: string }
        if (!owner || !repo || !path) return 'Missing owner, repo, or path.'
        onStatus?.(`Fetching ${owner}/${repo}/${path}...`)
        try {
          const content = await fetchGitHubFile(owner, repo, path)
          return content.length > 10000
            ? content.slice(0, 10000) + '\n... (truncated, file is very large)'
            : content
        } catch (e) {
          return `GitHub file fetch failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'generate_music': {
        const prompt = args.prompt as string
        if (!prompt) return 'Missing prompt.'
        onStatus?.('Generating music...')
        onMusicGenerating?.(true)
        onMusicGeneratingLabel?.('Generating music — this takes 1–3 minutes...')
        openMusicPlayer?.()
        try {
          const tracks = await generateMusic(prompt, {
            style: args.style as string | undefined,
            instrumental: args.instrumental as boolean | undefined,
          })
          if (tracks.length > 0) {
            const track = tracks[0]
            musicPlayerControl?.showTrack({
              id: track.id,
              audioUrl: track.audioUrl,
              title: track.title,
              tags: track.tags,
              duration: track.duration,
              prompt,
              createdAt: Date.now(),
            })
          }
          return `Music generated successfully! "${tracks[0]?.title || 'Song'}" is now playing in the Music Player.`
        } catch (e) {
          return `Music generation failed: ${e instanceof Error ? e.message : String(e)}`
        } finally {
          onMusicGenerating?.(false)
          onMusicGeneratingLabel?.('')
        }
      }

      case 'get_account_balances': {
        onStatus?.('Checking account balances...')
        try {
          return await getBalances()
        } catch (e) {
          return `Failed to get balances: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'get_transactions': {
        onStatus?.('Fetching transactions...')
        try {
          return await getTransactions(args.start_date as string | undefined, args.end_date as string | undefined)
        } catch (e) {
          return `Failed to get transactions: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'get_spending_summary': {
        onStatus?.('Analysing your finances...')
        try {
          return await getSpendingSummary(args.start_date as string | undefined, args.end_date as string | undefined)
        } catch (e) {
          return `Failed to get spending summary: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'search_stories': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching stories for "${query}"...`)
        try {
          return await searchStories(query, (args.source as 'all' | 'gutenberg' | 'short') || 'all')
        } catch (e) {
          return `Story search failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'tell_story': {
        if (args.random) {
          onStatus?.('Finding a random story...')
          try {
            return await getRandomStory(args.genre as string | undefined)
          } catch (e) {
            return `Random story failed: ${e instanceof Error ? e.message : String(e)}`
          }
        }
        const storyId = args.story_id as string
        const source = args.source as 'gutenberg' | 'huggingface'
        if (!storyId || !source) return 'Missing story_id or source. Search for stories first with search_stories.'
        const page = typeof args.page === 'number' ? args.page : 1
        onStatus?.(`Fetching story${page > 1 ? ` (page ${page})` : ''}...`)
        try {
          return await getStoryContent(storyId, source, page)
        } catch (e) {
          return `Story fetch failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'continue_reading': {
        const book = getCurrentBook()
        if (!book) return 'No book is currently being read. Search for a story first with search_stories, then use tell_story to start reading.'
        if (typeof args.page === 'number') {
          onStatus?.(`Jumping to page ${args.page} of "${book.title}"...`)
          try {
            return await jumpToPage(args.page)
          } catch (e) {
            return `Page jump failed: ${e instanceof Error ? e.message : String(e)}`
          }
        }
        onStatus?.(`Reading page ${book.page + 1} of "${book.title}"...`)
        try {
          return await continueReading()
        } catch (e) {
          return `Continue reading failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'post_to_x': {
        const text = args.text as string
        if (!text) return 'Missing tweet text.'
        onStatus?.('Posting to X...')
        try {
          const result = await postTweet(text, args.reply_to_id as string | undefined)
          return `Tweet posted successfully! URL: ${result.url}`
        } catch (e) {
          return `Failed to post to X: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'read_social_feed': {
        const platform = args.platform as 'x' | 'threads'
        if (!browserControl) return 'Browser not available. Cannot read social feeds without browser control.'
        onStatus?.(`Reading ${platform === 'x' ? 'X' : 'Threads'} feed...`)
        try {
          return await readSocialFeed(platform, browserControl, {
            username: args.username as string | undefined,
            query: args.query as string | undefined,
          })
        } catch (e) {
          return `Failed to read feed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'read_comments': {
        const postUrl = args.post_url as string
        if (!postUrl) return 'Missing post URL.'
        if (!browserControl) return 'Browser not available. Cannot read comments without browser control.'
        onStatus?.('Reading comments...')
        try {
          return await readComments(postUrl, browserControl)
        } catch (e) {
          return `Failed to read comments: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'suggest_reply': {
        const context = args.context as string
        const tone = (args.tone as string) || 'friendly'
        const platform = args.platform as string
        return `Here is a suggested ${tone} reply for ${platform}. Please confirm before I post it:\n\nContext: "${context.slice(0, 200)}"\n\n[Generate your reply based on the context and tone, then ask the user: "Would you like me to post this reply?"]`
      }

      case 'post_reply': {
        const platform = args.platform as 'x' | 'threads'
        const text = args.text as string
        const postUrl = args.post_url as string
        if (!text) return 'Missing reply text.'
        onStatus?.(`Posting reply on ${platform === 'x' ? 'X' : 'Threads'}...`)
        try {
          if (platform === 'x') {
            const tweetId = args.tweet_id as string
            if (!tweetId) return 'Missing tweet_id for X reply. Extract it from the post URL.'
            const result = await postTweet(text, tweetId)
            return `Reply posted on X! URL: ${result.url}`
          }
          if (!browserControl) return 'Browser not available for Threads reply.'
          return await replyViaBrowser(postUrl, text, browserControl)
        } catch (e) {
          return `Failed to post reply: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'schedule_post': {
        const action = args.action as 'schedule' | 'list' | 'cancel'
        if (action === 'list') {
          return listScheduledPostsSummary()
        }
        if (action === 'cancel') {
          const postId = args.post_id as string
          if (!postId) return 'Missing post_id to cancel.'
          const ok = cancelScheduledPost(postId)
          return ok ? `Scheduled post ${postId} cancelled.` : `Post ${postId} not found.`
        }
        if (action === 'schedule') {
          const platform = args.platform as 'x' | 'threads'
          const text = args.text as string
          const scheduledTime = args.scheduled_time as string
          if (!platform || !text || !scheduledTime) return 'Missing platform, text, or scheduled_time.'
          const post = schedulePost(platform, text, scheduledTime)
          return `Post scheduled for ${new Date(scheduledTime).toLocaleString()} on ${platform.toUpperCase()}.\nID: ${post.id}\nText: "${text}"`
        }
        return 'Invalid schedule action.'
      }

      case 'learning_stats':
        return getLearningStats()

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
  codeEditorControl?: CodeEditorControl | null
  openCodeEditor?: () => void
  musicPlayerControl?: MusicPlayerControl | null
  openMusicPlayer?: () => void
  onMusicGenerating?: (generating: boolean) => void
  onMusicGeneratingLabel?: (label: string) => void
  signal?: AbortSignal
  onStatus?: (status: string) => void
  onToolCall?: (name: string, args: Record<string, unknown>) => void
}

export interface ChatWithToolsResult {
  content: string
  reasoning: string
}

export async function runChatWithTools(options: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
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
    codeEditorControl = null,
    openCodeEditor,
    musicPlayerControl = null,
    openMusicPlayer,
    onMusicGenerating,
    onMusicGeneratingLabel,
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

  const toolsUsed: string[] = []

  const rawExecutor = createToolExecutor({
    browserControl, guideMode, onStatus,
    mediaCanvasControl, onMediaGenerating, onMediaGeneratingLabel, openMediaCanvas,
    codeEditorControl, openCodeEditor,
    musicPlayerControl, openMusicPlayer, onMusicGenerating, onMusicGeneratingLabel,
  })

  const trackedExecutor = async (name: string, args: Record<string, unknown>): Promise<string> => {
    toolsUsed.push(name)
    const start = Date.now()
    try {
      const output = await rawExecutor(name, args)
      trackToolOutcome({
        tool_name: name,
        success: true,
        execution_time_ms: Date.now() - start,
      }).catch(() => {})
      return output
    } catch (err) {
      trackToolOutcome({
        tool_name: name,
        success: false,
        execution_time_ms: Date.now() - start,
        error_message: err instanceof Error ? err.message : 'Unknown error',
      }).catch(() => {})
      throw err
    }
  }

  const messages: LlmToolMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const result = await runToolLoop(messages, model, tools, trackedExecutor, {
    maxRounds: 30,
    signal,
    onToolCall,
  })

  const toolOutputs = result.messages
    .filter(m => m.role === 'tool' && m.content)
    .map(m => String(m.content))

  const sourceEvidence = result.messages
    .filter(m => m.role === 'user' && m.content)
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .join('\n')

  let finalContent = result.content
  try {
    onStatus?.('Verifying response accuracy...')
    const validated = await validateResponse({
      userQuery: userPrompt,
      response: result.content,
      sourceEvidence,
      toolOutputs,
      strictMode: true,
    })
    finalContent = validated.response
  } catch { /* use original content */ }

  const { answer, thinking } = splitThinkingFromModelContent(finalContent, '')

  analyzeExchangeAsync(userPrompt, answer || finalContent, toolsUsed)

  return {
    content: answer || finalContent,
    reasoning: thinking,
  }
}
