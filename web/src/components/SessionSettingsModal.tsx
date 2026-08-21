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
  const [model, setModel] = useState(initialConfig.model || 'opencode/deepseek-v4-flash-free')
  const [agent, setAgent] = useState(initialConfig.agent || 'build')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const config: SessionConfig = {
      model: model.includes('/') ? model : `opencode/${model}`
    }
    if (agent) config.agent = agent
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
