import type { Project } from '../types'

const SYSTEM_ROOTS = [
  'windows',
  'program files (x86)',
  'program files',
  'programdata',
  'recovery',
  'system volume information',
  '$recycle.bin',
  'perflogs',
  'windows.old'
]

export function isSystemPath(p: string): boolean {
  if (!p) return false
  const norm = p.toLowerCase().replace(/[\\/]+/g, '\\').replace(/\\$/, '')
  if (/^[a-z]:$/.test(norm)) return true
  const parts = norm.split('\\')
  if (parts.length === 1) return true
  if (parts.length === 2 && parts[1]) return true
  const firstDir = parts[1]?.toLowerCase() || ''
  if (SYSTEM_ROOTS.includes(firstDir)) return true
  return false
}

export function resolveTone(project: Pick<Project, 'iconTone' | 'path'>): 'user' | 'system' | 'auto' {
  if (project.iconTone === 'user' || project.iconTone === 'system') return project.iconTone
  return isSystemPath(project.path) ? 'system' : 'user'
}

export const PROJECT_GLYPHS = ['📁', '📂', '🗂', '📦', '🚀', '🛠', '⚙', '🔒', '📝', '🧪', '💾', '📚', '🗄', '🖥', '🧰', '📄']

export default function ProjectIcon({
  project,
  size = 'md'
}: {
  project: Pick<Project, 'name' | 'icon' | 'iconTone' | 'path'>
  size?: 'sm' | 'md' | 'lg'
}) {
  const tone = resolveTone(project)
  const glyph = project.icon || project.name.charAt(0).toUpperCase() || '▣'
  return (
    <span className={`project-icon tone-${tone} size-${size}`} aria-hidden>
      {glyph}
    </span>
  )
}