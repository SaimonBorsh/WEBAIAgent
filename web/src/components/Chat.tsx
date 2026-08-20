import { useCallback, useEffect, useRef, useState } from 'react'
import type { MessageItem, MessageInfo, Part, Permission, EventPayload, FilePartInput, TextPartInput, QuestionRequest, SessionConfig, ToolPart } from '../types'
import { api, subscribeEvents, isModelLimitError, getModelRetryAfter } from '../api'
import MessageBlock from './MessageBlock'
import PermissionBar from './PermissionBar'
import QuestionBar from './QuestionBar'
import FolderPickerModal from './FolderPickerModal'
import { getShowReasoning } from '../prefs'
import { toolTitle } from '../toolLabels'
import { toast } from '../toast'

interface Attachment {
  id: string
  name: string
  size?: number
  url: string
  mime: string
}

interface Props {
  projectId: string
  sessionId: string
  config: SessionConfig
}

const MAX_DRAG_BYTES = 5 * 1024 * 1024

function draftKey(projectId: string, sessionId: string): string {
  return `webaia_draft_${projectId}_${sessionId}`
}

const SUGGESTIONS = [
  'Проанализируй проект и опиши его структуру',
  'Создай AGENTS.md в корне проекта',
  'Найди потенциальные баги и ошибки в коде',
  'Напиши тесты для ключевых модулей'
]

const STALE_TOOL_MS = 120_000
const ACTIVE_MS = 60_000

function hasRecentRunningTool(m: MessageItem, now: number): boolean {
  return m.parts.some((p) => {
    if (p.type !== 'tool') return false
    const state = (p as ToolPart).state
    if (state.status !== 'running') return false
    const start = state.time?.start
    if (!start) return true
    return now - start < STALE_TOOL_MS
  })
}

function notifyDone() {
  const orig = document.title
  let i = 0
  const timer = setInterval(() => {
    i++
    document.title = i % 2 === 0 ? orig : '✓ Готово'
    if (i >= 6) {
      clearInterval(timer)
      document.title = orig
    }
  }, 700)
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    }
  } catch {
    /* audio unavailable */
  }
}

export default function Chat({ projectId, sessionId, config }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [input, setInput] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [questions, setQuestions] = useState<QuestionRequest[]>([])
  const [aborting, setAborting] = useState(false)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [queued, setQueued] = useState(false)
  const queueRef = useRef<{ lastAssistantId?: string } | null>(null)
  const wasBusyRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const messagesRef = useRef<MessageItem[]>([])
  const busyRef = useRef(false)
  const lastActivityRef = useRef(0)
  const fullLoadedRef = useRef(false)
  const serverCountRef = useRef(0)
  const lastPartAtRef = useRef(0)
  const [visibleLimit, setVisibleLimit] = useState(150)

  busyRef.current = busy
  messagesRef.current = messages

  const pollActivity = useCallback(async () => {
    try {
      const s = await api.session(projectId, sessionId)
      lastActivityRef.current = s.time?.updated || 0
    } catch {
      /* ignore */
    }
  }, [projectId, sessionId])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const updateBusy = (msgs: MessageItem[]) => {
    const now = Date.now()
    const last = [...msgs].reverse().find((m) => m.info.role === 'assistant')
    const recentTool = msgs.some((m) => hasRecentRunningTool(m, now))
    const recentPart = now - lastPartAtRef.current < ACTIVE_MS
    const active = recentTool || (last && !last.info.time.completed && recentPart)
    if (active) {
      setBusy(true)
    } else if (last && (last.info.time.completed || !recentPart)) {
      setBusy(false)
    } else if (!last) {
      setBusy(false)
    }
    if (queueRef.current && !active) {
      queueRef.current = null
      setQueued(false)
    }
  }

  const loadMessages = useCallback(async () => {
    try {
      if (!fullLoadedRef.current) {
        const msgs = await api.messages(projectId, sessionId, 10000)
        fullLoadedRef.current = true
        serverCountRef.current = msgs.length
        lastPartAtRef.current = Date.now()
        setMessages(msgs)
        updateBusy(msgs)
      } else {
        const delta = await api.messages(projectId, sessionId, 200, serverCountRef.current)
        if (delta.length) {
          serverCountRef.current += delta.length
          lastPartAtRef.current = Date.now()
          const merged = appendDelta(messagesRef.current, delta)
          setMessages(merged)
          updateBusy(merged)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId, sessionId])

  useEffect(() => {
    setMessages([])
    setPermissions([])
    setBusy(false)
    setError('')
    setStatusText('')
    setAttachments([])
    setQuestions([])
    try {
      setInput(localStorage.getItem(draftKey(projectId, sessionId)) || '')
    } catch {
setInput('')
    try {
      localStorage.removeItem(draftKey(projectId, sessionId))
    } catch {
      /* ignore */
    }
    }
    fullLoadedRef.current = false
    serverCountRef.current = 0
    setVisibleLimit(150)
    void loadMessages()
    void pollActivity()
    api
      .questions(projectId)
      .then((list) => setQuestions(list.filter((q) => q.sessionID === sessionId)))
      .catch(() => {})
  }, [projectId, sessionId, loadMessages])

  useEffect(() => {
    if (!sessionId) return
    const unsubscribe = subscribeEvents(projectId, (event: EventPayload) => {
      const p = event.properties
      if (event.type === 'session.status' && p.sessionID === sessionId) {
        const st = p.status
        if (st?.type === 'busy') setBusy(true)
        else if (st?.type === 'idle') setBusy(false)
        else if (st?.type === 'retry') setStatusText(`Повтор (попытка ${st.attempt}): ${st.message || ''}`)
        return
      }
      if (event.type === 'session.idle' && p.sessionID === sessionId) {
        setBusy(false)
        return
      }
      if (event.type === 'session.error' && (!p.sessionID || p.sessionID === sessionId)) {
        const err = p.error as { name?: string; data?: { message?: string } } | undefined
        if (err) setError(err.data?.message || err.name || 'Ошибка сессии')
        return
      }
      if (event.type === 'message.part.updated' && p.sessionID === sessionId && p.part) {
        lastPartAtRef.current = Date.now()
        let found = false
        setMessages((prev) => {
          const next = applyPart(prev, p.part as Part, p.delta)
          found = next !== prev
          return next
        })
        if (!found) {
          setTimeout(() => void loadMessages(), 600)
        }
        return
      }
      if (event.type === 'message.updated' && p.sessionID === sessionId && p.info) {
        lastPartAtRef.current = Date.now()
        setMessages((prev) => upsertMessage(prev, p.info as MessageInfo))
        return
      }
      if (event.type === 'message.removed' && p.sessionID === sessionId && p.messageID) {
        lastPartAtRef.current = Date.now()
        setMessages((prev) => prev.filter((m) => m.info.id !== p.messageID))
        return
      }
      if (event.type === 'permission.updated' && p.sessionID === sessionId) {
        setPermissions((prev) =>
          prev.some((x) => x.id === p.id) ? prev : [...prev, p as unknown as Permission]
        )
        return
      }
      if (event.type === 'permission.replied' && p.sessionID === sessionId && p.permissionID) {
        setPermissions((prev) => prev.filter((x) => x.id !== p.permissionID))
      }
      const isQuestionEvent = /question/.test(event.type)
      if (isQuestionEvent && p.sessionID === sessionId) {
        if (event.type === 'question.asked' || event.type === 'question.v2.asked') {
          if (p.id) {
            setQuestions((prev) =>
              prev.some((q) => q.id === p.id) ? prev : [...prev, p as unknown as QuestionRequest]
            )
          }
        }
        const requestID = (p as { requestID?: string }).requestID || (p as { id?: string }).id
        if (event.type === 'question.replied' || event.type === 'question.rejected' || event.type === 'question.v2.replied' || event.type === 'question.v2.rejected') {
          if (requestID) {
            setQuestions((prev) => prev.filter((q) => q.id !== requestID))
          }
        }
      }
    })
    return unsubscribe
  }, [projectId, sessionId, loadMessages])

  useEffect(() => {
    if (!sessionId) return
    const timer = setInterval(() => {
      void loadMessages()
      void pollActivity()
    }, 3000)
    return () => clearInterval(timer)
  }, [sessionId, loadMessages, pollActivity])

  useEffect(() => {
    if (wasBusyRef.current && !busy && document.hidden) {
      notifyDone()
    }
    wasBusyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000))), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    if (!stickRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, statusText, permissions])

  const sendParts = async (parts: (TextPartInput | FilePartInput)[]) => {
    const model = config.model || 'opencode/deepseek-v4-flash-free'
    const [providerID, modelID] = model.split('/')
    setError('')
    setStatusText('')
    const body: Record<string, unknown> = {
      model: { providerID, modelID },
      parts
    }
    if (config.agent) body.agent = config.agent
    if (config.system) body.system = config.system
    if (typeof config.temperature === 'number') body.temperature = config.temperature
    if (typeof config.topP === 'number') body.topP = config.topP
    if (typeof config.maxTokens === 'number') body.maxTokens = config.maxTokens
    await api.sendMessage(projectId, sessionId, body as Parameters<typeof api.sendMessage>[2])
  }

  const send = async () => {
    if (sendingRef.current) return
    const text = input.trim()
    if ((!text && attachments.length === 0) || questions.length > 0) return
    sendingRef.current = true
    setSending(true)
    if (busy) {
      queueRef.current = { lastAssistantId }
      setQueued(true)
    } else {
      queueRef.current = null
      setQueued(false)
    }
    setInput('')
    const parts: (TextPartInput | FilePartInput)[] = attachments.map((a) => ({
      type: 'file',
      url: a.url,
      filename: a.name,
      mime: a.mime
    }))
    if (text) parts.push({ type: 'text', text })
    const optimistic = optimisticUserMessage(text, attachments)
    setAttachments([])
    setMessages((prev) => [...prev.filter((m) => !m.info.id.startsWith('tmp-')), optimistic])
    try {
      await sendParts(parts)
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err))
      if (isModelLimitError(errObj)) {
        const retrySec = getModelRetryAfter(errObj) || 60
        const minutes = Math.ceil(retrySec / 60)
        setError(`Лимит токенов исчерпан. Повторите попытку через ${minutes} мин.`)
      } else {
        setError(errObj.message)
      }
      void loadMessages()
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const retryLast = async () => {
    if (sendingRef.current) return
    if (busy || questions.length > 0) return
    sendingRef.current = true
    setSending(true)
    const lastUser = [...messages].reverse().find((m) => m.info.role === 'user')
    if (!lastUser) {
      sendingRef.current = false
      setSending(false)
      return
    }
    const text = lastUser.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text?: string }).text || '')
      .join('\n')
    const files = lastUser.parts.filter((p) => p.type === 'file') as unknown as Attachment[]
    const parts: (TextPartInput | FilePartInput)[] = files.map((a) => ({
      type: 'file',
      url: a.url,
      filename: (a as { filename?: string }).filename || a.name,
      mime: a.mime
    }))
    if (text) parts.push({ type: 'text', text })
    setError('')
    setStatusText('')
    try {
      await sendParts(parts)
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err))
      if (isModelLimitError(errObj)) {
        const retrySec = getModelRetryAfter(errObj) || 60
        const minutes = Math.ceil(retrySec / 60)
        setError(`Лимит токенов исчерпан. Повторите попытку через ${minutes} мин.`)
      } else {
        setError(errObj.message)
      }
      void loadMessages()
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const abort = async () => {
    if (aborting) return
    setAborting(true)
    setStatusText('Отменяю…')
    try {
      await api.abort(projectId, sessionId)
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      setAborting(false)
      if (busyRef.current) {
        setStatusText(
          'Остановка не завершилась — вероятно, выполняется длинная команда, которую нельзя прервать. Она доработает сама, либо напишите «продолжи» в этом чате.'
        )
      } else {
        setStatusText('')
      }
    }, 5000)
  }

  const continueAgent = async () => {
    if (sendingRef.current) return
    if (questions.length > 0) return
    sendingRef.current = true
    setSending(true)
    setStatusText('Продолжаю…')
    setMessages((prev) => [...prev.filter((m) => !m.info.id.startsWith('tmp-')), optimisticUserMessage('Продолжи')])
    try {
      await sendParts([{ type: 'text', text: 'Продолжи' }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      void loadMessages()
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const addPathAttachments = (paths: string[]) => {
    const items: Attachment[] = paths.map((p) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: p.split(/[\\/]/).pop() || p,
      url: 'file:///' + p.replace(/\\/g, '/'),
      mime: 'text/plain'
    }))
    setAttachments((prev) => [...prev, ...items])
    setShowFilePicker(false)
  }

  const addDroppedFiles = useCallback(async (files: FileList | File[]) => {
    const dropped: Attachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_DRAG_BYTES) {
        setError(`Файл «${file.name}» больше 5 МБ — прикрепите его через «Файл…» по пути.`)
        continue
      }
      try {
        const up = await api.uploadFile(file, file.name, file.type || 'application/octet-stream')
        dropped.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          url: up.url,
          mime: up.mime || file.type || 'text/plain'
        })
      } catch (err) {
        setError(`Не удалось загрузить файл «${file.name}»: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (dropped.length) setAttachments((prev) => [...prev, ...dropped])
  }, [])

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.files?.length) void addDroppedFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', onDrop)
    }
  }, [addDroppedFiles])

  const lastAssistantId = [...messages].reverse().find((m) => m.info.role === 'assistant')?.info.id
  const streamingAssistant =
    busy && lastAssistantId !== undefined && !messages.find((m) => m.info.id === lastAssistantId)?.info.time.completed
  const now = Date.now()
  const runningTool = messages
    .flatMap((m) => m.parts)
    .filter((p): p is ToolPart => p.type === 'tool')
    .filter((p) => p.state.status === 'running' && (p.state.time?.start ? now - p.state.time.start < STALE_TOOL_MS : true))
    .sort((a, b) => (b.state.time?.start || 0) - (a.state.time?.start || 0))[0]
  const currentTool = runningTool ? toolTitle(runningTool) : undefined
  const hasRunningTools = !!runningTool
  const reasoningSnippet =
    getShowReasoning() && busy
      ? [...messages]
          .reverse()
          .flatMap((m) => m.parts)
          .filter((p) => p.type === 'reasoning')
          .map((p) => (p as { text?: string }).text || '')
          .join(' ')
          .trim()
          .slice(-120)
      : ''
  const phase: 'thinking' | 'acting' | 'responding' = streamingAssistant
    ? 'responding'
    : hasRunningTools
      ? 'acting'
      : 'thinking'
  const idleMs = busy && lastActivityRef.current ? Date.now() - lastActivityRef.current : 0
  const hung = idleMs > 40_000
  const textOfMsg = (m: MessageItem) =>
    m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text?: string }).text || '')
      .join(' ')
      .trim()
  const renderMsgs = (visibleLimit >= messages.length ? messages : messages.slice(messages.length - visibleLimit)).filter(
    (m) => {
      if (!m.info.id.startsWith('tmp-')) return true
      const t = textOfMsg(m)
      return t ? !messages.some((o) => o.info.role === 'user' && !o.info.id.startsWith('tmp-') && textOfMsg(o) === t) : true
    }
  )

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 && !busy && (
          <div className="empty small">
            <p>Начните диалог — задайте задачу агенту.</p>
            <p className="muted">
              Агент может править файлы и запускать команды. Подтверждение действий появится здесь.
            </p>
            <div className="suggestion-pills">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="suggestion-pill"
                  onClick={() => {
                    setInput(s)
                    inputRef.current?.focus()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length > visibleLimit && (
          <div className="load-earlier">
            <button className="btn" type="button" onClick={() => setVisibleLimit((l) => l + 200)}>
              Показать ранее — показаны последние {visibleLimit} из {messages.length}
            </button>
          </div>
        )}

        {renderMsgs.map((m) => (
          <MessageBlock
            key={m.info.id}
            item={m}
            streaming={busy && m.info.role === 'assistant' && !m.info.time.completed}
            canRetry={
              !busy && m.info.role === 'assistant' && lastAssistantId === m.info.id && Boolean(m.info.time.completed)
            }
            onRetry={() => void retryLast()}
          />
        ))}

        <div aria-live="polite">
          {busy &&
            (hung ? (
              <div className="status-line status-line-danger">
                <span>
                  Обновлений уже {Math.round(idleMs / 1000)} с. Похоже, агент завис.
                </span>
                <button className="btn btn-small btn-danger" type="button" onClick={() => void continueAgent()} disabled={aborting || sending}>
                  Продолжить
                </button>
              </div>
            ) : (
              <div className="status-line">
                {phase === 'acting' && currentTool ? (
                  <>
                    Выполняет: {currentTool.label}
                    {currentTool.detail && <span className="status-detail"> · {currentTool.detail}</span>}…
                  </>
                ) : phase === 'responding' ? (
                  'Печатает…'
                ) : reasoningSnippet ? (
                  <>
                    Думает… <span className="status-detail">{reasoningSnippet}…</span>
                  </>
                ) : (
                  'Думает…'
                )}{' '}
                ({elapsed} с)
              </div>
            ))}
          {statusText && <div className="status-line">{statusText}</div>}
        </div>
        {error && <div className="error">{error}</div>}

        {questions.map((q) => (
          <QuestionBar
            key={q.id}
            projectId={projectId}
            sessionId={sessionId}
            request={q}
            onDone={(id) => setQuestions((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}

        {permissions.map((perm) => (
          <PermissionBar
            key={perm.id}
            projectId={projectId}
            permission={perm}
            onDone={(id) => setPermissions((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {queued && (
        <div className="queue-line" role="status">
          ⏳ В очереди — агент закончит текущую задачу, затем обработает ваше сообщение.
        </div>
      )}

      <div
        className={`chat-input ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
      >
        {attachments.length > 0 && (
          <div className="attachment-chips">
            {attachments.map((a) => (
              <span key={a.id} className="attachment-chip" title={a.url}>
                📎 {a.name}
                <button
                  className="chip-remove"
                  aria-label="Убрать файл"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            try {
              localStorage.setItem(draftKey(projectId, sessionId), e.target.value)
            } catch {
              /* ignore */
            }
          }}
          onKeyDown={onKeyDown}
          placeholder="Сообщение агенту… (Enter — отправить, Shift+Enter — новая строка, перетащите файлы сюда)"
          rows={2}
        />
        <div className="chat-input-actions">
          <button
            className="btn"
            title="Прикрепить файл по пути"
            disabled={busy}
            onClick={() => setShowFilePicker(true)}
          >
            📎 Файл
          </button>
          {busy ? (
            <button className="btn btn-danger" onClick={() => void abort()} disabled={aborting}>
              {aborting ? 'Отменяю…' : 'Остановить'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={send}
              disabled={sending || (!input.trim() && attachments.length === 0) || questions.length > 0}
            >
              Отправить
            </button>
          )}
        </div>
      </div>

      {showFilePicker && (
        <FolderPickerModal
          mode="file"
          onSelect={addPathAttachments}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  )
}

function appendDelta(prev: MessageItem[], delta: MessageItem[]): MessageItem[] {
  let next = prev
  for (const real of delta) {
    const idx = next.findIndex((m) => m.info.id === real.info.id)
    if (idx >= 0) {
      next = [...next.slice(0, idx), real, ...next.slice(idx + 1)]
      continue
    }
    if (real.info.role === 'user') {
      const optIdx = next.findIndex((m) => m.info.id.startsWith('tmp-'))
      if (optIdx >= 0) {
        next = [...next.slice(0, optIdx), real, ...next.slice(optIdx + 1)]
        continue
      }
    }
    next = [...next, real]
  }
  return next
}

function applyPart(prev: MessageItem[], part: Part, delta?: string): MessageItem[] {
  const messageID = part.messageID
  if (!messageID) return prev
  let found = false
  const next = prev.map((msg) => {
    if (msg.info.id !== messageID) return msg
    found = true
    let partFound = false
    const parts = msg.parts.map((p) => {
      if (p.id !== part.id) return p
      partFound = true
      if (delta && p.type === 'text' && part.type === 'text') {
        return { ...p, text: (p as { text?: string }).text + delta }
      }
      return part
    })
    if (!partFound) {
      const dupIdx = parts.findIndex(
        (p) =>
          p.type === part.type &&
          'text' in p &&
          'text' in part &&
          (p as { text?: string }).text === (part as { text?: string }).text
      )
      if (dupIdx >= 0) {
        parts[dupIdx] = part
      } else {
        parts.push(part)
      }
    }
    return { ...msg, parts }
  })
  return found ? next : prev
}

function upsertMessage(prev: MessageItem[], info: MessageInfo): MessageItem[] {
  const idx = prev.findIndex((m) => m.info.id === info.id)
  if (idx >= 0) {
    const next = [...prev]
    next[idx] = { ...next[idx], info }
    return next
  }
  if (info.role === 'user') {
    const optIdx = prev.findIndex((m) => m.info.id.startsWith('tmp-'))
    if (optIdx >= 0) {
      const next = [...prev]
      next[optIdx] = { info, parts: [] }
      return next
    }
  }
  return [...prev, { info, parts: [] }]
}

function optimisticUserMessage(text: string, attachments: Attachment[] = []): MessageItem {
  const id = `tmp-${Date.now()}`
  const parts: Part[] = attachments.map((a) => ({
    type: 'file',
    id: `${id}-f-${a.id}`,
    sessionID: '',
    messageID: id,
    url: a.url,
    filename: a.name,
    mime: a.mime
  }))
  if (text) parts.push({ type: 'text', id: `${id}-p`, sessionID: '', messageID: id, text })
  return { info: { id, sessionID: '', role: 'user', time: { created: Date.now() } }, parts }
}
