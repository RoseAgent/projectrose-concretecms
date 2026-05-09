// Local mirror of the host's extension types. Kept in-extension to avoid a
// build-time dependency on the host's TypeScript paths.

export interface ExtensionToolEntry {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>
  execute: (
    input: Record<string, unknown>,
    projectRoot: string,
    toolCtx?: { sessionId: string; turnId?: string }
  ) => Promise<string>
}

export interface ExtensionMainContext {
  rootPath: string
  getSettings: () => Promise<Record<string, unknown>>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  broadcast: (channel: string, data: unknown) => void
  notifyStatus: (
    text: string,
    opts?: { tone?: 'info' | 'success' | 'error' | 'warning'; durationMs?: number }
  ) => void
  registerTools: (tools: ExtensionToolEntry[]) => void
  registerSensitiveFields: (keys: string[]) => void
}
