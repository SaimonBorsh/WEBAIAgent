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

function folderName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export default function ProjectCard({ project, onChanged, onOpen }: Props) {
  const [showRename, setShowRename] = useState(false)
  const [busy, setBusy] = useState(false)
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

  const deleteProject = async () => {
    if (!confirm('Удалить проект из списка? Папки и файлы на диске останутся нетронутыми.')) return
    await act(() => api.deleteProject(project.id))
  }

  const toggleArchive = async () => {
    if (!archived && !confirm('Архивировать проект? Его сервер будет остановлен, а управление переместится в архив.')) return
    await act(() => api.updateProject(project.id, { archived: !archived }))
  }

  return (
    <div
      className={`card card-clickable ${project.running ? 'card-running' : ''} ${archived ? 'card-archived' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
    >
      <div className="card-head">
        <div className="card-title">
          <ProjectIcon project={project} size="md" />
          <div className="card-title-text">
            <strong>{project.name}</strong>
            <span className="card-path" title={project.path}>{folderName(project.path)}</span>
          </div>
        </div>
        <div className="card-actions-inline" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            title="Ещё"
            items={[
              { label: 'Настройки проекта', onClick: () => onOpen() },
              { label: 'Переименовать', onClick: () => setShowRename(true) },
              { label: archived ? 'Вернуть из архива' : 'В архив', onClick: () => void toggleArchive() },
              { label: 'Удалить проект', danger: true, onClick: () => void deleteProject() }
            ]}
          />
        </div>
      </div>

      <div className="card-badges">
        {archived ? (
          <span className="badge badge-archived">архив</span>
        ) : project.running ? (
          <span className="badge badge-on">онлайн</span>
        ) : project.crashed ? (
          <span className="badge badge-danger">упал</span>
        ) : (
          <span className="badge badge-off">офлайн</span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

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
