import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IdeChatPanel,
  createIdeAssistantMessage,
  createIdeUserMessage,
  type IdeChatMessage,
  type IdeAttachment,
} from '@/components/IdeChatPanel'
import { toast } from 'sonner'
import Editor, { DiffEditor, type Monaco } from '@monaco-editor/react'
import type * as monacoNs from 'monaco-editor'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCodeEditorRegister, useCodeEditorItems, useCodeEditorRunning } from '@/contexts/useCodeEditorHooks'
import type { CodeEditorControl } from '@/contexts/CodeEditorContext'
import { runCode } from '@/lib/code-runner'
import { randomIdSegment } from '@/lib/secure-random'
import { cn } from '@/lib/utils'
import type { IdeAiPreset, IdeChatPayload, IdeReasoningMode, IdeChatMode } from '@/lib/jarvis-ide-chat-types'
import { ideFsRead, ideFsWrite, ideGit, ideJoinPath, ideRunCommand, ideWalkFiles } from '@/lib/jarvis-ide-bridge'
import type { JarvisIdeRunCommandResult } from '@/types/jarvis-ide'
import { fetchAgentBrowserHealth } from '@/lib/agent-browser-mcp'
import {
  fetchDigitalOceanModels,
  getDigitalOceanInferenceTokenFromSettings,
  type DigitalOceanModelOption,
} from '@/lib/digitalocean-api'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useDigitalOceanCatalogEnabled } from '@/hooks/useDigitalOceanCatalogEnabled'
import type { UserSettings } from '@/lib/types'
import { JarvisExplorerBadgeStrip } from '@/components/jarvis/JarvisExplorerBadgeStrip'
import {
  computeExplorerBadgesForFile,
  computeExplorerBadgesForWorkspaceRelPath,
  computeRepoLevelGitBadges,
  countProblemsForFile,
  parseGitLeftRightCount,
  parseGitStatusPorcelain,
  type GitPorcelainEntry,
  type JarvisExplorerBadgeId,
} from '@/lib/jarvis-explorer-badges'
import { analyzeMissingLogic, type MissingLogicDetectionId } from '@/lib/jarvis-missing-logic-detector'
import { runJarvisWorkspaceQuality } from '@/lib/jarvis-workspace-quality'
import { buildCodeEditorJarvisMenus } from '@/components/ide/jarvisIdeCodeEditorMenuFactory'
import type { InspectorAiRequest, InspectorChatTicket } from '@/browser/types-layout'
import { ToastHost } from '@/ui/toast/ToastHost'
import { showIdeToast } from '@/ui/toast/toast-helpers'

function buildInspectorChatPrompt(request: InspectorAiRequest): string {
  const { kind, node, source } = request
  let header = 'DOM Inspector request: suggest layout/CSS improvements for this element.'
  if (kind === 'explain-node') {
    header = 'DOM Inspector request: explain this element and how it fits into the layout.'
  } else if (kind === 'fix-attributes') {
    header = 'DOM Inspector request: suggest improvements to this element’s attributes and structure.'
  }

  const sourceLine = source
    ? `Source location: ${source.filePath} (marker: ${source.markerId})`
    : 'Source location: unknown (no data-j-source on this node).'

  const elementSummary = [
    `Tag: <${node.tagName.toLowerCase()}>`,
    node.id ? `id: ${node.id}` : null,
    node.classes?.length ? `classes: ${node.classes.join(' ')}` : null,
    node.attributes ? `attributes (JSON): ${JSON.stringify(node.attributes)}` : null,
    node.inlineStyle ? `inline style: ${node.inlineStyle}` : null,
    node.boundingRect ? `boundingRect: ${JSON.stringify(node.boundingRect)}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return `${header}\n\n${sourceLine}\n\nElement details:\n${elementSummary}\n\nPlease respond as an assistant helping improve this element in the codebase.`
}

function inspectorAiKindToPreset(kind: InspectorAiRequest['kind']): IdeAiPreset {
  if (kind === 'explain-node') return 'inspector_explain_node'
  if (kind === 'fix-attributes') return 'inspector_fix_attributes'
  return 'inspector_fix_layout'
}

interface CodeEditorModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Full Jarvis chat with tools; receives live IDE context (active file + source). */
  readonly ideChatOnSend?: (payload: IdeChatPayload) => Promise<{ content: string; reasoning?: string }>
  readonly onOpenAgentBrowser?: () => void
  /** When set (with monotonically increasing `nonce`), opens AI chat and sends an inspector-aware turn. */
  readonly inspectorChatTicket?: InspectorChatTicket | null
  readonly onInspectorChatConsumed?: () => void
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG — Languages, icons, extensions, themes, templates, snippets
   ═══════════════════════════════════════════════════════════════════════════ */

const MONACO_LANGS = [
  'javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown',
  'cpp', 'c', 'java', 'rust', 'sql', 'xml', 'php', 'go', 'ruby', 'swift',
  'kotlin', 'scala', 'r', 'shell', 'yaml', 'dockerfile', 'graphql', 'scss', 'less',
] as const

const LI: Record<string, string> = {
  python: '🐍', javascript: 'JS', typescript: 'TS', jsx: '⚛', tsx: '⚛',
  html: '🌐', css: '🎨', json: '{}', markdown: 'MD', rust: '🦀',
  cpp: 'C++', c: 'C', java: '☕', sql: '🗄', xml: '📄', php: '🐘',
  go: 'Go', ruby: '💎', swift: '🐦', kotlin: 'K', yaml: '📝',
  shell: '🖥', dockerfile: '🐳', graphql: 'GQL', r: 'R', scala: 'S', scss: '🎨', less: '🎨',
}

const EXT2LANG: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  html: 'html', htm: 'html', css: 'css', json: 'json', md: 'markdown',
  rs: 'rust', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', java: 'java',
  sql: 'sql', xml: 'xml', php: 'php', go: 'go', rb: 'ruby', swift: 'swift',
  kt: 'kotlin', scala: 'scala', r: 'r', sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml', graphql: 'graphql', gql: 'graphql', scss: 'scss', less: 'less',
}

const LANG2EXT: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts', html: 'html', css: 'css',
  json: 'json', markdown: 'md', rust: 'rs', cpp: 'cpp', c: 'c', java: 'java',
  sql: 'sql', xml: 'xml', php: 'php', go: 'go', ruby: 'rb', swift: 'swift',
  kotlin: 'kt', scala: 'scala', r: 'r', shell: 'sh', yaml: 'yml', graphql: 'graphql', scss: 'scss', less: 'less',
}

const RUNNABLE = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts'])
const PREVIEWABLE = new Set(['html', 'htm', 'markdown', 'md'])

function detectLang(f: string) { return EXT2LANG[f.split('.').pop()?.toLowerCase() || ''] || 'javascript' }
function getExt(l: string) { return LANG2EXT[l] || l }
function mLang(l: string) { const m: Record<string, string> = { jsx: 'javascript', tsx: 'typescript' }; return m[l] || l }

/* ── Themes ── */
interface ThemeDef { id: string; label: string; base: 'vs-dark' | 'vs' | 'hc-black'; colors: Record<string, string> }

const THEMES: ThemeDef[] = [
  { id: 'jarvis-dark', label: 'Jarvis Dark', base: 'vs-dark', colors: { 'editor.background': '#1e1e1e', 'editor.lineHighlightBackground': '#2a2d2e' } },
  { id: 'monokai', label: 'Monokai', base: 'vs-dark', colors: { 'editor.background': '#272822', 'editor.foreground': '#f8f8f2', 'editor.lineHighlightBackground': '#3e3d32' } },
  { id: 'dracula', label: 'Dracula', base: 'vs-dark', colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2', 'editor.lineHighlightBackground': '#44475a' } },
  { id: 'github-dark', label: 'GitHub Dark', base: 'vs-dark', colors: { 'editor.background': '#0d1117', 'editor.foreground': '#c9d1d9', 'editor.lineHighlightBackground': '#161b22' } },
  { id: 'one-dark', label: 'One Dark Pro', base: 'vs-dark', colors: { 'editor.background': '#282c34', 'editor.foreground': '#abb2bf', 'editor.lineHighlightBackground': '#2c313c' } },
  { id: 'solarized-dark', label: 'Solarized Dark', base: 'vs-dark', colors: { 'editor.background': '#002b36', 'editor.foreground': '#839496', 'editor.lineHighlightBackground': '#073642' } },
  { id: 'nord', label: 'Nord', base: 'vs-dark', colors: { 'editor.background': '#2e3440', 'editor.foreground': '#d8dee9', 'editor.lineHighlightBackground': '#3b4252' } },
  { id: 'cobalt2', label: 'Cobalt2', base: 'vs-dark', colors: { 'editor.background': '#193549', 'editor.foreground': '#e1efff', 'editor.lineHighlightBackground': '#1f4662' } },
  { id: 'vs-light', label: 'VS Light', base: 'vs', colors: {} },
  { id: 'hc-black', label: 'High Contrast', base: 'hc-black', colors: {} },
]

const FONT_FAMILIES = [
  "'Cascadia Code', Consolas, monospace",
  "'Fira Code', monospace",
  "'JetBrains Mono', monospace",
  "'Source Code Pro', monospace",
  "Consolas, monospace",
  "'Courier New', monospace",
  "'IBM Plex Mono', monospace",
  "'Ubuntu Mono', monospace",
]

/* ── Templates ── */
const FILE_TEMPLATES = [
  { name: 'HTML Page', filename: 'index.html', language: 'html', code: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Page</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; color: #333; }\n    h1 { color: #007acc; margin-bottom: 1rem; }\n    .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px; }\n    button { background: #007acc; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }\n    button:hover { background: #005f99; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>Hello World</h1>\n    <p>Start building your page here.</p>\n    <br>\n    <button onclick="alert(\'It works!\')">Click Me</button>\n  </div>\n  <script>\n    console.log("Page loaded!");\n  </script>\n</body>\n</html>' },
  { name: 'React Component', filename: 'Component.tsx', language: 'typescript', code: 'import React, { useState, useEffect } from "react";\n\ninterface Props {\n  title: string;\n  initialCount?: number;\n}\n\nexport function Component({ title, initialCount = 0 }: Props) {\n  const [count, setCount] = useState(initialCount);\n  const [items, setItems] = useState<string[]>([]);\n\n  useEffect(() => {\n    console.log(`Count changed to ${count}`);\n  }, [count]);\n\n  const addItem = () => {\n    setItems(prev => [...prev, `Item ${prev.length + 1}`]);\n  };\n\n  return (\n    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>\n      <h1>{title}</h1>\n      <p>Count: {count}</p>\n      <div style={{ display: "flex", gap: "8px", margin: "1rem 0" }}>\n        <button onClick={() => setCount(c => c - 1)}>-</button>\n        <button onClick={() => setCount(c => c + 1)}>+</button>\n        <button onClick={addItem}>Add Item</button>\n      </div>\n      <ul>\n        {items.map((item, i) => (\n          <li key={i}>{item}</li>\n        ))}\n      </ul>\n    </div>\n  );\n}' },
  { name: 'Python Script', filename: 'main.py', language: 'python', code: '"""Main script."""\nimport json\nfrom datetime import datetime\n\n\ndef main():\n    print("Hello, World!")\n    print(f"Current time: {datetime.now()}")\n    \n    data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\n    total = sum(data)\n    average = total / len(data)\n    even = [x for x in data if x % 2 == 0]\n    odd = [x for x in data if x % 2 != 0]\n    \n    result = {\n        "total": total,\n        "average": average,\n        "even_numbers": even,\n        "odd_numbers": odd,\n        "count": len(data),\n    }\n    \n    print(json.dumps(result, indent=2))\n\n\nif __name__ == "__main__":\n    main()' },
  { name: 'Express Server', filename: 'server.js', language: 'javascript', code: 'const express = require("express");\nconst app = express();\nconst PORT = 3000;\n\napp.use(express.json());\napp.use((req, res, next) => {\n  console.log(`${req.method} ${req.url}`);\n  next();\n});\n\nlet items = [\n  { id: 1, name: "Item 1", done: false },\n  { id: 2, name: "Item 2", done: true },\n];\n\napp.get("/", (req, res) => res.json({ message: "API running!", version: "1.0" }));\napp.get("/api/items", (req, res) => res.json({ items, total: items.length }));\napp.get("/api/items/:id", (req, res) => {\n  const item = items.find(i => i.id === parseInt(req.params.id));\n  item ? res.json(item) : res.status(404).json({ error: "Not found" });\n});\napp.post("/api/items", (req, res) => {\n  const item = { id: items.length + 1, name: req.body.name, done: false };\n  items.push(item);\n  res.status(201).json(item);\n});\napp.delete("/api/items/:id", (req, res) => {\n  items = items.filter(i => i.id !== parseInt(req.params.id));\n  res.json({ message: "Deleted" });\n});\n\napp.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));' },
  { name: 'CSS Stylesheet', filename: 'styles.css', language: 'css', code: ':root {\n  --primary: #007acc;\n  --primary-hover: #005f99;\n  --bg: #1e1e1e;\n  --surface: #252526;\n  --text: #cccccc;\n  --text-muted: #888888;\n  --border: #333333;\n  --radius: 8px;\n  --shadow: 0 2px 8px rgba(0,0,0,0.3);\n}\n\n* { margin: 0; padding: 0; box-sizing: border-box; }\n\nbody {\n  font-family: system-ui, -apple-system, sans-serif;\n  background: var(--bg);\n  color: var(--text);\n  line-height: 1.6;\n}\n\n.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }\n\n.card {\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: var(--radius);\n  padding: 1.5rem;\n  box-shadow: var(--shadow);\n}\n\n.btn {\n  display: inline-flex; align-items: center; gap: 6px;\n  padding: 8px 16px; border: none; border-radius: var(--radius);\n  background: var(--primary); color: white;\n  cursor: pointer; font-size: 14px; font-weight: 500;\n  transition: all 0.2s ease;\n}\n.btn:hover { background: var(--primary-hover); transform: translateY(-1px); }\n.btn:active { transform: translateY(0); }\n\n.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }\n\n.flex { display: flex; align-items: center; gap: 0.75rem; }\n\ninput, textarea {\n  width: 100%; padding: 8px 12px;\n  background: var(--bg); color: var(--text);\n  border: 1px solid var(--border); border-radius: var(--radius);\n  font-size: 14px; outline: none;\n}\ninput:focus, textarea:focus { border-color: var(--primary); }' },
  { name: 'JSON Config', filename: 'config.json', language: 'json', code: '{\n  "name": "my-project",\n  "version": "1.0.0",\n  "description": "A new project",\n  "author": "Developer",\n  "license": "MIT",\n  "settings": {\n    "theme": "dark",\n    "language": "en",\n    "debug": false,\n    "port": 3000\n  },\n  "database": {\n    "host": "localhost",\n    "port": 5432,\n    "name": "mydb"\n  },\n  "features": [\n    "authentication",\n    "api",\n    "dashboard"\n  ]\n}' },
  { name: 'Markdown README', filename: 'README.md', language: 'markdown', code: '# Project Name\n\nA brief description of your project.\n\n## Features\n\n- Feature 1 — does something cool\n- Feature 2 — does something else\n- Feature 3 — the best feature\n\n## Getting Started\n\n```bash\nnpm install\nnpm start\n```\n\n## API Reference\n\n| Endpoint | Method | Description |\n|----------|--------|-------------|\n| `/api/items` | GET | Get all items |\n| `/api/items/:id` | GET | Get item by ID |\n| `/api/items` | POST | Create new item |\n| `/api/items/:id` | DELETE | Delete an item |\n\n## Environment Variables\n\n| Variable | Description | Default |\n|----------|-------------|---------|\n| `PORT` | Server port | `3000` |\n| `DB_URL` | Database URL | `localhost` |\n\n## Contributing\n\n1. Fork the repository\n2. Create your feature branch (`git checkout -b feature/amazing`)\n3. Commit your changes (`git commit -m "Add amazing feature"`)\n4. Push to the branch (`git push origin feature/amazing`)\n5. Open a Pull Request\n\n## License\n\nMIT' },
  { name: 'Python Flask API', filename: 'app.py', language: 'python', code: 'from flask import Flask, jsonify, request\nfrom functools import wraps\n\napp = Flask(__name__)\n\nitems = [\n    {"id": 1, "name": "Item 1", "price": 9.99},\n    {"id": 2, "name": "Item 2", "price": 19.99},\n]\n\ndef validate_json(f):\n    @wraps(f)\n    def decorated(*args, **kwargs):\n        if not request.is_json:\n            return jsonify({"error": "Content-Type must be application/json"}), 400\n        return f(*args, **kwargs)\n    return decorated\n\n@app.route("/")\ndef index():\n    return jsonify({"message": "Flask API running!", "version": "1.0"})\n\n@app.route("/api/items")\ndef get_items():\n    return jsonify({"items": items, "total": len(items)})\n\n@app.route("/api/items/<int:item_id>")\ndef get_item(item_id):\n    item = next((i for i in items if i["id"] == item_id), None)\n    if not item:\n        return jsonify({"error": "Not found"}), 404\n    return jsonify(item)\n\n@app.route("/api/items", methods=["POST"])\n@validate_json\ndef add_item():\n    data = request.get_json()\n    new_item = {"id": len(items) + 1, "name": data["name"], "price": data.get("price", 0)}\n    items.append(new_item)\n    return jsonify(new_item), 201\n\n@app.route("/api/items/<int:item_id>", methods=["DELETE"])\ndef delete_item(item_id):\n    global items\n    items = [i for i in items if i["id"] != item_id]\n    return jsonify({"message": "Deleted"})\n\nif __name__ == "__main__":\n    app.run(debug=True, port=5000)' },
  { name: 'TypeScript Interface', filename: 'types.ts', language: 'typescript', code: 'export interface User {\n  id: string;\n  name: string;\n  email: string;\n  role: "admin" | "user" | "moderator";\n  createdAt: Date;\n  updatedAt: Date;\n}\n\nexport interface ApiResponse<T> {\n  data: T;\n  success: boolean;\n  message?: string;\n  pagination?: {\n    page: number;\n    limit: number;\n    total: number;\n    totalPages: number;\n  };\n}\n\nexport interface Config {\n  apiUrl: string;\n  timeout: number;\n  retries: number;\n  debug: boolean;\n}\n\nexport type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";\n\nexport async function fetchApi<T>(\n  url: string,\n  method: HttpMethod = "GET",\n  body?: unknown\n): Promise<ApiResponse<T>> {\n  const response = await fetch(url, {\n    method,\n    headers: { "Content-Type": "application/json" },\n    body: body ? JSON.stringify(body) : undefined,\n  });\n  return response.json();\n}' },
  { name: 'Tailwind Component', filename: 'Button.tsx', language: 'typescript', code: 'import React from "react";\n\ntype Variant = "primary" | "secondary" | "danger" | "ghost";\ntype Size = "sm" | "md" | "lg";\n\ninterface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: Variant;\n  size?: Size;\n  loading?: boolean;\n  icon?: React.ReactNode;\n}\n\nconst variants: Record<Variant, string> = {\n  primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",\n  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400",\n  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",\n  ghost: "bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200",\n};\n\nconst sizes: Record<Size, string> = {\n  sm: "px-3 py-1.5 text-sm",\n  md: "px-4 py-2 text-base",\n  lg: "px-6 py-3 text-lg",\n};\n\nexport function Button({\n  variant = "primary",\n  size = "md",\n  loading = false,\n  icon,\n  children,\n  className = "",\n  disabled,\n  ...props\n}: ButtonProps) {\n  return (\n    <button\n      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium\n        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed\n        ${variants[variant]} ${sizes[size]} ${className}`}\n      disabled={disabled || loading}\n      {...props}\n    >\n      {loading ? (\n        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">\n          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"\n            fill="none" opacity="0.25" />\n          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />\n        </svg>\n      ) : icon}\n      {children}\n    </button>\n  );\n}' },
]

/* ── Snippets ── */
function registerSnippets(m: Monaco) {
  const mkSnip = (label: string, insert: string, doc: string, range: monacoNs.IRange) => ({
    label, kind: m.languages.CompletionItemKind.Snippet,
    insertText: insert, insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: doc, range,
  })
  const provider = (lang: string, snips: Array<[string, string, string]>) => {
    m.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model: { getWordUntilPosition: (position: monacoNs.IPosition) => { startColumn: number; endColumn: number } }, pos: monacoNs.IPosition) => {
        const w = model.getWordUntilPosition(pos)
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn } as monacoNs.IRange
        return { suggestions: snips.map(([l, i, d]) => mkSnip(l, i, d, range)) }
      },
    })
  }
  provider('javascript', [
    ['log', 'console.log(${1:value});', 'Console log'],
    ['warn', 'console.warn(${1:value});', 'Console warn'],
    ['error', 'console.error(${1:value});', 'Console error'],
    ['fn', 'function ${1:name}(${2:params}) {\n\t${3}\n}', 'Function'],
    ['afn', 'const ${1:name} = async (${2:params}) => {\n\t${3}\n};', 'Async arrow fn'],
    ['arrow', 'const ${1:name} = (${2:params}) => ${3};', 'Arrow fn'],
    ['iife', '(async () => {\n\t${1}\n})();', 'IIFE'],
    ['trycatch', 'try {\n\t${1}\n} catch (${2:error}) {\n\tconsole.error(${2:error});\n}', 'Try-catch'],
    ['tryfinally', 'try {\n\t${1}\n} catch (${2:error}) {\n\tconsole.error(${2:error});\n} finally {\n\t${3}\n}', 'Try-catch-finally'],
    ['forof', 'for (const ${1:item} of ${2:iterable}) {\n\t${3}\n}', 'For-of'],
    ['forin', 'for (const ${1:key} in ${2:object}) {\n\t${3}\n}', 'For-in'],
    ['forloop', 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t${3}\n}', 'For loop'],
    ['while', 'while (${1:condition}) {\n\t${2}\n}', 'While loop'],
    ['map', '${1:array}.map((${2:item}) => {\n\t${3}\n})', 'Array map'],
    ['filter', '${1:array}.filter((${2:item}) => ${3:condition})', 'Array filter'],
    ['reduce', '${1:array}.reduce((${2:acc}, ${3:item}) => {\n\t${4}\n}, ${5:initial})', 'Array reduce'],
    ['find', '${1:array}.find((${2:item}) => ${3:condition})', 'Array find'],
    ['fetch', 'const response = await fetch("${1:url}");\nconst data = await response.json();\nconsole.log(data);', 'Fetch API'],
    ['class', 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3}\n\t}\n\n\t${4:method}() {\n\t\t${5}\n\t}\n}', 'Class'],
    ['promise', 'new Promise((resolve, reject) => {\n\t${1}\n})', 'Promise'],
    ['settimeout', 'setTimeout(() => {\n\t${1}\n}, ${2:1000});', 'setTimeout'],
    ['setinterval', 'setInterval(() => {\n\t${1}\n}, ${2:1000});', 'setInterval'],
    ['destructure', 'const { ${1:prop} } = ${2:object};', 'Destructure'],
    ['ternary', '${1:condition} ? ${2:ifTrue} : ${3:ifFalse}', 'Ternary'],
    ['switch', 'switch (${1:key}) {\n\tcase ${2:value}:\n\t\t${3}\n\t\tbreak;\n\tdefault:\n\t\t${4}\n}', 'Switch'],
    ['import', 'import { ${2:module} } from "${1:package}";', 'Import'],
    ['export', 'export { ${1:module} };', 'Export'],
    ['exportdefault', 'export default ${1:value};', 'Export default'],
  ])
  provider('typescript', [
    ['interface', 'interface ${1:Name} {\n\t${2:prop}: ${3:type};\n}', 'Interface'],
    ['type', 'type ${1:Name} = ${2:type};', 'Type alias'],
    ['enum', 'enum ${1:Name} {\n\t${2:Value},\n}', 'Enum'],
    ['generic', 'function ${1:name}<${2:T}>(${3:param}: ${2:T}): ${2:T} {\n\t${4}\n}', 'Generic fn'],
    ['asyncfn', 'async function ${1:name}(${2:params}): Promise<${3:void}> {\n\t${4}\n}', 'Async function'],
    ['readonly', 'readonly ${1:prop}: ${2:type};', 'Readonly prop'],
    ['partial', 'Partial<${1:Type}>', 'Partial'],
    ['record', 'Record<${1:string}, ${2:unknown}>', 'Record'],
    ['usestate', 'const [${1:state}, set${2:State}] = useState<${3:type}>(${4:initial});', 'useState'],
    ['useeffect', 'useEffect(() => {\n\t${1}\n\treturn () => {\n\t\t${2}\n\t};\n}, [${3}]);', 'useEffect'],
    ['usememo', 'const ${1:value} = useMemo(() => {\n\t${2}\n}, [${3}]);', 'useMemo'],
    ['usecallback', 'const ${1:fn} = useCallback((${2:params}) => {\n\t${3}\n}, [${4}]);', 'useCallback'],
    ['useref', 'const ${1:ref} = useRef<${2:HTMLDivElement}>(${3:null});', 'useRef'],
  ])
  provider('python', [
    ['def', 'def ${1:name}(${2:params}):\n\t${3:pass}', 'Function'],
    ['adef', 'async def ${1:name}(${2:params}):\n\t${3:pass}', 'Async function'],
    ['class', 'class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}\n\n\tdef ${4:method}(self):\n\t\t${5:pass}', 'Class'],
    ['dataclass', '@dataclass\nclass ${1:Name}:\n\t${2:field}: ${3:str}\n\t${4:field2}: ${5:int} = ${6:0}', 'Dataclass'],
    ['ifmain', 'if __name__ == "__main__":\n\t${1:main()}', 'Main guard'],
    ['tryexcept', 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\tprint(f"Error: {e}")', 'Try-except'],
    ['with', 'with open("${1:file}", "${2:r}") as f:\n\t${3:data = f.read()}', 'With open'],
    ['listcomp', '[${1:expr} for ${2:item} in ${3:iterable}]', 'List comprehension'],
    ['dictcomp', '{${1:key}: ${2:value} for ${3:item} in ${4:iterable}}', 'Dict comprehension'],
    ['lambda', 'lambda ${1:x}: ${2:x}', 'Lambda'],
    ['fstring', 'f"${1:text} {${2:var}}"', 'F-string'],
    ['decorator', 'def ${1:decorator}(func):\n\t@wraps(func)\n\tdef wrapper(*args, **kwargs):\n\t\t${2}\n\t\treturn func(*args, **kwargs)\n\treturn wrapper', 'Decorator'],
    ['generator', 'def ${1:gen}(${2:params}):\n\tfor ${3:item} in ${4:iterable}:\n\t\tyield ${3:item}', 'Generator'],
    ['contextmanager', '@contextmanager\ndef ${1:name}(${2:params}):\n\t${3:setup}\n\ttry:\n\t\tyield ${4}\n\tfinally:\n\t\t${5:cleanup}', 'Context manager'],
  ])
  provider('html', [
    ['!html5', '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n\t<style>\n\t\t${2}\n\t</style>\n</head>\n<body>\n\t${3}\n\t<script>\n\t\t${4}\n\t</script>\n</body>\n</html>', 'HTML5 boilerplate'],
    ['div', '<div class="${1:class}">\n\t${2}\n</div>', 'Div'],
    ['section', '<section id="${1:id}">\n\t${2}\n</section>', 'Section'],
    ['link:css', '<link rel="stylesheet" href="${1:styles.css}">', 'CSS link'],
    ['script:src', '<script src="${1:script.js}"></script>', 'Script'],
    ['img', '<img src="${1:src}" alt="${2:alt}" />', 'Image'],
    ['a', '<a href="${1:url}">${2:text}</a>', 'Anchor'],
    ['ul', '<ul>\n\t<li>${1}</li>\n\t<li>${2}</li>\n</ul>', 'Unordered list'],
    ['form', '<form action="${1:url}" method="${2:post}">\n\t<label for="${3:input}">${4:Label}</label>\n\t<input type="${5:text}" id="${3:input}" name="${3:input}" />\n\t<button type="submit">Submit</button>\n</form>', 'Form'],
    ['table', '<table>\n\t<thead>\n\t\t<tr><th>${1:Header}</th></tr>\n\t</thead>\n\t<tbody>\n\t\t<tr><td>${2:Data}</td></tr>\n\t</tbody>\n</table>', 'Table'],
    ['meta:og', '<meta property="og:title" content="${1:title}" />\n<meta property="og:description" content="${2:description}" />\n<meta property="og:image" content="${3:image}" />', 'Open Graph meta'],
  ])
  provider('css', [
    ['flex', 'display: flex;\nalign-items: ${1:center};\njustify-content: ${2:center};\ngap: ${3:1rem};', 'Flexbox'],
    ['grid', 'display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);\ngap: ${2:1rem};', 'Grid'],
    ['center', 'display: flex;\nalign-items: center;\njustify-content: center;', 'Center'],
    ['transition', 'transition: ${1:all} ${2:0.3s} ${3:ease};', 'Transition'],
    ['animation', '@keyframes ${1:name} {\n\tfrom { ${2} }\n\tto { ${3} }\n}\n\n.${4:element} {\n\tanimation: ${1:name} ${5:1s} ${6:ease} ${7:infinite};\n}', 'Animation'],
    ['media', '@media (max-width: ${1:768px}) {\n\t${2}\n}', 'Media query'],
    ['var', '--${1:name}: ${2:value};', 'CSS variable'],
    ['shadow', 'box-shadow: ${1:0} ${2:2px} ${3:8px} rgba(0, 0, 0, ${4:0.1});', 'Box shadow'],
    ['gradient', 'background: linear-gradient(${1:135deg}, ${2:#667eea} 0%, ${3:#764ba2} 100%);', 'Gradient'],
    ['reset', '* { margin: 0; padding: 0; box-sizing: border-box; }', 'Reset'],
    ['clamp', 'font-size: clamp(${1:1rem}, ${2:2.5vw}, ${3:2rem});', 'Clamp'],
    ['scrollbar', '::-webkit-scrollbar { width: ${1:8px}; }\n::-webkit-scrollbar-track { background: ${2:#f1f1f1}; }\n::-webkit-scrollbar-thumb { background: ${3:#888}; border-radius: 4px; }\n::-webkit-scrollbar-thumb:hover { background: ${4:#555}; }', 'Custom scrollbar'],
  ])
}

/* ── Problem parsing ── */
interface Problem { line: number; column: number; severity: 'error' | 'warning' | 'info' | 'hint'; message: string; source: string }
function parseProblems(result: { stdout: string; stderr: string; error?: string } | null, filename: string): Problem[] {
  if (!result) return []
  const problems: Problem[] = []
  const text = [result.error, result.stderr].filter(Boolean).join('\n')
  const re = /(?:line |Line |Ln |:)(\d+)(?::(\d+))?/gi
  let m
  while ((m = re.exec(text)) !== null) {
    problems.push({ line: Number.parseInt(m[1]), column: m[2] ? Number.parseInt(m[2]) : 1, severity: 'error', message: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 80).trim(), source: filename })
  }
  if (problems.length === 0 && (result.error || result.stderr)) {
    problems.push({ line: 1, column: 1, severity: 'error', message: (result.error || result.stderr) ?? '', source: filename })
  }
  return problems
}

/* ── Workspace explorer tree (folder hierarchy from relative paths) ── */
interface WorkspaceTreeNode {
  segment: string
  relPath: string
  isFile: boolean
  children: WorkspaceTreeNode[]
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- trie-based tree builder with unix/windows path normalization; splitting would distribute shared mutable state
function buildWorkspaceTreeFromRelPaths(relFiles: readonly string[]): WorkspaceTreeNode[] { // NOSONAR tree normalization intentionally kept local for deterministic explorer rendering
  type Mutable = { seg: string; rel: string; file: boolean; kids: Map<string, Mutable> }
  const synthetic: Mutable = { seg: '', rel: '', file: false, kids: new Map() }

  for (const rel of relFiles) {
    const parts = rel.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let cur = synthetic
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (!cur.kids.has(part)) {
        cur.kids.set(part, { seg: part, rel: isLast ? rel : '', file: isLast, kids: new Map() })
      }
      const node = cur.kids.get(part)
      if (!node) continue
      if (isLast) {
        node.file = true
        node.rel = rel
      } else {
        node.file = false
      }
      cur = node
    }
  }

  const sortKids = (m: Map<string, Mutable>): WorkspaceTreeNode[] => {
    const arr = [...m.values()]
    arr.sort((a, b) => {
      if (a.file !== b.file) return a.file ? 1 : -1
      return a.seg.localeCompare(b.seg, undefined, { sensitivity: 'base' })
    })
    return arr.map((n) => ({
      segment: n.seg,
      relPath: n.rel,
      isFile: n.file,
      children: n.file ? [] : sortKids(n.kids),
    }))
  }

  return sortKids(synthetic.kids)
}

interface WorkspaceRelPathTreeProps {
  readonly nodes: WorkspaceTreeNode[]
  readonly depth: number
  readonly folderPrefix: string
  readonly expandedDirs: ReadonlySet<string>
  readonly onToggleDir: (folderKey: string) => void
  readonly tc: string
  readonly fileBadges: ReadonlyMap<string, JarvisExplorerBadgeId[]>
  readonly onOpenRelPath: (rel: string) => void
  readonly onDeleteRelPath: (rel: string) => void
}

function WorkspaceRelPathTree({
  nodes,
  depth,
  folderPrefix,
  expandedDirs,
  onToggleDir,
  tc,
  fileBadges,
  onOpenRelPath,
  onDeleteRelPath,
}: Readonly<WorkspaceRelPathTreeProps>) {
  return (
    <>
      {nodes.map((node) => {
        if (!node.isFile) {
          const folderKey = `${folderPrefix}${node.segment}`
          const expanded = expandedDirs.has(folderKey)
          const rowPad = Math.min(depth, 14) * 10 + 4
          return (
            <div key={folderKey} className="select-none">
              <button
                type="button"
                className="w-full flex items-center gap-1 py-0.5 text-[11px] rounded-sm hover:bg-white/5 text-left font-mono"
                style={{ paddingLeft: rowPad, color: `${tc}95` }}
                onClick={() => onToggleDir(folderKey)}
              >
                <span className="w-3 flex-shrink-0 text-center">{expanded ? '▼' : '▶'}</span>
                <span className="opacity-80 flex-shrink-0">📁</span>
                <span className="truncate">{node.segment}</span>
              </button>
              {expanded && node.children.length > 0 && (
                <WorkspaceRelPathTree
                  nodes={node.children}
                  depth={depth + 1}
                  folderPrefix={`${folderKey}/`}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                  tc={tc}
                  fileBadges={fileBadges}
                  onOpenRelPath={onOpenRelPath}
                  onDeleteRelPath={onDeleteRelPath}
                />
              )}
            </div>
          )
        }
        const rel = node.relPath
        const ids = fileBadges.get(rel) ?? []
        const rowPad = Math.min(depth, 14) * 10 + 4
        return (
          <div
            key={rel}
            className="group flex items-center gap-1 py-0.5 text-[11px] rounded-sm hover:bg-white/5 font-mono"
            style={{ paddingLeft: rowPad, color: `${tc}90` }}
            title={rel}
          >
            <button type="button" className="truncate min-w-0 flex-1 text-left" onClick={() => onOpenRelPath(rel)}>
              {node.segment}
            </button>
            <JarvisExplorerBadgeStrip ids={ids} tc={tc} className="normal-case flex-shrink-0" />
            <button
              type="button"
              className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-[10px] flex-shrink-0 px-0.5"
              title="Delete file"
              onClick={() => onDeleteRelPath(rel)}
            >
              🗑
            </button>
          </div>
        )
      })}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN IDE COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

// eslint-disable-next-line sonarjs/cognitive-complexity -- large IDE component with coordinated panel state; splitting into sub-components is tracked as a future refactor
export function CodeEditorModal({ // NOSONAR legacy IDE shell intentionally centralizes UI orchestration state
  open,
  onOpenChange,
  ideChatOnSend,
  onOpenAgentBrowser,
  inspectorChatTicket,
  onInspectorChatConsumed,
}: CodeEditorModalProps) {
  const { register, unregister } = useCodeEditorRegister()
  const { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId } = useCodeEditorItems()
  const { running, setRunning, runResult, setRunResult } = useCodeEditorRunning()

  // Editor state
  const [editedCode, setEditedCode] = useState('')
  const [editedLang, setEditedLang] = useState('javascript')
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [selectionInfo, setSelectionInfo] = useState('')
  const [modified, setModified] = useState(false)
  const [wordCount, setWordCount] = useState({ words: 0, lines: 0, chars: 0 })
  const [eol, setEol] = useState<'LF' | 'CRLF'>('LF')

  // Panels
  const [showExplorer, setShowExplorer] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showProblems, setShowProblems] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showIdeChat, setShowIdeChat] = useState(true)
  const [ideChatMessages, setIdeChatMessages] = useState<IdeChatMessage[]>([])
  const [ideChatLoading, setIdeChatLoading] = useState(false)
  const [ideChatMode, setIdeChatMode] = useState<IdeChatMode>('chat')

  // Autopilot mode
  const [autopilotOn, setAutopilotOn] = useState(false)
  const [autopilotStatus, setAutopilotStatus] = useState<'idle' | 'running' | 'paused'>('idle')
  const autopilotAbortRef = useRef<AbortController | null>(null)

  // Editor settings
  const [showMinimap, setShowMinimap] = useState(true)
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('off')
  const [fontSize, setFontSize] = useState(14)
  const [tabSize, setTabSize] = useState(2)
  const [theme, setTheme] = useState('jarvis-dark')
  const [autoSave, setAutoSave] = useState(true)
  const [renderWhitespace, setRenderWhitespace] = useState<'none' | 'selection' | 'all'>('selection')
  const [lineHeight, setLineHeight] = useState(20)
  const [cursorStyle, setCursorStyle] = useState<'line' | 'block' | 'underline'>('line')
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0])
  const [fontLigatures, setFontLigatures] = useState(true)
  const [bracketPairColorization, setBracketPairColorization] = useState(true)
  const [stickyScroll, setStickyScroll] = useState(true)
  const [rulers, setRulers] = useState(true)
  const [lineNumbers, setLineNumbers] = useState<'on' | 'off' | 'relative'>('on')

  // Diff & split
  const [diffMode, setDiffMode] = useState(false)
  const [diffTargetId, setDiffTargetId] = useState<string | null>(null)
  const [splitEditor, setSplitEditor] = useState(false)
  const [splitFileId, setSplitFileId] = useState<string | null>(null)

  // Terminal & problems
  const [terminalHistory, setTerminalHistory] = useState<Array<{ type: 'stdout' | 'stderr' | 'error' | 'info'; text: string; time: number }>>([])
  const [terminalShellBusy, setTerminalShellBusy] = useState(false)
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalSessionId, setTerminalSessionId] = useState<number | null>(null)
  const [terminalCwd, setTerminalCwd] = useState<string | null>(null)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1)
  const [problems, setProblems] = useState<Problem[]>([])
  const [qualityProblems, setQualityProblems] = useState<Problem[]>([])
  const [qualityLoading, setQualityLoading] = useState(false)
  const [bottomTab, setBottomTab] = useState<'terminal' | 'problems' | 'output' | 'debug' | 'git' | 'extensions' | 'run'>('terminal')

  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [workspacePackageJson, setWorkspacePackageJson] = useState<string | null>(null)
  const [workspaceTsconfigJson, setWorkspaceTsconfigJson] = useState<string | null>(null)
  const [workspaceRelFiles, setWorkspaceRelFiles] = useState<string[]>([])
  const [showSourceControl, setShowSourceControl] = useState(false)
  const [showRunDebug, setShowRunDebug] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)
  const [showOutputTab, setShowOutputTab] = useState(false)
  const [showDebugConsole, setShowDebugConsole] = useState(false)
  const [showMenuBar, setShowMenuBar] = useState(true)
  const [showActivityBar, setShowActivityBar] = useState(true)
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [problemIndex, setProblemIndex] = useState(0)
  const [agentBridgeOk, setAgentBridgeOk] = useState(false)
  const [debuggingActive, setDebuggingActive] = useState(false)
  const [gitOutput, setGitOutput] = useState('')
  const [gitLoading, setGitLoading] = useState(false)
  const [gitPorcelainMap, setGitPorcelainMap] = useState<Map<string, GitPorcelainEntry>>(() => new Map())
  const [gitRemoteCounts, setGitRemoteCounts] = useState<{ ahead: number; behind: number } | null>(null)
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(true)
  const [workspaceWalkLoading, setWorkspaceWalkLoading] = useState(false)
  const [explorerExpandedDirs, setExplorerExpandedDirs] = useState<Set<string>>(() => new Set())
  const [extensionsPackageJson, setExtensionsPackageJson] = useState<string | null>(null)
  const [ideChatModel, setIdeChatModel] = useState('gpt-4o-mini')
  const [ideTemp, setIdeTemp] = useState(0.7)
  const [ideMaxTok, setIdeMaxTok] = useState(4096)
  const [ideReasoning, setIdeReasoning] = useState<IdeReasoningMode>('auto')
  const [debugLogLines, setDebugLogLines] = useState<string[]>([])
  const [doModels, setDoModels] = useState<DigitalOceanModelOption[]>([])

  const [userSettings] = useLocalStorage<UserSettings>('user-settings', { apiKeys: {}, oauthTokens: {}, oauthClientIds: {}, connectedServices: { googledrive: false, onedrive: false, github: false, dropbox: false, spotify: false } })
  const doToken = getDigitalOceanInferenceTokenFromSettings(userSettings ?? undefined)
  const useDigitalOcean = useDigitalOceanCatalogEnabled(userSettings ?? undefined)

  useEffect(() => {
    if (!useDigitalOcean) { setDoModels([]); return }
    let cancelled = false
    fetchDigitalOceanModels(doToken || undefined)
      .then((list) => { 
        if (!cancelled) {
          setDoModels(list)
          if (list.length === 0) {
            console.warn('[CodeEditorModal] No DigitalOcean models available')
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDoModels([])
          console.warn('[CodeEditorModal] DigitalOcean model catalog unavailable, using fallback', error)
        }
      })
    return () => { cancelled = true }
  }, [useDigitalOcean, doToken])

  const ideChatModelOptions = useMemo(() => {
    const base = [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ]
    const doItems = doModels.map((m) => ({ id: `do:${m.id}`, label: m.name }))
    return [...base, ...doItems]
  }, [doModels])

  const hasElectronFs = globalThis.window?.jarvisIde !== undefined

  useEffect(() => {
    workspaceRootRef.current = workspaceRoot
  }, [workspaceRoot])

  useEffect(() => {
    if (!workspaceRoot) {
      setWorkspaceWalkLoading(false)
      setWorkspaceRelFiles([])
      return
    }
    if (!open || !hasElectronFs) {
      setWorkspaceWalkLoading(false)
      return
    }
    let cancelled = false
    setWorkspaceWalkLoading(true)
    ;(async () => {
      try {
        const rel = await ideWalkFiles(workspaceRoot)
        if (!cancelled) setWorkspaceRelFiles(rel.slice(0, 2000))
      } catch {
        if (!cancelled) setWorkspaceRelFiles([])
      } finally {
        if (!cancelled) setWorkspaceWalkLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, workspaceRoot, hasElectronFs])

  useEffect(() => {
    const dirs = new Set<string>()
    for (const rel of workspaceRelFiles) {
      const parts = rel.split('/').filter(Boolean)
      for (let i = 0; i < parts.length - 1; i++) {
        dirs.add(parts.slice(0, i + 1).join('/'))
      }
    }
    setExplorerExpandedDirs(dirs)
  }, [workspaceRelFiles])

  useEffect(() => {
    setQualityProblems([])
    if (!workspaceRoot || !hasElectronFs) {
      setWorkspacePackageJson(null)
      setWorkspaceTsconfigJson(null)
      return
    }
    ;(async () => {
      const pj = await ideFsRead(ideJoinPath(workspaceRoot, 'package.json'))
      setWorkspacePackageJson(pj.ok && pj.content ? pj.content : null)
      const ts = await ideFsRead(ideJoinPath(workspaceRoot, 'tsconfig.json'))
      setWorkspaceTsconfigJson(ts.ok && ts.content ? ts.content : null)
    })().catch(() => {})
  }, [workspaceRoot, hasElectronFs])

  // Auto-create a persistent terminal session
  const terminalSessionRef = useRef<number | null>(null)

  useEffect(() => {
    if (!hasElectronFs || !open) return
    const ide = (globalThis as unknown as { jarvisIde: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
    if (!ide.terminalCreate) return

    let cancelled = false

    const initSession = async () => {
      const existing = await ide.terminalList()
      if (cancelled) return
      if (existing.length > 0 && existing[0].alive) {
        setTerminalSessionId(existing[0].id)
        setTerminalCwd(existing[0].cwd)
        terminalSessionRef.current = existing[0].id
        return
      }
      const s = await ide.terminalCreate({ cwd: workspaceRoot || undefined })
      if (cancelled) return
      setTerminalSessionId(s.id)
      setTerminalCwd(s.cwd)
      terminalSessionRef.current = s.id
    }

    initSession()

    const offData = ide.onTerminalData((evt) => {
      if (cancelled) return
      const t = evt.stream === 'stderr' ? 'stderr' : 'stdout'
      setTerminalHistory((prev) => [...prev, { type: t, text: evt.data, time: Date.now() }])
    })

    const offExit = ide.onTerminalExit((evt) => {
      if (cancelled) return
      setTerminalHistory((prev) => [...prev, { type: 'info', text: `[Shell exited: ${evt.exitCode ?? 'unknown'}]`, time: Date.now() }])
      setTerminalSessionId(null)
      terminalSessionRef.current = null
    })

    return () => {
      cancelled = true
      offData()
      offExit()
    }
  }, [hasElectronFs, open, workspaceRoot])

  // Dialogs
  const [newFileDialog, setNewFileDialog] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [renameDialog, setRenameDialog] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [templateDialog, setTemplateDialog] = useState(false)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ fileId: string; filename: string; line: number; text: string }>>([])

  // Outline
  const [outlineSymbols, setOutlineSymbols] = useState<Array<{ name: string; kind: string; line: number }>>([])

  // Pinned tabs
  const [pinnedTabs, setPinnedTabs] = useState<Set<string>>(new Set())

  // Refs
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const workspaceRootRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedCodeRef = useRef('')
  const ideContextBlockRef = useRef('')

  const activeItem = useMemo(() => items.find(i => i.id === activeItemId), [items, activeItemId])
  const splitFile = useMemo(() => splitFileId ? items.find(i => i.id === splitFileId) : null, [items, splitFileId])

  useEffect(() => {
    const fn = activeItem?.filename || 'untitled'
    const lang = editedLang
    const code = editedCode
    const max = 12000
    const snippet =
      code.length > max ? `${code.slice(0, max)}\n\n[... truncated ${String(code.length - max)} chars]` : code
    const openList = items.map((i) => i.filename || i.language || 'file').join(', ')
    ideContextBlockRef.current = `Active file: ${fn}\nLanguage: ${lang}\nOpen files (${String(items.length)}): ${openList}\n\n--- Source ---\n\n${snippet}`
  }, [activeItem, editedLang, editedCode, items])

  // Sync editor on active item change
  useEffect(() => {
    if (activeItem) {
      setEditedCode(activeItem.code)
      setEditedLang(activeItem.language)
      savedCodeRef.current = activeItem.code
      setModified(false)
      setRunResult(null)
    }
  }, [activeItem, setRunResult])

  // Track modifications
  useEffect(() => { setModified(editedCode !== savedCodeRef.current) }, [editedCode])

  // Word count
  useEffect(() => {
    const lines = editedCode.split('\n')
    setWordCount({ words: editedCode.trim() ? editedCode.trim().split(/\s+/).length : 0, lines: lines.length, chars: editedCode.length })
    setEol(editedCode.includes('\r\n') ? 'CRLF' : 'LF')
  }, [editedCode])

  // Auto-save
  useEffect(() => {
    if (!autoSave || !activeItemId) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      updateItem(activeItemId, { code: editedCode })
      savedCodeRef.current = editedCode
      setModified(false)
      const item = itemsRef.current.find((i) => i.id === activeItemId)
      if (item?.diskPath && globalThis.window?.jarvisIde) {
        ideFsWrite(item.diskPath, editedCode).then((r) => {
          if (!r.ok) console.warn('Auto-save disk:', r.error)
        }).catch(() => {})
      }
    }, 1000)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [editedCode, autoSave, activeItemId, updateItem])

  // Automation refs
  const itemsRef = useRef(items); itemsRef.current = items
  const activeItemIdRef = useRef(activeItemId); activeItemIdRef.current = activeItemId
  const editedCodeRef = useRef(editedCode); editedCodeRef.current = editedCode
  const editedLangRef = useRef(editedLang); editedLangRef.current = editedLang
  const runResultRef = useRef(runResult); runResultRef.current = runResult
  const themeRef = useRef(theme); themeRef.current = theme
  const fontSizeRef = useRef(fontSize); fontSizeRef.current = fontSize
  const tabSizeRef = useRef(tabSize); tabSizeRef.current = tabSize
  const wordWrapRef = useRef(wordWrap); wordWrapRef.current = wordWrap
  const showMinimapRef = useRef(showMinimap); showMinimapRef.current = showMinimap
  const autoSaveRef = useRef(autoSave); autoSaveRef.current = autoSave

  const missingLogicAnalysis = useMemo(() => {
    const ctx = {
      workspaceRelFiles,
      workspaceRoot,
      packageJsonContent: workspacePackageJson,
      tsconfigContent: workspaceTsconfigJson,
    }
    const byFile = new Map<string, MissingLogicDetectionId[]>()
    const logicProblems: Problem[] = []
    for (const item of items) {
      const code = item.id === activeItemId ? editedCode : item.code
      const issues = analyzeMissingLogic(code, item.filename, item.language, ctx)
      byFile.set(
        item.id,
        issues.map((x) => x.id)
      )
      const source = item.filename || 'untitled'
      for (const iss of issues) {
        logicProblems.push({
          line: iss.line ?? 1,
          column: 1,
          severity: 'warning',
          message: `[${iss.id}] ${iss.message}`,
          source,
        })
      }
    }
    return { byFile, logicProblems }
  }, [items, editedCode, activeItemId, workspaceRelFiles, workspaceRoot, workspacePackageJson, workspaceTsconfigJson])

  const displayProblems = useMemo(
    () => [...missingLogicAnalysis.logicProblems, ...problems, ...qualityProblems],
    [missingLogicAnalysis.logicProblems, problems, qualityProblems]
  )

  const problemsRef = useRef(displayProblems)
  problemsRef.current = displayProblems

  const terminalHistoryRef = useRef(terminalHistory); terminalHistoryRef.current = terminalHistory
  const outlineSymbolsRef = useRef(outlineSymbols); outlineSymbolsRef.current = outlineSymbols

  const logToTerminal = useCallback((type: 'stdout' | 'stderr' | 'error' | 'info', text: string) => {
    setTerminalHistory((prev) => [...prev, { type, text, time: Date.now() }])
  }, [])

  const handleRunWorkspaceQuality = useCallback(async () => {
    if (!workspaceRoot || !hasElectronFs) {
      toast.error('Open a workspace folder in the desktop app first.')
      return
    }
    setQualityLoading(true)
    setShowTerminal(true)
    setBottomTab('terminal')
    logToTerminal('info', '▶ Workspace quality: ESLint, tsc, GraphQL schema linter, Sonar…')
    try {
      const ts = await ideFsRead(ideJoinPath(workspaceRoot, 'tsconfig.json'))
      const sp = await ideFsRead(ideJoinPath(workspaceRoot, 'sonar-project.properties'))
      const graphqlFiles = workspaceRelFiles.filter((f) => /\.(graphql|gql)$/i.test(f)).slice(0, 8)
      const result = await runJarvisWorkspaceQuality({
        workspaceRoot,
        runCommand: ideRunCommand,
        hasTsconfig: ts.ok && !!ts.content,
        graphqlRelPaths: graphqlFiles,
        runSonar: sp.ok && !!sp.content,
      })
      const mapped: Problem[] = result.problems.map((p) => ({
        line: p.line,
        column: p.column,
        severity: p.severity,
        message: p.message,
        source: p.source,
      }))
      setQualityProblems(mapped)
      for (const line of result.logs) logToTerminal('info', line)
      logToTerminal('info', `✓ Quality scan: ${String(mapped.length)} issue(s)`)
      if (mapped.length > 0) {
        setShowProblems(true)
        setBottomTab('problems')
      }
      toast.success(`Quality scan: ${String(mapped.length)} issue(s)`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logToTerminal('error', msg)
      toast.error(msg)
    } finally {
      setQualityLoading(false)
    }
  }, [workspaceRoot, hasElectronFs, workspaceRelFiles, logToTerminal])

  const restartTerminalSession = useCallback(async () => {
    if (!hasElectronFs) return
    const ide = (globalThis as unknown as { jarvisIde: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
    if (!ide.terminalCreate) return
    if (terminalSessionRef.current != null) {
      ide.terminalKill({ id: terminalSessionRef.current })
    }
    const s = await ide.terminalCreate({ cwd: workspaceRoot || undefined })
    setTerminalSessionId(s.id)
    setTerminalCwd(s.cwd)
    terminalSessionRef.current = s.id
    setTerminalHistory([{ type: 'info', text: '[New terminal session]', time: Date.now() }])
  }, [hasElectronFs, workspaceRoot])

  const runTerminalLine = useCallback(
    async (command: string): Promise<JarvisIdeRunCommandResult> => {
      const cmd = command.trim()
      if (!cmd) {
        return { ok: false, stdout: '', stderr: '', exitCode: null, error: 'empty' }
      }
      setShowTerminal(true)
      setBottomTab('terminal')

      // Use persistent session if available
      if (hasElectronFs && terminalSessionRef.current != null) {
        const ide = (globalThis as unknown as { jarvisIde: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
        setCmdHistory((prev) => {
          const filtered = prev.filter((c) => c !== cmd)
          return [...filtered, cmd]
        })
        setCmdHistoryIdx(-1)
        ide.terminalWrite({ id: terminalSessionRef.current, data: cmd + '\n' })
        return { ok: true, stdout: '', stderr: '', exitCode: 0 }
      }

      // Fallback: one-shot exec
      logToTerminal('info', `$ ${cmd}`)
      if (!hasElectronFs || !workspaceRoot) {
        const msg = 'Open a folder (File → Open Folder) in the desktop app to run shell commands.'
        logToTerminal('error', msg)
        return { ok: false, stdout: '', stderr: '', exitCode: null, error: msg }
      }
      setTerminalShellBusy(true)
      try {
        const r = await ideRunCommand(workspaceRoot, cmd)
        if (r.stdout.trim()) logToTerminal('stdout', r.stdout.trimEnd())
        if (r.stderr.trim()) logToTerminal('stderr', r.stderr.trimEnd())
        if (r.exitCode != null && r.exitCode !== 0) {
          logToTerminal('error', `Exit code ${String(r.exitCode)}`)
        }
        if (r.error) logToTerminal('error', r.error)
        return r
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        logToTerminal('error', err)
        return { ok: false, stdout: '', stderr: '', exitCode: null, error: err }
      } finally {
        setTerminalShellBusy(false)
      }
    },
    [hasElectronFs, workspaceRoot, logToTerminal]
  )

  const toggleExplorerDir = useCallback((folderKey: string) => {
    setExplorerExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      return next
    })
  }, [])

  const openWorkspaceRelPath = useCallback(
    async (rel: string) => {
      if (!workspaceRoot) return
      const fullPath = ideJoinPath(workspaceRoot, rel)
      const r = await ideFsRead(fullPath)
      if (r.ok && r.content != null) {
        const ext = rel.split('.').pop()?.toLowerCase() ?? ''
        const langMap: Record<string, string> = {
          js: 'javascript', ts: 'typescript', tsx: 'typescriptreact', jsx: 'javascriptreact', py: 'python', md: 'markdown',
          json: 'json', html: 'html', css: 'css', scss: 'scss', yaml: 'yaml', yml: 'yaml', sh: 'shell', rs: 'rust', go: 'go',
          java: 'java', rb: 'ruby', php: 'php', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', xml: 'xml', sql: 'sql', toml: 'toml',
          ini: 'ini', env: 'plaintext', txt: 'plaintext',
        }
        const lang = langMap[ext] ?? 'plaintext'
        const existing = items.find((it) => it.diskPath === fullPath)
        if (existing) {
          setActiveItemId(existing.id)
          return
        }
        const id = `ws-${Date.now()}`
        addItem({
          id,
          code: r.content,
          language: lang,
          filename: rel.split(/[/\\]/).pop() ?? rel,
          createdAt: Date.now(),
          diskPath: fullPath,
        })
        setActiveItemId(id)
      } else {
        toast.error(`Could not read: ${r.error ?? 'unknown'}`)
      }
    },
    [workspaceRoot, items, addItem, setActiveItemId]
  )

  const deleteWorkspaceRelPath = useCallback(
    async (rel: string) => {
      if (!workspaceRoot) return
      if (!globalThis.confirm(`Delete ${rel}?`)) return
      const fullPath = ideJoinPath(workspaceRoot, rel)
      const { ideFsDelete } = await import('@/lib/jarvis-ide-bridge')
      const r = await ideFsDelete(fullPath)
      if (r.ok) {
        setWorkspaceRelFiles((prev) => prev.filter((f) => f !== rel))
        toast.success(`Deleted ${rel}`)
      } else {
        toast.error(r.error ?? 'Delete failed')
      }
    },
    [workspaceRoot]
  )

  // ── Register Jarvis automation control ──
  useEffect(() => {
    const mkId = () => `code-${Date.now()}-${randomIdSegment()}`
    const control: CodeEditorControl = {
      showCode(code, language, filename) { addItem({ id: mkId(), code, language, filename, createdAt: Date.now() }); onOpenChange(true) },
      isOpen: () => open,
      openEditor: () => onOpenChange(true),
      createFile(filename, code, language) { const id = mkId(); addItem({ id, code, language, filename, createdAt: Date.now() }); onOpenChange(true); return id },
      editFile(fileId, newCode) { if (!itemsRef.current.some(i => i.id === fileId)) { return false; } updateItem(fileId, { code: newCode }); if (activeItemIdRef.current === fileId) { setEditedCode(newCode); } return true },
      deleteFile(fileId) { if (!itemsRef.current.some(i => i.id === fileId)) { return false; } removeItem(fileId); return true },
      openFile(fileId) { if (!itemsRef.current.some(i => i.id === fileId)) { return false; } setActiveItemId(fileId); onOpenChange(true); return true },
      renameFile(fileId, newName) { if (!itemsRef.current.some(i => i.id === fileId)) { return false; } updateItem(fileId, { filename: newName, language: detectLang(newName) }); return true },
      getFiles() { return itemsRef.current.map(i => ({ id: i.id, filename: i.filename || `untitled.${getExt(i.language)}`, language: i.language })) },
      getActiveFile() { const id = activeItemIdRef.current; if (!id) { return null; } const item = itemsRef.current.find(i => i.id === id); if (!item) { return null; } return { id: item.id, filename: item.filename || `untitled.${getExt(item.language)}`, language: item.language, code: editedCodeRef.current || item.code } },
      getFileContent(fileId) { if (activeItemIdRef.current === fileId) { return editedCodeRef.current; } return itemsRef.current.find(i => i.id === fileId)?.code ?? null },
      insertText(text, position = 'end') { const ed = editorRef.current; if (!ed) { return false; } const model = ed.getModel(); if (!model) { return false; } const monacoApi = monacoRef.current; if (!monacoApi) { return false; } const resolvePos = (): monacoNs.IPosition => { if (position === 'start') { return { lineNumber: 1, column: 1 }; } if (position === 'cursor') { return ed.getPosition() || { lineNumber: 1, column: 1 }; } const l = model.getLineCount(); return { lineNumber: l, column: model.getLineMaxColumn(l) }; }; const pos = resolvePos(); ed.executeEdits('jarvis', [{ range: new (monacoApi.Range)(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text }]); setEditedCode(model.getValue()); return true },
      replaceText(s, r, all = false) { const model = editorRef.current?.getModel(); if (!model) { return 0; } const c = model.getValue(); let count = 0; let nc: string; if (all) { nc = c.split(s).join(r); count = c === nc ? 0 : c.split(s).length - 1 } else { const idx = c.indexOf(s); if (idx === -1) { return 0; } nc = c.slice(0, idx) + r + c.slice(idx + s.length); count = 1 }; model.setValue(nc); setEditedCode(nc); return count },
      findInFile(query) { const code = editedCodeRef.current; const res: Array<{ line: number; column: number; text: string }> = []; const lines = code.split('\n'); const lq = query.toLowerCase(); for (let i = 0; i < lines.length; i++) { const ll = lines[i].toLowerCase(); let col = ll.indexOf(lq); while (col !== -1) { res.push({ line: i + 1, column: col + 1, text: lines[i].trim() }); col = ll.indexOf(lq, col + 1) } }; return res },
      setLanguage(lang) { setEditedLang(lang); const id = activeItemIdRef.current; if (id) updateItem(id, { language: lang }) },
      async runActiveFile() { const code = editedCodeRef.current; const lang = editedLangRef.current; setRunning(true); setRunResult(null); setShowTerminal(true); try { const result = await runCode(code, lang); setRunResult(result); return result } finally { setRunning(false) } },
      getLastRunResult() { return runResultRef.current },
      togglePreview() { setShowPreview(p => !p) },
      toggleTerminal() { setShowTerminal(p => !p) },
      toggleZenMode() { setZenMode(p => !p) },
      toggleSplitEditor(fileId) { setSplitEditor(p => !p); if (fileId) setSplitFileId(fileId); else if (!splitFileId && activeItemIdRef.current) setSplitFileId(activeItemIdRef.current) },
      toggleDiffEditor(targetFileId) { setDiffMode(p => !p); if (targetFileId) setDiffTargetId(targetFileId); else if (!diffTargetId) { const o = itemsRef.current.find(i => i.id !== activeItemIdRef.current); if (o) setDiffTargetId(o.id) } },
      toggleExplorer() { setShowExplorer(p => !p) },
      toggleProblemsPanel() { setShowProblems(p => !p); setShowTerminal(true); setBottomTab('problems') },
      toggleSearchPanel() { setShowSearch(p => !p); setShowExplorer(true) },
      toggleOutlinePanel() { setShowOutline(p => !p); setShowExplorer(true) },
      toggleSettingsPanel() { setShowSettings(p => !p); setShowExplorer(true) },
      setTheme(t) { setTheme(t) },
      getTheme() { return themeRef.current },
      getAvailableThemes() { return THEMES.map(t => ({ id: t.id, label: t.label })) },
      setFontSize(s) { setFontSize(Math.max(10, Math.min(32, s))) },
      getFontSize() { return fontSizeRef.current },
      setTabSize(s) { setTabSize(s) },
      setWordWrap(on) { setWordWrap(on ? 'on' : 'off') },
      setMinimap(on) { setShowMinimap(on) },
      setAutoSave(on) { setAutoSave(on) },
      getSettings() { return { theme: themeRef.current, fontSize: fontSizeRef.current, tabSize: tabSizeRef.current, wordWrap: wordWrapRef.current, minimap: showMinimapRef.current, autoSave: autoSaveRef.current } },
      searchAllFiles(query) { const q = query.toLowerCase(); const res: Array<{ fileId: string; filename: string; line: number; text: string }> = []; for (const item of itemsRef.current) { const code = item.id === activeItemIdRef.current ? editedCodeRef.current : item.code; const lines = code.split('\n'); for (let i = 0; i < lines.length; i++) { if (lines[i].toLowerCase().includes(q)) res.push({ fileId: item.id, filename: item.filename || `${item.language} snippet`, line: i + 1, text: lines[i].trim() }) } }; return res.slice(0, 100) },
      getOutlineSymbols() { return outlineSymbolsRef.current },
      getProblems() { return problemsRef.current },
      getTerminalOutput() { return terminalHistoryRef.current.map(e => e.text).join('\n') },
      getWorkspaceRoot() { return workspaceRootRef.current },
      async runTerminalCommand(command: string) {
        const cmd = command.trim()
        if (!cmd) return { ok: false, stdout: '', stderr: '', exitCode: null, error: 'empty' } as JarvisIdeRunCommandResult
        setShowTerminal(true)
        setBottomTab('terminal')
        logToTerminal('info', `$ ${cmd}`)
        const wr = workspaceRootRef.current
        if (!hasElectronFs || !wr) {
          const msg = 'Desktop app required for shell commands.'
          logToTerminal('error', msg)
          return { ok: false, stdout: '', stderr: '', exitCode: null, error: msg } as JarvisIdeRunCommandResult
        }
        try {
          const r = await ideRunCommand(wr, cmd)
          if (r.stdout.trim()) logToTerminal('stdout', r.stdout.trimEnd())
          if (r.stderr.trim()) logToTerminal('stderr', r.stderr.trimEnd())
          if (r.exitCode != null && r.exitCode !== 0) logToTerminal('error', `Exit code ${String(r.exitCode)}`)
          if (r.error) logToTerminal('error', r.error)
          return r
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          logToTerminal('error', err)
          return { ok: false, stdout: '', stderr: '', exitCode: null, error: err } as JarvisIdeRunCommandResult
        }
      },
      createFromTemplate(n) { const t = FILE_TEMPLATES.find(t => t.name.toLowerCase() === n.toLowerCase()); if (!t) { return null; } const id = mkId(); addItem({ id, code: t.code, language: t.language, filename: t.filename, createdAt: Date.now() }); onOpenChange(true); return id },
      getAvailableTemplates() { return FILE_TEMPLATES.map(t => t.name) },
      goToLine(line) { editorRef.current?.setPosition({ lineNumber: line, column: 1 }); editorRef.current?.revealLineInCenter(line) },
      revealLine(line) { editorRef.current?.revealLineInCenter(line) },
      formatDocument() { editorRef.current?.getAction('editor.action.formatDocument')?.run() },
      async runGitCommand(args: string[]) {
        const wr = workspaceRootRef.current
        if (!hasElectronFs || !wr) {
          return { ok: false, stdout: '', stderr: '', error: 'Git requires the desktop app with an open workspace folder.' }
        }
        try {
          const r = await ideGit(wr, args)
          return { ok: !!r.ok, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error }
        } catch (e) {
          return { ok: false, stdout: '', stderr: '', error: e instanceof Error ? e.message : String(e) }
        }
      },
    }
    register(control)
    return () => unregister()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, register, unregister, addItem, removeItem, updateItem, onOpenChange, setActiveItemId, setRunning, setRunResult, splitFileId, diffTargetId, runTerminalLine])

  // Live preview
  const writePreview = useCallback((code: string, lang: string) => {
    const iframe = previewRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open() // NOSONAR
    if (lang === 'html' || lang === 'htm') {
      doc.write(code) // NOSONAR
    } else if (lang === 'markdown' || lang === 'md') {
      doc.write(`<!DOCTYPE html><html><head><style>body{font-family:system-ui,-apple-system,sans-serif;padding:2rem;max-width:800px;margin:0 auto;line-height:1.7;color:#333}h1{border-bottom:2px solid #eee;padding-bottom:0.3em}h2{border-bottom:1px solid #eee;padding-bottom:0.2em}h1,h2,h3,h4{margin:1.5rem 0 0.5rem;font-weight:600}code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:'Cascadia Code',Consolas,monospace}pre{background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:8px;overflow-x:auto;margin:1rem 0}pre code{background:none;padding:0;color:inherit}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}blockquote{border-left:4px solid #007acc;margin:1rem 0;padding:0.5rem 1rem;color:#555;background:#f8f9fa}img{max-width:100%;border-radius:4px}a{color:#007acc;text-decoration:none}a:hover{text-decoration:underline}ul,ol{padding-left:1.5rem;margin:0.5rem 0}li{margin:0.25rem 0}hr{border:none;border-top:2px solid #eee;margin:2rem 0}</style></head><body>${simpleMarkdown(code)}</body></html>`) // NOSONAR
    } else if (lang === 'css' || lang === 'scss' || lang === 'less') {
      const cssPreviewHtml = `<!DOCTYPE html><html><head><style>${code}</style></head><body>
<div class="preview"><h1>CSS Preview</h1><p>Your styles are applied to this sample content.</p>
<div class="card"><h2>Card Title</h2><p>This is a card with some content inside it.</p></div>
<div class="container"><div class="flex"><button class="btn">Primary Button</button><button class="btn secondary">Secondary</button></div></div>
<div class="grid"><div class="item">Grid Item 1</div><div class="item">Grid Item 2</div><div class="item">Grid Item 3</div></div>
<a href="#">Sample Link</a> <span>|</span> <input type="text" placeholder="Input field" /> <span>|</span> <input type="checkbox" checked /> <label>Checkbox</label>
<ul><li>List item 1</li><li>List item 2</li><li>List item 3</li></ul>
<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Row 1</td><td>Data</td></tr><tr><td>Row 2</td><td>Data</td></tr></tbody></table>
</div></body></html>`
      doc.write(cssPreviewHtml) // NOSONAR
    } else if (lang === 'javascript' || lang === 'typescript') {
      const jsPreviewHtml = `<!DOCTYPE html><html><head><style>body{font-family:'Cascadia Code',Consolas,monospace;padding:20px;background:#1e1e1e;color:#d4d4d4;font-size:13px;line-height:1.6;margin:0}#output{white-space:pre-wrap;word-break:break-word}.log{color:#d4d4d4}.warn{color:#e8ab6a}.error{color:#f44747}.info{color:#569cd6}.group{border-left:2px solid #444;padding-left:12px;margin:4px 0}.time{color:#888;font-size:11px}</style></head><body><div id="output"></div><` + `script>
const _out=document.getElementById('output');
const _ts=()=>new Date().toLocaleTimeString();
function _log(cls,...args){const d=document.createElement('div');d.className=cls;d.textContent=args.map(a=>typeof a==='object'?JSON.stringify(a,null,2):String(a)).join(' ');const t=document.createElement('span');t.className='time';t.textContent=_ts()+' ';d.prepend(t);_out.appendChild(d);_out.scrollTop=_out.scrollHeight;}
console.log=function(...a){_log('log',...a)};
console.warn=function(...a){_log('warn','⚠ ',...a)};
console.error=function(...a){_log('error','✕ ',...a)};
console.info=function(...a){_log('info','ℹ ',...a)};
console.table=function(a){if(Array.isArray(a)){a.forEach((r,i)=>_log('log','['+i+']',r))}else{_log('log',a)}};
try{${code.replaceAll(/<\/script>/gi, String.raw`<\/script>`)}}catch(e){console.error(e.message)}
<` + `/script></body></html>`
      doc.write(jsPreviewHtml) // NOSONAR
    } else if (lang === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(code), null, 2)
        doc.write(`<!DOCTYPE html><html><head><style>body{font-family:'Cascadia Code',Consolas,monospace;padding:20px;background:#1e1e1e;color:#d4d4d4;font-size:13px;margin:0}pre{white-space:pre-wrap;word-break:break-word;margin:0}.string{color:#ce9178}.number{color:#b5cea8}.boolean{color:#569cd6}.null{color:#569cd6}.key{color:#9cdcfe}</style></head><body><pre>${syntaxHighlightJson(formatted)}</pre></body></html>`) // NOSONAR
      } catch {
        doc.write(`<!DOCTYPE html><html><head><style>body{font-family:Consolas,monospace;padding:20px;background:#1e1e1e;color:#f44747}</style></head><body><pre>Invalid JSON:\n${escapeHtml(code)}</pre></body></html>`) // NOSONAR
      }
    } else {
      doc.write(`<!DOCTYPE html><html><head><style>body{font-family:system-ui;padding:2rem;background:#1e1e1e;color:#888;display:flex;align-items:center;justify-content:center;height:80vh;margin:0;text-align:center}p{font-size:14px}</style></head><body><div><p>Preview not available for <strong style="color:#ccc">${lang}</strong> files.</p><p style="font-size:12px;color:#555">Supported: HTML, CSS, JavaScript, TypeScript, Markdown, JSON</p></div></body></html>`) // NOSONAR
    }
    doc.close() // NOSONAR
  }, [])

  useEffect(() => {
    if (!showPreview) return
    const timer = setTimeout(() => writePreview(editedCode, editedLang), 150)
    return () => clearTimeout(timer)
  }, [editedCode, editedLang, showPreview, writePreview])

  // Search across files
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const q = searchQuery.toLowerCase()
    const res: typeof searchResults = []
    for (const item of items) {
      const code = item.id === activeItemId ? editedCode : item.code
      const lines = code.split('\n')
      for (let i = 0; i < lines.length; i++) { if (lines[i].toLowerCase().includes(q)) res.push({ fileId: item.id, filename: item.filename || `${item.language} snippet`, line: i + 1, text: lines[i].trim() }) }
    }
    setSearchResults(res.slice(0, 100))
  }, [searchQuery, items, activeItemId, editedCode])

  // Outline symbols
  useEffect(() => {
    const lines = editedCode.split('\n')
    const syms: typeof outlineSymbols = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/^\s*(export\s+)?(function|const|let|var|class|interface|type|enum|import|def |async\s+def |async\s+function)\s/i.test(l)) {
        const name = l.trim().slice(0, 60)
        let kind: string
        if (/class /i.test(l)) { kind = 'class' }
        else if (/function |def /i.test(l)) { kind = 'function' }
        else if (/interface |type |enum /i.test(l)) { kind = 'type' }
        else if (/import /i.test(l)) { kind = 'import' }
        else { kind = 'variable' }
        syms.push({ name, kind, line: i + 1 })
      }
    }
    setOutlineSymbols(syms)
  }, [editedCode])

  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [terminalHistory])
  useEffect(() => { if (!tabContextMenu) { return; } const h = () => setTabContextMenu(null); globalThis.addEventListener('click', h); return () => globalThis.removeEventListener('click', h) }, [tabContextMenu])
  useEffect(() => { if (!openMenuId) { return; } const h = () => setOpenMenuId(null); globalThis.addEventListener('click', h); return () => globalThis.removeEventListener('click', h) }, [openMenuId])

  useEffect(() => {
    if (!open) return
    fetchAgentBrowserHealth()
      .then((h) => setAgentBridgeOk(Boolean(h.ok)))
      .catch(() => setAgentBridgeOk(false))
  }, [open])

  useEffect(() => {
    setProblemIndex(0)
  }, [displayProblems.length])

  useEffect(() => {
    if (displayProblems.length === 0) return
    const p = displayProblems[problemIndex % displayProblems.length]
    editorRef.current?.revealLineInCenter(p.line)
  }, [problemIndex, displayProblems])

  useEffect(() => {
    if (bottomTab !== 'git' || !workspaceRoot || !hasElectronFs) return
    setGitLoading(true)
    ideGit(workspaceRoot, ['status', '-sb'])
      .then((r) => {
        if (r.ok) { const stderrPart = r.stderr ? `\n${r.stderr}` : ''; setGitOutput(`${r.stdout || ''}${stderrPart}`.trim()) }
        else { setGitOutput(r.error || r.stderr || 'git failed') }
      })
      .catch((e) => setGitOutput(e instanceof Error ? e.message : String(e)))
      .finally(() => setGitLoading(false))
  }, [bottomTab, workspaceRoot, hasElectronFs])

  useEffect(() => {
    if (!open || !workspaceRoot || !hasElectronFs) {
      setGitPorcelainMap(new Map())
      setGitRemoteCounts(null)
      return
    }
    let cancelled = false
    const refresh = async () => {
      const [st, lr] = await Promise.all([
        ideGit(workspaceRoot, ['status', '--porcelain']),
        ideGit(workspaceRoot, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
      ])
      if (cancelled) return
      if (st.ok && st.stdout != null) setGitPorcelainMap(parseGitStatusPorcelain(st.stdout))
      else setGitPorcelainMap(new Map())
      if (lr.ok && lr.stdout != null) setGitRemoteCounts(parseGitLeftRightCount(lr.stdout))
      else setGitRemoteCounts(null)
    }
    refresh().catch(() => {})
    const t = setInterval(refresh, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [open, workspaceRoot, hasElectronFs])

  useEffect(() => {
    if (bottomTab !== 'extensions' || !workspaceRoot || !hasElectronFs) {
      setExtensionsPackageJson(null)
      return
    }
    const path = ideJoinPath(workspaceRoot, 'package.json')
    ideFsRead(path).then((r) => {
      setExtensionsPackageJson(r.ok && r.content != null ? r.content : `Could not read package.json: ${r.error ?? 'unknown'}`)
    }).catch(() => {})
  }, [bottomTab, workspaceRoot, hasElectronFs])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line sonarjs/cognitive-complexity -- centralized keyboard shortcut router; each branch maps to a distinct IDE command
    const handler = (e: KeyboardEvent) => { // NOSONAR intentional centralized keyboard shortcut router for legacy IDE shell
      if (e.key === 'Escape') {
        if (commandPaletteOpen) { setCommandPaletteOpen(false); return }
        if (showShortcuts) { setShowShortcuts(false); return }
        if (zenMode) { setZenMode(false); return }
        if (tabContextMenu) { setTabContextMenu(null); return }
        if (openMenuId) { setOpenMenuId(null); return }
        onOpenChange(false); return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'b') { e.preventDefault(); setShowExplorer(p => !p) }
      if (mod && e.key === '`') { e.preventDefault(); setShowTerminal(p => !p) }
      if (mod && e.key === 'n' && !e.shiftKey) { e.preventDefault(); setNewFileDialog(true) }
      if (mod && e.key === 's') { e.preventDefault(); handleSave().then(() => toast.success('Saved')).catch(() => {}) }
      if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); setCommandPaletteOpen(true); setCommandFilter('') }
      if (mod && e.key === '=') { e.preventDefault(); setFontSize(s => Math.min(s + 1, 32)) }
      if (mod && e.key === '-') { e.preventDefault(); setFontSize(s => Math.max(s - 1, 10)) }
      if (mod && e.key === '0') { e.preventDefault(); setFontSize(14) }
      if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); setShowSearch(true); setShowExplorer(true) }
      if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        if (ideChatOnSend) setShowIdeChat((p) => !p)
      }
      if (e.key === 'F11') { e.preventDefault(); setZenMode(p => !p) }
      if (mod && e.key === 'j') { e.preventDefault(); setShowTerminal(p => !p) }
      if (mod && e.key === '\\') { e.preventDefault(); setSplitEditor(p => !p); if (!splitFileId && activeItemId) setSplitFileId(activeItemId) }
      if (mod && e.key === 'z' && !e.shiftKey) { editorRef.current?.trigger('keyboard', 'undo', null) }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { editorRef.current?.trigger('keyboard', 'redo', null) }
      if (mod && e.key === 'w') { e.preventDefault(); if (activeItemId) handleCloseTab(activeItemId) }
      if (mod && e.key === 'd') { e.preventDefault(); if (activeItemId) handleDuplicate(activeItemId) }
      if (e.altKey && (e.key === 'z' || e.key === 'Z') && !mod) { e.preventDefault(); setWordWrap(w => w === 'on' ? 'off' : 'on') }
      if (e.altKey && e.shiftKey && (e.key === 'f' || e.key === 'F') && !mod) { e.preventDefault(); editorRef.current?.getAction('editor.action.formatDocument')?.run() }
      if (e.key === 'F5') { e.preventDefault(); handleRun().catch(() => {}) }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onOpenChange, commandPaletteOpen, showShortcuts, zenMode, tabContextMenu, openMenuId, activeItemId, editedCode, splitFileId, ideChatOnSend])

  const handleSave = useCallback(async () => {
    if (!activeItemId) return
    updateItem(activeItemId, { code: editedCode })
    savedCodeRef.current = editedCode
    setModified(false)
    const item = items.find((i) => i.id === activeItemId)
    if (item?.diskPath && hasElectronFs) {
      const res = await ideFsWrite(item.diskPath, editedCode)
      if (!res.ok) toast.error(res.error || 'Could not save to disk')
    }
  }, [activeItemId, editedCode, updateItem, items, hasElectronFs])

  const sendIdePayload = useCallback(
    async (payload: IdeChatPayload): Promise<string | null> => {
      if (!ideChatOnSend) return null
      setIdeChatLoading(true)
      try {
        const { content, reasoning } = await ideChatOnSend(payload)
        setIdeChatMessages((prev) => [...prev, createIdeAssistantMessage(content, reasoning)])
        return content
      } catch (e) {
        console.error(e)
        toast.error('IDE chat failed')
        setIdeChatMessages((prev) => [...prev, createIdeAssistantMessage('Sorry — something went wrong. Try again.')])
        return null
      } finally {
        setIdeChatLoading(false)
      }
    },
    [ideChatOnSend]
  )

  const handleIdeChatSend = useCallback(
    async (text: string, attachments?: IdeAttachment[]) => {
      if (!ideChatOnSend) return
      setIdeChatMessages((prev) => [...prev, createIdeUserMessage(text, attachments)])

      const isAutopilot = ideChatMode === 'agent'
      if (isAutopilot) {
        if (!autopilotOn) setAutopilotOn(true)
        setAutopilotStatus('running')
        autopilotAbortRef.current = new AbortController()
      }

      let content = await sendIdePayload({
        userMessage: text,
        ideContextBlock: ideContextBlockRef.current,
        model: ideChatModel,
        temperature: ideTemp,
        max_tokens: ideMaxTok,
        reasoningMode: ideReasoning,
        autopilot: isAutopilot,
        mode: ideChatMode,
        attachments,
      })

      if (isAutopilot && content) {
        let continuations = 0
        const maxContinuations = 10
        while (
          continuations < maxContinuations &&
          content?.includes('[AUTOPILOT: CONTINUING]') &&
          !autopilotAbortRef.current?.signal.aborted
        ) {
          continuations++
          setIdeChatMessages((prev) => [...prev, createIdeUserMessage(`[Agent continuation ${String(continuations)}] Continue working. Here is the updated IDE context.`)])
          content = await sendIdePayload({
            userMessage: `Continue your autonomous work. Pick up where you left off. Here is the updated IDE context:\n\n${ideContextBlockRef.current}`,
            ideContextBlock: ideContextBlockRef.current,
            model: ideChatModel,
            temperature: ideTemp,
            max_tokens: ideMaxTok,
            reasoningMode: ideReasoning,
            autopilot: true,
            mode: 'agent',
          })
        }
        setAutopilotStatus('idle')
        autopilotAbortRef.current = null
        if (content?.includes('[AUTOPILOT: COMPLETED]')) {
          toast.success('Agent finished')
        } else if (content?.includes('[AUTOPILOT: BLOCKED]')) {
          toast.info('Agent needs your input')
        }
      }
    },
    [ideChatOnSend, sendIdePayload, ideChatModel, ideTemp, ideMaxTok, ideReasoning, ideChatMode, autopilotOn]
  )

  const stopAutopilot = useCallback(() => {
    autopilotAbortRef.current?.abort()
    setAutopilotStatus('idle')
    if (autopilotOn) setAutopilotOn(false)
    setIdeChatMessages((prev) => [...prev, createIdeAssistantMessage('Agent stopped by user.')])
    toast.info('Agent stopped')
  }, [autopilotOn])

  const firePresetChat = useCallback(
    async (preset: IdeAiPreset, userMessage: string) => {
      if (!ideChatOnSend) return
      setShowIdeChat(true)
      setIdeChatMessages((prev) => [...prev, createIdeUserMessage(userMessage)])
      await sendIdePayload({
        userMessage,
        ideContextBlock: ideContextBlockRef.current,
        preset,
        model: ideChatModel,
        temperature: ideTemp,
        max_tokens: ideMaxTok,
        reasoningMode: ideReasoning,
      })
    },
    [ideChatOnSend, sendIdePayload, ideChatModel, ideTemp, ideMaxTok, ideReasoning]
  )

  const fireInspectorChat = useCallback(
    async (request: InspectorAiRequest) => {
      if (!ideChatOnSend) return
      const prompt = buildInspectorChatPrompt(request)
      const preset = inspectorAiKindToPreset(request.kind)
      setShowIdeChat(true)
      setIdeChatMessages((prev) => [...prev, createIdeUserMessage(prompt)])
      try {
        await sendIdePayload({
          userMessage: prompt,
          ideContextBlock: ideContextBlockRef.current,
          preset,
          model: ideChatModel,
          temperature: ideTemp,
          max_tokens: ideMaxTok,
          reasoningMode: ideReasoning,
          mode: ideChatMode,
        })
        let inspectorSentMsg = 'Sent inspector request to Jarvis: suggest layout changes.'
        if (request.kind === 'explain-node') {
          inspectorSentMsg = 'Sent inspector request to Jarvis: explain this node.'
        } else if (request.kind === 'fix-attributes') {
          inspectorSentMsg =
            'Sent inspector request to Jarvis: fix attributes on the selected element.'
        }
        showIdeToast(inspectorSentMsg, 'success')
      } catch {
        showIdeToast('Failed to send inspector request to Jarvis.', 'error')
      }
    },
    [ideChatOnSend, sendIdePayload, ideChatModel, ideTemp, ideMaxTok, ideReasoning, ideChatMode]
  )

  const inspectorChatHandledNonceRef = useRef<number | null>(null)
  useEffect(() => {
    if (!open || !inspectorChatTicket || !ideChatOnSend) return
    if (inspectorChatHandledNonceRef.current === inspectorChatTicket.nonce) return
    inspectorChatHandledNonceRef.current = inspectorChatTicket.nonce
    const { request } = inspectorChatTicket
    fireInspectorChat(request)
      .catch(() => {})
      .finally(() => {
        onInspectorChatConsumed?.()
      })
  }, [open, inspectorChatTicket, ideChatOnSend, fireInspectorChat, onInspectorChatConsumed])

  /** Cursor-style Review: run static analysis first, then feed findings to AI. */
  const handleJarvisReview = useCallback(async () => {
    if (!workspaceRoot || !hasElectronFs) {
      firePresetChat(
        'composer_review',
        'Review the open files for risks, security, and improvements.'
      ).catch(() => {})
      return
    }
    setQualityLoading(true)
    setShowTerminal(true)
    setBottomTab('terminal')
    logToTerminal('info', '▶ Review: running ESLint, tsc, GraphQL, Sonar…')
    let qualitySummary = ''
    try {
      const ts = await ideFsRead(ideJoinPath(workspaceRoot, 'tsconfig.json'))
      const sp = await ideFsRead(ideJoinPath(workspaceRoot, 'sonar-project.properties'))
      const graphqlFiles = workspaceRelFiles.filter((f) => /\.(graphql|gql)$/i.test(f)).slice(0, 8)
      const result = await runJarvisWorkspaceQuality({
        workspaceRoot,
        runCommand: ideRunCommand,
        hasTsconfig: ts.ok && !!ts.content,
        graphqlRelPaths: graphqlFiles,
        runSonar: sp.ok && !!sp.content,
      })
      const mapped: Problem[] = result.problems.map((p) => ({
        line: p.line,
        column: p.column,
        severity: p.severity,
        message: p.message,
        source: p.source,
      }))
      setQualityProblems(mapped)
      for (const line of result.logs) logToTerminal('info', line)
      logToTerminal('info', `✓ Quality scan: ${String(mapped.length)} issue(s)`)
      if (mapped.length > 0) {
        setShowProblems(true)
        setBottomTab('problems')
        const top = mapped.slice(0, 40).map((p) => `  ${p.source}:${String(p.line)} ${p.severity} ${p.message}`).join('\n')
        const overflow = mapped.length > 40 ? `\n  … and ${String(mapped.length - 40)} more` : ''
        qualitySummary = `\n\nStatic analysis found ${String(mapped.length)} issue(s):\n${top}${overflow}`
      } else {
        qualitySummary = '\n\nStatic analysis (ESLint, tsc, GraphQL, Sonar): 0 issues found.'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logToTerminal('error', msg)
      qualitySummary = `\n\nStatic analysis failed: ${msg}`
    } finally {
      setQualityLoading(false)
    }
    firePresetChat(
      'composer_review',
      `Review the open files and workspace for risks, security, and improvements.${qualitySummary}`
    ).catch(() => {})
  }, [firePresetChat, workspaceRoot, hasElectronFs, workspaceRelFiles, logToTerminal])

  const clearIdeChat = useCallback(() => {
    setIdeChatMessages([])
  }, [])

  const handleRun = useCallback(async () => {
    setShowTerminal(true); setBottomTab('terminal'); setRunning(true); setRunResult(null)
    logToTerminal('info', `▶ Running ${editedLang}...`)
    try {
      const result = await runCode(editedCode, editedLang)
      setRunResult(result)
      if (result.stdout) logToTerminal('stdout', result.stdout)
      if (result.stderr) logToTerminal('stderr', result.stderr)
      if (result.error) logToTerminal('error', result.error)
      if (!result.stdout && !result.stderr && !result.error) logToTerminal('info', '(no output)')
      logToTerminal('info', `✓ Finished in ${result.elapsed}ms`)
      const p = parseProblems(result, activeItem?.filename || 'untitled')
      setProblems(p)
      if (p.length > 0) setShowProblems(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logToTerminal('error', msg)
      setRunResult({ stdout: '', stderr: '', error: msg, elapsed: 0 })
    } finally { setRunning(false) }
  }, [editedCode, editedLang, setRunning, setRunResult, logToTerminal, activeItem])

  const handleCopy = useCallback(() => { navigator.clipboard.writeText(editedCode).then(() => toast.success('Copied to clipboard')) }, [editedCode])
  const handleDownload = useCallback(() => {
    const fn = activeItem?.filename || `code.${getExt(editedLang)}`
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([editedCode], { type: 'text/plain' })); a.download = fn; a.click(); toast.success(`Downloaded ${fn}`)
  }, [editedCode, editedLang, activeItem])
  const handleNewFile = useCallback(() => { if (!newFileName.trim()) { return; } addItem({ id: `code-${Date.now()}-${randomIdSegment()}`, code: '', language: detectLang(newFileName), filename: newFileName.trim(), createdAt: Date.now() }); setNewFileName(''); setNewFileDialog(false) }, [newFileName, addItem])
  const handleRename = useCallback(() => { if (!renameDialog || !renameValue.trim()) { return; } updateItem(renameDialog, { filename: renameValue.trim(), language: detectLang(renameValue) }); setRenameDialog(null); setRenameValue('') }, [renameDialog, renameValue, updateItem])

  const handleCloseTab = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (pinnedTabs.has(id)) return
    const idx = items.findIndex(i => i.id === id)
    if (id === activeItemId) { const next = items[idx + 1] || items[idx - 1]; setActiveItemId(next?.id || null) }
    removeItem(id)
  }, [items, activeItemId, setActiveItemId, removeItem, pinnedTabs])

  const handleDuplicate = useCallback((id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newId = `code-${Date.now()}-${randomIdSegment()}`
    const newName = item.filename ? item.filename.replace(/(\.[^.]+)$/, ' (copy)$1') : `${item.language} copy`
    addItem({ id: newId, code: item.code, language: item.language, filename: newName, createdAt: Date.now() })
  }, [items, addItem])

  const handleFormat = useCallback(() => { editorRef.current?.getAction('editor.action.formatDocument')?.run(); toast.success('Formatted') }, [])

  const handleReplaceAll = useCallback(() => {
    if (!searchQuery) return
    let count = 0
    for (const item of items) {
      const code = item.id === activeItemId ? editedCode : item.code
      if (code.includes(searchQuery)) {
        const newCode = code.split(searchQuery).join(replaceQuery)
        count += code.split(searchQuery).length - 1
        if (item.id === activeItemId) {
          setEditedCode(newCode)
          editorRef.current?.getModel()?.setValue(newCode)
        } else {
          updateItem(item.id, { code: newCode })
        }
      }
    }
    toast.success(`Replaced ${count} occurrence(s)`)
  }, [searchQuery, replaceQuery, items, activeItemId, editedCode, updateItem])

  const handleEditorMount = useCallback((editor: monacoNs.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor; monacoRef.current = monaco
    editor.onDidChangeCursorPosition((e: { position: monacoNs.IPosition }) => setCursorPos({ line: e.position.lineNumber, col: e.position.column }))
    editor.onDidChangeCursorSelection((e: { selection: { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number } }) => {
      const sel = e.selection
      if (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn) { setSelectionInfo(''); return }
      const text = editor.getModel()?.getValueInRange(sel) || ''
      setSelectionInfo(`(${text.split('\n').length} lines, ${text.length} chars)`)
    })
    editor.addAction({ id: 'run-code', label: 'Run Code', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => { handleRun() } })
    for (const t of THEMES) monaco.editor.defineTheme(t.id, { base: t.base, inherit: true, rules: [], colors: t.colors })
    monaco.editor.setTheme(theme)
    registerSnippets(monaco)
  }, [handleRun, theme])

  useEffect(() => { monacoRef.current?.editor.setTheme(theme) }, [theme])

  const canRun = RUNNABLE.has(editedLang.toLowerCase())
  const canPreview = PREVIEWABLE.has(editedLang) || editedLang === 'javascript' || editedLang === 'css' || editedLang === 'markdown'
  const bgColor = THEMES.find(t => t.id === theme)?.colors['editor.background'] || '#1e1e1e'
  const isLight = theme === 'vs-light'
  const tc = isLight ? '#333' : '#ccc'
  const bc = isLight ? '#e0e0e0' : '#252526'
  const sb = isLight ? '#f3f3f3' : '#252526'
  const ab = isLight ? '#e8e8e8' : '#333333'
  const tb = isLight ? '#f3f3f3' : '#252526'
  const tl = isLight ? '#dddddd' : '#323233'

  const setRunningCompat = useCallback((next: boolean | ((p: boolean) => boolean)) => {
    if (typeof next === 'function') {
      setRunning(next(running))
      return
    }
    setRunning(next)
  }, [running, setRunning])

  // ── Full menu bar (File … Agents) — real IPC + chat + git + workspace
  const allMenus = buildCodeEditorJarvisMenus({
    editorRef,
    monacoRef,
    ideContextBlockRef,
    hasElectronFs,
    ideChatOnSend: Boolean(ideChatOnSend),
    agentBridgeOk,
    onOpenAgentBrowser,
    items,
    activeItemId,
    editedCode,
    setEditedCode,
    workspaceRoot,
    setWorkspaceRoot,
    setWorkspaceRelFiles,
    addItem,
    updateItem,
    removeItem,
    setActiveItemId,
    onOpenChange,
    autoSave,
    showExplorer,
    showSearch,
    showSourceControl,
    showRunDebug,
    showExtensions,
    showTerminal,
    showProblems,
    showOutputTab,
    showDebugConsole,
    zenMode,
    showMenuBar,
    showActivityBar,
    showStatusBar,
    splitFileId,
    diffTargetId,
    setNewFileDialog,
    setTemplateDialog,
    handleSave,
    handleDownload,
    handleCloseTab,
    setShowExplorer,
    setShowSearch,
    setShowOutline,
    setShowTerminal,
    setShowPreview,
    setShowIdeChat,
    setShowMinimap,
    setWordWrap,
    setStickyScroll,
    setSplitEditor,
    setSplitFileId,
    setDiffMode,
    setDiffTargetId,
    setZenMode,
    setShowSettings,
    setShowShortcuts,
    setCommandPaletteOpen,
    setCommandFilter,
    setOpenMenuId,
    handleFormat,
    handleCopy,
    handleRun,
    canRun,
    setShowProblems,
    setBottomTab,
    setTerminalHistory,
    setProblems,
    problemIndex,
    setProblemIndex,
    problemsLength: displayProblems.length,
    setShowSourceControl,
    setShowRunDebug,
    setShowExtensions,
    setShowOutputTab,
    setShowDebugConsole,
    setShowMenuBar,
    setShowActivityBar,
    setShowStatusBar,
    debuggingActive,
    setDebuggingActive,
    setDebugLogLines,
    setRunning: setRunningCompat,
    setAutoSave,
    ideChatModel,
    setIdeChatModel,
    ideChatModelOptions,
    ideTemp,
    setIdeTemp,
    ideMaxTok,
    setIdeMaxTok,
    ideReasoning,
    setIdeReasoning,
    restartTerminalSession,
    firePresetChat,
    sendIdePayload,
    setIdeChatMessages,
    createIdeUserMessage,
    clearIdeChat,
  })

  // ── Command palette commands ──
  const commands = useMemo(() => {
    const cmds = [
      { id: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: () => setNewFileDialog(true) },
      { id: 'template', label: 'New File from Template...', action: () => setTemplateDialog(true) },
      { id: 'save', label: 'Save', shortcut: 'Ctrl+S', action: handleSave },
      { id: 'run', label: 'Run Code', shortcut: 'Ctrl+Enter', action: handleRun, disabled: !canRun },
      { id: 'format', label: 'Format Document', shortcut: 'Shift+Alt+F', action: handleFormat },
      {
        id: 'workspace-quality',
        label: 'Run workspace quality (ESLint, tsc, GraphQL, Sonar)',
        action: () => { handleRunWorkspaceQuality().catch(() => {}) },
        disabled: !workspaceRoot || !hasElectronFs || qualityLoading,
      },
      { id: 'copy', label: 'Copy All', action: handleCopy },
      { id: 'download', label: 'Download File', action: handleDownload },
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', action: () => editorRef.current?.trigger('keyboard', 'undo', null) },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', action: () => editorRef.current?.trigger('keyboard', 'redo', null) },
      { id: 'find', label: 'Find', shortcut: 'Ctrl+F', action: () => editorRef.current?.getAction('actions.find')?.run() },
      { id: 'replace', label: 'Find and Replace', shortcut: 'Ctrl+H', action: () => editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run() },
      { id: 'go-to-line', label: 'Go to Line', shortcut: 'Ctrl+G', action: () => editorRef.current?.getAction('editor.action.gotoLine')?.run() },
      { id: 'fold-all', label: 'Fold All', action: () => editorRef.current?.getAction('editor.foldAll')?.run() },
      { id: 'unfold-all', label: 'Unfold All', action: () => editorRef.current?.getAction('editor.unfoldAll')?.run() },
      { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', action: () => editorRef.current?.trigger('keyboard', 'editor.action.selectAll', null) },
      { id: 'split', label: splitEditor ? 'Close Split Editor' : 'Split Editor Right', shortcut: 'Ctrl+\\', action: () => { setSplitEditor(p => !p); if (!splitFileId && activeItemId) setSplitFileId(activeItemId) } },
      { id: 'diff', label: diffMode ? 'Close Diff Editor' : 'Compare Files (Diff)', action: () => { if (items.length < 2) { toast.info('Need 2+ files'); return }; setDiffMode(p => !p); if (!diffTargetId) { const o = items.find(i => i.id !== activeItemId); if (o) setDiffTargetId(o.id) } } },
      { id: 'zen', label: zenMode ? 'Exit Zen Mode' : 'Zen Mode', shortcut: 'F11', action: () => setZenMode(p => !p) },
      { id: 'toggle-explorer', label: 'Toggle Explorer', shortcut: 'Ctrl+B', action: () => setShowExplorer(p => !p) },
      { id: 'toggle-terminal', label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: () => setShowTerminal(p => !p) },
      { id: 'toggle-preview', label: 'Toggle Preview', action: () => setShowPreview(p => !p) },
      ...(ideChatOnSend
        ? [{ id: 'toggle-ai-chat', label: showIdeChat ? 'Hide AI Chat' : 'Show AI Chat', shortcut: 'Ctrl+Shift+L', action: () => setShowIdeChat((p) => !p) }]
        : []),
      { id: 'toggle-outline', label: 'Toggle Outline', action: () => { setShowOutline(p => !p); setShowExplorer(true) } },
      { id: 'toggle-problems', label: 'Toggle Problems', action: () => { setShowTerminal(true); setBottomTab('problems') } },
      { id: 'toggle-minimap', label: `Minimap: ${showMinimap ? 'Off' : 'On'}`, action: () => setShowMinimap(p => !p) },
      { id: 'toggle-wordwrap', label: `Word Wrap: ${wordWrap === 'on' ? 'Off' : 'On'}`, shortcut: 'Alt+Z', action: () => setWordWrap(w => w === 'on' ? 'off' : 'on') },
      { id: 'toggle-autosave', label: `Auto Save: ${autoSave ? 'Off' : 'On'}`, action: () => setAutoSave(p => !p) },
      { id: 'toggle-ligatures', label: `Ligatures: ${fontLigatures ? 'Off' : 'On'}`, action: () => setFontLigatures(p => !p) },
      { id: 'toggle-brackets', label: `Bracket Colors: ${bracketPairColorization ? 'Off' : 'On'}`, action: () => setBracketPairColorization(p => !p) },
      { id: 'toggle-sticky', label: `Sticky Scroll: ${stickyScroll ? 'Off' : 'On'}`, action: () => setStickyScroll(p => !p) },
      { id: 'font+', label: 'Increase Font Size', shortcut: 'Ctrl+=', action: () => setFontSize(s => Math.min(s + 1, 32)) },
      { id: 'font-', label: 'Decrease Font Size', shortcut: 'Ctrl+-', action: () => setFontSize(s => Math.max(s - 1, 10)) },
      { id: 'font0', label: 'Reset Font Size', shortcut: 'Ctrl+0', action: () => setFontSize(14) },
      { id: 'settings', label: 'Open Settings', action: () => { setShowSettings(true); setShowExplorer(true) } },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', action: () => setShowShortcuts(true) },
      { id: 'clear-terminal', label: 'Clear Terminal', action: () => setTerminalHistory([]) },
      { id: 'clear-problems', label: 'Clear Problems', action: () => { setProblems([]); setQualityProblems([]) } },
      { id: 'search-files', label: 'Search Across Files', shortcut: 'Ctrl+Shift+F', action: () => { setShowSearch(true); setShowExplorer(true) } },
      { id: 'close-file', label: 'Close File', shortcut: 'Ctrl+W', action: () => { if (activeItemId) handleCloseTab(activeItemId) } },
      { id: 'duplicate', label: 'Duplicate File', shortcut: 'Ctrl+D', action: () => { if (activeItemId) handleDuplicate(activeItemId) } },
      { id: 'monaco-palette', label: 'Monaco Command Palette', shortcut: 'F1', action: () => editorRef.current?.getAction('editor.action.quickCommand')?.run() },
      ...THEMES.map(t => ({ id: `theme-${t.id}`, label: `Theme: ${t.label}`, action: () => setTheme(t.id) })),
      ...items.map(item => ({ id: `open-${item.id}`, label: `Open: ${item.filename || item.language}`, action: () => setActiveItemId(item.id) })),
    ]
    const f = commandFilter.toLowerCase()
    return f ? cmds.filter(c => c.label.toLowerCase().includes(f)) : cmds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandFilter, items, canRun, handleRun, handleFormat, handleCopy, handleDownload, handleSave, setActiveItemId, showMinimap, wordWrap, autoSave, fontLigatures, bracketPairColorization, stickyScroll, zenMode, splitEditor, diffMode, activeItemId, splitFileId, diffTargetId, handleCloseTab, handleDuplicate, ideChatOnSend, showIdeChat])

  const openFileExplorerBadges = useMemo(() => {
    const m = new Map<string, { ids: JarvisExplorerBadgeId[]; counts: ReturnType<typeof countProblemsForFile>; coveragePct: number | null | undefined }>()
    for (const item of items) {
      const counts = countProblemsForFile(displayProblems, item.filename)
      const ids = computeExplorerBadgesForFile({
        filename: item.filename,
        language: item.language,
        diskPath: item.diskPath,
        workspaceRoot,
        gitPorcelain: gitPorcelainMap,
        problems: displayProblems,
        isDirtyBuffer: item.id === activeItemId && modified,
        isActive: item.id === activeItemId,
        meta: item.jarvisExplorer,
        missingLogicDetections: missingLogicAnalysis.byFile.get(item.id) ?? [],
      })
      m.set(item.id, { ids, counts, coveragePct: item.jarvisExplorer?.test?.coveragePct })
    }
    return m
  }, [items, displayProblems, workspaceRoot, gitPorcelainMap, modified, activeItemId, missingLogicAnalysis])

  const repoExplorerBadges = useMemo(
    () => computeRepoLevelGitBadges(gitPorcelainMap, gitRemoteCounts),
    [gitPorcelainMap, gitRemoteCounts]
  )

  const workspaceTreeNodes = useMemo(() => buildWorkspaceTreeFromRelPaths(workspaceRelFiles), [workspaceRelFiles])

  const workspacePathBadges = useMemo(() => {
    const m = new Map<string, JarvisExplorerBadgeId[]>()
    for (const rel of workspaceRelFiles) {
      m.set(rel, computeExplorerBadgesForWorkspaceRelPath(rel, gitPorcelainMap))
    }
    return m
  }, [workspaceRelFiles, gitPorcelainMap])

  if (!open) return null

  // Pre-compute terminal display values to avoid nested ternaries in JSX
  const termHasSession = terminalSessionId != null
  let termEmptyLabel: string
  if (!hasElectronFs) termEmptyLabel = 'Terminal requires the desktop app. Run code with Ctrl+Enter.'
  else if (termHasSession) termEmptyLabel = 'Terminal ready — type a command below.'
  else termEmptyLabel = 'Starting terminal session…'

  const termCwdLabel = terminalCwd ?? workspaceRoot ?? (hasElectronFs ? 'Starting…' : 'Shell — desktop app required')
  const termPromptColor = termHasSession ? '#6a9955' : `${tc}50`
  const termPromptChar = termHasSession ? '❯' : '$'

  let termPlaceholder: string
  if (termHasSession) termPlaceholder = 'Type a command…'
  else if (hasElectronFs) termPlaceholder = 'Waiting for shell…'
  else termPlaceholder = 'Desktop app required'

  const termInputDisabled = !hasElectronFs || (!termHasSession && !workspaceRoot) || terminalShellBusy

  if (items.length === 0) addItem({ id: 'welcome', code: '// Welcome to Jarvis IDE\n// ========================\n//\n// Features:\n//   - Full Monaco Editor (VS Code engine)\n//   - AI Chat panel (Jarvis with full tools) — Ctrl+Shift+L\n//   - 10 themes (Ctrl+Shift+P > "theme")\n//   - Split editor, diff view\n//   - File templates (File > New from Template)\n//   - Code snippets for JS, TS, Python, HTML, CSS\n//   - Live preview for HTML/CSS/JS/Markdown\n//   - Problems panel, terminal, output\n//   - Search across files\n//   - Code outline & symbols\n//   - Settings panel with 15+ options\n//   - 40+ keyboard shortcuts\n//   - Zen mode (F11)\n//   - Auto-save\n//   - Jarvis has full autonomous control\n//\n// Press Ctrl+Shift+P for the Command Palette\n// Press F1 for Monaco\'s built-in commands\n\nconsole.log("Hello from Jarvis IDE!");\n', language: 'javascript', filename: 'welcome.js', createdAt: Date.now() })

  const editorOptions: monacoNs.editor.IStandaloneEditorConstructionOptions = {
    fontSize, fontFamily, fontLigatures, lineHeight, tabSize, insertSpaces: true,
    minimap: { enabled: showMinimap }, wordWrap, smoothScrolling: true,
    cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', cursorStyle,
    bracketPairColorization: { enabled: bracketPairColorization },
    guides: { bracketPairs: true, indentation: true, highlightActiveBracketPair: true, bracketPairsHorizontal: true },
    renderLineHighlight: 'all', scrollBeyondLastLine: false, automaticLayout: true,
    suggestOnTriggerCharacters: true, quickSuggestions: true,
    parameterHints: { enabled: true }, formatOnPaste: true, formatOnType: true,
    renderWhitespace, folding: true, foldingHighlight: true, showFoldingControls: 'always',
    matchBrackets: 'always', occurrencesHighlight: 'singleFile', selectionHighlight: true,
    links: true, colorDecorators: true, mouseWheelZoom: true, multiCursorModifier: 'ctrlCmd',
    dragAndDrop: true, lineNumbers, glyphMargin: true,
    rulers: rulers ? [80, 120] : [], stickyScroll: { enabled: stickyScroll },
    inlineSuggest: { enabled: true }, linkedEditing: true, autoClosingBrackets: 'always',
    autoClosingQuotes: 'always', autoSurround: 'languageDefined',
    suggest: { showMethods: true, showFunctions: true, showConstructors: true, showFields: true, showVariables: true, showClasses: true, showStructs: true, showInterfaces: true, showModules: true, showProperties: true, showEvents: true, showOperators: true, showUnits: true, showValues: true, showConstants: true, showEnums: true, showEnumMembers: true, showKeywords: true, showWords: true, showColors: true, showFiles: true, showReferences: true, showSnippets: true },
    accessibilitySupport: 'off', padding: { top: 8 },
    scrollbar: { verticalSliderSize: 10, horizontalSliderSize: 10 },
    overviewRulerLanes: 3, find: { seedSearchStringFromSelection: 'always', autoFindInSelection: 'multiline' },
  }

  const showBottom =
    showTerminal ||
    showProblems ||
    showSourceControl ||
    showRunDebug ||
    showExtensions ||
    showOutputTab ||
    showDebugConsole
  const sortedItems = [...items].sort((a, b) => { const ap = pinnedTabs.has(a.id) ? 0 : 1; const bp = pinnedTabs.has(b.id) ? 0 : 1; return ap - bp })

  const termColorMap: Record<string, string> = { stdout: tc, stderr: '#ce9178', error: '#f44747', info: '#569cd6' }
  const kindColorMap: Record<string, string> = { class: '#4ec9b0', function: '#dcdcaa', type: '#4fc1ff', import: '#c586c0' }
  const kindIconMap: Record<string, string> = { class: '◆', function: 'ƒ', type: 'T', import: '↓' }

  let editorPanelSize: number
  if (showIdeChat && ideChatOnSend && !zenMode) {
    editorPanelSize = showExplorer ? 58 : 72
  } else if (showExplorer && !zenMode) {
    editorPanelSize = 80
  } else {
    editorPanelSize = 100
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col select-none" style={{ background: bgColor, color: tc }}>
      <ToastHost scope="ide" />
      {/* ═══ TITLE BAR ═══ */}
      {!zenMode && (
        <div className="h-9 flex items-center px-2 gap-1 text-xs flex-shrink-0 border-b" style={{ background: tl, borderColor: bc }}>
          <span className="text-[#569cd6] font-bold text-sm mr-1">⟨/⟩</span>
          {/* Menu bar */}
          {showMenuBar && Object.entries(allMenus).map(([label, menuItems]) => (
            <div key={label} className="relative">
              <button className={cn('px-2 py-0.5 rounded text-xs', openMenuId === label ? 'bg-white/15' : 'hover:bg-white/10')}
                style={{ color: `${tc}b0` }}
                onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === label ? null : label) }}
                onMouseEnter={() => { if (openMenuId) setOpenMenuId(label) }}>
                {label}
              </button>
              {openMenuId === label && (
                <div className="absolute left-0 top-full mt-0.5 z-[70] rounded shadow-xl py-1 border text-[12px] min-w-[220px]" style={{ background: sb, borderColor: bc }}>
                  {menuItems.map((item, i) => {
                    if (item.label === '─') {
                      return <div key={`${label}-sep-${i}`} className="border-t my-1" style={{ borderColor: `${tc}15` }} />
                    }
                    const row = item as { label: string; shortcut?: string; action?: () => void; disabled?: boolean }
                    return (
                      <button key={`${row.label}-${i}`} type="button" disabled={row.disabled} className={cn('w-full px-3 py-1 text-left flex items-center justify-between', row.disabled ? 'opacity-30' : 'hover:bg-white/10')} style={{ color: tc }}
                        onClick={() => { row.action?.(); setOpenMenuId(null) }}>
                        <span>{row.label}</span>
                        {row.shortcut && <span className="text-[10px] ml-4" style={{ color: `${tc}40` }}>{row.shortcut}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          <div className="flex-1 text-center">
            <span style={{ color: `${tc}60` }} className="text-[11px]">
              {activeItem?.filename || 'Jarvis IDE'}{modified ? ' ●' : ''}
            </span>
          </div>
          <select value={theme} onChange={e => setTheme(e.target.value)} className="h-5 px-1 text-[10px] rounded border-0 outline-none cursor-pointer" style={{ background: `${tc}20`, color: tc }}>
            {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button onClick={() => onOpenChange(false)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#c42b1c] hover:text-white transition-colors ml-1" style={{ color: `${tc}90` }} aria-label="Close">✕</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ═══ ACTIVITY BAR ═══ */}
        {!zenMode && showActivityBar && (
          <div className="w-12 flex flex-col items-center py-2 gap-1 flex-shrink-0 border-r" style={{ background: ab, borderColor: bc }}>
            <ABBtn icon="📁" tip="Explorer (Ctrl+B)" active={showExplorer && !showSearch && !showSettings} onClick={() => { setShowExplorer(p => !p); setShowSearch(false); setShowSettings(false) }} />
            <ABBtn icon="🔍" tip="Search (Ctrl+Shift+F)" active={showSearch} onClick={() => { setShowSearch(p => !p); setShowExplorer(true); setShowSettings(false) }} />
            <ABBtn icon="📐" tip="Outline" active={showOutline} onClick={() => { setShowOutline(p => !p); setShowExplorer(true); setShowSettings(false) }} />
            <ABBtn icon="🖥" tip="Terminal (Ctrl+`)" active={showTerminal} onClick={() => setShowTerminal(p => !p)} />
            <ABBtn icon="👁" tip="Preview" active={showPreview} onClick={() => setShowPreview(p => !p)} badge={canPreview ? undefined : '!'} />
            {ideChatOnSend && (
              <ABBtn icon="💬" tip="AI Chat (Ctrl+Shift+L)" active={showIdeChat} onClick={() => setShowIdeChat((p) => !p)} />
            )}
            <ABBtn icon="⚡" tip="Problems" active={showProblems} onClick={() => { setShowProblems(p => !p); if (!showTerminal) { setShowTerminal(true); } setBottomTab('problems') }} badge={displayProblems.length > 0 ? String(displayProblems.length) : undefined} />
            <div className="flex-1" />
            <ABBtn icon="⌨" tip="Commands (Ctrl+Shift+P)" active={false} onClick={() => { setCommandPaletteOpen(true); setCommandFilter('') }} />
            <ABBtn icon="⚙" tip="Settings" active={showSettings} onClick={() => { setShowSettings(p => !p); setShowExplorer(true); setShowSearch(false) }} />
          </div>
        )}

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* ═══ SIDEBAR ═══ */}
          {showExplorer && !zenMode && (
            <>
              <ResizablePanel defaultSize={20} minSize={14} maxSize={35}>
                <div className="h-full flex flex-col" style={{ background: sb }}>
                  {showSettings && (
                    <SettingsPanel fontSize={fontSize} setFontSize={setFontSize} tabSize={tabSize} setTabSize={setTabSize}
                      showMinimap={showMinimap} setShowMinimap={setShowMinimap} wordWrap={wordWrap} setWordWrap={setWordWrap}
                      autoSave={autoSave} setAutoSave={setAutoSave} fontLigatures={fontLigatures} setFontLigatures={setFontLigatures}
                      bracketPairColorization={bracketPairColorization} setBracketPairColorization={setBracketPairColorization}
                      stickyScroll={stickyScroll} setStickyScroll={setStickyScroll} rulers={rulers} setRulers={setRulers}
                      renderWhitespace={renderWhitespace} setRenderWhitespace={setRenderWhitespace}
                      cursorStyle={cursorStyle} setCursorStyle={setCursorStyle}
                      lineHeight={lineHeight} setLineHeight={setLineHeight}
                      lineNumbers={lineNumbers} setLineNumbers={setLineNumbers}
                      fontFamily={fontFamily} setFontFamily={setFontFamily}
                      tc={tc} />
                  )}
                  {!showSettings && showSearch && (
                    <div className="flex flex-col h-full">
                      <div className="h-8 px-4 flex items-center text-[11px] uppercase tracking-wider font-semibold flex-shrink-0" style={{ color: `${tc}60` }}>Search</div>
                      <div className="px-3 pb-1 space-y-1">
                        <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search in all files..."
                          className="w-full h-7 px-2 text-xs rounded border outline-none" style={{ background: `${tc}15`, borderColor: `${tc}20`, color: tc }} />
                        <div className="flex items-center gap-1">
                          <button onClick={() => setShowReplace(p => !p)} className="text-[10px] px-1 rounded" style={{ color: `${tc}50` }}>{showReplace ? '▼' : '▶'} Replace</button>
                        </div>
                        {showReplace && (
                          <div className="flex gap-1">
                            <input value={replaceQuery} onChange={e => setReplaceQuery(e.target.value)} placeholder="Replace with..."
                              className="flex-1 h-7 px-2 text-xs rounded border outline-none" style={{ background: `${tc}15`, borderColor: `${tc}20`, color: tc }} />
                            <button onClick={handleReplaceAll} className="text-[10px] px-2 h-7 rounded" style={{ background: `${tc}15`, color: tc }}>All</button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto px-1 text-[11px]">
                        {searchResults.length > 0 && <div className="px-3 py-1" style={{ color: `${tc}40` }}>{searchResults.length} result{searchResults.length === 1 ? '' : 's'}</div>}
                        {searchResults.length === 0 && searchQuery && <div className="px-3 py-2" style={{ color: `${tc}40` }}>No results</div>}
                        {searchResults.map((r, i) => (
                          <button key={`${r.fileId}-${r.line}-${i}`} onClick={() => { setActiveItemId(r.fileId); setTimeout(() => editorRef.current?.revealLineInCenter(r.line), 100) }}
                            className="w-full text-left px-3 py-1 rounded-sm hover:bg-white/10 truncate" style={{ color: `${tc}90` }}>
                            <span style={{ color: `${tc}50` }}>{r.filename}:{r.line}</span> {r.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!showSettings && !showSearch && (
                    <div className="flex flex-col flex-1 min-h-0 h-full">
                      <div className="h-8 px-3 flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold flex-shrink-0 gap-2" style={{ color: `${tc}60` }}>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="flex-shrink-0">Explorer</span>
                          {workspaceRoot && (
                            <span className="text-[8px] font-normal normal-case truncate opacity-70 max-w-[90px]" title={workspaceRoot}>
                              {workspaceRoot.replace(/[/\\]{1,500}$/, '').split(/[/\\]/).pop()}
                            </span>
                          )}
                          {repoExplorerBadges.length > 0 && (
                            <JarvisExplorerBadgeStrip ids={repoExplorerBadges} tc={tc} className="normal-case" />
                          )}
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0 items-center">
                          <button type="button" onClick={() => setTemplateDialog(true)} title="New from Template" className="hover:opacity-100 opacity-50 text-sm">📋</button>
                          <button type="button" onClick={() => setNewFileDialog(true)} title="New File" className="hover:opacity-100 opacity-50 text-sm font-bold">+</button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                title="Explorer actions (quality, problems)"
                                className="hover:opacity-100 opacity-50 text-sm px-0.5 leading-none w-6 text-center"
                              >
                                ⋯
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[240px]">
                              <DropdownMenuItem
                                disabled={!workspaceRoot || !hasElectronFs || qualityLoading}
                                onClick={() => { handleRunWorkspaceQuality().catch(() => {}) }}
                              >
                                Run workspace quality (ESLint, tsc, GraphQL, Sonar)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setShowTerminal(true)
                                  setShowProblems(true)
                                  setBottomTab('problems')
                                }}
                              >
                                Open Problems
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {workspaceRoot ? (
                        <div className="flex-shrink-0 flex flex-col border-b min-h-0" style={{ borderColor: bc }}>
                          <button
                            type="button"
                            onClick={() => setWorkspaceTreeOpen((o) => !o)}
                            className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-left flex-shrink-0"
                            style={{ color: `${tc}50` }}
                          >
                            <span className="w-3 flex-shrink-0">{workspaceTreeOpen ? '▼' : '▶'}</span>
                            <span>Workspace</span>
                            <span style={{ color: `${tc}35` }}>({workspaceRelFiles.length})</span>
                            <JarvisExplorerBadgeStrip ids={['tree-workspace-folder']} tc={tc} className="ml-auto normal-case" />
                          </button>
                          {workspaceTreeOpen && (
                            <div className="max-h-[min(38vh,340px)] min-h-[56px] overflow-y-auto px-1 pb-1.5">
                              {!hasElectronFs && (
                                <p className="px-2 py-2 text-[10px] leading-snug" style={{ color: `${tc}55` }}>
                                  A full folder tree needs the Jarvis desktop app. In the browser, only the folder name is available — use File → Open Folder in the desktop build to browse files.
                                </p>
                              )}
                              {hasElectronFs && workspaceWalkLoading && (
                                <p className="px-2 py-2 text-[10px]" style={{ color: `${tc}45` }}>Scanning workspace…</p>
                              )}
                              {hasElectronFs && !workspaceWalkLoading && workspaceRelFiles.length === 0 && (
                                <p className="px-2 py-2 text-[10px] leading-snug" style={{ color: `${tc}45` }}>
                                  No project files indexed yet. Use File → Open Folder… or reopen this workspace.
                                </p>
                              )}
                              {hasElectronFs && !workspaceWalkLoading && workspaceTreeNodes.length > 0 && (
                                <WorkspaceRelPathTree
                                  nodes={workspaceTreeNodes}
                                  depth={0}
                                  folderPrefix=""
                                  expandedDirs={explorerExpandedDirs}
                                  onToggleDir={toggleExplorerDir}
                                  tc={tc}
                                  fileBadges={workspacePathBadges}
                                  onOpenRelPath={(rel) => { void openWorkspaceRelPath(rel) }}
                                  onDeleteRelPath={(rel) => { void deleteWorkspaceRelPath(rel) }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <div className="flex-1 min-h-0 overflow-y-auto px-1">
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${tc}40` }}>Open Files ({items.length})</div>
                        {sortedItems.map((item) => {
                          const bi = openFileExplorerBadges.get(item.id)
                          const ids = bi?.ids ?? []
                          const counts = bi?.counts
                          return (
                            <button key={item.id} type="button" onClick={() => setActiveItemId(item.id)}
                              onContextMenu={e => { e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, id: item.id }) }}
                              className={cn('w-full flex items-center gap-1 px-2 py-1 text-[12px] rounded-sm transition-colors text-left', item.id === activeItemId ? 'bg-white/10' : 'hover:bg-white/5')}
                              style={{ color: item.id === activeItemId ? tc : `${tc}b0` }}>
                              {pinnedTabs.has(item.id) && <span className="text-[8px] flex-shrink-0">📌</span>}
                              <span className="text-[10px] flex-shrink-0 w-[22px] text-center">{LI[item.language] || '📄'}</span>
                              <span className="truncate min-w-0 flex-1">{item.filename || `${item.language} snippet`}</span>
                              <JarvisExplorerBadgeStrip
                                ids={ids}
                                tc={tc}
                                diagCounts={{ errors: counts?.errors, warnings: counts?.warnings, infos: counts?.infos, hints: counts?.hints }}
                                coveragePct={bi?.coveragePct}
                              />
                            </button>
                          )
                        })}
                      </div>
                      {showOutline && (
                        <div className="border-t flex-shrink-0 max-h-[40%] overflow-y-auto" style={{ borderColor: bc }}>
                          <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${tc}40` }}>Outline ({outlineSymbols.length})</div>
                          {outlineSymbols.length === 0 && <div className="px-4 py-2 text-[11px]" style={{ color: `${tc}30` }}>No symbols found</div>}
                          {outlineSymbols.map((sym, i) => (
                            <button key={`${sym.line}-${i}`} onClick={() => editorRef.current?.revealLineInCenter(sym.line)}
                              className="w-full text-left px-3 py-0.5 text-[11px] hover:bg-white/10 truncate flex items-center gap-1.5" style={{ color: `${tc}70` }}>
                              <span className="text-[9px] flex-shrink-0" style={{ color: kindColorMap[sym.kind] ?? '#9cdcfe' }}>
                                {kindIconMap[sym.kind] ?? '●'}
                              </span>
                              {sym.name}
                              <span className="ml-auto text-[9px]" style={{ color: `${tc}30` }}>:{sym.line}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* ═══ EDITOR AREA ═══ */}
          <ResizablePanel defaultSize={editorPanelSize}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={showBottom ? 65 : 100}>
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={showPreview || splitEditor ? 55 : 100}>
                    <div className="h-full flex flex-col" style={{ background: bgColor }}>
                      {/* Tabs */}
                      {!zenMode && (
                        <div className="h-9 flex items-center overflow-x-auto flex-shrink-0 scrollbar-thin" style={{ background: sb, borderBottom: `1px solid ${bc}` }}>
                          {sortedItems.map(item => (
                            <button key={item.id} onClick={() => setActiveItemId(item.id)}
                              onContextMenu={e => { e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, id: item.id }) }}
                              className="group flex items-center gap-1.5 px-3 h-full text-[12px] min-w-0 flex-shrink-0"
                              style={{ background: item.id === activeItemId ? bgColor : 'transparent', color: item.id === activeItemId ? tc : `${tc}70`, borderRight: `1px solid ${bc}`, borderTop: item.id === activeItemId ? '2px solid #007acc' : '2px solid transparent' }}>
                              {pinnedTabs.has(item.id) && <span className="text-[7px]">📌</span>}
                              <span className="text-[9px] flex-shrink-0">{LI[item.language] || '📄'}</span>
                              <span className="truncate max-w-[120px]">{item.filename || `${item.language}`}</span>
                              {(() => {
                                const bi = openFileExplorerBadges.get(item.id)
                                const ids = bi?.ids ?? []
                                const tabIds = ids.slice(0, 5)
                                if (tabIds.length === 0) return null
                                return (
                                  <JarvisExplorerBadgeStrip
                                    ids={tabIds}
                                    tc={tc}
                                    diagCounts={{ errors: bi?.counts?.errors, warnings: bi?.counts?.warnings, infos: bi?.counts?.infos, hints: bi?.counts?.hints }}
                                    coveragePct={bi?.coveragePct}
                                    className="max-w-[72px]"
                                  />
                                )
                              })()}
                              {item.id === activeItemId && modified && <span className="text-[10px] ml-0.5" style={{ color: '#e8ab6a' }}>●</span>}
                              {!pinnedTabs.has(item.id) && (
                                <button type="button" tabIndex={0} onClick={e => handleCloseTab(item.id, e)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { handleCloseTab(item.id); } }} className="ml-1 w-4 h-4 flex items-center justify-center rounded text-[10px] opacity-0 group-hover:opacity-100 hover:bg-white/20 flex-shrink-0 bg-transparent border-0 p-0 cursor-pointer" style={{ color: 'inherit' }}>✕</button>
                              )}
                            </button>
                          ))}
                          <button onClick={() => setNewFileDialog(true)} className="h-full px-2 flex items-center text-lg hover:bg-white/5 flex-shrink-0" style={{ color: `${tc}40` }} title="New File">+</button>
                        </div>
                      )}
                      {/* Breadcrumbs */}
                      {!zenMode && activeItem && (
                        <div className="h-6 px-4 flex items-center gap-1 text-[11px] flex-shrink-0" style={{ color: `${tc}50`, borderBottom: `1px solid ${bc}` }}>
                          <span style={{ color: `${tc}30` }}>workspace</span> <span style={{ color: `${tc}20` }}>›</span>
                          <span>{activeItem.filename || 'untitled'}</span>
                          {autoSave && <span className="ml-1 text-[9px]" style={{ color: `${tc}20` }}>[auto-save]</span>}
                          {modified && <span className="text-[9px]" style={{ color: '#e8ab6a' }}>(modified)</span>}
                        </div>
                      )}
                      {/* Toolbar */}
                      {!zenMode && (
                        <div className="h-8 px-2 flex items-center gap-0.5 flex-shrink-0" style={{ background: tb, borderBottom: `1px solid ${bc}` }}>
                          <TBtn icon="▶" label="Run" onClick={handleRun} disabled={!canRun || running} highlight tc={tc} />
                          <div className="w-px h-4 mx-1" style={{ background: bc }} />
                          <TBtn icon="↩" label="Undo" onClick={() => editorRef.current?.trigger('keyboard', 'undo', null)} tc={tc} />
                          <TBtn icon="↪" label="Redo" onClick={() => editorRef.current?.trigger('keyboard', 'redo', null)} tc={tc} />
                          <div className="w-px h-4 mx-1" style={{ background: bc }} />
                          <TBtn icon="📋" label="Copy" onClick={handleCopy} tc={tc} />
                          <TBtn icon="💾" label="Save" onClick={handleSave} tc={tc} />
                          <TBtn icon="⬇" label="Download" onClick={handleDownload} tc={tc} />
                          <TBtn icon="🎨" label="Format" onClick={handleFormat} tc={tc} />
                          <TBtn
                            icon="🔎"
                            label="Quality"
                            onClick={() => { handleRunWorkspaceQuality().catch(() => {}) }}
                            disabled={!workspaceRoot || !hasElectronFs || qualityLoading}
                            tc={tc}
                          />
                          <div className="w-px h-4 mx-1" style={{ background: bc }} />
                          <TBtn icon="↔" label="Split" onClick={() => { setSplitEditor(p => !p); if (!splitFileId && activeItemId) setSplitFileId(activeItemId) }} active={splitEditor} tc={tc} />
                          <TBtn icon="⇄" label="Diff" onClick={() => { setDiffMode(p => !p); if (!diffTargetId) { const o = items.find(i => i.id !== activeItemId); if (o) setDiffTargetId(o.id) } }} active={diffMode} tc={tc} disabled={items.length < 2} />
                          <TBtn icon="👁" label="Preview" onClick={() => setShowPreview(p => !p)} active={showPreview} disabled={!canPreview} tc={tc} />
                          <div className="flex-1" />
                          <select value={editedLang} onChange={e => { setEditedLang(e.target.value); if (activeItemId) updateItem(activeItemId, { language: e.target.value }) }}
                            className="h-6 px-2 text-[11px] rounded border-0 outline-none cursor-pointer" style={{ background: `${tc}15`, color: tc }}>
                            {MONACO_LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Editor */}
                      <div className="flex-1 min-h-0">
                        {diffMode && diffTargetId ? (
                          <DiffEditor original={items.find(i => i.id === diffTargetId)?.code || ''} modified={editedCode}
                            language={mLang(editedLang)} theme={theme} options={{ ...editorOptions, renderSideBySide: true, readOnly: false }} />
                        ) : (
                          <Editor language={mLang(editedLang)} value={editedCode} onChange={val => setEditedCode(val || '')}
                            onMount={handleEditorMount} theme={theme} options={editorOptions} />
                        )}
                      </div>
                    </div>
                  </ResizablePanel>

                  {(showPreview || splitEditor) && (
                    <>
                      <ResizableHandle withHandle />
                      <ResizablePanel defaultSize={splitEditor ? 50 : 45} minSize={20}>
                        {splitEditor && !showPreview ? (
                          <div className="h-full flex flex-col" style={{ background: bgColor }}>
                            <div className="h-9 flex items-center px-3 text-xs flex-shrink-0" style={{ background: sb, borderBottom: `1px solid ${bc}` }}>
                              <select value={splitFileId || ''} onChange={e => setSplitFileId(e.target.value)} className="text-[11px] rounded border-0 outline-none" style={{ background: 'transparent', color: tc }}>
                                {items.map(i => <option key={i.id} value={i.id}>{i.filename || i.language}</option>)}
                              </select>
                            </div>
                            <div className="flex-1 min-h-0">
                              <Editor language={mLang(splitFile?.language || 'javascript')} value={splitFile?.code || ''} theme={theme}
                                onChange={val => { if (splitFileId) updateItem(splitFileId, { code: val || '' }) }}
                                options={{ ...editorOptions, readOnly: false }} />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col" style={{ background: bgColor }}>
                            <div className="h-9 flex items-center px-4 gap-2 text-xs flex-shrink-0" style={{ background: sb, borderBottom: `1px solid ${bc}` }}>
                              <span style={{ color: `${tc}60` }}>Preview — {editedLang.toUpperCase()}</span>
                              <div className="flex-1" />
                              <button onClick={() => writePreview(editedCode, editedLang)}
                                className="text-[10px] px-2 py-0.5 rounded" style={{ background: `${tc}20`, color: `${tc}70` }}>↻ Refresh</button>
                            </div>
                            <div className="flex-1" style={{ background: editedLang === 'javascript' || editedLang === 'typescript' || editedLang === 'json' ? '#1e1e1e' : 'white' }}>
                              <iframe ref={previewRef} className="w-full h-full border-none" title="Preview" sandbox="allow-scripts allow-same-origin" />
                            </div>
                          </div>
                        )}
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>

              {/* ═══ BOTTOM PANEL ═══ */}
              {showBottom && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={12} maxSize={60}>
                    <div className="h-full flex flex-col" style={{ background: bgColor }}>
                      <div className="h-9 flex items-center px-4 gap-3 text-xs flex-shrink-0" style={{ background: sb, borderTop: `1px solid ${bc}` }}>
                        {(['terminal', 'problems', 'output', 'debug', 'git', 'extensions', 'run'] as const).map(tab => (
                          <button key={tab} onClick={() => setBottomTab(tab)} className="pb-0.5 px-1 flex items-center gap-1"
                            style={{ color: bottomTab === tab ? tc : `${tc}50`, borderBottom: bottomTab === tab ? '2px solid #569cd6' : '2px solid transparent' }}>
                            {tab === 'git' ? 'Git' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            {tab === 'problems' && displayProblems.length > 0 && <span className="text-[9px] px-1 rounded-full bg-red-500 text-white">{displayProblems.length}</span>}
                          </button>
                        ))}
                        <div className="flex-1" />
                        {bottomTab === 'terminal' && terminalSessionId == null && hasElectronFs && (
                          <button onClick={() => restartTerminalSession()}
                            className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#569cd620', color: '#569cd6' }}>↻ New</button>
                        )}
                        <button onClick={() => { if (bottomTab === 'terminal') { setTerminalHistory([]); } if (bottomTab === 'problems') { setProblems([]); setQualityProblems([]) } }}
                          className="text-[10px] px-2 py-0.5 rounded" style={{ background: `${tc}15`, color: `${tc}50` }}>Clear</button>
                        <button onClick={() => { setShowTerminal(false); setShowProblems(false) }} style={{ color: `${tc}40` }} className="text-sm hover:opacity-80">✕</button>
                      </div>
                      <div className="flex-1 flex flex-col min-h-0">
                        {bottomTab === 'terminal' ? (
                          <>
                            <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5 min-h-0">
                              {terminalHistory.length === 0 && (
                                <span style={{ color: `${tc}30` }}>{termEmptyLabel}</span>
                              )}
                              {terminalHistory.map((e, i) => (
                                <div
                                  key={`${e.time}-${i}`}
                                  className="whitespace-pre-wrap"
                                  style={{ color: termColorMap[e.type] ?? tc }}
                                >
                                  {e.text}
                                </div>
                              ))}
                              {running && <div className="text-[#569cd6] animate-pulse">Running code…</div>}
                              {terminalShellBusy && <div className="text-[#569cd6] animate-pulse">Running shell…</div>}
                              <div ref={terminalEndRef} />
                            </div>
                            <div className="flex-shrink-0 border-t px-2 py-1.5" style={{ borderColor: bc, background: sb }}>
                              <div className="text-[10px] truncate mb-1 px-1" style={{ color: `${tc}45` }} title={terminalCwd ?? workspaceRoot ?? undefined}>
                                {termCwdLabel}
                              </div>
                              <div className="flex items-center gap-2">
                                <span style={{ color: termPromptColor }} className="font-mono text-[12px] select-none">
                                  {termPromptChar}
                                </span>
                                <input
                                  type="text"
                                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[12px]"
                                  style={{ color: tc }}
                                  placeholder={termPlaceholder}
                                  value={terminalInput}
                                  onChange={(e) => setTerminalInput(e.target.value)}
                                  disabled={termInputDisabled}
                                  // eslint-disable-next-line sonarjs/cognitive-complexity -- terminal input handles Enter, history scroll, and Ctrl+C in one co-located handler
                                  onKeyDown={(e) => { // NOSONAR terminal input intentionally handles Enter/history/interrupt keys in one local handler
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      const line = terminalInput
                                      setTerminalInput('')
                                      runTerminalLine(line).catch(() => {})
                                    }
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault()
                                      if (cmdHistory.length === 0) return
                                      const nextIdx = cmdHistoryIdx < 0 ? cmdHistory.length - 1 : Math.max(0, cmdHistoryIdx - 1)
                                      setCmdHistoryIdx(nextIdx)
                                      setTerminalInput(cmdHistory[nextIdx] ?? '')
                                    }
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault()
                                      if (cmdHistoryIdx < 0) return
                                      const nextIdx = cmdHistoryIdx + 1
                                      if (nextIdx >= cmdHistory.length) {
                                        setCmdHistoryIdx(-1)
                                        setTerminalInput('')
                                      } else {
                                        setCmdHistoryIdx(nextIdx)
                                        setTerminalInput(cmdHistory[nextIdx] ?? '')
                                      }
                                    }
                                    if (e.key === 'c' && e.ctrlKey) {
                                      e.preventDefault()
                                      if (terminalSessionRef.current != null && hasElectronFs) {
                                        const ide = (globalThis as unknown as { jarvisIde: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
                                        ide.terminalWrite({ id: terminalSessionRef.current, data: '\x03' })
                                      }
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5">
                            {bottomTab === 'problems' && (<>
                              {displayProblems.length === 0 && <span style={{ color: `${tc}30` }}>No problems detected.</span>}
                              {displayProblems.map((p, i) => (
                                <button key={`${p.source}:${p.line}:${p.column}-${i}`} onClick={() => editorRef.current?.revealLineInCenter(p.line)} className="w-full text-left flex items-start gap-2 py-0.5 hover:bg-white/5 rounded">
                                  <span className="text-red-400 text-[10px] mt-0.5">●</span>
                                  <span style={{ color: `${tc}50` }} className="text-[11px] flex-shrink-0">{p.source}:{p.line}:{p.column}</span>
                                  <span style={{ color: `${tc}90` }}>{p.message}</span>
                                </button>
                              ))}
                            </>)}
                            {bottomTab === 'output' && (<>
                              {!runResult && <span style={{ color: `${tc}30` }}>Run code to see output.</span>}
                              {runResult?.stdout && <div style={{ color: tc }} className="whitespace-pre-wrap">{runResult.stdout}</div>}
                              {runResult?.stderr && <div className="text-[#ce9178] whitespace-pre-wrap">{runResult.stderr}</div>}
                              {runResult?.error && <div className="text-[#f44747] whitespace-pre-wrap">{runResult.error}</div>}
                            </>)}
                            {bottomTab === 'debug' && (<>
                              {debugLogLines.length === 0 && <span style={{ color: `${tc}30` }}>Start debugging from Run → Start Debugging (F5).</span>}
                              {debugLogLines.map((line, i) => <div key={`debug-${line.slice(0, 20)}-${i}`} className="whitespace-pre-wrap" style={{ color: `${tc}90` }}>{line}</div>)}
                            </>)}
                            {bottomTab === 'git' && (<>
                              {!workspaceRoot && <span style={{ color: `${tc}30` }}>Open a folder (File → Open Folder…) to use Git. Desktop app required for git.</span>}
                              {workspaceRoot && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap gap-1.5 mb-1">
                                    {[
                                      { label: 'Status', args: ['status', '-sb'] },
                                      { label: 'Diff', args: ['diff', '--stat'] },
                                      { label: 'Log', args: ['log', '--oneline', '-15'] },
                                      { label: 'Stage All', args: ['add', '-A'] },
                                      { label: 'Pull', args: ['pull'] },
                                      { label: 'Push', args: ['push'] },
                                    ].map(({ label, args }) => (
                                      <button
                                        key={label}
                                        type="button"
                                        disabled={gitLoading}
                                        className="text-[11px] px-2 py-0.5 rounded"
                                        style={{ background: `${tc}15`, color: `${tc}90` }}
                                        onClick={async () => {
                                          if (!workspaceRoot) return
                                          setGitLoading(true)
                                          const r = await ideGit(workspaceRoot, args)
                                          setGitOutput(r.ok ? (r.stdout || r.stderr || '(done)').trim() : (r.error || r.stderr || 'git failed'))
                                          setGitLoading(false)
                                        }}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      disabled={gitLoading}
                                      className="text-[11px] px-2 py-0.5 rounded"
                                      style={{ background: `${tc}15`, color: '#6a9955' }}
                                      onClick={async () => {
                                        if (!workspaceRoot) return
                                        const msg = globalThis.prompt('Commit message')
                                        if (!msg?.trim()) return
                                        setGitLoading(true)
                                        const r = await ideGit(workspaceRoot, ['commit', '-m', msg.trim()])
                                        setGitOutput(r.ok ? (r.stdout || '(committed)').trim() : (r.error || r.stderr || 'commit failed'))
                                        setGitLoading(false)
                                      }}
                                    >
                                      Commit
                                    </button>
                                  </div>
                                  {gitLoading && <span style={{ color: `${tc}50` }}>Running git…</span>}
                                  {!gitLoading && <pre className="whitespace-pre-wrap text-[11px]" style={{ color: tc }}>{gitOutput || '(no output)'}</pre>}
                                </div>
                              )}
                            </>)}
                            {bottomTab === 'extensions' && (<>
                              {!workspaceRoot && <span style={{ color: `${tc}30` }}>Open a workspace folder to view installed packages.</span>}
                              {workspaceRoot && !extensionsPackageJson && <span style={{ color: `${tc}50` }}>Loading package.json…</span>}
                              {workspaceRoot && extensionsPackageJson && (() => {
                                try {
                                  const pkg = JSON.parse(extensionsPackageJson)
                                  const toDisplayVersion = (value: unknown): string => {
                                    if (typeof value === 'string') return value
                                    if (typeof value === 'number') return value.toString()
                                    if (typeof value === 'boolean') return value.toString()
                                    if (typeof value === 'bigint') return value.toString()
                                    if (value == null) return ''
                                    try {
                                      return JSON.stringify(value)
                                    } catch {
                                      return Object.prototype.toString.call(value)
                                    }
                                  }
                                  const deps: Array<[string, string]> = Object.entries(pkg.dependencies ?? {}).map(([k, v]) => [k, toDisplayVersion(v)])
                                  const devDeps: Array<[string, string]> = Object.entries(pkg.devDependencies ?? {}).map(([k, v]) => [k, toDisplayVersion(v)])
                                  return (
                                    <div className="space-y-3">
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${tc}50` }}>
                                          {pkg.name ?? 'Project'} {pkg.version ? `v${pkg.version}` : ''}
                                        </div>
                                        {pkg.description && <div className="text-[11px] mb-2" style={{ color: `${tc}60` }}>{pkg.description}</div>}
                                      </div>
                                      {deps.length > 0 && (
                                        <div>
                                          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${tc}50` }}>
                                            Dependencies ({deps.length})
                                          </div>
                                          {deps.map(([name, ver]) => (
                                            <div key={name} className="flex items-center gap-2 py-0.5 text-[11px]">
                                              <span style={{ color: '#4fc1ff' }}>📦</span>
                                              <span style={{ color: tc }}>{name}</span>
                                              <span className="ml-auto" style={{ color: `${tc}50` }}>{ver}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {devDeps.length > 0 && (
                                        <div>
                                          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${tc}50` }}>
                                            Dev Dependencies ({devDeps.length})
                                          </div>
                                          {devDeps.map(([name, ver]) => (
                                            <div key={name} className="flex items-center gap-2 py-0.5 text-[11px]">
                                              <span style={{ color: '#ce9178' }}>🔧</span>
                                              <span style={{ color: tc }}>{name}</span>
                                              <span className="ml-auto" style={{ color: `${tc}50` }}>{ver}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                } catch {
                                  return <pre className="whitespace-pre-wrap text-[11px]" style={{ color: tc }}>{extensionsPackageJson}</pre>
                                }
                              })()}
                            </>)}
                            {bottomTab === 'run' && (<>
                              <div className="mb-2 flex flex-wrap gap-2 text-[11px]" style={{ color: `${tc}80` }}>
                                <button type="button" className="rounded px-2 py-0.5" style={{ background: `${tc}15` }} onClick={() => { handleRun().catch(() => {}) }} disabled={!canRun || running}>Run</button>
                                <span>{debuggingActive ? 'Debugging: on' : 'Debugging: off'}</span>
                              </div>
                              {terminalHistory.length === 0 && <span style={{ color: `${tc}30` }}>Terminal output for this run appears here.</span>}
                              {terminalHistory.map((e, i) => <div key={`r${e.time}-${i}`} className="whitespace-pre-wrap" style={{ color: termColorMap[e.type] ?? tc }}>{e.text}</div>)}
                            </>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {showIdeChat && ideChatOnSend && !zenMode && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={22} minSize={16} maxSize={42}>
                <IdeChatPanel
                  messages={ideChatMessages}
                  loading={ideChatLoading}
                  disabled={false}
                  onSend={handleIdeChatSend}
                  onClear={clearIdeChat}
                  themeColors={{ tc, sb, bc }}
                  openFiles={items.map((i) => ({ id: i.id, filename: i.filename || `untitled.${getExt(i.language)}`, language: i.language }))}
                  onGetFileContent={(fileId) => {
                    if (activeItemId === fileId) return editedCode
                    return items.find((i) => i.id === fileId)?.code ?? null
                  }}
                  onReview={handleJarvisReview}
                  reviewDisabled={!workspaceRoot || !hasElectronFs}
                  qualityLoading={qualityLoading}
                  undoKeepDisabled={true}
                  onUndoAll={() => toast.info('Composer multi-file undo coming in a future update.')}
                  onKeepAll={() => toast.info('Composer multi-file keep coming in a future update.')}
                  mode={ideChatMode}
                  onModeChange={(m) => {
                    setIdeChatMode(m)
                    if (m === 'agent') {
                      if (!autopilotOn) setAutopilotOn(true)
                    } else {
                      if (autopilotOn) setAutopilotOn(false)
                      setAutopilotStatus('idle')
                    }
                  }}
                  agentStatus={autopilotStatus}
                  onStopAgent={stopAutopilot}
                  model={ideChatModel}
                  onModelChange={setIdeChatModel}
                  modelOptions={ideChatModelOptions}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* ═══ STATUS BAR ═══ */}
      {!zenMode && showStatusBar && (
        <div className="h-6 bg-[#007acc] flex items-center px-3 text-[11px] text-white/90 flex-shrink-0 gap-3 cursor-default">
          <span className="flex items-center gap-1">{LI[editedLang] || '📄'} {editedLang}</span>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          {selectionInfo && <span>{selectionInfo}</span>}
          <span>Spaces: {tabSize}</span>
          <span>{eol}</span>
          <span>UTF-8</span>
          <button className="hover:text-white text-white/70" onClick={() => setShowMinimap(p => !p)}>Minimap: {showMinimap ? 'On' : 'Off'}</button>
          <button className="hover:text-white text-white/70" onClick={() => setWordWrap(w => w === 'on' ? 'off' : 'on')}>Wrap: {wordWrap === 'on' ? 'On' : 'Off'}</button>
          <button className="hover:text-white text-white/70" onClick={() => setAutoSave(p => !p)}>Auto-save: {autoSave ? 'On' : 'Off'}</button>
          <div className="flex-1" />
          <span className="text-white/50">{wordCount.lines} lines, {wordCount.words} words, {wordCount.chars} chars</span>
          {modified && <span className="text-yellow-200">● Modified</span>}
          {running && <span className="animate-pulse">● Running...</span>}
          {displayProblems.length > 0 && <span>⚠ {displayProblems.length}</span>}
          <span className="text-white/50">{items.length} file{items.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-300" />Jarvis IDE</span>
        </div>
      )}

      {/* ═══ DIALOGS ═══ */}
      {newFileDialog && <InputDialog title="New File" placeholder="filename (e.g. index.html, app.py)" value={newFileName} onChange={setNewFileName} onSubmit={handleNewFile} onClose={() => setNewFileDialog(false)} bg={sb} tc={tc} bc={bc} />}
      {renameDialog && <InputDialog title="Rename File" placeholder="New filename" value={renameValue} onChange={setRenameValue} onSubmit={handleRename} onClose={() => setRenameDialog(null)} bg={sb} tc={tc} bc={bc} />}

      {templateDialog && (
        <Overlay onClose={() => setTemplateDialog(false)}>
          <div className="rounded-lg shadow-2xl w-[520px] overflow-hidden border" style={{ background: sb, borderColor: bc }}>
            <div className="px-4 py-3 text-xs font-semibold" style={{ color: `${tc}60` }}>New from Template ({FILE_TEMPLATES.length} templates)</div>
            <div className="max-h-[450px] overflow-y-auto">
              {FILE_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => { addItem({ id: `code-${Date.now()}-${randomIdSegment()}`, code: t.code, language: t.language, filename: t.filename, createdAt: Date.now() }); setTemplateDialog(false) }}
                  className="w-full px-4 py-2.5 text-left hover:bg-white/10 flex items-center gap-3 border-b" style={{ borderColor: `${tc}08` }}>
                  <span className="text-lg w-7 text-center">{LI[t.language] || '📄'}</span>
                  <div><div className="text-sm font-medium" style={{ color: tc }}>{t.name}</div><div className="text-[11px]" style={{ color: `${tc}40` }}>{t.filename}</div></div>
                </button>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {commandPaletteOpen && (
        <Overlay onClose={() => setCommandPaletteOpen(false)}>
          <div className="rounded-lg shadow-2xl w-[560px] overflow-hidden border" style={{ background: sb, borderColor: '#007acc' }}>
            <input autoFocus value={commandFilter} onChange={e => setCommandFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setCommandPaletteOpen(false); } if (e.key === 'Enter' && commands[0]) { commands[0].action?.(); setCommandPaletteOpen(false) } }}
              placeholder="> Type a command..." className="w-full h-10 px-4 text-sm outline-none border-b" style={{ background: `${tc}10`, borderColor: bc, color: tc }} />
            <div className="max-h-[380px] overflow-y-auto">
              {commands.map(cmd => (
                <button key={cmd.id} disabled={cmd.disabled} onClick={() => { cmd.action?.(); setCommandPaletteOpen(false) }}
                  className={cn('w-full px-4 py-2 text-left text-[13px] flex items-center justify-between', cmd.disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10')}
                  style={{ color: `${tc}c0` }}>
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <span className="text-[10px] font-mono" style={{ color: `${tc}30` }}>{cmd.shortcut}</span>}
                </button>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {showShortcuts && (
        <Overlay onClose={() => setShowShortcuts(false)}>
          <div className="rounded-lg shadow-2xl w-[500px] max-h-[80vh] overflow-y-auto border" style={{ background: sb, borderColor: bc }}>
            <div className="px-4 py-3 text-sm font-semibold border-b flex items-center justify-between" style={{ color: tc, borderColor: bc }}>
              <span>Keyboard Shortcuts</span>
              <button onClick={() => setShowShortcuts(false)} className="text-sm" style={{ color: `${tc}50` }}>✕</button>
            </div>
            <div className="p-4 space-y-3 text-[12px]">
              {[
                ['General', [['Ctrl+Shift+P', 'Command Palette'], ['F1', 'Monaco Commands'], ['Ctrl+N', 'New File'], ['Ctrl+S', 'Save'], ['Ctrl+W', 'Close File'], ['Ctrl+D', 'Duplicate File'], ['F11', 'Zen Mode'], ['Esc', 'Close IDE']]],
                ['Editor', [['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+F', 'Find'], ['Ctrl+H', 'Replace'], ['Ctrl+G', 'Go to Line'], ['Ctrl+Enter', 'Run Code'], ['Shift+Alt+F', 'Format'], ['Ctrl+A', 'Select All']]],
                ['View', [['Ctrl+B', 'Toggle Explorer'], ['Ctrl+`', 'Toggle Terminal'], ['Ctrl+J', 'Toggle Terminal'], ['Ctrl+Shift+F', 'Search Files'], ['Ctrl+Shift+L', 'Toggle AI Chat'], ['Ctrl+\\', 'Split Editor'], ['Ctrl+=', 'Font +'], ['Ctrl+-', 'Font -'], ['Ctrl+0', 'Reset Font'], ['Alt+Z', 'Word Wrap']]],
              ].map(([section, shortcuts]) => (
                <div key={section as string}>
                  <div className="font-semibold mb-1" style={{ color: `${tc}60` }}>{section as string}</div>
                  {(shortcuts as string[][]).map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between py-0.5">
                      <span style={{ color: `${tc}80` }}>{desc}</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: `${tc}15`, color: `${tc}90` }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {tabContextMenu && (
        <div className="fixed z-[70] rounded shadow-xl py-1 border text-[12px] min-w-[200px]" style={{ left: tabContextMenu.x, top: tabContextMenu.y, background: sb, borderColor: bc }}>
          {[
            { label: 'Close', action: () => handleCloseTab(tabContextMenu.id) },
            { label: 'Close Others', action: () => { items.forEach(i => { if (i.id !== tabContextMenu.id && !pinnedTabs.has(i.id)) removeItem(i.id) }); setActiveItemId(tabContextMenu.id) } },
            { label: 'Close All', action: () => { items.forEach(i => { if (!pinnedTabs.has(i.id)) removeItem(i.id) }); setActiveItemId(null) } },
            { label: '─' },
            { label: pinnedTabs.has(tabContextMenu.id) ? 'Unpin' : 'Pin', action: () => { setPinnedTabs(prev => { const n = new Set(prev); if (n.has(tabContextMenu.id)) { n.delete(tabContextMenu.id); } else { n.add(tabContextMenu.id); } return n }) } },
            { label: 'Duplicate', action: () => handleDuplicate(tabContextMenu.id) },
            { label: 'Rename...', action: () => { const item = items.find(i => i.id === tabContextMenu.id); setRenameValue(item?.filename || ''); setRenameDialog(tabContextMenu.id) } },
            { label: '─' },
            { label: 'Copy Filename', action: () => { navigator.clipboard.writeText(items.find(i => i.id === tabContextMenu.id)?.filename || ''); toast.success('Copied') } },
            { label: 'Open in Split', action: () => { setSplitEditor(true); setSplitFileId(tabContextMenu.id) } },
            { label: 'Compare with Active...', action: () => { setDiffMode(true); setDiffTargetId(tabContextMenu.id) } },
          ].map((item, i) => item.label === '─' ? <div key={`ctx-sep-${i}`} className="border-t my-1" style={{ borderColor: `${tc}15` }} /> : ( // NOSONAR - static list, index key is stable
            <button key={item.label} onClick={() => { item.action?.(); setTabContextMenu(null) }} className="w-full px-3 py-1 text-left hover:bg-white/10" style={{ color: tc }}>{item.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function ABBtn({ icon, tip, active, onClick, badge }: Readonly<{ icon: string; tip: string; active: boolean; onClick: () => void; badge?: string }>) {
  return (
    <button onClick={onClick} title={tip} className={cn('w-10 h-10 flex items-center justify-center rounded text-base transition-colors relative', active ? 'text-white bg-white/15 border-l-2 border-white' : 'text-white/40 hover:text-white/70')}>
      {icon}
      {badge && <span className="absolute -top-0.5 -right-0.5 text-[8px] px-1 rounded-full bg-red-500 text-white leading-tight">{badge}</span>}
    </button>
  )
}

function TBtn({ icon, label, onClick, disabled, active, highlight, tc }: Readonly<{ icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean; highlight?: boolean; tc: string }>) {
  return <button onClick={onClick} disabled={disabled} title={label}
    className={cn('h-6 w-7 flex items-center justify-center rounded text-[12px] transition-colors', disabled && 'opacity-30 cursor-not-allowed', active && 'bg-white/15')}
    style={{ color: highlight && !disabled ? 'white' : `${tc}b0`, background: highlight && !disabled ? '#388a34' : undefined }}>
    {icon}
  </button>
}

function Overlay({ children, onClose }: Readonly<{ children: React.ReactNode; onClose: () => void }>) {
  return <button type="button" className="fixed inset-0 z-[60] bg-black/30 flex items-start justify-center pt-[10vh] border-0 p-0 m-0 w-full cursor-default" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={e => { if (e.target === e.currentTarget) { onClose(); } }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onClose(); } }}><div>{children}</div></button>
}

function InputDialog({ title, placeholder, value, onChange, onSubmit, onClose, bg, tc, bc }: Readonly<{
  title: string; placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => void; onClose: () => void; bg: string; tc: string; bc: string
}>) {
  return (
    <Overlay onClose={onClose}>
      <div className="rounded-lg shadow-2xl w-[400px] overflow-hidden border" style={{ background: bg, borderColor: bc }}>
        <div className="px-4 py-3 text-xs" style={{ color: `${tc}60` }}>{title}</div>
        <div className="px-4 pb-4">
          <input autoFocus value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSubmit(); } if (e.key === 'Escape') { onClose(); } }}
            placeholder={placeholder} className="w-full h-8 px-3 rounded text-sm border outline-none" style={{ background: `${tc}15`, borderColor: '#007acc', color: tc }} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={onClose} className="px-3 py-1 text-xs rounded" style={{ background: `${tc}20`, color: `${tc}70` }}>Cancel</button>
            <button onClick={onSubmit} className="px-3 py-1 text-xs rounded bg-[#007acc] text-white hover:bg-[#0069b3]">OK</button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

function SettingsPanel({ fontSize, setFontSize, tabSize, setTabSize, showMinimap, setShowMinimap, wordWrap, setWordWrap,
  autoSave, setAutoSave, fontLigatures, setFontLigatures, bracketPairColorization, setBracketPairColorization,
  stickyScroll, setStickyScroll, rulers, setRulers, renderWhitespace, setRenderWhitespace,
  cursorStyle, setCursorStyle, lineHeight, setLineHeight, lineNumbers, setLineNumbers,
  fontFamily, setFontFamily, tc }: Readonly<{
  fontSize: number; setFontSize: (v: number) => void; tabSize: number; setTabSize: (v: number) => void
  showMinimap: boolean; setShowMinimap: (v: boolean) => void; wordWrap: 'on' | 'off'; setWordWrap: (v: 'on' | 'off') => void
  autoSave: boolean; setAutoSave: (v: boolean) => void; fontLigatures: boolean; setFontLigatures: (v: boolean) => void
  bracketPairColorization: boolean; setBracketPairColorization: (v: boolean) => void; stickyScroll: boolean; setStickyScroll: (v: boolean) => void
  rulers: boolean; setRulers: (v: boolean) => void; renderWhitespace: string; setRenderWhitespace: (v: 'none' | 'selection' | 'all') => void
  cursorStyle: string; setCursorStyle: (v: 'line' | 'block' | 'underline') => void; lineHeight: number; setLineHeight: (v: number) => void
  lineNumbers: string; setLineNumbers: (v: 'on' | 'off' | 'relative') => void
  fontFamily: string; setFontFamily: (v: string) => void; tc: string
}>) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="h-8 px-4 flex items-center text-[11px] uppercase tracking-wider font-semibold flex-shrink-0" style={{ color: `${tc}60` }}>Settings</div>
      <div className="px-3 space-y-3 pb-4 text-[12px]">
        <SRow label="Font Size" tc={tc}><input type="range" min={10} max={32} value={fontSize} onChange={e => setFontSize(+e.target.value)} className="w-16 h-1" /><span className="w-5 text-center text-[11px]">{fontSize}</span></SRow>
        <SRow label="Tab Size" tc={tc}>{[2, 4, 8].map(n => <button key={n} onClick={() => setTabSize(n)} className={cn('px-2 py-0.5 rounded text-[11px]', tabSize === n ? 'bg-[#007acc] text-white' : 'bg-white/10')}>{n}</button>)}</SRow>
        <SRow label="Line Height" tc={tc}><input type="range" min={16} max={30} value={lineHeight} onChange={e => setLineHeight(+e.target.value)} className="w-16 h-1" /><span className="w-5 text-center text-[11px]">{lineHeight}</span></SRow>
        <SRow label="Cursor" tc={tc}>{(['line', 'block', 'underline'] as const).map(s => <button key={s} onClick={() => setCursorStyle(s)} className={cn('px-1.5 py-0.5 rounded text-[10px]', cursorStyle === s ? 'bg-[#007acc] text-white' : 'bg-white/10')}>{s}</button>)}</SRow>
        <SRow label="Whitespace" tc={tc}>{(['none', 'selection', 'all'] as const).map(s => <button key={s} onClick={() => setRenderWhitespace(s)} className={cn('px-1.5 py-0.5 rounded text-[10px]', renderWhitespace === s ? 'bg-[#007acc] text-white' : 'bg-white/10')}>{s}</button>)}</SRow>
        <SRow label="Line Numbers" tc={tc}>{(['on', 'off', 'relative'] as const).map(s => <button key={s} onClick={() => setLineNumbers(s)} className={cn('px-1.5 py-0.5 rounded text-[10px]', lineNumbers === s ? 'bg-[#007acc] text-white' : 'bg-white/10')}>{s}</button>)}</SRow>
        <div>
          <div className="text-[11px] mb-1" style={{ color: `${tc}70` }}>Font Family</div>
          <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full h-7 px-2 text-[11px] rounded border-0 outline-none" style={{ background: `${tc}15`, color: tc }}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f.split(',')[0].replaceAll("'", '')}</option>)}
          </select>
        </div>
        <Tog label="Minimap" value={showMinimap} onChange={setShowMinimap} tc={tc} />
        <Tog label="Word Wrap" value={wordWrap === 'on'} onChange={v => setWordWrap(v ? 'on' : 'off')} tc={tc} />
        <Tog label="Auto Save (1s)" value={autoSave} onChange={setAutoSave} tc={tc} />
        <Tog label="Font Ligatures" value={fontLigatures} onChange={setFontLigatures} tc={tc} />
        <Tog label="Bracket Colors" value={bracketPairColorization} onChange={setBracketPairColorization} tc={tc} />
        <Tog label="Sticky Scroll" value={stickyScroll} onChange={setStickyScroll} tc={tc} />
        <Tog label="Rulers (80, 120)" value={rulers} onChange={setRulers} tc={tc} />
      </div>
    </div>
  )
}

function SRow({ label, children, tc }: Readonly<{ label: string; children: React.ReactNode; tc: string }>) {
  return <div className="flex items-center justify-between"><span style={{ color: `${tc}90` }}>{label}</span><div className="flex items-center gap-1">{children}</div></div>
}

function Tog({ label, value, onChange, tc }: Readonly<{ label: string; value: boolean; onChange: (v: boolean) => void; tc: string }>) {
  return <div className="flex items-center justify-between"><span style={{ color: `${tc}90` }}>{label}</span>
    <button onClick={() => onChange(!value)} className={cn('w-9 h-5 rounded-full transition-colors relative', value ? 'bg-[#007acc]' : 'bg-white/20')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', value ? 'left-[18px]' : 'left-0.5')} />
    </button></div>
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function syntaxHighlightJson(json: string): string {
  const classify = (match: string) => {
    let cls = 'number'
    if (match.startsWith('"')) { cls = match.endsWith(':') ? 'key' : 'string' }
    else if (/true|false/.test(match)) { cls = 'boolean' }
    else if (match === 'null') { cls = 'null' }
    return `<span class="${cls}">${match}</span>`
  }
  return escapeHtml(json)
    .replaceAll(/"(?:[^"\\]|\\.)*"(?:\s*:)?/g, classify)
    .replaceAll(/\b(?:true|false|null)\b/g, classify)
    .replaceAll(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, classify)
}

function simpleMarkdown(md: string): string {
  return md
    .replaceAll(/^---$/gm, '<hr>')
    .replaceAll(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replaceAll(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replaceAll(/^### (.+)$/gm, '<h3>$1</h3>')
    .replaceAll(/^## (.+)$/gm, '<h2>$1</h2>')
    .replaceAll(/^# (.+)$/gm, '<h1>$1</h1>')
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*([^*]{1,1000})\*/g, '<em>$1</em>')
    .replaceAll(/~~(.+?)~~/g, '<del>$1</del>')
    .replaceAll(/`([^`]+)`/g, '<code>$1</code>')
    .replaceAll(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // eslint-disable-next-line sonarjs/slow-regex -- processes controlled internal markdown, not user-submitted HTTP input
    .replaceAll(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replaceAll(/^\|(.+)\|$/gm, (_, row) => '<tr>' + (row as string).split('|').map((cell: string) => `<td>${cell.trim()}</td>`).join('') + '</tr>')
    .replaceAll(/(<tr>[^<]*<\/tr>\n?)+/g, (m) => `<table>${m}</table>`)
    .replaceAll(/^- \[x\] (.+)$/gm, '<li style="list-style:none"><input type="checkbox" checked disabled /> $1</li>')
    .replaceAll(/^- \[ \] (.+)$/gm, '<li style="list-style:none"><input type="checkbox" disabled /> $1</li>')
    .replaceAll(/^- (.+)$/gm, '<li>$1</li>')
    .replaceAll(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replaceAll(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replaceAll(/\n{2,}/g, '<br><br>')
    .replaceAll('\n', '<br>')
}
