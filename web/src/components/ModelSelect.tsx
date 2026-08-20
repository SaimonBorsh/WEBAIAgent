import type { FreeModel } from '../types'

interface Props {
  models: FreeModel[]
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
}

function fmt(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

export default function ModelSelect({ models, value, onChange, disabled }: Props) {
  return (
    <select
      className="model-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title="Модель по умолчанию (бесплатные модели opencode)"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.context ? ` · ctx ${fmt(m.context)}` : ''}
        </option>
      ))}
    </select>
  )
}