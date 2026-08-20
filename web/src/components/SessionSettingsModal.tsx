import { useState } from 'react'
import type { FreeModel, SessionConfig } from '../types'
import ModelSelect from './ModelSelect'
import { useEscape } from '../useEscape'

interface Props {
  mode: 'new' | 'edit'
  models: FreeModel[]
  defaultName: string
  initialConfig: SessionConfig
  onSave: (data: { title?: string; config: SessionConfig }) => void
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

export default function SessionSettingsModal({
  mode,
  models,
  defaultName,
  initialConfig,
  onSave,
  onClose
}: Props) {
  useEscape(onClose)
  const [title, setTitle] = useState(mode === 'edit' ? defaultName : '')
  const [model, setModel] = useState(initialConfig.model?.split('/')[1] || models[0]?.id || 'deepseek-v4-flash-free')
  const [agent, setAgent] = useState(initialConfig.agent || 'build')
  const [temperature, setTemperature] = useState(initialConfig.temperature?.toString() ?? '')
  const [topP, setTopP] = useState(initialConfig.topP?.toString() ?? '')
  const [maxTokens, setMaxTokens] = useState(initialConfig.maxTokens?.toString() ?? '')
  const [system, setSystem] = useState(initialConfig.system || '')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: FieldErrors = {
      temperature: validateField(temperature, 0, 2, 'Temperature'),
      topP: validateField(topP, 0, 1, 'Top P'),
      maxTokens: validateField(maxTokens, 1, 1000000, 'Max tokens')
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    const config: SessionConfig = {
      model: model.includes('/') ? model : `opencode/${model}`
    }
    if (agent) config.agent = agent
    const t = num(temperature)
    if (t !== undefined) config.temperature = Math.min(2, Math.max(0, t))
    const p = num(topP)
    if (p !== undefined) config.topP = Math.min(1, Math.max(0, p))
    const m = num(maxTokens)
    if (m !== undefined && m > 0) config.maxTokens = Math.round(m)
    if (system.trim()) config.system = system.trim()
    onSave({ title: mode === 'edit' ? title : title.trim() || undefined, config })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-settings" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'new' ? 'Новая сессия' : 'Настройки сессии'}</h2>

        <label className="field">
          <span>Название сессии</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              mode === 'new' ? 'Оставьте пустым — название сформируется из первого запроса' : 'Название сессии'
            }
          />
        </label>

        <label className="field">
          <span>Модель</span>
          <ModelSelect models={models} value={model} onChange={setModel} />
        </label>

        <label className="field">
          <span>Агент</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="build">build — выполнение задач</option>
            <option value="plan">plan — планирование без изменений</option>
          </select>
        </label>

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
            {errors.temperature && <span className="field-error">{errors.temperature}</span>}
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
            {errors.topP && <span className="field-error">{errors.topP}</span>}
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
            {errors.maxTokens && <span className="field-error">{errors.maxTokens}</span>}
          </label>
        </div>

        <label className="field">
          <span>Системный промпт (дополнительно)</span>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="Системные инструкции для этой сессии…"
            rows={3}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            {mode === 'new' ? 'Создать сессию' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}