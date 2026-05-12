import type { ExtensionToolEntry } from '../../../../../ProjectRose/src/shared/extension-contract'
import { SITE_PARAM, s, n, nRequired, sRequired, parseJsonObject, ackGuard, runTool } from './shared'

interface CcmsFile {
  id?: number
  fID?: number
  title?: string
  fileName?: string
  url?: string
  size?: number
  fvSize?: number
  type?: string
  fvExtension?: string
}

function fileId(f: CcmsFile): number | undefined {
  return f.id ?? f.fID
}

function fileName(f: CcmsFile): string {
  return f.title ?? f.fileName ?? '(unnamed)'
}

function summarizeFile(f: CcmsFile): string {
  const id = fileId(f)
  const ext = f.fvExtension ?? f.type ?? ''
  const size = f.size ?? f.fvSize
  return `[id:${id ?? '?'}] ${fileName(f)}${ext ? `.${ext}` : ''}${size ? `  (${size} bytes)` : ''}${f.url ? `  ${f.url}` : ''}`
}

export const FILE_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_files',
    description: 'List files in the file manager with search/pagination.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        search: { type: 'string', description: 'Search term' },
        page: { type: 'number', description: 'Page number' },
        perPage: { type: 'number', description: 'Items per page (default 24)' }
      }
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const result = await api.get<CcmsFile[] | { data?: CcmsFile[] }>('/files', {
        search: s(input, 'search'),
        page: n(input, 'page') ?? 1,
        itemsPerPage: n(input, 'perPage') ?? 24
      })
      const list = Array.isArray(result) ? result : (result?.data ?? [])
      if (!list.length) return 'No files found.'
      return list.map(summarizeFile).join('\n')
    })
  },
  {
    name: 'ccms_get_file',
    description: 'Get file metadata by ID.',
    schema: {
      type: 'object',
      properties: { site: SITE_PARAM, id: { type: 'number', description: 'File ID' } },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const file = await api.get<CcmsFile>(`/files/${id}`)
      return JSON.stringify(file, null, 2)
    })
  },
  {
    name: 'ccms_upload_file',
    description: 'Upload a local file to the Concrete CMS file manager.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        filePath: { type: 'string', description: 'Absolute local path to the file' },
        title: { type: 'string', description: 'Optional title for the uploaded file' },
        description: { type: 'string', description: 'Optional description' }
      },
      required: ['filePath']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const filePath = sRequired(input, 'filePath')
      const fields: Record<string, unknown> = {}
      const title = s(input, 'title'); if (title) fields.title = title
      const description = s(input, 'description'); if (description) fields.description = description
      const created = await api.upload<CcmsFile>('/files', filePath, fields)
      return `Uploaded file id=${fileId(created) ?? '?'}.`
    })
  },
  {
    name: 'ccms_update_file',
    description: 'Update a file\'s metadata (title, description, custom attributes). Does not replace the file binary.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'File ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        attributesJson: { type: 'string', description: 'JSON object of attribute handles to values' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const payload: Record<string, unknown> = {}
      const title = s(input, 'title'); if (title !== undefined) payload.title = title
      const description = s(input, 'description'); if (description !== undefined) payload.description = description
      const attrs = parseJsonObject(input, 'attributesJson'); if (attrs) payload.attributes = attrs
      if (Object.keys(payload).length === 0) return 'No fields supplied to update.'
      await api.put(`/files/${id}`, payload)
      return `Updated file id=${id}.`
    })
  },
  {
    name: 'ccms_delete_file',
    description: 'Permanently delete a file from the file manager. REQUIRES acknowledged="true" — call ask_user first to confirm.',
    schema: {
      type: 'object',
      properties: {
        site: SITE_PARAM,
        id: { type: 'number', description: 'File ID' },
        acknowledged: { type: 'string', enum: ['true', 'false'], description: 'Set "true" only after ask_user confirmation.' }
      },
      required: ['id']
    },
    execute: (input, projectRoot) => runTool(projectRoot, input, async (api) => {
      const id = nRequired(input, 'id'); if (typeof id === 'string') return id
      const guard = ackGuard(input, `This will permanently delete file id=${id} on site ${api.site.name}.`)
      if (!guard.ok) return guard.refusal!
      await api.del(`/files/${id}`)
      return `Deleted file id=${id}.`
    })
  }
]
