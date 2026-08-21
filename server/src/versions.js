import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { VERSIONS_DIR, CURRENT_FILE, GH_REPO, GH_TOKEN } from './config.js'

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
      if (!/^v\d+(\.\d+)*$/.test(entry)) continue
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
  if (!/^v\d+(\.\d+)*$/.test(name) || !fs.existsSync(path.join(dir, 'server.bundle.cjs'))) {
    throw new Error(`Версия ${name} не найдена или неполная`)
  }
  fs.writeFileSync(CURRENT_FILE, name + '\n', 'utf8')
  return { ok: true, name, active: true }
}

export function extractVersionZip(zipPath, name) {
  if (!/^v\d+(\.\d+)*$/.test(name)) throw new Error('Имя версии должно быть вида v<число> (например v36)')
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
  normalizeNestedExtract(dest, name)
  if (!fs.existsSync(path.join(dest, 'server.bundle.cjs'))) {
    fs.rmSync(dest, { recursive: true, force: true })
    throw new Error('В архиве нет server.bundle.cjs — это не архив версии WEBAIA')
  }
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ version: name, created: new Date().toISOString() }, null, 2), 'utf8')
  return { ok: true, name }
}

function normalizeNestedExtract(dest, name) {
  const entries = (() => { try { return fs.readdirSync(dest) } catch { return [] } })()
  if (entries.length === 1) {
    const onlyDir = path.join(dest, entries[0])
    if (fs.statSync(onlyDir).isDirectory()) {
      const inner = (() => { try { return fs.readdirSync(onlyDir) } catch { return [] } })()
      if (inner.some((e) => e === 'server.bundle.cjs' || e === 'web' || e === 'version.json')) {
        for (const e of inner) {
          const src = path.join(onlyDir, e)
          const dst = path.join(dest, e)
          fs.cpSync(src, dst, { recursive: true })
        }
        fs.rmSync(onlyDir, { recursive: true, force: true })
      }
    }
  }
}

export function setCurrent(name) {
  return switchVersion(name)
}

function parseVersionNumber(name) {
  const m = /^v(\d+(?:\.\d+)*)$/.exec(String(name || ''))
  if (!m) return NaN
  const parts = m[1].split('.').map(Number)
  while (parts.length < 3) parts.push(0)
  return parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
}

async function ghApi(pathname) {
  const url = `https://api.github.com${pathname}`
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'webaia-manager' }
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
  return res.json()
}

function ghRepo() {
  return GH_REPO.replace(/\s/g, '')
}

export async function checkGithubUpdate() {
  let data
  try {
    data = await ghApi(`/repos/${ghRepo()}/releases/latest`)
  } catch (e) {
    const is404 = /404/.test(e.message)
    if (is404) {
      try {
        const releases = await ghApi(`/repos/${ghRepo()}/releases?per_page=1`)
        if (Array.isArray(releases) && releases.length > 0) {
          data = releases[0]
        } else if (Array.isArray(releases) && releases.length === 0) {
          return {
            available: false,
            noReleases: true,
            current: readCurrent(),
            latest: null,
            name: '',
            published: null,
            body: '',
            downloadUrl: null,
            fullZipUrl: null,
            updateSize: 0
          }
        }
      } catch {
        /* fallback тоже не удался — пробрасываем оригинальную ошибку */
      }
    }
    if (!data) throw e
  }
  const tag = String(data.tag_name || '')
  if (!/^v\d+(\.\d+)*$/.test(tag)) {
    throw new Error(`Релиз «${tag}» имеет неверный номер (ожидается вида v36)`)
  }
  const updateAsset = (data.assets || []).find((a) => /-update\.zip$/.test(a.name))
  const fullAsset = (data.assets || []).find((a) => /\.zip$/.test(a.name) && !/-update\.zip$/.test(a.name))
  const current = readCurrent()
  const currentNum = parseVersionNumber(current)
  const latestNum = parseVersionNumber(tag)
  return {
    available: Number.isFinite(currentNum) && Number.isFinite(latestNum) && latestNum > currentNum,
    noReleases: false,
    current,
    latest: tag,
    name: data.name || tag,
    published: data.published_at || null,
    body: data.body || '',
    downloadUrl: updateAsset?.browser_download_url || null,
    fullZipUrl: fullAsset?.browser_download_url || null,
    updateSize: updateAsset?.size || 0
  }
}

function readCurrent() {
  try {
    return fs.readFileSync(CURRENT_FILE, 'utf8').trim() || null
  } catch {
    return null
  }
}

export async function downloadUpdateZip(version) {
  const info = await ghApi(`/repos/${ghRepo()}/releases/latest`)
  const asset = (info.assets || []).find((a) => /-update\.zip$/.test(a.name))
  if (!asset?.browser_download_url) throw new Error('В последнем релизе нет архива обновления (*-update.zip)')
  const res = await fetch(asset.browser_download_url, {
    headers: GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}`, 'User-Agent': 'webaia-manager' } : { 'User-Agent': 'webaia-manager' }
  })
  if (!res.ok) throw new Error(`Скачивание релиза: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const tmp = path.join(os.tmpdir(), `webaia-update-${Date.now()}.zip`)
  fs.writeFileSync(tmp, buf)
  try {
    return extractVersionZip(tmp, version)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}