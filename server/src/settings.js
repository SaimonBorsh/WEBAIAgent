import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const DEFAULTS = {
  openBrowserOnStart: true,
  passwordHash: null,
  defaultModel: 'opencode/deepseek-v4-flash-free',
  defaultAgent: 'build',
  defaults: {}
}

let settings = load()

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return { ...DEFAULTS, ...(data && typeof data === 'object' ? data : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error(`[settings] не удалось сохранить: ${err.message}`)
  }
}

function normalizeModel(m) {
  if (!m) return m
  const s = String(m)
  return s.includes('/') ? s : `opencode/${s}`
}

export function getSettings() {
  return { ...settings }
}

export function updateSettings(patch) {
  if ('openBrowserOnStart' in patch) {
    settings.openBrowserOnStart = Boolean(patch.openBrowserOnStart)
  }
  if (typeof patch.password === 'string' && patch.password.length > 0) {
    settings.passwordHash = crypto.createHash('sha256').update(patch.password).digest('hex')
  }
  if ('defaultModel' in patch) {
    settings.defaultModel = normalizeModel(patch.defaultModel) || settings.defaultModel
  }
  if ('defaultAgent' in patch) {
    settings.defaultAgent = patch.defaultAgent || settings.defaultAgent
  }
  if (patch.defaults && typeof patch.defaults === 'object') {
    const src = patch.defaults
    const d = { ...(settings.defaults || {}) }
    if (typeof src.temperature === 'number' && Number.isFinite(src.temperature) && src.temperature >= 0 && src.temperature <= 2) {
      d.temperature = src.temperature
    } else if (src.temperature === null || src.temperature === undefined) {
      delete d.temperature
    }
    if (typeof src.topP === 'number' && Number.isFinite(src.topP) && src.topP >= 0 && src.topP <= 1) {
      d.topP = src.topP
    } else if (src.topP === null || src.topP === undefined) {
      delete d.topP
    }
    if (typeof src.maxTokens === 'number' && src.maxTokens > 0) {
      d.maxTokens = Math.round(src.maxTokens)
    } else if (src.maxTokens === null || src.maxTokens === undefined) {
      delete d.maxTokens
    }
    if (typeof src.system === 'string') {
      d.system = src.system.trim()
    } else if (src.system === null || src.system === undefined) {
      delete d.system
    }
    settings.defaults = d
  }
  save()
  return getSettings()
}

export function verifyPassword(password) {
  if (!settings.passwordHash) return null
  const hash = crypto.createHash('sha256').update(String(password)).digest('hex')
  return hash === settings.passwordHash
}
