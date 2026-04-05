/**
 * Preload for the main BrowserWindow: exposes a minimal, read-only API for the in-app browser.
 */
const { contextBridge, ipcRenderer } = require('electron')
const { buildJarvisIdeRendererApis } = require('./jarvis-ide-preload-api.cjs')

const PARTITION = 'persist:ai-search-browser'
const jarvisIdeRenderer = buildJarvisIdeRendererApis(ipcRenderer)

contextBridge.exposeInMainWorld('jarvisIde', {
  appRoot: () => ipcRenderer.invoke('jarvis-ide-app-root'),
  openFiles: () => ipcRenderer.invoke('jarvis-ide-open-files'),
  openFolder: () => ipcRenderer.invoke('jarvis-ide-open-folder'),
  saveFile: (opts) => ipcRenderer.invoke('jarvis-ide-save-file', opts),
  readDir: (dirPath) => ipcRenderer.invoke('jarvis-ide-read-dir', dirPath),
  walkFiles: (rootPath) => ipcRenderer.invoke('jarvis-ide-walk-files', rootPath),
  fsRead: (filePath) => ipcRenderer.invoke('jarvis-ide-fs-read', filePath),
  fsWrite: (opts) => ipcRenderer.invoke('jarvis-ide-fs-write', opts),
  fsDelete: (filePath) => ipcRenderer.invoke('jarvis-ide-fs-delete', filePath),
  fsMkdir: (dirPath) => ipcRenderer.invoke('jarvis-ide-fs-mkdir', dirPath),
  fsExists: (p) => ipcRenderer.invoke('jarvis-ide-fs-exists', p),
  shellOpenPath: (p) => ipcRenderer.invoke('jarvis-ide-shell-open-path', p),
  openExternal: (url) => ipcRenderer.invoke('jarvis-ide-open-external', url),
  newWindow: () => ipcRenderer.invoke('jarvis-ide-new-window'),
  quit: () => ipcRenderer.invoke('jarvis-ide-quit'),
  toggleFullscreen: () => ipcRenderer.invoke('jarvis-ide-toggle-fullscreen'),
  git: (opts) => ipcRenderer.invoke('jarvis-ide-git', opts),
  runCommand: (opts) => ipcRenderer.invoke('jarvis-ide-run-command', opts),

  // Persistent terminal session
  terminalCreate: (opts) => ipcRenderer.invoke('terminal-create', opts),
  terminalWrite: (opts) => ipcRenderer.invoke('terminal-write', opts),
  terminalKill: (opts) => ipcRenderer.invoke('terminal-kill', opts),
  terminalList: () => ipcRenderer.invoke('terminal-list'),
  onTerminalData: (handler) => {
    const fn = (_e, payload) => handler(payload)
    ipcRenderer.on('terminal-data', fn)
    return () => ipcRenderer.removeListener('terminal-data', fn)
  },
  onTerminalExit: (handler) => {
    const fn = (_e, payload) => handler(payload)
    ipcRenderer.on('terminal-exit', fn)
    return () => ipcRenderer.removeListener('terminal-exit', fn)
  },
})

/** Renderer → main: voice transcript classified as a screen intent (see `registerJarvisOrchestratorIpc` in main.cjs). */
contextBridge.exposeInMainWorld('electronAPI', {
  ...jarvisIdeRenderer.ideElectronApi,
  /**
   * Always true in this preload — lets the renderer detect the Jarvis desktop shell even if
   * `emitIntent` is ever shadowed; use `useRealtimeVoice` hasJarvisDesktopScreenAgentForVoice().
   */
  jarvisDesktopShell: true,
  emitIntent: (payload) => ipcRenderer.send('jarvis:intent', payload),
  /** Apply the last proactive behaviour suggestion (see `ScreenAgentHandler` + `jarvis:behaviour:accept`). */
  acceptBehaviourSuggestion: () => ipcRenderer.send('jarvis:behaviour:accept'),
  /** Main → renderer: run in-app browser ACT (`handleBrowserActGoal` in App). */
  onJarvisBrowserAct: (handler) => {
    const fn = (_e, payload) => handler(payload)
    ipcRenderer.on('jarvis-browser-act', fn)
    return () => ipcRenderer.removeListener('jarvis-browser-act', fn)
  },
  /** Latest desktop observation (Python sidecar); null if orchestrator not ready. */
  getJarvisScreenContext: () => ipcRenderer.invoke('jarvis-screen-context'),
  /** Tell main process Voice Mode is open — suppresses duplicate `jarvis:speak` ElevenLabs when JARVIS_VOICEAGENT_TTS=1. */
  setVoiceModeActive: (active) => ipcRenderer.invoke('jarvis-voice-mode-active', active),
  /** Pushed when the screen agent reports a new frame (throttle injections in voice hook). */
  onJarvisScreenContextUpdate: (handler) => {
    const fn = (_e, payload) => handler(payload)
    ipcRenderer.on('jarvis-screen-context-update', fn)
    return () => ipcRenderer.removeListener('jarvis-screen-context-update', fn)
  },
})

contextBridge.exposeInMainWorld('jarvis', jarvisIdeRenderer.jarvis)

contextBridge.exposeInMainWorld('electronInAppBrowser', {
  /** Same string as webview `partition` attribute */
  webviewPartition: PARTITION,
  openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),
  loadExtensionFolder: (folderPath) => ipcRenderer.invoke('browser-load-extension', folderPath),
  pickExtensionFolder: () => ipcRenderer.invoke('dialog-pick-extension-folder'),
  applyJarvisBrowserSettings: (payload) => ipcRenderer.invoke('jarvis-browser-apply-settings', payload),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('shell-show-item-in-folder', fullPath),
  /** Absolute path to guest preload for `<webview webpreferences="preload=…">` (DOM inspector bridge). */
  getWebviewGuestPreloadPath: () => ipcRenderer.invoke('jarvis-browser-webview-guest-preload-path'),
  /** After guest `dom-ready`: register tab ↔ guest webContents and inject inspector script. */
  inspectorAfterGuestDomReady: (tabId, webContentsId) =>
    ipcRenderer
      .invoke('jarvis-browser-inspector-register', { tabId, webContentsId })
      .then(() => ipcRenderer.invoke('jarvis-browser-inspector-inject', { webContentsId })),
  inspectorUnregisterTab: (tabId) => ipcRenderer.invoke('jarvis-browser-inspector-unregister', { tabId }),
  inspectorReinjectGuest: (webContentsId) =>
    ipcRenderer.invoke('jarvis-browser-inspector-inject', { webContentsId }),
  /** Forward `ipc-message` from `<webview>` (guest sendToHost) to main for broadcast to renderer. */
  inspectorForwardGuestEvent: (data) => ipcRenderer.send('jarvis-browser-inspector-guest-event', data),
  jarvisBrowserInspector: {
    captureSnapshot: (tabId) => ipcRenderer.invoke('jarvis-browser-inspector-capture', { tabId }),
    enableInspectMode: (tabId) => ipcRenderer.invoke('jarvis-browser-inspector-enable', { tabId }),
    disableInspectMode: (tabId) => ipcRenderer.invoke('jarvis-browser-inspector-disable', { tabId }),
    highlightNode: (tabId, nodeId) =>
      ipcRenderer.invoke('jarvis-browser-inspector-highlight', { tabId, nodeId }),
    clearPageHighlight: (tabId) =>
      ipcRenderer.invoke('jarvis-browser-inspector-clear-highlight', { tabId }),
    applyLayoutEdit: (tabId, action) =>
      ipcRenderer.invoke('jarvis-browser-inspector-apply-layout-edit', { tabId, action }),
    applyAttributeEdit: (tabId, edit) =>
      ipcRenderer.invoke('jarvis-browser-inspector-apply-attribute-edit', { tabId, edit }),
    onHover: (handler) => {
      const fn = (_e, payload) => handler(payload)
      ipcRenderer.on('jarvis-inspector-hover', fn)
      return () => ipcRenderer.removeListener('jarvis-inspector-hover', fn)
    },
    onSelect: (handler) => {
      const fn = (_e, payload) => handler(payload)
      ipcRenderer.on('jarvis-inspector-select', fn)
      return () => ipcRenderer.removeListener('jarvis-inspector-select', fn)
    },
  },
  /** Iframe navigation: popup intercepted or iframe did-frame-navigate */
  onIframeNavigated: (handler) => {
    const fn = (_e, url) => handler(url)
    ipcRenderer.on('jarvis-browser:iframe-navigated', fn)
    return () => ipcRenderer.removeListener('jarvis-browser:iframe-navigated', fn)
  },
  /** Last download notification from main (optional UI) */
  onDownloadComplete: (handler) => {
    const fn = (_e, payload) => {
      handler(payload)
    }
    ipcRenderer.on('browser-download-complete', fn)
    return () => ipcRenderer.removeListener('browser-download-complete', fn)
  },
  onDownloadProgress: (handler) => {
    const fn = (_e, payload) => handler(payload)
    ipcRenderer.on('browser-download-progress', fn)
    return () => ipcRenderer.removeListener('browser-download-progress', fn)
  },
})

/** Native OS automation (Windows): mouse, keyboard, screen, clipboard, PowerShell exec — see `jarvis-desktop-automation.cjs`. */
const jarvisNativeValidators = {
  /**
   * SECURITY: Validate PowerShell command opts before forwarding to IPC.
   * Blocks dangerous PowerShell cmdlets use for system disruption or privilege escalation.
   */
  powershellCommand(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid PowerShell options')
    }
    const { command, cwd } = opts
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error('PowerShell command must be a non-empty string')
    }
    if (cwd && typeof cwd !== 'string') {
      throw new Error('PowerShell cwd must be a string')
    }

    // Block dangerous PowerShell cmdlets
    const dangerous = [
      /shutdown/i,
      /restart-computer/i,
      /stop-computer/i,
      /\blogoff\b/i,
      /format\s+[a-z]:\\/i,
      /remove-item/i,
      /rm\s+-rf/i,
      /del\s+\/s/i,
      /diskpart/i,
      /cipher\s+\/w/i,
      /invoke-expression/i,
      /iex\b/i,
      /powershell\s+-[a-z]*e/i,
      /&\s*\{/,
    ]

    for (const pattern of dangerous) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command blocked: ${pattern.source}`)
      }
    }

    return { command: command.trim(), cwd: cwd || undefined }
  },

  /**
   * SECURITY: Validate mouse/keyboard position and option types.
   */
  mousePosition(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid mouse options')
    }
    const { x, y } = opts
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('Mouse position must have numeric x, y')
    }
    if (x < 0 || y < 0 || x > 100000 || y > 100000) {
      throw new Error('Mouse position out of bounds')
    }
    return { x, y }
  },

  keyboardText(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('Invalid keyboard options')
    }
    const { text } = opts
    if (typeof text !== 'string') {
      throw new TypeError('Keyboard text must be a string')
    }
    if (text.length > 10000) {
      throw new Error('Keyboard text too long (>10000 chars)')
    }
    return { text }
  },

  keyboardKeys(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid keyboard options')
    }
    const { keys } = opts
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('Keyboard keys must be a non-empty array')
    }
    if (keys.length > 100) {
      throw new Error('Too many keyboard keys')
    }
    if (!keys.every((k) => typeof k === 'string' && k.length < 50)) {
      throw new Error('Invalid keyboard key')
    }
    return { keys }
  },

  keyboardCombo(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid keyboard combo options')
    }
    const { combo } = opts
    if (typeof combo !== 'string' || combo.length > 100) {
      throw new Error('Invalid keyboard combo')
    }
    return { combo }
  },

  windowTitle(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid window options')
    }
    const { title } = opts
    if (typeof title !== 'string' || title.length > 500) {
      throw new Error('Window title invalid')
    }
    return { title }
  },

  clipboardText(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('Invalid clipboard options')
    }
    const { text } = opts
    if (typeof text !== 'string' || text.length > 10_000_000) {
      throw new Error('Clipboard text too large')
    }
    return { text }
  },
}

contextBridge.exposeInMainWorld('jarvisNative', {
  mouseMove: (pos) => {
    const v = jarvisNativeValidators.mousePosition(pos)
    return ipcRenderer.invoke('jarvis-native-mouse-move', v)
  },
  mouseClick: (opts) => {
    if (!opts || typeof opts !== 'object') throw new Error('Invalid options')
    const buttons = ['left', 'right', undefined]
    if (opts.button && !buttons.includes(opts.button)) throw new Error('Invalid button')
    if (opts.x !== undefined) jarvisNativeValidators.mousePosition(opts)
    return ipcRenderer.invoke('jarvis-native-mouse-click', opts)
  },
  mouseScroll: (opts) => {
    if (!opts || typeof opts !== 'object') throw new Error('Invalid options')
    if (opts.amount !== undefined && (typeof opts.amount !== 'number' || opts.amount < -100 || opts.amount > 100)) {
      throw new Error('Invalid scroll amount')
    }
    return ipcRenderer.invoke('jarvis-native-mouse-scroll', opts)
  },
  mouseDrag: (opts) => {
    if (!opts || typeof opts !== 'object') throw new Error('Invalid options')
    const { startX, startY, endX, endY } = opts
    if (typeof startX !== 'number' || typeof startY !== 'number' || typeof endX !== 'number' || typeof endY !== 'number') {
      throw new TypeError('Drag coordinates must be numbers')
    }
    return ipcRenderer.invoke('jarvis-native-mouse-drag', opts)
  },
  keyboardType: (opts) => {
    const v = jarvisNativeValidators.keyboardText(opts)
    return ipcRenderer.invoke('jarvis-native-keyboard-type', v)
  },
  keyboardPress: (opts) => {
    const v = jarvisNativeValidators.keyboardKeys(opts)
    return ipcRenderer.invoke('jarvis-native-keyboard-press', v)
  },
  keyboardHotkey: (opts) => {
    const v = jarvisNativeValidators.keyboardCombo(opts)
    return ipcRenderer.invoke('jarvis-native-keyboard-hotkey', v)
  },
  screenSize: () => ipcRenderer.invoke('jarvis-native-screen-size'),
  screenCapture: (opts) => {
    if (opts?.region) {
      const { x, y, width, height, left, top } = opts.region
      const nums = [x, y, width, height, left, top]
      if (nums.some((n) => n !== undefined && (typeof n !== 'number' || n < 0 || n > 100000))) {
        throw new Error('Invalid screen region')
      }
    }
    return ipcRenderer.invoke('jarvis-native-screen-capture', opts)
  },
  clipboardRead: () => ipcRenderer.invoke('jarvis-native-clipboard-read'),
  clipboardWrite: (opts) => {
    const v = jarvisNativeValidators.clipboardText(opts)
    return ipcRenderer.invoke('jarvis-native-clipboard-write', v)
  },
  windowList: () => ipcRenderer.invoke('jarvis-native-window-list'),
  windowFocus: (opts) => {
    const v = jarvisNativeValidators.windowTitle(opts)
    return ipcRenderer.invoke('jarvis-native-window-focus', v)
  },
  activeWindow: () => ipcRenderer.invoke('jarvis-native-active-window'),
  powershellExec: (opts) => {
    const v = jarvisNativeValidators.powershellCommand(opts)
    return ipcRenderer.invoke('jarvis-powershell-exec', v)
  },
  getScreenSources: () => ipcRenderer.invoke('jarvis-screen-sources'),
})
