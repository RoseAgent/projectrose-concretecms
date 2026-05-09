// Thin wrappers around window.api.invoke('rose-concretecms:*'). All renderer
// state goes through these — components do not call window.api directly.

import type { CcmsSite, TestConnectionResult, CcmsDiscovery } from '../shared/types'

export interface SiteWithFlag extends CcmsSite {
  hasClientSecret: boolean
}

interface MaybeOk<T> { ok: true; data: T }
interface MaybeErr { ok: false; error: string }
type MaybeResult<T> = MaybeOk<T> | MaybeErr

const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
  (window as unknown as { api: { invoke: (c: string, ...a: unknown[]) => Promise<T> } }).api.invoke(channel, ...args)

export interface SiteUpsertInput {
  id?: string
  name: string
  baseUrl: string
  clientId: string
  scopes: string[]
  clientSecret?: string
}

export const ccms = {
  // Sites
  listSites: () => invoke<SiteWithFlag[]>('rose-concretecms:sites.list'),
  upsertSite: (input: SiteUpsertInput) =>
    invoke<{ ok: boolean; site?: SiteWithFlag; error?: string }>('rose-concretecms:sites.upsert', input),
  removeSite: (id: string) => invoke<{ ok: boolean }>('rose-concretecms:sites.remove', id),
  testConnection: (input: { baseUrl: string; clientId: string; clientSecret: string; scopes: string[] }) =>
    invoke<TestConnectionResult>('rose-concretecms:sites.testConnection', input),
  refreshDiscovery: (id: string) =>
    invoke<TestConnectionResult & { discovery?: CcmsDiscovery }>('rose-concretecms:sites.refreshDiscovery', id),

  // Pages
  listPages: (input: { site?: string; parentId?: number; pageType?: string; search?: string; page?: number; perPage?: number }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:pages.list', input),
  getPage: (input: { site?: string; id: number }) =>
    invoke<MaybeResult<Record<string, unknown>>>('rose-concretecms:pages.get', input),

  // Files
  listFiles: (input: { site?: string; search?: string; page?: number; perPage?: number }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:files.list', input),
  getFile: (input: { site?: string; id: number }) =>
    invoke<MaybeResult<Record<string, unknown>>>('rose-concretecms:files.get', input),

  // Users
  listUsers: (input: { site?: string; search?: string; page?: number; perPage?: number }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:users.list', input),
  getUser: (input: { site?: string; id: number }) =>
    invoke<MaybeResult<Record<string, unknown>>>('rose-concretecms:users.get', input),

  // Groups
  listGroups: (input: { site?: string; search?: string; page?: number; perPage?: number }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:groups.list', input),
  getGroup: (input: { site?: string; id: number }) =>
    invoke<MaybeResult<Record<string, unknown>>>('rose-concretecms:groups.get', input),

  // Topics
  listTopicTrees: (input: { site?: string }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:topics.listTrees', input),
  listTopics: (input: { site?: string; treeId: number }) =>
    invoke<MaybeResult<unknown[] | { data?: unknown[] }>>('rose-concretecms:topics.list', input),

  // System
  getSystemInfo: (input: { site?: string }) =>
    invoke<MaybeResult<Record<string, unknown>>>('rose-concretecms:system.info', input)
}
