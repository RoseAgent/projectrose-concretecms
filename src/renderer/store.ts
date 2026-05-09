import { create } from 'zustand'
import { ccms, SiteWithFlag } from './api'

export type ResourceKind =
  | { kind: 'pages' }
  | { kind: 'files' }
  | { kind: 'users' }
  | { kind: 'groups' }
  | { kind: 'topics'; treeId?: number }
  | { kind: 'system' }

interface ListItem {
  id: number | string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
}

interface CcmsState {
  sites: SiteWithFlag[]
  activeSiteId: string | null
  resource: ResourceKind
  list: { items: ListItem[]; loading: boolean; error: string | null; page: number; search: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDetail: { id: number | string; raw: any } | null

  loadSites: () => Promise<void>
  setActiveSite: (id: string | null) => void
  setResource: (r: ResourceKind) => void
  setSearch: (q: string) => void
  setPage: (n: number) => void
  refreshList: () => Promise<void>

  selectItem: (item: ListItem) => Promise<void>
  clearSelection: () => void
}

function activeSite(get: () => CcmsState): SiteWithFlag | null {
  const { sites, activeSiteId } = get()
  return sites.find(s => s.id === activeSiteId) ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractList(raw: any): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.data)) return raw.data
    if (Array.isArray(raw.results)) return raw.results
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickId(raw: any, idx: number): number | string {
  if (raw && typeof raw === 'object') {
    if (typeof raw.id === 'number' || typeof raw.id === 'string') return raw.id
    if (typeof raw.cID === 'number') return raw.cID
    if (typeof raw.fID === 'number') return raw.fID
    if (typeof raw.uID === 'number') return raw.uID
    if (typeof raw.gID === 'number') return raw.gID
    if (typeof raw.treeNodeID === 'number') return raw.treeNodeID
    if (typeof raw.treeID === 'number') return raw.treeID
  }
  return idx
}

export const useCcmsStore = create<CcmsState>((set, get) => ({
  sites: [],
  activeSiteId: null,
  resource: { kind: 'pages' },
  list: { items: [], loading: false, error: null, page: 1, search: '' },
  selectedDetail: null,

  loadSites: async () => {
    const sites = await ccms.listSites()
    set({ sites })
    const { activeSiteId } = get()
    if (!activeSiteId && sites.length > 0) set({ activeSiteId: sites[0].id })
  },

  setActiveSite: (id) => {
    set({
      activeSiteId: id,
      list: { items: [], loading: false, error: null, page: 1, search: '' },
      selectedDetail: null
    })
  },

  setResource: (resource) => {
    set({
      resource,
      list: { items: [], loading: false, error: null, page: 1, search: '' },
      selectedDetail: null
    })
  },

  setSearch: (search) => set(state => ({ list: { ...state.list, search, page: 1 } })),
  setPage: (page) => set(state => ({ list: { ...state.list, page } })),

  refreshList: async () => {
    const site = activeSite(get)
    if (!site) return
    const { resource, list } = get()
    set({ list: { ...list, loading: true, error: null } })
    try {
      let items: ListItem[] = []
      if (resource.kind === 'pages') {
        const r = await ccms.listPages({ site: site.name, search: list.search || undefined, page: list.page, perPage: 25 })
        if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
        else throw new Error(r.error)
      } else if (resource.kind === 'files') {
        const r = await ccms.listFiles({ site: site.name, search: list.search || undefined, page: list.page, perPage: 24 })
        if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
        else throw new Error(r.error)
      } else if (resource.kind === 'users') {
        const r = await ccms.listUsers({ site: site.name, search: list.search || undefined, page: list.page, perPage: 50 })
        if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
        else throw new Error(r.error)
      } else if (resource.kind === 'groups') {
        const r = await ccms.listGroups({ site: site.name, search: list.search || undefined, page: list.page, perPage: 50 })
        if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
        else throw new Error(r.error)
      } else if (resource.kind === 'topics') {
        if (resource.treeId === undefined) {
          const r = await ccms.listTopicTrees({ site: site.name })
          if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
          else throw new Error(r.error)
        } else {
          const r = await ccms.listTopics({ site: site.name, treeId: resource.treeId })
          if (r.ok) items = extractList(r.data).map((raw, i) => ({ id: pickId(raw, i), raw }))
          else throw new Error(r.error)
        }
      } else if (resource.kind === 'system') {
        const r = await ccms.getSystemInfo({ site: site.name })
        if (r.ok) items = [{ id: 'system', raw: r.data }]
        else throw new Error(r.error)
      }
      set(state => ({ list: { ...state.list, items, loading: false } }))
    } catch (err) {
      set(state => ({ list: { ...state.list, loading: false, error: (err as Error).message } }))
    }
  },

  selectItem: async (item) => {
    const site = activeSite(get)
    if (!site) return
    const { resource } = get()
    // For most resources, fetch the canonical detail by id. For system/topics-trees, we already have the row payload.
    if (resource.kind === 'pages' && typeof item.id === 'number') {
      const r = await ccms.getPage({ site: site.name, id: item.id })
      if (r.ok) { set({ selectedDetail: { id: item.id, raw: r.data } }); return }
    } else if (resource.kind === 'files' && typeof item.id === 'number') {
      const r = await ccms.getFile({ site: site.name, id: item.id })
      if (r.ok) { set({ selectedDetail: { id: item.id, raw: r.data } }); return }
    } else if (resource.kind === 'users' && typeof item.id === 'number') {
      const r = await ccms.getUser({ site: site.name, id: item.id })
      if (r.ok) { set({ selectedDetail: { id: item.id, raw: r.data } }); return }
    } else if (resource.kind === 'groups' && typeof item.id === 'number') {
      const r = await ccms.getGroup({ site: site.name, id: item.id })
      if (r.ok) { set({ selectedDetail: { id: item.id, raw: r.data } }); return }
    }
    set({ selectedDetail: { id: item.id, raw: item.raw } })
  },

  clearSelection: () => set({ selectedDetail: null })
}))
