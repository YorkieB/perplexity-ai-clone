import type { RefObject } from 'react'
import type * as monacoNs from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import type { JarvisIdeMenuContext } from '@/components/ide/jarvisIdeFullMenus'
import type { IdeAiPreset } from '@/lib/jarvis-ide-chat-types'

/** Builds the nested menu context from modal refs + imperative callbacks (no stubs). */
export interface JarvisIdeMenuFactoryInput {
  editorRef: RefObject<monacoNs.editor.IStandaloneCodeEditor | null>
  monacoRef: RefObject<Monaco | null>
  ideChatOnSend?: boolean
  agentBridgeOk: boolean
  hasElectronFs: boolean

  autoSaveOn: boolean
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
  menuBarOn: boolean
  bottomPanelVisible: boolean
  sidebarVisible: boolean
  statusBarOn: boolean

  // actions
  setNewFileDialog: (v: boolean) => void
  setTemplateDialog: (v: boolean) => void
  handleSave: () => void | Promise<void>
  handleDownload: () => void
  handleCloseTab: (id: string) => void
  removeItem: (id: string) => void
  setActiveItemId: (id: string | null) => void
  itemsLength: number
  activeItemId: string | null

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
  splitFileId: string | null
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
  handleRun: () => void
  canRun: boolean
  setShowProblems: (v: boolean | ((p: boolean) => boolean)) => void
  setBottomTab: (t: 'terminal' | 'problems' | 'output' | 'debug' | 'git' | 'extensions' | 'run') => void
  setTerminalHistory: (h: Array<{ type: 'stdout' | 'stderr' | 'error' | 'info'; text: string; time: number }>) => void
  setProblems: (p: Array<{ line: number; column: number; severity: 'error' | 'warning' | 'info' | 'hint'; message: string; source: string }>) => void

  problemIndex: number
  setProblemIndex: (n: number | ((p: number) => number)) => void
  problemsLength: number
  goToFileMenu: () => void
  goToSymbolMenu: () => void

  items: Array<{ id: string; filename?: string; language: string; diskPath?: string }>
  workspaceRoot: string | null

  // file / shell
  fileNewWindow: () => void
  fileOpenFile: () => void
  fileOpenFolder: () => void
  fileOpenWorkspace: () => void
  fileOpenRecent: () => void
  fileSaveAs: () => void
  fileSaveAll: () => void
  fileToggleAutoSave: () => void
  fileAddFolder: () => void
  fileCloseWorkspace: () => void
  fileCloseEditor: () => void
  fileCloseWindow: () => void
  fileQuit: () => void

  // view toggles
  setShowSourceControl: (v: boolean | ((p: boolean) => boolean)) => void
  setShowRunDebug: (v: boolean | ((p: boolean) => boolean)) => void
  setShowExtensions: (v: boolean | ((p: boolean) => boolean)) => void
  setShowOutputTab: (v: boolean | ((p: boolean) => boolean)) => void
  setShowDebugConsole: (v: boolean | ((p: boolean) => boolean)) => void
  toggleFullscreen: () => void
  setShowMenuBar: (v: boolean | ((p: boolean) => boolean)) => void
  setShowActivityBar: (v: boolean | ((p: boolean) => boolean)) => void
  setShowStatusBar: (v: boolean | ((p: boolean) => boolean)) => void
  viewSplitDown: () => void
  viewSplitRight: () => void
  viewSplitOrthogonal: () => void

  // run / debug
  runStartDebugging: () => void
  runWithoutDebugging: () => void
  runStopDebugging: () => void
  runRestartDebugging: () => void
  runAddConfiguration: () => void
  runOpenLaunchJson: () => void
  debuggingActive: boolean

  // terminal multi
  terminalNew: () => void
  terminalSplit: () => void
  terminalKill: () => void
  terminalRename: () => void
  terminalClear: () => void
  terminalFocusNext: () => void
  terminalFocusPrev: () => void

  // help
  helpDocumentation: () => void
  helpReleaseNotes: () => void
  helpReportIssue: () => void
  helpTroubleshooting: () => void
  helpAbout: () => void

  // Jarvis AI
  jarvisAiPreset: (p: IdeAiPreset) => void
  jarvisOpenComposer: () => void
  jarvisApplyComposer: () => void
  jarvisReviewDiff: () => void
  jarvisStartAgent: () => void
  jarvisStopAgent: () => void
  jarvisViewAgentLogs: () => void
  jarvisRerunAgent: () => void
  jarvisOpenChat: () => void
  jarvisClearChat: () => void
  jarvisInsertCode: () => void
  jarvisInsertFile: () => void

  // model / rules / skills
  modelSelect: () => void
  modelTemperature: () => void
  modelMaxTokens: () => void
  modelReasoning: () => void

  rulesOpen: () => void
  rulesAdd: () => void
  rulesEdit: () => void
  rulesDelete: () => void

  skillsOpen: () => void
  skillsAdd: () => void
  skillsEdit: () => void
  skillsDelete: () => void

  agentsStart: () => void
  agentsStop: () => void
  agentsPause: () => void
  agentsResume: () => void
  agentsLogs: () => void
  agentsPlan: () => void
  agentsState: () => void
}

export function createJarvisIdeMenuContext(i: JarvisIdeMenuFactoryInput): JarvisIdeMenuContext {
  const ed = () => i.editorRef.current
  const run = (id: string) => {
    ed()?.getAction(id)?.run()
  }

  return {
    file: {
      newFile: () => i.setNewFileDialog(true),
      newWindow: i.fileNewWindow,
      openFile: i.fileOpenFile,
      openFolder: i.fileOpenFolder,
      openWorkspace: i.fileOpenWorkspace,
      openRecent: i.fileOpenRecent,
      save: i.handleSave,
      saveAs: i.fileSaveAs,
      saveAll: i.fileSaveAll,
      toggleAutoSave: i.fileToggleAutoSave,
      autoSaveOn: i.autoSaveOn,
      addFolder: i.fileAddFolder,
      closeWorkspace: i.fileCloseWorkspace,
      closeEditor: i.fileCloseEditor,
      closeWindow: i.fileCloseWindow,
      quit: i.fileQuit,
    },
    edit: {
      undo: () => ed()?.trigger('keyboard', 'undo', null),
      redo: () => ed()?.trigger('keyboard', 'redo', null),
      cut: () => ed()?.trigger('keyboard', 'editor.action.clipboardCutAction', null),
      copy: () => ed()?.trigger('keyboard', 'editor.action.clipboardCopyAction', null),
      paste: () => ed()?.trigger('keyboard', 'editor.action.clipboardPasteAction', null),
      copyPath: () => {
        const p = i.items.find((x) => x.id === i.activeItemId)?.diskPath
        if (p) void navigator.clipboard.writeText(p)
        else if (i.activeItemId) void navigator.clipboard.writeText(i.items.find((x) => x.id === i.activeItemId)?.filename || '')
      },
      copyRelativePath: () => {
        const it = i.items.find((x) => x.id === i.activeItemId)
        const rel = it?.filename || ''
        if (rel) void navigator.clipboard.writeText(rel)
      },
      find: () => run('actions.find'),
      replace: () => run('editor.action.startFindReplaceAction'),
      findInFiles: () => {
        i.setShowSearch(true)
        i.setShowExplorer(true)
      },
      replaceInFiles: () => {
        i.setShowSearch(true)
        i.setShowExplorer(true)
      },
      selectAll: () => ed()?.trigger('keyboard', 'editor.action.selectAll', null),
      expandSelection: () => run('editor.action.smartSelect.expand'),
      shrinkSelection: () => run('editor.action.smartSelect.shrink'),
      copyLineUp: () => run('editor.action.copyLinesUpAction'),
      copyLineDown: () => run('editor.action.copyLinesDownAction'),
      moveLineUp: () => run('editor.action.moveLinesUpAction'),
      moveLineDown: () => run('editor.action.moveLinesDownAction'),
    },
    view: {
      explorer: () => i.setShowExplorer((p) => !p),
      explorerOn: i.showExplorer,
      search: () => i.setShowSearch((p) => !p),
      searchOn: i.showSearch,
      sourceControl: () => i.setShowSourceControl((p) => !p),
      sourceControlOn: i.showSourceControl,
      runDebug: () => i.setShowRunDebug((p) => !p),
      runDebugOn: i.showRunDebug,
      extensions: () => i.setShowExtensions((p) => !p),
      extensionsOn: i.showExtensions,
      terminal: () => i.setShowTerminal((p) => !p),
      terminalOn: i.showTerminal,
      problems: () => {
        i.setShowProblems(true)
        i.setShowTerminal(true)
        i.setBottomTab('problems')
      },
      problemsOn: i.showProblems,
      output: () => {
        i.setShowOutputTab(true)
        i.setShowTerminal(true)
        i.setBottomTab('output')
      },
      outputOn: i.showOutputTab,
      debugConsole: () => {
        i.setShowDebugConsole(true)
        i.setShowTerminal(true)
        i.setBottomTab('debug')
      },
      debugConsoleOn: i.showDebugConsole,
      fullscreen: i.toggleFullscreen,
      zen: () => i.setZenMode((p) => !p),
      zenOn: i.zenMode,
      toggleMenuBar: () => i.setShowMenuBar((p) => !p),
      menuBarOn: i.menuBarOn,
      togglePanel: () => {
        const next = !i.bottomPanelVisible
        if (next) {
          i.setShowTerminal(true)
        } else {
          i.setShowTerminal(false)
          i.setShowProblems(false)
          i.setShowSourceControl(false)
          i.setShowRunDebug(false)
          i.setShowExtensions(false)
          i.setShowOutputTab(false)
          i.setShowDebugConsole(false)
        }
      },
      panelOn: i.bottomPanelVisible,
      toggleSidebar: () => i.setShowActivityBar((p) => !p),
      sidebarOn: i.sidebarVisible,
      toggleStatusBar: () => i.setShowStatusBar((p) => !p),
      statusBarOn: i.statusBarOn,
      splitDown: i.viewSplitDown,
      splitRight: i.viewSplitRight,
      splitOrthogonal: i.viewSplitOrthogonal,
    },
    go: {
      back: () => run('editor.action.navigateBack'),
      forward: () => run('editor.action.navigateForward'),
      lastEdit: () => run('editor.action.navigateToLastEditLocation'),
      nextProblem: () => {
        if (i.problemsLength === 0) return
        const next = (i.problemIndex + 1) % i.problemsLength
        i.setProblemIndex(next)
      },
      prevProblem: () => {
        if (i.problemsLength === 0) return
        const next = (i.problemIndex - 1 + i.problemsLength) % i.problemsLength
        i.setProblemIndex(next)
      },
      goToFile: i.goToFileMenu,
      goToSymbol: i.goToSymbolMenu,
      goToDefinition: () => run('editor.action.revealDefinition'),
      goToTypeDefinition: () => run('editor.action.goToTypeDefinition'),
      goToImplementation: () => run('editor.action.goToImplementation'),
      goToReferences: () => run('editor.action.goToReferences'),
      goToLine: () => run('editor.action.gotoLine'),
      goToBracket: () => run('editor.action.jumpToBracket'),
    },
    run: {
      startDebugging: i.runStartDebugging,
      runWithoutDebugging: i.runWithoutDebugging,
      stopDebugging: i.runStopDebugging,
      restartDebugging: i.runRestartDebugging,
      addConfiguration: i.runAddConfiguration,
      openLaunchJson: i.runOpenLaunchJson,
    },
    terminal: {
      newTerminal: i.terminalNew,
      splitTerminal: i.terminalSplit,
      killTerminal: i.terminalKill,
      renameTerminal: i.terminalRename,
      clearTerminal: i.terminalClear,
      focusNext: i.terminalFocusNext,
      focusPrev: i.terminalFocusPrev,
    },
    help: {
      documentation: i.helpDocumentation,
      keyboardShortcuts: () => i.setShowShortcuts(true),
      releaseNotes: i.helpReleaseNotes,
      reportIssue: i.helpReportIssue,
      troubleshooting: i.helpTroubleshooting,
      about: i.helpAbout,
    },
    jarvisAi: {
      editWithAi: () => i.jarvisAiPreset('edit_with_ai'),
      explain: () => i.jarvisAiPreset('explain'),
      fix: () => i.jarvisAiPreset('fix'),
      refactor: () => i.jarvisAiPreset('refactor'),
      genTests: () => i.jarvisAiPreset('tests'),
      document: () => i.jarvisAiPreset('document'),
      openComposer: i.jarvisOpenComposer,
      applyComposerPlan: i.jarvisApplyComposer,
      reviewComposerDiff: i.jarvisReviewDiff,
      startAgent: i.jarvisStartAgent,
      stopAgent: i.jarvisStopAgent,
      viewAgentLogs: i.jarvisViewAgentLogs,
      rerunAgentStep: i.jarvisRerunAgent,
      openChat: i.jarvisOpenChat,
      clearChat: i.jarvisClearChat,
      insertCode: i.jarvisInsertCode,
      insertFile: i.jarvisInsertFile,
      hasChat: Boolean(i.ideChatOnSend),
    },
    model: {
      selectModel: i.modelSelect,
      temperature: i.modelTemperature,
      maxTokens: i.modelMaxTokens,
      reasoningMode: i.modelReasoning,
    },
    rules: {
      openRules: i.rulesOpen,
      addRule: i.rulesAdd,
      editRule: i.rulesEdit,
      deleteRule: i.rulesDelete,
    },
    skills: {
      openSkills: i.skillsOpen,
      addSkill: i.skillsAdd,
      editSkill: i.skillsEdit,
      deleteSkill: i.skillsDelete,
    },
    agents: {
      start: i.agentsStart,
      stop: i.agentsStop,
      pause: i.agentsPause,
      resume: i.agentsResume,
      viewLogs: i.agentsLogs,
      viewPlan: i.agentsPlan,
      viewState: i.agentsState,
      hasAgentBridge: i.agentBridgeOk,
    },
  }
}
