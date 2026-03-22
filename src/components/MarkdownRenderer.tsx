import { useMemo, createElement, Fragment, useState } from 'react'
import { marked } from 'marked'
import { cn } from '@/lib/utils'
import { Copy, Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Highlight, themes } from 'prism-react-renderer'

interface MarkdownRendererProps {
  content: string
  onCitationHover: (index: number | null) => void
}

interface ParsedContent {
  type: 'text' | 'citation'
  content: string
  citationNumber?: number
}

const languageColors: Record<string, string> = {
  javascript: 'oklch(0.82 0.18 85)',
  typescript: 'oklch(0.65 0.20 245)',
  python: 'oklch(0.70 0.18 210)',
  java: 'oklch(0.60 0.22 25)',
  css: 'oklch(0.75 0.15 280)',
  html: 'oklch(0.68 0.20 15)',
  jsx: 'oklch(0.72 0.18 190)',
  tsx: 'oklch(0.68 0.20 250)',
  json: 'oklch(0.75 0.12 120)',
  bash: 'oklch(0.65 0.08 140)',
  shell: 'oklch(0.65 0.08 140)',
  sql: 'oklch(0.70 0.18 30)',
  rust: 'oklch(0.62 0.18 35)',
  go: 'oklch(0.72 0.18 195)',
  ruby: 'oklch(0.62 0.20 5)',
  php: 'oklch(0.68 0.18 265)',
  swift: 'oklch(0.70 0.22 20)',
  kotlin: 'oklch(0.65 0.20 270)',
  cpp: 'oklch(0.65 0.18 210)',
  c: 'oklch(0.62 0.15 235)',
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Code copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy code')
    }
  }

  const normalizedLanguage = language?.toLowerCase() || 'text'
  const accentColor = languageColors[normalizedLanguage] || 'oklch(0.75 0.15 195)'

  return (
    <div className="relative group mb-4">
      <div 
        className="flex items-center justify-between px-4 py-2 rounded-t-lg border border-b-0 border-border"
        style={{ backgroundColor: 'oklch(0.25 0.01 250)' }}
      >
        <span 
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: accentColor }}
        >
          {normalizedLanguage}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 w-7 p-0 hover:bg-accent/20"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" style={{ color: accentColor }} />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          )}
        </Button>
      </div>
      <Highlight
        theme={themes.nightOwl}
        code={code.trim()}
        language={normalizedLanguage}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              className,
              "overflow-x-auto rounded-b-lg border border-border p-4 text-sm"
            )}
            style={{
              ...style,
              backgroundColor: 'oklch(0.20 0.01 250)',
              margin: 0,
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}

function parseCitationsInText(text: string): ParsedContent[] {
  const citationRegex = /\[(\d+)\]/g
  const parts: ParsedContent[] = []
  let lastIndex = 0
  let match

  while ((match = citationRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      })
    }

    parts.push({
      type: 'citation',
      content: match[0],
      citationNumber: parseInt(match[1], 10),
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

function processHTMLWithCitations(
  html: string,
  onCitationHover: (index: number | null) => void
) {
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html

  const processNode = (node: Node, index: number): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const parts = parseCitationsInText(text)

      if (parts.length === 1 && parts[0].type === 'text') {
        return text
      }

      return parts.map((part, idx) => {
        if (part.type === 'citation' && part.citationNumber) {
          const citationNum = part.citationNumber
          return createElement(
            'sup',
            {
              key: `citation-${citationNum}-${idx}`,
              className: 'inline-flex items-center justify-center w-5 h-5 ml-0.5 text-xs font-semibold text-accent bg-accent/20 rounded-full cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110',
              onMouseEnter: () => onCitationHover(citationNum),
              onMouseLeave: () => onCitationHover(null),
              onClick: () => onCitationHover(citationNum),
            },
            citationNum
          )
        }
        return part.content
      })
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      const tagName = element.tagName.toLowerCase()

      if (tagName === 'pre') {
        const codeElement = element.querySelector('code')
        if (codeElement) {
          const code = codeElement.textContent || ''
          const language = codeElement.className.match(/language-(\w+)/)?.[1]
          return createElement(CodeBlock, {
            key: `code-${index}`,
            code,
            language,
          })
        }
      }

      const children = Array.from(element.childNodes).map((child, idx) =>
        processNode(child, idx)
      )

      return createElement(
        tagName,
        {
          key: `${tagName}-${index}`,
          className: cn(element.className, getElementClasses(tagName)),
        },
        ...children
      )
    }

    return null
  }

  const result = Array.from(tempDiv.childNodes).map((node, idx) =>
    processNode(node, idx)
  )
  
  return createElement(Fragment, null, ...result)
}

function getElementClasses(tag: string): string {
  const classes: Record<string, string> = {
    h1: 'text-2xl font-bold mt-6 mb-4 first:mt-0 text-foreground',
    h2: 'text-xl font-bold mt-5 mb-3 first:mt-0 text-foreground',
    h3: 'text-lg font-semibold mt-4 mb-2 first:mt-0 text-foreground',
    h4: 'text-base font-semibold mt-3 mb-2 first:mt-0 text-foreground',
    p: 'text-foreground leading-relaxed mb-4 last:mb-0',
    ul: 'list-disc list-outside ml-5 mb-4 space-y-2',
    ol: 'list-decimal list-outside ml-5 mb-4 space-y-2',
    li: 'text-foreground leading-relaxed',
    blockquote: 'border-l-4 border-accent pl-4 italic my-4 text-muted-foreground',
    pre: 'bg-secondary rounded-lg p-4 overflow-x-auto mb-4 border border-border',
    code: 'bg-secondary px-1.5 py-0.5 rounded text-sm font-mono text-accent',
    table: 'w-full border-collapse mb-4 text-sm',
    thead: 'bg-secondary',
    tbody: '',
    th: 'border border-border px-4 py-2 text-left font-semibold text-foreground',
    td: 'border border-border px-4 py-2 text-foreground',
    tr: 'border-b border-border',
    a: 'text-accent hover:underline',
    strong: 'font-semibold text-foreground',
    em: 'italic',
    hr: 'border-t border-border my-6',
  }

  return classes[tag] || ''
}

export function MarkdownRenderer({ content, onCitationHover }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    marked.setOptions({
      gfm: true,
      breaks: true,
    })

    const rawHTML = marked.parse(content) as string

    return processHTMLWithCitations(rawHTML, onCitationHover)
  }, [content, onCitationHover])

  return (
    <div className="prose prose-invert max-w-none markdown-content">
      {renderedContent}
    </div>
  )
}
