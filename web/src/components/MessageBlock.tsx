import { useState } from 'react'
import type { MessageItem, ToolPart, FilePart, StepFinishPart, PatchPart, SubtaskPart, RetryPart, CompactionPart, StepStartPart, Part } from '../types'
import Markdown from '../md'
import { getShowModel, getShowTokens, getShowReasoning, getShowTimestamps, getStreamingCursor, getAutoExpandTool, getMsgWidth, getShowStepStart, getShowStepFinish } from '../prefs'
import { toolTitle } from '../toolLabels'

function fmtTokens(item: MessageItem): string {
  const t = item.info.tokens
  if (!t) return ''
  const parts: string[] = []
  if (t.input) parts.push(`вход ${t.input}`)
  if (t.output) parts.push(`выход ${t.output}`)
  return parts.join(' · ')
}

function isImageMime(mime: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico)/.test(mime)
}

function ToolView({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(() => {
    if (getAutoExpandTool() && part.state.status === 'completed') return true
    return false
  })
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

function FilePartView({ part }: { part: FilePart }) {
  const isImg = isImageMime(part.mime)
  return (
    <div className="file-part">
      {isImg ? (
        <div className="file-part-image">
          <img src={part.url} alt={part.filename || 'image'} loading="lazy" />
          {part.filename && <span className="file-part-name">{part.filename}</span>}
        </div>
      ) : (
        <div className="attachment-chip static">
          📎 {part.filename || part.url}
        </div>
      )}
    </div>
  )
}

function StepFinishView({ part }: { part: StepFinishPart }) {
  const [open, setOpen] = useState(false)
  const t = part.tokens
  const tokenParts: string[] = []
  if (t?.input) tokenParts.push(`вход: ${t.input}`)
  if (t?.output) tokenParts.push(`выход: ${t.output}`)
  if (t?.reasoning) tokenParts.push(`рассуждение: ${t.reasoning}`)
  if (t?.cache?.read) tokenParts.push(`кэш чтение: ${t.cache.read}`)
  if (t?.cache?.write) tokenParts.push(`кэш запись: ${t.cache.write}`)
  const costStr = part.cost ? `${part.cost.toFixed(4)} $` : null
  const reasonLabel: Record<string, string> = {
    stop: 'Завершено',
    length: 'Достигнут лимит токенов',
    content_filter: 'Фильтр контента',
    error: 'Ошибка'
  }
  return (
    <div className="step-finish">
      <button className="step-finish-head" onClick={() => setOpen(!open)}>
        <span className="step-finish-icon">●</span>
        <span className="step-finish-label">{reasonLabel[part.reason] || part.reason}</span>
        {tokenParts.length > 0 && <span className="step-finish-tokens">{tokenParts.join(' · ')}</span>}
        {costStr && <span className="step-finish-cost">{costStr}</span>}
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="step-finish-body">
          {tokenParts.length > 0 && <div>Токены: {tokenParts.join(', ')}</div>}
          {costStr && <div>Стоимость: {costStr}</div>}
          <div>Причина: {part.reason}</div>
        </div>
      )}
    </div>
  )
}

function PatchView({ part }: { part: PatchPart }) {
  const [open, setOpen] = useState(false)
  if (!part.files || part.files.length === 0) return null
  return (
    <div className="patch-part">
      <button className="patch-head" onClick={() => setOpen(!open)}>
        <span className="patch-icon">📝</span>
        <span className="patch-label">Изменения ({part.files.length} файлов)</span>
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="patch-body">
          {part.files.map((f) => (
            <div key={f} className="patch-file">{f}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function SubtaskView({ part }: { part: SubtaskPart }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="subtask-part">
      <button className="subtask-head" onClick={() => setOpen(!open)}>
        <span className="subtask-icon">🔀</span>
        <span className="subtask-label">{part.description || 'Подзадача'}</span>
        {part.agent && <span className="subtask-agent">{part.agent}</span>}
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="subtask-body">
          <div className="subtask-prompt">{part.prompt}</div>
          {part.model && <div className="subtask-model">{part.model.providerID}/{part.model.modelID}</div>}
        </div>
      )}
    </div>
  )
}

function RetryView({ part }: { part: RetryPart }) {
  return (
    <div className="retry-part">
      <span className="retry-icon">🔄</span>
      <span className="retry-label">
        Повтор {part.attempt}: {part.error?.message || part.error?.name || 'неизвестная ошибка'}
      </span>
    </div>
  )
}

function CompactionView({ part }: { part: CompactionPart }) {
  return (
    <div className="compaction-part">
      <span className="compaction-icon">📦</span>
      <span className="compaction-label">
        {part.auto ? 'Автоматическое сжатие контекста' : 'Сжатие контекста'}
        {part.overflow && ' (переполнение)'}
      </span>
    </div>
  )
}

function StepStartView() {
  return (
    <div className="step-start-part">
      <span className="step-start-line" />
    </div>
  )
}

function UnknownPartView({ part }: { part: Part }) {
  const [open, setOpen] = useState(false)
  const data = JSON.stringify(part, null, 2)
  return (
    <div className="unknown-part">
      <button className="unknown-head" onClick={() => setOpen(!open)}>
        <span className="unknown-icon">❓</span>
        <span className="unknown-label">{part.type}</span>
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre className="unknown-body">
          <code>{data}</code>
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
  const showReasoningPref = getShowReasoning()
  const reasoningParts = showReasoningPref ? parts.filter((p) => p.type === 'reasoning') : []
  const toolParts = parts.filter((p) => p.type === 'tool') as ToolPart[]
  const fileParts = parts.filter((p) => p.type === 'file') as FilePart[]
  const stepFinishParts = getShowStepFinish() ? (parts.filter((p) => p.type === 'step-finish') as StepFinishPart[]) : []
  const stepStartParts = getShowStepStart() ? (parts.filter((p) => p.type === 'step-start') as StepStartPart[]) : []
  const patchParts = parts.filter((p) => p.type === 'patch') as PatchPart[]
  const subtaskParts = parts.filter((p) => p.type === 'subtask') as SubtaskPart[]
  const retryParts = parts.filter((p) => p.type === 'retry') as RetryPart[]
  const compactionParts = parts.filter((p) => p.type === 'compaction') as CompactionPart[]
  const unknownParts = parts.filter((p) => !['text', 'reasoning', 'tool', 'file', 'step-finish', 'step-start', 'patch', 'subtask', 'retry', 'compaction'].includes(p.type))

  const hasError = Boolean(info.error)

  const widthClass = getMsgWidth() === 'narrow' ? 'max-narrow' : getMsgWidth() === 'wide' ? 'max-wide' : ''

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'} ${widthClass}`}>
      <div className="message-meta">
        <span className="message-role">{isUser ? 'Вы' : 'Ассистент'}</span>
        {!isUser && info.modelID && getShowModel() && <span className="message-model">{info.modelID}</span>}
        {!isUser && getShowTokens() && fmtTokens(item) && <span className="message-tokens">{fmtTokens(item)}</span>}
        {getShowTimestamps() && (
          <span className="message-time">
            {new Date(info.time.created).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
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
            <FilePartView key={p.id} part={p} />
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

          {retryParts.map((p) => (
            <RetryView key={p.id} part={p} />
          ))}

          {compactionParts.map((p) => (
            <CompactionView key={p.id} part={p} />
          ))}

          {stepStartParts.map((p) => (
            <StepStartView key={p.id} />
          ))}

          {reasoningParts.map((p) => (
            <ReasoningBlock key={p.id} text={(p as { text?: string }).text || ''} defaultOpen={false} />
          ))}

          {subtaskParts.map((p) => (
            <SubtaskView key={p.id} part={p} />
          ))}

          {toolParts.map((p) => (
            <ToolView key={p.id} part={p} />
          ))}

          {patchParts.map((p) => (
            <PatchView key={p.id} part={p} />
          ))}

          {fileParts.map((p) => (
            <FilePartView key={p.id} part={p} />
          ))}

          {assistantText && (
            <div className={streaming && getStreamingCursor() ? 'assistant-streaming' : ''}>
              <Markdown text={assistantText} />
            </div>
          )}

          {stepFinishParts.map((p) => (
            <StepFinishView key={p.id} part={p} />
          ))}

          {unknownParts.map((p) => (
            <UnknownPartView key={p.id || p.type} part={p} />
          ))}

          {!assistantText && !toolParts.length && !reasoningParts.length && !hasError && !stepFinishParts.length && !compactionParts.length && !retryParts.length && !patchParts.length && !subtaskParts.length && !unknownParts.length && (
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
