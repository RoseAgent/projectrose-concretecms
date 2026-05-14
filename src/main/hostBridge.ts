// Thin replacement for the old `@main/ipc/settingsHandlers` import. The host
// removed that escape hatch (extension-contract PRD); extensions must reach
// settings through `ctx.getSettings()` / `ctx.updateSettings()`. This module
// captures the active ctx at register() time and exposes the same
// readSettings / writeSettings signatures downstream code already uses.

import type { ExtensionMainContext } from './types'

let _ctx: ExtensionMainContext | null = null

export function setHost(ctx: ExtensionMainContext): void {
  _ctx = ctx
}

export async function readSettings(_rootPath: string): Promise<Record<string, unknown>> {
  if (!_ctx) throw new Error('rose-concretecms: host not initialised — setHost(ctx) must run before readSettings')
  return _ctx.getSettings()
}

export async function writeSettings(
  settings: Record<string, unknown>,
  _rootPath: string
): Promise<void> {
  if (!_ctx) throw new Error('rose-concretecms: host not initialised — setHost(ctx) must run before writeSettings')
  await _ctx.updateSettings(settings)
}
