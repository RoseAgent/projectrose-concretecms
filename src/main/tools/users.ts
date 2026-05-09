import type { ExtensionToolEntry } from '../types'
import { SITE_PARAM, s, n, nRequired, sRequired, parseJsonObject, ackGuard, runTool } from './shared'

interface CcmsUser {
  id?: number
  uID?: number
  username?: string
  uName?: string
  email?: string
  uEmail?: string
  isActive?: boolean
}

function userId(u: CcmsUser): number | undefined {
  return u.id ?? u.uID
}

function userName(u: CcmsUser): string {
  return u.username ?? u.uName ?? '(unknown)'
}

function summarizeUser(u: CcmsUser): string {
  const id = userId(u)
  const email = u.email ?? u.uEmail ?? ''
  const active = u.isActive === false ? ' [inactive]' : ''
  return `[id:${id ?? '?'}] ${userName(u)}${email ? `  <${email}>` : ''}${active}`
}

function applyUserFields(input: Record<string, unknown>, payload: Record<string, unknown>): void {
  const username = s(input, 'username'); if (username !== undefined) payload.username = username
  const email = s(input, 'email'); if (email !== undefined) payload.email = email
  const password = s(input, 'password'); if (password !== undefined) payload.password = password
  const firstName = s(input, 'firstName'); if (firstName !== undefined) payload.firstName = firstName
  const lastName = s(input, 'lastName'); if (lastName !== undefined) payload.lastName = lastName
  const attrs = parseJsonObject(input, 'attributesJson'); if (attrs) payload.attributes = attrs
}

export const USER_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_users',
    description: 'List Concrete CMS users with search/pagination.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        search: { type: 'string', description: 'Search term (matches username/email)' },
        page: { type: 'number', description: 'Page number' },
        perPage: { type: 'number', description: 'Items per page (default 50)' }
      }
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsUser[] | { data?: CcmsUser[] }>('/users', {
        search: s(input, 'search'),
        page: n(input, 'page') ?? 1,
        itemsPerPage: n(input, 'perPage') ?? 50
      })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No users found.'
      return list.map(summarizeUser).join('\n')
    })
  },
  {
    name: 'ccms_get_user',
    description: 'Get a user by ID.',
    schema: {
      type: 'object',
      properties: { site: SITE_PARAM, id: { type: 'number', description: 'User ID' } },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const user = await api.get<CcmsUser>(`/users/${id}`)
      return JSON.stringify(user, null, 2)
    })
  },
  {
    name: 'ccms_create_user',
    description: 'Create a new Concrete CMS user.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        username: { type: 'string', description: 'Username' },
        email: { type: 'string', description: 'Email address' },
        password: { type: 'string', description: 'Initial password' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        attributesJson: { type: 'string', description: 'JSON object of attribute handles to values' }
      },
      required: ['username', 'email', 'password']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      sRequired(input, 'username'); sRequired(input, 'email'); sRequired(input, 'password')
      const payload: Record<string, unknown> = {}
      applyUserFields(input, payload)
      const created = await api.post<CcmsUser>('/users', payload)
      return `Created user id=${userId(created) ?? '?'}.`
    })
  },
  {
    name: 'ccms_update_user',
    description: 'Update a user\'s fields.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'User ID' },
        username: { type: 'string', description: 'New username' },
        email: { type: 'string', description: 'New email' },
        password: { type: 'string', description: 'New password' },
        firstName: { type: 'string', description: 'New first name' },
        lastName: { type: 'string', description: 'New last name' },
        attributesJson: { type: 'string', description: 'JSON object of attribute handles to values' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const payload: Record<string, unknown> = {}
      applyUserFields(input, payload)
      if (Object.keys(payload).length === 0) return 'No fields supplied to update.'
      await api.put(`/users/${id}`, payload)
      return `Updated user id=${id}.`
    })
  },
  {
    name: 'ccms_delete_user',
    description: 'Permanently delete a user. REQUIRES acknowledged="true" — call ask_user first to confirm.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'User ID' },
        acknowledged: { type: 'string', enum: ['true', 'false'], description: 'Set "true" only after ask_user confirmation.' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const guard = ackGuard(input, `This will permanently delete user id=${id} on site ${api.site.name}.`)
      if (!guard.ok) return guard.refusal!
      await api.del(`/users/${id}`)
      return `Deleted user id=${id}.`
    })
  }
]
