import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const SERVER_DIR = path.resolve(__dirname, '..')
export const ROOT_DIR = process.env.WEBAIA_ROOT ? path.resolve(process.env.WEBAIA_ROOT) : path.resolve(SERVER_DIR, '..')
export const HOME_DIR = process.env.WEBAIA_HOME ? path.resolve(process.env.WEBAIA_HOME) : null
export const BASE_DIR = HOME_DIR || (process.env.WEBAIA_ROOT ? path.resolve(ROOT_DIR, '..') : ROOT_DIR)
export const DATA_DIR = process.env.WEBAIA_DATA ? path.resolve(process.env.WEBAIA_DATA) : SERVER_DIR

export const BIND_HOST = process.env.WEBAIA_HOST || '0.0.0.0'
export const INTERNAL_HOST = '127.0.0.1'
export const MANAGER_PORT = Number(process.env.WEBAIA_PORT || 3720)

export function getLanHost() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return INTERNAL_HOST
}
export const LAN_HOST = getLanHost()

export const BASE_PROJECT_PORT = 4100
export const MAX_PROJECT_PORT = 4199

export const REGISTRY_FILE = path.join(DATA_DIR, 'projects.json')
export const LOGS_DIR = path.join(DATA_DIR, 'logs')

export const VERSIONS_DIR = path.join(BASE_DIR, 'versions')
export const CURRENT_FILE = path.join(BASE_DIR, 'current.txt')
export const KEEPALIVE_PID_FILE = path.join(BASE_DIR, 'keepalive.pid')

export const MODELS_URL = 'https://models.dev/api.json'
export const MODELS_CACHE_TTL_MS = 6 * 60 * 60 * 1000

export const FREE_MODELS_FALLBACK = [
  { id: 'big-pickle', context: 200000, output: 32000 },
  { id: 'deepseek-v4-flash-free', context: 200000, output: 128000 },
  { id: 'hy3-free', context: 190000, output: 64000 },
  { id: 'kimi-k2.5-free', context: 262144, output: 262144 },
  { id: 'mimo-v2.5-free', context: 200000, output: 32000 },
  { id: 'nemotron-3-ultra-free', context: 1000000, output: 128000 },
  { id: 'nemotron-3.5-lightning-free', context: 262144, output: 262144 },
  { id: 'glm-4.7-free', context: 204800, output: 131072 },
  { id: 'qwen3.6-plus-free', context: 262144, output: 65536 },
  { id: 'grok-code', context: 256000, output: 256000 }
]
