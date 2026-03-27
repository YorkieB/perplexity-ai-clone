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
import { emailListInbox, emailReadMessage, emailSend, emailSearch, emailListFolders, emailMove, emailDelete, emailMarkRead } from './email-api'
import { ensureGoogleAccessToken, listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, listCalendars, formatEventTime } from './google-calendar'
import type { NewCalendarEvent } from './google-calendar'
import { driveListFiles, driveSearchFiles, driveReadFile, driveCreateFile, driveCreateFolder, driveMoveFile, driveRenameFile, driveDeleteFile, formatDriveFile } from './google-drive'
import { ensureOneDriveAccessToken, onedriveListFiles, onedriveSearchFiles, onedriveReadFile, onedriveCreateFile, onedriveCreateFolder, onedriveMoveFile, onedriveRenameFile, onedriveDeleteFile, formatOneDriveFile } from './onedrive-api'
import { vonageAiVoiceCall, vonageSendSms, vonageVoiceCall } from './vonage-api'
import type { UserSettings } from './types'
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
      name: 'ide_create_from_template',
      description: 'Create a new file from a built-in template (HTML Page, React Component, Python Script, Express Server, CSS Stylesheet, JSON Config, Markdown README, Python Flask API).',
      parameters: { type: 'object', properties: { template_name: { type: 'string', description: 'Template name' } }, required: ['template_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_search_all_files',
      description: 'Search for text across ALL open files. Returns matching files, lines, and text.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Text to search for' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_go_to_line',
      description: 'Jump the cursor to a specific line number in the active file.',
      parameters: { type: 'object', properties: { line: { type: 'number', description: 'Line number to jump to' } }, required: ['line'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_format_document',
      description: 'Auto-format the current document.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_problems',
      description: 'Get all detected errors/warnings from the last code run.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_terminal_output',
      description: 'Get the full terminal output history.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_terminal',
      description: 'Show or hide the terminal panel.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_run_terminal',
      description:
        'Run a shell command in the opened workspace folder (desktop app only). Output appears in the IDE terminal.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command (e.g. npm run build, git status)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_zen_mode',
      description: 'Toggle distraction-free zen mode.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_split_editor',
      description: 'Split the editor to show two files side by side.',
      parameters: { type: 'object', properties: { file_id: { type: 'string', description: 'Optional file ID to show in the split pane' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_diff_editor',
      description: 'Compare two files in a diff view.',
      parameters: { type: 'object', properties: { target_file_id: { type: 'string', description: 'File ID to compare against the active file' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_explorer',
      description: 'Show or hide the file explorer sidebar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_problems_panel',
      description: 'Show the problems panel with errors and warnings.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_search_panel',
      description: 'Show the search-across-files panel in the sidebar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_outline_panel',
      description: 'Show the code outline/symbols panel.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_toggle_settings_panel',
      description: 'Show the IDE settings panel.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_theme',
      description: 'Change the IDE theme. Options: jarvis-dark, monokai, dracula, github-dark, one-dark, solarized-dark, vs-light, hc-black.',
      parameters: { type: 'object', properties: { theme_id: { type: 'string', description: 'Theme ID' } }, required: ['theme_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_settings',
      description: 'Get current IDE settings (theme, font size, tab size, word wrap, minimap, auto-save).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_font_size',
      description: 'Change the editor font size (10-32).',
      parameters: { type: 'object', properties: { size: { type: 'number', description: 'Font size' } }, required: ['size'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_tab_size',
      description: 'Change the tab/indent size.',
      parameters: { type: 'object', properties: { size: { type: 'number', description: 'Tab size (2, 4, or 8)' } }, required: ['size'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_word_wrap',
      description: 'Toggle word wrap on or off.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_minimap',
      description: 'Toggle the minimap on or off.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_set_auto_save',
      description: 'Toggle auto-save on or off.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_outline',
      description: 'Get the code outline — functions, classes, imports, and variables with line numbers.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_available_templates',
      description: 'List available file templates.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ide_get_available_themes',
      description: 'List available IDE themes.',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ── Git tools ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get the current git status of the workspace. Shows staged, unstaged, and untracked files. Requires IDE open with a workspace folder.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git diff for the workspace. Use staged=true to see staged changes, omit for unstaged. Optionally restrict to a specific file.',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Show staged (--cached) changes (default: false)' },
          file: { type: 'string', description: 'Specific file path to diff (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show recent git commit history with short hashes, authors, and messages.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to show (default: 15)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for the next commit. Use "." to stage all changed files.',
      parameters: {
        type: 'object',
        properties: {
          files: { type: 'string', description: 'Files to stage, e.g. "." or "src/foo.ts src/bar.ts"' },
        },
        required: ['files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit staged changes with a commit message.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push commits to the remote repository.',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch name (default: current branch)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_pull',
      description: 'Pull changes from the remote repository.',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch name (default: current branch)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description: 'List all branches, or create a new branch. Omit "create" to just list.',
      parameters: {
        type: 'object',
        properties: {
          create: { type: 'string', description: 'Name of a new branch to create (omit to list)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_checkout',
      description: 'Switch to a different existing branch.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch name to check out' },
        },
        required: ['branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_stash',
      description: 'Stash current working tree changes, pop the latest stash, or list stashes.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['stash', 'pop', 'list'], description: 'Action: stash (save), pop (restore), list (default: stash)' },
          message: { type: 'string', description: 'Optional stash message (only for "stash" action)' },
        },
      },
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
  {
    type: 'function',
    function: {
      name: 'email_list_inbox',
      description: 'List recent emails from the inbox. Shows sender, subject, date, and read status. Defaults to contact@yorkiebrown.uk unless another account is specified.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account: "contact@yorkiebrown.uk" or "yorkie@yorkiebrown.uk". Defaults to contact@.' },
          folder: { type: 'string', description: 'IMAP folder (default: INBOX). Use email_list_folders to see available folders.' },
          limit: { type: 'number', description: 'Max emails to return (default: 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_read',
      description: 'Read the full content of a specific email by UID. Use after email_list_inbox or email_search to get the UID.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account' },
          uid: { type: 'number', description: 'The email UID from the inbox listing' },
        },
        required: ['uid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_send',
      description: 'Send an email from one of the configured accounts. Supports replies via replyToMessageId.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account to send from (default: contact@yorkiebrown.uk)' },
          to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body text' },
          replyToMessageId: { type: 'string', description: 'Message-ID header of the email being replied to (threading)' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_search',
      description: 'Search emails by keyword across subject, sender, and body.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account to search' },
          query: { type: 'string', description: 'Search term' },
          folder: { type: 'string', description: 'IMAP folder (default: INBOX)' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_list_folders',
      description: 'List all email folders/mailboxes for an account.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_move',
      description: 'Move an email to a different folder.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account' },
          uid: { type: 'number', description: 'Email UID' },
          targetFolder: { type: 'string', description: 'Destination folder (e.g. "Trash", "Archive", "Junk")' },
        },
        required: ['uid', 'targetFolder'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_delete',
      description: 'Permanently delete an email.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account' },
          uid: { type: 'number', description: 'Email UID' },
        },
        required: ['uid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_mark_read',
      description: 'Mark an email as read or unread.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Email account' },
          uid: { type: 'number', description: 'Email UID' },
          read: { type: 'boolean', description: 'true = mark read, false = mark unread' },
        },
        required: ['uid', 'read'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_list_events',
      description: 'List upcoming Google Calendar events. Can filter by date range, calendar, or search query.',
      parameters: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'Start of range (ISO 8601). Defaults to now.' },
          timeMax: { type: 'string', description: 'End of range (ISO 8601). Omit for open-ended.' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
          maxResults: { type: 'number', description: 'Max events (default: 25)' },
          query: { type: 'string', description: 'Free-text search within events' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_create_event',
      description: 'Create a new Google Calendar event.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Event title' },
          startDateTime: { type: 'string', description: 'Start time (ISO 8601, e.g. 2026-03-27T10:00:00Z)' },
          endDateTime: { type: 'string', description: 'End time (ISO 8601)' },
          description: { type: 'string', description: 'Event description/notes' },
          location: { type: 'string', description: 'Event location' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses of attendees' },
          allDay: { type: 'boolean', description: 'true for all-day event' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
        required: ['summary', 'startDateTime', 'endDateTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_update_event',
      description: 'Update an existing Google Calendar event by ID.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'Event ID from calendar_list_events' },
          summary: { type: 'string', description: 'New title' },
          startDateTime: { type: 'string', description: 'New start time (ISO 8601)' },
          endDateTime: { type: 'string', description: 'New end time (ISO 8601)' },
          description: { type: 'string', description: 'New description' },
          location: { type: 'string', description: 'New location' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'New attendees list' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_delete_event',
      description: 'Delete a Google Calendar event by ID.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'Event ID' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_list_calendars',
      description: 'List all Google calendars the user has access to.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_list_files',
      description: 'List files and folders in Google Drive. Can browse specific folders.',
      parameters: {
        type: 'object',
        properties: {
          folderId: { type: 'string', description: 'Folder ID to list (default: root)' },
          query: { type: 'string', description: 'Filter files by name' },
          maxResults: { type: 'number', description: 'Max files (default: 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_search',
      description: 'Search Google Drive files by name or content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
          maxResults: { type: 'number', description: 'Max results (default: 30)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_read_file',
      description: 'Read/download the content of a Google Drive file by ID. Google Docs are exported as plain text.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID from drive_list_files or drive_search' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_create_file',
      description: 'Create a new file in Google Drive with text content.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'File name (e.g. "notes.txt", "report.md")' },
          content: { type: 'string', description: 'File content' },
          parentId: { type: 'string', description: 'Parent folder ID (default: root)' },
          mimeType: { type: 'string', description: 'MIME type (default: text/plain)' },
        },
        required: ['name', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_create_folder',
      description: 'Create a new folder in Google Drive.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parentId: { type: 'string', description: 'Parent folder ID (default: root)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_move_file',
      description: 'Move a file or folder to a different folder in Google Drive.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID to move' },
          newParentId: { type: 'string', description: 'Destination folder ID' },
        },
        required: ['fileId', 'newParentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_rename_file',
      description: 'Rename a file or folder in Google Drive.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID' },
          newName: { type: 'string', description: 'New name' },
        },
        required: ['fileId', 'newName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drive_delete_file',
      description: 'Permanently delete a file or folder from Google Drive.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID to delete' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_list_files',
      description: 'List files and folders in Microsoft OneDrive.',
      parameters: {
        type: 'object',
        properties: {
          folderId: { type: 'string', description: 'Folder ID to list (default: root)' },
          maxResults: { type: 'number', description: 'Max files (default: 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_search',
      description: 'Search OneDrive files by name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
          maxResults: { type: 'number', description: 'Max results (default: 30)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_read_file',
      description: 'Read/download a file from OneDrive by ID.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID from onedrive_list_files or onedrive_search' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_create_file',
      description: 'Create a new file in OneDrive.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: 'File name (e.g. "notes.txt")' },
          content: { type: 'string', description: 'File content' },
          parentPath: { type: 'string', description: 'Parent folder path (default: "/")' },
        },
        required: ['fileName', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_create_folder',
      description: 'Create a new folder in OneDrive.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parentId: { type: 'string', description: 'Parent folder ID (default: root)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_move_file',
      description: 'Move a file or folder to a different OneDrive folder.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID to move' },
          newParentId: { type: 'string', description: 'Destination folder ID' },
        },
        required: ['fileId', 'newParentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_rename_file',
      description: 'Rename a file or folder in OneDrive.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID' },
          newName: { type: 'string', description: 'New name' },
        },
        required: ['fileId', 'newName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'onedrive_delete_file',
      description: 'Delete a file or folder from OneDrive.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File/folder ID to delete' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vonage_send_sms',
      description: 'Send an SMS text message via Vonage (server must have VONAGE_* env vars). Use for appointment reminders or short notifications the user asked you to send. Respect consent and local rules.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient phone number (international, e.g. +447700900123 or 07700900123 UK)' },
          text: { type: 'string', description: 'Message body (max 1000 characters)' },
        },
        required: ['to', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vonage_voice_call',
      description: 'Place an outbound phone call via Vonage Voice API. When the person answers, Vonage text-to-speech speaks your message aloud (scripted announcement only). Requires Voice app credentials (VONAGE_APPLICATION_ID + private key) in .env.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Phone number to call (international format)' },
          text: { type: 'string', description: 'Exact words to speak (max 3000 characters)' },
          language: { type: 'string', description: 'TTS language/locale (default: en-GB)' },
        },
        required: ['to', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vonage_ai_voice_call',
      description:
        'Start a live two-way AI phone call via Vonage: caller audio is streamed to the server WebSocket bridge (speech-to-text → model → text-to-speech back to the line). Requires Voice app credentials, VONAGE_PUBLIC_WS_URL (public wss:// to your bridge, e.g. ngrok), optional VONAGE_WS_SECRET, and the AI voice bridge enabled/running. Do not use for a simple one-shot spoken script — use vonage_voice_call instead.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Phone number to call (international format)' },
        },
        required: ['to'],
      },
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
  getCodeEditorControl?: () => CodeEditorControl | null
  openCodeEditor?: () => void
  musicPlayerControl?: MusicPlayerControl | null
  openMusicPlayer?: () => void
  onMusicGenerating?: (generating: boolean) => void
  onMusicGeneratingLabel?: (label: string) => void
  userSettings?: UserSettings | null
  setUserSettings?: (fn: (prev: UserSettings) => UserSettings) => void
}

function createToolExecutor(deps: ToolExecutorDeps) {
  const {
    browserControl, guideMode, onStatus,
    mediaCanvasControl, onMediaGenerating, onMediaGeneratingLabel, openMediaCanvas,
    openCodeEditor,
    musicPlayerControl, openMusicPlayer, onMusicGenerating, onMusicGeneratingLabel,
  } = deps

  const getIde = (): CodeEditorControl | null => {
    if (deps.getCodeEditorControl) return deps.getCodeEditorControl()
    return deps.codeEditorControl ?? null
  }

  const getGoogleToken = async (): Promise<string> => {
    if (!deps.userSettings || !deps.setUserSettings) throw new Error('Google not connected. Go to Settings → OAuth and connect Google.')
    const token = await ensureGoogleAccessToken(deps.userSettings, deps.setUserSettings)
    if (!token) throw new Error('Google token expired or missing. Reconnect Google in Settings → OAuth.')
    return token
  }

  const getOneDriveToken = async (): Promise<string> => {
    if (!deps.userSettings || !deps.setUserSettings) throw new Error('OneDrive not connected. Go to Settings → OAuth and connect OneDrive.')
    const token = await ensureOneDriveAccessToken(deps.userSettings, deps.setUserSettings)
    if (!token) throw new Error('OneDrive token expired or missing. Reconnect OneDrive in Settings → OAuth.')
    return token
  }

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    /** Control object exists while CodeEditorModal is mounted, but Monaco is only live when the modal is open. */
    if (name.startsWith('ide_') || name.startsWith('git_')) {
      let ide = getIde()
      if (!ide || !ide.isOpen()) {
        openCodeEditor?.()
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 150))
          ide = getIde()
          if (ide?.isOpen()) {
            await new Promise((r) => setTimeout(r, 500))
            break
          }
        }
      }
    }
    const codeEditorControl = getIde()
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
        const matchLines = matches
          .slice(0, 20)
          .map((m) => '  Line ' + String(m.line) + ', Col ' + String(m.column) + ': ' + m.text)
          .join('\n')
        return `Found ${matches.length} match(es):\n${matchLines}`
      }

      case 'ide_toggle_preview': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.togglePreview()
        return 'Preview panel toggled.'
      }

      case 'ide_create_from_template': {
        if (!codeEditorControl) return 'IDE is not available.'
        const tName = args.template_name as string
        if (!tName) return 'Missing template_name.'
        const id = codeEditorControl.createFromTemplate(tName)
        if (!id) return `Template "${tName}" not found. Available: ${codeEditorControl.getAvailableTemplates().join(', ')}`
        return `File created from template "${tName}" (ID: ${id}).`
      }

      case 'ide_search_all_files': {
        if (!codeEditorControl) return 'IDE is not available.'
        const sq = args.query as string
        if (!sq) return 'Missing query.'
        const results = codeEditorControl.searchAllFiles(sq)
        if (results.length === 0) return `No matches for "${sq}" across files.`
        const resultLines = results
          .slice(0, 30)
          .map((r) => '  ' + r.filename + ':' + String(r.line) + ': ' + r.text)
          .join('\n')
        return `Found ${results.length} match(es):\n${resultLines}`
      }

      case 'ide_go_to_line': {
        if (!codeEditorControl) return 'IDE is not available.'
        const ln = args.line as number
        if (!ln) return 'Missing line number.'
        codeEditorControl.goToLine(ln)
        return `Jumped to line ${ln}.`
      }

      case 'ide_format_document': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.formatDocument()
        return 'Document formatted.'
      }

      case 'ide_get_problems': {
        if (!codeEditorControl) return 'IDE is not available.'
        const probs = codeEditorControl.getProblems()
        if (probs.length === 0) return 'No problems detected.'
        const probLines = probs
          .map(
            (p) =>
              '  ' +
              p.source +
              ':' +
              String(p.line) +
              ':' +
              String(p.column) +
              ' [' +
              p.severity +
              '] ' +
              p.message,
          )
          .join('\n')
        return `${probs.length} problem(s):\n${probLines}`
      }

      case 'ide_get_terminal_output': {
        if (!codeEditorControl) return 'IDE is not available.'
        const tout = codeEditorControl.getTerminalOutput()
        return tout || '(terminal is empty)'
      }

      case 'ide_toggle_terminal': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleTerminal()
        return 'Terminal panel toggled.'
      }

      case 'ide_run_terminal': {
        if (!codeEditorControl) return 'IDE is not available.'
        const cmd = String(args.command ?? '').trim()
        if (!cmd) return 'Provide command (e.g. npm run build).'
        const r = await codeEditorControl.runTerminalCommand(cmd)
        let out = ''
        if (r.stdout) out += `stdout:\n${r.stdout}\n\n`
        if (r.stderr) out += `stderr:\n${r.stderr}\n\n`
        if (r.exitCode != null) out += `exit code: ${String(r.exitCode)}\n`
        if (r.error) out += `note: ${r.error}\n`
        return out.trim() || '(command finished with no output)'
      }

      case 'ide_toggle_zen_mode': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleZenMode()
        return 'Zen mode toggled.'
      }

      case 'ide_toggle_split_editor': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleSplitEditor(args.file_id as string | undefined)
        return 'Split editor toggled.'
      }

      case 'ide_toggle_diff_editor': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleDiffEditor(args.target_file_id as string | undefined)
        return 'Diff editor toggled.'
      }

      case 'ide_toggle_explorer': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleExplorer()
        return 'Explorer panel toggled.'
      }

      case 'ide_toggle_problems_panel': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleProblemsPanel()
        return 'Problems panel toggled.'
      }

      case 'ide_toggle_search_panel': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleSearchPanel()
        return 'Search panel toggled.'
      }

      case 'ide_toggle_outline_panel': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleOutlinePanel()
        return 'Outline panel toggled.'
      }

      case 'ide_toggle_settings_panel': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.toggleSettingsPanel()
        return 'Settings panel toggled.'
      }

      case 'ide_set_theme': {
        if (!codeEditorControl) return 'IDE is not available.'
        const tid = args.theme_id as string
        if (!tid) return 'Missing theme_id.'
        codeEditorControl.setTheme(tid)
        return `Theme changed to "${tid}".`
      }

      case 'ide_get_settings': {
        if (!codeEditorControl) return 'IDE is not available.'
        return JSON.stringify(codeEditorControl.getSettings(), null, 2)
      }

      case 'ide_set_font_size': {
        if (!codeEditorControl) return 'IDE is not available.'
        const sz = args.size as number
        if (!sz) return 'Missing size.'
        codeEditorControl.setFontSize(sz)
        return `Font size set to ${sz}.`
      }

      case 'ide_set_tab_size': {
        if (!codeEditorControl) return 'IDE is not available.'
        const ts = args.size as number
        if (!ts) return 'Missing size.'
        codeEditorControl.setTabSize(ts)
        return `Tab size set to ${ts}.`
      }

      case 'ide_set_word_wrap': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.setWordWrap(!!args.enabled)
        return `Word wrap ${args.enabled ? 'enabled' : 'disabled'}.`
      }

      case 'ide_set_minimap': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.setMinimap(!!args.enabled)
        return `Minimap ${args.enabled ? 'enabled' : 'disabled'}.`
      }

      case 'ide_set_auto_save': {
        if (!codeEditorControl) return 'IDE is not available.'
        codeEditorControl.setAutoSave(!!args.enabled)
        return `Auto-save ${args.enabled ? 'enabled' : 'disabled'}.`
      }

      case 'ide_get_outline': {
        if (!codeEditorControl) return 'IDE is not available.'
        const symbols = codeEditorControl.getOutlineSymbols()
        if (symbols.length === 0) return 'No symbols found in the current file.'
        const symLines = symbols
          .map((s) => '  Line ' + String(s.line) + ': [' + s.kind + '] ' + s.name)
          .join('\n')
        return `${symbols.length} symbol(s):\n${symLines}`
      }

      case 'ide_get_available_templates': {
        if (!codeEditorControl) return 'IDE is not available.'
        const templateLines = codeEditorControl.getAvailableTemplates().map((t) => '  - ' + t).join('\n')
        return 'Available templates:\n' + templateLines
      }

      case 'ide_get_available_themes': {
        if (!codeEditorControl) return 'IDE is not available.'
        const themeLines = codeEditorControl
          .getAvailableThemes()
          .map((t) => '  - ' + t.id + ': ' + t.label)
          .join('\n')
        return 'Available themes:\n' + themeLines
      }

      // ── Git tools ─────────────────────────────────────────────────────────

      case 'git_status': {
        onStatus?.('Checking git status…')
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const r = await ide.runGitCommand(['status', '--short', '-b'])
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          return out || 'Working tree is clean.'
        } catch (e) {
          return `git status failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_diff': {
        onStatus?.('Getting git diff…')
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const diffArgs = ['diff']
          if (args.staged) diffArgs.push('--cached')
          if (args.file) diffArgs.push('--', args.file as string)
          const r = await ide.runGitCommand(diffArgs)
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          return out ? out.slice(0, 8000) : 'No diff output (nothing changed).'
        } catch (e) {
          return `git diff failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_log': {
        onStatus?.('Getting git log…')
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const count = Math.min(Number(args.count) || 15, 50)
          const r = await ide.runGitCommand(['log', `--oneline`, `-${count}`, '--decorate'])
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          return out || 'No commits found.'
        } catch (e) {
          return `git log failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_add': {
        const files = (args.files as string || '').trim()
        if (!files) return 'Missing files argument.'
        onStatus?.(`Staging: ${files}…`)
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const r = await ide.runGitCommand(['add', ...files.split(/\s+/).filter(Boolean)])
          if (!r.ok && r.error) return `git add failed: ${r.error}`
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          return out || `Staged: ${files}`
        } catch (e) {
          return `git add failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_commit': {
        const message = (args.message as string || '').trim()
        if (!message) return 'Missing commit message.'
        onStatus?.('Committing…')
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const r = await ide.runGitCommand(['commit', '-m', message])
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          if (!r.ok) return `git commit failed:\n${out}`
          return out || `Committed: ${message}`
        } catch (e) {
          return `git commit failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_push': {
        const remote = (args.remote as string || 'origin').trim()
        const branch = (args.branch as string || '').trim()
        onStatus?.(`Pushing to ${remote}…`)
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const pushArgs = ['push', remote]
          if (branch) pushArgs.push(branch)
          const r = await ide.runGitCommand(pushArgs)
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          if (!r.ok) return `git push failed:\n${out}`
          return out || 'Pushed successfully.'
        } catch (e) {
          return `git push failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_pull': {
        const remote = (args.remote as string || 'origin').trim()
        const branch = (args.branch as string || '').trim()
        onStatus?.(`Pulling from ${remote}…`)
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const pullArgs = ['pull', remote]
          if (branch) pullArgs.push(branch)
          const r = await ide.runGitCommand(pullArgs)
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          if (!r.ok) return `git pull failed:\n${out}`
          return out || 'Pull complete.'
        } catch (e) {
          return `git pull failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_branch': {
        onStatus?.('Listing/creating branches…')
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const createName = (args.create as string || '').trim()
          if (createName) {
            const r = await ide.runGitCommand(['checkout', '-b', createName])
            const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
            if (!r.ok) return `git branch create failed:\n${out}`
            return out || `Created and switched to branch: ${createName}`
          }
          const r = await ide.runGitCommand(['branch', '-a'])
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          return out || 'No branches found.'
        } catch (e) {
          return `git branch failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_checkout': {
        const branch = (args.branch as string || '').trim()
        if (!branch) return 'Missing branch name.'
        onStatus?.(`Checking out ${branch}…`)
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          const r = await ide.runGitCommand(['checkout', branch])
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          if (!r.ok) return `git checkout failed:\n${out}`
          return out || `Switched to branch: ${branch}`
        } catch (e) {
          return `git checkout failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'git_stash': {
        const action = (args.action as string || 'stash').trim()
        onStatus?.(`git stash ${action}…`)
        try {
          const ide = getIde()
          if (!ide) return 'Git requires the IDE to be open with a workspace folder.'
          let stashArgs: string[]
          if (action === 'pop') {
            stashArgs = ['stash', 'pop']
          } else if (action === 'list') {
            stashArgs = ['stash', 'list']
          } else {
            stashArgs = ['stash', 'push']
            if (args.message) stashArgs.push('-m', args.message as string)
          }
          const r = await ide.runGitCommand(stashArgs)
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
          if (!r.ok) return `git stash failed:\n${out}`
          return out || `git stash ${action} complete.`
        } catch (e) {
          return `git stash failed: ${e instanceof Error ? e.message : String(e)}`
        }
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
        const pageSuffix = page > 1 ? ' (page ' + String(page) + ')' : ''
        onStatus?.(`Fetching story${pageSuffix}...`)
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

      case 'email_list_inbox': {
        onStatus?.('Checking inbox...')
        try {
          return await emailListInbox(
            args.account as string | undefined,
            args.folder as string | undefined,
            args.limit as number | undefined,
          )
        } catch (e) {
          return `Failed to list inbox: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_read': {
        const uid = args.uid as number
        if (!uid) return 'Missing uid.'
        onStatus?.('Reading email...')
        try {
          return await emailReadMessage(
            (args.account as string) || 'contact@yorkiebrown.uk',
            uid,
          )
        } catch (e) {
          return `Failed to read email: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_send': {
        const to = args.to as string
        const subject = args.subject as string
        const body = args.body as string
        if (!to || !subject || !body) return 'Missing to, subject, or body.'
        onStatus?.('Sending email...')
        try {
          return await emailSend(
            (args.account as string) || 'contact@yorkiebrown.uk',
            to, subject, body,
            args.replyToMessageId as string | undefined,
          )
        } catch (e) {
          return `Failed to send email: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_search': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching emails for "${query}"...`)
        try {
          return await emailSearch(
            (args.account as string) || 'contact@yorkiebrown.uk',
            query,
            args.folder as string | undefined,
            args.limit as number | undefined,
          )
        } catch (e) {
          return `Email search failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_list_folders': {
        onStatus?.('Listing email folders...')
        try {
          return await emailListFolders(args.account as string | undefined)
        } catch (e) {
          return `Failed to list folders: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_move': {
        const uid = args.uid as number
        const targetFolder = args.targetFolder as string
        if (!uid || !targetFolder) return 'Missing uid or targetFolder.'
        onStatus?.('Moving email...')
        try {
          return await emailMove(
            (args.account as string) || 'contact@yorkiebrown.uk',
            uid, targetFolder,
          )
        } catch (e) {
          return `Failed to move email: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_delete': {
        const uid = args.uid as number
        if (!uid) return 'Missing uid.'
        onStatus?.('Deleting email...')
        try {
          return await emailDelete(
            (args.account as string) || 'contact@yorkiebrown.uk',
            uid,
          )
        } catch (e) {
          return `Failed to delete email: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'email_mark_read': {
        const uid = args.uid as number
        if (typeof args.read !== 'boolean') return 'Missing uid or read flag.'
        onStatus?.(`Marking email as ${args.read ? 'read' : 'unread'}...`)
        try {
          return await emailMarkRead(
            (args.account as string) || 'contact@yorkiebrown.uk',
            uid,
            args.read as boolean,
          )
        } catch (e) {
          return `Failed to update email: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'calendar_list_events': {
        onStatus?.('Checking your calendar...')
        try {
          const token = await getGoogleToken()
          const events = await listCalendarEvents(token, {
            timeMin: args.timeMin as string | undefined,
            timeMax: args.timeMax as string | undefined,
            calendarId: args.calendarId as string | undefined,
            maxResults: args.maxResults as number | undefined,
            query: args.query as string | undefined,
          })
          if (events.length === 0) return 'No upcoming events found.'
          return events.map(e => {
            const time = formatEventTime(e)
            const date = e.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            const loc = e.location ? ` | ${e.location}` : ''
            const attendees = e.attendees?.length ? ` | ${e.attendees.join(', ')}` : ''
            return `${date} ${time} — ${e.summary}${loc}${attendees}\n  ID: ${e.id}`
          }).join('\n\n')
        } catch (e) {
          return `Calendar error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'calendar_create_event': {
        const summary = args.summary as string
        const startDT = args.startDateTime as string
        const endDT = args.endDateTime as string
        if (!summary || !startDT || !endDT) return 'Missing summary, startDateTime, or endDateTime.'
        onStatus?.('Creating calendar event...')
        try {
          const token = await getGoogleToken()
          const event = await createCalendarEvent(token, {
            summary,
            startDateTime: startDT,
            endDateTime: endDT,
            description: args.description as string | undefined,
            location: args.location as string | undefined,
            attendees: args.attendees as string[] | undefined,
            allDay: args.allDay as boolean | undefined,
            calendarId: args.calendarId as string | undefined,
          })
          const time = formatEventTime(event)
          let eventMsg = `Event created: "${event.summary}" on ${event.start.toLocaleDateString()} at ${time}\nID: ${event.id}`
          if (event.htmlLink) eventMsg += '\nLink: ' + event.htmlLink
          return eventMsg
        } catch (e) {
          return `Failed to create event: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'calendar_update_event': {
        const eventId = args.eventId as string
        if (!eventId) return 'Missing eventId.'
        onStatus?.('Updating calendar event...')
        try {
          const token = await getGoogleToken()
          const updates: Partial<NewCalendarEvent> = {}
          if (args.summary) updates.summary = args.summary as string
          if (args.startDateTime) updates.startDateTime = args.startDateTime as string
          if (args.endDateTime) updates.endDateTime = args.endDateTime as string
          if (args.description) updates.description = args.description as string
          if (args.location) updates.location = args.location as string
          if (args.attendees) updates.attendees = args.attendees as string[]
          if (args.calendarId) updates.calendarId = args.calendarId as string
          const event = await updateCalendarEvent(token, eventId, updates)
          return `Event updated: "${event.summary}" on ${event.start.toLocaleDateString()}\nID: ${event.id}`
        } catch (e) {
          return `Failed to update event: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'calendar_delete_event': {
        const eventId = args.eventId as string
        if (!eventId) return 'Missing eventId.'
        onStatus?.('Deleting calendar event...')
        try {
          const token = await getGoogleToken()
          await deleteCalendarEvent(token, eventId, args.calendarId as string | undefined)
          return 'Event deleted.'
        } catch (e) {
          return `Failed to delete event: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'calendar_list_calendars': {
        onStatus?.('Listing calendars...')
        try {
          const token = await getGoogleToken()
          const cals = await listCalendars(token)
          if (cals.length === 0) return 'No calendars found.'
          return cals.map(c => {
            const primary = c.primary ? ' [PRIMARY]' : ''
            return `${c.summary}${primary} (${c.accessRole})\n  ID: ${c.id}`
          }).join('\n\n')
        } catch (e) {
          return `Calendar error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_list_files': {
        onStatus?.('Browsing Google Drive...')
        try {
          const token = await getGoogleToken()
          const result = await driveListFiles(token, {
            folderId: args.folderId as string | undefined,
            query: args.query as string | undefined,
            maxResults: args.maxResults as number | undefined,
          })
          if (result.files.length === 0) return 'No files found.'
          return result.files.map(formatDriveFile).join('\n\n')
        } catch (e) {
          return `Drive error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_search': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching Drive for "${query}"...`)
        try {
          const token = await getGoogleToken()
          const files = await driveSearchFiles(token, query, args.maxResults as number | undefined)
          if (files.length === 0) return `No files matching "${query}".`
          return `Found ${String(files.length)} file(s):\n\n` + files.map(formatDriveFile).join('\n\n')
        } catch (e) {
          return `Drive search error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_read_file': {
        const fileId = args.fileId as string
        if (!fileId) return 'Missing fileId.'
        onStatus?.('Reading file from Drive...')
        try {
          const token = await getGoogleToken()
          const content = await driveReadFile(token, fileId)
          if (content.length > 10000) return content.slice(0, 10000) + '\n\n... (truncated, file is very large)'
          return content
        } catch (e) {
          return `Drive read error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_create_file': {
        const fileName = args.name as string
        const content = args.content as string
        if (!fileName || content === undefined) return 'Missing name or content.'
        onStatus?.('Creating file on Drive...')
        try {
          const token = await getGoogleToken()
          const file = await driveCreateFile(token, fileName, content, {
            parentId: args.parentId as string | undefined,
            mimeType: args.mimeType as string | undefined,
          })
          let driveMsg = `File created: ${file.name}\nID: ${file.id}`
          if (file.webViewLink) driveMsg += '\nLink: ' + file.webViewLink
          return driveMsg
        } catch (e) {
          return `Drive create error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_create_folder': {
        const folderName = args.name as string
        if (!folderName) return 'Missing name.'
        onStatus?.('Creating folder on Drive...')
        try {
          const token = await getGoogleToken()
          const folder = await driveCreateFolder(token, folderName, args.parentId as string | undefined)
          return `Folder created: ${folder.name}\nID: ${folder.id}`
        } catch (e) {
          return `Drive folder error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_move_file': {
        const fileId = args.fileId as string
        const newParentId = args.newParentId as string
        if (!fileId || !newParentId) return 'Missing fileId or newParentId.'
        onStatus?.('Moving file on Drive...')
        try {
          const token = await getGoogleToken()
          const file = await driveMoveFile(token, fileId, newParentId)
          return `Moved "${file.name}" successfully.`
        } catch (e) {
          return `Drive move error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_rename_file': {
        const fileId = args.fileId as string
        const newName = args.newName as string
        if (!fileId || !newName) return 'Missing fileId or newName.'
        onStatus?.('Renaming file on Drive...')
        try {
          const token = await getGoogleToken()
          const file = await driveRenameFile(token, fileId, newName)
          return `Renamed to "${file.name}" successfully.`
        } catch (e) {
          return `Drive rename error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'drive_delete_file': {
        const fileId = args.fileId as string
        if (!fileId) return 'Missing fileId.'
        onStatus?.('Deleting file from Drive...')
        try {
          const token = await getGoogleToken()
          await driveDeleteFile(token, fileId)
          return 'File deleted from Drive.'
        } catch (e) {
          return `Drive delete error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_list_files': {
        onStatus?.('Browsing OneDrive...')
        try {
          const token = await getOneDriveToken()
          const result = await onedriveListFiles(token, {
            folderId: args.folderId as string | undefined,
            maxResults: args.maxResults as number | undefined,
          })
          if (result.files.length === 0) return 'No files found.'
          return result.files.map(formatOneDriveFile).join('\n\n')
        } catch (e) {
          return `OneDrive error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_search': {
        const query = args.query as string
        if (!query) return 'Missing query.'
        onStatus?.(`Searching OneDrive for "${query}"...`)
        try {
          const token = await getOneDriveToken()
          const files = await onedriveSearchFiles(token, query, args.maxResults as number | undefined)
          if (files.length === 0) return `No OneDrive files matching "${query}".`
          return `Found ${String(files.length)} file(s):\n\n` + files.map(formatOneDriveFile).join('\n\n')
        } catch (e) {
          return `OneDrive search error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_read_file': {
        const fileId = args.fileId as string
        if (!fileId) return 'Missing fileId.'
        onStatus?.('Reading file from OneDrive...')
        try {
          const token = await getOneDriveToken()
          const content = await onedriveReadFile(token, fileId)
          if (content.length > 10000) return content.slice(0, 10000) + '\n\n... (truncated, file is very large)'
          return content
        } catch (e) {
          return `OneDrive read error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_create_file': {
        const fileName = args.fileName as string
        const content = args.content as string
        if (!fileName || content === undefined) return 'Missing fileName or content.'
        onStatus?.('Creating file on OneDrive...')
        try {
          const token = await getOneDriveToken()
          const file = await onedriveCreateFile(token, (args.parentPath as string) || '/', fileName, content)
          let odMsg = `File created: ${file.name}\nID: ${file.id}`
          if (file.webUrl) odMsg += '\nLink: ' + file.webUrl
          return odMsg
        } catch (e) {
          return `OneDrive create error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_create_folder': {
        const folderName = args.name as string
        if (!folderName) return 'Missing name.'
        onStatus?.('Creating folder on OneDrive...')
        try {
          const token = await getOneDriveToken()
          const folder = await onedriveCreateFolder(token, folderName, args.parentId as string | undefined)
          return `Folder created: ${folder.name}\nID: ${folder.id}`
        } catch (e) {
          return `OneDrive folder error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_move_file': {
        const fileId = args.fileId as string
        const newParentId = args.newParentId as string
        if (!fileId || !newParentId) return 'Missing fileId or newParentId.'
        onStatus?.('Moving file on OneDrive...')
        try {
          const token = await getOneDriveToken()
          const file = await onedriveMoveFile(token, fileId, newParentId)
          return `Moved "${file.name}" successfully.`
        } catch (e) {
          return `OneDrive move error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_rename_file': {
        const fileId = args.fileId as string
        const newName = args.newName as string
        if (!fileId || !newName) return 'Missing fileId or newName.'
        onStatus?.('Renaming file on OneDrive...')
        try {
          const token = await getOneDriveToken()
          const file = await onedriveRenameFile(token, fileId, newName)
          return `Renamed to "${file.name}" successfully.`
        } catch (e) {
          return `OneDrive rename error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'onedrive_delete_file': {
        const fileId = args.fileId as string
        if (!fileId) return 'Missing fileId.'
        onStatus?.('Deleting file from OneDrive...')
        try {
          const token = await getOneDriveToken()
          await onedriveDeleteFile(token, fileId)
          return 'File deleted from OneDrive.'
        } catch (e) {
          return `OneDrive delete error: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'vonage_send_sms': {
        const to = args.to as string
        const text = args.text as string
        if (!to?.trim() || !text?.trim()) return 'Missing to or text.'
        onStatus?.('Sending SMS...')
        try {
          return await vonageSendSms(to.trim(), text.trim())
        } catch (e) {
          return `SMS failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'vonage_voice_call': {
        const to = args.to as string
        const text = args.text as string
        if (!to?.trim() || !text?.trim()) return 'Missing to or text.'
        onStatus?.('Placing voice call...')
        try {
          return await vonageVoiceCall(to.trim(), text.trim(), args.language as string | undefined)
        } catch (e) {
          return `Voice call failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'vonage_ai_voice_call': {
        const to = args.to as string
        if (!to?.trim()) return 'Missing to.'
        onStatus?.('Starting AI voice call...')
        try {
          return await vonageAiVoiceCall(to.trim())
        } catch (e) {
          return `AI voice call failed: ${e instanceof Error ? e.message : String(e)}`
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
  /** Overrides default tool-loop sampling (default 0.7). */
  temperature?: number
  /** Overrides default max completion tokens (default 4096). */
  max_tokens?: number
  browserControl?: BrowserControl | null
  guideMode?: boolean
  mediaCanvasControl?: MediaCanvasControl | null
  onMediaGenerating?: (generating: boolean) => void
  onMediaGeneratingLabel?: (label: string) => void
  openMediaCanvas?: () => void
  codeEditorControl?: CodeEditorControl | null
  getCodeEditorControl?: () => CodeEditorControl | null
  openCodeEditor?: () => void
  musicPlayerControl?: MusicPlayerControl | null
  openMusicPlayer?: () => void
  onMusicGenerating?: (generating: boolean) => void
  onMusicGeneratingLabel?: (label: string) => void
  signal?: AbortSignal
  onStatus?: (status: string) => void
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  maxRounds?: number
  userSettings?: UserSettings | null
  setUserSettings?: (fn: (prev: UserSettings) => UserSettings) => void
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
    temperature,
    max_tokens,
    browserControl = null,
    guideMode = false,
    mediaCanvasControl = null,
    onMediaGenerating,
    onMediaGeneratingLabel,
    openMediaCanvas,
    codeEditorControl = null,
    getCodeEditorControl,
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
    codeEditorControl, getCodeEditorControl, openCodeEditor,
    musicPlayerControl, openMusicPlayer, onMusicGenerating, onMusicGeneratingLabel,
    userSettings: options.userSettings,
    setUserSettings: options.setUserSettings,
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
    maxRounds: options.maxRounds ?? 30,
    signal,
    onToolCall,
    temperature,
    max_tokens,
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
