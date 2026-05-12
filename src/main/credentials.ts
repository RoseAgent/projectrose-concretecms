// Settings access for rose-concretecms.
//
// All settings reads/writes go through the contract: `ctx.getSettings()` and
// `ctx.updateSettings()` instead of the host's internal settingsHandlers.
// `register(ctx)` stashes the active ctx so these functions can use it.

import type { CcmsSite, CcmsCreds } from '../shared/types'
import type { ExtensionMainContext } from '../../../../ProjectRose/src/shared/extension-contract'

let activeCtx: ExtensionMainContext | null = null

export function setRoseCcmsCtx(ctx: ExtensionMainContext): void {
  activeCtx = ctx
}

function requireCtx(): ExtensionMainContext {
  if (!activeCtx) {
    throw new Error('rose-concretecms: settings accessed before register(ctx) completed')
  }
  return activeCtx
}

async function readSettings(): Promise<Record<string, unknown>> {
  return (await requireCtx().getSettings()) as Record<string, unknown>
}

async function writeSettingsPatch(patch: Record<string, unknown>): Promise<void> {
  await requireCtx().updateSettings(patch)
}

export interface ResolvedSite {
  site: CcmsSite
  clientSecret: string
}

// rootPath kept on these signatures so callers don't have to be rewritten;
// it's currently unused because ctx.getSettings()/updateSettings() resolve
// the project root themselves.

export async function readSitesAndCreds(_rootPath: string): Promise<{ sites: CcmsSite[]; creds: CcmsCreds }> {
  const settings = await readSettings()
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

export async function patchSettings(_rootPath: string, patch: Record<string, unknown>): Promise<void> {
  await writeSettingsPatch(patch)
}

export async function writeSites(rootPath: string, sites: CcmsSite[]): Promise<void> {
  await patchSettings(rootPath, { ccmsSites: sites })
}

export async function writeCreds(rootPath: string, creds: CcmsCreds): Promise<void> {
  await patchSettings(rootPath, { ccmsCreds: creds })
}
