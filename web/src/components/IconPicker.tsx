import { PROJECT_GLYPHS } from './ProjectIcon'

export type IconTone = 'auto' | 'user' | 'system'

interface Props {
  glyph: string
  tone: IconTone
  onGlyph: (g: string) => void
  onTone: (t: IconTone) => void
}

const TONES: { value: IconTone; label: string; hint: string }[] = [
  { value: 'auto', label: 'Авто', hint: 'по пути: системные — красные' },
  { value: 'user', label: 'Пользовательская', hint: 'зелёная плитка' },
  { value: 'system', label: 'Системная', hint: 'красная плитка' }
]

export default function IconPicker({ glyph, tone, onGlyph, onTone }: Props) {
  return (
    <div className="icon-picker">
      <div className="icon-picker-row">
        {PROJECT_GLYPHS.map((g) => (
          <button
            key={g}
            type="button"
            className={`icon-option ${glyph === g ? 'selected' : ''}`}
            onClick={() => onGlyph(g)}
            aria-label={`Значок ${g}`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="icon-tone-row">
        {TONES.map((t) => (
          <label key={t.value} className={`tone-option tone-${t.value} ${tone === t.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="icon-tone"
              checked={tone === t.value}
              onChange={() => onTone(t.value)}
            />
            <span className="tone-swatch" />
            <span className="tone-label">{t.label}</span>
          </label>
        ))}
      </div>
      <p className="field-hint">Цвет по умолчанию: пользовательские папки — зелёные, системные (корень диска, Windows, Program Files и т.п.) — красные.</p>
    </div>
  )
}