import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PORTABLE = fs.existsSync(path.join(ROOT, 'versions')) && fs.existsSync(path.join(ROOT, 'current.txt'))
const DATA_DIR = PORTABLE ? path.join(ROOT, 'data') : path.join(ROOT, 'server')
const LOGS = path.join(DATA_DIR, 'logs')

const STABLE_MS = 20000
const BACKOFF_BASE = 1000
const BACKOFF_MAX = 30000
const WATCH_DEBOUNCE_MS = 1500
const WATCH_MIN_GAP_MS = 4000

fs.mkdirSync(LOGS, { recursive: true })

let child = null
let stopped = false
let backoff = BACKOFF_BASE
let startedAt = 0
let lastWatchRestart = 0
let watchTimer = null

function log(...args) {
  console.log(`[keepalive] ${new Date().toISOString()}`, ...args)
}

function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      return
    } catch {
      /* fallthrough */
    }
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* ignore */
  }
}

function openLog(name) {
  const stream = fs.createWriteStream(path.join(LOGS, name), { flags: 'a' })
  return new Promise((resolve, reject) => {
    stream.once('open', () => resolve(stream))
    stream.once('error', reject)
  })
}

function readCurrent() {
  try {
    return fs.readFileSync(path.join(ROOT, 'current.txt'), 'utf8').trim()
  } catch {
    return null
  }
}

function resolveServerArgs() {
  if (!PORTABLE) {
    return { args: ['src/index.js'], cwd: path.join(ROOT, 'server'), env: { ...process.env } }
  }
  const ver = readCurrent()
  if (!ver) {
    throw new Error('current.txt пуст или отсутствует')
  }
  const bundle = path.join(ROOT, 'versions', ver, 'server.bundle.cjs')
  if (!fs.existsSync(bundle)) {
    throw new Error(`Сервер версии ${ver} не найден: ${bundle}`)
  }
  const env = {
    ...process.env,
    WEBAIA_ROOT: ROOT,
    WEBAIA_DATA: DATA_DIR,
    XDG_DATA_HOME: path.join(DATA_DIR, 'opencode-data')
  }
  return { args: [bundle], cwd: ROOT, env }
}

async function startManager() {
  if (stopped || child) return
  let out, err
  try {
    ;[out, err] = await Promise.all([openLog('manager.out.log'), openLog('manager.err.log')])
  } catch (e) {
    log('не удалось открыть файлы логов:', e.message)
    backoff = Math.min(backoff * 2, BACKOFF_MAX)
    setTimeout(() => void startManager(), backoff)
    return
  }
  if (stopped || child) {
    out.close()
    err.close()
    return
  }
  let serverArgs
  try {
    serverArgs = resolveServerArgs()
  } catch (e) {
    log('ошибка:', e.message)
    out.close(); err.close()
    backoff = Math.min(backoff * 2, BACKOFF_MAX)
    setTimeout(() => void startManager(), backoff)
    return
  }
  const desc = PORTABLE ? `versions/${readCurrent()}/server.bundle.cjs` : 'node src/index.js'
  log(`запуск менеджера (${desc})`)
  child = spawn(process.execPath, serverArgs.args, {
    cwd: serverArgs.cwd,
    stdio: ['ignore', out, err],
    windowsHide: true,
    env: serverArgs.env
  })
  startedAt = Date.now()
  child.on('error', (e) => {
    log('ошибка запуска менеджера:', e.message)
    child = null
  })
  child.on('exit', (code, signal) => {
    child = null
    if (stopped) return
    const lived = Date.now() - startedAt
    backoff = lived < STABLE_MS ? Math.min(backoff * 2, BACKOFF_MAX) : BACKOFF_BASE
    log(`менеджер завершился (code=${code} signal=${signal}, жил ${lived}мс), повтор через ${backoff}мс`)
    setTimeout(() => void startManager(), backoff)
  })
}

function requestRestart() {
  if (!child || child.exitCode !== null) return
  const now = Date.now()
  if (now - lastWatchRestart < WATCH_MIN_GAP_MS) return
  lastWatchRestart = now
  log('изменения — перезапуск менеджера')
  killTree(child.pid)
}

function setupWatch() {
  if (process.env.WEBAIA_WATCH !== '1') return
  const watchDir = PORTABLE ? path.join(ROOT, 'versions') : path.join(ROOT, 'server', 'src')
  if (!fs.existsSync(watchDir)) return
  fs.watch(watchDir, { recursive: true }, () => {
    clearTimeout(watchTimer)
    watchTimer = setTimeout(requestRestart, WATCH_DEBOUNCE_MS)
  })
  log(`watch включён (${PORTABLE ? 'versions' : 'server/src'})`)
}

function shutdown() {
  stopped = true
  clearTimeout(watchTimer)
  if (child && child.exitCode === null) killTree(child.pid)
  setTimeout(() => process.exit(0), 500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

setupWatch()
void startManager()
