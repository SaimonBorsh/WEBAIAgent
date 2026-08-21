import { useEffect, useState } from 'react'
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
import type { Project } from './types'

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectsError, setProjectsError] = useState('')
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showVersions, setShowVersions] = useState(false)

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
              </>
            )}
          </div>
          <div className="app-head-right">
            <button className="btn btn-ghost btn-small" onClick={() => setShowSettings(true)} title="Настройки" aria-label="Настройки">
              ⚙
            </button>
          </div>
        </header>
        {projectId ? (
          <ProjectView projectId={projectId} onBack={() => setProjectId(null)} onChanged={() => void loadProjects()} />
        ) : (
          <Dashboard
            projects={projects}
            loading={loadingProjects}
            error={projectsError}
            onOpenProject={handleOpenProject}
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