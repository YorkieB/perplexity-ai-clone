/**
 * JARVIS — Settings capabilities registry
 * Canonical list of configurable Jarvis / IDE settings (editor, AI, agents, rules, terminal, git, extensions).
 */

export type JarvisSettingsCapabilityCategory =
  | 'editor-ui'
  | 'editor-files'
  | 'editor-assist'
  | 'ai-model'
  | 'ai-behavior'
  | 'context-retention'
  | 'agent'
  | 'permissions'
  | 'rules'
  | 'skills'
  | 'terminal-shell'
  | 'git'
  | 'extensions'

export type JarvisSettingsCapabilityId =
  /* editor — UI / view */
  | 'theme'
  | 'font-size'
  | 'font-family'
  | 'line-height'
  | 'cursor-style'
  | 'cursor-blinking'
  | 'smooth-scrolling'
  | 'word-wrap'
  | 'minimap'
  | 'breadcrumbs'
  /* editor — file & formatting */
  | 'tab-size'
  | 'auto-save'
  | 'file-encoding'
  | 'end-of-line'
  | 'format-on-save'
  | 'format-on-paste'
  | 'format-on-type'
  /* editor — intelligence */
  | 'intellisense'
  | 'snippets'
  | 'code-folding'
  | 'code-actions'
  | 'hover-info'
  | 'parameter-hints'
  | 'bracket-colorization'
  | 'auto-closing-brackets'
  | 'auto-closing-quotes'
  | 'auto-surround'
  | 'auto-indent'
  | 'code-lens'
  | 'semantic-highlighting'
  /* AI — model */
  | 'default-model'
  | 'backup-model'
  | 'max-context'
  | 'temperature'
  | 'reasoning-depth'
  /* AI — behavior & scope */
  | 'auto-suggest-ai-edits'
  | 'auto-apply-safe-edits'
  | 'require-confirmation'
  | 'enable-multi-file-edits'
  | 'enable-autonomous-agents'
  /* context & history */
  | 'local-context-retention'
  | 'cloud-context-retention'
  | 'chat-history-retention'
  /* agent limits */
  | 'agent-autonomy-level'
  | 'max-steps'
  | 'max-retries'
  /* permissions */
  | 'terminal-access'
  | 'browser-access'
  | 'file-write-permissions'
  /* rules */
  | 'rule-strictness'
  | 'rule-priority'
  | 'rule-conflict-resolution'
  /* skills */
  | 'skill-library-path'
  | 'skill-sharing'
  /* terminal & shell */
  | 'shell-selection'
  | 'shell-arguments'
  | 'terminal-font'
  | 'terminal-cursor-style'
  | 'terminal-scrollback'
  /* git */
  | 'auto-fetch'
  | 'auto-commit-suggestions'
  | 'auto-stash'
  | 'auto-merge-suggestions'
  /* extensions */
  | 'extension-enable-disable'
  | 'extension-auto-update'
  | 'extension-recommendations'

export interface JarvisSettingsCapabilityDef {
  readonly id: JarvisSettingsCapabilityId
  readonly label: string
  readonly category: JarvisSettingsCapabilityCategory
}

/** Canonical registry — 66 settings capabilities. */
export const JARVIS_SETTINGS_CAPABILITY_REGISTRY: readonly JarvisSettingsCapabilityDef[] = [
  { id: 'theme', label: 'Theme', category: 'editor-ui' },
  { id: 'font-size', label: 'Font size', category: 'editor-ui' },
  { id: 'font-family', label: 'Font family', category: 'editor-ui' },
  { id: 'line-height', label: 'Line height', category: 'editor-ui' },
  { id: 'cursor-style', label: 'Cursor style', category: 'editor-ui' },
  { id: 'cursor-blinking', label: 'Cursor blinking', category: 'editor-ui' },
  { id: 'smooth-scrolling', label: 'Smooth scrolling', category: 'editor-ui' },
  { id: 'word-wrap', label: 'Word wrap', category: 'editor-ui' },
  { id: 'minimap', label: 'Minimap', category: 'editor-ui' },
  { id: 'breadcrumbs', label: 'Breadcrumbs', category: 'editor-ui' },

  { id: 'tab-size', label: 'Tab size', category: 'editor-files' },
  { id: 'auto-save', label: 'Auto save', category: 'editor-files' },
  { id: 'file-encoding', label: 'File encoding', category: 'editor-files' },
  { id: 'end-of-line', label: 'End of line', category: 'editor-files' },
  { id: 'format-on-save', label: 'Format on save', category: 'editor-files' },
  { id: 'format-on-paste', label: 'Format on paste', category: 'editor-files' },
  { id: 'format-on-type', label: 'Format on type', category: 'editor-files' },

  { id: 'intellisense', label: 'IntelliSense', category: 'editor-assist' },
  { id: 'snippets', label: 'Snippets', category: 'editor-assist' },
  { id: 'code-folding', label: 'Code folding', category: 'editor-assist' },
  { id: 'code-actions', label: 'Code actions', category: 'editor-assist' },
  { id: 'hover-info', label: 'Hover info', category: 'editor-assist' },
  { id: 'parameter-hints', label: 'Parameter hints', category: 'editor-assist' },
  { id: 'bracket-colorization', label: 'Bracket colorization', category: 'editor-assist' },
  { id: 'auto-closing-brackets', label: 'Auto closing brackets', category: 'editor-assist' },
  { id: 'auto-closing-quotes', label: 'Auto closing quotes', category: 'editor-assist' },
  { id: 'auto-surround', label: 'Auto surround', category: 'editor-assist' },
  { id: 'auto-indent', label: 'Auto indent', category: 'editor-assist' },
  { id: 'code-lens', label: 'Code lens', category: 'editor-assist' },
  { id: 'semantic-highlighting', label: 'Semantic highlighting', category: 'editor-assist' },

  { id: 'default-model', label: 'Default model', category: 'ai-model' },
  { id: 'backup-model', label: 'Backup model', category: 'ai-model' },
  { id: 'max-context', label: 'Max context', category: 'ai-model' },
  { id: 'temperature', label: 'Temperature', category: 'ai-model' },
  { id: 'reasoning-depth', label: 'Reasoning depth', category: 'ai-model' },

  { id: 'auto-suggest-ai-edits', label: 'Auto-suggest AI edits', category: 'ai-behavior' },
  { id: 'auto-apply-safe-edits', label: 'Auto-apply safe edits', category: 'ai-behavior' },
  { id: 'require-confirmation', label: 'Require confirmation', category: 'ai-behavior' },
  { id: 'enable-multi-file-edits', label: 'Enable multi-file edits', category: 'ai-behavior' },
  { id: 'enable-autonomous-agents', label: 'Enable autonomous agents', category: 'ai-behavior' },

  { id: 'local-context-retention', label: 'Local context retention', category: 'context-retention' },
  { id: 'cloud-context-retention', label: 'Cloud context retention', category: 'context-retention' },
  { id: 'chat-history-retention', label: 'Chat history retention', category: 'context-retention' },

  { id: 'agent-autonomy-level', label: 'Agent autonomy level', category: 'agent' },
  { id: 'max-steps', label: 'Max steps', category: 'agent' },
  { id: 'max-retries', label: 'Max retries', category: 'agent' },

  { id: 'terminal-access', label: 'Terminal access', category: 'permissions' },
  { id: 'browser-access', label: 'Browser access', category: 'permissions' },
  { id: 'file-write-permissions', label: 'File write permissions', category: 'permissions' },

  { id: 'rule-strictness', label: 'Rule strictness', category: 'rules' },
  { id: 'rule-priority', label: 'Rule priority', category: 'rules' },
  { id: 'rule-conflict-resolution', label: 'Rule conflict resolution', category: 'rules' },

  { id: 'skill-library-path', label: 'Skill library path', category: 'skills' },
  { id: 'skill-sharing', label: 'Skill sharing', category: 'skills' },

  { id: 'shell-selection', label: 'Shell selection', category: 'terminal-shell' },
  { id: 'shell-arguments', label: 'Shell arguments', category: 'terminal-shell' },
  { id: 'terminal-font', label: 'Terminal font', category: 'terminal-shell' },
  { id: 'terminal-cursor-style', label: 'Terminal cursor style', category: 'terminal-shell' },
  { id: 'terminal-scrollback', label: 'Terminal scrollback', category: 'terminal-shell' },

  { id: 'auto-fetch', label: 'Auto fetch', category: 'git' },
  { id: 'auto-commit-suggestions', label: 'Auto commit suggestions', category: 'git' },
  { id: 'auto-stash', label: 'Auto stash', category: 'git' },
  { id: 'auto-merge-suggestions', label: 'Auto merge suggestions', category: 'git' },

  { id: 'extension-enable-disable', label: 'Extension enable/disable', category: 'extensions' },
  { id: 'extension-auto-update', label: 'Extension auto-update', category: 'extensions' },
  { id: 'extension-recommendations', label: 'Extension recommendations', category: 'extensions' },
]

const BY_ID: ReadonlyMap<JarvisSettingsCapabilityId, JarvisSettingsCapabilityDef> = new Map(
  JARVIS_SETTINGS_CAPABILITY_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisSettingsCapabilityDef(id: JarvisSettingsCapabilityId): JarvisSettingsCapabilityDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisSettingsCapabilityId(s: string): s is JarvisSettingsCapabilityId {
  return BY_ID.has(s as JarvisSettingsCapabilityId)
}

export function jarvisSettingsCapabilitiesByCategory(
  cat: JarvisSettingsCapabilityCategory
): readonly JarvisSettingsCapabilityDef[] {
  return JARVIS_SETTINGS_CAPABILITY_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleSettings(cat: JarvisSettingsCapabilityCategory): string {
  const map: Record<JarvisSettingsCapabilityCategory, string> = {
    'editor-ui': 'Editor — appearance & view',
    'editor-files': 'Editor — file & formatting',
    'editor-assist': 'Editor — intelligence & editing assist',
    'ai-model': 'AI — model',
    'ai-behavior': 'AI — behavior & scope',
    'context-retention': 'Context & history',
    agent: 'Agent limits',
    permissions: 'Permissions',
    rules: 'Rules',
    skills: 'Skills',
    'terminal-shell': 'Terminal & shell',
    git: 'Git',
    extensions: 'Extensions',
  }
  return map[cat]
}

export function formatJarvisSettingsCapabilityCatalog(): string {
  const cats: JarvisSettingsCapabilityCategory[] = [
    'editor-ui',
    'editor-files',
    'editor-assist',
    'ai-model',
    'ai-behavior',
    'context-retention',
    'agent',
    'permissions',
    'rules',
    'skills',
    'terminal-shell',
    'git',
    'extensions',
  ]
  const lines = cats.map((c) => {
    const items = jarvisSettingsCapabilitiesByCategory(c).map((d) => d.label)
    return `${categoryTitleSettings(c)}: ${items.join('; ')}.`
  })
  return ['JARVIS settings capabilities (canonical ids in `jarvis-settings-capabilities` registry):', ...lines].join('\n')
}

export function getJarvisSettingsCapabilitiesPromptSection(): string {
  return (
    'JARVIS settings surface: editor appearance (theme, fonts, cursor, scroll, wrap, minimap, breadcrumbs), ' +
    'file & format (tab size, auto-save, encoding, EOL, format on save/paste/type), ' +
    'editing assist (IntelliSense, snippets, folding, actions, hover, parameters, brackets/quotes/surround/indent, code lens, semantic highlighting), ' +
    'AI model (default/backup, max context, temperature, reasoning depth), AI workflow (suggest/apply edits, confirmation, multi-file, agents), ' +
    'retention (local/cloud context, chat history), agent limits (autonomy, steps, retries), permissions (terminal, browser, file write), ' +
    'rules (strictness, priority, conflict resolution), skills (library path, sharing), terminal/shell, git automation, extensions. ' +
    'Canonical ids: `src/lib/jarvis-settings-capabilities.ts` (JARVIS_SETTINGS_CAPABILITY_REGISTRY).'
  )
}
