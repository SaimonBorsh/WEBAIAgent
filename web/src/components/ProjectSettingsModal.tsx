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
  const [idleTimeout, setIdleTimeout] = useState((project.idleTimeout ?? 30).toString())
  const [icon, setIcon] = useState(project.icon || '')
  const [iconTone, setIconTone] = useState<IconTone>(project.iconTone || 'auto')
  const [busy, setBusy] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const it = parseInt(idleTimeout, 10)
      await api.updateProject(project.id, {
        defaultAgent: agent,
        idleTimeout: Number.isFinite(it) ? it : 30,
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

  const handleToggleStart = async () => {
    setToggling(true)
    setError('')
    try {
      if (project.running) {
        await api.stopProject(project.id)
        toast('Сервер остановлен', 'success')
      } else {
        await api.startProject(project.id)
        toast('Сервер запущен', 'success')
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setToggling(false)
    }
  }

  const handleRestart = async () => {
    setRestarting(true)
    setError('')
    try {
      await api.restartProject(project.id)
      onDone()
      toast('Сервер перезапущен', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-settings" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Настройки проекта</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {project.path}
        </p>

        <div className="settings-server-section">
          <div className="settings-server-row">
            <span className="settings-server-label">
              Сервер:{' '}
              {project.running ? (
                <span className="settings-server-status on">запущен</span>
              ) : project.crashed ? (
                <span className="settings-server-status danger">упал</span>
              ) : (
                <span className="settings-server-status off">остановлен</span>
              )}
            </span>
            <div className="settings-server-actions">
              <button
                type="button"
                className={`btn ${project.running ? 'btn-danger-outline' : 'btn-primary'}`}
                disabled={toggling}
                onClick={() => void handleToggleStart()}
              >
                {toggling ? '…' : project.running ? 'Остановить' : 'Запустить'}
              </button>
              {project.running && (
                <button type="button" className="btn" disabled={restarting} onClick={() => void handleRestart()}>
                  {restarting ? '…' : 'Перезапустить'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settings-divider" />

        <label className="field">
          <span>Агент по умолчанию</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="build">build — выполнение задач</option>
            <option value="plan">plan — планирование без изменений</option>
          </select>
        </label>

        <label className="field">
          <span>Auto-stop при простое (минут, 0 = отключено)</span>
          <select value={idleTimeout} onChange={(e) => setIdleTimeout(e.target.value)}>
            <option value="0">Отключено</option>
            <option value="15">15 минут</option>
            <option value="30">30 минут</option>
            <option value="60">1 час</option>
            <option value="120">2 часа</option>
          </select>
        </label>

        <div className="settings-divider" />

        <span className="field-label">Значок проекта</span>
        <IconPicker glyph={icon} tone={iconTone} onGlyph={setIcon} onTone={setIconTone} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
