export interface CcmsDiscoveredIdentity {
  id: number
  name: string
  type: 'integration' | 'user'
}

export interface CcmsDiscoveredPageType {
  handle: string
  name: string
}

export interface CcmsDiscoveredPageTemplate {
  handle: string
  name: string
}

export interface CcmsDiscoveredTopicTree {
  id: number
  name: string
}

export type CcmsAttributeCategory = 'collection' | 'user' | 'file'

export interface CcmsDiscoveredAttributeKey {
  category: CcmsAttributeCategory
  handle: string
  name: string
  type: string
}

export interface CcmsDiscovery {
  fetchedAt: number
  identity: CcmsDiscoveredIdentity | null
  grantedScopes: string[]
  pageTypes: CcmsDiscoveredPageType[]
  pageTemplates: CcmsDiscoveredPageTemplate[]
  topicTrees: CcmsDiscoveredTopicTree[]
  attributeKeys: CcmsDiscoveredAttributeKey[]
}

export interface CcmsSite {
  id: string
  name: string
  baseUrl: string
  clientId: string
  scopes: string[]
  discovery?: CcmsDiscovery
}

export type CcmsCreds = Record<string /* siteId */, { clientSecret: string }>

export interface CcmsRestErrorShape {
  code: string
  message: string
  status: number
  method: string
  path: string
}

export class CcmsRestError extends Error {
  code: string
  status: number
  method: string
  path: string

  constructor(code: string, message: string, status: number, method: string, path: string) {
    super(message)
    this.name = 'CcmsRestError'
    this.code = code
    this.status = status
    this.method = method
    this.path = path
  }

  formatForAgent(): string {
    return `Concrete CMS error [${this.code}] (${this.status}): ${this.message}. Endpoint: ${this.method} ${this.path}.`
  }
}

export interface TestConnectionResult {
  ok: boolean
  error?: string
  identity?: CcmsDiscoveredIdentity | null
  pageTypeCount?: number
  pageTemplateCount?: number
  attributeKeyCount?: number
  topicTreeCount?: number
  scopeWarnings?: string[]
}

export const STANDARD_CCMS_SCOPES: string[] = [
  'system_info',
  'page_read',
  'page_write',
  'file_read',
  'file_write',
  'user_read',
  'user_write',
  'group_read',
  'group_write',
  'topic_read',
  'topic_write'
]
