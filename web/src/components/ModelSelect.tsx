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

function displayName(m: FreeModel): string {
  return m.source === 'custom' ? m.name : m.name
}

export default function ModelSelect({ models, value, onChange, disabled }: Props) {
  const free = models.filter((m) => m.source !== 'custom')
  const custom = models.filter((m) => m.source === 'custom')
  const options = (group: FreeModel[], label: string) => (
    <optgroup key={label} label={label}>
      {group.map((m) => (
        <option key={m.id} value={m.id}>
          {displayName(m)}
          {m.context ? ` · ctx ${fmt(m.context)}` : ''}
        </option>
      ))}
    </optgroup>
  )
  return (
    <select
      className="model-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title="Модель: бесплатные модели opencode или пользовательские"
    >
      {custom.length > 0 && options(custom, 'Свои модели')}
      {options(free, 'Бесплатные (opencode)')}
    </select>
  )
}