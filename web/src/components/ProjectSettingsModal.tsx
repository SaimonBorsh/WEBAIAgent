import { useState } from 'react'
import type { FreeModel, Project } from '../types'
import { api } from '../api'
import IconPicker, { type IconTone } from './IconPicker'
import { toast } from '../toast'
import { useEscape } from '../useEscape'

interface Props {
  project: Project
  models: FreeModel[]
  onDone: () => void
  onClose: () => void
}

export default function ProjectSettingsModal({ project, models, onDone, onClose }: Props) {
  useEscape(onClose)
  const [agent, setAgent] = useState(project.defaultAgent || 'build')
  const [autoStart, setAutoStart] = useState(Boolean(project.autoStart))
  const [icon, setIcon] = useState(project.icon || '')
  const [iconTone, setIconTone] = useState<IconTone>(project.iconTone || 'auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.updateProject(project.id, {
        defaultAgent: agent,
        autoStart,
        icon: icon || undefined,
        iconTone
      })
      onDone()
      toast('Настройки проекта сохранены', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-settings" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Настройки проекта</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {project.path}
        </p>

        <label className="field">
          <span>Агент по умолчанию</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="build">build — выполнение задач</option>
            <option value="plan">plan — планирование без изменений</option>
          </select>
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
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
