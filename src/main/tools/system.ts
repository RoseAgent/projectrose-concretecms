import type { ExtensionToolEntry } from '../../../../../ProjectRose/src/shared/extension-contract'
import { SITE_PARAM, s, runTool } from './shared'

interface CcmsPageType { handle?: string; name?: string }
interface CcmsPageTemplate { handle?: string; name?: string }
interface CcmsAttributeKey { handle?: string; akHandle?: string; name?: string; akName?: string; type?: string; akType?: string }

function fmtKv(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n')
}

export const SYSTEM_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_get_system_info',
    description: 'Get site name, CCMS version, locale, and other read-only system info.',
    schema: { type: 'object', properties: { site: SITE_PARAM } },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const info = await api.get<Record<string, unknown>>('/system/info')
      return fmtKv(info ?? {}) || '(empty)'
    })
  },
  {
    name: 'ccms_list_page_types',
    description: 'List the page-type handles available on a site. Use the handle in pageType when creating/updating a page.',
    schema: { type: 'object', properties: { site: SITE_PARAM } },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsPageType[] | { data?: CcmsPageType[] }>('/system/page_types')
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No page types found.'
      return list.map(t => `${t.handle ?? '?'}  ("${t.name ?? ''}")`).join('\n')
    })
  },
  {
    name: 'ccms_list_page_templates',
    description: 'List the page-template handles available on a site. Use the handle in pageTemplate when creating/updating a page.',
    schema: { type: 'object', properties: { site: SITE_PARAM } },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsPageTemplate[] | { data?: CcmsPageTemplate[] }>('/system/page_templates')
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No page templates found.'
      return list.map(t => `${t.handle ?? '?'}  ("${t.name ?? ''}")`).join('\n')
    })
  },
  {
    name: 'ccms_list_attribute_keys',
    description: 'List attribute keys (custom fields) for pages, users, or files.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        category: { type: 'string', enum: ['collection', 'user', 'file'], description: 'collection = pages, user = users, file = files' }
      },
      required: ['category']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const category = s(input, 'category') ?? 'collection'
      const result = await api.get<CcmsAttributeKey[] | { data?: CcmsAttributeKey[] }>('/system/attribute_keys', { category })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return `No ${category} attribute keys found.`
      return list.map(k => {
        const handle = k.handle ?? k.akHandle ?? '?'
        const name = k.name ?? k.akName ?? handle
        const type = k.type ?? k.akType ?? 'text'
        return `${handle}  ("${name}", type:${type})`
      }).join('\n')
    })
  }
]
