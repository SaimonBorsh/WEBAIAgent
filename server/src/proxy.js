import http from 'node:http'
import { INTERNAL_HOST } from './config.js'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host'
])

export function proxyToOpenCode(req, res, project) {
  const prefix = `/api/projects/${project.id}`
  const fullPath = req.originalUrl.startsWith(prefix)
    ? req.originalUrl.slice(prefix.length)
    : req.originalUrl

  const headers = { ...req.headers }
  for (const h of HOP_BY_HOP) delete headers[h]
  headers.host = `${INTERNAL_HOST}:${project.port}`

  const upstream = http.request(
    {
      hostname: INTERNAL_HOST,
      port: project.port,
      path: fullPath,
      method: req.method,
      headers
    },
    (upRes) => {
      const contentType = upRes.headers['content-type'] || 'application/octet-stream'
      const isSSE = String(contentType).includes('text/event-stream')
      const outHeaders = {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      }
      if (upRes.headers['content-encoding']) {
        outHeaders['Content-Encoding'] = upRes.headers['content-encoding']
      }
      if (!isSSE && upRes.headers['content-length']) {
        outHeaders['Content-Length'] = upRes.headers['content-length']
      }
      if (isSSE) {
        res.writeHead(200, outHeaders)
        res.flushHeaders?.()
      } else {
        res.writeHead(upRes.statusCode || 200, outHeaders)
      }
      upRes.pipe(res)
    }
  )

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Не удалось подключиться к серверу opencode: ${err.message}` })
    } else {
      res.end()
    }
  })

  req.on('aborted', () => upstream.destroy())
  req.on('error', () => upstream.destroy())
  req.pipe(upstream)
}