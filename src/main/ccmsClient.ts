import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import type { CcmsSite } from '../shared/types'
import { CcmsRestError } from '../shared/types'
import { loadSiteWithCreds } from './credentials'

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json'
}

function mimeFromFilename(filename: string): string {
  const ext = extname(filename).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

interface TokenEntry {
  token: string
  expiresAt: number // epoch ms
  scope: string
}

const TOKEN_CACHE: Map<string, TokenEntry> = new Map()
const REFRESH_BUFFER_MS = 30_000

export interface CcmsApi {
  site: CcmsSite
  baseUrl: string
  apiBase: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(path: string, qs?: Record<string, string | number | boolean | undefined>) => Promise<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: <T = any>(path: string, body?: unknown) => Promise<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put: <T = any>(path: string, body?: unknown) => Promise<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  del: <T = any>(path: string, qs?: Record<string, string | number | boolean | undefined>) => Promise<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upload: <T = any>(path: string, filePath: string, fields?: Record<string, unknown>) => Promise<T>
}

export async function withCcmsClient<T>(
  rootPath: string,
  siteRef: string | undefined,
  cb: (api: CcmsApi) => Promise<T>
): Promise<T> {
  const { site, clientSecret } = await loadSiteWithCreds(rootPath, siteRef)
  const api = await buildApi(site, clientSecret)
  return cb(api)
}

export function clearTokenCache(siteId?: string): void {
  if (siteId) TOKEN_CACHE.delete(siteId)
  else TOKEN_CACHE.clear()
}

async function fetchToken(site: CcmsSite, clientSecret: string): Promise<TokenEntry> {
  const baseUrl = site.baseUrl.replace(/\/+$/, '')
  const tokenUrl = `${baseUrl}/oauth/2.0/token`
  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', site.clientId)
  body.set('client_secret', clientSecret)
  if (site.scopes.length > 0) body.set('scope', site.scopes.join(' '))

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'rose-concretecms/1.0'
    },
    body: body.toString()
  })
  const text = await res.text()
  let parsed: Record<string, unknown> | null = null
  if (text) {
    try { parsed = JSON.parse(text) as Record<string, unknown> } catch { /* not JSON */ }
  }
  if (!res.ok) {
    const code = (parsed?.error as string | undefined) ?? `http_${res.status}`
    const message = (parsed?.error_description as string | undefined) ?? `${res.status} ${res.statusText}`
    if (res.status === 401 || code === 'invalid_client') {
      throw new CcmsRestError('invalid_client', 'Invalid client credentials.', res.status, 'POST', '/oauth/2.0/token')
    }
    throw new CcmsRestError(code, message, res.status, 'POST', '/oauth/2.0/token')
  }
  const accessToken = parsed?.access_token as string | undefined
  if (!accessToken) {
    throw new CcmsRestError('no_access_token', 'Token endpoint returned no access_token.', res.status, 'POST', '/oauth/2.0/token')
  }
  const expiresIn = (parsed?.expires_in as number | undefined) ?? 3600
  const scope = (parsed?.scope as string | undefined) ?? site.scopes.join(' ')
  return {
    token: accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope
  }
}

export async function getToken(site: CcmsSite, clientSecret: string): Promise<TokenEntry> {
  const cached = TOKEN_CACHE.get(site.id)
  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    return cached
  }
  const fresh = await fetchToken(site, clientSecret)
  TOKEN_CACHE.set(site.id, fresh)
  return fresh
}

export async function buildApi(site: CcmsSite, clientSecret: string): Promise<CcmsApi> {
  const baseUrl = site.baseUrl.replace(/\/+$/, '')
  const apiBase = `${baseUrl}/api/v1`

  async function authHeader(): Promise<string> {
    const t = await getToken(site, clientSecret)
    return `Bearer ${t.token}`
  }

  async function request<T>(
    method: string,
    path: string,
    opts?: { qs?: Record<string, string | number | boolean | undefined>; body?: unknown }
  ): Promise<T> {
    const url = new URL(`${apiBase}${path}`)
    if (opts?.qs) {
      for (const [k, v] of Object.entries(opts.qs)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
      }
    }
    const headers: Record<string, string> = {
      Authorization: await authHeader(),
      'User-Agent': 'rose-concretecms/1.0',
      Accept: 'application/json'
    }
    if (opts?.body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined
    })
    return parseResponse<T>(res, method, path)
  }

  async function upload<T>(path: string, filePath: string, fields?: Record<string, unknown>): Promise<T> {
    const buf = await readFile(filePath)
    const filename = basename(filePath)
    const contentType = mimeFromFilename(filename)
    const form = new FormData()
    const blob = new Blob([buf], { type: contentType })
    form.append('file', blob, filename)
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) form.append(k, String(v))
      }
    }
    const headers: Record<string, string> = {
      Authorization: await authHeader(),
      'User-Agent': 'rose-concretecms/1.0',
      Accept: 'application/json'
    }
    const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers, body: form })
    return parseResponse<T>(res, 'POST', path)
  }

  return {
    site,
    baseUrl,
    apiBase,
    get: (path, qs) => request('GET', path, { qs }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    del: (path, qs) => request('DELETE', path, { qs }),
    upload
  }
}

async function parseResponse<T>(res: Response, method: string, path: string): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try { body = JSON.parse(text) } catch { /* not JSON */ }
  }
  if (!res.ok) {
    const errBody = body as { error?: string; error_description?: string; message?: string; code?: string } | null
    const code = errBody?.error ?? errBody?.code ?? `http_${res.status}`
    let message = errBody?.error_description ?? errBody?.message ?? `${res.status} ${res.statusText}`
    if (res.status === 403 && code === 'insufficient_scope') {
      message = `Insufficient scope. ${message}`
    }
    throw new CcmsRestError(code, message, res.status, method, path)
  }
  return body as T
}
