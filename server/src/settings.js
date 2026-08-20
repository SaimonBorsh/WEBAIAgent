import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const DEFAULTS = {
  openBrowserOnStart: true,
  passwordHash: null
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
  save()
  return getSettings()
}

export function verifyPassword(password) {
  if (!settings.passwordHash) return null
  const hash = crypto.createHash('sha256').update(String(password)).digest('hex')
  return hash === settings.passwordHash
}