/**
 * Preload for the main BrowserWindow: exposes a minimal, read-only API for the in-app browser.
 */
const { contextBridge, ipcRenderer } = require('electron')

const PARTITION = 'persist:ai-search-browser'

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
/** Must match `JARVIS_NATIVE_VOICE_BRIDGE_TOKEN` in `src/lib/jarvis-native-bridge.ts`. */
contextBridge.exposeInMainWorld('jarvisNative', {
  bridgeToken: 'jarvis-native-voice-v1',
  bridgeVersion: 1,
  onDesktopFocusContext: (handler) => {
    const fn = (_e, payload) => {
      handler(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {})
    }
    ipcRenderer.on('jarvis-desktop-focus-context', fn)
    return () => ipcRenderer.removeListener('jarvis-desktop-focus-context', fn)
  },
  mouseMove: (pos) => ipcRenderer.invoke('jarvis-native-mouse-move', pos),
  mouseClick: (opts) => ipcRenderer.invoke('jarvis-native-mouse-click', opts),
  mouseScroll: (opts) => ipcRenderer.invoke('jarvis-native-mouse-scroll', opts),
  mouseDrag: (opts) => ipcRenderer.invoke('jarvis-native-mouse-drag', opts),
  keyboardType: (opts) => ipcRenderer.invoke('jarvis-native-keyboard-type', opts),
  keyboardPress: (opts) => ipcRenderer.invoke('jarvis-native-keyboard-press', opts),
  keyboardHotkey: (opts) => ipcRenderer.invoke('jarvis-native-keyboard-hotkey', opts),
  screenSize: () => ipcRenderer.invoke('jarvis-native-screen-size'),
  screenCapture: (opts) => ipcRenderer.invoke('jarvis-native-screen-capture', opts),
  clipboardRead: () => ipcRenderer.invoke('jarvis-native-clipboard-read'),
  clipboardWrite: (opts) => ipcRenderer.invoke('jarvis-native-clipboard-write', opts),
  windowList: () => ipcRenderer.invoke('jarvis-native-window-list'),
  windowFocus: (opts) => ipcRenderer.invoke('jarvis-native-window-focus', opts),
  activeWindow: () => ipcRenderer.invoke('jarvis-native-active-window'),
  powershellExec: (opts) => ipcRenderer.invoke('jarvis-powershell-exec', opts),
  getScreenSources: () => ipcRenderer.invoke('jarvis-screen-sources'),
})
