/**
 * Preload for the main BrowserWindow: exposes a minimal, read-only API for the in-app browser.
 */
const { contextBridge, ipcRenderer } = require('electron')

const PARTITION = 'persist:ai-search-browser'

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
