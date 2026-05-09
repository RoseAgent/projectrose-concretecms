import type { CcmsApi } from '../ccmsClient'
import { withCcmsClient } from '../ccmsClient'
import { readSitesAndCreds } from '../credentials'
import { CcmsRestError } from '../../shared/types'

export const SITE_PARAM = {
  type: 'string',
  description: 'Concrete CMS site name (from settings). Omit if only one site is configured.'
} as const

export function s(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function n(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '') {
    const num = Number(v)
    return Number.isFinite(num) ? num : undefined
  }
  return undefined
}

export function nRequired(input: Record<string, unknown>, key: string): number | string {
  const v = n(input, key)
  if (v === undefined) return `Missing required parameter "${key}".`
  return v
}

export function sRequired(input: Record<string, unknown>, key: string): string {
  const v = s(input, key)
  if (v === undefined) throw new Error(`Missing required parameter "${key}".`)
  return v
}

export function boolEnum(input: Record<string, unknown>, key: string, defaultValue = false): boolean {
  const v = input[key]
  if (v === 'true' || v === true) return true
  if (v === 'false' || v === false) return false
  return defaultValue
}

export function parseJsonArray<T = unknown>(input: Record<string, unknown>, key: string): T[] | undefined {
  const raw = input[key]
  if (raw === undefined || raw === null || raw === '') return undefined
  if (Array.isArray(raw)) return raw as T[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as T[]
    } catch {
      throw new Error(`Parameter "${key}" must be a JSON array (got: ${raw.slice(0, 80)}).`)
    }
  }
  throw new Error(`Parameter "${key}" must be a JSON array.`)
}

export function parseJsonObject(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const raw = input[key]
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      throw new Error(`Parameter "${key}" must be a JSON object (got: ${raw.slice(0, 80)}).`)
    }
  }
  throw new Error(`Parameter "${key}" must be a JSON object.`)
}

export function ackGuard(input: Record<string, unknown>, description: string): { ok: boolean; refusal?: string } {
  if (boolEnum(input, 'acknowledged')) return { ok: true }
  return {
    ok: false,
    refusal: `PENDING_CONFIRMATION: ${description} Re-call this tool with acknowledged='true' AFTER asking the user for confirmation via the ask_user tool.`
  }
}

export async function runTool(
  rootPath: string,
  input: Record<string, unknown>,
  body: (api: CcmsApi) => Promise<string>
): Promise<string> {
  try {
    return await withCcmsClient(rootPath, s(input, 'site'), body)
  } catch (err) {
    if (err instanceof CcmsRestError) return err.formatForAgent()
    return `Concrete CMS error: ${(err as Error).message}`
  }
}

export async function listConfiguredSites(rootPath: string): Promise<string> {
  const { sites } = await readSitesAndCreds(rootPath)
  if (sites.length === 0) return 'No Concrete CMS sites are configured. Add one in the Concrete CMS Settings page.'
  return sites.map(site => {
    const identityText = site.discovery?.identity ? `, identity: ${site.discovery.identity.name}` : ''
    const scopeText = site.scopes.length > 0 ? `, scopes: ${site.scopes.join(',')}` : ''
    const ptText = site.discovery?.pageTypes?.length ? `, pageTypes: ${site.discovery.pageTypes.map(t => t.handle).join(',')}` : ''
    return `- ${site.name} (${site.baseUrl}, clientId: ${site.clientId}${identityText}${scopeText}${ptText})`
  }).join('\n')
}
