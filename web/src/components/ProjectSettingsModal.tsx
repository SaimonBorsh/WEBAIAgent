import { useState } from 'react'
import type { FreeModel, Project, SessionConfig } from '../types'
import { api } from '../api'
import ModelSelect from './ModelSelect'
import IconPicker, { type IconTone } from './IconPicker'
import { toast } from '../toast'
import { useEscape } from '../useEscape'

interface Props {
  project: Project
  models: FreeModel[]
  onDone: () => void
  onClose: () => void
}

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

export default function ProjectSettingsModal({ project, models, onDone, onClose }: Props) {
  useEscape(onClose)
  const defaults = project.defaults || {}
  const [model, setModel] = useState(project.defaultModel?.split('/')[1] || models[0]?.id || 'deepseek-v4-flash-free')
  const [agent, setAgent] = useState(project.defaultAgent || 'build')
  const [autoStart, setAutoStart] = useState(Boolean(project.autoStart))
  const [temperature, setTemperature] = useState(defaults.temperature?.toString() ?? '')
  const [topP, setTopP] = useState(defaults.topP?.toString() ?? '')
  const [maxTokens, setMaxTokens] = useState(defaults.maxTokens?.toString() ?? '')
  const [system, setSystem] = useState(defaults.system || '')
  const [icon, setIcon] = useState(project.icon || '')
  const [iconTone, setIconTone] = useState<IconTone>(project.iconTone || 'auto')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: FieldErrors = {
      temperature: validateField(temperature, 0, 2, 'Temperature'),
      topP: validateField(topP, 0, 1, 'Top P'),
      maxTokens: validateField(maxTokens, 1, 1000000, 'Max tokens')
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    const defs: Record<string, unknown> = {}
    const t = num(temperature)
    if (t !== undefined) defs.temperature = Math.min(2, Math.max(0, t))
    const p = num(topP)
    if (p !== undefined) defs.topP = Math.min(1, Math.max(0, p))
    const m = num(maxTokens)
    if (m !== undefined && m > 0) defs.maxTokens = Math.round(m)
    if (system.trim()) defs.system = system.trim()

    setBusy(true)
    setError('')
    try {
      await api.updateProject(project.id, {
        defaultModel: model.includes('/') ? model : `opencode/${model}`,
        defaultAgent: agent,
        autoStart,
        defaults: defs as SessionConfig,
        icon: icon || undefined,
        iconTone
      })
      onDone()
      toast('Настройки проекта сохранены', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-settings" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Настройки проекта</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {project.path}
        </p>

        <div className="settings-row">
          <label className="field">
            <span>Модель по умолчанию</span>
            <ModelSelect models={models} value={model} onChange={setModel} />
          </label>
          <label className="field">
            <span>Агент по умолчанию</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="build">build — выполнение задач</option>
              <option value="plan">plan — планирование без изменений</option>
            </select>
          </label>
        </div>

        <div className="settings-row">
          <label className="field">
            <span>Temperature по умолч. (0–2)</span>
            <input
              type="text"
              inputMode="decimal"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="по умолчанию"
            />
            {errors.temperature && <span className="field-error">{errors.temperature}</span>}
          </label>
          <label className="field">
            <span>Top P по умолч. (0–1)</span>
            <input
              type="text"
              inputMode="decimal"
              value={topP}
              onChange={(e) => setTopP(e.target.value)}
              placeholder="по умолчанию"
            />
            {errors.topP && <span className="field-error">{errors.topP}</span>}
          </label>
          <label className="field">
            <span>Max tokens по умолч.</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="по умолчанию"
            />
            {errors.maxTokens && <span className="field-error">{errors.maxTokens}</span>}
          </label>
        </div>

        <label className="field">
          <span>Системный промпт проекта (для новых сессий)</span>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="Глобальные инструкции для сессий этого проекта…"
            rows={3}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
          <span>Автоматически запускать сервер проекта при старте менеджера</span>
        </label>

        <div className="settings-divider" />

        <span className="field-label">Значок проекта</span>
        <IconPicker glyph={icon} tone={iconTone} onGlyph={setIcon} onTone={setIconTone} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}