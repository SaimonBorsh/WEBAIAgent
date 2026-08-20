import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { VERSIONS_DIR, CURRENT_FILE } from './config.js'

export function listVersions() {
  let current = null
  try {
    current = fs.readFileSync(CURRENT_FILE, 'utf8').trim() || null
  } catch {
    current = null
  }
  const versions = []
  try {
    for (const entry of fs.readdirSync(VERSIONS_DIR)) {
      const dir = path.join(VERSIONS_DIR, entry)
      const st = fs.statSync(dir)
      if (!st.isDirectory()) continue
      if (!/^v\d+$/.test(entry)) continue
      const serverBundle = path.join(dir, 'server.bundle.cjs')
      const webDist = path.join(dir, 'web', 'dist')
      let created = null
      let size = 0
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'))
        created = meta.created || null
      } catch {
        /* нет метаданных */
      }
      try {
        size = dirSize(dir)
      } catch {
        /* ignore */
      }
      versions.push({
        name: entry,
        active: current === entry,
        hasServer: fs.existsSync(serverBundle),
        hasWeb: fs.existsSync(path.join(webDist, 'index.html')),
        created,
        size
      })
    }
  } catch {
    /* папка versions не существует (режим разработки) */
  }
  versions.sort((a, b) => {
    const na = parseInt(a.name.slice(1), 10)
    const nb = parseInt(b.name.slice(1), 10)
    return nb - na
  })
  return { current, versions }
}

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else if (entry.isFile()) total += fs.statSync(full).size
  }
  return total
}

export function switchVersion(name) {
  const dir = path.join(VERSIONS_DIR, name)
  if (!/^v\d+$/.test(name) || !fs.existsSync(path.join(dir, 'server.bundle.cjs'))) {
    throw new Error(`Версия ${name} не найдена или неполная`)
  }
  fs.writeFileSync(CURRENT_FILE, name + '\n', 'utf8')
  return { ok: true, name, active: true }
}

export function extractVersionZip(zipPath, name) {
  if (!/^v\d+$/.test(name)) throw new Error('Имя версии должно быть вида v<число> (например v36)')
  const dest = path.join(VERSIONS_DIR, name)
  fs.mkdirSync(VERSIONS_DIR, { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath.replace(/'/g, "''")}', '${dest.replace(/'/g, "''")}')`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  if (r.status !== 0) {
    fs.rmSync(dest, { recursive: true, force: true })
    throw new Error('Не удалось распаковать архив версии')
  }
  const nested = findNestedServerBundle(dest)
  if (nested && !fs.existsSync(path.join(dest, 'server.bundle.cjs'))) {
    fs.cpSync(nested, path.join(dest, 'server.bundle.cjs'))
  }
  if (!fs.existsSync(path.join(dest, 'server.bundle.cjs'))) {
    fs.rmSync(dest, { recursive: true, force: true })
    throw new Error('В архиве нет server.bundle.cjs — это не архив версии WEBAIA')
  }
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ version: name, created: new Date().toISOString() }, null, 2), 'utf8')
  return { ok: true, name }
}

function findNestedServerBundle(dir) {
  try {
    for (const entry of fs.readdirSync(dir, { recursive: true })) {
      const p = path.join(dir, entry)
      if (entry.endsWith('server.bundle.cjs') && fs.statSync(p).isFile()) return p
    }
  } catch {
    /* ignore */
  }
  return null
}

export function setCurrent(name) {
  return switchVersion(name)
}