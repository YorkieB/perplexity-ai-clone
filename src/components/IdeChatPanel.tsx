import { useEffect, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { generateId } from '@/lib/helpers'
import type { IdeAttachment, IdeChatMode } from '@/lib/jarvis-ide-chat-types'

export type { IdeAttachment, IdeChatMode }

export interface IdeChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly reasoning?: string
  readonly attachments?: IdeAttachment[]
}

interface OpenFile {
  id: string
  filename: string
  language: string
}

interface IdeChatPanelProps {
  readonly messages: IdeChatMessage[]
  readonly loading: boolean
  readonly disabled: boolean
  readonly onSend: (text: string, attachments?: IdeAttachment[]) => void
  readonly onClear: () => void
  readonly themeColors: { readonly tc: string; readonly sb: string; readonly bc: string }
  /** Open editor tabs for @-context picker. */
  readonly openFiles?: OpenFile[]
  /** Callback to read file content for @ attachment. */
  readonly onGetFileContent?: (fileId: string) => string | null
  readonly onReview?: () => void
  readonly reviewDisabled?: boolean
  readonly qualityLoading?: boolean
  readonly onUndoAll?: () => void
  readonly onKeepAll?: () => void
  readonly undoKeepDisabled?: boolean
  /** Current panel mode. */
  readonly mode?: IdeChatMode
  readonly onModeChange?: (mode: IdeChatMode) => void
  /** Agent/autopilot status. */
  readonly agentStatus?: 'idle' | 'running' | 'paused'
  readonly onStopAgent?: () => void
  /** Model selector. */
  readonly model?: string
  readonly onModelChange?: (model: string) => void
  readonly modelOptions?: Array<{ id: string; label: string }>
}

const MODE_TIPS: Record<IdeChatMode, string> = {
  chat: 'Ask questions, get explanations, code help',
  composer: 'Plan structured changes step-by-step before applying',
  agent: 'Jarvis works autonomously — plan, code, run, fix, iterate',
}

const MODE_PLACEHOLDERS: Record<IdeChatMode, string> = {
  chat: 'Ask about your code, request changes, explain errors…',
  composer: 'Describe what you want to build or change — Jarvis will plan it…',
  agent: 'Give Jarvis a goal and he will work autonomously…',
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- React component with multiple conditional interaction paths; decomposition into sub-components is tracked separately
export function IdeChatPanel({
  messages,
  loading,
  disabled,
  onSend,
  onClear,
  themeColors,
  openFiles = [],
  onGetFileContent,
  onReview,
  reviewDisabled = false,
  qualityLoading = false,
  onUndoAll,
  onKeepAll,
  undoKeepDisabled = true,
  mode = 'chat',
  onModeChange,
  agentStatus = 'idle',
  onStopAgent,
  model,
  onModelChange,
  modelOptions = [],
}: IdeChatPanelProps) {
  const { tc, sb, bc } = themeColors
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<IdeAttachment[]>([])
  const [showAtPicker, setShowAtPicker] = useState(false)
  const [atFilter, setAtFilter] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const atPickerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Close @ picker on outside click
  useEffect(() => {
    if (!showAtPicker) return
    const handler = (e: MouseEvent) => {
      if (atPickerRef.current && !atPickerRef.current.contains(e.target as Node)) {
        setShowAtPicker(false)
        setAtFilter('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAtPicker])

  const submit = () => {
    const t = draft.trim()
    if (!t || loading || disabled) return
    onSend(t, attachments.length > 0 ? attachments : undefined)
    setDraft('')
    setAttachments([])
  }

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, asImage = false) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (asImage || file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev.filter((a) => a.name !== file.name), // eslint-disable-line sonarjs/no-nested-functions -- 5th-level nesting unavoidable in React setState updater
            { name: file.name, content: reader.result as string, mimeType: file.type || 'image/png', isImage: true },
          ])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev.filter((a) => a.name !== file.name), // eslint-disable-line sonarjs/no-nested-functions -- 5th-level nesting unavoidable in React setState updater
            { name: file.name, content: reader.result as string, mimeType: file.type || 'text/plain', isImage: false },
          ])
        }
        reader.readAsText(file)
      }
    }
    e.target.value = ''
  }

  const handleAddFileContext = (file: OpenFile) => {
    const content = onGetFileContent?.(file.id) ?? ''
    const name = `@${file.filename}`
    setAttachments((prev) => [
      ...prev.filter((a) => a.name !== name),
      { name, content, mimeType: 'text/plain', isImage: false },
    ])
    setShowAtPicker(false)
    setAtFilter('')
    textareaRef.current?.focus()
  }

  const filteredFiles = openFiles.filter((f) =>
    atFilter ? f.filename.toLowerCase().includes(atFilter.toLowerCase()) : true
  )

  const isAgentRunning = mode === 'agent' && agentStatus === 'running'
  let loadingLabel = 'Thinking…'
  if (isAgentRunning) loadingLabel = '🤖 Agent is working…'
  else if (mode === 'composer') loadingLabel = '📝 Planning…'

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: sb }}>

      {/* ── MODE SELECTOR ── */}
      <div className="flex-shrink-0 border-b" style={{ borderColor: bc }}>
        {/* Mode tabs */}
        <div className="flex items-center gap-0 px-1 pt-1">
          {(['chat', 'composer', 'agent'] as IdeChatMode[]).map((m) => (
            <button
              key={m}
              type="button"
              title={MODE_TIPS[m]}
              onClick={() => onModeChange?.(m)}
              className="relative px-3 py-1.5 text-[11px] font-medium rounded-t transition-colors capitalize"
              style={{
                color: mode === m ? tc : `${tc}55`,
                background: mode === m ? `${tc}0e` : 'transparent',
                borderBottom: `2px solid ${mode === m ? '#007acc' : 'transparent'}`,
              }}
            >
              {{ chat: 'Chat', composer: 'Composer', agent: 'Agent' }[m]}
              {m === 'agent' && agentStatus === 'running' && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse align-middle" />
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            className="px-1.5 py-1 text-[10px] rounded hover:bg-white/10 mr-1"
            style={{ color: `${tc}40` }}
            onClick={onClear}
            disabled={messages.length === 0 || loading}
            title="Clear conversation"
          >
            Clear
          </button>
        </div>

        {/* Model + status row */}
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
          {modelOptions.length > 0 && onModelChange ? (
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border-0 outline-none min-w-0"
              style={{ background: `${tc}10`, color: `${tc}85` }}
              title="IDE chat model"
            >
              {modelOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          ) : (model && (
            <span className="text-[10px] truncate" style={{ color: `${tc}40` }}>{model}</span>
          ))}

          {isAgentRunning && onStopAgent ? (
            <button
              type="button"
              onClick={onStopAgent}
              className="px-1.5 py-0.5 text-[10px] font-bold rounded"
              style={{ color: '#ef4444', border: '1px solid #ef444440' }}
              title="Stop agent"
            >
              ■ Stop
            </button>
          ) : (
            <div className="flex items-center gap-1 ml-auto">
              {onUndoAll && (
                <button
                  type="button"
                  className="text-[10px] hover:underline disabled:opacity-25"
                  style={{ color: `${tc}40` }}
                  disabled={undoKeepDisabled}
                  title="Undo all pending AI edits"
                  onClick={onUndoAll}
                >
                  Undo
                </button>
              )}
              {onKeepAll && (
                <button
                  type="button"
                  className="text-[10px] hover:underline disabled:opacity-25"
                  style={{ color: `${tc}40` }}
                  disabled={undoKeepDisabled}
                  title="Keep all pending AI edits"
                  onClick={onKeepAll}
                >
                  Keep
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MESSAGES ── */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2 text-[12px]">
        {messages.length === 0 && !loading && (
          <p className="px-1 leading-relaxed text-[11px]" style={{ color: `${tc}38` }}>
            {MODE_TIPS[mode]}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md px-2.5 py-2 ${m.role === 'user' ? 'ml-3' : 'mr-1'}`}
            style={{
              background: m.role === 'user' ? `${tc}16` : `${tc}07`,
              border: `1px solid ${m.role === 'user' ? tc + '10' : tc + '05'}`,
            }}
          >
            {m.role === 'user' ? (
              <div>
                <p className="whitespace-pre-wrap text-[12px]" style={{ color: tc }}>{m.content}</p>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.attachments.map((a) => (
                      <span
                        key={a.name}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                        style={{ background: `${tc}12`, color: `${tc}65` }}
                      >
                        {a.isImage ? '🖼' : '📄'} {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
          <div className="px-2 py-1 text-[11px] animate-pulse" style={{ color: isAgentRunning ? '#22c55e' : `${tc}50` }}>
            {loadingLabel}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── COMPOSE BOX ── */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: bc }}>

        {/* Attached files chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2 pt-1.5 pb-0.5">
            {attachments.map((a) => (
              <span
                key={a.name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] max-w-[140px]"
                style={{ background: `${tc}12`, color: `${tc}75`, border: `1px solid ${tc}14` }}
              >
                {a.isImage ? '🖼' : '📄'}
                <span className="truncate">{a.name}</span>
                <button
                  type="button"
                  className="ml-0.5 opacity-60 hover:opacity-100 text-[11px] leading-none"
                  onClick={() => removeAttachment(a.name)}
                  title="Remove attachment"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* @ file picker popover */}
        {showAtPicker && (
          <div
            ref={atPickerRef}
            className="mx-2 mb-1 rounded border shadow-lg overflow-hidden"
            style={{ background: sb, borderColor: `${tc}20` }}
          >
            <div className="px-2 py-1 border-b" style={{ borderColor: `${tc}12` }}>
              <input
                autoFocus
                value={atFilter}
                onChange={(e) => setAtFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowAtPicker(false); setAtFilter('') }
                  if (e.key === 'Enter' && filteredFiles.length > 0) handleAddFileContext(filteredFiles[0])
                }}
                placeholder="Filter open files…"
                className="w-full bg-transparent text-[11px] outline-none"
                style={{ color: tc }}
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 140 }}>
              {filteredFiles.length === 0 && (
                <p className="px-2 py-2 text-[10px]" style={{ color: `${tc}40` }}>No open files</p>
              )}
              {filteredFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="w-full px-2 py-1 text-left text-[11px] hover:bg-white/10 truncate flex items-center gap-1.5"
                  style={{ color: `${tc}c0` }}
                  onClick={() => handleAddFileContext(f)}
                >
                  <span className="opacity-50 text-[10px]">{f.language}</span>
                  {f.filename}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Textarea */}
        <div className="px-2 pt-1.5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={disabled ? 'Chat unavailable' : MODE_PLACEHOLDERS[mode]}
            disabled={disabled || loading}
            rows={3}
            className="w-full resize-none rounded border px-2 py-1.5 text-[12px] outline-none focus:ring-1"
            style={{
              background: `${tc}0a`,
              borderColor: `${tc}12`,
              color: tc,
              caretColor: tc,
            }}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          {/* Attach file */}
          <button
            type="button"
            title="Attach text file (📎)"
            className="w-6 h-6 flex items-center justify-center rounded text-[13px] hover:bg-white/10 transition-colors"
            style={{ color: `${tc}55` }}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>

          {/* Attach image */}
          <button
            type="button"
            title="Attach image (🖼)"
            className="w-6 h-6 flex items-center justify-center rounded text-[13px] hover:bg-white/10 transition-colors"
            style={{ color: `${tc}55` }}
            onClick={() => imgInputRef.current?.click()}
          >
            🖼
          </button>

          {/* @-context picker */}
          <button
            type="button"
            title="Add open file as context"
            className="flex items-center gap-0.5 px-1.5 h-6 rounded text-[10px] font-mono hover:bg-white/10 transition-colors"
            style={{
              color: showAtPicker || attachments.some((a) => a.name.startsWith('@')) ? '#007acc' : `${tc}55`,
            }}
            onClick={() => setShowAtPicker((p) => !p)}
          >
            @{openFiles.length > 0 && (
              <span className="ml-0.5 opacity-50">{openFiles.length}</span>
            )}
          </button>

          <div className="flex-1" />

          {/* Review */}
          {onReview && (
            <button
              type="button"
              className="h-6 px-2 rounded text-[10px] font-medium transition-colors hover:bg-white/10 disabled:opacity-25"
              style={{ color: `${tc}65`, border: `1px solid ${tc}18` }}
              disabled={reviewDisabled || loading || qualityLoading}
              title="Run ESLint + tsc, then ask Jarvis to review"
              onClick={onReview}
            >
              {qualityLoading ? '…' : 'Review'}
            </button>
          )}

          {/* Send */}
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || loading || disabled}
            className="h-6 px-3 rounded text-[11px] font-semibold transition-opacity"
            style={{
              background: mode === 'agent' ? '#16a34a' : '#007acc',
              color: '#fff',
              opacity: draft.trim() && !loading && !disabled ? 1 : 0.35,
            }}
          >
            {mode === 'agent' && agentStatus === 'idle' ? '▶' : '→'}
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e, false)}
        />
        <input
          ref={imgInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e, true)}
        />
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- utility function tightly coupled to IdeChatMessage type
export function createIdeUserMessage(content: string, attachments?: IdeAttachment[]): IdeChatMessage {
  return { id: generateId(), role: 'user', content, attachments }
}

// eslint-disable-next-line react-refresh/only-export-components -- utility function tightly coupled to IdeChatMessage type
export function createIdeAssistantMessage(content: string, reasoning?: string): IdeChatMessage {
  return { id: generateId(), role: 'assistant', content, reasoning }
}
