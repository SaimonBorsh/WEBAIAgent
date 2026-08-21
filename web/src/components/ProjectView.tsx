import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project, SessionInfo, SessionConfig, FreeModel } from '../types'
import { api, subscribeEvents } from '../api'
import Chat from './Chat'
import SessionSettingsModal from './SessionSettingsModal'
import ProjectSettingsModal from './ProjectSettingsModal'
import RenameProjectModal from './RenameProjectModal'
import { toast } from '../toast'

const DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free'

interface Props {
  projectId: string
  onBack: () => void
  onChanged?: () => void
  externalSelectedId?: string | null
  onSessionsUpdate?: (sessions: SessionInfo[], selectedId: string | null, busySessions: Set<string>, sessionConfig: Record<string, SessionConfig>, archivedSessions: Record<string, boolean>) => void
  pendingSessionSettings?: string | null
  onClearPendingSessionSettings?: () => void
  pendingProjectSettings?: boolean
  onClearPendingProjectSettings?: () => void
}

interface ProjectConfig {
  defaultModel: string
  defaultAgent: string
  defaults: SessionConfig
  sessionConfig: Record<string, SessionConfig>
  archivedSessions: Record<string, boolean>
  globalDefaults?: {
    defaultModel: string
    defaultAgent: string
    defaults: SessionConfig
  }
}

interface SessionModalState {
  mode: 'new' | 'edit'
  id?: string
  title?: string
}

export default function ProjectView({ projectId, onBack, onChanged, externalSelectedId, onSessionsUpdate, pendingSessionSettings, onClearPendingSessionSettings, pendingProjectSettings, onClearPendingProjectSettings }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [models, setModels] = useState<FreeModel[]>([])
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [initMode, setInitMode] = useState(false)
  const [busySessions, setBusySessions] = useState<Set<string>>(new Set())
  const [sessionModal, setSessionModal] = useState<SessionModalState | null>(null)
  const [showRename, setShowRename] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [starting, setStarting] = useState(false)
  const autoStartRef = useRef(false)
  const activeKey = `webaia_active_${projectId}`
  const archivedSetRef = useRef<Record<string, boolean>>({})
  archivedSetRef.current = config?.archivedSessions || {}

  const reload = useCallback(async () => {
    try {
      const [{ project: p }, modelRes, cfg] = await Promise.all([
        api.project(projectId),
        api.models(),
        api.projectConfig(projectId)
      ])
      setProject(p)
      if (modelRes.models.length) {
        const usable = modelRes.models.filter((m) => {
          if (m.source === 'custom') return true
          const st = modelRes.status[m.id]
          return !st || st.status === 'ok'
        })
        setModels(usable.length ? usable : modelRes.models)
      }
      setConfig(cfg)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId])

  const loadSessions = useCallback(async () => {
    try {
      const dir = project?.path
      const list = (await api.sessions(projectId))
        .filter((s) => (dir ? s.directory === dir : true))
        .sort((a, b) => b.time.updated - a.time.updated)
      setSessions(list)
      setSelectedId((cur) => {
        if (cur && list.some((s) => s.id === cur)) return cur
        const saved = localStorage.getItem(activeKey)
        if (saved && list.some((s) => s.id === saved)) return saved
        const first = list.find((s) => !archivedSetRef.current[s.id]) || list[0]
        return first ? first.id : null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId, project?.path, activeKey])

  const insertSession = (info: SessionInfo) => {
    setSessions((list) => (list.some((s) => s.id === info.id) ? list : [info, ...list]))
  }

  const defaultBase = (): SessionConfig => {
    const g = config?.globalDefaults
    const defaults = g?.defaults || config?.defaults || {}
    return {
      model: g?.defaultModel || config?.defaultModel || DEFAULT_MODEL,
      agent: g?.defaultAgent || config?.defaultAgent || 'build',
      temperature: defaults.temperature,
      topP: defaults.topP,
      maxTokens: defaults.maxTokens,
      system: defaults.system
    }
  }

  const configFor = (id: string): SessionConfig => {
    const override = config?.sessionConfig?.[id]
    return override ? { ...defaultBase(), ...override } : defaultBase()
  }

  const createSession = async (title: string | undefined, cfg: SessionConfig) => {
    setError('')
    try {
      const created = await api.createSession(projectId, title)
      try {
        await api.setSessionConfig(projectId, created.id, cfg)
        await reload()
      } catch {
        /* конфиг не критичен */
      }
      insertSession(created)
      setSelectedId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const updateSession = async (id: string, title: string | undefined, cfg: SessionConfig) => {
    setError('')
    try {
      await api.updateSession(projectId, id, title || '')
      await api.setSessionConfig(projectId, id, cfg)
      await reload()
      setSessions((list) => list.map((s) => (s.id === id ? { ...s, title: title || '' } : s)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSaveSession = async (data: { title?: string; config: SessionConfig }) => {
    if (!sessionModal) return
    if (sessionModal.mode === 'new') await createSession(data.title, data.config)
    else await updateSession(sessionModal.id!, data.title ?? sessionModal.title, data.config)
    setSessionModal(null)
  }

  const deleteSession = async (id: string) => {
    if (!confirm('Удалить сессию и все её данные?')) return
    try {
      await api.deleteSession(projectId, id)
      try {
        await api.deleteSessionConfig(projectId, id)
        await reload()
      } catch {
        /* конфиг мог отсутствовать */
      }
      setSessions((list) => list.filter((s) => s.id !== id))
      if (selectedId === id) setSelectedId(null)
      toast('Сессия удалена', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleSessionArchived = async (id: string, archived: boolean) => {
    setError('')
    try {
      await api.archiveSession(projectId, id, archived)
      await reload()
      toast(archived ? 'Сессия отправлена в архив' : 'Сессия возвращена из архива', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleProjectArchive = async () => {
    if (!project) return
    if (!project.archived && !confirm('Архивировать проект? Его сервер будет остановлен, а управление переместится в архив.')) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.updateProject(projectId, { archived: !project.archived })
      await reload()
      toast(project.archived ? 'Проект возвращён из архива' : 'Проект отправлен в архив', 'success')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async () => {
    if (!project) return
    if (!confirm('Удалить проект из списка? Папки и файлы на диске останутся нетронутыми.')) return
    setBusy(true)
    setError('')
    try {
      await api.deleteProject(projectId)
      toast('Проект удалён из списка', 'success')
      onChanged?.()
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const toggleStart = async () => {
    setBusy(true)
    setError('')
    try {
      if (project?.running) await api.stopProject(projectId)
      else await api.startProject(projectId)
      await reload()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const restartProject = async () => {
    setBusy(true)
    setError('')
    try {
      await api.restartProject(projectId)
      await reload()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doInit = async () => {
    if (!project) return
    if (!confirm('Проанализировать проект и создать AGENTS.md? Будет создана новая сессия.')) return
    setInitMode(true)
    setError('')
    try {
      const res = await api.initProject(projectId, {
        title: 'Инициализация проекта',
        prompt: 'Проанализируй структуру проекта и создай файл AGENTS.md в корне проекта.',
        model: config?.defaultModel || DEFAULT_MODEL
      })
      if (res.sessionID) {
        setSelectedId(res.sessionID)
        await loadSessions()
      }
      toast('Анализ запущен — результат появится в новой сессии', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInitMode(false)
    }
  }

  useEffect(() => {
    if (selectedId) localStorage.setItem(activeKey, selectedId)
    else localStorage.removeItem(activeKey)
  }, [selectedId, activeKey])

  useEffect(() => {
    reload()
    loadSessions()
    const timer = setInterval(() => {
      reload()
      loadSessions()
    }, 3000)
    return () => clearInterval(timer)
  }, [reload, loadSessions])

  useEffect(() => {
    if (!project || project.running || project.archived || autoStartRef.current) return
    autoStartRef.current = true
    let cancelled = false
    const doStart = async () => {
      setStarting(true)
      try {
        await api.startProject(projectId)
        if (!cancelled) {
          await reload()
          onChanged?.()
        }
      } catch {
        if (!cancelled) {
          setStarting(false)
        }
      }
    }
    void doStart()
    return () => { cancelled = true }
  }, [project?.running, project?.archived])

  useEffect(() => {
    if (!project?.running) return
    return subscribeEvents(projectId, (event) => {
      const p = event.properties
      const info = p.info ? (p.info as unknown as SessionInfo) : undefined
      const belongs = info && info.directory === project.path

      if (belongs && event.type === 'session.created') {
        insertSession(info)
      }
      if (belongs && event.type === 'session.deleted') {
        setSessions((list) => list.filter((s) => s.id !== info.id))
        setSelectedId((cur) => (cur === info.id ? null : cur))
        setBusySessions((set) => {
          const next = new Set(set)
          next.delete(info.id)
          return next
        })
      }
      if (belongs && event.type === 'session.updated') {
        setSessions((list) => list.map((s) => (s.id === info.id ? info : s)))
      }

      const sessionId = p.sessionID
      if (sessionId && belongs) {
        if (event.type === 'session.status') {
          const status = p.status
          setBusySessions((set) => {
            const next = new Set(set)
            if (status?.type === 'busy' || status?.type === 'retry') next.add(sessionId)
            else next.delete(sessionId)
            return next
          })
        }
        if (event.type === 'session.idle') {
          setBusySessions((set) => {
            const next = new Set(set)
            next.delete(sessionId)
            return next
          })
        }
      }
    })
  }, [projectId, project?.running, project?.path])

  // Sync external selection from sidebar
  useEffect(() => {
    if (externalSelectedId !== undefined && externalSelectedId !== null && externalSelectedId !== selectedId) {
      setSelectedId(externalSelectedId)
    }
  }, [externalSelectedId])

  // Notify parent about session changes
  useEffect(() => {
    onSessionsUpdate?.(sessions, selectedId, busySessions, config?.sessionConfig || {}, config?.archivedSessions || {})
  }, [sessions, selectedId, busySessions, config?.sessionConfig, config?.archivedSessions, onSessionsUpdate])

  // Handle external session settings request from sidebar
  useEffect(() => {
    if (pendingSessionSettings) {
      const s = sessions.find((sess) => sess.id === pendingSessionSettings)
      if (s) {
        setSessionModal({ mode: 'edit', id: s.id, title: s.title || '' })
      }
      onClearPendingSessionSettings?.()
    }
  }, [pendingSessionSettings])

  // Handle external project settings request from dashboard card
  useEffect(() => {
    if (pendingProjectSettings) {
      setShowSettings(true)
      onClearPendingProjectSettings?.()
    }
  }, [pendingProjectSettings])

  if (!project) {
    return <div className="muted pad">Загрузка…</div>
  }

  const archived = !!project.archived

  return (
    <div className="project">
      {archived && (
        <div className="archive-note">
          Проект в архиве: создание и инициализация сессий недоступны. Можно удалять сессии и сам проект (папки на
          диске не трогаются). Запустите сервер, чтобы управлять сессиями.
        </div>
      )}
      {error && <div className="error strip">{error}</div>}

      <div className="project-body">
        <main className="chat-wrap">
          {project.running ? (
            selectedId ? (
              <div className="chat-full">
                <Chat projectId={projectId} sessionId={selectedId} config={configFor(selectedId)} archived={archived} />
              </div>
            ) : (
              <div className="stopped">
                {sessions.length === 0 && !archived ? (
                  <>
                    <p>Создайте первую сессию, чтобы начать работу с агентом.</p>
                    <button className="btn btn-primary" onClick={() => setSessionModal({ mode: 'new' })}>
                      + Новая сессия
                    </button>
                  </>
                ) : (
                  <>
                    <p>{archived ? 'Выберите сессию, чтобы посмотреть переписку.' : 'Выберите сессию в сайдбаре или создайте новую.'}</p>
                    {!archived && (
                      <button className="btn btn-primary" onClick={() => setSessionModal({ mode: 'new' })}>
                        + Новая сессия
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          ) : starting ? (
            <div className="stopped">
              <div className="starting-spinner" />
              <p>Запуск сервера…</p>
              <p className="muted small">Обычно занимает 3–5 секунд</p>
            </div>
          ) : (
            <div className="stopped">
              <p>Сервер проекта остановлен.</p>
              <button className="btn btn-primary" onClick={() => void toggleStart()}>
                Запустить сервер
              </button>
            </div>
          )}
        </main>
      </div>

      {showRename && (
        <RenameProjectModal
          initialName={project.name}
          onSave={async (name) => {
            await api.updateProject(projectId, { name })
            onChanged?.()
          }}
          onClose={() => setShowRename(false)}
        />
      )}
      {showSettings && (
        <ProjectSettingsModal project={project} models={models} onDone={() => void reload()} onClose={() => setShowSettings(false)} />
      )}
      {sessionModal && (
        <SessionSettingsModal
          mode={sessionModal.mode}
          models={models}
          defaultName={sessionModal.mode === 'edit' ? sessionModal.title! : `Сессия ${sessions.length + 1}`}
          initialConfig={sessionModal.mode === 'edit' ? configFor(sessionModal.id!) : defaultBase()}
          onSave={(data) => void handleSaveSession(data)}
          onClose={() => setSessionModal(null)}
        />
      )}
    </div>
  )
}
