/**
 * In-app browser integration when running inside Electron (webview tag + preload API).
 */

export interface LoadExtensionResult {
  ok: boolean
  name?: string
  version?: string
  error?: string
}

export function getElectronInAppBrowser(): Window['electronInAppBrowser'] {
  if (typeof window === 'undefined') return undefined
  return window.electronInAppBrowser
}

export function isElectronWebviewAvailable(): boolean {
  return Boolean(getElectronInAppBrowser()?.webviewPartition)
}
