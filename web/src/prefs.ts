export type ThemePref = 'system' | 'dark' | 'light'

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

const PREF_THEME = 'webaia_theme'
const PREF_SHOW_MODEL = 'webaia_show_model'
const PREF_SHOW_TOKENS = 'webaia_show_tokens'
const PREF_SHOW_REASONING = 'webaia_show_reasoning'
const PREF_DENSITY = 'webaia_density'

const media = window.matchMedia('(prefers-color-scheme: light)')

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return media.matches ? 'light' : 'dark'
  return pref
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolveTheme(getTheme()))
}

export function getTheme(): ThemePref {
  return (get(PREF_THEME) as ThemePref) || 'system'
}

export function setTheme(t: ThemePref) {
  set(PREF_THEME, t)
  applyTheme()
}

export function getShowModel(): boolean {
  return get(PREF_SHOW_MODEL) === '1'
}

export function setShowModel(v: boolean) {
  set(PREF_SHOW_MODEL, v ? '1' : '0')
}

export function getShowTokens(): boolean {
  return get(PREF_SHOW_TOKENS) === '1'
}

export function setShowTokens(v: boolean) {
  set(PREF_SHOW_TOKENS, v ? '1' : '0')
}

export function getShowReasoning(): boolean {
  return get(PREF_SHOW_REASONING) !== '0'
}

export function setShowReasoning(v: boolean) {
  set(PREF_SHOW_REASONING, v ? '1' : '0')
}

export function getDensity(): string {
  return get(PREF_DENSITY) || 'normal'
}

export function setDensity(d: string) {
  set(PREF_DENSITY, d)
  document.documentElement.setAttribute('data-density', d)
}

export function applyDensity() {
  document.documentElement.setAttribute('data-density', getDensity())
}

export function subscribeThemeChange(onChange: () => void): () => void {
  const handler = () => {
    if (getTheme() === 'system') onChange()
  }
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}