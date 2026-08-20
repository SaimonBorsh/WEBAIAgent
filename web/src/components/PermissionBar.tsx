import type { Permission } from '../types'
import { api } from '../api'

interface Props {
  projectId: string
  permission: Permission
  onDone: (permissionId: string) => void
}

function describe(permission: Permission): string {
  const meta = permission.metadata || {}
  const tool = meta.tool || permission.type
  const info: string[] = []
  if (typeof meta.description === 'string') info.push(meta.description)
  if (permission.pattern) info.push(Array.isArray(permission.pattern) ? permission.pattern.join(', ') : permission.pattern)
  return `${tool}${info.length ? ' · ' + info.join(' · ') : ''}`
}

export default function PermissionBar({ projectId, permission, onDone }: Props) {
  const respond = async (response: string, remember: boolean) => {
    try {
      await api.respondPermission(projectId, permission.sessionID, permission.id, { response, remember })
    } catch {
      /* ошибка отправки — кнопка просто исчезнет после перезагрузки */
    } finally {
      onDone(permission.id)
    }
  }

  return (
    <div className="permission-bar">
      <div className="permission-text">
        <strong>Запрос разрешения:</strong> {describe(permission)}
      </div>
      <div className="permission-actions">
        <button className="btn btn-primary" onClick={() => respond('allow', false)}>
          Разрешить
        </button>
        <button className="btn" onClick={() => respond('allow', true)}>
          Всегда разрешать
        </button>
        <button className="btn" onClick={() => respond('deny', false)}>
          Запретить
        </button>
      </div>
    </div>
  )
}