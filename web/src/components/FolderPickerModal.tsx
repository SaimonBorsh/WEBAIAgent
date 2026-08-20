import { useCallback, useEffect, useState } from 'react'
import type { FsListResult } from '../types'
import { api } from '../api'
import { useEscape } from '../useEscape'

interface Props {
  mode: 'dir' | 'file'
  initialPath?: string
  onSelect: (paths: string[]) => void
  onClose: () => void
}

function fmtSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export default function FolderPickerModal({ mode, initialPath, onSelect, onClose }: Props) {
  useEscape(onClose)
  const [current, setCurrent] = useState(initialPath || '')
  const [data, setData] = useState<FsListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [navigating, setNavigating] = useState(false)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.fsList(path)
      setData(res)
      setCurrent(res.current?.path || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
      setNavigating(false)
    }
  }, [])

  useEffect(() => {
    void load(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDir = (path: string) => {
    setSelected(new Set())
    setNavigating(true)
    void load(path)
  }

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const confirm = () => {
    if (mode === 'dir') {
      onSelect([current])
    } else {
      onSelect([...selected])
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'dir' ? 'Выбор папки проекта' : 'Выбор файлов'}</h2>

        <div className="picker-path">
          <input
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setNavigating(true)
                void load(current)
              }
            }}
            placeholder="Путь к папке…"
          />
          <button className="btn" disabled={loading || navigating} onClick={() => {
            setNavigating(true)
            void load(current)
          }}>
            Перейти
          </button>
          <button className="btn btn-ghost" disabled={!data?.parent} onClick={() => data?.parent && openDir(data.parent)}>
            ↑ Наверх
          </button>
        </div>

        {error && <div className="error strip">{error}</div>}
        {loading ? (
          <div className="muted pad">Загрузка…</div>
        ) : (
          <div className="picker-list">
            {data?.current && (
              <div className="picker-current">📁 {data.current.name}</div>
            )}
            {data?.entries.length === 0 && <div className="muted pad">Папка пуста</div>}
            {data?.entries.map((entry) =>
              entry.type === 'dir' ? (
                <div key={entry.path} className="picker-row" onClick={() => openDir(entry.path)}>
                  <span className="picker-icon">📁</span>
                  <span className="picker-name">{entry.name}</span>
                  <span className="muted">папка</span>
                </div>
              ) : (
                <div
                  key={entry.path}
                  className={`picker-row ${selected.has(entry.path) ? 'selected' : ''}`}
                  onClick={() => mode === 'file' && toggleFile(entry.path)}
                >
                  <span className="picker-icon">{mode === 'file' ? '📄' : '📄'}</span>
                  <span className="picker-name">{entry.name}</span>
                  <span className="muted">{fmtSize(entry.size)}</span>
                </div>
              )
            )}
          </div>
        )}

        <div className="modal-actions">
          {mode === 'file' && (
            <span className="muted picker-count">
              Выбрано: {selected.size}
            </span>
          )}
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            disabled={
              loading ||
              (mode === 'dir' ? !current : selected.size === 0)
            }
            onClick={confirm}
          >
            {mode === 'dir' ? 'Выбрать папку' : 'Прикрепить'}
          </button>
        </div>
      </div>
    </div>
  )
}