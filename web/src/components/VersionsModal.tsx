import { useEffect, useState } from 'react'
import { api } from '../api'
import { useEscape } from '../useEscape'
import { toast } from '../toast'
import type { VersionsResult, UpdateInfo } from '../types'

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
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updateErr, setUpdateErr] = useState('')
  const [updating, setUpdating] = useState(false)

  const load = async () => {
    try {
      setData(await api.versions())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const checkUpdate = async () => {
    setUpdateErr('')
    setUpdate(null)
    try {
      setUpdate(await api.updates())
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : String(e))
    }
  }

  const doInstallUpdate = async () => {
    if (!confirm(`Установить обновление ${update?.latest}? Менеджер перезапустится (~10-20 секунд).`)) return
    setUpdating(true)
    setUpdateErr('')
    try {
      await api.installUpdate()
      toast(`Установка ${update?.latest}… перезапуск`, 'success')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : String(e))
      setUpdating(false)
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

        <h3 className="settings-subhead">Обновления с GitHub</h3>
        {update === null && !updateErr && (
          <button className="btn" onClick={() => void checkUpdate()} disabled={updating}>
            Проверить обновления
          </button>
        )}
        {updateErr && <div className="error">{updateErr}</div>}
        {update && (
          <div className="update-card">
            <div className="update-info">
              {update.noReleases ? (
                <span className="muted">Релизов на GitHub ещё нет — после выхода первого релиза здесь появится кнопка обновления.</span>
              ) : (
                <>
                  <span className="version-name">
                    {update.latest}
                    {update.name !== update.latest && ` — ${update.name}`}
                  </span>
                  {update.available ? (
                    <span className="badge">доступно</span>
                  ) : (
                    <span className="muted">установлена последняя версия</span>
                  )}
                  {update.published && <div className="version-meta muted">{new Date(update.published).toLocaleString()}</div>}
                  {update.body && <div className="version-notes">{update.body.slice(0, 500)}</div>}
                </>
              )}
            </div>
            {!update.noReleases && update.available ? (
              <button className="btn btn-primary" onClick={() => void doInstallUpdate()} disabled={updating}>
                {updating ? 'Установка…' : 'Установить и перезапустить'}
              </button>
            ) : (
              update.fullZipUrl && (
                <a className="btn" href={update.fullZipUrl} target="_blank" rel="noreferrer">
                  Скачать полный дистрибутив
                </a>
              )
            )}
          </div>
        )}
        {update === null && !updateErr && <p className="muted">Проверяет последний релиз в GitHub.</p>}

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