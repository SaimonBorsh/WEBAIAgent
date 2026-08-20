import { useEffect, useState } from 'react'
import { api } from '../api'
import { useEscape } from '../useEscape'
import { toast } from '../toast'
import type { VersionsResult } from '../types'

interface Props {
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ГБ`
  return `${mb.toFixed(1)} МБ`
}

export default function VersionsModal({ onClose }: Props) {
  useEscape(onClose)
  const [data, setData] = useState<VersionsResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    try {
      setData(await api.versions())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const doSwitch = async (name: string) => {
    const target = data?.versions.find((v) => v.name === name)
    if (!target) return
    const msg =
      data?.current && target.active
        ? `Версия ${name} уже активна.`
        : `Переключиться на версию ${name}? Менеджер перезапустится (~10-20 секунд).`
    if (!confirm(msg)) return
    setBusy(true)
    setErr('')
    try {
      await api.switchVersion(name)
      toast(`Переключение на ${name}… менеджер перезапускается`, 'success')
      setBusy(true)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const doUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!/^v\d+$/.test(name)) {
      setErr('Укажите номер версии вида v36 (например v36).')
      return
    }
    const fileInput = document.getElementById('version-zip-input') as HTMLInputElement | null
    const file = fileInput?.files?.[0]
    if (!file) {
      setErr('Выберите zip-файл с версией.')
      return
    }
    setErr('')
    setUploading(true)
    try {
      await api.uploadVersion(file, name)
      toast(`Версия ${name} установлена. Перезапуск…`, 'success')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
      setUploading(false)
    }
  }

  const versions = data?.versions ?? []
  const current = data?.current

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-settings" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Версии</h2>
        <p className="muted">
          Переносимая установка хранит версии в папке <code>versions/</code>. Активная версия указана в{' '}
          <code>current.txt</code>. Старые версии сохраняются — всегда можно откатиться.
        </p>

        {versions.length === 0 && !data && !err && <div className="muted">Загрузка…</div>}
        {versions.length === 0 && data && <div className="muted">Установленных версий нет (режим разработки).</div>}

        <div className="versions-list">
          {versions.map((v) => (
            <div key={v.name} className={`version-item ${v.active ? 'active' : ''}`}>
              <div className="version-info">
                <span className="version-name">
                  {v.name}
                  {v.active && <span className="badge">активна</span>}
                </span>
                <span className="version-meta muted">
                  {formatSize(v.size)}
                  {v.created ? ` · ${new Date(v.created).toLocaleString()}` : ''}
                  {!v.hasServer || !v.hasWeb ? ' · неполная' : ''}
                </span>
              </div>
              <button
                className="btn btn-small"
                disabled={busy || v.active}
                onClick={() => doSwitch(v.name)}
              >
                {v.active ? 'Активна' : 'Переключить'}
              </button>
            </div>
          ))}
        </div>

        <div className="settings-divider" />

        <form onSubmit={doUpload}>
          <h3 className="settings-subhead">Установить новую версию</h3>
          <div className="settings-row">
            <label className="field">
              <span>Номер версии</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="например v36"
                disabled={uploading}
              />
            </label>
            <label className="field">
              <span>Zip-архив версии</span>
              <input id="version-zip-input" type="file" accept=".zip,application/zip" disabled={uploading} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Установка…' : 'Установить и перезапустить'}
            </button>
          </div>
        </form>

        {err && <div className="error">{err}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}