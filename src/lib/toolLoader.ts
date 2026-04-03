/**
 * Intent-scoped tool loading: maps orchestrator intents to {@link ToolDefinition} subsets
 * to cut prompt tokens and reduce spurious tool calls.
 */

const LOG = '[ToolLoader]'

/** OpenAI-style function tool with optional JSON Schema parameters. */
export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema for `function.parameters` when calling OpenAI tools. */
  parameters?: Record<string, unknown>
}

/**
 * Canonical tool catalogue. Mutated at runtime via {@link registerTool}.
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  web_search: {
    name: 'web_search',
    description:
      'Search the web for current information, news, live data, or recent events. Use ONLY for time-sensitive information not available in conversation context.',
  },
  rag_search: {
    name: 'rag_search',
    description:
      'Search Jarvis long-term knowledge base for past conversations, documentation, and codebase context.',
  },
  code_runner: {
    name: 'code_runner',
    description: 'Execute code snippets in a sandboxed environment and return output.',
  },
  file_system: {
    name: 'file_system',
    description: 'Read, write, and manage files on the local filesystem.',
  },
  browser_automation: {
    name: 'browser_automation',
    description:
      'Control a browser to navigate pages, fill forms, extract data, and perform web actions.',
  },
  native_mouse_click: {
    name: 'native_mouse_click',
    description: 'Click at screen coordinates on Windows (desktop app).',
  },
  native_keyboard_type: {
    name: 'native_keyboard_type',
    description: 'Type text via the native OS keyboard.',
  },
  native_keyboard_hotkey: {
    name: 'native_keyboard_hotkey',
    description: 'Press a keyboard shortcut combination.',
  },
  native_window_focus: {
    name: 'native_window_focus',
    description: 'Focus a window by title.',
  },
  native_window_list: {
    name: 'native_window_list',
    description: 'List open windows on the desktop.',
  },
  native_screen_capture: {
    name: 'native_screen_capture',
    description: 'Capture a screenshot of the display.',
  },
  native_clipboard_read: {
    name: 'native_clipboard_read',
    description: 'Read the system clipboard.',
  },
  native_clipboard_write: {
    name: 'native_clipboard_write',
    description: 'Write text to the system clipboard.',
  },
  powershell_execute: {
    name: 'powershell_execute',
    description: 'Execute a PowerShell command and return output.',
  },
  powershell_session_create: {
    name: 'powershell_session_create',
    description: 'Create a persistent PowerShell terminal session.',
  },
  powershell_session_write: {
    name: 'powershell_session_write',
    description: 'Send input to a persistent PowerShell session.',
  },
  image_generation: {
    name: 'image_generation',
    description: 'Generate images from text prompts using AI image generation models.',
  },
  voice_synthesis: {
    name: 'voice_synthesis',
    description:
      'Generate speech audio from text with configurable voice profiles and emotion parameters.',
  },
  replicate_search_models: {
    name: 'replicate_search_models',
    description: 'Search Replicate’s public model catalogue for model ids and descriptions.',
  },
  replicate_generate_image: {
    name: 'replicate_generate_image',
    description: 'Generate images via Replicate (many models; default flux-2-pro).',
  },
  replicate_transcribe: {
    name: 'replicate_transcribe',
    description: 'Transcribe audio from a URL using Whisper on Replicate.',
  },
  replicate_generate_video: {
    name: 'replicate_generate_video',
    description: 'Generate short videos via Replicate (e.g. WAN i2v).',
  },
  replicate_tts: {
    name: 'replicate_tts',
    description: 'Text-to-speech via Replicate (Kokoro and similar).',
  },
}

/**
 * Tool name lists per intent route. Mutated at runtime via {@link addToolToIntent}.
 */
export const TOOLS_BY_INTENT: Record<string, string[]> = {
  code_instruction: [],
  clarification_needed: [],
  conversational: [],
  knowledge_lookup: ['web_search', 'rag_search'],
  task_execution: [
    'code_runner',
    'file_system',
    'browser_automation',
    'replicate_search_models',
    'replicate_generate_image',
    'replicate_transcribe',
    'replicate_generate_video',
    'replicate_tts',
  ],
  image_task: ['image_generation', 'replicate_generate_image', 'replicate_search_models'],
  voice_task: ['voice_synthesis', 'replicate_tts'],
  file_task: ['file_system'],
  browser_task: ['browser_automation'],
  desktop_automation: [
    'native_mouse_click',
    'native_keyboard_type',
    'native_keyboard_hotkey',
    'native_window_focus',
    'native_window_list',
    'native_screen_capture',
    'native_clipboard_read',
    'native_clipboard_write',
    'browser_automation',
  ],
  powershell_task: [
    'powershell_execute',
    'powershell_session_create',
    'powershell_session_write',
    'file_system',
  ],
  automation_mode_switch: [],
  default: ['web_search'],
}

/**
 * Resolve {@link ToolDefinition} instances for an intent (falls back to `default`).
 */
export function loadToolsForIntent(intentRoute: string): ToolDefinition[] {
  const route = intentRoute.trim()
  const names = TOOLS_BY_INTENT[route] ?? TOOLS_BY_INTENT.default ?? ['web_search']
  const out: ToolDefinition[] = []
  for (const name of names) {
    const def = TOOL_REGISTRY[name]
    if (def !== undefined) {
      out.push(def)
    }
  }
  console.info(`${LOG} Loaded ${String(out.length)} tools for intent: ${route}`)
  return out
}

/**
 * Human-readable bullet list for system prompts (intent aligned with `assembleSystemPrompt` when no tools).
 */
export function formatToolsForSystemPrompt(tools: ToolDefinition[]): string {
  if (tools.length === 0) {
    return 'No external tools available for this task.'
  }
  return tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
}

/** OpenAI Chat Completions `tools[]` entry shape (function calling). */
export type OpenAiToolSpec = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * Map definitions to OpenAI `tools` array. Returns `[]` when there are no tools.
 */
export function formatToolsForOpenAI(tools: ToolDefinition[]): OpenAiToolSpec[] {
  if (tools.length === 0) {
    return []
  }
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    },
  }))
}

/**
 * Register or replace a tool in {@link TOOL_REGISTRY} at runtime.
 */
export function registerTool(name: string, definition: ToolDefinition): void {
  const key = name.trim()
  TOOL_REGISTRY[key] = { ...definition, name: definition.name.trim() || key }
}

/**
 * Append a tool name to an intent list if missing (creates the intent key when needed).
 */
export function addToolToIntent(intentRoute: string, toolName: string): void {
  const route = intentRoute.trim()
  const tool = toolName.trim()
  if (!route || !tool) {
    return
  }
  if (TOOLS_BY_INTENT[route] === undefined) {
    TOOLS_BY_INTENT[route] = []
  }
  const list = TOOLS_BY_INTENT[route]!
  if (!list.includes(tool)) {
    list.push(tool)
  }
}
