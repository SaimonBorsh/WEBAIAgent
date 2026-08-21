import { useState } from 'react'
import type { Project, SessionInfo, SessionConfig } from '../types'
import ProjectIcon from './ProjectIcon'

interface Props {
  projects: Project[]
  currentId: string | null
  onOpen: (id: string) => void
  onCreate: () => void
  onSettings: () => void
  onVersions: () => void
  onLogout: () => void
  sessions?: SessionInfo[]
  selectedSessionId?: string | null
  busySessions?: Set<string>
  sessionConfig?: Record<string, SessionConfig>
  onSessionSelect?: (id: string) => void
  onSessionSettings?: (id: string) => void
  onSessionArchive?: (id: string, archived: boolean) => void
}

export default function Sidebar({
  projects,
  currentId,
  onOpen,
  onCreate,
  onSettings,
  onVersions,
  onLogout,
  sessions = [],
  selectedSessionId = null,
  busySessions = new Set(),
  sessionConfig = {},
  onSessionSelect,
  onSessionSettings,
  onSessionArchive
}: Props) {
  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)

  const getShortModel = (sessionId: string): string => {
    const cfg = sessionConfig[sessionId]
    if (!cfg?.model) return ''
    const parts = cfg.model.split('/')
    return parts[parts.length - 1] || cfg.model
  }

  const isArchivedSession = (s: SessionInfo): boolean => {
    const cfg = sessionConfig[s.id]
    return (cfg as Record<string, unknown> as { archived?: boolean })?.archived === true
  }

  return (
    <nav className="sidebar expanded" aria-label="Навигация">
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
          <SidebarProject
            key={p.id}
            project={p}
            current={currentId === p.id}
            onOpen={onOpen}
            sessions={currentId === p.id ? sessions : []}
            selectedSessionId={currentId === p.id ? selectedSessionId : null}
            busySessions={currentId === p.id ? busySessions : new Set()}
            getShortModel={getShortModel}
            isArchivedSession={isArchivedSession}
            onSessionSelect={onSessionSelect}
            onSessionSettings={onSessionSettings}
            onSessionArchive={onSessionArchive}
          />
        ))}

        {active.length === 0 && <div className="sidebar-empty muted">Нет проектов. Создайте первый.</div>}

        {archived.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-subtitle">Архив</div>
            {archived.map((p) => (
              <SidebarProject
                key={p.id}
                project={p}
                current={currentId === p.id}
                onOpen={onOpen}
                sessions={currentId === p.id ? sessions : []}
                selectedSessionId={currentId === p.id ? selectedSessionId : null}
                busySessions={currentId === p.id ? busySessions : new Set()}
                getShortModel={getShortModel}
                isArchivedSession={isArchivedSession}
                onSessionSelect={onSessionSelect}
                onSessionSettings={onSessionSettings}
                onSessionArchive={onSessionArchive}
                archived
              />
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
        <div className="sidebar-divider" />
        <button className="sidebar-item sidebar-logout" onClick={onLogout} title="Выйти" aria-label="Выйти">
          <ProjectIcon project={{ name: 'Выйти', icon: '↪', path: '', iconTone: 'system' }} size="sm" />
          <span className="sidebar-name">Выйти</span>
        </button>
      </div>
    </nav>
  )
}

function SidebarProject({
  project,
  current,
  onOpen,
  sessions,
  selectedSessionId,
  busySessions,
  getShortModel,
  isArchivedSession,
  onSessionSelect,
  onSessionSettings,
  onSessionArchive,
  archived
}: {
  project: Project
  current: boolean
  onOpen: (id: string) => void
  sessions: SessionInfo[]
  selectedSessionId: string | null
  busySessions: Set<string>
  getShortModel: (id: string) => string
  isArchivedSession: (s: SessionInfo) => boolean
  onSessionSelect?: (id: string) => void
  onSessionSettings?: (id: string) => void
  onSessionArchive?: (id: string, archived: boolean) => void
  archived?: boolean
}) {
  const dotClass = project.crashed ? 'crashed' : project.running ? 'running' : ''
  const expanded = current && sessions.length > 0
  const activeSessions = sessions.filter((s) => !isArchivedSession(s))

  return (
    <div className={`sidebar-project-group ${expanded ? 'expanded' : ''}`}>
      <button
        className={`sidebar-item ${current ? 'active' : ''} ${archived ? 'archived' : ''}`}
        title={project.path}
        onClick={() => onOpen(project.id)}
      >
        <span className="sidebar-icon-wrap">
          <ProjectIcon project={project} size="sm" />
          <span className={`sidebar-dot ${dotClass}`} aria-hidden />
        </span>
        <span className="sidebar-name">{project.name}</span>
      </button>

      {expanded && activeSessions.length > 0 && (
        <div className="sidebar-sessions">
          {activeSessions.slice(0, 20).map((s) => (
            <div
              key={s.id}
              className={`sidebar-session-item ${s.id === selectedSessionId ? 'active' : ''}`}
            >
              <button
                className="sidebar-session-main"
                onClick={() => onSessionSelect?.(s.id)}
                title={s.title || 'Без названия'}
              >
                <span className="sidebar-session-dot-wrap">
                  {busySessions.has(s.id) && <span className="sidebar-session-busy" />}
                </span>
                <span className="sidebar-session-title">{s.title || 'Без названия'}</span>
              </button>
              <SessionContextMenu
                sessionId={s.id}
                archived={isArchivedSession(s)}
                onSettings={() => onSessionSettings?.(s.id)}
                onArchive={() => onSessionArchive?.(s.id, !isArchivedSession(s))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionContextMenu({
  sessionId,
  archived,
  onSettings,
  onArchive
}: {
  sessionId: string
  archived: boolean
  onSettings: () => void
  onArchive: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="sidebar-session-menu-wrap">
      <button
        className="sidebar-session-menu-btn"
        title="Ещё"
        aria-label="Ещё"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="sidebar-session-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="sidebar-session-menu">
            <button onClick={() => { setOpen(false); onSettings() }}>Настройки</button>
            <button onClick={() => { setOpen(false); onArchive() }}>
              {archived ? 'Вернуть из архива' : 'В архив'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
