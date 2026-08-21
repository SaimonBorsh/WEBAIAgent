import type {
  Project,
  FreeModel,
  CustomModel,
  ModelStatusEntry,
  ModelsResult,
  SessionInfo,
  SessionConfig,
  MessageItem,
  Permission,
  EventPayload,
  FileDiff,
  FsListResult,
  TextPartInput,
  FilePartInput,
  QuestionRequest,
  ManagerSettings,
  VersionInfo,
  VersionsResult,
  UpdateInfo
} from './types'

import { toast } from './toast'
const BASE = '/api'
const TOKEN_KEY = 'webaia_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (res.status === 401 && !path.startsWith('/login')) {
    setToken(null)
    if (!path.startsWith('/auth')) window.location.reload()
    throw new Error('Требуется авторизация')
  }
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in (data as object)
        ? (data as { error: string }).error
        : undefined) || `Ошибка ${res.status}`
    throw new Error(message)
  }
  return data as T
}

export function isModelLimitError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return (
    msg.includes('limit') ||
    msg.includes('rate') ||
    msg.includes('token') ||
    msg.includes('too many') ||
    msg.includes('exceeded') ||
    msg.includes('blocked') ||
    msg.includes('quota')
  )
}

export function getModelRetryAfter(err: Error): number | null {
  // Attempt to parse a retry-after number from the error message, e.g. "try again in 30 seconds"
  const match = err.message.match(/[\w\s]+(\d+)[\w\s]*seconds?/i)
  if (match) {
    const num = parseInt(match[1], 10)
    return isNaN(num) ? null : num
  }
  // Default backoff if we can't parse a specific number
  return 60
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),
  restart: () => request<{ ok: boolean }>('/restart', { method: 'POST' }),
  auth: () => request<{ ok: boolean; user: string }>('/auth'),
  health: () =>
    request<{ healthy: boolean; version: string; opencode: string; host: string; port: number }>('/health'),
  models: () => request<ModelsResult>('/models'),
  checkModels: (models: string[]) =>
    request<{ ok: boolean; started: boolean }>('/models/check', {
      method: 'POST',
      body: JSON.stringify({ models })
    }),
  customModels: () => request<{ models: CustomModel[] }>('/models/custom'),
  addCustomModel: (data: Omit<CustomModel, 'id'> & { id: string }) =>
    request<{ ok: boolean; model: CustomModel }>('/models/custom', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  removeCustomModel: (id: string) =>
    request<{ ok: boolean }>(`/models/custom/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  settings: () => request<ManagerSettings>('/settings'),
  updateSettings: (data: { password?: string; openBrowserOnStart?: boolean; defaultModel?: string; defaultAgent?: string; defaults?: SessionConfig }) =>
    request<ManagerSettings & { ok: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  versions: () => request<VersionsResult>('/versions'),
  updates: () => request<UpdateInfo>('/updates'),
  installUpdate: () => request<{ ok: boolean; name: string; restarting: boolean }>('/updates/install', { method: 'POST' }),
  switchVersion: (version: string) =>
    request<{ ok: boolean; name: string; active: boolean; restarting: boolean }>('/versions/switch', {
      method: 'POST',
      body: JSON.stringify({ version })
    }),
  uploadVersion: async (file: Blob, version: string): Promise<{ ok: boolean; name: string; restarting: boolean }> => {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = 'Bearer ' + token
    headers['Content-Type'] = 'application/zip'
    const res = await fetch(`${BASE}/versions/upload?version=${encodeURIComponent(version)}`, {
      method: 'POST',
      headers,
      body: file
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || `Не удалось загрузить версию (${res.status})`)
    return data
  },
  fsList: (path: string) => request<FsListResult>(`/fs/list?path=${encodeURIComponent(path)}`),

  projects: () => request<{ projects: Project[] }>('/projects'),
  project: (id: string) => request<{ project: Project }>(`/projects/${id}`),
  createProject: (data: {
    name: string
    path?: string
    defaultModel?: string
    autoStart?: boolean
    icon?: string
    iconTone?: 'auto' | 'user' | 'system'
  }) =>
    request<{ project: Project; warning?: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  startProject: (id: string) => request<{ project: Project; result?: { started: boolean } }>(`/projects/${id}/start`, { method: 'POST' }),
  stopProject: (id: string) => request<{ project: Project }>(`/projects/${id}/stop`, { method: 'POST' }),
  initProject: (id: string, data: { title?: string; prompt?: string; model?: string }) =>
    request<{ ok: boolean; sessionID?: string }>(`/projects/${id}/init`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  projectConfig: (id: string) =>
    request<{
      defaultModel: string
      defaultAgent: string
      defaults: SessionConfig
      sessionConfig: Record<string, SessionConfig>
      archivedSessions: Record<string, boolean>
    }>(`/projects/${id}/config`),
  setSessionConfig: (id: string, sessionId: string, config: SessionConfig) =>
    request<{ ok: boolean; config: SessionConfig }>(`/projects/${id}/config/session/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(config)
    }),
  deleteSessionConfig: (id: string, sessionId: string) =>
    request<{ ok: boolean }>(`/projects/${id}/config/session/${sessionId}`, { method: 'DELETE' }),

  sessions: (id: string) => request<SessionInfo[]>(`/projects/${id}/session`),
  session: (id: string, sessionId: string) => request<SessionInfo>(`/projects/${id}/session/${sessionId}`),
  uploadFile: uploadFile,
  createSession: (id: string, title?: string) =>
    request<SessionInfo>(`/projects/${id}/session`, {
      method: 'POST',
      body: JSON.stringify({ title })
    }),
  deleteSession: (id: string, sessionId: string) =>
    request<{ ok: boolean }>(`/projects/${id}/session/${sessionId}`, { method: 'DELETE' }),
  updateSession: (id: string, sessionId: string, title: string) =>
    request<{ ok: boolean }>(`/projects/${id}/session/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    }),
  archiveSession: (id: string, sessionId: string, archived: boolean) =>
    request<{ ok: boolean; archived: boolean }>(`/projects/${id}/session/${sessionId}/archive`, {
      method: 'PUT',
      body: JSON.stringify({ archived })
    }),

  messages: (id: string, sessionId: string, limit?: number, offset?: number) => {
    const q: string[] = []
    if (typeof limit === 'number') q.push(`limit=${limit}`)
    if (typeof offset === 'number') q.push(`offset=${offset}`)
    const qs = q.length ? `?${q.join('&')}` : ''
    return request<MessageItem[]>(`/projects/${id}/session/${sessionId}/message${qs}`)
  },
  sendMessage: async (
    id: string,
    sessionId: string,
    body: {
      model?: { providerID: string; modelID: string }
      agent?: string
      parts: (TextPartInput | FilePartInput)[]
    }
  ) => {
    try {
      return await request<unknown>(`/projects/${id}/session/${sessionId}/prompt_async`, {
        method: 'POST',
        body: JSON.stringify(body)
      })
    } catch (err) {
      const modelErr = err instanceof Error ? err : new Error(String(err))
      if (isModelLimitError(modelErr)) {
        const retrySec = getModelRetryAfter(modelErr) ?? 60
        const minutes = Math.ceil(retrySec / 60)
        toast(
          `Модель достигла бесплатного лимита токенов. Пожалуйста, подождите ${minutes} ${minutes > 1 ? 'минут' : 'минуту'}, чтобы продолжить.`,
          'error'
        )
        throw new Error(`model_limit_${retrySec}`)
      }
      throw err
    }
  },
  abort: (id: string, sessionId: string) =>
    request<{ ok: boolean }>(`/projects/${id}/session/${sessionId}/abort`, { method: 'POST' }),
  respondPermission: (id: string, sessionId: string, permissionId: string, body: { response: string; remember?: boolean }) =>
    request<{ ok: boolean }>(`/projects/${id}/session/${sessionId}/permissions/${permissionId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  initSession: (id: string, sessionId: string, body: { messageID: string; providerID: string; modelID: string }) =>
    request<{ ok: boolean }>(`/projects/${id}/session/${sessionId}/init`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  diff: (id: string, sessionId: string) =>
    request<FileDiff[]>(`/projects/${id}/session/${sessionId}/diff`),
  questions: async (id: string) => {
    const data = await request<unknown>(`/projects/${id}/question`)
    if (Array.isArray(data)) return data as QuestionRequest[]
    if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: QuestionRequest[] }).data
    }
    return []
  },
  replyQuestion: (id: string, requestID: string, answers: string[][]) =>
    request<boolean>(`/projects/${id}/question/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    }),
  rejectQuestion: (id: string, requestID: string) =>
    request<boolean>(`/projects/${id}/question/${requestID}/reject`, { method: 'POST' })
}

export async function uploadFile(
  file: Blob,
  filename: string,
  mime: string
): Promise<{ ok: boolean; url: string; path: string; mime?: string; extracted?: boolean }> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (mime) headers['Content-Type'] = mime
  const res = await fetch(`${BASE}/upload?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers,
    body: file
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Не удалось загрузить файл (${res.status})`)
  return data
}

export function subscribeEvents(projectId: string, onEvent: (e: EventPayload) => void): () => void {
  const token = getToken()
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  const es = new EventSource(`${BASE}/projects/${projectId}/event${query}`)
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as EventPayload
      if (data && typeof data.type === 'string') onEvent(data)
    } catch {
      /* невалидное событие — игнорируем */
    }
  }
  return () => es.close()
}