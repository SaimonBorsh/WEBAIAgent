import { useEffect, useState } from 'react'
import { api } from '../api'
import type { FreeModel, CustomModel, ModelStatusEntry, CheckState, SessionConfig } from '../types'
import ModelSelect from './ModelSelect'
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

type Tab = 'interface' | 'server' | 'model' | 'models'

const EMPTY_CHECK: CheckState = { running: false, total: 0, done: 0, current: null, startedAt: 0, error: '' }

function num(value: string): number | undefined {
  const n = parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function validateField(value: string, min: number, max: number, label: string): string | undefined {
  if (!value.trim()) return undefined
  const n = num(value)
  if (n === undefined) return `${label}: введите число`
  if (n < min || n > max) return `${label}: введите значение от ${min} до ${max}`
  return undefined
}

type FieldErrors = Partial<Record<'temperature' | 'topP' | 'maxTokens', string>>

export default function GlobalSettingsModal({ onClose }: Props) {
  useEscape(onClose)
  const [tab, setTab] = useState<Tab>('interface')
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

  const [models, setModels] = useState<FreeModel[]>([])
  const [modelStatus, setModelStatus] = useState<Record<string, ModelStatusEntry>>({})
  const [customModels, setCustomModels] = useState<CustomModel[]>([])
  const [check, setCheck] = useState<CheckState>(EMPTY_CHECK)
  const [showAddModel, setShowAddModel] = useState(false)
  const [newModel, setNewModel] = useState<CustomModel>({ id: '', name: '', apiKey: '', baseURL: '', context: undefined, output: undefined })

  const [defaultModel, setDefaultModel] = useState('opencode/deepseek-v4-flash-free')
  const [defaultAgent, setDefaultAgent] = useState('build')
  const [temperature, setTemperature] = useState('')
  const [topP, setTopP] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [system, setSystem] = useState('')
  const [modelErrors, setModelErrors] = useState<FieldErrors>({})

  const loadModels = () => {
    api
      .models()
      .then((r) => {
        setModels(r.models)
        setModelStatus(r.status || {})
        setCheck(r.check || EMPTY_CHECK)
      })
      .catch(() => {})
    api
      .customModels()
      .then((r) => setCustomModels(r.models))
      .catch(() => {})
  }

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setOpenBrowser(s.openBrowserOnStart)
        setDefaultModel(s.defaultModel || 'opencode/deepseek-v4-flash-free')
        setDefaultAgent(s.defaultAgent || 'build')
        const d = s.defaults || {}
        setTemperature(typeof d.temperature === 'number' ? d.temperature.toString() : '')
        setTopP(typeof d.topP === 'number' ? d.topP.toString() : '')
        setMaxTokens(typeof d.maxTokens === 'number' ? d.maxTokens.toString() : '')
        setSystem(d.system || '')
      })
      .catch(() => {})
    loadModels()
  }, [])

  useEffect(() => {
    if (!check.running) return
    const timer = setInterval(() => {
      api
        .models()
        .then((r) => {
          setModels(r.models)
          setModelStatus(r.status || {})
          setCheck(r.check || EMPTY_CHECK)
        })
        .catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [check.running])

  const runCheck = async () => {
    setErr('')
    setMsg('')
    try {
      const freeIds = models.filter((m) => m.source !== 'custom').map((m) => m.id)
      if (!freeIds.length) {
        setMsg('Нет свободных моделей для проверки.')
        return
      }
      await api.checkModels(freeIds)
      setCheck({ ...check, running: true })
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    }
  }

  const checkOne = async (id: string) => {
    setErr('')
    setMsg('')
    try {
      await api.checkModels([id])
      setCheck({ ...check, running: true })
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    }
  }

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

  const saveModelDefaults = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const nextErrors: FieldErrors = {
      temperature: validateField(temperature, 0, 2, 'Temperature'),
      topP: validateField(topP, 0, 1, 'Top P'),
      maxTokens: validateField(maxTokens, 1, 1000000, 'Max tokens')
    }
    setModelErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setBusy(true)
    try {
      const defaults: SessionConfig = {}
      const t = num(temperature)
      if (t !== undefined) defaults.temperature = Math.min(2, Math.max(0, t))
      const p = num(topP)
      if (p !== undefined) defaults.topP = Math.min(1, Math.max(0, p))
      const m = num(maxTokens)
      if (m !== undefined && m > 0) defaults.maxTokens = Math.round(m)
      if (system.trim()) defaults.system = system.trim()

      await api.updateSettings({
        defaultModel: defaultModel.includes('/') ? defaultModel : `opencode/${defaultModel}`,
        defaultAgent,
        defaults
      })
      setMsg('Модель по умолчанию сохранена.')
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    } finally {
      setBusy(false)
    }
  }

  const addModel = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      await api.addCustomModel(newModel)
      setShowAddModel(false)
      setNewModel({ id: '', name: '', apiKey: '', baseURL: '', context: undefined, output: undefined })
      loadModels()
      setMsg('Модель добавлена. Перезапустите сервер проекта, чтобы она стала доступной.')
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    }
  }

  const removeModel = async (id: string) => {
    setErr('')
    try {
      await api.removeCustomModel(id)
      loadModels()
      setMsg('Модель удалена.')
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : String(err2))
    }
  }

  const numFmt = (v: string): number | undefined => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
  }

  const percent = check.total ? Math.round((check.done / check.total) * 100) : 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-settings" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Настройки</h2>

        <div className="settings-tabs" role="tablist">
          <button className={`settings-tab ${tab === 'interface' ? 'active' : ''}`} onClick={() => setTab('interface')} role="tab">
            Интерфейс
          </button>
          <button className={`settings-tab ${tab === 'model' ? 'active' : ''}`} onClick={() => setTab('model')} role="tab">
            Модель
          </button>
          <button className={`settings-tab ${tab === 'server' ? 'active' : ''}`} onClick={() => setTab('server')} role="tab">
            Сервер
          </button>
          <button className={`settings-tab ${tab === 'models' ? 'active' : ''}`} onClick={() => setTab('models')} role="tab">
            Список моделей
          </button>
        </div>

        {tab === 'interface' && (
          <div className="settings-tab-body">
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
          </div>
        )}

        {tab === 'model' && (
          <div className="settings-tab-body">
            <form onSubmit={saveModelDefaults}>
              <label className="field">
                <span>Модель по умолчанию</span>
                <ModelSelect models={models} value={defaultModel} onChange={setDefaultModel} />
                <span className="muted small">Используется для новых сессий. В существующих сессиях модель настраивается отдельно.</span>
              </label>

              <label className="field">
                <span>Агент по умолчанию</span>
                <select value={defaultAgent} onChange={(e) => setDefaultAgent(e.target.value)}>
                  <option value="build">build — выполнение задач</option>
                  <option value="plan">plan — планирование без изменений</option>
                </select>
              </label>

              <div className="settings-divider" />
              <h3 className="settings-subhead">Параметры модели (по умолчанию для новых сессий)</h3>

              <div className="settings-row">
                <label className="field">
                  <span>Temperature (0–2)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="по умолчанию"
                  />
                  {modelErrors.temperature && <span className="field-error">{modelErrors.temperature}</span>}
                </label>
                <label className="field">
                  <span>Top P (0–1)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={topP}
                    onChange={(e) => setTopP(e.target.value)}
                    placeholder="по умолчанию"
                  />
                  {modelErrors.topP && <span className="field-error">{modelErrors.topP}</span>}
                </label>
                <label className="field">
                  <span>Max tokens</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    placeholder="по умолчанию"
                  />
                  {modelErrors.maxTokens && <span className="field-error">{modelErrors.maxTokens}</span>}
                </label>
              </div>

              <label className="field">
                <span>Системный промпт (для новых сессий)</span>
                <textarea
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  placeholder="Глобальные инструкции для сессий…"
                  rows={3}
                />
              </label>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'server' && (
          <div className="settings-tab-body">
            <form onSubmit={saveServer}>
              <label className="check">
                <input type="checkbox" checked={openBrowser} onChange={(e) => setOpenBrowser(e.target.checked)} />
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
          </div>
        )}

        {tab === 'models' && (
          <div className="settings-tab-body">
            <div className="models-section">
              <div className="models-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void runCheck()}
                  disabled={check.running || models.filter((m) => m.source !== 'custom').length === 0}
                >
                  {check.running ? `Проверка… ${check.done}/${check.total}` : 'Проверить доступность'}
                </button>
                <button className="btn" onClick={() => setShowAddModel((v) => !v)}>
                  {showAddModel ? 'Отмена' : '+ Своя модель'}
                </button>
              </div>

              {check.running && (
                <div className="check-progress">
                  <div className="check-progress-bar">
                    <div className="check-progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="check-progress-info">
                    <span className="spinner" aria-hidden="true" />
                    <span>
                      Проверяется: <strong>{check.current || '…'}</strong> ({check.done}/{check.total})
                    </span>
                    <span className="muted small">{percent}%</span>
                  </div>
                </div>
              )}
              {!check.running && check.done > 0 && (
                <div className="muted small">Проверка завершена: {check.done} из {check.total} моделей.</div>
              )}
              {check.error && <div className="error">{check.error}</div>}
              {err && <div className="error">{err}</div>}

              <div className="models-list">
                {models.length === 0 && <div className="muted small">Список моделей пуст.</div>}
                {models.map((m) => {
                  const st = m.source === 'custom' ? modelStatus[m.id] || null : modelStatus[m.id]
                  const isChecking = check.running && check.current === m.id
                  return (
                    <div className={`model-row ${isChecking ? 'checking' : ''}`} key={m.id}>
                      {isChecking && <span className="spinner spinner-sm" aria-hidden="true" />}
                      <span className="model-row-name">
                        {m.name}
                        {m.source === 'custom' && <span className="badge badge-custom">своя</span>}
                      </span>
                      <span className="muted small model-row-meta">
                        {m.id}
                        {m.context ? ` · ${Math.round(m.context / 1000)}K ctx` : ''}
                      </span>
                      <button className="btn btn-small" onClick={() => void checkOne(m.id)} disabled={check.running}>
                        Проверить
                      </button>
                      {m.source === 'custom' ? (
                        <button className="btn btn-small btn-danger" onClick={() => void removeModel(m.id)}>
                          Удалить
                        </button>
                      ) : null}
                      {st ? (
                        st.status === 'ok' ? (
                          <span className="model-status model-status-ok">✓ работает</span>
                        ) : (
                          <span className="model-status model-status-no" title={st.reason || ''}>
                            ✗ не работает
                          </span>
                        )
                      ) : (
                        <span className="model-status muted">не проверена</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {showAddModel && (
                <form className="add-model-form" onSubmit={addModel}>
                  <div className="settings-row">
                    <label className="field">
                      <span>ID модели</span>
                      <input
                        value={newModel.id}
                        onChange={(e) => setNewModel((m) => ({ ...m, id: e.target.value }))}
                        placeholder="openai/gpt-4o или ollama/qwen3.5:9b-32k"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Название (необязательно)</span>
                      <input
                        value={newModel.name || ''}
                        onChange={(e) => setNewModel((m) => ({ ...m, name: e.target.value }))}
                        placeholder="GPT-4o"
                      />
                    </label>
                  </div>
                  <div className="settings-row">
                    <label className="field">
                      <span>API-ключ (для платных)</span>
                      <input
                        type="password"
                        value={newModel.apiKey || ''}
                        onChange={(e) => setNewModel((m) => ({ ...m, apiKey: e.target.value }))}
                        placeholder="sk-…"
                      />
                    </label>
                    <label className="field">
                      <span>Base URL (необязательно)</span>
                      <input
                        value={newModel.baseURL || ''}
                        onChange={(e) => setNewModel((m) => ({ ...m, baseURL: e.target.value }))}
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>
                  </div>
                  <div className="settings-row">
                    <label className="field">
                      <span>Context (токенов)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newModel.context || ''}
                        onChange={(e) => setNewModel((m) => ({ ...m, context: numFmt(e.target.value) }))}
                        placeholder="128000"
                      />
                    </label>
                    <label className="field">
                      <span>Max output (токенов)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newModel.output || ''}
                        onChange={(e) => setNewModel((m) => ({ ...m, output: numFmt(e.target.value) }))}
                        placeholder="16384"
                      />
                    </label>
                  </div>
                  <div className="modal-actions">
                    <button type="submit" className="btn btn-primary">
                      Добавить модель
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {msg && <div className="settings-msg">{msg}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
