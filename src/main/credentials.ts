// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { readSettings, writeSettings } from './hostBridge'
import type { CcmsSite, CcmsCreds } from '../shared/types'

export interface ResolvedSite {
  site: CcmsSite
  clientSecret: string
}

export async function readSitesAndCreds(rootPath: string): Promise<{ sites: CcmsSite[]; creds: CcmsCreds }> {
  const settings = (await readSettings(rootPath)) as unknown as Record<string, unknown>
  const sites = (settings.ccmsSites as CcmsSite[] | undefined) ?? []
  const creds = (settings.ccmsCreds as CcmsCreds | undefined) ?? {}
  return { sites, creds }
}

export async function loadSiteWithCreds(rootPath: string, siteRef?: string): Promise<ResolvedSite> {
  const { sites, creds } = await readSitesAndCreds(rootPath)
  if (sites.length === 0) {
    throw new Error('No Concrete CMS sites configured. Open the Concrete CMS Settings page to add one.')
  }
  let site: CcmsSite | undefined
  if (!siteRef) {
    if (sites.length > 1) {
      throw new Error(
        `Multiple Concrete CMS sites configured (${sites.map(s => s.name).join(', ')}). Specify the "site" parameter.`
      )
    }
    site = sites[0]
  } else {
    site = sites.find(s => s.name === siteRef || s.id === siteRef)
    if (!site) {
      throw new Error(
        `Unknown Concrete CMS site "${siteRef}". Configured: ${sites.map(s => s.name).join(', ') || '(none)'}.`
      )
    }
  }
  const clientSecret = creds[site.id]?.clientSecret ?? ''
  if (!clientSecret) {
    throw new Error(`No client secret stored for site "${site.name}". Open Settings to set it.`)
  }
  return { site, clientSecret }
}

export async function patchSettings(rootPath: string, patch: Record<string, unknown>): Promise<void> {
  const current = (await readSettings(rootPath)) as unknown as Record<string, unknown>
  await writeSettings({ ...current, ...patch } as never, rootPath)
}

export async function writeSites(rootPath: string, sites: CcmsSite[]): Promise<void> {
  await patchSettings(rootPath, { ccmsSites: sites })
}

export async function writeCreds(rootPath: string, creds: CcmsCreds): Promise<void> {
  await patchSettings(rootPath, { ccmsCreds: creds })
}
