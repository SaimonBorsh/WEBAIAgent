import { useState } from 'react'
import { api } from '../api'
import FolderPickerModal from './FolderPickerModal'
import IconPicker, { type IconTone } from './IconPicker'
import { useEscape } from '../useEscape'

interface Props {
  onCreated: () => void
  onClose: () => void
}

export default function NewProjectModal({ onCreated, onClose }: Props) {
  useEscape(onClose)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [icon, setIcon] = useState('')
  const [iconTone, setIconTone] = useState<IconTone>('auto')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Укажите название проекта.')
      return
    }
    setBusy(true)
    try {
      await api.createProject({
        name: name.trim(),
        path: path.trim(),
        autoStart,
        icon: icon || undefined,
        iconTone
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Новый проект</h2>

        <label className="field">
          <span>Название проекта</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Мой веб-магазин"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Папка проекта (абсолютный путь)</span>
          <div className="field-row">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Users\aleks\Documents\Projects\myshop"
            />
            <button type="button" className="btn" onClick={() => setShowPicker(true)}>
              Обзор…
            </button>
          </div>
          <span className="field-hint">Оставьте пустым — будет создана папка в Документах с названием проекта (если такой папки ещё нет).</span>
        </label>

        <label className="check">
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
          <span>Автоматически запускать сервер проекта при старте менеджера</span>
        </label>

        <div className="settings-divider" />

        <span className="field-label">Значок проекта</span>
        <IconPicker glyph={icon} tone={iconTone} onGlyph={setIcon} onTone={setIconTone} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Создание…' : 'Создать'}
          </button>
        </div>

        {showPicker && (
          <FolderPickerModal
            mode="dir"
            initialPath={path || undefined}
            onSelect={(paths) => setPath(paths[0])}
            onClose={() => setShowPicker(false)}
          />
        )}
      </form>
    </div>
  )
}