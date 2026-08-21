import { useCallback, useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'
import Login from './components/Login'
import GlobalSettingsModal from './components/GlobalSettingsModal'
import NewProjectModal from './components/NewProjectModal'
import VersionsModal from './components/VersionsModal'
import Sidebar from './components/Sidebar'
import ToastContainer from './components/ToastContainer'
import { api, getToken, setToken } from './api'
import { applyTheme, applyDensity, subscribeThemeChange } from './prefs'
import { toast } from './toast'
import type { Project, SessionInfo, SessionConfig } from './types'

interface SessionBridge {
  sessions: SessionInfo[]
  selectedId: string | null
  busySessions: Set<string>
  sessionConfig: Record<string, SessionConfig>
}

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectsError, setProjectsError] = useState('')
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [pendingSessionSettings, setPendingSessionSettings] = useState<string | null>(null)
  const [pendingProjectSettings, setPendingProjectSettings] = useState(false)

  const [sessionBridge, setSessionBridge] = useState<SessionBridge>({
    sessions: [],
    selectedId: null,
    busySessions: new Set(),
    sessionConfig: {}
  })

  const currentProject = projects.find((p) => p.id === projectId)

  const loadProjects = async () => {
    try {
      const p = await api.projects()
      setProjects(p.projects)
      setProjectsError('')
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    if (!authed) return
    void loadProjects()
    const timer = setInterval(() => void loadProjects(), 4000)
    return () => clearInterval(timer)
  }, [authed])

  useEffect(() => {
    applyTheme()
    applyDensity()
    const unsubscribe = subscribeThemeChange(() => applyTheme())
    return unsubscribe
  }, [])

  useEffect(() => {
    const check = async () => {
      if (!getToken()) {
        setAuthed(false)
        return
      }
      try {
        await api.auth()
        setAuthed(true)
      } catch {
        setAuthed(false)
      }
    }
    void check()
  }, [])

  const handleOpenProject = (id: string) => {
    setProjectId((cur) => (cur === id ? null : id))
  }

  const handleOpenProjectSettings = (id: string) => {
    setProjectId(id)
    setPendingProjectSettings(true)
  }

  // Очищаем сессии сразу при смене проекта, чтобы чужие не висели
  useEffect(() => {
    setSessionBridge({ sessions: [], selectedId: null, busySessions: new Set(), sessionConfig: {} })
  }, [projectId])

  const handleSessionSelect = useCallback((id: string) => {
    setSessionBridge((b) => ({ ...b, selectedId: id }))
  }, [])

  const handleSessionsUpdate = useCallback(
    (sessions: SessionInfo[], selectedId: string | null, busySessions: Set<string>, sessionConfig: Record<string, SessionConfig>) => {
      setSessionBridge({ sessions, selectedId, busySessions, sessionConfig })
    },
    []
  )

  const handleSessionSettings = useCallback((id: string) => {
    setPendingSessionSettings(id)
  }, [])

  const handleSessionArchive = useCallback(async (id: string, archived: boolean) => {
    if (!projectId) return
    try {
      await api.archiveSession(projectId, id, archived)
    } catch { /* ignore */ }
  }, [projectId])

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setToken(null)
    setProjectId(null)
    setAuthed(false)
  }

  if (authed === null) {
    return (
      <div className="app">
        <div className="login-wrap">
          <div className="muted">Проверка авторизации…</div>
        </div>
      </div>
    )
  }

  if (!authed) {
    return <Login onAuthed={() => setAuthed(true)} />
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        currentId={projectId}
        onOpen={handleOpenProject}
        onCreate={() => setShowCreate(true)}
        onSettings={() => setShowSettings(true)}
        onVersions={() => setShowVersions(true)}
        onLogout={logout}
        sessions={projectId ? sessionBridge.sessions : []}
        selectedSessionId={projectId ? sessionBridge.selectedId : null}
        busySessions={projectId ? sessionBridge.busySessions : new Set()}
        sessionConfig={projectId ? sessionBridge.sessionConfig : {}}
        onSessionSelect={handleSessionSelect}
        onSessionSettings={handleSessionSettings}
        onSessionArchive={handleSessionArchive}
      />
      <div className="app-main">
        <header className="app-head">
          <div className="app-logo" onClick={() => setProjectId(null)}>
            <span className="logo-mark">▣</span>
            <span>WEBAIAgent</span>
            {currentProject && (
              <>
                <span className="app-sep">/</span>
                <span className="app-project-name">{currentProject.name}</span>
                {currentProject.archived ? (
                  <span className="badge badge-archived">архив</span>
                ) : currentProject.running ? (
                  <span className="badge badge-on">онлайн</span>
                ) : currentProject.crashed ? (
                  <span className="badge badge-danger">упал</span>
                ) : (
                  <span className="badge badge-off">офлайн</span>
                )}
              </>
            )}
            {currentProject && sessionBridge.selectedId && (() => {
              const sess = sessionBridge.sessions.find((s) => s.id === sessionBridge.selectedId)
              if (!sess) return null
              const cfg = sessionBridge.sessionConfig[sessionBridge.selectedId]
              const modelShort = cfg?.model ? cfg.model.split('/').pop() || cfg.model : ''
              return (
                <>
                  <span className="app-sep">/</span>
                  <span className="app-session-name">{sess.title || 'Без названия'}</span>
                  {modelShort && <span className="app-session-model">{modelShort}</span>}
                </>
              )
            })()}
          </div>
          <div className="app-head-right">
            <button className="btn btn-ghost btn-small" onClick={() => setShowInfo((v) => !v)} title="Справка" aria-label="Справка">
              ?
            </button>
          </div>
        </header>
        {showInfo && (
          <div className="info-banner">
            <strong>WEBAIAgent</strong> — веб-менеджер ИИ-агента на базе opencode. Создавайте проекты, запускайте серверы, общайтесь с агентом через чат.
            <button className="btn btn-ghost btn-small" onClick={() => setShowInfo(false)}>✕</button>
          </div>
        )}
        {projectId ? (
          <ProjectView
            projectId={projectId}
            onBack={() => setProjectId(null)}
            onChanged={() => void loadProjects()}
            externalSelectedId={sessionBridge.selectedId}
            onSessionsUpdate={handleSessionsUpdate}
            pendingSessionSettings={pendingSessionSettings}
            onClearPendingSessionSettings={() => setPendingSessionSettings(null)}
            pendingProjectSettings={pendingProjectSettings}
            onClearPendingProjectSettings={() => setPendingProjectSettings(false)}
          />
        ) : (
          <Dashboard
            projects={projects}
            loading={loadingProjects}
            error={projectsError}
            onOpenProject={handleOpenProject}
            onOpenProjectSettings={handleOpenProjectSettings}
            onCreate={() => setShowCreate(true)}
            onChanged={() => void loadProjects()}
          />
        )}
      </div>
      {showSettings && <GlobalSettingsModal onClose={() => setShowSettings(false)} />}
      {showVersions && <VersionsModal onClose={() => setShowVersions(false)} />}
      {showCreate && (
        <NewProjectModal
          onCreated={() => {
            setShowCreate(false)
            void loadProjects()
            toast('Проект создан', 'success')
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      <ToastContainer />
    </div>
  )
}
