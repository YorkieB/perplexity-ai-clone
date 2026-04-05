/**
 * Runs ESLint (JSON), tsc, graphql-schema-linter, and Sonar scanner via ideRunCommand,
 * normalizes output into workspace-relative problem rows.
 */

import type { JarvisIdeRunCommandResult } from '@/types/jarvis-ide'

export interface JarvisWorkspaceQualityProblem {
  line: number
  column: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source: string
}

function toWorkspaceRelPath(workspaceRoot: string, filePath: string): string {
  const norm = filePath.replaceAll('\\', '/')
  const wr = workspaceRoot.replaceAll('\\', '/').replace(/\/$/, '')
  const wrLower = wr.toLowerCase()
  const nLower = norm.toLowerCase()
  if (nLower.startsWith(wrLower + '/')) return norm.slice(wr.length + 1)
  if (nLower === wrLower) return '(workspace)'
  if (!norm.includes('/') && !norm.includes('\\')) return norm
  const parts = norm.split('/')
  return parts.at(-1) ?? norm
}

function dedupeProblems(problems: JarvisWorkspaceQualityProblem[]): JarvisWorkspaceQualityProblem[] {
  const seen = new Set<string>()
  const out: JarvisWorkspaceQualityProblem[] = []
  for (const p of problems) {
    const k = `${p.source}|${p.line}|${p.column}|${p.message}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

/** ESLint `-f json` (array of file results). */
// eslint-disable-next-line sonarjs/cognitive-complexity -- ESLint JSON output parser handles nested message objects with multiple optional fields
export function parseEslintJsonOutput(stdout: string, workspaceRoot: string): JarvisWorkspaceQualityProblem[] {
  const trimmed = stdout.trim()
  const start = trimmed.indexOf('[')
  if (start === -1) return []
  let jsonStr = trimmed.slice(start)
  const end = jsonStr.lastIndexOf(']')
  if (end !== -1) jsonStr = jsonStr.slice(0, end + 1)
  let arr: Array<{
    filePath?: string
    messages?: Array<{
      line?: number
      column?: number
      severity?: number
      message?: string
      ruleId?: string | null
    }>
  }>
  try {
    arr = JSON.parse(jsonStr) as typeof arr
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: JarvisWorkspaceQualityProblem[] = []
  for (const f of arr) {
    const fp = f.filePath || ''
    const source = toWorkspaceRelPath(workspaceRoot, fp)
    for (const m of f.messages || []) {
      if (m.line == null || m.line < 1) continue
      let sev: 'error' | 'warning' | 'info' = 'info'
      if (m.severity === 2) sev = 'error'
      else if (m.severity === 1) sev = 'warning'
      const rule = m.ruleId ? String(m.ruleId) : ''
      const msg = m.message || 'ESLint'
      out.push({
        line: m.line,
        column: Math.max(1, m.column ?? 1),
        severity: sev,
        message: rule ? `[eslint] ${msg} (${rule})` : `[eslint] ${msg}`,
        source,
      })
    }
  }
  return out
}

/** TypeScript compiler: path(line,col): error|warning … */
export function parseTscOutput(combined: string, workspaceRoot: string): JarvisWorkspaceQualityProblem[] {
  const out: JarvisWorkspaceQualityProblem[] = []
  const lines = combined.split(/\r?\n/)
  const re = /^([^\n(]{1,500})\((\d+),(\d+)\):\s*(error|warning)\s+([^\n]{1,500})$/
  for (const line of lines) {
    const m = re.exec(line)
    if (!m) continue
    const rawPath = m[1].trim()
    const source = toWorkspaceRelPath(workspaceRoot, rawPath)
    const sev = m[4] === 'error' ? 'error' : 'warning'
    out.push({
      line: Number.parseInt(m[2], 10),
      column: Number.parseInt(m[3], 10),
      severity: sev,
      message: `[tsc] ${m[5].trim()}`,
      source,
    })
  }
  return out
}

/** graphql-schema-linter default text output. */
export function parseGraphqlSchemaLinterStdout(text: string, defaultRel: string, workspaceRoot: string): JarvisWorkspaceQualityProblem[] {
  const out: JarvisWorkspaceQualityProblem[] = []
  const lines = text.split(/\r?\n/)
  let current = defaultRel
  const fileHeader = /^(.+\.(?:graphql|gql))$/i
  const issueRe = /^\s*(\d+):(\d+)\s+(error|warning)\s+([^\n]{1,500})$/
  for (const line of lines) {
    const fh = fileHeader.exec(line.trim())
    if (fh && !/\s/.test(line.trim())) {
      current = toWorkspaceRelPath(workspaceRoot, fh[1].trim())
      continue
    }
    const im = issueRe.exec(line)
    if (im) {
      out.push({
        line: Number.parseInt(im[1], 10),
        column: Number.parseInt(im[2], 10),
        severity: im[3] === 'error' ? 'error' : 'warning',
        message: `[graphql] ${im[4].trim()}`,
        source: current,
      })
    }
  }
  return out
}

/** Sonar scanner: no stable file:line in logs; surface failure tail when exit != 0. */
export function parseSonarScannerOutput(combined: string, exitCode: number | null): JarvisWorkspaceQualityProblem[] {
  if (exitCode === 0 || exitCode === null) return []
  const tail = combined
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-40)
    .join('\n')
    .slice(0, 8000)
  const msg = tail || `scanner exited with code ${String(exitCode)}`
  return [
    {
      line: 1,
      column: 1,
      severity: 'error',
      message: `[sonar] ${msg}`,
      source: 'sonar-scanner',
    },
  ]
}

export interface RunJarvisWorkspaceQualityOptions {
  workspaceRoot: string
  runCommand: (cwd: string, command: string) => Promise<JarvisIdeRunCommandResult>
  hasTsconfig: boolean
  graphqlRelPaths: readonly string[]
  runSonar: boolean
}

export async function runJarvisWorkspaceQuality(opts: RunJarvisWorkspaceQualityOptions): Promise<{
  problems: JarvisWorkspaceQualityProblem[]
  logs: string[]
}> {
  const { workspaceRoot, runCommand, hasTsconfig, graphqlRelPaths, runSonar } = opts
  const logs: string[] = []
  const problems: JarvisWorkspaceQualityProblem[] = []

  const eslintCmd =
    'npx --yes eslint . --ext .ts,.tsx,.js,.jsx,.mjs,.cjs --no-error-on-unmatched-pattern -f json'
  logs.push('--- ESLint ---')
  const eslintR = await runCommand(workspaceRoot, eslintCmd)
  const eslintText = `${eslintR.stdout}\n${eslintR.stderr}`
  problems.push(...parseEslintJsonOutput(eslintText, workspaceRoot))
  logs.push(`eslint exit=${String(eslintR.exitCode)}`)

  if (hasTsconfig) {
    logs.push('--- tsc ---')
    const tscR = await runCommand(workspaceRoot, 'npx --yes tsc --noEmit -p tsconfig.json')
    const tscText = `${tscR.stdout}\n${tscR.stderr}`
    problems.push(...parseTscOutput(tscText, workspaceRoot))
    logs.push(`tsc exit=${String(tscR.exitCode)}`)
  } else {
    logs.push('--- tsc (skipped: no tsconfig.json) ---')
  }

  const gqlPaths = graphqlRelPaths.slice(0, 8)
  if (gqlPaths.length === 0) {
    logs.push('--- GraphQL schema linter (skipped: no .graphql/.gql files in index) ---')
  }
  for (const rel of gqlPaths) {
    const safe = rel.replaceAll('"', '').replaceAll('\\', '/')
    logs.push(`--- graphql-schema-linter ${safe} ---`)
    const q = `"${safe}"`
    const gqlR = await runCommand(workspaceRoot, `npx --yes graphql-schema-linter ${q}`)
    const gqlText = `${gqlR.stdout}\n${gqlR.stderr}`
    problems.push(...parseGraphqlSchemaLinterStdout(gqlText, safe, workspaceRoot))
    logs.push(`graphql-schema-linter exit=${String(gqlR.exitCode)}`)
  }

  if (runSonar) {
    logs.push('--- SonarScanner ---')
    let sonarR = await runCommand(workspaceRoot, 'npx --yes @sonar/scan')
    const sonarText = `${sonarR.stdout}\n${sonarR.stderr}`
    const looksMissing =
      /not recognized|not found|ENOENT|is not recognized as an internal or external command/i.test(sonarText)
    if ((sonarR.exitCode !== 0 && sonarR.exitCode != null) && looksMissing) {
      sonarR = await runCommand(workspaceRoot, 'sonar-scanner')
    }
    const finalText = `${sonarR.stdout}\n${sonarR.stderr}`
    problems.push(...parseSonarScannerOutput(finalText, sonarR.exitCode))
    logs.push(`sonar exit=${String(sonarR.exitCode)}`)
  } else {
    logs.push('--- SonarScanner (skipped: no sonar-project.properties) ---')
  }

  return { problems: dedupeProblems(problems), logs }
}
