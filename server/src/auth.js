import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { verifyPassword } from './settings.js'
import { DATA_DIR } from './config.js'

const TOKEN_FILE = path.join(DATA_DIR, 'tokens.json')

const USER = process.env.WEBAIA_USER || 'admin'
const PASS = process.env.WEBAIA_PASS || 'root'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

let sessions = new Map()
let saveTimer = null

function loadTokens() {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    sessions = new Map(Object.entries(data && typeof data === 'object' ? data.sessions : {}))
  } catch {
    sessions = new Map()
  }
}

function saveTokens() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ sessions: Object.fromEntries(sessions) }, null, 2))
    } catch (err) {
      console.error(`[auth] не удалось сохранить токены: ${err.message}`)
    }
  }, 200)
}

loadTokens()

export function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false
  if (username !== USER) return false
  const hashOk = verifyPassword(password)
  if (hashOk === null) return password === PASS
  return hashOk === true
}

export function createToken() {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + TOKEN_TTL_MS)
  saveTokens()
  return token
}

export function destroyToken(token) {
  sessions.delete(token)
  saveTokens()
}

export function isTokenValid(token) {
  if (!token) return false
  const expires = sessions.get(token)
  if (!expires) return false
  if (Date.now() > expires) {
    sessions.delete(token)
    saveTokens()
    return false
  }
  return true
}

export function getToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7)
  return typeof req.query?.token === 'string' ? req.query.token : null
}

export function authMiddleware(req, res, next) {
  const token = getToken(req)
  if (isTokenValid(token)) return next()
  res.status(401).json({ error: 'Требуется авторизация' })
}

export function purgeExpired() {
  let removed = false
  const now = Date.now()
  for (const [token, expires] of sessions) {
    if (expires <= now) {
      sessions.delete(token)
      removed = true
    }
  }
  if (removed) saveTokens()
}

setInterval(purgeExpired, 60 * 60 * 1000).unref()