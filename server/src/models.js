import { MODELS_URL, MODELS_CACHE_TTL_MS, FREE_MODELS_FALLBACK } from './config.js'

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

export function getModelList() {
  const live = getFreeModels()
  return live.length ? live : getFallbackModels()
}