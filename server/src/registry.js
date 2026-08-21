import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import net from 'node:net'
import { EventEmitter } from 'node:events'
import { REGISTRY_FILE, BASE_PROJECT_PORT, MAX_PROJECT_PORT } from './config.js'
import { getSettings } from './settings.js'

export const registryEvents = new EventEmitter()

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'))
    return Array.isArray(data.projects) ? data.projects : []
  } catch {
    return []
  }
}

let projects = load()

function save() {
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ projects }, null, 2))
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

export async function allocatePort() {
  for (let port = BASE_PROJECT_PORT; port <= MAX_PROJECT_PORT; port++) {
    const used = projects.some((p) => p.port === port)
    if (!used && (await isPortFree(port))) return port
  }
  throw new Error(`Нет свободного порта в диапазоне ${BASE_PROJECT_PORT}-${MAX_PROJECT_PORT}`)
}

export function list() {
  return projects
}

export function get(id) {
  return projects.find((p) => p.id === id)
}

export function getByPath(p) {
  return projects.find((x) => x.path === p)
}

function normalizeModel(m) {
  if (!m) return m
  const s = String(m)
  return s.includes('/') ? s : `opencode/${s}`
}

export async function create({ name, path: projectPath, defaultModel, defaultAgent, autoStart, icon, iconTone }) {
  if (!name || !projectPath) throw new Error('Укажите название и путь проекта')
  const resolved = path.resolve(projectPath)
  if (getByPath(resolved)) throw new Error(`Проект с путём ${resolved} уже существует`)
  const globalSettings = getSettings()
  const project = {
    id: crypto.randomUUID(),
    name: String(name),
    path: resolved,
    port: await allocatePort(),
    defaultModel: normalizeModel(defaultModel) || globalSettings.defaultModel || 'opencode/deepseek-v4-flash-free',
    defaultAgent: defaultAgent || globalSettings.defaultAgent || 'build',
    autoStart: Boolean(autoStart),
    archived: false,
    icon: typeof icon === 'string' && icon ? icon : undefined,
    iconTone: iconTone === 'user' || iconTone === 'system' ? iconTone : 'auto',
    defaults: {},
    sessionConfig: {},
    archivedSessions: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  projects.push(project)
  save()
  registryEvents.emit('changed')
  return project
}

export function update(id, patch) {
  const project = get(id)
  if (!project) return null
  const allowed = ['name', 'path', 'defaultModel', 'defaultAgent', 'autoStart', 'archived', 'defaults', 'icon', 'iconTone']
  for (const key of allowed) {
    if (!(key in patch)) continue
    if (key === 'defaults') {
      const src = patch.defaults || {}
      const d = { ...(project.defaults || {}) }
      if (typeof src.temperature === 'number' && Number.isFinite(src.temperature) && src.temperature >= 0 && src.temperature <= 2) {
        d.temperature = src.temperature
      }
      if (typeof src.topP === 'number' && Number.isFinite(src.topP) && src.topP >= 0 && src.topP <= 1) {
        d.topP = src.topP
      }
      if (typeof src.maxTokens === 'number' && src.maxTokens > 0) {
        d.maxTokens = Math.round(src.maxTokens)
      }
      if (typeof src.system === 'string') {
        d.system = src.system
      }
      project.defaults = d
      continue
    }
    if (key === 'icon') {
      project.icon = typeof patch[key] === 'string' && patch[key] ? patch[key] : undefined
      continue
    }
    if (key === 'iconTone') {
      project.iconTone = patch[key] === 'user' || patch[key] === 'system' ? patch[key] : 'auto'
      continue
    }
    project[key] =
      key === 'path'
        ? path.resolve(patch[key])
        : key === 'defaultModel'
          ? normalizeModel(patch[key])
          : key === 'autoStart' || key === 'archived'
            ? Boolean(patch[key])
            : patch[key]
  }
  project.updatedAt = Date.now()
  save()
  registryEvents.emit('changed')
  return project
}

export function remove(id) {
  const index = projects.findIndex((p) => p.id === id)
  if (index === -1) return null
  const [removed] = projects.splice(index, 1)
  save()
  registryEvents.emit('changed')
  return removed
}

export function getSessionConfigs(projectId) {
  const project = get(projectId)
  return project?.sessionConfig || {}
}

export function getSessionConfig(projectId, sessionId) {
  const configs = getSessionConfigs(projectId)
  return configs[sessionId] || null
}

export function setSessionConfig(projectId, sessionId, config) {
  const project = get(projectId)
  if (!project) return null
  project.sessionConfig = project.sessionConfig || {}
  project.sessionConfig[sessionId] = config
  project.updatedAt = Date.now()
  save()
  registryEvents.emit('changed')
  return project.sessionConfig[sessionId]
}

export function removeSessionConfig(projectId, sessionId) {
  const project = get(projectId)
  if (project?.sessionConfig?.[sessionId]) {
    delete project.sessionConfig[sessionId]
    project.updatedAt = Date.now()
    save()
    registryEvents.emit('changed')
  }
}

export function getArchivedSessions(projectId) {
  const project = get(projectId)
  return project?.archivedSessions || {}
}

export function setSessionArchived(projectId, sessionId, archived) {
  const project = get(projectId)
  if (!project) return null
  project.archivedSessions = project.archivedSessions || {}
  if (archived) project.archivedSessions[sessionId] = true
  else delete project.archivedSessions[sessionId]
  project.updatedAt = Date.now()
  save()
  registryEvents.emit('changed')
  return Boolean(project.archivedSessions[sessionId])
}
