import { spawn, spawnSync, execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { BASE_DIR, DATA_DIR, INTERNAL_HOST, LOGS_DIR } from './config.js'

export const managerEvents = new EventEmitter()

const running = new Map()

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
  return { running: isRunning(project.id), port: project.port }
}

export async function start(project) {
  if (isRunning(project.id)) return { started: false, reason: 'already' }

  if (!fs.existsSync(project.path)) {
    throw new Error(`Папка проекта не существует: ${project.path}`)
  }

  if (await healthCheck(project.port)) {
    throw new Error(`Порт ${project.port} уже занят другим сервером opencode`)
  }

  fs.mkdirSync(LOGS_DIR, { recursive: true })
  const logStream = fs.createWriteStream(path.join(LOGS_DIR, `${project.id}.log`), { flags: 'a' })

  const proc = spawn(opencodeExe, ['serve', '--port', String(project.port), '--hostname', INTERNAL_HOST], {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ...(process.env.WEBAIA_DATA
        ? { XDG_DATA_HOME: path.join(DATA_DIR, 'opencode-data') }
        : {})
    }
  })

  const entry = { proc, logStream }
  running.set(project.id, entry)

  proc.stdout?.pipe(logStream, { end: false })
  proc.stderr?.pipe(logStream, { end: false })

  const handleExit = (code) => {
    if (running.get(project.id)?.proc === proc) {
      running.delete(project.id)
      logStream.end()
      managerEvents.emit('status', { projectId: project.id, running: false, code })
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
    throw new Error('Сервер opencode не запустился за отведённое время. См. лог проекта.')
  }

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

export function stopAll() {
  for (const [id, entry] of running) {
    killProc(entry.proc)
  }
}

export function runningProjects() {
  return [...running.keys()]
}