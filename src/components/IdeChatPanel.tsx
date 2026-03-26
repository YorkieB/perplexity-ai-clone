import { useEffect, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { generateId } from '@/lib/helpers'

export interface IdeChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly reasoning?: string
}

interface IdeChatPanelProps {
  readonly messages: IdeChatMessage[]
  readonly loading: boolean
  readonly disabled: boolean
  readonly onSend: (text: string) => void
  readonly onClear: () => void
  readonly themeColors: { readonly tc: string; readonly sb: string; readonly bc: string }
  /** Open editor tabs / context file count (Cursor-style “N Files”). */
  readonly contextFileCount?: number
  /** Runs workspace quality (ESLint, tsc, …) + composer review preset. */
  readonly onReview?: () => void
  readonly reviewDisabled?: boolean
  readonly qualityLoading?: boolean
  readonly onUndoAll?: () => void
  readonly onKeepAll?: () => void
  readonly undoKeepDisabled?: boolean
}

export function IdeChatPanel({
  messages,
  loading,
  disabled,
  onSend,
  onClear,
  themeColors,
  contextFileCount = 0,
  onReview,
  reviewDisabled = false,
  qualityLoading = false,
  onUndoAll,
  onKeepAll,
  undoKeepDisabled = true,
}: IdeChatPanelProps) {
  const { tc, sb, bc } = themeColors
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const submit = () => {
    const t = draft.trim()
    if (!t || loading || disabled) return
    onSend(t)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: sb }}>
      <div className="flex flex-shrink-0 flex-col border-b" style={{ borderColor: bc }}>
        <div className="flex h-8 items-center justify-between gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: `${tc}60` }}>
          <span>Jarvis AI</span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] font-normal hover:bg-white/10"
            style={{ color: `${tc}50` }}
            onClick={onClear}
            disabled={messages.length === 0 || loading}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-2 text-[11px] font-normal normal-case" style={{ color: `${tc}90` }}>
          <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: `${tc}22`, color: `${tc}70` }}>
            &gt; {contextFileCount} File{contextFileCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="text-[10px] hover:underline disabled:opacity-30"
            style={{ color: `${tc}55` }}
            disabled={undoKeepDisabled}
            title={undoKeepDisabled ? 'No pending composer edits to undo' : 'Undo all pending AI edits'}
            onClick={onUndoAll}
          >
            Undo All
          </button>
          <button
            type="button"
            className="text-[10px] hover:underline disabled:opacity-30"
            style={{ color: `${tc}55` }}
            disabled={undoKeepDisabled}
            title={undoKeepDisabled ? 'No pending composer edits to keep' : 'Keep all pending AI edits'}
            onClick={onKeepAll}
          >
            Keep All
          </button>
          {onReview && (
            <button
              type="button"
              className="ml-auto rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/10 disabled:opacity-40"
              style={{
                borderColor: `${tc}35`,
                background: `${tc}14`,
                color: tc,
              }}
              disabled={reviewDisabled || loading || qualityLoading}
              title="Run ESLint, tsc, GraphQL, Sonar (when configured) and ask Jarvis to review"
              onClick={onReview}
            >
              {qualityLoading ? 'Review…' : 'Review'}
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2 text-[12px]">
        {messages.length === 0 && !loading && (
          <p className="px-1 leading-relaxed" style={{ color: `${tc}45` }}>
            Ask Jarvis about your code, refactors, errors, or anything else. Full tools (IDE, browser, RAG) are available.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md px-2.5 py-2 ${m.role === 'user' ? 'ml-4' : 'mr-2'}`}
            style={{
              background: m.role === 'user' ? `${tc}18` : `${tc}08`,
              border: `1px solid ${m.role === 'user' ? tc + '12' : tc + '08'}`,
            }}
          >
            {m.role === 'user' ? (
              <p className="whitespace-pre-wrap" style={{ color: tc }}>
                {m.content}
              </p>
            ) : (
              <>
                {m.reasoning && (
                  <details className="mb-2 rounded border px-2 py-1 text-[11px]" style={{ borderColor: `${tc}20`, color: `${tc}70` }}>
                    <summary className="cursor-pointer select-none">Thinking</summary>
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[10px]" style={{ color: `${tc}90` }}>
                      {m.reasoning}
                    </pre>
                  </details>
                )}
                <div className="prose prose-invert max-w-none text-[12px] leading-relaxed [&_pre]:text-[11px]" style={{ color: `${tc}e0` }}>
                  <MarkdownRenderer content={m.content} onCitationHover={() => {}} />
                </div>
              </>
            )}
          </div>
        ))}
        {loading && (
          <div className="px-2 py-1 text-[11px] animate-pulse" style={{ color: `${tc}50` }}>
            Jarvis is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex-shrink-0 border-t p-2" style={{ borderColor: bc }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={disabled ? 'Chat unavailable' : 'Plan, @ for context, / for commands — Enter to send'}
          disabled={disabled || loading}
          rows={3}
          className="w-full resize-none rounded border px-2 py-1.5 text-[12px] outline-none focus:ring-1"
          style={{
            background: `${tc}10`,
            borderColor: `${tc}18`,
            color: tc,
            caretColor: tc,
          }}
        />
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || loading || disabled}
            className="rounded px-3 py-1 text-[11px] font-medium"
            style={{ background: '#007acc', color: '#fff', opacity: draft.trim() && !loading && !disabled ? 1 : 0.4 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export function createIdeUserMessage(content: string): IdeChatMessage {
  return { id: generateId(), role: 'user', content }
}

export function createIdeAssistantMessage(content: string, reasoning?: string): IdeChatMessage {
  return { id: generateId(), role: 'assistant', content, reasoning }
}
