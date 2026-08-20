import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  getTheme,
  setTheme,
  getDensity,
  setDensity,
  getShowModel,
  setShowModel,
  getShowTokens,
  setShowTokens,
  getShowReasoning,
  setShowReasoning
} from '../prefs'
import type { ThemePref } from '../prefs'
import { useEscape } from '../useEscape'

interface Props {
  onClose: () => void
}

export default function GlobalSettingsModal({ onClose }: Props) {
  useEscape(onClose)
  const [theme, setThemeState] = useState<ThemePref>(getTheme())
  const [density, setDensityState] = useState(getDensity())
  const [showModel, setShowModelState] = useState(getShowModel())
  const [showTokens, setShowTokensState] = useState(getShowTokens())
  const [showReasoning, setShowReasoningState] = useState(getShowReasoning())
  const [openBrowser, setOpenBrowser] = useState(true)
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .settings()
      .then((s) => setOpenBrowser(s.openBrowserOnStart))
      .catch(() => {})
  }, [])

  const onTheme = (t: ThemePref) => {
    setThemeState(t)
    setTheme(t)
  }

  const onDensity = (d: string) => {
    setDensityState(d)
    setDensity(d)
  }

  const onShowModel = (v: boolean) => {
    setShowModelState(v)
    setShowModel(v)
  }

  const onShowTokens = (v: boolean) => {
    setShowTokensState(v)
    setShowTokens(v)
  }

  const onShowReasoning = (v: boolean) => {
    setShowReasoningState(v)
    setShowReasoning(v)
  }

  const saveServer = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      await api.updateSettings({ openBrowserOnStart: openBrowser })
      setMsg('Настройки сервера сохранены.')
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    if (!pwd1) {
      setErr('Введите новый пароль.')
      return
    }
    if (pwd1 !== pwd2) {
      setErr('Пароли не совпадают.')
      return
    }
    if (pwd1.length < 4) {
      setErr('Пароль слишком короткий (минимум 4 символа).')
      return
    }
    setBusy(true)
    try {
      await api.updateSettings({ password: pwd1 })
      setPwd1('')
      setPwd2('')
      setMsg('Пароль изменён. Выйдите и войдите с новым паролем при необходимости.')
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-settings" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Настройки</h2>

        <label className="field">
          <span>Тема</span>
          <select value={theme} onChange={(e) => onTheme(e.target.value as ThemePref)}>
            <option value="system">Системная</option>
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
          </select>
        </label>

        <label className="field">
          <span>Плотность интерфейса</span>
          <select value={density} onChange={(e) => onDensity(e.target.value)}>
            <option value="normal">Обычная</option>
            <option value="compact">Компактная</option>
          </select>
        </label>

        <label className="check">
          <input type="checkbox" checked={showModel} onChange={(e) => onShowModel(e.target.checked)} />
          <span>Показывать модель в сообщениях</span>
        </label>

        <label className="check">
          <input type="checkbox" checked={showTokens} onChange={(e) => onShowTokens(e.target.checked)} />
          <span>Показывать токены в сообщениях</span>
        </label>

        <label className="check">
          <input type="checkbox" checked={showReasoning} onChange={(e) => onShowReasoning(e.target.checked)} />
          <span>Показывать рассуждения модели (что она «думает»)</span>
        </label>

        <div className="settings-divider" />

        <form onSubmit={saveServer}>
          <label className="check">
            <input
              type="checkbox"
              checked={openBrowser}
              onChange={(e) => setOpenBrowser(e.target.checked)}
            />
            <span>Открывать браузер при старте менеджера</span>
          </label>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>

        <div className="settings-divider" />

        <form onSubmit={changePassword}>
          <h3 className="settings-subhead">Смена пароля администратора</h3>
          <div className="settings-row">
            <label className="field">
              <span>Новый пароль</span>
              <input type="password" value={pwd1} onChange={(e) => setPwd1(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Подтверждение</span>
              <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !pwd1}>
              {busy ? 'Сохранение…' : 'Сменить пароль'}
            </button>
          </div>
        </form>

        {msg && <div className="settings-msg">{msg}</div>}
        {err && <div className="error">{err}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}