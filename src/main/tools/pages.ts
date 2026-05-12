import type { ExtensionToolEntry } from '../../../../../ProjectRose/src/shared/extension-contract'
import { SITE_PARAM, s, n, nRequired, sRequired, parseJsonObject, parseJsonArray, ackGuard, runTool } from './shared'

interface CcmsPage {
  id?: number
  cID?: number
  name?: string
  cName?: string
  pageType?: string
  ptHandle?: string
  pageTemplate?: string
  status?: string
  isDraft?: boolean
  isInTrash?: boolean
  url?: string
  parentId?: number
  cParentID?: number
}

function pageId(p: CcmsPage): number | undefined {
  return p.id ?? p.cID
}

function pageName(p: CcmsPage): string {
  return p.name ?? p.cName ?? '(untitled)'
}

function pageStatus(p: CcmsPage): string {
  if (p.isInTrash) return 'trashed'
  if (p.isDraft) return 'draft'
  return p.status ?? 'published'
}

function summarizePage(p: CcmsPage): string {
  const id = pageId(p)
  const type = p.pageType ?? p.ptHandle ?? ''
  return `[id:${id ?? '?'}] [${pageStatus(p)}] ${pageName(p)}${type ? `  (${type})` : ''}${p.url ? `  ${p.url}` : ''}`
}

function fullPageText(p: CcmsPage): string {
  return JSON.stringify(p, null, 2)
}

function applyPageFields(input: Record<string, unknown>, payload: Record<string, unknown>): void {
  const name = s(input, 'name'); if (name !== undefined) payload.name = name
  const description = s(input, 'description'); if (description !== undefined) payload.description = description
  const pageType = s(input, 'pageType'); if (pageType !== undefined) payload.pageType = pageType
  const pageTemplate = s(input, 'pageTemplate'); if (pageTemplate !== undefined) payload.pageTemplate = pageTemplate
  const url = s(input, 'url'); if (url !== undefined) payload.url = url
  const attrs = parseJsonObject(input, 'attributesJson'); if (attrs) payload.attributes = attrs
  const topics = parseJsonArray<number>(input, 'topicIdsJson'); if (topics) payload.topics = topics
}

export const PAGE_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_pages',
    description: 'List pages with optional parent, page-type, and search filters. Returns id, status, name, page type, and URL.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        parentId: { type: 'number', description: 'Filter to children of this page id' },
        pageType: { type: 'string', description: 'Filter by page-type handle (use ccms_list_page_types to discover)' },
        search: { type: 'string', description: 'Search term (matches page name)' },
        page: { type: 'number', description: 'Page number (1-based)' },
        perPage: { type: 'number', description: 'Items per page (default 20)' }
      }
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsPage[] | { data?: CcmsPage[] }>('/pages', {
        parentId: n(input, 'parentId'),
        type: s(input, 'pageType'),
        search: s(input, 'search'),
        page: n(input, 'page') ?? 1,
        itemsPerPage: n(input, 'perPage') ?? 20
      })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No pages found.'
      return list.map(summarizePage).join('\n')
    })
  },
  {
    name: 'ccms_get_page',
    description: 'Get a single page by ID with full metadata and attributes.',
    schema: {
      type: 'object',
      properties: { site: SITE_PARAM, id: { type: 'number', description: 'Page ID' } },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const page = await api.get<CcmsPage>(`/pages/${id}`)
      return fullPageText(page)
    })
  },
  {
    name: 'ccms_get_page_tree',
    description: 'List children of a page (bounded depth). Useful for browsing the sitemap.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Parent page ID (use 1 for the home page on most sites)' },
        depth: { type: 'number', description: 'How many levels deep to fetch (default 1)' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const tree = await api.get<CcmsPage[] | { data?: CcmsPage[] }>(`/pages/${id}/tree`, { depth: n(input, 'depth') ?? 1 })
      const list = Array.isArray(tree) ? tree : (tree?.data ?? [])
      if (!list.length) return `No children for page id=${id}.`
      return list.map(summarizePage).join('\n')
    })
  },
  {
    name: 'ccms_create_page',
    description: 'Create a new page under a parent. Sets metadata only — block content is not editable through this extension.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        parentId: { type: 'number', description: 'Parent page ID (1 for the home page)' },
        name: { type: 'string', description: 'Page name' },
        description: { type: 'string', description: 'Page description' },
        pageType: { type: 'string', description: 'Page type handle' },
        pageTemplate: { type: 'string', description: 'Page template handle' },
        url: { type: 'string', description: 'Optional URL slug' },
        attributesJson: { type: 'string', description: 'JSON object of attribute handles to values' },
        topicIdsJson: { type: 'string', description: 'JSON array of topic IDs' }
      },
      required: ['parentId', 'name', 'pageType']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const parentId = nRequired(input, 'parentId'); if (typeof parentId === 'string') return parentId
      sRequired(input, 'name'); sRequired(input, 'pageType')
      const payload: Record<string, unknown> = { parentId }
      applyPageFields(input, payload)
      const created = await api.post<CcmsPage>('/pages', payload)
      const id = pageId(created)
      return `Created page id=${id ?? '?'} (status=${pageStatus(created)}).`
    })
  },
  {
    name: 'ccms_update_page',
    description: 'Update a page\'s metadata (name, description, page type, template, attributes). Does NOT change block content or publish status.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Page ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        pageType: { type: 'string', description: 'New page type handle' },
        pageTemplate: { type: 'string', description: 'New template handle' },
        url: { type: 'string', description: 'New URL slug' },
        attributesJson: { type: 'string', description: 'JSON object of attribute handles to values' },
        topicIdsJson: { type: 'string', description: 'JSON array of topic IDs' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const payload: Record<string, unknown> = {}
      applyPageFields(input, payload)
      if (Object.keys(payload).length === 0) return 'No fields supplied to update.'
      const updated = await api.put<CcmsPage>(`/pages/${id}`, payload)
      return `Updated page id=${pageId(updated) ?? id}.`
    })
  },
  {
    name: 'ccms_publish_page',
    description: 'Publish a page (move it from draft/scheduled to live).',
    schema: { type: 'object', properties: { site: SITE_PARAM, id: { type: 'number', description: 'Page ID' } }, required: ['id'] },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      await api.post(`/pages/${id}/publish`)
      return `Published page id=${id}.`
    })
  },
  {
    name: 'ccms_unpublish_page',
    description: 'Unpublish a page (return it to draft).',
    schema: { type: 'object', properties: { site: SITE_PARAM, id: { type: 'number', description: 'Page ID' } }, required: ['id'] },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      await api.post(`/pages/${id}/unpublish`)
      return `Unpublished page id=${id}.`
    })
  },
  {
    name: 'ccms_move_page',
    description: 'Move a page to a different parent in the sitemap.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Page ID' },
        newParentId: { type: 'number', description: 'New parent page ID' }
      },
      required: ['id', 'newParentId']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const newParentId = nRequired(input, 'newParentId'); if (typeof newParentId === 'string') return newParentId
      await api.post(`/pages/${id}/move`, { newParentId })
      return `Moved page id=${id} under parent id=${newParentId}.`
    })
  },
  {
    name: 'ccms_trash_page',
    description: 'Move a page to the trash. Recoverable via ccms_restore_page.',
    schema: { type: 'object', properties: { site: SITE_PARAM, id: { type: 'number', description: 'Page ID' } }, required: ['id'] },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      await api.post(`/pages/${id}/trash`)
      return `Trashed page id=${id}.`
    })
  },
  {
    name: 'ccms_restore_page',
    description: 'Restore a trashed page.',
    schema: { type: 'object', properties: { site: SITE_PARAM, id: { type: 'number', description: 'Page ID' } }, required: ['id'] },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      await api.post(`/pages/${id}/restore`)
      return `Restored page id=${id}.`
    })
  },
  {
    name: 'ccms_force_delete_page',
    description: 'Permanently delete a page (bypasses trash). REQUIRES acknowledged="true" — call ask_user first to confirm.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Page ID' },
        acknowledged: { type: 'string', enum: ['true', 'false'], description: 'Set "true" only after ask_user confirmation.' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const guard = ackGuard(input, `This will permanently delete page id=${id} on site ${api.site.name}.`)
      if (!guard.ok) return guard.refusal!
      await api.del(`/pages/${id}`)
      return `Permanently deleted page id=${id}.`
    })
  }
]
