import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BIND_HOST, INTERNAL_HOST, LAN_HOST, MANAGER_PORT, ROOT_DIR, SERVER_DIR, DATA_DIR } from './config.js'
import * as registry from './registry.js'
import * as manager from './manager.js'
import { proxyToOpenCode } from './proxy.js'
import { getModelList, refreshFreeModels, getModelStatus, setModelStatus, getProviderOfModel, getCustomModels, addCustomModel, removeCustomModel, getFreeModels, checkState, runAvailabilityCheck, writeOpenCodeConfig } from './models.js'
import { listDir } from './fsbrowse.js'
import { validateCredentials, createToken, destroyToken, getToken, authMiddleware } from './auth.js'
import { getSettings, updateSettings } from './settings.js'
import { listVersions, switchVersion, extractVersionZip, checkGithubUpdate, downloadUpdateZip } from './versions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

const RUSSIAN_INIT_PROMPT = `Проанализируй проект в текущей папке и создай файл AGENTS.md в корне проекта. Файл должен быть на русском языке.

Цель: компактный файл с инструкциями, который поможет будущим сессиям opencode быстро войти в контекст и избегать ошибок. Включай только то, что агент не сможет узнать без подсказки.

Как анализировать:
- сначала читай README*, манифесты, конфиги сборки/тестов/линтера, lock-файлы, CI-конфиги, существующие AGENTS.md/CLAUDE.md
- если архитектура неясна, изучи несколько ключевых файлов кода, чтобы понять точки входа и связи
- доверяй исполняемым источникам (скриптам, конфигам) больше, чем описаниям в комментариях

Что включить:
- точные команды разработки: запуск, тесты, сборка, линт, typecheck
- особенности монорепо/мультипакетов, важные точки входа и границы модулей
- неочевидные требования и ограничения окружения, порядок команд, если он важен
- конвенции проекта, отличающиеся от стандартных

Исключи: общие советы, длинные туториалы, очевидные вещи.

Если AGENTS.md уже существует — улучши его: сохрани проверенную полезную информацию, удали устаревшее или неточное.

По завершении анализа создай файл AGENTS.md в корне проекта.`

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(`[api] ${req.method} ${req.originalUrl}:`, err.message)
      if (!res.headersSent) res.status(400).json({ error: err.message })
    })
  }
}

async function restartRunningProjects() {
  const running = registry.list().filter((p) => !p.archived && manager.isRunning(p.id))
  let count = 0
  for (const p of running) {
    try {
      await manager.stop(p)
      await manager.start(p)
      count++
    } catch (err) {
      console.error(`[models] перезапуск проекта ${p.id} после смены моделей: ${err.message}`)
    }
  }
  return count
}

app.post('/api/login', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const { username, password } = req.body || {}
  if (!validateCredentials(username, password)) {
    await new Promise((r) => setTimeout(r, 600))
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }
  const token = createToken()
  res.json({ token })
}))

app.get('/api/health', (req, res) => {
  res.json({ healthy: true, version: '1.0.0', opencode: manager.opencodeExe, host: LAN_HOST, port: MANAGER_PORT })
})

app.use('/api', authMiddleware)

app.get('/api/auth', (req, res) => {
  res.json({ ok: true, user: process.env.WEBAIA_USER || 'admin' })
})

app.post('/api/logout', (req, res) => {
  const token = getToken(req)
  if (token) destroyToken(token)
  res.json({ ok: true })
})

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

function extractDocxText(buffer) {
  try {
    const buf = Buffer.from(buffer)
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    if (eocd < 0) return null
    const cdSize = buf.readUInt32LE(eocd + 12)
    const cdOffset = buf.readUInt32LE(eocd + 16)
    let off = cdOffset
    const end = cdOffset + cdSize
    let target = null
    while (off + 46 <= end) {
      if (buf.readUInt32LE(off) !== 0x02014b50) break
      const method = buf.readUInt16LE(off + 10)
      const compSize = buf.readUInt32LE(off + 20)
      const nameLen = buf.readUInt16LE(off + 28)
      const extraLen = buf.readUInt16LE(off + 30)
      const commentLen = buf.readUInt16LE(off + 32)
      const localOffset = buf.readUInt32LE(off + 42)
      const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
      if (name === 'word/document.xml') {
        target = { localOffset, compSize, method }
        break
      }
      off += 46 + nameLen + extraLen + commentLen
    }
    if (!target) return null
    const lh = target.localOffset
    if (buf.readUInt32LE(lh) !== 0x04034b50) return null
    const lNameLen = buf.readUInt16LE(lh + 26)
    const lExtraLen = buf.readUInt16LE(lh + 28)
    const dataStart = lh + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + target.compSize)
    let xml
    if (target.method === 8) xml = zlib.inflateRawSync(data).toString('utf8')
    else if (target.method === 0) xml = data.toString('utf8')
    else return null
    const out = []
    const paraRe = /<w:p[\s\S]*?<\/w:p>/g
    let pm
    while ((pm = paraRe.exec(xml))) {
      let line = ''
      const tr = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
      let m
      while ((m = tr.exec(pm[0]))) line += m[1]
      if (line.trim()) out.push(line)
    }
    if (!out.length) return null
    return out
      .join('\n')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  } catch {
    return null
  }
}

app.post(
  '/api/upload',
  express.raw({ type: '*/*', limit: '15mb' }),
  (req, res) => {
    const raw = String(req.query.filename || 'file').replace(/[\\/:*?"<>|\r\n\t]/g, '_').slice(0, 120) || 'file'
    const body = req.body || Buffer.alloc(0)
    const text = extractDocxText(body)
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${raw}`
    if (text !== null) {
      const txtPath = path.join(UPLOADS_DIR, name + '.txt')
      fs.writeFileSync(txtPath, text, 'utf8')
      return res.json({
        ok: true,
        url: 'file:///' + txtPath.replace(/\\/g, '/'),
        path: txtPath,
        mime: 'text/plain',
        extracted: true
      })
    }
    const filePath = path.join(UPLOADS_DIR, name)
    fs.writeFileSync(filePath, body)
    res.json({ ok: true, url: 'file:///' + filePath.replace(/\\/g, '/'), path: filePath })
  }
)

app.get('/api/settings', (req, res) => {
  const s = getSettings()
  res.json({
    openBrowserOnStart: s.openBrowserOnStart,
    passwordConfigured: Boolean(s.passwordHash),
    defaultModel: s.defaultModel || 'opencode/deepseek-v4-flash-free',
    defaultAgent: s.defaultAgent || 'build',
    defaults: s.defaults || {}
  })
})

app.put('/api/settings', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const { password, openBrowserOnStart, defaultModel, defaultAgent, defaults } = req.body || {}
  const patch = {}
  if (typeof openBrowserOnStart === 'boolean') patch.openBrowserOnStart = openBrowserOnStart
  if (typeof password === 'string') {
    if (password.length < 4) return res.status(400).json({ error: 'Пароль слишком короткий (минимум 4 символа).' })
    patch.password = password
  }
  if (typeof defaultModel === 'string') patch.defaultModel = defaultModel
  if (typeof defaultAgent === 'string') patch.defaultAgent = defaultAgent
  if (defaults && typeof defaults === 'object') patch.defaults = defaults
  const updated = updateSettings(patch)
  res.json({
    ok: true,
    openBrowserOnStart: updated.openBrowserOnStart,
    passwordConfigured: Boolean(updated.passwordHash),
    defaultModel: updated.defaultModel || 'opencode/deepseek-v4-flash-free',
    defaultAgent: updated.defaultAgent || 'build',
    defaults: updated.defaults || {}
  })
}))

app.post('/api/restart', (req, res) => {
  res.json({ ok: true, restarting: true })
  setTimeout(() => {
    manager.stopAll()
    process.exit(0)
  }, 300)
})

app.get('/api/versions', (req, res) => {
  const { current, versions } = listVersions()
  res.json({ current, versions })
})

app.get('/api/updates', asyncHandler(async (req, res) => {
  try {
    res.json(await checkGithubUpdate())
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
}))

app.post('/api/updates/install', asyncHandler(async (req, res) => {
  try {
    const info = await checkGithubUpdate()
    if (!info.available) {
      return res.status(400).json({ error: 'Нет доступных обновлений' })
    }
    const result = await downloadUpdateZip(info.latest)
    switchVersion(result.name)
    res.json({ ok: true, ...result, restarting: true })
    setTimeout(() => {
      manager.stopAll()
      process.exit(0)
    }, 300)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
}))

app.post('/api/versions/switch', express.json({ limit: '1mb' }), (req, res) => {
  const name = String(req.body?.version || '')
  try {
    const result = switchVersion(name)
    res.json({ ok: true, ...result, restarting: true })
    setTimeout(() => {
      manager.stopAll()
      process.exit(0)
    }, 300)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post(
  '/api/versions/upload',
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '1gb' }),
  (req, res) => {
    const name = String(req.query.version || '')
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Пустое тело запроса' })
    }
    const tmp = path.join(os.tmpdir(), `webaia-upload-${Date.now()}.zip`)
    fs.writeFileSync(tmp, req.body)
    try {
      const result = extractVersionZip(tmp, name)
      switchVersion(name)
      res.json({ ok: true, ...result, restarting: true })
      setTimeout(() => {
        manager.stopAll()
        process.exit(0)
      }, 300)
    } catch (e) {
      res.status(400).json({ error: e.message })
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
)

app.get('/api/models', asyncHandler(async (req, res) => {
  const status = getModelStatus()
  res.json({
    models: getModelList(true),
    provider: 'opencode',
    status,
    statusAt: Object.values(status).filter((s) => s && s.checkedAt).map((s) => s.checkedAt).sort().reverse()[0] || 0,
    check: { ...checkState }
  })
}))

app.post('/api/models/check', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const modelIds = req.body?.models
  if (!Array.isArray(modelIds) || !modelIds.length) {
    return res.status(400).json({ error: 'Не переданы модели для проверки' })
  }
  const candidates = modelIds.map((s) => String(s))
  const project = registry.list().find((p) => !p.archived && manager.isRunning(p.id))
  if (!project) {
    return res.status(409).json({ error: 'Нет запущенного проекта — проверка моделей недоступна. Запустите любой проект.' })
  }
  const run = await runAvailabilityCheck(project, candidates)
  res.json({ ok: true, ...run })
}))

app.get('/api/models/custom', asyncHandler(async (req, res) => {
  res.json({ models: getCustomModels() })
}))

app.post('/api/models/custom', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const saved = addCustomModel(req.body || {})
  const restarted = await restartRunningProjects()
  res.json({ ok: true, model: saved, restarted })
}))

app.delete('/api/models/custom/:id', asyncHandler(async (req, res) => {
  removeCustomModel(String(req.params.id))
  const restarted = await restartRunningProjects()
  res.json({ ok: true, restarted })
}))

app.get('/api/projects', asyncHandler(async (req, res) => {
  const projects = registry.list().map((p) => ({ ...p, ...manager.getStatus(p) }))
  res.json({ projects })
}))

app.get('/api/fs/list', (req, res) => {
  const p = req.query.path ? String(req.query.path) : ''
  const result = listDir(p)
  if (result.error) return res.status(400).json({ error: result.error })
  res.json(result)
})

function defaultProjectPath(name) {
  const safe = String(name).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || 'Проект'
  return path.join(os.homedir(), 'Documents', safe)
}

app.post('/api/projects', express.json({ limit: '10mb' }), asyncHandler(async (req, res) => {
  const { name, path: projectPath, defaultModel, defaultAgent, autoStart, icon, iconTone } = req.body || {}
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Укажите название проекта.' })
  }
  const resolved = projectPath ? path.resolve(String(projectPath)) : defaultProjectPath(name)
  if (!projectPath && fs.existsSync(resolved)) {
    return res.status(409).json({
      error: `Папка уже существует: ${resolved}. Укажите другое название проекта или выберите папку вручную.`
    })
  }
  fs.mkdirSync(resolved, { recursive: true })
  const project = await registry.create({ name, path: resolved, defaultModel, defaultAgent, autoStart, icon, iconTone })
  if (autoStart) {
    try {
      await manager.start(project)
    } catch (err) {
      return res.status(201).json({ project: { ...project, running: false }, warning: err.message })
    }
  }
  res.status(201).json({ project: { ...project, ...manager.getStatus(project) } })
}))

app.get('/api/projects/:id', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  res.json({ project: { ...project, ...manager.getStatus(project) } })
}))

app.patch('/api/projects/:id', express.json({ limit: '10mb' }), asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  if (req.body?.path) fs.mkdirSync(path.resolve(req.body.path), { recursive: true })
  const updated = registry.update(project.id, req.body || {})
  if (updated.archived) {
    try {
      await manager.stop(updated)
    } catch {
      /* сервер мог уже быть остановлен */
    }
  }
  res.json({ project: { ...updated, ...manager.getStatus(updated) } })
}))

app.delete('/api/projects/:id', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  if (!project.archived) {
    return res.status(409).json({ error: 'Удалить проект можно только из архива. Сначала архивируйте его.' })
  }
  await manager.stop(project)
  registry.remove(project.id)
  res.json({ ok: true })
}))

app.post('/api/projects/:id/start', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  writeOpenCodeConfig()
  const result = await manager.start(project)
  res.json({ project: { ...project, ...manager.getStatus(project) }, result })
}))

app.post('/api/projects/:id/stop', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  await manager.stop(project)
  res.json({ project: { ...project, ...manager.getStatus(project) } })
}))

app.post('/api/projects/:id/restart', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  writeOpenCodeConfig()
  const result = await manager.restart(project)
  res.json({ project: { ...project, ...manager.getStatus(project) }, result })
}))

app.post('/api/projects/:id/init', express.json({ limit: '10mb' }), asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  if (project.archived) {
    return res.status(409).json({ error: 'Проект в архиве. Инициализация недоступна.' })
  }
  if (!manager.isRunning(project.id)) {
    return res.status(409).json({ error: 'Проект остановлен. Сначала запустите сервер проекта.' })
  }
  const { model } = req.body || {}
  const providerID = model?.split('/')[0] || 'opencode'
  const modelID = model?.split('/')[1] || project.defaultModel.split('/')[1]

  const created = await fetchOpenCode(project, '/session', {
    method: 'POST',
    body: JSON.stringify({ title: 'Инициализация проекта' })
  })
  const sessionID = created.id

  await fetchOpenCode(project, `/session/${sessionID}/prompt_async`, {
    method: 'POST',
    body: JSON.stringify({
      model: { providerID, modelID },
      parts: [{ type: 'text', text: RUSSIAN_INIT_PROMPT }]
    })
  })
  res.json({ ok: true, sessionID })
}))

async function fetchOpenCode(project, apiPath, { method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000)
  try {
    const res = await fetch(`http://${INTERNAL_HOST}:${project.port}${apiPath}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`opencode API ${method} ${apiPath}: ${res.status} ${text.slice(0, 300)}`)
    }
    return text ? JSON.parse(text) : null
  } finally {
    clearTimeout(timer)
  }
}

app.get('/api/projects/:id/config', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  const globalSettings = getSettings()
  res.json({
    defaultModel: project.defaultModel,
    defaultAgent: project.defaultAgent,
    defaults: project.defaults || {},
    sessionConfig: registry.getSessionConfigs(project.id),
    archivedSessions: registry.getArchivedSessions(project.id),
    globalDefaults: {
      defaultModel: globalSettings.defaultModel || 'opencode/deepseek-v4-flash-free',
      defaultAgent: globalSettings.defaultAgent || 'build',
      defaults: globalSettings.defaults || {}
    }
  })
}))

app.put('/api/projects/:id/config/session/:sessionID', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  const { model, agent, temperature, topP, maxTokens, system } = req.body || {}
  const config = {}
  if (model) config.model = String(model)
  if (agent) config.agent = String(agent)
  if (typeof temperature === 'number' && Number.isFinite(temperature)) config.temperature = temperature
  if (typeof topP === 'number' && Number.isFinite(topP)) config.topP = topP
  if (typeof maxTokens === 'number' && maxTokens > 0) config.maxTokens = Math.round(maxTokens)
  if (system) config.system = String(system)
  registry.setSessionConfig(project.id, req.params.sessionID, config)
  res.json({ ok: true, config })
}))

app.delete('/api/projects/:id/config/session/:sessionID', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  registry.removeSessionConfig(project.id, req.params.sessionID)
  res.json({ ok: true })
}))

app.put('/api/projects/:id/session/:sessionID/archive', express.json({ limit: '1mb' }), asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  const archived = Boolean(req.body?.archived)
  const nowArchived = registry.setSessionArchived(project.id, req.params.sessionID, archived)
  res.json({ ok: true, archived: nowArchived })
}))

app.delete('/api/projects/:id/session/:sessionID', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  if (!registry.getArchivedSessions(project.id)[req.params.sessionID]) {
    return res.status(409).json({ error: 'Сначала отправьте сессию в архив, затем её можно удалить.' })
  }
  if (!manager.isRunning(project.id)) {
    return res.status(409).json({ error: 'Сервер проекта остановлен. Нажмите «Запустить» для управления сессиями.' })
  }
  registry.removeSessionConfig(project.id, req.params.sessionID)
  proxyToOpenCode(req, res, project)
}))

app.use('/api/projects/:id', asyncHandler(async (req, res) => {
  const project = registry.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Проект не найден' })
  if (!manager.isRunning(project.id)) {
    return res.status(409).json({ error: 'Сервер проекта остановлен. Нажмите «Запустить».' })
  }
  if (req.method === 'POST' && /\/prompt_async$/.test(req.path)) {
    manager.trackActivity(project.id)
  }
  proxyToOpenCode(req, res, project)
}))

const distDir = (() => {
  const fromRoot = path.join(ROOT_DIR, 'web', 'dist')
  if (fs.existsSync(fromRoot)) return fromRoot
  return path.join(SERVER_DIR, 'web', 'dist')
})()
console.log(`[webaia] ROOT_DIR=${ROOT_DIR}  SERVER_DIR=${SERVER_DIR}  distDir=${distDir}  exists=${fs.existsSync(distDir)}`)
if (fs.existsSync(distDir)) {
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') res.setHeader('Cache-Control', 'no-cache')
    next()
  })
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  console.error(`[webaia] ВНИМАНИЕ: distDir не найден! FromRoot=${path.join(ROOT_DIR, 'web', 'dist')}  FromServer=${path.join(SERVER_DIR, 'web', 'dist')}`)
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Неизвестный API-маршрут' }))

const server = app.listen(MANAGER_PORT, BIND_HOST, async () => {
  console.log(`[webaia] менеджер запущен: http://127.0.0.1:${MANAGER_PORT}`)
  console.log(`[webaia] доступ из локальной сети: http://${LAN_HOST}:${MANAGER_PORT}`)
  console.log(`[webaia] opencode: ${manager.opencodeExe}`)
  void refreshFreeModels()
  for (const project of registry.list()) {
    if (project.autoStart && !project.archived) {
      manager.start(project).catch((err) => {
        console.error(`[webaia] авто-запуск ${project.name} не удался: ${err.message}`)
      })
    }
  }
  manager.startIdleChecker((id) => registry.get(id))
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[webaia] порт ${MANAGER_PORT} занят. Попытка найти и завершить старый процесс...`)
    const { execFileSync } = require('node:child_process')
    try {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
      const line = out.split('\n').find((l) => l.includes(`:${MANAGER_PORT}`) && l.includes('LISTENING'))
      if (line) {
        const pid = line.trim().split(/\s+/).pop()
        console.log(`[webaia] найден процесс PID=${pid} на порту ${MANAGER_PORT}, завершаю...`)
        execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true })
        setTimeout(() => {
          app.listen(MANAGER_PORT, BIND_HOST)
        }, 1000)
      } else {
        console.error(`[webaia] не удалось найти процесс на порту ${MANAGER_PORT}. Остановите старый вручную.`)
        process.exit(1)
      }
    } catch (e) {
      console.error(`[webaia] не удалось завершить старый процесс: ${e.message}`)
      process.exit(1)
    }
  } else {
    console.error(`[webaia] ошибка сервера: ${err.message}`)
    process.exit(1)
  }
})

const openBrowser = () => {
  const url = `http://127.0.0.1:${MANAGER_PORT}`
  if (process.env.WEBAIA_NO_BROWSER) return
  if (getSettings().openBrowserOnStart === false) return
  const platform = process.platform
  try {
    if (platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    else if (platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* ignore */
  }
}

let opened = false
server.on('listening', () => {
  if (!opened) {
    opened = true
    setTimeout(openBrowser, 400)
  }
})

process.on('SIGINT', () => {
  manager.stopAll()
  server.close(() => process.exit(0))
})

process.on('SIGTERM', () => {
  manager.stopAll()
  server.close(() => process.exit(0))
})