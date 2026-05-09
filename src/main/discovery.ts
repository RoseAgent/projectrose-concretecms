import { buildApi, clearTokenCache } from './ccmsClient'
import { readSitesAndCreds, writeSites } from './credentials'
import type {
  CcmsSite, CcmsDiscovery, CcmsDiscoveredPageType, CcmsDiscoveredPageTemplate,
  CcmsDiscoveredTopicTree, CcmsDiscoveredAttributeKey, CcmsDiscoveredIdentity,
  CcmsAttributeCategory, TestConnectionResult
} from '../shared/types'
import { CcmsRestError } from '../shared/types'

export interface SiteCandidate {
  baseUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
}

export async function probeAndDiscover(candidate: SiteCandidate): Promise<TestConnectionResult & { discovery?: CcmsDiscovery }> {
  const baseUrl = candidate.baseUrl.replace(/\/+$/, '')

  if (!/^https?:\/\//.test(baseUrl)) {
    return { ok: false, error: 'Base URL must start with http:// or https://.' }
  }
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return { ok: false, error: 'HTTP is only allowed for localhost. Use HTTPS for remote sites.' }
    }
  } catch {
    return { ok: false, error: 'Base URL is not a valid URL.' }
  }

  // Use a transient site id so the token cache entry doesn't pollute real sites.
  const fakeSite: CcmsSite = {
    id: `_probe_${Date.now()}`,
    name: '_probe_',
    baseUrl,
    clientId: candidate.clientId,
    scopes: candidate.scopes
  }

  let api: ReturnType<typeof buildApi> extends Promise<infer R> ? R : never
  try {
    api = await buildApi(fakeSite, candidate.clientSecret)
  } catch (err) {
    if (err instanceof CcmsRestError) {
      if (err.status === 401) return { ok: false, error: 'Invalid client credentials.' }
      return { ok: false, error: err.formatForAgent() }
    }
    return { ok: false, error: `Token grant failed: ${(err as Error).message}` }
  }

  const scopeWarnings: string[] = []
  let identity: CcmsDiscoveredIdentity | null = null
  let pageTypes: CcmsDiscoveredPageType[] = []
  let pageTemplates: CcmsDiscoveredPageTemplate[] = []
  let topicTrees: CcmsDiscoveredTopicTree[] = []
  const attributeKeys: CcmsDiscoveredAttributeKey[] = []

  // 1) System info — required to confirm the host is reachable.
  try {
    const info = await api.get<{ name?: string; version?: string; locale?: string }>('/system/info')
    identity = { id: 0, name: info?.name ?? baseUrl, type: 'integration' }
  } catch (err) {
    if (err instanceof CcmsRestError) {
      if (err.status === 404) {
        clearTokenCache(fakeSite.id)
        return { ok: false, error: 'Concrete CMS REST API not reachable at /api/v1/system/info. Check the base URL and that v9 REST is enabled.' }
      }
      if (err.status === 403) {
        scopeWarnings.push('system_info')
      } else {
        clearTokenCache(fakeSite.id)
        return { ok: false, error: err.formatForAgent() }
      }
    } else {
      clearTokenCache(fakeSite.id)
      return { ok: false, error: `Could not reach the site: ${(err as Error).message}` }
    }
  }

  // 2) Best-effort optional probes. A 403 here means a missing scope, not a fatal error.
  pageTypes = await tryDiscover(api, '/system/page_types', 'page_read', scopeWarnings,
    (raw) => normalizeHandleNameList<CcmsDiscoveredPageType>(raw))

  pageTemplates = await tryDiscover(api, '/system/page_templates', 'page_read', scopeWarnings,
    (raw) => normalizeHandleNameList<CcmsDiscoveredPageTemplate>(raw))

  topicTrees = await tryDiscover(api, '/topics/trees', 'topic_read', scopeWarnings,
    (raw) => normalizeIdNameList<CcmsDiscoveredTopicTree>(raw))

  for (const category of ['collection', 'user', 'file'] as CcmsAttributeCategory[]) {
    const keys = await tryDiscover(api, `/system/attribute_keys`, scopeForCategory(category), scopeWarnings,
      (raw) => normalizeAttributeKeys(raw, category), { category })
    for (const k of keys) attributeKeys.push(k)
  }

  // Drop the probe token from the cache so it doesn't leak into a long-lived map.
  clearTokenCache(fakeSite.id)

  return {
    ok: true,
    identity,
    pageTypeCount: pageTypes.length,
    pageTemplateCount: pageTemplates.length,
    attributeKeyCount: attributeKeys.length,
    topicTreeCount: topicTrees.length,
    scopeWarnings,
    discovery: {
      fetchedAt: Date.now(),
      identity,
      grantedScopes: candidate.scopes.filter(s => !scopeWarnings.includes(s)),
      pageTypes,
      pageTemplates,
      topicTrees,
      attributeKeys
    }
  }
}

function scopeForCategory(category: CcmsAttributeCategory): string {
  if (category === 'user') return 'user_read'
  if (category === 'file') return 'file_read'
  return 'page_read'
}

async function tryDiscover<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: { get: <U = any>(p: string, qs?: Record<string, string | number | boolean | undefined>) => Promise<U> },
  path: string,
  scopeName: string,
  scopeWarnings: string[],
  normalize: (raw: unknown) => T[],
  qs?: Record<string, string | number | boolean | undefined>
): Promise<T[]> {
  try {
    const raw = await api.get(path, qs)
    return normalize(raw)
  } catch (err) {
    if (err instanceof CcmsRestError && (err.status === 403 || err.status === 401)) {
      if (!scopeWarnings.includes(scopeName)) scopeWarnings.push(scopeName)
      return []
    }
    if (err instanceof CcmsRestError && err.status === 404) {
      // Endpoint not exposed in this CCMS build — quietly skip.
      return []
    }
    throw err
  }
}

function normalizeHandleNameList<T extends { handle: string; name: string }>(raw: unknown): T[] {
  const list = extractArray(raw)
  return list
    .map(item => {
      const o = item as Record<string, unknown>
      const handle = (o.handle as string | undefined) ?? (o.id as string | undefined) ?? ''
      const name = (o.name as string | undefined) ?? (o.title as string | undefined) ?? handle
      if (!handle) return null
      return { handle, name } as T
    })
    .filter((x): x is T => x !== null)
}

function normalizeIdNameList<T extends { id: number; name: string }>(raw: unknown): T[] {
  const list = extractArray(raw)
  return list
    .map(item => {
      const o = item as Record<string, unknown>
      const id = typeof o.id === 'number' ? o.id : Number(o.id)
      if (!Number.isFinite(id)) return null
      const name = (o.name as string | undefined) ?? (o.title as string | undefined) ?? String(id)
      return { id, name } as T
    })
    .filter((x): x is T => x !== null)
}

function normalizeAttributeKeys(raw: unknown, category: CcmsAttributeCategory): CcmsDiscoveredAttributeKey[] {
  const list = extractArray(raw)
  return list
    .map(item => {
      const o = item as Record<string, unknown>
      const handle = (o.handle as string | undefined) ?? (o.akHandle as string | undefined) ?? ''
      const name = (o.name as string | undefined) ?? (o.akName as string | undefined) ?? handle
      const type = (o.type as string | undefined) ?? (o.akType as string | undefined) ?? 'text'
      if (!handle) return null
      return { category, handle, name, type } as CcmsDiscoveredAttributeKey
    })
    .filter((x): x is CcmsDiscoveredAttributeKey => x !== null)
}

function extractArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.results)) return o.results
    return Object.values(o)
  }
  return []
}

export async function refreshSiteDiscovery(rootPath: string, siteId: string): Promise<TestConnectionResult & { discovery?: CcmsDiscovery }> {
  const { sites, creds } = await readSitesAndCreds(rootPath)
  const site = sites.find(s => s.id === siteId)
  if (!site) return { ok: false, error: `Site ${siteId} not found.` }
  const clientSecret = creds[site.id]?.clientSecret
  if (!clientSecret) return { ok: false, error: `No client secret stored for ${site.name}.` }

  const result = await probeAndDiscover({
    baseUrl: site.baseUrl,
    clientId: site.clientId,
    clientSecret,
    scopes: site.scopes
  })
  if (!result.ok || !result.discovery) return result

  const updated = sites.map(s => s.id === site.id ? { ...s, discovery: result.discovery } : s)
  await writeSites(rootPath, updated)
  return result
}
