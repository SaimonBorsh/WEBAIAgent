import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX_ENTRIES = 500

function listDrives() {
  const drives = []
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c)
    const root = `${letter}:\\`
    try {
      if (fs.existsSync(root)) drives.push({ name: root, path: root, type: 'dir' })
    } catch {
      /* ignore */
    }
  }
  return drives
}

export function listDir(dir) {
  if (!dir || dir === '.') {
    return {
      current: null,
      parent: null,
      entries: [
        ...listDrives(),
        { name: '🏠 Домой', path: os.homedir(), type: 'dir' }
      ]
    }
  }

  const resolved = path.resolve(dir)
  let readdir
  try {
    readdir = fs.readdirSync(resolved, { withFileTypes: true })
  } catch (err) {
    return { error: err.message }
  }

  const entries = []
  for (const ent of readdir) {
    if (entries.length >= MAX_ENTRIES) break
    try {
      const full = path.join(resolved, ent.name)
      if (ent.isDirectory()) {
        entries.push({ name: ent.name, path: full, type: 'dir' })
      } else if (ent.isFile()) {
        const stat = fs.statSync(full)
        entries.push({ name: ent.name, path: full, type: 'file', size: stat.size })
      }
    } catch {
      /* ignore */
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'ru')
  })

  const parentDir = path.dirname(resolved)
  return {
    current: { name: path.basename(resolved) || resolved, path: resolved },
    parent: parentDir === resolved ? null : parentDir,
    entries
  }
}