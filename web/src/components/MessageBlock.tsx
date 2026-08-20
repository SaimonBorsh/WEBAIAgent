import { useState } from 'react'
import type { MessageItem, ToolPart } from '../types'
import Markdown from '../md'
import { getShowModel, getShowTokens, getShowReasoning } from '../prefs'
import { toolTitle } from '../toolLabels'

interface FilePart {
  id: string
  filename?: string
  url: string
}

function fmtTokens(item: MessageItem): string {
  const t = item.info.tokens
  if (!t) return ''
  const parts: string[] = []
  if (t.input) parts.push(`вход ${t.input}`)
  if (t.output) parts.push(`выход ${t.output}`)
  return parts.join(' · ')
}

function ToolView({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false)
  const status = part.state.status
  const isQuestion = part.tool === 'question'
  const icon =
    status === 'running' ? (isQuestion ? '🤔' : '⏳') : status === 'error' ? '✗' : status === 'completed' ? '✓' : '…'
  const { label, detail } = toolTitle(part)
  const title =
    isQuestion && status === 'running'
      ? 'Ассистент задаёт вопрос — ответьте в панели ниже'
      : label

  const start = part.state.time?.start
  const done = part.state.time?.end
  let duration: string | null = null
  if (start) {
    const endMs = done || Date.now()
    const ms = Math.max(0, endMs - start)
    duration = ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} с` : `${ms} мс`
  }

  let body: string | null = null
  if (status === 'error') body = part.state.error || ''
  else if (status === 'completed' && part.state.output) body = part.state.output
  else if (status === 'completed' && part.state.input) body = JSON.stringify(part.state.input, null, 2)
  else if (status !== 'completed' && part.state.input) body = JSON.stringify(part.state.input, null, 2)

  return (
    <div className={`tool ${status}`}>
      <button className="tool-head" onClick={() => setOpen(!open)}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-title">
          {title}
          {detail && <span className="tool-title-detail"> · {detail}</span>}
        </span>
        {duration && <span className="tool-time">{duration}</span>}
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && body && (
        <pre className="tool-body">
          <code>{body}</code>
        </pre>
      )}
    </div>
  )
}

export default function MessageBlock({
  item,
  streaming,
  canRetry,
  onRetry
}: {
  item: MessageItem
  streaming?: boolean
  canRetry?: boolean
  onRetry?: () => void
}) {
  const { info, parts } = item
  const isUser = info.role === 'user'

  const userText = parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text?: string }).text || '')
    .join('\n')

  const assistantTextParts = parts.filter((p) => p.type === 'text' && !(p as { ignored?: boolean }).ignored)
  const assistantText = assistantTextParts.map((p) => (p as { text?: string }).text || '').join('\n')
  const reasoningParts = parts.filter((p) => p.type === 'reasoning')
  const toolParts = parts.filter((p) => p.type === 'tool') as ToolPart[]
  const fileParts = parts.filter((p) => p.type === 'file') as unknown as FilePart[]

  const hasError = Boolean(info.error)

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-meta">
        <span className="message-role">{isUser ? 'Вы' : 'Ассистент'}</span>
        {!isUser && info.modelID && getShowModel() && <span className="message-model">{info.modelID}</span>}
        {!isUser && getShowTokens() && fmtTokens(item) && <span className="message-tokens">{fmtTokens(item)}</span>}
        {streaming && <span className="streaming">печатает…</span>}
        {canRetry && onRetry && (
          <button className="meta-btn" title="Повторить последний запрос" aria-label="Повторить последний запрос" onClick={onRetry}>
            ⟳
          </button>
        )}
      </div>

      {isUser ? (
        <div className="message-body">
          {fileParts.map((p) => (
            <div key={p.id} className="attachment-chip static">
              📎 {p.filename || p.url}
            </div>
          ))}
          {userText && <Markdown text={userText} />}
        </div>
      ) : (
        <div className="message-body">
          {hasError && (
            <div className="error">
              Ошибка: {(info.error as { data?: { message?: string } })?.data?.message || JSON.stringify(info.error)}
            </div>
          )}

          {reasoningParts.map((p) => (
            <ReasoningBlock key={p.id} text={(p as { text?: string }).text || ''} defaultOpen={getShowReasoning()} />
          ))}

          {toolParts.map((p) => (
            <ToolView key={p.id} part={p} />
          ))}

          {assistantText && (
            <div className={streaming ? 'assistant-streaming' : ''}>
              <Markdown text={assistantText} />
            </div>
          )}

          {!assistantText && !toolParts.length && !reasoningParts.length && !hasError && (
            <div className="muted">
              {streaming ? '…' : 'Ответ пуст'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReasoningBlock({ text, defaultOpen }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false)
  return (
    <div className="reasoning">
      <button className="reasoning-head" onClick={() => setOpen(!open)}>
        <span className="reasoning-icon">{open ? '▾' : '▸'}</span>
        <span className="reasoning-label">Рассуждение</span>
      </button>
      {open && (
        <div className="reasoning-body">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}