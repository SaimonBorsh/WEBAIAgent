import { useEffect, useState } from 'react'
import type { QuestionRequest } from '../types'
import { api } from '../api'

interface Props {
  projectId: string
  sessionId: string
  request: QuestionRequest
  onDone: (requestID: string) => void
}

export default function QuestionBar({ projectId, sessionId, request, onDone }: Props) {
  const [selection, setSelection] = useState<Set<string>[]>(() =>
    request.questions.map(() => new Set<string>())
  )
  const [customs, setCustoms] = useState<string[]>(() => request.questions.map(() => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (qi: number, label: string, multiple: boolean) => {
    setSelection((prev) => {
      const next = prev.map((s) => new Set(s))
      if (multiple) {
        if (next[qi].has(label)) next[qi].delete(label)
        else next[qi].add(label)
      } else {
        next[qi] = new Set([label])
      }
      return next
    })
  }

  const answer = (qi: number): string[] => {
    const chosen = [...selection[qi]]
    const custom = customs[qi].trim()
    if (custom) chosen.push(custom)
    return chosen
  }

  const canSubmit = request.questions.every((q, i) => q.custom !== false || selection[i].size > 0)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.replyQuestion(projectId, request.id, request.questions.map((_, i) => answer(i)))
      onDone(request.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.rejectQuestion(projectId, request.id)
      onDone(request.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, selection, customs])

  return (
    <div className="question-bar">
      <div className="question-title">🤔 Ассистент задаёт вопрос — ответьте, чтобы продолжить</div>

      {request.questions.map((q, qi) => (
        <div key={qi} className="question-item">
          {q.header && <div className="question-header">{q.header}</div>}
          <div className="question-text">{q.question}</div>
          {q.options.length > 0 && (
            <div className="question-options">
              {q.options.map((opt) => (
                <label key={opt.label} className={`question-option ${selection[qi].has(opt.label) ? 'selected' : ''}`}>
                  <input
                    type={q.multiple ? 'checkbox' : 'radio'}
                    name={`q-${request.id}-${qi}`}
                    checked={selection[qi].has(opt.label)}
                    onChange={() => toggle(qi, opt.label, Boolean(q.multiple))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    {opt.description && <span className="muted"> — {opt.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {q.custom !== false && (
            <input
              className="question-custom"
              placeholder="Свой вариант ответа…"
              value={customs[qi]}
              onChange={(e) =>
                setCustoms((prev) => prev.map((v, i) => (i === qi ? e.target.value : v)))
              }
            />
          )}
        </div>
      ))}

      {error && <div className="error">{error}</div>}

      <div className="question-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={reject}>
          Пропустить
        </button>
        <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>
          {busy ? 'Отправка…' : 'Ответить (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  )
}