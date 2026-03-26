/**
 * Jarvis IDE menu bar — all top-level menus (real actions wired from CodeEditorModal).
 */

export type MenuRow =
  | { label: '─' }
  | { label: string; shortcut?: string; action?: () => void; disabled?: boolean }

export interface JarvisIdeMenuContext {
  file: {
    newFile: () => void
    newWindow: () => void
    openFile: () => void
    openFolder: () => void
    openWorkspace: () => void
    openRecent: () => void
    save: () => void
    saveAs: () => void
    saveAll: () => void
    toggleAutoSave: () => void
    autoSaveOn: boolean
    addFolder: () => void
    closeWorkspace: () => void
    closeEditor: () => void
    closeWindow: () => void
    quit: () => void
  }
  edit: {
    undo: () => void
    redo: () => void
    cut: () => void
    copy: () => void
    paste: () => void
    copyPath: () => void
    copyRelativePath: () => void
    find: () => void
    replace: () => void
    findInFiles: () => void
    replaceInFiles: () => void
    selectAll: () => void
    expandSelection: () => void
    shrinkSelection: () => void
    copyLineUp: () => void
    copyLineDown: () => void
    moveLineUp: () => void
    moveLineDown: () => void
  }
  view: {
    explorer: () => void
    explorerOn: boolean
    search: () => void
    searchOn: boolean
    sourceControl: () => void
    sourceControlOn: boolean
    runDebug: () => void
    runDebugOn: boolean
    extensions: () => void
    extensionsOn: boolean
    terminal: () => void
    terminalOn: boolean
    problems: () => void
    problemsOn: boolean
    output: () => void
    outputOn: boolean
    debugConsole: () => void
    debugConsoleOn: boolean
    fullscreen: () => void
    zen: () => void
    zenOn: boolean
    toggleMenuBar: () => void
    menuBarOn: boolean
    togglePanel: () => void
    panelOn: boolean
    toggleSidebar: () => void
    sidebarOn: boolean
    toggleStatusBar: () => void
    statusBarOn: boolean
    splitDown: () => void
    splitRight: () => void
    splitOrthogonal: () => void
  }
  go: {
    back: () => void
    forward: () => void
    lastEdit: () => void
    nextProblem: () => void
    prevProblem: () => void
    goToFile: () => void
    goToSymbol: () => void
    goToDefinition: () => void
    goToTypeDefinition: () => void
    goToImplementation: () => void
    goToReferences: () => void
    goToLine: () => void
    goToBracket: () => void
  }
  run: {
    startDebugging: () => void
    runWithoutDebugging: () => void
    stopDebugging: () => void
    restartDebugging: () => void
    addConfiguration: () => void
    openLaunchJson: () => void
  }
  terminal: {
    newTerminal: () => void
    splitTerminal: () => void
    killTerminal: () => void
    renameTerminal: () => void
    clearTerminal: () => void
    focusNext: () => void
    focusPrev: () => void
  }
  help: {
    documentation: () => void
    keyboardShortcuts: () => void
    releaseNotes: () => void
    reportIssue: () => void
    troubleshooting: () => void
    about: () => void
  }
  jarvisAi: {
    editWithAi: () => void
    explain: () => void
    fix: () => void
    refactor: () => void
    genTests: () => void
    document: () => void
    openComposer: () => void
    applyComposerPlan: () => void
    reviewComposerDiff: () => void
    startAgent: () => void
    stopAgent: () => void
    viewAgentLogs: () => void
    rerunAgentStep: () => void
    openChat: () => void
    clearChat: () => void
    insertCode: () => void
    insertFile: () => void
    hasChat: boolean
  }
  model: {
    selectModel: () => void
    temperature: () => void
    maxTokens: () => void
    reasoningMode: () => void
  }
  rules: {
    openRules: () => void
    addRule: () => void
    editRule: () => void
    deleteRule: () => void
  }
  skills: {
    openSkills: () => void
    addSkill: () => void
    editSkill: () => void
    deleteSkill: () => void
  }
  agents: {
    start: () => void
    stop: () => void
    pause: () => void
    resume: () => void
    viewLogs: () => void
    viewPlan: () => void
    viewState: () => void
    hasAgentBridge: boolean
  }
}

function sep(): MenuRow {
  return { label: '─' }
}

function item(
  label: string,
  action?: () => void,
  shortcut?: string,
  disabled?: boolean
): MenuRow {
  return { label, action, shortcut, disabled }
}

/** Flat options from CodeEditorModal — mapped to nested context for the menu builder. */
export interface JarvisIdeMenusFlatOptions {
  file: JarvisIdeMenuContext['file']
  edit: JarvisIdeMenuContext['edit']
  view: JarvisIdeMenuContext['view']
  go: JarvisIdeMenuContext['go']
  run: JarvisIdeMenuContext['run']
  terminal: JarvisIdeMenuContext['terminal']
  help: JarvisIdeMenuContext['help']
  jarvisAi: JarvisIdeMenuContext['jarvisAi']
  model: JarvisIdeMenuContext['model']
  rules: JarvisIdeMenuContext['rules']
  skills: JarvisIdeMenuContext['skills']
  agents: JarvisIdeMenuContext['agents']
}

export function buildJarvisIdeMenusFromOptions(opts: JarvisIdeMenusFlatOptions): Record<string, MenuRow[]> {
  return buildJarvisIdeMenus({
    file: opts.file,
    edit: opts.edit,
    view: opts.view,
    go: opts.go,
    run: opts.run,
    terminal: opts.terminal,
    help: opts.help,
    jarvisAi: opts.jarvisAi,
    model: opts.model,
    rules: opts.rules,
    skills: opts.skills,
    agents: opts.agents,
  })
}

export function buildJarvisIdeMenus(ctx: JarvisIdeMenuContext): Record<string, MenuRow[]> {
  const { file, edit, view, go, run, terminal, help, jarvisAi, model, rules, skills, agents } = ctx

  const fileMenu: MenuRow[] = [
    item('New File', file.newFile, 'Ctrl+N'),
    item('New Window', file.newWindow),
    sep(),
    item('Open File…', file.openFile, 'Ctrl+O'),
    item('Open Folder…', file.openFolder),
    item('Open Workspace…', file.openWorkspace),
    item('Open Recent', file.openRecent),
    sep(),
    item('Save', file.save, 'Ctrl+S'),
    item('Save As…', file.saveAs),
    item('Save All', file.saveAll),
    item(file.autoSaveOn ? '✓ Auto Save' : '  Auto Save', file.toggleAutoSave),
    sep(),
    item('Add Folder to Workspace…', file.addFolder),
    item('Close Workspace', file.closeWorkspace),
    item('Close Editor', file.closeEditor),
    item('Close Window', file.closeWindow, 'Ctrl+Shift+W'),
    item('Quit', file.quit, 'Alt+F4'),
  ]

  const editMenu: MenuRow[] = [
    item('Undo', edit.undo, 'Ctrl+Z'),
    item('Redo', edit.redo, 'Ctrl+Y'),
    sep(),
    item('Cut', edit.cut, 'Ctrl+X'),
    item('Copy', edit.copy, 'Ctrl+C'),
    item('Paste', edit.paste, 'Ctrl+V'),
    item('Copy Path', edit.copyPath),
    item('Copy Relative Path', edit.copyRelativePath),
    sep(),
    item('Find', edit.find, 'Ctrl+F'),
    item('Replace', edit.replace, 'Ctrl+H'),
    item('Find in Files', edit.findInFiles, 'Ctrl+Shift+F'),
    item('Replace in Files', edit.replaceInFiles),
    sep(),
    item('Select All', edit.selectAll, 'Ctrl+A'),
    item('Expand Selection', edit.expandSelection, 'Shift+Alt+→'),
    item('Shrink Selection', edit.shrinkSelection, 'Shift+Alt+←'),
    sep(),
    item('Copy Line Up', edit.copyLineUp),
    item('Copy Line Down', edit.copyLineDown),
    item('Move Line Up', edit.moveLineUp),
    item('Move Line Down', edit.moveLineDown),
  ]

  const viewMenu: MenuRow[] = [
    item(view.explorerOn ? '✓ Explorer' : '  Explorer', view.explorer, 'Ctrl+B'),
    item(view.searchOn ? '✓ Search' : '  Search', view.search, 'Ctrl+Shift+F'),
    item(view.sourceControlOn ? '✓ Source Control' : '  Source Control', view.sourceControl, 'Ctrl+Shift+G'),
    item(view.runDebugOn ? '✓ Run and Debug' : '  Run and Debug', view.runDebug, 'Ctrl+Shift+D'),
    item(view.extensionsOn ? '✓ Extensions' : '  Extensions', view.extensions, 'Ctrl+Shift+X'),
    sep(),
    item(view.terminalOn ? '✓ Terminal' : '  Terminal', view.terminal, 'Ctrl+`'),
    item(view.problemsOn ? '✓ Problems' : '  Problems', view.problems),
    item(view.outputOn ? '✓ Output' : '  Output', view.output),
    item(view.debugConsoleOn ? '✓ Debug Console' : '  Debug Console', view.debugConsole),
    sep(),
    item('Full Screen', view.fullscreen, 'F11'),
    item(view.zenOn ? '✓ Zen Mode' : '  Zen Mode', view.zen),
    sep(),
    item(view.menuBarOn ? '✓ Menu Bar' : '  Menu Bar', view.toggleMenuBar),
    item(view.panelOn ? '✓ Panel' : '  Panel', view.togglePanel),
    item(view.sidebarOn ? '✓ Sidebar' : '  Sidebar', view.toggleSidebar),
    item(view.statusBarOn ? '✓ Status Bar' : '  Status Bar', view.toggleStatusBar),
    sep(),
    item('Split Editor Right', view.splitRight, 'Ctrl+\\'),
    item('Split Editor Down', view.splitDown),
    item('Split Editor Orthogonal', view.splitOrthogonal),
  ]

  const goMenu: MenuRow[] = [
    item('Back', go.back, 'Alt+←'),
    item('Forward', go.forward, 'Alt+→'),
    item('Last Edit Location', go.lastEdit),
    sep(),
    item('Next Problem', go.nextProblem, 'F8'),
    item('Previous Problem', go.prevProblem, 'Shift+F8'),
    sep(),
    item('Go to File…', go.goToFile, 'Ctrl+P'),
    item('Go to Symbol in Workspace…', go.goToSymbol, 'Ctrl+T'),
    item('Go to Definition', go.goToDefinition, 'F12'),
    item('Go to Type Definition', go.goToTypeDefinition),
    item('Go to Implementation', go.goToImplementation, 'Ctrl+F12'),
    item('Go to References', go.goToReferences, 'Shift+F12'),
    item('Go to Line…', go.goToLine, 'Ctrl+G'),
    item('Go to Bracket', go.goToBracket, 'Ctrl+Shift+\\'),
  ]

  const runMenu: MenuRow[] = [
    item('Start Debugging', run.startDebugging, 'F5'),
    item('Run Without Debugging', run.runWithoutDebugging, 'Ctrl+F5'),
    item('Stop Debugging', run.stopDebugging, 'Shift+F5'),
    item('Restart Debugging', run.restartDebugging, 'Ctrl+Shift+F5'),
    sep(),
    item('Add Configuration…', run.addConfiguration),
    item('Open launch.json', run.openLaunchJson),
  ]

  const terminalMenu: MenuRow[] = [
    item('New Terminal', terminal.newTerminal, 'Ctrl+Shift+`'),
    item('Split Terminal', terminal.splitTerminal),
    item('Kill Terminal', terminal.killTerminal),
    item('Rename Terminal…', terminal.renameTerminal),
    item('Clear Terminal', terminal.clearTerminal),
    sep(),
    item('Focus Next Terminal', terminal.focusNext),
    item('Focus Previous Terminal', terminal.focusPrev),
  ]

  const helpMenu: MenuRow[] = [
    item('Documentation', help.documentation),
    item('Keyboard Shortcuts', help.keyboardShortcuts),
    item('Release Notes', help.releaseNotes),
    sep(),
    item('Report Issue', help.reportIssue),
    item('Troubleshooting', help.troubleshooting),
    sep(),
    item('About Jarvis', help.about),
  ]

  const jarvisAiMenu: MenuRow[] = jarvisAi.hasChat
    ? [
        item('Edit with AI', jarvisAi.editWithAi),
        item('Explain Code', jarvisAi.explain),
        item('Fix Code', jarvisAi.fix),
        item('Refactor Code', jarvisAi.refactor),
        item('Generate Tests', jarvisAi.genTests),
        item('Document Code', jarvisAi.document),
        sep(),
        item('Open Composer', jarvisAi.openComposer),
        item('Apply Composer Plan', jarvisAi.applyComposerPlan),
        item('Review Composer Diff', jarvisAi.reviewComposerDiff),
        sep(),
        item('Start Agent', jarvisAi.startAgent),
        item('Stop Agent', jarvisAi.stopAgent),
        item('View Agent Logs', jarvisAi.viewAgentLogs),
        item('Rerun Agent Step', jarvisAi.rerunAgentStep),
        sep(),
        item('Open Chat', jarvisAi.openChat, 'Ctrl+Shift+L'),
        item('Clear Chat', jarvisAi.clearChat),
        item('Insert Code at Cursor', jarvisAi.insertCode),
        item('Insert from File…', jarvisAi.insertFile),
      ]
    : [item('IDE Chat unavailable (host did not wire chat)', undefined, undefined, true)]

  const modelMenu: MenuRow[] = [
    item('Select Model…', model.selectModel),
    item('Temperature…', model.temperature),
    item('Max Tokens…', model.maxTokens),
    item('Reasoning Mode…', model.reasoningMode),
  ]

  const rulesMenu: MenuRow[] = [
    item('Open Rules Folder', rules.openRules),
    item('Add Rule…', rules.addRule),
    item('Edit Rule…', rules.editRule),
    item('Delete Rule…', rules.deleteRule),
  ]

  const skillsMenu: MenuRow[] = [
    item('Open Skills Folder', skills.openSkills),
    item('Add Skill…', skills.addSkill),
    item('Edit Skill…', skills.editSkill),
    item('Delete Skill…', skills.deleteSkill),
  ]

  const agentsMenu: MenuRow[] = agents.hasAgentBridge
    ? [
        item('Start', agents.start),
        item('Stop', agents.stop),
        item('Pause', agents.pause),
        item('Resume', agents.resume),
        sep(),
        item('View Logs', agents.viewLogs),
        item('View Plan', agents.viewPlan),
        item('View State', agents.viewState),
      ]
    : [item('Agent bridge unavailable in this build', undefined, undefined, true)]

  return {
    File: fileMenu,
    Edit: editMenu,
    View: viewMenu,
    Go: goMenu,
    Run: runMenu,
    Terminal: terminalMenu,
    Help: helpMenu,
    'Jarvis AI': jarvisAiMenu,
    Model: modelMenu,
    Rules: rulesMenu,
    Skills: skillsMenu,
    Agents: agentsMenu,
  }
}
