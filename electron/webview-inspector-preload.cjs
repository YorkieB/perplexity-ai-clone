/**
 * Guest preload for Jarvis in-app `<webview>` (partition persist:ai-search-browser).
 * Exposes a minimal bridge so the injected page script can ipc-message the embedder.
 * @see electron/webview-injected/inspector.js
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__jarvisInspectorHost', {
  /**
   * @param {string} type
   * @param {unknown} payload
   */
  send(type, payload) {
    ipcRenderer.sendToHost('jarvis-inspector', { type, payload })
  },
})
