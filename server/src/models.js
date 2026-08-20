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
  return Array.isArray(data) ? data : []
}

export function addCustomModel(entry) {
  const models = getCustomModels()
  const id = String(entry.id || '').trim()
  if (!id) throw new Error('Укажите id модели (например openai/gpt-4o)')
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

export function getModelList() {
  const live = getFreeModels()
  const liveMap = new Map(live.map((m) => [m.id, m]))
  const free = FREE_MODELS_FALLBACK
    .map((m) => liveMap.get(m.id) || { id: m.id, name: m.id, context: m.context, output: m.output })
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
  return [...filterByStatus(free), ...custom]
}

export function getProviderOfModel(id) {
  const s = String(id)
  return s.includes('/') ? s.split('/')[0] : 'opencode'
}