import { ipcMain } from 'electron'
import type { ExtensionMainContext } from './types'
import type { CcmsSite, CcmsCreds, TestConnectionResult } from '../shared/types'
import { CcmsRestError } from '../shared/types'
import {
  readSitesAndCreds, writeSites, writeCreds, loadSiteWithCreds
} from './credentials'
import { buildApi, clearTokenCache } from './ccmsClient'
import { probeAndDiscover, refreshSiteDiscovery } from './discovery'

interface SiteUpsertInput {
  id?: string
  name: string
  baseUrl: string
  clientId: string
  scopes: string[]
  clientSecret?: string
}

function uuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('crypto').randomUUID() as string
}

async function asJson<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    if (err instanceof CcmsRestError) return { ok: false, error: err.formatForAgent() }
    return { ok: false, error: (err as Error).message }
  }
}

export function registerHandlers(ctx: ExtensionMainContext): () => void {
  const { rootPath } = ctx
  const channels: string[] = []

  function handle(name: string, fn: (...args: unknown[]) => Promise<unknown>): void {
    ipcMain.handle(name, async (_event, ...args) => fn(...args))
    channels.push(name)
  }

  async function withApi<T>(siteRef: string | undefined, cb: (api: Awaited<ReturnType<typeof buildApi>>) => Promise<T>): Promise<T> {
    const { site, clientSecret } = await loadSiteWithCreds(rootPath, siteRef)
    const api = await buildApi(site, clientSecret)
    return cb(api)
  }

  // ---- Sites ----------------------------------------------------------------
  handle('rose-concretecms:sites.list', async () => {
    const { sites, creds } = await readSitesAndCreds(rootPath)
    return sites.map(s => ({ ...s, hasClientSecret: Boolean(creds[s.id]?.clientSecret) }))
  })

  handle('rose-concretecms:sites.upsert', async (input) => {
    const raw = (input ?? {}) as SiteUpsertInput
    const { id, name, baseUrl, clientId, scopes, clientSecret } = raw
    if (!name || !baseUrl || !clientId) return { ok: false, error: 'name, baseUrl, and clientId are required.' }
    const trimmedName = String(name).trim()
    const trimmedBaseUrl = String(baseUrl).trim().replace(/\/+$/, '')
    const trimmedClientId = String(clientId).trim()
    const scopeList = Array.isArray(scopes) ? scopes.map(s => String(s).trim()).filter(Boolean) : []

    const { sites: existingSites, creds: existingCreds } = await readSitesAndCreds(rootPath)
    const dup = existingSites.find(s => s.name === trimmedName && s.id !== id)
    if (dup) return { ok: false, error: `A site named "${trimmedName}" already exists.` }

    const siteId = id ?? uuid()
    const updatedSite: CcmsSite = (() => {
      const existing = existingSites.find(s => s.id === siteId)
      return {
        id: siteId,
        name: trimmedName,
        baseUrl: trimmedBaseUrl,
        clientId: trimmedClientId,
        scopes: scopeList,
        discovery: existing?.discovery
      }
    })()

    const newSites = id
      ? existingSites.map(s => s.id === id ? updatedSite : s)
      : [...existingSites, updatedSite]
    await writeSites(rootPath, newSites)

    if (clientSecret !== undefined && clientSecret !== '') {
      const newCreds: CcmsCreds = { ...existingCreds, [siteId]: { clientSecret } }
      await writeCreds(rootPath, newCreds)
    }

    // Any cached token for this site is no longer guaranteed valid (URL/scopes/secret may have changed).
    clearTokenCache(siteId)

    return {
      ok: true,
      site: { ...updatedSite, hasClientSecret: Boolean(clientSecret || existingCreds[siteId]?.clientSecret) }
    }
  })

  handle('rose-concretecms:sites.remove', async (id) => {
    const siteId = String(id)
    const { sites, creds } = await readSitesAndCreds(rootPath)
    const newSites = sites.filter(s => s.id !== siteId)
    const newCreds: CcmsCreds = { ...creds }; delete newCreds[siteId]
    await writeSites(rootPath, newSites)
    await writeCreds(rootPath, newCreds)
    clearTokenCache(siteId)
    return { ok: true }
  })

  handle('rose-concretecms:sites.testConnection', async (input) => {
    const { baseUrl, clientId, clientSecret, scopes } = (input ?? {}) as { baseUrl: string; clientId: string; clientSecret: string; scopes: string[] }
    const result = await probeAndDiscover({
      baseUrl: String(baseUrl ?? ''),
      clientId: String(clientId ?? ''),
      clientSecret: String(clientSecret ?? ''),
      scopes: Array.isArray(scopes) ? scopes.map(String) : []
    })
    return result as TestConnectionResult
  })

  handle('rose-concretecms:sites.refreshDiscovery', async (id) => {
    const result = await refreshSiteDiscovery(rootPath, String(id))
    return result
  })

  // ---- Pages ----------------------------------------------------------------
  handle('rose-concretecms:pages.list', (input) => asJson(async () => {
    const { site, parentId, pageType, search, page, perPage } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/pages', {
        parentId: parentId as number | undefined,
        type: pageType as string | undefined,
        search: search as string | undefined,
        page: (page as number) ?? 1,
        itemsPerPage: (perPage as number) ?? 20
      })
    )
  }))

  handle('rose-concretecms:pages.get', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get(`/pages/${id}`))
  }))

  handle('rose-concretecms:pages.tree', (input) => asJson(async () => {
    const { site, id, depth } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get(`/pages/${id}/tree`, { depth: (depth as number) ?? 1 })
    )
  }))

  handle('rose-concretecms:pages.create', (input) => asJson(async () => {
    const { site, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.post('/pages', payload))
  }))

  handle('rose-concretecms:pages.update', (input) => asJson(async () => {
    const { site, id, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.put(`/pages/${id}`, payload))
  }))

  handle('rose-concretecms:pages.action', (input) => asJson(async () => {
    const { site, id, action, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => {
      switch (action) {
        case 'publish':   return api.post(`/pages/${id}/publish`, payload)
        case 'unpublish': return api.post(`/pages/${id}/unpublish`, payload)
        case 'move':      return api.post(`/pages/${id}/move`, payload)
        case 'trash':     return api.post(`/pages/${id}/trash`)
        case 'restore':   return api.post(`/pages/${id}/restore`)
        case 'delete':    return api.del(`/pages/${id}`)
        default: throw new Error(`Unknown pages action: ${action}`)
      }
    })
  }))

  // ---- Files ----------------------------------------------------------------
  handle('rose-concretecms:files.list', (input) => asJson(async () => {
    const { site, search, page, perPage } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/files', {
        search: search as string | undefined,
        page: (page as number) ?? 1,
        itemsPerPage: (perPage as number) ?? 24
      })
    )
  }))

  handle('rose-concretecms:files.get', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get(`/files/${id}`))
  }))

  handle('rose-concretecms:files.upload', (input) => asJson(async () => {
    const { site, filePath, fields } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.upload('/files', String(filePath), fields as Record<string, unknown> | undefined)
    )
  }))

  handle('rose-concretecms:files.update', (input) => asJson(async () => {
    const { site, id, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.put(`/files/${id}`, payload))
  }))

  handle('rose-concretecms:files.delete', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.del(`/files/${id}`))
  }))

  // ---- Users ----------------------------------------------------------------
  handle('rose-concretecms:users.list', (input) => asJson(async () => {
    const { site, search, page, perPage } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/users', {
        search: search as string | undefined,
        page: (page as number) ?? 1,
        itemsPerPage: (perPage as number) ?? 50
      })
    )
  }))

  handle('rose-concretecms:users.get', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get(`/users/${id}`))
  }))

  handle('rose-concretecms:users.create', (input) => asJson(async () => {
    const { site, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.post('/users', payload))
  }))

  handle('rose-concretecms:users.update', (input) => asJson(async () => {
    const { site, id, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.put(`/users/${id}`, payload))
  }))

  handle('rose-concretecms:users.delete', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.del(`/users/${id}`))
  }))

  // ---- Groups ---------------------------------------------------------------
  handle('rose-concretecms:groups.list', (input) => asJson(async () => {
    const { site, search, page, perPage } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/groups', {
        search: search as string | undefined,
        page: (page as number) ?? 1,
        itemsPerPage: (perPage as number) ?? 50
      })
    )
  }))

  handle('rose-concretecms:groups.get', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get(`/groups/${id}`))
  }))

  handle('rose-concretecms:groups.create', (input) => asJson(async () => {
    const { site, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.post('/groups', payload))
  }))

  handle('rose-concretecms:groups.update', (input) => asJson(async () => {
    const { site, id, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.put(`/groups/${id}`, payload))
  }))

  handle('rose-concretecms:groups.delete', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.del(`/groups/${id}`))
  }))

  handle('rose-concretecms:groups.addUser', (input) => asJson(async () => {
    const { site, groupId, userId } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.post(`/groups/${groupId}/users`, { userId })
    )
  }))

  handle('rose-concretecms:groups.removeUser', (input) => asJson(async () => {
    const { site, groupId, userId } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.del(`/groups/${groupId}/users/${userId}`)
    )
  }))

  // ---- Topics ---------------------------------------------------------------
  handle('rose-concretecms:topics.listTrees', (input) => asJson(async () => {
    const { site } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get('/topics/trees'))
  }))

  handle('rose-concretecms:topics.list', (input) => asJson(async () => {
    const { site, treeId } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/topics', { treeId: treeId as number | undefined })
    )
  }))

  handle('rose-concretecms:topics.create', (input) => asJson(async () => {
    const { site, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.post('/topics', payload))
  }))

  handle('rose-concretecms:topics.update', (input) => asJson(async () => {
    const { site, id, payload } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.put(`/topics/${id}`, payload))
  }))

  handle('rose-concretecms:topics.delete', (input) => asJson(async () => {
    const { site, id } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.del(`/topics/${id}`))
  }))

  // ---- System ---------------------------------------------------------------
  handle('rose-concretecms:system.info', (input) => asJson(async () => {
    const { site } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get('/system/info'))
  }))

  handle('rose-concretecms:system.pageTypes', (input) => asJson(async () => {
    const { site } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get('/system/page_types'))
  }))

  handle('rose-concretecms:system.pageTemplates', (input) => asJson(async () => {
    const { site } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) => api.get('/system/page_templates'))
  }))

  handle('rose-concretecms:system.attributeKeys', (input) => asJson(async () => {
    const { site, category } = (input ?? {}) as Record<string, unknown>
    return withApi(site as string | undefined, (api) =>
      api.get('/system/attribute_keys', { category: category as string | undefined })
    )
  }))

  return () => {
    for (const ch of channels) ipcMain.removeHandler(ch)
  }
}
