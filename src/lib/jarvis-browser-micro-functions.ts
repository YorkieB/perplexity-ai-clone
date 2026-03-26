/**
 * JARVIS — Browser micro-functions (full list)
 * Atomic operations for UI automation, debugging, and agent browser tasks (invocation, navigation, DOM, input, network, console, screenshots, JS, testing, error detection).
 */

export type JarvisBrowserMicroCategory =
  | 'invocation'
  | 'navigation'
  | 'dom-query'
  | 'dom-interaction'
  | 'keyboard'
  | 'mouse'
  | 'network'
  | 'console'
  | 'screenshot-visual'
  | 'javascript-exec'
  | 'ui-testing'
  | 'error-detection'

export type JarvisBrowserMicroId =
  | 'brw-invoke-launch'
  | 'brw-invoke-close'
  | 'brw-invoke-restart'
  | 'brw-invoke-new-tab'
  | 'brw-invoke-close-tab'
  | 'brw-invoke-switch-tab'
  | 'brw-invoke-refresh'
  | 'brw-nav-goto-url'
  | 'brw-nav-back'
  | 'brw-nav-forward'
  | 'brw-nav-reload'
  | 'brw-wait-dom-ready'
  | 'brw-wait-network-idle'
  | 'brw-wait-selector'
  | 'brw-query-by-id'
  | 'brw-query-by-class'
  | 'brw-query-by-tag'
  | 'brw-query-by-attribute'
  | 'brw-query-by-text'
  | 'brw-query-by-css'
  | 'brw-query-by-xpath'
  | 'brw-query-multiple'
  | 'brw-extract-text'
  | 'brw-extract-html'
  | 'brw-extract-attributes'
  | 'brw-extract-styles'
  | 'brw-click'
  | 'brw-double-click'
  | 'brw-right-click'
  | 'brw-hover'
  | 'brw-focus'
  | 'brw-blur'
  | 'brw-type-input'
  | 'brw-clear-input'
  | 'brw-select-dropdown'
  | 'brw-check-checkbox'
  | 'brw-uncheck-checkbox'
  | 'brw-toggle-switch'
  | 'brw-drag-element'
  | 'brw-drop-element'
  | 'brw-scroll-to-element'
  | 'brw-scroll-page'
  | 'brw-key-press'
  | 'brw-key-combo'
  | 'brw-key-hold'
  | 'brw-key-release'
  | 'brw-mouse-move'
  | 'brw-mouse-click'
  | 'brw-mouse-double-click'
  | 'brw-mouse-right-click'
  | 'brw-mouse-drag'
  | 'brw-mouse-drop'
  | 'brw-net-capture-requests'
  | 'brw-net-capture-responses'
  | 'brw-net-capture-request-headers'
  | 'brw-net-capture-response-headers'
  | 'brw-net-capture-payloads'
  | 'brw-net-detect-failed'
  | 'brw-net-detect-slow'
  | 'brw-net-detect-blocked'
  | 'brw-console-capture-logs'
  | 'brw-console-capture-warnings'
  | 'brw-console-capture-errors'
  | 'brw-console-detect-runtime-exceptions'
  | 'brw-console-detect-unhandled-rejections'
  | 'brw-shot-full-page'
  | 'brw-shot-viewport'
  | 'brw-shot-element'
  | 'brw-shot-compare'
  | 'brw-shot-detect-visual-diff'
  | 'brw-js-execute'
  | 'brw-js-evaluate'
  | 'brw-js-return-to-agent'
  | 'brw-js-modify-dom'
  | 'brw-js-inject-script'
  | 'brw-js-inject-css'
  | 'brw-test-validate-exists'
  | 'brw-test-validate-visible'
  | 'brw-test-validate-enabled'
  | 'brw-test-validate-disabled'
  | 'brw-test-validate-text'
  | 'brw-test-validate-attribute'
  | 'brw-test-validate-style'
  | 'brw-test-validate-navigation'
  | 'brw-test-validate-form-submit'
  | 'brw-test-validate-error-msg'
  | 'brw-test-validate-success-msg'
  | 'brw-err-missing-dom'
  | 'brw-err-broken-selector'
  | 'brw-err-missing-handlers'
  | 'brw-err-layout-shift'
  | 'brw-err-hydration'
  | 'brw-err-react'
  | 'brw-err-vue'
  | 'brw-err-angular'

export interface JarvisBrowserMicroDef {
  readonly id: JarvisBrowserMicroId
  readonly label: string
  readonly category: JarvisBrowserMicroCategory
}

/** Canonical registry — 96 browser micro-functions. */
export const JARVIS_BROWSER_MICRO_REGISTRY: readonly JarvisBrowserMicroDef[] = [
  { id: 'brw-invoke-launch', label: 'Launch browser', category: 'invocation' },
  { id: 'brw-invoke-close', label: 'Close browser', category: 'invocation' },
  { id: 'brw-invoke-restart', label: 'Restart browser', category: 'invocation' },
  { id: 'brw-invoke-new-tab', label: 'Open new tab', category: 'invocation' },
  { id: 'brw-invoke-close-tab', label: 'Close tab', category: 'invocation' },
  { id: 'brw-invoke-switch-tab', label: 'Switch tab', category: 'invocation' },
  { id: 'brw-invoke-refresh', label: 'Refresh page', category: 'invocation' },

  { id: 'brw-nav-goto-url', label: 'Navigate to URL', category: 'navigation' },
  { id: 'brw-nav-back', label: 'Navigate back', category: 'navigation' },
  { id: 'brw-nav-forward', label: 'Navigate forward', category: 'navigation' },
  { id: 'brw-nav-reload', label: 'Reload page', category: 'navigation' },
  { id: 'brw-wait-dom-ready', label: 'Wait for DOM ready', category: 'navigation' },
  { id: 'brw-wait-network-idle', label: 'Wait for network idle', category: 'navigation' },
  { id: 'brw-wait-selector', label: 'Wait for specific selector', category: 'navigation' },

  { id: 'brw-query-by-id', label: 'Query element by ID', category: 'dom-query' },
  { id: 'brw-query-by-class', label: 'Query element by class', category: 'dom-query' },
  { id: 'brw-query-by-tag', label: 'Query element by tag', category: 'dom-query' },
  { id: 'brw-query-by-attribute', label: 'Query element by attribute', category: 'dom-query' },
  { id: 'brw-query-by-text', label: 'Query element by text', category: 'dom-query' },
  { id: 'brw-query-by-css', label: 'Query element by CSS selector', category: 'dom-query' },
  { id: 'brw-query-by-xpath', label: 'Query element by XPath', category: 'dom-query' },
  { id: 'brw-query-multiple', label: 'Query multiple elements', category: 'dom-query' },
  { id: 'brw-extract-text', label: 'Extract element text', category: 'dom-query' },
  { id: 'brw-extract-html', label: 'Extract element HTML', category: 'dom-query' },
  { id: 'brw-extract-attributes', label: 'Extract element attributes', category: 'dom-query' },
  { id: 'brw-extract-styles', label: 'Extract element styles', category: 'dom-query' },

  { id: 'brw-click', label: 'Click element', category: 'dom-interaction' },
  { id: 'brw-double-click', label: 'Double-click element', category: 'dom-interaction' },
  { id: 'brw-right-click', label: 'Right-click element', category: 'dom-interaction' },
  { id: 'brw-hover', label: 'Hover element', category: 'dom-interaction' },
  { id: 'brw-focus', label: 'Focus element', category: 'dom-interaction' },
  { id: 'brw-blur', label: 'Blur element', category: 'dom-interaction' },
  { id: 'brw-type-input', label: 'Type into input', category: 'dom-interaction' },
  { id: 'brw-clear-input', label: 'Clear input', category: 'dom-interaction' },
  { id: 'brw-select-dropdown', label: 'Select dropdown option', category: 'dom-interaction' },
  { id: 'brw-check-checkbox', label: 'Check checkbox', category: 'dom-interaction' },
  { id: 'brw-uncheck-checkbox', label: 'Uncheck checkbox', category: 'dom-interaction' },
  { id: 'brw-toggle-switch', label: 'Toggle switch', category: 'dom-interaction' },
  { id: 'brw-drag-element', label: 'Drag element', category: 'dom-interaction' },
  { id: 'brw-drop-element', label: 'Drop element', category: 'dom-interaction' },
  { id: 'brw-scroll-to-element', label: 'Scroll to element', category: 'dom-interaction' },
  { id: 'brw-scroll-page', label: 'Scroll page', category: 'dom-interaction' },

  { id: 'brw-key-press', label: 'Press key', category: 'keyboard' },
  { id: 'brw-key-combo', label: 'Press key combination', category: 'keyboard' },
  { id: 'brw-key-hold', label: 'Hold key', category: 'keyboard' },
  { id: 'brw-key-release', label: 'Release key', category: 'keyboard' },

  { id: 'brw-mouse-move', label: 'Move mouse', category: 'mouse' },
  { id: 'brw-mouse-click', label: 'Click', category: 'mouse' },
  { id: 'brw-mouse-double-click', label: 'Double-click', category: 'mouse' },
  { id: 'brw-mouse-right-click', label: 'Right-click', category: 'mouse' },
  { id: 'brw-mouse-drag', label: 'Drag', category: 'mouse' },
  { id: 'brw-mouse-drop', label: 'Drop', category: 'mouse' },

  { id: 'brw-net-capture-requests', label: 'Capture network requests', category: 'network' },
  { id: 'brw-net-capture-responses', label: 'Capture network responses', category: 'network' },
  { id: 'brw-net-capture-request-headers', label: 'Capture request headers', category: 'network' },
  { id: 'brw-net-capture-response-headers', label: 'Capture response headers', category: 'network' },
  { id: 'brw-net-capture-payloads', label: 'Capture payloads', category: 'network' },
  { id: 'brw-net-detect-failed', label: 'Detect failed requests', category: 'network' },
  { id: 'brw-net-detect-slow', label: 'Detect slow requests', category: 'network' },
  { id: 'brw-net-detect-blocked', label: 'Detect blocked requests', category: 'network' },

  { id: 'brw-console-capture-logs', label: 'Capture console logs', category: 'console' },
  { id: 'brw-console-capture-warnings', label: 'Capture console warnings', category: 'console' },
  { id: 'brw-console-capture-errors', label: 'Capture console errors', category: 'console' },
  { id: 'brw-console-detect-runtime-exceptions', label: 'Detect runtime exceptions', category: 'console' },
  { id: 'brw-console-detect-unhandled-rejections', label: 'Detect unhandled rejections', category: 'console' },

  { id: 'brw-shot-full-page', label: 'Take full-page screenshot', category: 'screenshot-visual' },
  { id: 'brw-shot-viewport', label: 'Take viewport screenshot', category: 'screenshot-visual' },
  { id: 'brw-shot-element', label: 'Take element screenshot', category: 'screenshot-visual' },
  { id: 'brw-shot-compare', label: 'Compare screenshots', category: 'screenshot-visual' },
  { id: 'brw-shot-detect-visual-diff', label: 'Detect visual differences', category: 'screenshot-visual' },

  { id: 'brw-js-execute', label: 'Execute JS in page context', category: 'javascript-exec' },
  { id: 'brw-js-evaluate', label: 'Evaluate expression', category: 'javascript-exec' },
  { id: 'brw-js-return-to-agent', label: 'Return value to agent', category: 'javascript-exec' },
  { id: 'brw-js-modify-dom', label: 'Modify DOM via JS', category: 'javascript-exec' },
  { id: 'brw-js-inject-script', label: 'Inject script', category: 'javascript-exec' },
  { id: 'brw-js-inject-css', label: 'Inject CSS', category: 'javascript-exec' },

  { id: 'brw-test-validate-exists', label: 'Validate element exists', category: 'ui-testing' },
  { id: 'brw-test-validate-visible', label: 'Validate element visible', category: 'ui-testing' },
  { id: 'brw-test-validate-enabled', label: 'Validate element enabled', category: 'ui-testing' },
  { id: 'brw-test-validate-disabled', label: 'Validate element disabled', category: 'ui-testing' },
  { id: 'brw-test-validate-text', label: 'Validate element text', category: 'ui-testing' },
  { id: 'brw-test-validate-attribute', label: 'Validate element attribute', category: 'ui-testing' },
  { id: 'brw-test-validate-style', label: 'Validate element style', category: 'ui-testing' },
  { id: 'brw-test-validate-navigation', label: 'Validate navigation', category: 'ui-testing' },
  { id: 'brw-test-validate-form-submit', label: 'Validate form submission', category: 'ui-testing' },
  { id: 'brw-test-validate-error-msg', label: 'Validate error messages', category: 'ui-testing' },
  { id: 'brw-test-validate-success-msg', label: 'Validate success messages', category: 'ui-testing' },

  { id: 'brw-err-missing-dom', label: 'Detect missing DOM elements', category: 'error-detection' },
  { id: 'brw-err-broken-selector', label: 'Detect broken selectors', category: 'error-detection' },
  { id: 'brw-err-missing-handlers', label: 'Detect missing event handlers', category: 'error-detection' },
  { id: 'brw-err-layout-shift', label: 'Detect layout shifts', category: 'error-detection' },
  { id: 'brw-err-hydration', label: 'Detect hydration errors', category: 'error-detection' },
  { id: 'brw-err-react', label: 'Detect React errors', category: 'error-detection' },
  { id: 'brw-err-vue', label: 'Detect Vue errors', category: 'error-detection' },
  { id: 'brw-err-angular', label: 'Detect Angular errors', category: 'error-detection' },
]

const BY_ID: ReadonlyMap<JarvisBrowserMicroId, JarvisBrowserMicroDef> = new Map(
  JARVIS_BROWSER_MICRO_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisBrowserMicroDef(id: JarvisBrowserMicroId): JarvisBrowserMicroDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisBrowserMicroId(s: string): s is JarvisBrowserMicroId {
  return BY_ID.has(s as JarvisBrowserMicroId)
}

export function jarvisBrowserMicrosByCategory(
  cat: JarvisBrowserMicroCategory
): readonly JarvisBrowserMicroDef[] {
  return JARVIS_BROWSER_MICRO_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleBrowser(cat: JarvisBrowserMicroCategory): string {
  const map: Record<JarvisBrowserMicroCategory, string> = {
    invocation: 'Browser invocation',
    navigation: 'Navigation',
    'dom-query': 'DOM querying',
    'dom-interaction': 'DOM interaction',
    keyboard: 'Keyboard input',
    mouse: 'Mouse input',
    network: 'Network monitoring',
    console: 'Console monitoring',
    'screenshot-visual': 'Screenshot & visual',
    'javascript-exec': 'JavaScript execution',
    'ui-testing': 'UI testing',
    'error-detection': 'Error detection',
  }
  return map[cat]
}

export function formatJarvisBrowserMicroCatalog(): string {
  const cats: JarvisBrowserMicroCategory[] = [
    'invocation',
    'navigation',
    'dom-query',
    'dom-interaction',
    'keyboard',
    'mouse',
    'network',
    'console',
    'screenshot-visual',
    'javascript-exec',
    'ui-testing',
    'error-detection',
  ]
  const lines = cats.map((c) => {
    const items = jarvisBrowserMicrosByCategory(c).map((d) => d.label)
    return `${categoryTitleBrowser(c)}: ${items.join('; ')}.`
  })
  return ['JARVIS browser micro-functions (canonical ids in `jarvis-browser-micro-functions` registry):', ...lines].join('\n')
}

export function getJarvisBrowserMicroFunctionsPromptSection(): string {
  return (
    'JARVIS browser micro-functions: session/tabs; navigation and waits; DOM query/extract; interaction (click, form, scroll, drag/drop); ' +
    'keyboard and mouse; network and console capture/diagnostics; screenshots and visual diff; in-page JS; UI assertions; framework error signals. ' +
    'Canonical ids: `src/lib/jarvis-browser-micro-functions.ts` (JARVIS_BROWSER_MICRO_REGISTRY). ' +
    'Runtime automation maps to `browser_action` / `browser_task` tools where implemented.'
  )
}
