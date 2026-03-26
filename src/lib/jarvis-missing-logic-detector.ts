/**
 * JARVIS — Missing Logic & Breakage Detection
 * Heuristic static analysis for open editor buffers + optional workspace context.
 * Deep accuracy requires ESLint/tsc/IDE; these rules flag likely issues early.
 */

export const MISSING_LOGIC_DETECTION_IDS = [
  'missing-return',
  'unreachable-code',
  'missing-break',
  'missing-default',
  'missing-else',
  'incomplete-conditionals',
  'missing-await',
  'missing-error-handling',
  'uninitialized-variables',
  'unused-variables',
  'use-before-assignment',
  'missing-state-updates',
  'missing-dependency-injection',
  'missing-context-providers',
  'missing-redux-dispatches',
  'missing-state-resets',
  'missing-parameters',
  'missing-return-values',
  'mismatched-return-types',
  'missing-api-responses',
  'missing-error-responses',
  'missing-validation',
  'missing-imports',
  'unused-imports',
  'circular-imports',
  'incorrect-import-paths',
  'missing-modules',
  'missing-peer-dependencies',
  'missing-type-definitions',
  'domain-layer-violations',
  'ui-layer-violations',
  'service-bypass',
  'repository-misuse',
  'controller-logic-in-models',
  'missing-repository-implementation',
  'missing-interface-implementation',
  'missing-adapter',
  'missing-factory',
  'missing-provider',
  'missing-required-fields',
  'missing-schema-validation',
  'missing-response-fields',
  'mismatched-api-types',
  'missing-http-status-codes',
  'missing-error-codes',
  'mismatched-dtos',
  'mismatched-ts-interfaces',
  'missing-graphql-resolvers',
  'missing-rest-endpoints',
  'missing-websocket-handlers',
  'missing-tests',
  'missing-mocks',
  'missing-assertions',
  'missing-cleanup',
  'missing-snapshot-updates',
  'tests-ref-removed-code',
  'tests-ref-renamed-functions',
  'tests-outdated-behavior',
  'missing-try-catch',
  'missing-fallback-logic',
  'missing-null-checks',
  'missing-undefined-checks',
  'missing-boundary-checks',
  'missing-rate-limit-handling',
  'missing-timeout-handling',
  'infinite-loops',
  'unbounded-recursion',
  'blocking-operations',
  'missing-throttling',
  'missing-environment-variables',
  'missing-build-scripts',
  'missing-tsconfig-paths',
  'missing-bundler-config',
  'missing-docker-instructions',
  'missing-kubernetes-manifests',
  'missing-secrets-management',
  'missing-health-checks',
] as const

export type MissingLogicDetectionId = (typeof MISSING_LOGIC_DETECTION_IDS)[number]

export interface MissingLogicIssue {
  readonly id: MissingLogicDetectionId
  readonly line?: number
  readonly message: string
}

export interface MissingLogicWorkspaceContext {
  readonly workspaceRelFiles?: readonly string[]
  readonly workspaceRoot?: string | null
  /** Raw package.json text if available */
  readonly packageJsonContent?: string | null
  /** Raw tsconfig.json text */
  readonly tsconfigContent?: string | null
}

export interface MissingLogicBadgeDef {
  readonly id: `ml-${MissingLogicDetectionId}`
  readonly label: string
  readonly glyph: string
  readonly group: 'missing-logic'
}

const GLYPH: Record<MissingLogicDetectionId, string> = {
  'missing-return': '→',
  'unreachable-code': '⊥',
  'missing-break': '⎋',
  'missing-default': '◇',
  'missing-else': '?',
  'incomplete-conditionals': '??',
  'missing-await': 'async',
  'missing-error-handling': '!',
  'uninitialized-variables': '∅',
  'unused-variables': 'u',
  'use-before-assignment': '↯',
  'missing-state-updates': 'S',
  'missing-dependency-injection': 'DI',
  'missing-context-providers': 'Ctx',
  'missing-redux-dispatches': 'Rd',
  'missing-state-resets': 'Rst',
  'missing-parameters': '()',
  'missing-return-values': '↩',
  'mismatched-return-types': 'τ',
  'missing-api-responses': 'API',
  'missing-error-responses': '5xx',
  'missing-validation': '✓',
  'missing-imports': '+',
  'unused-imports': '−',
  'circular-imports': '○',
  'incorrect-import-paths': '⌖',
  'missing-modules': 'M',
  'missing-peer-dependencies': 'P',
  'missing-type-definitions': '@',
  'domain-layer-violations': 'D',
  'ui-layer-violations': 'U',
  'service-bypass': 'B',
  'repository-misuse': 'Rep',
  'controller-logic-in-models': 'C',
  'missing-repository-implementation': 'r',
  'missing-interface-implementation': 'I',
  'missing-adapter': 'A',
  'missing-factory': 'F',
  'missing-provider': 'Pr',
  'missing-required-fields': '*',
  'missing-schema-validation': 'Sch',
  'missing-response-fields': '{}',
  'mismatched-api-types': '≠',
  'missing-http-status-codes': '404',
  'missing-error-codes': 'ERR',
  'mismatched-dtos': 'DTO',
  'mismatched-ts-interfaces': 'TS',
  'missing-graphql-resolvers': 'G',
  'missing-rest-endpoints': 'REST',
  'missing-websocket-handlers': 'WS',
  'missing-tests': 'T',
  'missing-mocks': 'mock',
  'missing-assertions': 'assert',
  'missing-cleanup': 'clean',
  'missing-snapshot-updates': 'snap',
  'tests-ref-removed-code': 'rm',
  'tests-ref-renamed-functions': 'rn',
  'tests-outdated-behavior': 'old',
  'missing-try-catch': 'try',
  'missing-fallback-logic': 'fb',
  'missing-null-checks': 'null',
  'missing-undefined-checks': 'und',
  'missing-boundary-checks': '[]',
  'missing-rate-limit-handling': 'rl',
  'missing-timeout-handling': 'to',
  'infinite-loops': '∞',
  'unbounded-recursion': '↻',
  'blocking-operations': '⏸',
  'missing-throttling': 'th',
  'missing-environment-variables': 'env',
  'missing-build-scripts': 'npm',
  'missing-tsconfig-paths': 'paths',
  'missing-bundler-config': 'wb',
  'missing-docker-instructions': 'DK',
  'missing-kubernetes-manifests': 'k8s',
  'missing-secrets-management': 'key',
  'missing-health-checks': '♥',
}

const LABEL: Record<MissingLogicDetectionId, string> = Object.fromEntries(
  MISSING_LOGIC_DETECTION_IDS.map((id) => {
    const words = id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    return [id, words.join(' ')]
  })
) as Record<MissingLogicDetectionId, string>

export const MISSING_LOGIC_BADGE_DEFS: readonly MissingLogicBadgeDef[] = MISSING_LOGIC_DETECTION_IDS.map((id) => ({
  id: `ml-${id}`,
  label: LABEL[id],
  glyph: GLYPH[id],
  group: 'missing-logic',
}))

export function missingLogicDetectionBadgeId(id: MissingLogicDetectionId): `ml-${MissingLogicDetectionId}` {
  return `ml-${id}`
}

function lineOfIndex(code: string, index: number): number {
  return code.slice(0, index).split(/\r?\n/).length
}

function pushIssue(
  issues: MissingLogicIssue[],
  code: string,
  id: MissingLogicDetectionId,
  message: string,
  index?: number
) {
  issues.push({
    id,
    message,
    line: index !== undefined && index >= 0 ? lineOfIndex(code, index) : undefined,
  })
}

function scanTsJsLike(code: string, filename: string, issues: MissingLogicIssue[]) {
  // Unreachable after return/throw
  const unreachable = /(?:return|throw)\s+[^;]+;\s*\n\s*([^\s}])/gm
  let m: RegExpExecArray | null
  while ((m = unreachable.exec(code)) !== null) {
    if (!/^(case|default|if|\/\/|\/\*|\})/.test(m[1])) {
      pushIssue(issues, code, 'unreachable-code', 'Possible unreachable code after return/throw', m.index)
    }
  }

  // Typed function without return (heuristic)
  if (/\bfunction\s+\w+\s*\([^)]*\)\s*:\s*(?!void\b)(?:string|number|boolean|\w+)\s*\{/.test(code)) {
    const fnStart = code.search(/\bfunction\s+\w+/)
    const brace = code.indexOf('{', fnStart)
    if (brace > 0) {
      const chunk = code.slice(brace, brace + 800)
      if (!/\breturn\b/.test(chunk)) {
        pushIssue(issues, code, 'missing-return', 'Function with return type may be missing return', fnStart)
      }
    }
  }
  // switch: missing default
  if (/\bswitch\s*\(/.test(code) && !/\bdefault\s*:/.test(code)) {
    pushIssue(issues, code, 'missing-default', 'switch has no default branch', code.indexOf('switch'))
  }

  // switch case without break/return (heuristic: case followed by case)
  const caseBlocks = code.split(/\bcase\s+/g)
  if (caseBlocks.length > 1) {
    for (let i = 1; i < caseBlocks.length; i++) {
      const segment = caseBlocks[i].split(':')[1] || ''
      const untilNext = segment.split(/\bcase\b|\bdefault\b/)[0] || ''
      if (
        untilNext.length > 10 &&
        !/\b(break|return|throw)\s*[;\n]/.test(untilNext) &&
        /[a-zA-Z_$]/.test(untilNext)
      ) {
        pushIssue(issues, code, 'missing-break', 'switch case may fall through without break/return', code.indexOf('case'))
        break
      }
    }
  }

  // if without else (optional — flag only deep nesting)
  if (/\bif\s*\([^)]+\)\s*\{[^}]{30,}\}\s*if\s*\(/.test(code) && !/\belse\b/.test(code.slice(code.search(/\bif\s*\(/), code.search(/\bif\s*\(/)+400))) {
    pushIssue(issues, code, 'missing-else', 'Consecutive if chains may need else', code.search(/\bif\s*\(/))
  }

  // Empty condition
  if (/\bif\s*\(\s*\)/.test(code) || /\bwhile\s*\(\s*\)/.test(code)) {
    pushIssue(issues, code, 'incomplete-conditionals', 'Empty if/while condition', code.search(/\bif\s*\(\s*\)/))
  }

  // async function with fetch/promise without await
  if (/\basync\s+function|\basync\s*\(/.test(code)) {
    if (/\bfetch\s*\(/.test(code) && !/\bawait\s+fetch/.test(code)) {
      const idx = code.indexOf('fetch')
      if (idx >= 0) pushIssue(issues, code, 'missing-await', 'fetch() in async context may need await', idx)
    }
    if (/\.then\s*\(/.test(code) && !/\bawait\b/.test(code.split('.then')[0].slice(-80))) {
      pushIssue(issues, code, 'missing-await', 'Promise chain in async code may use await', code.indexOf('.then'))
    }
  }

  // Promise without catch
  if (/\.then\s*\([^)]+\)(?!\.catch)/.test(code.replaceAll(/\s+/g, ' ')) && /\.then/.test(code) && !/\.catch/.test(code)) {
    pushIssue(issues, code, 'missing-error-handling', 'Promise chain missing .catch()', code.indexOf('.then'))
  }

  // try without catch
  if (/\btry\s*\{/.test(code) && !/\bcatch\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-try-catch', 'try block without catch', code.indexOf('try'))
  }

  // process.env without fallback
  if (/process\.env\.\w+/.test(code) && !/process\.env\.\w+\s*\?\?/.test(code) && !/process\.env\.\w+\s*\|\|/.test(code)) {
    pushIssue(issues, code, 'missing-environment-variables', 'process.env access may need default (?? or ||)', code.search(/process\.env/))
  }

  // while(true)
  if (/\bwhile\s*\(\s*true\s*\)/.test(code)) {
    const sub = /\bwhile\s*\(\s*true\s*\)\s*\{[\s\S]*?\b(break|return)/.exec(code)
    if (!sub) pushIssue(issues, code, 'infinite-loops', 'while(true) without obvious break/return', code.search(/while\s*\(\s*true/))
  }

  // Recursion without base case (very rough)
  if (/\bfunction\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\b\1\s*\(/.test(code)) {
    const fn = /\bfunction\s+(\w+)/.exec(code)
    if (fn && !new RegExp(String.raw`\bif\s*\([^)]*${fn[1]}`).test(code)) {
      pushIssue(issues, code, 'unbounded-recursion', 'Recursive call with no obvious base-case guard', code.indexOf('function'))
    }
  }

  // setTimeout 0 loop
  if (/setInterval\s*\(/.test(code) && !/clearInterval/.test(code)) {
    pushIssue(issues, code, 'missing-timeout-handling', 'setInterval without clearInterval in file', code.indexOf('setInterval'))
  }

  // Express route without status
  if (/res\.(json|send)\s*\(/.test(code) && /\.(get|post|put|delete)\s*\(/.test(code) && !/res\.status\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-http-status-codes', 'Route handler may need explicit res.status()', code.search(/\.(get|post)\s*\(/))
  }

  // API handler without validation
  if (/req\.body/.test(code) && !/zod|joi|yup|validate|schema/i.test(code)) {
    pushIssue(issues, code, 'missing-validation', 'req.body used without obvious validation library', code.indexOf('req.body'))
  }

  if (/useEffect\s*\(\s*\(\)\s*=>/.test(code)) {
    const eff = /useEffect\s*\([\s\S]*?\)/.exec(code)
    if (eff && !eff[0].includes('[') && eff[0].length < 200) {
      pushIssue(issues, code, 'missing-parameters', 'useEffect may be missing dependency array as second argument', code.indexOf('useEffect'))
    }
  }

  if (/@Injectable\s*\(\s*\)/.test(code) && /class\s+\w+/.test(code) && !/constructor\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-dependency-injection', 'Injectable class without constructor injection', code.indexOf('@Injectable'))
  }

  if (/useContext\s*\(/.test(code) && !/createContext/.test(code) && /tsx?$/.test(filename)) {
    pushIssue(issues, code, 'missing-context-providers', 'useContext used; ensure Provider wraps tree', code.indexOf('useContext'))
  }

  if (/useSelector\s*\(/.test(code) && !/useDispatch/.test(code) && /dispatch/.test(code) === false) {
    pushIssue(issues, code, 'missing-redux-dispatches', 'useSelector without useDispatch in same module', code.indexOf('useSelector'))
  }

  if (/useState\s*\(/.test(code) && /router|navigate|push/.test(code) && !/reset|setState\(\s*\(\)\s*=>/.test(code)) {
    pushIssue(issues, code, 'missing-state-resets', 'Navigation with state — consider reset on route change', code.indexOf('useState'))
  }

  // Layer imports (path heuristic)
  if (/\/domain\//i.test(filename) && /from\s+['"][^'"]*\/(components|ui)\//i.test(code)) {
    pushIssue(issues, code, 'domain-layer-violations', 'Domain file imports UI layer', 0)
  }
  if (/\/(components|ui)\//i.test(filename) && /from\s+['"][^'"]*\/domain\/[^'"]*service/i.test(code)) {
    pushIssue(issues, code, 'ui-layer-violations', 'UI file imports domain service directly (bypass adapter?)', 0)
  }
  if (/\/repository\//i.test(filename) && /\.queryRaw\s*\(/.test(code)) {
    pushIssue(issues, code, 'repository-misuse', 'Raw query in repository layer', code.indexOf('queryRaw'))
  }
  if (/\bclass\s+\w+\s*\{[\s\S]*\b(router|express)\b/.test(code) && /\.(get|post)/.test(code)) {
    pushIssue(issues, code, 'controller-logic-in-models', 'HTTP routing mixed into model-like class', code.indexOf('class'))
  }

  // GraphQL
  if (filename.endsWith('.graphql') || filename.endsWith('.gql')) {
    if (/type\s+Query/.test(code) && !/Query\s*:\s*\{/.test(code) && !code.includes('resolver')) {
      pushIssue(issues, code, 'missing-graphql-resolvers', 'Schema may need resolver wiring on server', 0)
    }
  }

  // REST server
  if (/express\s*\(/.test(code) || /from\s+['"]express['"]/.test(code)) {
    if (!/app\.(get|post|put|delete|patch)\s*\(/.test(code)) {
      pushIssue(issues, code, 'missing-rest-endpoints', 'Express app has no route registrations', code.indexOf('express'))
    }
    if (!/\/health|healthcheck/i.test(code)) {
      pushIssue(issues, code, 'missing-health-checks', 'No /health route detected', 0)
    }
  }

  // WebSocket
  if (/WebSocket|ws['"]/.test(code) && !/on\s*\(\s*['"]message['"]/.test(code)) {
    pushIssue(issues, code, 'missing-websocket-handlers', 'WebSocket without message handler', code.indexOf('WebSocket'))
  }

  // Imports
  const importLines = code.match(/^import\s+.+$/gm) || []
  const specifiers = new Map<string, number>()
  for (const line of importLines) {
    const names = [...line.matchAll(/\b(\w+)\b/g)].map((x) => x[1]!)
    for (const n of names) {
      if (['import', 'from', 'type', 'as'].includes(n)) continue
      specifiers.set(n, (specifiers.get(n) || 0) + 1)
    }
  }
  for (const [name, count] of specifiers) {
    if (count === 1 && !new RegExp(String.raw`\b${name}\b`).test(code.replaceAll(/^import\s+.+$/gm, ''))) {
      if (name.length > 2 && /^[A-Z]/.test(name)) {
        pushIssue(issues, code, 'unused-imports', `Import "${name}" may be unused`, code.indexOf(name))
        break
      }
    }
  }

  if (importLines.length > 0) {
    const froms = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((x) => x[1]!)
    for (const f of froms) {
      if (f.startsWith('.') && f.includes('/../') && /\.\.\/\.\.\/\.\./.test(f)) {
        pushIssue(issues, code, 'incorrect-import-paths', `Deep relative import ${f}`, code.indexOf(f))
        break
      }
    }
    const dup = froms.filter((f, i) => froms.indexOf(f) !== i)
    if (dup.length && dup[0]) pushIssue(issues, code, 'missing-imports', 'Duplicate import from same path — consolidate', code.indexOf(dup[0]))
  }

  if (importLines.length >= 2) {
    const a = /from\s+['"]([^'"]+)['"]/.exec(importLines[0] ?? '')?.[1]
    const b = /from\s+['"]([^'"]+)['"]/.exec(importLines[1] ?? '')?.[1]
    if (a && b && a === b) pushIssue(issues, code, 'circular-imports', 'Same module imported twice — possible circularity risk', 0)
  }

  // Optional chaining gaps
  if (/\w+\.\w+\.\w+/.test(code) && !/\?\.|\|\||\?\?/.test(code.split('\n').slice(0, 15).join('\n'))) {
    pushIssue(issues, code, 'missing-null-checks', 'Deep property access without optional chaining or guards', 0)
  }

  if (/\bundefined\b/.test(code) && !/(===\s*undefined|\?\?|typeof\s+\w+\s*===)/.test(code)) {
    pushIssue(issues, code, 'missing-undefined-checks', 'undefined referenced — consider explicit checks', code.indexOf('undefined'))
  }

  if (/\.length\s*[<>=]/.test(code) && !/\bif\s*\([^)]*length/.test(code) && /\[0\]/.test(code)) {
    pushIssue(issues, code, 'missing-boundary-checks', 'Array index access — verify length/bounds', code.indexOf('[0]'))
  }

  if (/fetch\s*\(|axios\.|http\.get/.test(code) && !/AbortSignal|timeout|signal:/i.test(code)) {
    pushIssue(issues, code, 'missing-timeout-handling', 'HTTP client call without timeout/AbortSignal', code.search(/fetch|axios/))
  }

  if (/fetch\s*\(/.test(code) && !/429|rate|throttle/i.test(code)) {
    pushIssue(issues, code, 'missing-rate-limit-handling', 'Network call without rate-limit handling comment/guard', code.indexOf('fetch'))
  }

  // sync while loop
  if (/\bwhile\s*\([^)]+\)\s*\{(?![\s\S]*await)/.test(code) && /while/.test(code)) {
    const w = code.indexOf('while')
    if (w >= 0 && !/async/.test(code.slice(0, w))) {
      pushIssue(issues, code, 'blocking-operations', 'Synchronous while loop may block event loop', w)
    }
  }

  // Missing fallback
  if (/\?\./.test(code) === false && /\|\|\s*['"]{2}/.test(code) === false && /JSON\.parse/.test(code)) {
    pushIssue(issues, code, 'missing-fallback-logic', 'JSON.parse without try/catch or fallback', code.indexOf('JSON.parse'))
  }

  // Tests
  if (/\.(test|spec)\.(tsx?|jsx?)$/i.test(filename) || /__tests__/.test(filename)) {
    if (/describe\s*\(/.test(code) && !/it\s*\(|test\s*\(/.test(code)) {
      pushIssue(issues, code, 'missing-assertions', 'describe without it/test', code.indexOf('describe'))
    }
    if (/it\s*\(/.test(code) && !/expect\s*\(/.test(code)) {
      pushIssue(issues, code, 'missing-assertions', 'test case without expect()', code.indexOf('it'))
    }
    if (!/afterEach|afterAll|cleanup/.test(code) && /render\s*\(/.test(code)) {
      pushIssue(issues, code, 'missing-cleanup', 'Test renders component — consider cleanup', code.indexOf('render'))
    }
    if (/toMatchSnapshot/.test(code) && !/update.*snapshot/i.test(code) && /#.*snapshot/i.test(code) === false) {
      pushIssue(issues, code, 'missing-snapshot-updates', 'Snapshot matcher present — verify updates on change', code.indexOf('toMatchSnapshot'))
    }
    if (/\.skip\(|xit\(|xdescribe/.test(code)) {
      pushIssue(issues, code, 'tests-outdated-behavior', 'Skipped tests may be outdated', code.search(/\.skip|xit/))
    }
    if (/function\s+foo|bar\s*\(/.test(code) && /import.*removed/i.test(code) === false) {
      /* placeholder for ref removed — heuristic string */
    }
    if (/not\.toThrow|toThrow/.test(code) === false && /it\s*\(/.test(code)) {
      pushIssue(issues, code, 'missing-assertions', 'Consider explicit error assertions for risky code', 0)
    }
  } else if (!/\.(test|spec)\./i.test(filename) && /export\s+(async\s+)?function|export\s+const\s+\w+\s*=/.test(code) && !/\.test\.|__tests__/.test(filename)) {
    pushIssue(issues, code, 'missing-tests', 'Source file has exports but no co-located test heuristic', 0)
  }

  // Interface / implements
  if (/\bclass\s+\w+\s+implements\s+(\w+)/.test(code)) {
    const impl = /\bimplements\s+(\w+)/.exec(code)
    if (impl && !new RegExp(String.raw`\b${impl[1]}\b`).test(code.slice(code.indexOf('{')))) {
      pushIssue(issues, code, 'missing-interface-implementation', 'Class implements interface — verify all members', code.indexOf('implements'))
    }
  }

  if (/interface\s+\w+\s*\{/.test(code) && /export/.test(code) && !/\bimplements\b/.test(code)) {
    pushIssue(issues, code, 'mismatched-ts-interfaces', 'Public interface — ensure consumers match', code.indexOf('interface'))
  }

  // DTO / API
  if (/z\.object\s*\(/.test(code) && !/\.strict\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-schema-validation', 'Zod object — consider .strict()', code.indexOf('z.object'))
  }

  if (/res\.json\s*\(\s*\{/.test(code) && !/status\s*\(/.test(code.slice(0, code.indexOf('res.json') + 200))) {
    pushIssue(issues, code, 'missing-response-fields', 'res.json with object — document expected shape', code.indexOf('res.json'))
  }

  if (/res\.(json|send)\s*\(/.test(code) && /\.(get|post|put|delete)\s*\(/.test(code) && !/catch\s*\(/.test(code) && !/next\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-error-responses', 'Route handler may need explicit error response path', code.search(/\.(get|post)\s*\(/))
  }

  if (/fetch\s*\(\s*['"]\/api/.test(code) && !/\.json\s*\(\s*\)/.test(code)) {
    pushIssue(issues, code, 'missing-api-responses', 'fetch to /api may need response body handling', code.indexOf('fetch'))
  }

  if (/:\s*\w+Dto\b/.test(code) && /as\s+\w+/.test(code) === false) {
    pushIssue(issues, code, 'mismatched-dtos', 'DTO type name — verify mapping to API contract', code.search(/Dto\b/))
  }

  if (/status\s*\(\s*5\d\d/.test(code) === false && /throw\s+new\s+Error/.test(code) && /express|app/.test(code)) {
    pushIssue(issues, code, 'missing-error-codes', 'Errors thrown without structured error code / status', code.indexOf('throw'))
  }

  if (/axios\.|fetch\s*\(/.test(code) && !/interface\s+\w+Response/.test(code) && !/type\s+\w+Response/.test(code)) {
    pushIssue(issues, code, 'mismatched-api-types', 'HTTP client without obvious Response type in module', 0)
  }

  if (/\/(api|routes)\//i.test(filename) && /prisma\.|mongoose\.|sequelize\.|queryRaw/.test(code) && !/Service/.test(code)) {
    pushIssue(issues, code, 'service-bypass', 'Route file may be calling DB/ORM directly — use service/repository layer', 0)
  }

  if (/\bRepository\b/.test(code) && !/\bimplements\b/.test(code) && /class\s+\w+Repository/.test(code)) {
    pushIssue(issues, code, 'missing-repository-implementation', 'Repository class — verify interface contract', code.indexOf('Repository'))
  }

  if (/interface\s+\w+Adapter\b/.test(code) && !/(implements|implements)\s+\w+Adapter/.test(code)) {
    pushIssue(issues, code, 'missing-adapter', 'Adapter interface declared — verify implementation', code.indexOf('Adapter'))
  }

  if (/Factory\s*\{/.test(code) && !/\bcreate\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-factory', 'Factory-like object without create/build method', code.indexOf('Factory'))
  }

  if (/createContext\s*\(/.test(code) && !/\.Provider/.test(code)) {
    pushIssue(issues, code, 'missing-provider', 'createContext without .Provider usage in file', code.indexOf('createContext'))
  }

  if (/z\.object\s*\(\s*\{/.test(code) && !/required\s*\(/.test(code) && !/\.min\s*\(/.test(code)) {
    pushIssue(issues, code, 'missing-required-fields', 'Zod schema — mark required fields explicitly', code.indexOf('z.object'))
  }

  if (/\.(test|spec)\.(tsx?|jsx?)$/i.test(filename) && /from\s+['"]/.test(code) && !/jest\.mock|vi\.mock/.test(code)) {
    pushIssue(issues, code, 'missing-mocks', 'Test file imports modules — consider mocks for external deps', 0)
  }

  if (/describe\s*\(/.test(code) && /removed|deprecated|TODO:\s*rename/i.test(code)) {
    pushIssue(issues, code, 'tests-ref-removed-code', 'Test comment may reference removed/deprecated code', code.search(/removed|deprecated/i))
  }

  if (/\.(test|spec)\./i.test(filename) && /function\s+\w+\s*\(/.test(code) && /\.(tsx?|jsx?)$/i.test(code) === false) {
    pushIssue(issues, code, 'tests-ref-renamed-functions', 'Test may reference old function names — verify against source', 0)
  }

  if (/setInterval\s*\(/.test(code) && !/clearInterval/.test(code) && !/\d{3,}/.test(code.split('setInterval')[1]?.slice(0, 40) || '')) {
    pushIssue(issues, code, 'missing-throttling', 'setInterval without obvious delay — verify throttling', code.indexOf('setInterval'))
  }

  if (/\breturn\s+true;/.test(code) && /\)\s*:\s*string\b/.test(code)) {
    pushIssue(issues, code, 'mismatched-return-types', 'Return value may not match annotated return type', code.indexOf('return'))
  }

  if (/from\s+['"]\s*['"]/.test(code)) {
    pushIssue(issues, code, 'missing-imports', 'Empty module path in import', code.search(/from\s+['"]\s*['"]/))
  }

  if (/async\s+function\s+\w+/.test(code) && /Promise\s*</.test(code) && !/\breturn\b/.test(code.split('{').pop()?.slice(0, 1500) || '')) {
    pushIssue(issues, code, 'missing-return-values', 'Async function / Promise type without return in body (heuristic)', code.search(/async/))
  }

  if (/useState\s*\(/.test(code) && /useEffect\s*\(/.test(code) && !/set\w+\s*\(/.test(code.split('useEffect')[1]?.slice(0, 400) || '')) {
    pushIssue(issues, code, 'missing-state-updates', 'useEffect block may need state setter calls', code.indexOf('useEffect'))
  }

  if (/\blet\s+(\w+)\s*;/.test(code)) {
    const lm = /\blet\s+(\w+)\s*;/.exec(code)
    const name = lm?.[1]
    if (name) {
      if (new RegExp(String.raw`\b${name}\b`).test(code) && !new RegExp(String.raw`\b${name}\s*=`).test(code)) {
        pushIssue(issues, code, 'uninitialized-variables', `let ${name} may be used without assignment`, code.indexOf('let'))
      }
      const idx = code.indexOf(`let ${name};`)
      if (idx >= 0) {
        const after = code.slice(idx + `let ${name};`.length, idx + 200)
        if (new RegExp(String.raw`\b${name}\b`).test(after) && !after.includes(`${name} =`)) {
          pushIssue(issues, code, 'use-before-assignment', `Variable ${name} may be used before assignment`, idx)
        }
      }
    }
  }
}

function scanPython(code: string, issues: MissingLogicIssue[]) {
  if (/\bdef\s+\w+\s*\([^)]*\)\s*->\s*None\s*:/.test(code) && /\breturn\b/.test(code) === false) {
    pushIssue(issues, code, 'missing-return', 'Function annotated -> None but may need explicit return', code.indexOf('def'))
  }
  if (/\bwhile\s+True\s*:/.test(code) && !/\bbreak\b/.test(code.split('while True')[1] || '')) {
    pushIssue(issues, code, 'infinite-loops', 'while True without break in scope', code.indexOf('while True'))
  }
  if (/requests\.(get|post)/.test(code) && !/timeout\s*=/.test(code)) {
    pushIssue(issues, code, 'missing-timeout-handling', 'requests call without timeout=', code.indexOf('requests'))
  }
}

function scanWorkspace(ctx: MissingLogicWorkspaceContext, issues: MissingLogicIssue[]) {
  const files = ctx.workspaceRelFiles || []
  const lower = files.map((f) => f.toLowerCase())

  if (!lower.some((f) => f.includes('dockerfile') || f.endsWith('dockerfile'))) {
    if (files.length > 5) pushIssue(issues, '', 'missing-docker-instructions', 'No Dockerfile in workspace file list')
  }
  if (!lower.some((f) => f.includes('k8s') || f.includes('kubernetes') || /deployment\.ya?ml/.test(f))) {
    if (files.length > 20 && lower.some((f) => f.includes('package.json'))) {
      pushIssue(issues, '', 'missing-kubernetes-manifests', 'No Kubernetes manifests detected in tree')
    }
  }

  if (ctx.packageJsonContent) {
    try {
      const pkg = JSON.parse(ctx.packageJsonContent) as {
        scripts?: Record<string, string>
        peerDependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        dependencies?: Record<string, string>
      }
      if (!pkg.scripts?.build && !pkg.scripts?.compile) {
        pushIssue(issues, '', 'missing-build-scripts', 'package.json has no build/compile script')
      }
      const peers = Object.keys(pkg.peerDependencies || {})
      for (const p of peers) {
        const inDeps = pkg.dependencies?.[p] || pkg.devDependencies?.[p]
        if (!inDeps) pushIssue(issues, '', 'missing-peer-dependencies', `Peer "${p}" not in dependencies/devDependencies`)
      }
      const needTypes = ['express', 'react', 'lodash']
      for (const n of needTypes) {
        if (pkg.dependencies?.[n] && !pkg.devDependencies?.[`@types/${n}`] && n === 'express') {
          pushIssue(issues, '', 'missing-type-definitions', 'Consider @types for installed packages')
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (ctx.tsconfigContent) {
    if (!/"paths"\s*:/.test(ctx.tsconfigContent)) {
      pushIssue(issues, '', 'missing-tsconfig-paths', 'tsconfig has no paths aliases')
    }
  }

  if (!lower.some((f) => f.includes('webpack') || f.includes('vite.config') || f.includes('rollup'))) {
    if (lower.some((f) => f.endsWith('tsx') || f.endsWith('jsx')) && files.length > 10) {
      pushIssue(issues, '', 'missing-bundler-config', 'No vite/webpack/rollup config in workspace list')
    }
  }

  if (ctx.packageJsonContent?.includes('password') && /"password"\s*:\s*"[^"]{2,}"/.test(ctx.packageJsonContent)) {
    pushIssue(issues, '', 'missing-secrets-management', 'Hardcoded password-like string in package.json')
  }
}

export function analyzeMissingLogic(
  code: string,
  filename: string | undefined,
  language: string,
  ctx: MissingLogicWorkspaceContext = {}
): MissingLogicIssue[] {
  const issues: MissingLogicIssue[] = []
  const fn = filename || 'untitled'
  const lang = language.toLowerCase()

  if (['javascript', 'typescript', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact'].includes(lang) || /\.(tsx?|jsx?)$/i.test(fn)) {
    scanTsJsLike(code, fn, issues)
  } else if (lang === 'python' || fn.endsWith('.py')) {
    scanPython(code, issues)
  }

  scanWorkspace(ctx, issues)

  // Dedupe by id (keep first message)
  const seen = new Set<MissingLogicDetectionId>()
  return issues.filter((i) => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
}
