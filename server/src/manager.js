import { spawn, spawnSync, execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { BASE_DIR, DATA_DIR, INTERNAL_HOST, LOGS_DIR, OPENCODE_CONFIG_FILE } from './config.js'

export const managerEvents = new EventEmitter()

const running = new Map()
const activity = new Map()
const crashCounts = new Map()

const MAX_CRASH_RETRIES = 3
const CRASH_RESTART_DELAY_MS = 3000
const IDLE_CHECK_INTERVAL_MS = 60_000
const DEFAULT_IDLE_TIMEOUT_MIN = 30

let idleTimer = null

export function resolveExecutable() {
  const envExe = process.env.WEBAIA_OPENCODE
  if (envExe && fs.existsSync(envExe)) return envExe
  const bundled = path.join(BASE_DIR, 'bin', 'opencode.exe')
  if (fs.existsSync(bundled)) return bundled
  try {
    const res = spawnSync('where.exe', ['opencode'], { encoding: 'utf8' })
    if (res.status === 0) {
      const exe = (res.stdout || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.toLowerCase().endsWith('.exe') && l.length > 0)
      if (exe) return exe
    }
  } catch {
    /* ignore */
  }
  const npmCandidate = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    : null
  if (npmCandidate && fs.existsSync(npmCandidate)) return npmCandidate
  return 'opencode'
}

export const opencodeExe = resolveExecutable()

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: INTERNAL_HOST, port, path: '/global/health', timeout: 2000 }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode === 200))
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function waitHealthy(port, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await healthCheck(port)) return true
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

export function isRunning(projectId) {
  const entry = running.get(projectId)
  return Boolean(entry && entry.proc && entry.proc.exitCode === null)
}

export function getStatus(project) {
  const entry = running.get(project.id)
  const isRunning = Boolean(entry && entry.proc && entry.proc.exitCode === null)
  const crashed = crashCounts.get(project.id) >= MAX_CRASH_RETRIES && !isRunning
  return { running: isRunning, port: project.port, crashed }
}

export function trackActivity(projectId) {
  activity.set(projectId, Date.now())
}

export function getLastActivity(projectId) {
  return activity.get(projectId) || 0
}

export async function start(project, { silent = false } = {}) {
  if (isRunning(project.id)) return { started: false, reason: 'already' }

  if (!fs.existsSync(project.path)) {
    if (!silent) throw new Error(`Папка проекта не существует: ${project.path}`)
    return { started: false, reason: 'no-path' }
  }

  if (await healthCheck(project.port)) {
    if (!silent) throw new Error(`Порт ${project.port} уже занят другим сервером opencode`)
    return { started: false, reason: 'port-busy' }
  }

  fs.mkdirSync(LOGS_DIR, { recursive: true })
  const logStream = fs.createWriteStream(path.join(LOGS_DIR, `${project.id}.log`), { flags: 'a' })

  const env = {
    ...process.env,
    ...(process.env.WEBAIA_DATA
      ? { XDG_DATA_HOME: path.join(DATA_DIR, 'opencode-data') }
      : {})
  }
  if (fs.existsSync(OPENCODE_CONFIG_FILE)) {
    env.OPENCODE_CONFIG = OPENCODE_CONFIG_FILE
  }

  const proc = spawn(opencodeExe, ['serve', '--port', String(project.port), '--hostname', INTERNAL_HOST], {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env
  })

  const entry = { proc, logStream, idleTimeout: project.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MIN }
  running.set(project.id, entry)
  trackActivity(project.id)

  proc.stdout?.pipe(logStream, { end: false })
  proc.stderr?.pipe(logStream, { end: false })

  const handleExit = (code) => {
    if (running.get(project.id)?.proc !== proc) return
    running.delete(project.id)
    logStream.end()
    managerEvents.emit('status', { projectId: project.id, running: false, code })

    const retries = crashCounts.get(project.id) || 0
    if (code !== 0 && code !== null && retries < MAX_CRASH_RETRIES) {
      crashCounts.set(project.id, retries + 1)
      console.log(`[manager] opencode для ${project.id} упал (code=${code}), перезапуск через ${CRASH_RESTART_DELAY_MS / 1000}с (попытка ${retries + 1}/${MAX_CRASH_RETRIES})`)
      managerEvents.emit('status', { projectId: project.id, running: false, reason: 'restarting', attempt: retries + 1 })
      setTimeout(() => {
        start(project, { silent: true }).catch(() => {})
      }, CRASH_RESTART_DELAY_MS)
    } else if (code !== 0 && code !== null) {
      crashCounts.set(project.id, MAX_CRASH_RETRIES)
      console.log(`[manager] opencode для ${project.id} упал ${MAX_CRASH_RETRIES} раз, ручной запуск`)
      managerEvents.emit('status', { projectId: project.id, running: false, reason: 'crashed' })
    }
  }
  proc.on('exit', handleExit)
  proc.on('error', (err) => {
    handleExit(-1)
    console.error(`[manager] ошибка запуска opencode для ${project.id}: ${err.message}`)
  })

  const healthy = await waitHealthy(project.port)
  if (!healthy) {
    running.delete(project.id)
    logStream.end()
    if (proc.exitCode === null) killProc(proc)
    if (!silent) throw new Error('Сервер opencode не запустился за отведённое время. См. лог проекта.')
    return { started: false, reason: 'health-timeout' }
  }

  crashCounts.set(project.id, 0)
  managerEvents.emit('status', { projectId: project.id, running: true })
  return { started: true }
}

function killProc(proc) {
  if (process.platform === 'win32' && proc.pid) {
    try {
      execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'])
      return
    } catch {
      /* fallthrough */
    }
  }
  proc.kill('SIGTERM')
}

export async function stop(project) {
  const entry = running.get(project.id)
  if (!entry) return { stopped: false, reason: 'not-running' }
  killProc(entry.proc)
  const exited = await new Promise((resolve) => {
    entry.proc.once('exit', () => resolve(true))
    setTimeout(() => resolve(false), 3000)
  })
  if (!exited) entry.proc.kill('SIGKILL')
  return { stopped: true }
}

export async function restart(project) {
  await stop(project)
  await new Promise((r) => setTimeout(r, 1000))
  return start(project)
}

export function stopAll() {
  for (const [id, entry] of running) {
    killProc(entry.proc)
  }
}

export function runningProjects() {
  return [...running.keys()]
}

export function startIdleChecker(getProjectFn) {
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = setInterval(async () => {
    const now = Date.now()
    for (const [projectId, entry] of running) {
      const timeout = entry.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MIN
      if (timeout <= 0) continue
      const last = activity.get(projectId) || 0
      if (last > 0 && now - last > timeout * 60_000) {
        console.log(`[manager] ${projectId} простаивает ${timeout} мин, останавливаю`)
        const project = getProjectFn(projectId)
        if (project) {
          await stop(project)
          managerEvents.emit('status', { projectId, running: false, reason: 'idle' })
        }
      }
    }
  }, IDLE_CHECK_INTERVAL_MS)
}

export function stopIdleChecker() {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}
