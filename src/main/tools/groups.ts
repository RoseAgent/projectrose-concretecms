import type { ExtensionToolEntry } from '../types'
import { SITE_PARAM, s, n, nRequired, sRequired, ackGuard, runTool } from './shared'

interface CcmsGroup {
  id?: number
  gID?: number
  name?: string
  gName?: string
  description?: string
  gDescription?: string
}

function groupId(g: CcmsGroup): number | undefined {
  return g.id ?? g.gID
}

function groupName(g: CcmsGroup): string {
  return g.name ?? g.gName ?? '(unnamed)'
}

function summarizeGroup(g: CcmsGroup): string {
  const id = groupId(g)
  const desc = g.description ?? g.gDescription ?? ''
  return `[id:${id ?? '?'}] ${groupName(g)}${desc ? `  — ${desc}` : ''}`
}

export const GROUP_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_groups',
    description: 'List user groups with search/pagination.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        search: { type: 'string', description: 'Search term' },
        page: { type: 'number', description: 'Page number' },
        perPage: { type: 'number', description: 'Items per page (default 50)' }
      }
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsGroup[] | { data?: CcmsGroup[] }>('/groups', {
        search: s(input, 'search'),
        page: n(input, 'page') ?? 1,
        itemsPerPage: n(input, 'perPage') ?? 50
      })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No groups found.'
      return list.map(summarizeGroup).join('\n')
    })
  },
  {
    name: 'ccms_get_group',
    description: 'Get a group by ID.',
    schema: {
      type: 'object',
      properties: { site: SITE_PARAM, id: { type: 'number', description: 'Group ID' } },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const group = await api.get<CcmsGroup>(`/groups/${id}`)
      return JSON.stringify(group, null, 2)
    })
  },
  {
    name: 'ccms_create_group',
    description: 'Create a new user group.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        name: { type: 'string', description: 'Group name' },
        description: { type: 'string', description: 'Group description' }
      },
      required: ['name']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      sRequired(input, 'name')
      const payload: Record<string, unknown> = { name: s(input, 'name') }
      const description = s(input, 'description'); if (description) payload.description = description
      const created = await api.post<CcmsGroup>('/groups', payload)
      return `Created group id=${groupId(created) ?? '?'}.`
    })
  },
  {
    name: 'ccms_update_group',
    description: 'Update a group\'s name or description.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Group ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const payload: Record<string, unknown> = {}
      const name = s(input, 'name'); if (name !== undefined) payload.name = name
      const description = s(input, 'description'); if (description !== undefined) payload.description = description
      if (Object.keys(payload).length === 0) return 'No fields supplied to update.'
      await api.put(`/groups/${id}`, payload)
      return `Updated group id=${id}.`
    })
  },
  {
    name: 'ccms_delete_group',
    description: 'Permanently delete a user group. REQUIRES acknowledged="true" — call ask_user first to confirm.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Group ID' },
        acknowledged: { type: 'string', enum: ['true', 'false'], description: 'Set "true" only after ask_user confirmation.' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const guard = ackGuard(input, `This will permanently delete group id=${id} on site ${api.site.name}.`)
      if (!guard.ok) return guard.refusal!
      await api.del(`/groups/${id}`)
      return `Deleted group id=${id}.`
    })
  },
  {
    name: 'ccms_add_user_to_group',
    description: 'Add a user to a group.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        groupId: { type: 'number', description: 'Group ID' },
        userId: { type: 'number', description: 'User ID' }
      },
      required: ['groupId', 'userId']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const groupId = nRequired(input, 'groupId'); if (typeof groupId === 'string') return groupId
      const userId = nRequired(input, 'userId'); if (typeof userId === 'string') return userId
      await api.post(`/groups/${groupId}/users`, { userId })
      return `Added user id=${userId} to group id=${groupId}.`
    })
  },
  {
    name: 'ccms_remove_user_from_group',
    description: 'Remove a user from a group.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        groupId: { type: 'number', description: 'Group ID' },
        userId: { type: 'number', description: 'User ID' }
      },
      required: ['groupId', 'userId']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const groupId = nRequired(input, 'groupId'); if (typeof groupId === 'string') return groupId
      const userId = nRequired(input, 'userId'); if (typeof userId === 'string') return userId
      await api.del(`/groups/${groupId}/users/${userId}`)
      return `Removed user id=${userId} from group id=${groupId}.`
    })
  }
]
