/** IDE-side chat request (extends main chat with model + preset). */

export type IdeReasoningMode = 'off' | 'minimal' | 'full' | 'auto'

export type IdeChatMode = 'chat' | 'composer' | 'agent'

export type IdeAiPreset =
  | 'edit_with_ai'
  | 'explain'
  | 'fix'
  | 'refactor'
  | 'tests'
  | 'document'
  | 'composer_open'
  | 'composer_apply'
  | 'composer_review'
  | 'agent_start'
  | 'agent_stop'
  | 'agent_logs'
  | 'agent_rerun'
  | 'chat_open'
  | 'chat_clear'
  | 'insert_code'
  | 'insert_file'

export interface IdeAttachment {
  /** Display name (filename or label). */
  name: string
  /** Text content for text files; data-URL (base64) for images. */
  content: string
  /** MIME type, e.g. "text/plain", "image/png". */
  mimeType: string
  /** True when content is a data-URL / base64 image. */
  isImage: boolean
}

export interface IdeChatPayload {
  userMessage: string
  ideContextBlock: string
  preset?: IdeAiPreset
  model?: string
  temperature?: number
  max_tokens?: number
  reasoningMode?: IdeReasoningMode
  autopilot?: boolean
  /** Current panel mode (chat / composer / agent). */
  mode?: IdeChatMode
  /** Files or images the user attached to the message. */
  attachments?: IdeAttachment[]
}

export function presetToInstruction(preset: IdeAiPreset): string {
  const map: Record<IdeAiPreset, string> = {
    edit_with_ai: 'Edit the code in the IDE context according to the user instructions. Apply changes using ide_replace_text or ide_edit_file as appropriate.',
    explain: 'Explain the selected or active code clearly, step by step, referencing the IDE context.',
    fix: 'Find bugs and issues in the active code and fix them using IDE tools. Run ide_run_and_fix if helpful.',
    refactor: 'Refactor the active code for clarity and maintainability without changing behavior. Use IDE tools to apply edits.',
    tests: 'Generate unit tests for the active code. Create new files with ide_create_file if needed.',
    document: 'Add or improve documentation (comments / docstrings) for the active code using IDE tools.',
    composer_open: 'The user opened Composer mode. Analyse the workspace, propose a step-by-step plan for the next coding task, and wait for confirmation before making changes.',
    composer_apply: 'Apply the previously discussed plan to the codebase using IDE tools. Make concrete file edits now.',
    composer_review: 'Review the diff between the last assistant suggestion and the current file; summarise risks and improvements.',
    agent_start: 'Start or continue an autonomous agent-style plan for the user goal using browser and IDE tools as needed.',
    agent_stop: 'Stop autonomous actions and summarise what was done.',
    agent_logs: 'Summarise recent tool usage and outputs relevant to the IDE session.',
    agent_rerun: 'Re-run the last logical step (e.g. re-run code or re-check problems) using IDE tools.',
    chat_open: 'The user focused the IDE chat. Greet briefly and offer help with the active file.',
    chat_clear: 'Acknowledge chat clear; no action needed unless the user asks something new.',
    insert_code: 'Insert the proposed code at the cursor position conceptually; use ide_replace_text or insertText patterns.',
    insert_file: 'Create or update files from the described content using ide_create_file / ide_edit_file.',
  }
  return map[preset] ?? ''
}
