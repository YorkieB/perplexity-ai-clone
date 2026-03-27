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

contextBridge.exposeInMainWorld('electronInAppBrowser', {
  /** Same string as webview `partition` attribute */
  webviewPartition: PARTITION,
  openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),
  loadExtensionFolder: (folderPath) => ipcRenderer.invoke('browser-load-extension', folderPath),
  pickExtensionFolder: () => ipcRenderer.invoke('dialog-pick-extension-folder'),
  /** Last download notification from main (optional UI) */
  onDownloadComplete: (handler) => {
    const fn = (_e, payload) => {
      handler(payload)
    }
    ipcRenderer.on('browser-download-complete', fn)
    return () => ipcRenderer.removeListener('browser-download-complete', fn)
  },
})
