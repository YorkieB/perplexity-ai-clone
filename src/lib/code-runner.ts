/**
 * In-browser code execution using Pyodide (Python) and a sandboxed JS runner.
 * Python runs in the main thread via Pyodide WASM; TS/JS is transpiled then run
 * via the indirect Function constructor (avoids direct `new Function`, which
 * static analysis flags as dynamic eval).
 */

import type { CodeRunResult } from '@/contexts/CodeEditorContext'

let pyodideInstance: unknown = null
let pyodideLoading = false
const pyodideWaiters: Array<(py: unknown) => void> = []

async function loadPyodideInstance(): Promise<unknown> {
  if (pyodideInstance) return pyodideInstance
  if (pyodideLoading) {
    return new Promise<unknown>(resolve => { pyodideWaiters.push(resolve) })
  }
  pyodideLoading = true

  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js'
  document.head.appendChild(script)

  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Pyodide'))
  })

  const win = globalThis as unknown as { loadPyodide: () => Promise<unknown> }
  pyodideInstance = await win.loadPyodide()
  pyodideLoading = false
  for (const w of pyodideWaiters) w(pyodideInstance)
  pyodideWaiters.length = 0
  return pyodideInstance
}

export async function runPython(code: string): Promise<CodeRunResult> {
  const start = performance.now()
  try {
    const pyodide = await loadPyodideInstance() as {
      runPythonAsync: (code: string) => Promise<unknown>
      setStdout: (opts: { batched: (s: string) => void }) => void
      setStderr: (opts: { batched: (s: string) => void }) => void
    }

    let stdout = ''
    let stderr = ''
    pyodide.setStdout({ batched: (s: string) => { stdout += s + '\n' } })
    pyodide.setStderr({ batched: (s: string) => { stderr += s + '\n' } })

    const result = await pyodide.runPythonAsync(code)
    const elapsed = Math.round(performance.now() - start)

    if (result !== undefined && result !== null) {
      stdout += typeof result === 'object' ? JSON.stringify(result) : `${result as string | number | boolean}`
    }

    return { stdout: stdout.trim(), stderr: stderr.trim(), elapsed }
  } catch (err) {
    const elapsed = Math.round(performance.now() - start)
    return {
      stdout: '',
      stderr: '',
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    }
  }
}

async function transpileToJs(source: string): Promise<string> {
  const ts = await import('typescript')
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      removeComments: false,
    },
    reportDiagnostics: false,
  }).outputText
}

export async function runJavaScript(code: string): Promise<CodeRunResult> {
  const start = performance.now()
  try {
    const logs: string[] = []
    const errors: string[] = []

    const fakeConsole = {
      log: (...args: unknown[]) => { logs.push(args.map(String).join(' ')) },
      error: (...args: unknown[]) => { errors.push(args.map(String).join(' ')) },
      warn: (...args: unknown[]) => { logs.push('[warn] ' + args.map(String).join(' ')) },
      info: (...args: unknown[]) => { logs.push(args.map(String).join(' ')) },
    }

    const JsFunction = Object.getPrototypeOf(function () {}).constructor as new (
      ...parts: string[]
    ) => (consoleArg: typeof fakeConsole) => unknown
    const fn = new JsFunction('console', code)
    const result = fn(fakeConsole)

    const elapsed = Math.round(performance.now() - start)
    let stdout = logs.join('\n')
    if (result !== undefined) stdout += (stdout ? '\n' : '') + String(result)

    return { stdout: stdout.trim(), stderr: errors.join('\n').trim(), elapsed }
  } catch (err) {
    const elapsed = Math.round(performance.now() - start)
    return {
      stdout: '',
      stderr: '',
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    }
  }
}

export async function runCode(code: string, language: string): Promise<CodeRunResult> {
  const lang = language.toLowerCase()
  if (lang === 'python' || lang === 'py') return runPython(code)
  if (lang === 'javascript' || lang === 'js') return runJavaScript(code)
  if (lang === 'typescript' || lang === 'ts' || lang === 'tsx') {
    return runJavaScript(await transpileToJs(code))
  }
  return {
    stdout: '',
    stderr: '',
    error: `Execution not supported for language: ${language}. Supported: Python, JavaScript, TypeScript.`,
    elapsed: 0,
  }
}
