import type { ExtensionToolEntry } from '../types'
import { SITE_PARAM, s, n, nRequired, sRequired, ackGuard, runTool } from './shared'

interface CcmsTopic {
  id?: number
  treeNodeID?: number
  name?: string
  treeNodeName?: string
  parentId?: number
  treeId?: number
}

interface CcmsTopicTree {
  id?: number
  treeID?: number
  name?: string
  treeName?: string
}

function topicId(t: CcmsTopic): number | undefined {
  return t.id ?? t.treeNodeID
}

function topicName(t: CcmsTopic): string {
  return t.name ?? t.treeNodeName ?? '(unnamed)'
}

function summarizeTopic(t: CcmsTopic): string {
  return `[id:${topicId(t) ?? '?'}] ${topicName(t)}${t.parentId ? `  (parent:${t.parentId})` : ''}`
}

function summarizeTree(t: CcmsTopicTree): string {
  return `[id:${t.id ?? t.treeID ?? '?'}] ${t.name ?? t.treeName ?? '(unnamed)'}`
}

export const TOPIC_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_topic_trees',
    description: 'List all topic trees on a site.',
    schema: { type: 'object', properties: { site: SITE_PARAM } },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsTopicTree[] | { data?: CcmsTopicTree[] }>('/topics/trees')
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No topic trees found.'
      return list.map(summarizeTree).join('\n')
    })
  },
  {
    name: 'ccms_list_topics',
    description: 'List topics within a tree.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        treeId: { type: 'number', description: 'Topic tree ID (use ccms_list_topic_trees to find one)' }
      },
      required: ['treeId']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const treeId = nRequired(input, 'treeId'); if (typeof treeId === 'string') return treeId
      const result = await api.get<CcmsTopic[] | { data?: CcmsTopic[] }>('/topics', { treeId })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No topics found.'
      return list.map(summarizeTopic).join('\n')
    })
  },
  {
    name: 'ccms_create_topic',
    description: 'Create a new topic in a tree.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        treeId: { type: 'number', description: 'Topic tree ID' },
        name: { type: 'string', description: 'Topic name' },
        parentId: { type: 'number', description: 'Optional parent topic ID' }
      },
      required: ['treeId', 'name']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const treeId = nRequired(input, 'treeId'); if (typeof treeId === 'string') return treeId
      sRequired(input, 'name')
      const payload: Record<string, unknown> = { treeId, name: s(input, 'name') }
      const parentId = n(input, 'parentId'); if (parentId !== undefined) payload.parentId = parentId
      const created = await api.post<CcmsTopic>('/topics', payload)
      return `Created topic id=${topicId(created) ?? '?'}.`
    })
  },
  {
    name: 'ccms_update_topic',
    description: 'Update a topic\'s name or parent.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Topic ID' },
        name: { type: 'string', description: 'New name' },
        parentId: { type: 'number', description: 'New parent topic ID' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const payload: Record<string, unknown> = {}
      const name = s(input, 'name'); if (name !== undefined) payload.name = name
      const parentId = n(input, 'parentId'); if (parentId !== undefined) payload.parentId = parentId
      if (Object.keys(payload).length === 0) return 'No fields supplied to update.'
      await api.put(`/topics/${id}`, payload)
      return `Updated topic id=${id}.`
    })
  },
  {
    name: 'ccms_delete_topic',
    description: 'Permanently delete a topic. REQUIRES acknowledged="true" — call ask_user first to confirm.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'Topic ID' },
        acknowledged: { type: 'string', enum: ['true', 'false'], description: 'Set "true" only after ask_user confirmation.' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const guard = ackGuard(input, `This will permanently delete topic id=${id} on site ${api.site.name}.`)
      if (!guard.ok) return guard.refusal!
      await api.del(`/topics/${id}`)
      return `Deleted topic id=${id}.`
    })
  }
]
