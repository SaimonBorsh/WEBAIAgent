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
const PREF_AUTO_SCROLL = 'webaia_auto_scroll'
const PREF_SOUND_DONE = 'webaia_sound_done'
const PREF_CHAT_FONT_SIZE = 'webaia_chat_font_size'
const PREF_SHOW_TIMESTAMPS = 'webaia_show_timestamps'
const PREF_MSG_WIDTH = 'webaia_msg_width'
const PREF_CODE_WRAP = 'webaia_code_wrap'
const PREF_STREAMING_CURSOR = 'webaia_streaming_cursor'
const PREF_AUTO_EXPAND_TOOL = 'webaia_auto_expand_tool'

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

export function getAutoScroll(): boolean {
  return get(PREF_AUTO_SCROLL) !== '0'
}

export function setAutoScroll(v: boolean) {
  set(PREF_AUTO_SCROLL, v ? '1' : '0')
}

export function getSoundDone(): boolean {
  return get(PREF_SOUND_DONE) !== '0'
}

export function setSoundDone(v: boolean) {
  set(PREF_SOUND_DONE, v ? '1' : '0')
}

export function getChatFontSize(): string {
  return get(PREF_CHAT_FONT_SIZE) || 'normal'
}

export function setChatFontSize(v: string) {
  set(PREF_CHAT_FONT_SIZE, v)
  document.documentElement.setAttribute('data-chat-font', v)
}

export function applyChatFontSize() {
  document.documentElement.setAttribute('data-chat-font', getChatFontSize())
}

export function getShowTimestamps(): boolean {
  return get(PREF_SHOW_TIMESTAMPS) === '1'
}

export function setShowTimestamps(v: boolean) {
  set(PREF_SHOW_TIMESTAMPS, v ? '1' : '0')
}

export function getMsgWidth(): string {
  return get(PREF_MSG_WIDTH) || 'normal'
}

export function setMsgWidth(v: string) {
  set(PREF_MSG_WIDTH, v)
  document.documentElement.setAttribute('data-msg-width', v)
}

export function applyMsgWidth() {
  document.documentElement.setAttribute('data-msg-width', getMsgWidth())
}

export function getCodeWrap(): boolean {
  return get(PREF_CODE_WRAP) === '1'
}

export function setCodeWrap(v: boolean) {
  set(PREF_CODE_WRAP, v ? '1' : '0')
}

export function getStreamingCursor(): boolean {
  return get(PREF_STREAMING_CURSOR) !== '0'
}

export function setStreamingCursor(v: boolean) {
  set(PREF_STREAMING_CURSOR, v ? '1' : '0')
}

export function getAutoExpandTool(): boolean {
  return get(PREF_AUTO_EXPAND_TOOL) === '1'
}

export function setAutoExpandTool(v: boolean) {
  set(PREF_AUTO_EXPAND_TOOL, v ? '1' : '0')
}

export function subscribeThemeChange(onChange: () => void): () => void {
  const handler = () => {
    if (getTheme() === 'system') onChange()
  }
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}