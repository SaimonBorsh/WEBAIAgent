import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'
import ProjectIcon from './ProjectIcon'

interface Props {
  projects: Project[]
  currentId: string | null
  onOpen: (id: string) => void
  onCreate: () => void
  onSettings: () => void
  onVersions: () => void
}

const OPEN_DELAY_MS = 120
const CLOSE_DELAY_MS = 180

export default function Sidebar({ projects, currentId, onOpen, onCreate, onSettings, onVersions }: Props) {
  const [expanded, setExpanded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const open = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setExpanded(true), OPEN_DELAY_MS)
  }
  const close = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }

  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)

  return (
    <nav
      className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`}
      aria-label="Навигация"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <div className="sidebar-head">
        <span className="sidebar-title">Проекты</span>
        <button
          className="btn btn-ghost btn-small"
          title="Новый проект"
          aria-label="Новый проект"
          onClick={onCreate}
        >
          +
        </button>
      </div>

      <div className="sidebar-scroll">
        {active.map((p) => (
          <SidebarItem key={p.id} project={p} current={currentId === p.id} onOpen={onOpen} />
        ))}

        {active.length === 0 && <div className="sidebar-empty muted">Нет проектов. Создайте первый.</div>}

        {archived.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-subtitle">Архив</div>
            {archived.map((p) => (
              <SidebarItem key={p.id} project={p} current={currentId === p.id} onOpen={onOpen} archived />
            ))}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={onSettings} title="Настройки" aria-label="Настройки">
          <ProjectIcon project={{ name: 'Настройки', icon: '⚙', path: '', iconTone: 'user' }} size="sm" />
          <span className="sidebar-name">Настройки</span>
        </button>
        <button className="sidebar-item" onClick={onVersions} title="Версии" aria-label="Версии">
          <ProjectIcon project={{ name: 'Версии', icon: '🗄', path: '', iconTone: 'user' }} size="sm" />
          <span className="sidebar-name">Версии</span>
        </button>
      </div>
    </nav>
  )
}

function SidebarItem({
  project,
  current,
  onOpen,
  archived
}: {
  project: Project
  current: boolean
  onOpen: (id: string) => void
  archived?: boolean
}) {
  return (
    <button
      className={`sidebar-item ${current ? 'active' : ''} ${archived ? 'archived' : ''}`}
      title={project.path}
      onClick={() => onOpen(project.id)}
    >
      <span className="sidebar-icon-wrap">
        <ProjectIcon project={project} size="sm" />
        <span className={`sidebar-dot ${project.running ? 'running' : ''}`} aria-hidden />
      </span>
      <span className="sidebar-name">{project.name}</span>
    </button>
  )
}