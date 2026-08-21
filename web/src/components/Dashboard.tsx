import type { Project } from '../types'
import ProjectCard from './ProjectCard'

interface Props {
  projects: Project[]
  loading: boolean
  error: string
  onOpenProject: (id: string) => void
  onCreate: () => void
  onChanged: () => void
}

export default function Dashboard({ projects, loading, error, onOpenProject, onCreate, onChanged }: Props) {
  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)
  const running = projects.filter((p) => p.running && !p.archived)

  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <div>
          <h1>Проекты</h1>
          <p className="muted">
            {projects.length
              ? `${active.length} активных · ${running.length} запущено${archived.length ? ` · ${archived.length} в архиве` : ''}`
              : 'Создайте первый проект, чтобы начать работу'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onCreate}>
          + Новый проект
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="muted">Загрузка…</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <p>Пока нет ни одного проекта.</p>
          <p className="muted">
            Укажите папку и название — менеджер сам поднимет сервер opencode для проекта.
          </p>
        </div>
      ) : (
        <>
          <div className="dashboard-section">
            <h2 className="dashboard-section-title">Активные проекты</h2>
            {active.length === 0 ? (
              <p className="muted">Нет активных проектов.</p>
            ) : (
              <div className="cards">
                {active.map((p) => (
                  <ProjectCard key={p.id} project={p} onChanged={onChanged} onOpen={() => onOpenProject(p.id)} />
                ))}
              </div>
            )}
          </div>

          {archived.length > 0 && (
            <div className="dashboard-section">
              <h2 className="dashboard-section-title">Архив</h2>
              <div className="cards">
                {archived.map((p) => (
                  <ProjectCard key={p.id} project={p} onChanged={onChanged} onOpen={() => onOpenProject(p.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}