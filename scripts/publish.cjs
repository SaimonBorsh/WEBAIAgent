#!/usr/bin/env node
/*
 * publish.cjs — сборка переносимого дистрибутива WEBAIAgent
 *
 * Использование:
 *   node scripts/publish.cjs [версия] [--out <dir>] [--skip-build] [--skip-node] [--release]
 *
 * Версия по умолчанию: следующая после последней в versions/ или backups/.
 * Собирает web, бандлит сервер и keepalive (esbuild, ESM .mjs),
 * раскладывает по макету WEBAIA/, обновляет current.txt и упаковывает zip.
 *
 * Дополнительно собирает WEBAIA-<version>-update.zip (только содержимое версии:
 * server.bundle.cjs + web/dist + version.json) — лёгкий архив для обновления через UI.
 * Флаг --release публикует оба zip в GitHub Releases (требует gh + права).
 */
const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const zlib = require('node:zlib')

const REPO = path.resolve(__dirname, '..')
const OUT_DIR = process.env.WEBAIA_PUBLISH_DIR || path.join(REPO, 'publish')
const WEBAIA = path.join(OUT_DIR, 'WEBAIA')
const VERSIONS = path.join(WEBAIA, 'versions')
const BIN = path.join(WEBAIA, 'bin')
const NODE_DIR = path.join(WEBAIA, 'node')
const DATA = path.join(WEBAIA, 'data')
const CURRENT_FILE = path.join(WEBAIA, 'current.txt')
const CACHE = path.join(OUT_DIR, '.cache')

const OPENCODE_SRC =
  process.env.WEBAIA_OPENCODE ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')

const NODE_VERSION = 'v24.18.0'
const NODE_ZIP = process.env.WEBAIA_NODE_ZIP || path.join(CACHE, `node-${NODE_VERSION}-win-x64.zip`)
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const versionArg = args.find((a) => !a.startsWith('--'))
const skipBuild = args.includes('--skip-build')
const skipNode = args.includes('--skip-node')
const doRelease = args.includes('--release')

function nextVersion() {
  const dirs = []
  for (const base of [VERSIONS, path.join(REPO, 'backups')]) {
    try {
      for (const d of fs.readdirSync(base)) {
        const m = /^v(\d+)$/.exec(d)
        if (m) dirs.push(Number(m[1]))
      }
    } catch {}
  }
  const max = dirs.length ? Math.max(...dirs) : 34
  return `v${max + 1}`
}

const version = versionArg || nextVersion()

function sh(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copy(src, dest) {
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
}

function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) {
    log('node', `кэш найден: ${dest}`)
    return
  }
  ensureDir(path.dirname(dest))
  log('node', `скачивание ${url}`)
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          download(res.headers.location, dest).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} для ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
      })
      .on('error', (e) => {
        fs.rmSync(dest, { force: true })
        reject(e)
      })
  })
}

function unzip(zipFile, destDir) {
  ensureDir(destDir)
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipFile}', '${destDir}')`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit', encoding: 'utf8' })
  if (r.status !== 0) throw new Error('не удалось распаковать zip')
}

function findNodeHome(extractedDir) {
  const sub = fs
    .readdirSync(extractedDir)
    .find((d) => d.startsWith('node-') && d.endsWith('-win-x64'))
  return sub ? path.join(extractedDir, sub) : extractedDir
}

function zipDir(srcDir, zipPath) {
  log('zip', `упаковка ${srcDir} -> ${zipPath}`)
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${srcDir}', '${zipPath}', [System.IO.Compression.CompressionLevel]::Optimal, $true)`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit', encoding: 'utf8' })
  if (r.status !== 0) throw new Error('не удалось создать zip')
}

function bundle(entry, outFile) {
  log('bundle', `${entry} -> ${outFile}`)
  const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'))
  ensureDir(path.dirname(outFile))
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: outFile,
    banner: { js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': '__importMetaUrl' }
  })
  if (result.errors.length) {
    console.error(result.errors)
    throw new Error('esbuild завершился с ошибкой')
  }
}

function writeLaunchers() {
  log('launchers', 'создание start.cmd / stop.cmd / versions.cmd / backup.cmd')
  const startCmd = `@echo off
setlocal
cd /d "%~dp0"
if exist "node\\node.exe" ( set "PATH=%~dp0node;%PATH%" )
set WEBAIA_NO_BROWSER=1
if not exist "keepalive.bundle.cjs" (
  echo [WEBAIA] keepalive.bundle.cjs не найден. Проверьте папку установки.
  pause
  exit /b 1
)
echo [WEBAIA] Запуск менеджера (порт 3720, веб: http://127.0.0.1:3720)...
start "WEBAIA Manager" /min "%~dp0node\\node.exe" "%~dp0keepalive.bundle.cjs"
echo [WEBAIA] Менеджер запущен в фоне. Для остановки: stop.cmd
timeout /t 3 >nul
`
  const stopCmd = `@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
if exist "keepalive.pid" (
  set /p PID=<keepalive.pid
  taskkill /PID !PID! /T /F >nul 2>&1
  del keepalive.pid >nul 2>&1
)
echo [WEBAIA] Остановлено.
timeout /t 2 >nul
`
  const versionsCmd = `@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo [WEBAIA] Доступные версии:
if not exist "current.txt" ( echo   (нет активной версии) ) else (
  set /p CUR=<current.txt
  echo   Текущая: !CUR!
)
echo.
echo   Установленные:
for /d %%d in ("%~dp0versions\\v*") do (
  set "NAME=%%~nxd"
  set "CUR="
  if exist "current.txt" set /p CUR=<current.txt
  if "!NAME!"=="!CUR!" ( echo   * !NAME!  (активна) ) else ( echo     !NAME! )
)
echo.
echo [WEBAIA] Переключение версии: поместите новый архив в versions\\ (например versions\\v36) и обновите current.txt.
pause
`
  const backupCmd = `@echo off
setlocal
cd /d "%~dp0"
set "STAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "STAMP=%STAMP: =0%"
set "DST=%~dp0backup_%STAMP%"
mkdir "%DST%" >nul 2>&1
xcopy "%~dp0data" "%DST%\\data\\" /E /I /Y >nul
echo [WEBAIA] Резервная копия данных: %DST%
pause
`
  for (const [name, content] of [
    ['start.cmd', startCmd],
    ['stop.cmd', stopCmd],
    ['versions.cmd', versionsCmd],
    ['backup.cmd', backupCmd]
  ]) {
    fs.writeFileSync(path.join(WEBAIA, name), content, 'utf8')
  }
}

async function main() {
  log('publish', `версия: ${version}`)
  log('publish', `выходная папка: ${WEBAIA}`)
  ensureDir(WEBAIA)
  ensureDir(VERSIONS)
  ensureDir(BIN)
  ensureDir(DATA)
  ensureDir(CACHE)

  const verDir = path.join(VERSIONS, version)

  if (!skipBuild) {
    log('build', 'сборка фронтенда (web)')
    sh('npm run build', { cwd: REPO })
  }

  log('assets', 'копирование web/dist')
  const distSrc = path.join(REPO, 'web', 'dist')
  if (!fs.existsSync(distSrc)) throw new Error(`нет ${distSrc} — сначала соберите фронтенд`)
  const distDst = path.join(verDir, 'web', 'dist')
  fs.rmSync(distDst, { recursive: true, force: true })
  ensureDir(path.dirname(distDst))
  fs.cpSync(distSrc, distDst, { recursive: true })

  bundle(path.join(REPO, 'server', 'src', 'index.js'), path.join(verDir, 'server.bundle.cjs'))
  bundle(path.join(REPO, 'scripts', 'keepalive.js'), path.join(WEBAIA, 'keepalive.bundle.cjs'))

  log('opencode', 'копирование opencode.exe')
  if (!fs.existsSync(OPENCODE_SRC)) throw new Error(`нет opencode.exe: ${OPENCODE_SRC}`)
  copy(OPENCODE_SRC, path.join(BIN, 'opencode.exe'))

  if (!skipNode) {
    log('node', `portable Node.js ${NODE_VERSION}`)
    if (!fs.existsSync(NODE_ZIP)) {
      await download(NODE_URL, NODE_ZIP)
    }
    const extracted = path.join(CACHE, `node-${NODE_VERSION}`)
    if (!fs.existsSync(path.join(extracted, 'node.exe'))) {
      fs.rmSync(extracted, { recursive: true, force: true })
      unzip(NODE_ZIP, extracted)
    }
    const nodeHome = findNodeHome(extracted)
    fs.rmSync(NODE_DIR, { recursive: true, force: true })
    fs.cpSync(nodeHome, NODE_DIR, { recursive: true })
    log('node', `node размещён в ${NODE_DIR}`)
  }

  fs.writeFileSync(CURRENT_FILE, version + '\n', 'utf8')
  log('current.txt', `активная версия: ${version}`)

  const versionMeta = {
    version,
    created: new Date().toISOString(),
    server: 'server.bundle.cjs',
    web: 'web/dist'
  }
  fs.writeFileSync(path.join(verDir, 'version.json'), JSON.stringify(versionMeta, null, 2), 'utf8')

  writeLaunchers()

  const zipPath = path.join(OUT_DIR, `WEBAIA-${version}.zip`)
  zipDir(WEBAIA, zipPath)

  log('publish', 'сборка лёгкого архива обновления (только версия)')
  const updateZipPath = path.join(OUT_DIR, `WEBAIA-${version}-update.zip`)
  zipDir(verDir, updateZipPath)

  if (doRelease) {
    log('release', `публикация GitHub Releases: ${version}`)
    const gh = process.env.WEBAIA_GH || 'gh'
    const args = [
      'release', 'create', version,
      zipPath, updateZipPath,
      '--title', `WEBAIA ${version}`,
      '--notes', `Релиз WEBAIA ${version}`
    ]
    console.log(`> ${gh} ${args.join(' ')}`)
    const r = spawnSync(gh, args, { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`gh release create завершился с кодом ${r.status}`)
  }

  log('publish', `ГОТОВО: ${zipPath}`)
  log('publish', `ОБНОВЛЕНИЕ: ${updateZipPath}`)
  console.log('Установка: распаковать zip в любую папку, запустить start.cmd')
}

main().catch((e) => {
  console.error('\n[ERROR]', e.message)
  process.exit(1)
})