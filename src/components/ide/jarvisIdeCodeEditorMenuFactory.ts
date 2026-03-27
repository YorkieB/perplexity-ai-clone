/**
 * Wires CodeEditorModal state + handlers into JarvisIdeMenuFactoryInput (real actions, no stubs).
 */
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type * as monacoNs from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { toast } from 'sonner'
import type { IdeAiPreset } from '@/lib/jarvis-ide-chat-types'
import {
  ideAppRoot,
  ideFsRead,
  ideFsWrite,
  ideJoinPath,
  ideNewWindow,
  ideOpenExternal,
  ideOpenFilesFromDisk,
  ideOpenFolderFromDisk,
  ideQuit,
  ideSaveFileDialog,
  ideShellOpenPath,
  ideToggleFullscreen,
  ideWalkFiles,
} from '@/lib/jarvis-ide-bridge'
import { randomIdSegment } from '@/lib/secure-random'
import { buildJarvisIdeMenus } from '@/components/ide/jarvisIdeFullMenus'
import type { JarvisIdeMenuFactoryInput } from '@/components/ide/useJarvisIdeMenuContext'
import { createJarvisIdeMenuContext } from '@/components/ide/useJarvisIdeMenuContext'

const RECENT_WS_KEY = 'jarvis-ide-recent-workspaces'

function readRecentWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_WS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function pushRecentWorkspace(path: string) {
  const arr = [path, ...readRecentWorkspaces().filter((p) => p !== path)].slice(0, 10)
  localStorage.setItem(RECENT_WS_KEY, JSON.stringify(arr))
}

export type TerminalHistoryEntry = { type: 'stdout' | 'stderr' | 'error' | 'info'; text: string; time: number }
export type ProblemEntry = { line: number; column: number; severity: 'error' | 'warning' | 'info' | 'hint'; message: string; source: string }

export interface JarvisIdeCodeEditorMenuFactoryParams {
  editorRef: RefObject<monacoNs.editor.IStandaloneCodeEditor | null>
  monacoRef: RefObject<Monaco | null>
  ideContextBlockRef: RefObject<string>
  hasElectronFs: boolean
  ideChatOnSend: boolean
  agentBridgeOk: boolean
  onOpenAgentBrowser?: () => void

  items: Array<{ id: string; filename?: string; language: string; code: string; diskPath?: string }>
  activeItemId: string | null
  editedCode: string
  setEditedCode: (v: string | ((p: string) => string)) => void
  workspaceRoot: string | null
  setWorkspaceRoot: (v: string | null) => void
  setWorkspaceRelFiles: (v: string[] | ((p: string[]) => string[])) => void

  addItem: (item: {
    id: string
    code: string
    language: string
    filename?: string
    createdAt: number
    diskPath?: string
  }) => void
  updateItem: (
    id: string,
    patch: Partial<{ code: string; language: string; filename?: string; diskPath?: string; jarvisExplorer?: import('@/lib/jarvis-explorer-badges').JarvisExplorerFileMeta }>
  ) => void
  removeItem: (id: string) => void
  setActiveItemId: (id: string | null) => void
  onOpenChange: (open: boolean) => void

  autoSave: boolean
  showExplorer: boolean
  showSearch: boolean
  showSourceControl: boolean
  showRunDebug: boolean
  showExtensions: boolean
  showTerminal: boolean
  showProblems: boolean
  showOutputTab: boolean
  showDebugConsole: boolean
  zenMode: boolean
  showMenuBar: boolean
  showActivityBar: boolean
  showStatusBar: boolean
  splitFileId: string | null
  diffTargetId: string | null

  setNewFileDialog: (v: boolean) => void
  setTemplateDialog: (v: boolean) => void
  handleSave: () => void | Promise<void>
  handleDownload: () => void
  handleCloseTab: (id: string) => void
  setShowExplorer: (v: boolean | ((p: boolean) => boolean)) => void
  setShowSearch: (v: boolean | ((p: boolean) => boolean)) => void
  setShowOutline: (v: boolean | ((p: boolean) => boolean)) => void
  setShowTerminal: (v: boolean | ((p: boolean) => boolean)) => void
  setShowPreview: (v: boolean | ((p: boolean) => boolean)) => void
  setShowIdeChat: (v: boolean | ((p: boolean) => boolean)) => void
  setShowMinimap: (v: boolean | ((p: boolean) => boolean)) => void
  setWordWrap: (v: 'on' | 'off' | ((p: 'on' | 'off') => 'on' | 'off')) => void
  setStickyScroll: (v: boolean | ((p: boolean) => boolean)) => void
  setSplitEditor: (v: boolean | ((p: boolean) => boolean)) => void
  setSplitFileId: (id: string | null) => void
  setDiffMode: (v: boolean | ((p: boolean) => boolean)) => void
  setDiffTargetId: (id: string | null) => void
  setZenMode: (v: boolean | ((p: boolean) => boolean)) => void
  setShowSettings: (v: boolean | ((p: boolean) => boolean)) => void
  setShowShortcuts: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  setCommandFilter: (s: string) => void
  setOpenMenuId: (s: string | null) => void
  handleFormat: () => void
  handleCopy: () => void
  handleRun: () => void | Promise<void>
  canRun: boolean
  setShowProblems: (v: boolean | ((p: boolean) => boolean)) => void
  setBottomTab: (t: 'terminal' | 'problems' | 'output' | 'debug' | 'git' | 'extensions' | 'run') => void
  setTerminalHistory: Dispatch<SetStateAction<TerminalHistoryEntry[]>>
  setProblems: Dispatch<SetStateAction<ProblemEntry[]>>
  problemIndex: number
  setProblemIndex: (n: number | ((p: number) => number)) => void
  problemsLength: number
  setShowSourceControl: (v: boolean | ((p: boolean) => boolean)) => void
  setShowRunDebug: (v: boolean | ((p: boolean) => boolean)) => void
  setShowExtensions: (v: boolean | ((p: boolean) => boolean)) => void
  setShowOutputTab: (v: boolean | ((p: boolean) => boolean)) => void
  setShowDebugConsole: (v: boolean | ((p: boolean) => boolean)) => void
  setShowMenuBar: (v: boolean | ((p: boolean) => boolean)) => void
  setShowActivityBar: (v: boolean | ((p: boolean) => boolean)) => void
  setShowStatusBar: (v: boolean | ((p: boolean) => boolean)) => void
  debuggingActive: boolean
  setDebuggingActive: (v: boolean | ((p: boolean) => boolean)) => void
  setDebugLogLines: (v: string[] | ((p: string[]) => string[])) => void
  setRunning: (v: boolean | ((p: boolean) => boolean)) => void
  setAutoSave: (v: boolean | ((p: boolean) => boolean)) => void

  ideChatModel: string
  setIdeChatModel: (v: string) => void
  ideChatModelOptions: Array<{ id: string; label: string }>
  ideTemp: number
  setIdeTemp: (v: number) => void
  ideMaxTok: number
  setIdeMaxTok: (v: number) => void
  ideReasoning: import('@/lib/jarvis-ide-chat-types').IdeReasoningMode
  setIdeReasoning: (v: import('@/lib/jarvis-ide-chat-types').IdeReasoningMode) => void

  restartTerminalSession: () => Promise<void>

  firePresetChat: (preset: IdeAiPreset, userMessage: string) => Promise<void>
  sendIdePayload: (payload: import('@/lib/jarvis-ide-chat-types').IdeChatPayload) => Promise<string | null>
  setIdeChatMessages: Dispatch<SetStateAction<import('@/components/IdeChatPanel').IdeChatMessage[]>>
  createIdeUserMessage: (text: string) => import('@/components/IdeChatPanel').IdeChatMessage
  clearIdeChat: () => void
}

function detectLang(f: string) {
  const ext = f.split('.').pop()?.toLowerCase() || ''
  const m: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
  }
  return m[ext] || 'javascript'
}

export function buildJarvisIdeMenuFactoryInput(p: JarvisIdeCodeEditorMenuFactoryParams): JarvisIdeMenuFactoryInput {
  const bottomPanelVisible =
    p.showTerminal ||
    p.showProblems ||
    p.showSourceControl ||
    p.showRunDebug ||
    p.showExtensions ||
    p.showOutputTab ||
    p.showDebugConsole

  const mkId = () => `code-${Date.now()}-${randomIdSegment()}`

  const fileOpenFile = async () => {
    const files = await ideOpenFilesFromDisk()
    for (const f of files) {
      p.addItem({
        id: mkId(),
        code: f.content,
        language: detectLang(f.name),
        filename: f.name,
        createdAt: Date.now(),
        diskPath: f.path,
      })
    }
    if (files.length) {
      p.onOpenChange(true)
      toast.success(`Opened ${String(files.length)} file(s)`)
    }
  }

  const fileOpenFolder = async () => {
    const root = await ideOpenFolderFromDisk()
    if (!root) return
    p.setWorkspaceRoot(root)
    pushRecentWorkspace(root)
    p.setShowExplorer(true)
    if (p.hasElectronFs) {
      const rel = await ideWalkFiles(root)
      p.setWorkspaceRelFiles(rel.slice(0, 2000))
      let n = 0
      for (const relPath of rel.slice(0, 60)) {
        if (relPath.includes('node_modules')) continue
        const full = ideJoinPath(root, relPath)
        const r = await ideFsRead(full)
        if (!r.ok || r.content == null) continue
        const name = relPath.split(/[/\\]/).pop() || relPath
        p.addItem({
          id: `disk-${relPath.replaceAll(/[/\\]/g, '-')}-${Date.now()}`,
          code: r.content,
          language: detectLang(name),
          filename: name,
          createdAt: Date.now(),
          diskPath: full,
        })
        n += 1
      }
      p.onOpenChange(true)
      toast.success(`Workspace: ${root} (${String(n)} files loaded)`)
    } else {
      toast.info(`Folder: ${root} (load full tree in the desktop app)`)
    }
  }

  const fileSaveAs = async () => {
    const path = await ideSaveFileDialog(p.editedCode, p.activeItemId ? p.items.find((i) => i.id === p.activeItemId)?.filename : undefined)
    if (!path || !p.activeItemId) return
    if (p.hasElectronFs) {
      const res = await ideFsWrite(path, p.editedCode)
      if (res.ok) {
        p.updateItem(p.activeItemId, { diskPath: path })
        toast.success('Saved')
      } else toast.error(res.error || 'Save failed')
    }
  }

  const fileSaveAll = async () => {
    for (const it of p.items) {
      const code = it.id === p.activeItemId ? p.editedCode : it.code
      p.updateItem(it.id, { code })
      if (it.diskPath && p.hasElectronFs) {
        const res = await ideFsWrite(it.diskPath, code)
        if (!res.ok) toast.error(it.filename || it.id + ': ' + (res.error || 'write failed'))
      }
    }
    await p.handleSave()
    toast.success('Save all complete')
  }

  const rulesPath = async () => {
    const root = await ideAppRoot()
    return root ? ideJoinPath(root, '.cursor', 'rules') : null
  }

  const skillsPath = async () => {
    const root = await ideAppRoot()
    return root ? ideJoinPath(root, '.cursor', 'skills') : null
  }

  const input: JarvisIdeMenuFactoryInput = {
    editorRef: p.editorRef,
    monacoRef: p.monacoRef,
    ideChatOnSend: p.ideChatOnSend,
    agentBridgeOk: p.agentBridgeOk,
    hasElectronFs: p.hasElectronFs,
    autoSaveOn: p.autoSave,
    showExplorer: p.showExplorer,
    showSearch: p.showSearch,
    showSourceControl: p.showSourceControl,
    showRunDebug: p.showRunDebug,
    showExtensions: p.showExtensions,
    showTerminal: p.showTerminal,
    showProblems: p.showProblems,
    showOutputTab: p.showOutputTab,
    showDebugConsole: p.showDebugConsole,
    zenMode: p.zenMode,
    menuBarOn: p.showMenuBar,
    bottomPanelVisible,
    sidebarVisible: p.showActivityBar,
    statusBarOn: p.showStatusBar,

    setNewFileDialog: p.setNewFileDialog,
    setTemplateDialog: p.setTemplateDialog,
    handleSave: p.handleSave,
    handleDownload: p.handleDownload,
    handleCloseTab: p.handleCloseTab,
    removeItem: p.removeItem,
    setActiveItemId: p.setActiveItemId,
    itemsLength: p.items.length,
    activeItemId: p.activeItemId,

    setShowExplorer: p.setShowExplorer,
    setShowSearch: p.setShowSearch,
    setShowOutline: p.setShowOutline,
    setShowTerminal: (v) => {
      p.setShowTerminal((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) p.setBottomTab('terminal')
        return next
      })
    },
    setShowPreview: p.setShowPreview,
    setShowIdeChat: p.setShowIdeChat,
    setShowMinimap: p.setShowMinimap,
    setWordWrap: p.setWordWrap,
    setStickyScroll: p.setStickyScroll,
    setSplitEditor: p.setSplitEditor,
    setSplitFileId: p.setSplitFileId,
    splitFileId: p.splitFileId,
    setDiffMode: p.setDiffMode,
    setDiffTargetId: p.setDiffTargetId,
    setZenMode: p.setZenMode,
    setShowSettings: p.setShowSettings,
    setShowShortcuts: p.setShowShortcuts,
    setCommandPaletteOpen: p.setCommandPaletteOpen,
    setCommandFilter: p.setCommandFilter,
    setOpenMenuId: p.setOpenMenuId,
    handleFormat: p.handleFormat,
    handleCopy: p.handleCopy,
    handleRun: () => {
      p.handleRun()
    },
    canRun: p.canRun,
    setShowProblems: p.setShowProblems,
    setBottomTab: p.setBottomTab,
    setTerminalHistory: p.setTerminalHistory,
    setProblems: p.setProblems,
    problemIndex: p.problemIndex,
    setProblemIndex: p.setProblemIndex,
    problemsLength: p.problemsLength,
    goToFileMenu: () => {
      p.setCommandPaletteOpen(true)
      p.setCommandFilter('')
    },
    goToSymbolMenu: () => {
      p.editorRef.current?.getAction('editor.action.gotoSymbol')?.run()
      p.editorRef.current?.getAction('editor.action.quickOutline')?.run()
    },
    items: p.items.map((i) => ({ id: i.id, filename: i.filename, language: i.language, diskPath: i.diskPath })),
    workspaceRoot: p.workspaceRoot,

    setShowSourceControl: (v) => {
      p.setShowSourceControl((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) {
          p.setShowExplorer(true)
          p.setShowTerminal(true)
          p.setBottomTab('git')
        }
        return next
      })
    },
    setShowRunDebug: (v) => {
      p.setShowRunDebug((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) {
          p.setShowExplorer(true)
          p.setShowTerminal(true)
          p.setBottomTab('run')
        }
        return next
      })
    },
    setShowExtensions: (v) => {
      p.setShowExtensions((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) {
          p.setShowTerminal(true)
          p.setBottomTab('extensions')
        }
        return next
      })
    },
    setShowOutputTab: (v) => {
      p.setShowOutputTab((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) {
          p.setShowTerminal(true)
          p.setBottomTab('output')
        }
        return next
      })
    },
    setShowDebugConsole: (v) => {
      p.setShowDebugConsole((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        if (next) {
          p.setShowTerminal(true)
          p.setBottomTab('debug')
        }
        return next
      })
    },
    toggleFullscreen: () => {
      ideToggleFullscreen()
    },
    setShowMenuBar: p.setShowMenuBar,
    setShowActivityBar: p.setShowActivityBar,
    setShowStatusBar: p.setShowStatusBar,
    viewSplitDown: () => {
      p.setSplitEditor(true)
      if (!p.splitFileId && p.activeItemId) p.setSplitFileId(p.activeItemId)
      p.setShowPreview(true)
    },
    viewSplitRight: () => {
      p.setSplitEditor(true)
      if (!p.splitFileId && p.activeItemId) p.setSplitFileId(p.activeItemId)
    },
    viewSplitOrthogonal: () => {
      p.setSplitEditor(true)
      p.setShowPreview((x) => !x)
    },

    fileNewWindow: () => {
      ideNewWindow()
    },
    fileOpenFile,
    fileOpenFolder,
    fileOpenWorkspace: () => {
      fileOpenFolder()
    },
    fileOpenRecent: () => {
      const r = readRecentWorkspaces()
      if (r.length === 0) {
        toast.info('No recent workspaces yet. Open a folder first.')
        return
      }
      const pick = globalThis.prompt(`Recent workspaces (copy path):\n${r.join('\n')}`, r[0])
      if (pick?.trim()) {
        const trimmed = pick.trim()
        p.setWorkspaceRoot(trimmed)
        pushRecentWorkspace(trimmed)
        if (p.hasElectronFs) {
          ideWalkFiles(trimmed).then((rel) => p.setWorkspaceRelFiles(rel.slice(0, 2000)))
        }
        toast.success(`Workspace path set: ${trimmed}`)
      }
    },
    fileSaveAs,
    fileSaveAll: () => {
      fileSaveAll()
    },
    fileToggleAutoSave: () => p.setAutoSave((x) => !x),
    fileAddFolder: () => {
      fileOpenFolder()
    },
    fileCloseWorkspace: () => {
      p.setWorkspaceRoot(null)
      p.setWorkspaceRelFiles([])
      toast.info('Workspace closed (editor tabs unchanged)')
    },
    fileCloseEditor: () => {
      if (p.activeItemId) p.handleCloseTab(p.activeItemId)
    },
    fileCloseWindow: () => p.onOpenChange(false),
    fileQuit: () => {
      ideQuit()
    },

    runStartDebugging: () => {
      p.setShowRunDebug(true)
      p.setShowTerminal(true)
      p.setBottomTab('run')
      p.setDebuggingActive(true)
      p.setDebugLogLines((lines) => [...lines, `[${new Date().toISOString()}] Debugging — running interpreter`])
      p.handleRun()
    },
    runWithoutDebugging: () => {
      p.setShowRunDebug(true)
      p.setShowTerminal(true)
      p.setBottomTab('run')
      p.setDebuggingActive(false)
      p.handleRun()
    },
    runStopDebugging: () => {
      p.setDebuggingActive(false)
      p.setRunning(false)
      p.setDebugLogLines((lines) => [...lines, `[${new Date().toISOString()}] Stop`])
    },
    runRestartDebugging: () => {
      p.setDebugLogLines([])
      p.handleRun()
    },
    runAddConfiguration: async () => {
      if (!p.workspaceRoot || !p.hasElectronFs) {
        toast.error('Open a folder in the desktop app first.')
        return
      }
      const dir = ideJoinPath(p.workspaceRoot, '.vscode')
      const launch = ideJoinPath(dir, 'launch.json')
      const body = JSON.stringify(
        {
          version: '0.2.0',
          configurations: [{ type: 'node', request: 'launch', name: 'Launch', program: '${file}' }],
        },
        null,
        2
      )
      const res = await ideFsWrite(launch, body)
      if (res.ok) toast.success('Created .vscode/launch.json')
      else toast.error(res.error || 'Failed')
    },
    runOpenLaunchJson: async () => {
      if (!p.workspaceRoot || !p.hasElectronFs) {
        toast.error('Open a folder first.')
        return
      }
      const launch = ideJoinPath(p.workspaceRoot, '.vscode', 'launch.json')
      const r = await ideFsRead(launch)
      if (r.ok && r.content != null) {
        const id = mkId()
        p.addItem({ id, code: r.content, language: 'json', filename: 'launch.json', createdAt: Date.now(), diskPath: launch })
        p.setActiveItemId(id)
        p.onOpenChange(true)
      } else {
        toast.error(r.error || 'launch.json not found — use Add Configuration first')
      }
    },
    debuggingActive: p.debuggingActive,

    terminalNew: () => {
      p.setShowTerminal(true)
      p.setBottomTab('terminal')
      p.restartTerminalSession()
    },
    terminalSplit: () => {
      p.setShowTerminal(true)
      p.setBottomTab('terminal')
      toast.info('Split terminal is not yet supported — using single session')
    },
    terminalKill: () => {
      const ide = (globalThis as unknown as { jarvisIde?: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
      if (ide?.terminalList) {
        ide.terminalList().then((sessions) => {
          for (const s of sessions) ide.terminalKill({ id: s.id })
        })
      }
      p.setTerminalHistory([])
      toast.info('Terminal killed')
    },
    terminalRename: () => {
      toast.info('Terminal rename is not supported in single-session mode')
    },
    terminalClear: () => p.setTerminalHistory([]),
    terminalFocusNext: () => toast.info('Single terminal view'),
    terminalFocusPrev: () => toast.info('Single terminal view'),

    helpDocumentation: () => {
      ideOpenExternal('https://code.visualstudio.com/docs')
    },
    helpReleaseNotes: () => {
      ideOpenExternal('https://github.com/microsoft/monaco-editor/releases')
    },
    helpReportIssue: () => {
      ideOpenExternal('https://github.com/microsoft/monaco-editor/issues')
    },
    helpTroubleshooting: () => {
      ideOpenExternal('https://code.visualstudio.com/docs/supporting/troubleshoot-terminal-launch')
    },
    helpAbout: () => {
      toast.info('Jarvis IDE — Monaco editor with full Jarvis AI, tools, and desktop filesystem when running in Electron.')
    },

    jarvisAiPreset: (preset) => {
      const msg =
        {
          edit_with_ai: 'Edit the active file using IDE tools as needed.',
          explain: 'Explain the active file and selection.',
          fix: 'Find and fix issues in the active file.',
          refactor: 'Refactor the active file for clarity.',
          tests: 'Add or generate tests for the active code.',
          document: 'Improve comments and documentation.',
          composer_open: 'Open Composer planning for the workspace.',
          composer_apply: 'Apply the agreed plan with concrete file edits.',
          composer_review: 'Review the last edits for risks.',
          agent_start: 'Start autonomous agent-style help for this workspace.',
          agent_stop: 'Stop autonomous actions and summarize.',
          agent_logs: 'Summarize recent tool usage for this session.',
          agent_rerun: 'Re-run the last verification step.',
          chat_open: 'I opened the IDE chat — greet and offer help.',
          chat_clear: 'Chat was cleared.',
          insert_code: 'Insert clipboard / proposed code at the cursor using IDE tools.',
          insert_file: 'Load a file and insert or merge its contents.',
        }[preset] ?? 'Help with the IDE.'
      p.firePresetChat(preset, msg)
    },
    jarvisOpenComposer: () => {
      p.firePresetChat('composer_open', 'Open Composer and plan next steps.')
    },
    jarvisApplyComposer: () => {
      p.firePresetChat('composer_apply', 'Apply the Composer plan now.')
    },
    jarvisReviewDiff: () => {
      p.firePresetChat('composer_review', 'Review the current diff and risks.')
    },
    jarvisStartAgent: () => {
      p.onOpenAgentBrowser?.()
      p.firePresetChat('agent_start', 'Start agent-style assistance with browser and IDE tools.')
    },
    jarvisStopAgent: () => {
      p.firePresetChat('agent_stop', 'Stop agent actions and summarize.')
    },
    jarvisViewAgentLogs: () => {
      p.firePresetChat('agent_logs', 'Summarize recent agent and tool activity.')
    },
    jarvisRerunAgent: () => {
      p.firePresetChat('agent_rerun', 'Re-run the last verification step.')
    },
    jarvisOpenChat: () => {
      p.setShowIdeChat(true)
    },
    jarvisClearChat: () => {
      p.clearIdeChat()
    },
    jarvisInsertCode: async () => {
      try {
        const t = await navigator.clipboard.readText()
        const ed = p.editorRef.current
        const m = ed?.getModel()
        if (!ed || !m || !p.monacoRef.current) return
        const pos = ed.getPosition() ?? { lineNumber: 1, column: 1 }
        ed.executeEdits('jarvis', [
          {
            range: new p.monacoRef.current.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
            text: t,
          },
        ])
        p.setEditedCode(m.getValue())
        toast.success('Inserted from clipboard')
      } catch {
        toast.error('Clipboard access denied or empty')
      }
    },
    jarvisInsertFile: async () => {
      const rows = await ideOpenFilesFromDisk()
      const text = rows[0]?.content
      if (!text) return
      const ed = p.editorRef.current
      const m = ed?.getModel()
      if (!ed || !m || !p.monacoRef.current) return
      const pos = ed.getPosition() ?? { lineNumber: 1, column: 1 }
      ed.executeEdits('jarvis', [
        {
          range: new p.monacoRef.current.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          text,
        },
      ])
      p.setEditedCode(m.getValue())
      toast.success('Inserted file contents at cursor')
    },

    modelSelect: () => {
      const opts = p.ideChatModelOptions
      const hint = opts.map((m, i) => `${String(i + 1)}. ${m.label} (${m.id})`).join('\n')
      const n = globalThis.prompt(`Select model:\n${hint}\n\nEnter number or model ID:`, p.ideChatModel)?.trim()
      if (!n) return
      const numChoice = Number.parseInt(n, 10)
      if (!Number.isNaN(numChoice) && numChoice >= 1 && numChoice <= opts.length) {
        p.setIdeChatModel(opts[numChoice - 1].id)
      } else {
        p.setIdeChatModel(n)
      }
    },
    modelTemperature: () => {
      const n = globalThis.prompt('Temperature 0–2', String(p.ideTemp))
      if (n == null) return
      const v = Number.parseFloat(n)
      if (!Number.isNaN(v)) p.setIdeTemp(Math.min(2, Math.max(0, v)))
    },
    modelMaxTokens: () => {
      const n = globalThis.prompt('Max tokens', String(p.ideMaxTok))
      if (n == null) return
      const v = Number.parseInt(n, 10)
      if (!Number.isNaN(v)) p.setIdeMaxTok(Math.max(256, v))
    },
    modelReasoning: () => {
      const n = globalThis.prompt('Reasoning: auto | off | minimal | full', p.ideReasoning)?.trim() as
        | 'auto'
        | 'off'
        | 'minimal'
        | 'full'
        | undefined
      if (n === 'auto' || n === 'off' || n === 'minimal' || n === 'full') p.setIdeReasoning(n)
    },

    rulesOpen: async () => {
      const path = await rulesPath()
      if (path && p.hasElectronFs) await ideShellOpenPath(path)
      else await ideOpenExternal('https://cursor.com/docs')
    },
    rulesAdd: () => toast.info('Add a .md rule under .cursor/rules in your project root.'),
    rulesEdit: () => toast.info('Edit rules as markdown in .cursor/rules'),
    rulesDelete: () => toast.info('Delete rule files from .cursor/rules in Explorer or your file manager'),

    skillsOpen: async () => {
      const path = await skillsPath()
      if (path && p.hasElectronFs) await ideShellOpenPath(path)
      else await ideOpenExternal('https://docs.cursor.com/context/rules')
    },
    skillsAdd: () => toast.info('Add SKILL.md under .cursor/skills'),
    skillsEdit: () => toast.info('Edit skill markdown in .cursor/skills'),
    skillsDelete: () => toast.info('Remove skill files from .cursor/skills'),

    agentsStart: () => {
      p.onOpenAgentBrowser?.()
      p.firePresetChat('agent_start', 'Start the agent bridge session.')
    },
    agentsStop: () => {
      p.firePresetChat('agent_stop', 'Stop agent work and summarize.')
    },
    agentsPause: () => {
      const msg = 'Pause autonomous agent actions until resumed.'
      p.setShowIdeChat(true)
      p.setIdeChatMessages((prev) => [...prev, p.createIdeUserMessage(msg)])
      p.sendIdePayload({
        userMessage: msg,
        ideContextBlock: p.ideContextBlockRef.current,
        model: p.ideChatModel,
        temperature: p.ideTemp,
        max_tokens: p.ideMaxTok,
        reasoningMode: p.ideReasoning,
      })
    },
    agentsResume: () => {
      const msg = 'Resume autonomous agent actions.'
      p.setShowIdeChat(true)
      p.setIdeChatMessages((prev) => [...prev, p.createIdeUserMessage(msg)])
      p.sendIdePayload({
        userMessage: msg,
        ideContextBlock: p.ideContextBlockRef.current,
        model: p.ideChatModel,
        temperature: p.ideTemp,
        max_tokens: p.ideMaxTok,
        reasoningMode: p.ideReasoning,
      })
    },
    agentsLogs: () => {
      p.firePresetChat('agent_logs', 'Show agent logs summary.')
    },
    agentsPlan: () => {
      p.firePresetChat('composer_open', 'Show the current agent plan.')
    },
    agentsState: () => {
      const msg = 'Summarize IDE state: active file, problems, and workspace.'
      p.setShowIdeChat(true)
      p.setIdeChatMessages((prev) => [...prev, p.createIdeUserMessage(msg)])
      p.sendIdePayload({
        userMessage: msg,
        ideContextBlock: p.ideContextBlockRef.current,
        model: p.ideChatModel,
        temperature: p.ideTemp,
        max_tokens: p.ideMaxTok,
        reasoningMode: p.ideReasoning,
      })
    },
  }

  return input
}

export function buildCodeEditorJarvisMenus(p: JarvisIdeCodeEditorMenuFactoryParams) {
  return buildJarvisIdeMenus(createJarvisIdeMenuContext(buildJarvisIdeMenuFactoryInput(p)))
}
