/**
 * OpenAI tool definitions for Jarvis desktop automation (Electron + Windows).
 * Execution lives in `chat-tools.ts` {@link createToolExecutor}.
 */

export const DESKTOP_AUTOMATION_TOOLS: Record<string, unknown>[] = [
  {
    type: 'function',
    function: {
      name: 'native_mouse_click',
      description:
        'Click at screen coordinates or current mouse position. Use for Windows apps outside the in-app browser. Prefer browser_action for the Jarvis browser.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X screen coordinate (optional if clicking in place)' },
          y: { type: 'number', description: 'Y screen coordinate' },
          button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button (default left)' },
          doubleClick: { type: 'boolean', description: 'Double-click (default false)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_keyboard_type',
      description:
        'Type text with the OS keyboard into whatever control is focused. Do not use for secrets.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to type' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_keyboard_hotkey',
      description: 'Press a shortcut such as Control+S or Alt+Tab (robotjs required for some combos).',
      parameters: {
        type: 'object',
        properties: { combo: { type: 'string', description: 'e.g. control+s or alt+tab' } },
        required: ['combo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_window_focus',
      description: 'Bring a window to the foreground by title (partial match on Windows).',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: 'Window title substring' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_window_list',
      description: 'List open windows (titles). Positions may be placeholders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_screen_capture',
      description:
        'Capture the user\'s monitor (full screen or region) as PNG; base64 is returned for you to describe. Use when the user asks what is on their screen, desktop, or monitor, or to verify visible UI — unless instructions already include a fresh LATEST DESKTOP SCREEN SNAPSHOT. Not for the room webcam.',
      parameters: {
        type: 'object',
        properties: {
          region: {
            type: 'object',
            properties: {
              left: { type: 'number' },
              top: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_clipboard_read',
      description: 'Read text from the system clipboard.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'native_clipboard_write',
      description: 'Write text to the system clipboard.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'powershell_execute',
      description:
        'Run a PowerShell command and return stdout/stderr. NEVER shutdown, restart, or logoff.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'PowerShell command or script' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'powershell_session_create',
      description: 'Create a persistent PowerShell terminal session (output appears in IDE terminal).',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string', description: 'Starting directory' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'powershell_session_write',
      description: 'Send a line to an existing terminal session (append newline automatically if missing).',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'number', description: 'Session id from powershell_session_create' },
          command: { type: 'string', description: 'Command or input to send' },
        },
        required: ['session_id', 'command'],
      },
    },
  },
]
