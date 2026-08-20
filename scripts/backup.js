import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const label =
  process.argv[2] || new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const BACKUPS_DIR = path.join(ROOT, 'backups')
const dest = path.join(BACKUPS_DIR, label)

const EXCLUDE = new Set([
  'node_modules',
  'dist',
  'logs',
  '.git',
  'backups',
  '.vite',
  'projects.json',
  'tokens.json',
  'settings.json'
])

fs.mkdirSync(BACKUPS_DIR, { recursive: true })
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'webaia-backup-'))
const stagingSrc = path.join(staging, 'src')
try {
  fs.cpSync(ROOT, stagingSrc, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src)
      return !EXCLUDE.has(name) && !name.endsWith('.log')
    }
  })
  fs.writeFileSync(
    path.join(stagingSrc, 'manifest.json'),
    JSON.stringify({ version: label, createdAt: new Date().toISOString() }, null, 2)
  )
  fs.renameSync(stagingSrc, dest)
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}

console.log('Бэкап создан:', dest)