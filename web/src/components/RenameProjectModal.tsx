import { useState } from 'react'
import { useEscape } from '../useEscape'

interface Props {
  initialName: string
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

export default function RenameProjectModal({ initialName, onSave, onClose }: Props) {
  useEscape(onClose)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Укажите название проекта.')
      return
    }
    setBusy(true)
    try {
      await onSave(name.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Переименовать проект</h2>

        <label className="field">
          <span>Название проекта</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

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