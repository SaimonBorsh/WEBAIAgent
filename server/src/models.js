import fs from 'node:fs'
import path from 'node:path'
import { MODELS_URL, MODELS_CACHE_TTL_MS, FREE_MODELS_FALLBACK, CUSTOM_MODELS_FILE, MODELS_STATUS_FILE, OPENCODE_CONFIG_FILE } from './config.js'

let cache = { at: 0, models: null }

export function getFreeModels() {
  if (cache.models && Date.now() - cache.at < MODELS_CACHE_TTL_MS) return cache.models
  void refreshFreeModels()
  return cache.models || []
}

export async function refreshFreeModels() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(MODELS_URL, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const provider = data?.opencode
    if (!provider?.models) throw new Error('Провайдер opencode не найден')

    const models = []
    for (const [id, m] of Object.entries(provider.models)) {
      const cost = m?.cost || {}
      const input = Number(cost.input ?? 1)
      const output = Number(cost.output ?? 1)
      if (input === 0 && output === 0) {
        models.push({
          id,
          name: m?.name || id,
          context: m?.limit?.context ?? 0,
          output: m?.limit?.output ?? 0
        })
      }
    }
    models.sort((a, b) => a.id.localeCompare(b.id))
    if (models.length) {
      cache = { at: Date.now(), models }
    }
    return cache.models || []
  } catch (err) {
    console.error(`[models] не удалось загрузить список моделей: ${err.message}`)
    cache = { at: Date.now(), models: null }
    return []
  }
}

export function getFallbackModels() {
  return FREE_MODELS_FALLBACK.map((m) => ({
    id: m.id,
    name: m.id,
    context: m.context,
    output: m.output
  }))
}

/* ---------- ручные (пользовательские) модели ---------- */

function readJson(file, def) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed ?? def
  } catch {
    return def
  }
}

export function getCustomModels() {
  const data = readJson(CUSTOM_MODELS_FILE, [])
  const arr = Array.isArray(data) ? data : []
  return arr.map((m) => ({ ...m, id: normalizeModelId(m.id, m.baseURL) })).filter((m) => m.id)
}

export function addCustomModel(entry) {
  const id = normalizeModelId(entry.id, entry.baseURL)
  if (!id) throw new Error('Укажите id модели (например openai/gpt-4o)')
  const models = getCustomModels()
  const idx = models.findIndex((m) => m.id === id)
  const clean = {
    id,
    name: entry.name ? String(entry.name).trim() : '',
    apiKey: entry.apiKey ? String(entry.apiKey).trim() : '',
    baseURL: entry.baseURL ? String(entry.baseURL).trim() : '',
    context: Number(entry.context) || 0,
    output: Number(entry.output) || 0
  }
  if (idx >= 0) models[idx] = clean
  else models.push(clean)
  fs.mkdirSync(path.dirname(CUSTOM_MODELS_FILE), { recursive: true })
  fs.writeFileSync(CUSTOM_MODELS_FILE, JSON.stringify(models, null, 2), 'utf8')
  writeOpenCodeConfig()
  return clean
}

export function removeCustomModel(id) {
  const models = getCustomModels().filter((m) => m.id !== id)
  fs.mkdirSync(path.dirname(CUSTOM_MODELS_FILE), { recursive: true })
  fs.writeFileSync(CUSTOM_MODELS_FILE, JSON.stringify(models, null, 2), 'utf8')
  writeOpenCodeConfig()
}

/* ---------- статус доступности бесплатных моделей ---------- */

export function getModelStatus() {
  const data = readJson(MODELS_STATUS_FILE, {})
  return data && typeof data === 'object' ? data : {}
}

export function setModelStatus(id, status) {
  const all = getModelStatus()
  all[id] = status
  fs.mkdirSync(path.dirname(MODELS_STATUS_FILE), { recursive: true })
  fs.writeFileSync(MODELS_STATUS_FILE, JSON.stringify(all, null, 2), 'utf8')
}

/* ---------- фоновая проверка доступности ---------- */

export const checkState = {
  running: false,
  total: 0,
  done: 0,
  current: null,
  startedAt: 0,
  error: ''
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function oc(base, apiPath, { method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40000)
  try {
    const res = await fetch(base + apiPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  } finally {
    clearTimeout(timer)
  }
}

async function probeModel(project, modelId) {
  const base = `http://${project.host || '127.0.0.1'}:${project.port}`
  const providerID = getProviderOfModel(modelId)
  const modelID = modelId.replace(/^[^/]+\//, '')
  try {
    const created = await oc(base, '/session', {
      method: 'POST',
      body: JSON.stringify({ title: 'Проверка модели' })
    })
    const sessionID = created.id
    try {
      await oc(base, `/session/${sessionID}/prompt_async`, {
        method: 'POST',
        body: JSON.stringify({
          model: { providerID, modelID },
          parts: [{ type: 'text', text: 'Ответь одним словом: ок' }]
        })
      })
    } catch (err) {
      return { status: 'unavailable', reason: `ошибка запуска: ${String(err.message || err).slice(0, 200)}` }
    }
    await sleep(12000)
    try {
      const msgs = await oc(base, `/session/${sessionID}/message?limit=1`)
      const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : null
      const info = last?.info || last
      if (info?.role === 'assistant' && info?.time?.completed) {
        return { status: 'ok' }
      }
      const errData = info?.error?.data?.message || info?.error?.name || ''
      return { status: 'unavailable', reason: errData ? `ошибка: ${errData.slice(0, 200)}` : 'нет ответа за 12 с' }
    } finally {
      try {
        await oc(base, `/session/${sessionID}`, { method: 'DELETE' })
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    return { status: 'unavailable', reason: String(err.message || err).slice(0, 200) }
  }
}

export async function runAvailabilityCheck(project, modelIds) {
  if (checkState.running) return { started: false, reason: 'already' }
  const ids = modelIds.filter((id) => id && String(id).trim())
  checkState.running = true
  checkState.total = ids.length
  checkState.done = 0
  checkState.current = null
  checkState.startedAt = Date.now()
  checkState.error = ''
  try {
    for (const id of ids) {
      checkState.current = id
      const r = await probeModel(project, id)
      setModelStatus(id, { ...r, checkedAt: Date.now() })
      checkState.done++
    }
  } catch (err) {
    checkState.error = String(err.message || err)
  } finally {
    checkState.running = false
    checkState.current = null
  }
  return { started: true }
}

/* ---------- конфиг opencode для пользовательских провайдеров ---------- */

export function writeOpenCodeConfig() {
  const models = getCustomModels()
  const provider = {}
  for (const m of models) {
    const [providerID, ...rest] = m.id.split('/')
    const modelID = rest.join('/')
    if (!providerID || !modelID) continue
    provider[providerID] = provider[providerID] || { options: {}, models: {} }
    if (m.apiKey) provider[providerID].options.apiKey = m.apiKey
    if (m.baseURL) provider[providerID].options.baseURL = m.baseURL
    provider[providerID].models[modelID] = { name: m.name || m.id }
    if (m.context) provider[providerID].models[modelID].limit = { context: m.context, output: m.output || undefined }
  }
  const config = {
    $schema: 'https://opencode.ai/config.json',
    provider
  }
  fs.mkdirSync(path.dirname(OPENCODE_CONFIG_FILE), { recursive: true })
  fs.writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

/* ---------- итоговый список ---------- */

function filterByStatus(models) {
  const status = getModelStatus()
  return models.filter((m) => {
    const st = status[m.id]
    return !st || st.status !== 'unavailable'
  })
}

export function getModelList(includeUnavailable = false) {
  const live = getFreeModels()
  const base = live.length ? live : getFallbackModels()
  const free = base
    .filter((m) => m && m.id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context,
      output: m.output,
      source: 'free'
    }))
  const custom = getCustomModels().map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context: m.context,
    output: m.output,
    source: 'custom'
  }))
  const all = [...free, ...custom]
  return includeUnavailable ? all : filterByStatus(all)
}

export function getProviderOfModel(id) {
  const s = String(id)
  if (s.includes('/')) return s.split('/')[0]
  const free = getFreeModels().some((m) => m.id === s)
  const fallback = getFallbackModels().some((m) => m.id === s)
  return free || fallback ? 'opencode' : 'opencode'
}

export function inferProvider(baseURL) {
  const u = String(baseURL || '').toLowerCase()
  if (!u) return 'custom'
  if (u.includes('11434') || u.includes('ollama')) return 'ollama'
  if (u.includes('openai.com') || u.includes('api.openai')) return 'openai'
  if (u.includes('anthropic')) return 'anthropic'
  if (u.includes('groq')) return 'groq'
  if (u.includes('mistral')) return 'mistral'
  if (u.includes('deepseek')) return 'deepseek'
  if (u.includes('x.ai') || u.includes('grok')) return 'xai'
  if (u.includes('gemini') || u.includes('googleapis')) return 'google'
  if (u.includes('1234') || u.includes('lmstudio')) return 'lmstudio'
  return 'custom'
}

export function normalizeModelId(id, baseURL) {
  const s = String(id || '').trim()
  if (s.includes('/')) return s
  if (!s) return ''
  const providerID = inferProvider(baseURL) || 'custom'
  return `${providerID}/${s}`
}