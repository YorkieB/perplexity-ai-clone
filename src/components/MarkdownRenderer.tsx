import { useMemo, createElement, Fragment, useState } from 'react'
import { marked } from 'marked'
import { cn } from '@/lib/utils'
import { Copy, Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface MarkdownRendererProps {
  content: string
  onCitationHover: (index: number | null) => void
}

interface ParsedContent {
  type: 'text' | 'citation'
  content: string
  citationNumber?: number
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

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-secondary hover:bg-accent hover:text-accent-foreground"
      >
        {copied ? (
          <Check className="h-4 w-4 text-accent" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
      <pre className="bg-secondary rounded-lg p-4 overflow-x-auto mb-4 border border-border">
        <code className="text-sm font-mono text-foreground">{code}</code>
      </pre>
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
