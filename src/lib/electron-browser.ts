/**
 * In-app browser integration when running inside Electron (webview tag + preload API).
 * @see src/browser/electron-browser-bridge.ts
 */

export type { DownloadProgressPayload, JarvisBrowserInspectorBridge } from '@/browser/electron-browser-bridge'
export {
  getElectronInAppBrowser,
  getJarvisBrowserInspectorBridge,
  isElectronDesktop,
  isElectronWebviewAvailable,
  syncBrowserSettingsToMain,
} from '@/browser/electron-browser-bridge'

export interface LoadExtensionResult {
  ok: boolean
  name?: string
  version?: string
  error?: string
}
