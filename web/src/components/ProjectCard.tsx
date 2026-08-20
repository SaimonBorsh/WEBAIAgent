import { useState } from 'react'
import type { Project } from '../types'
import { api } from '../api'
import RenameProjectModal from './RenameProjectModal'
import DropdownMenu from './DropdownMenu'
import ProjectIcon from './ProjectIcon'

interface Props {
  project: Project
  onChanged: () => void
  onOpen: () => void
}

export default function ProjectCard({ project, onChanged, onOpen }: Props) {
  const [busy, setBusy] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [error, setError] = useState('')

  const archived = Boolean(project.archived)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleAutoStart = async (checked: boolean) => {
    await api.updateProject(project.id, { autoStart: checked })
    onChanged()
  }

  const deleteProject = async () => {
    if (!confirm('Удалить проект из списка? Папки и файлы на диске останутся нетронутыми.')) return
    await act(() => api.deleteProject(project.id))
  }

  const toggleArchive = async () => {
    if (!archived && !confirm('Архивировать проект? Его сервер будет остановлен, а управление переместится в архив.')) return
    await act(() => api.updateProject(project.id, { archived: !archived }))
  }

  return (
    <div className={`card ${project.running ? 'card-running' : ''} ${archived ? 'card-archived' : ''}`}>
      <div className="card-head">
        <div className="card-title">
          <ProjectIcon project={project} size="md" />
          <strong>{project.name}</strong>
        </div>
        <div className="card-badges">
          {archived ? (
            <span className="badge badge-archived">в архиве</span>
          ) : project.running ? (
            <span className="badge badge-on">запущен</span>
          ) : (
            <span className="badge badge-off">остановлен</span>
          )}
        </div>
      </div>

      <div className="card-path" title={project.path}>
        {project.path}
      </div>

      <label className="check check-inline">
        <input
          type="checkbox"
          checked={project.autoStart}
          onChange={(e) => toggleAutoStart(e.target.checked)}
        />
        <span>Авто-старт</span>
      </label>

      {error && <div className="error">{error}</div>}

      <div className="card-actions">
        <button className="btn btn-primary" onClick={onOpen}>
          Открыть
        </button>
        {project.running ? (
          <button className="btn" disabled={busy} onClick={() => act(() => api.stopProject(project.id))}>
            Остановить
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={() => act(() => api.startProject(project.id))}>
            Запустить
          </button>
        )}
        <DropdownMenu
          title="Ещё"
          items={[
            { label: 'Переименовать', onClick: () => setShowRename(true) },
            { label: archived ? 'Вернуть из архива' : 'В архив', onClick: () => void toggleArchive() },
            { label: 'Удалить проект', danger: true, onClick: () => void deleteProject() }
          ]}
        />
      </div>

      {showRename && (
        <RenameProjectModal
          initialName={project.name}
          onSave={async (name) => {
            await api.updateProject(project.id, { name })
          }}
          onClose={() => setShowRename(false)}
        />
      )}
    </div>
  )
}