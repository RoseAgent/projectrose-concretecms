import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useCcmsStore, ResourceKind } from './store'
import { ccms, SiteWithFlag } from './api'
import styles from './ConcreteCmsView.module.css'

interface SidebarItem {
  key: string
  label: string
  resource: ResourceKind
}

const STATIC_ITEMS: SidebarItem[] = [
  { key: 'pages',  label: 'Pages',  resource: { kind: 'pages' } },
  { key: 'files',  label: 'Files',  resource: { kind: 'files' } },
  { key: 'users',  label: 'Users',  resource: { kind: 'users' } },
  { key: 'groups', label: 'Groups', resource: { kind: 'groups' } },
  { key: 'system', label: 'System Info', resource: { kind: 'system' } }
]

function activeSiteOf(sites: SiteWithFlag[], id: string | null): SiteWithFlag | null {
  return sites.find(s => s.id === id) ?? null
}

function isResourceActive(a: ResourceKind, b: ResourceKind): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'topics' && b.kind === 'topics') return a.treeId === b.treeId
  return true
}

export function ConcreteCmsView(): JSX.Element {
  const {
    sites, activeSiteId, resource, list, selectedDetail,
    loadSites, setActiveSite, setResource, setSearch, refreshList, selectItem
  } = useCcmsStore()

  const [statusText, setStatusText] = useState<string>('')

  useEffect(() => { void loadSites() }, [loadSites])
  useEffect(() => {
    if (activeSiteId) void refreshList()
  }, [activeSiteId, resource, list.search, list.page, refreshList])

  const site = activeSiteOf(sites, activeSiteId)
  const topicTrees = useMemo(() => site?.discovery?.topicTrees ?? [], [site])
  const pageTypes = useMemo(() => site?.discovery?.pageTypes ?? [], [site])

  if (sites.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div style={{ textAlign: 'center' }}>
            <p>No Concrete CMS sites configured.</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Open the Concrete CMS Settings page to add one.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <select value={activeSiteId ?? ''} onChange={(e) => setActiveSite(e.target.value || null)}>
          {sites.map(s => (
            <option key={s.id} value={s.id}>{s.name}{!s.hasClientSecret ? ' (no secret)' : ''}</option>
          ))}
        </select>
        <button onClick={() => void refreshList()}>Refresh</button>
        <span className={styles.spacer} />
        <button
          onClick={async () => {
            if (!site) return
            setStatusText('Refreshing discovery…')
            const r = await ccms.refreshDiscovery(site.id)
            if (r.ok) {
              setStatusText('Discovery refreshed.')
              await loadSites()
            } else {
              setStatusText(r.error ?? 'Discovery failed.')
            }
            setTimeout(() => setStatusText(''), 3000)
          }}
          title="Re-fetch page types, templates, attribute keys, and topic trees for this site"
        >
          Refresh discovery
        </button>
        {statusText && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{statusText}</span>}
      </div>

      {site?.discovery && site.discovery.grantedScopes.length < site.scopes.length && (
        <div className={styles.scopeBanner}>
          Some configured scopes were rejected by the API integration: {site.scopes.filter(s => !site.discovery?.grantedScopes.includes(s)).join(', ')}.
          Edit the integration in the Concrete CMS dashboard, then click Refresh discovery.
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.sidebar}>
          {STATIC_ITEMS.map(item => (
            <button key={item.key}
              className={clsx(styles.sidebarItem, isResourceActive(resource, item.resource) && styles.sidebarItemActive)}
              onClick={() => setResource(item.resource)}>
              {item.label}
            </button>
          ))}
          {topicTrees.length > 0 && <div className={styles.sidebarSection}>Topics</div>}
          {topicTrees.map(t => (
            <button key={t.id}
              className={clsx(styles.sidebarItem, resource.kind === 'topics' && resource.treeId === t.id && styles.sidebarItemActive)}
              onClick={() => setResource({ kind: 'topics', treeId: t.id })}>
              {t.name}
            </button>
          ))}
          {pageTypes.length > 0 && (
            <>
              <div className={styles.sidebarSection}>Page Types</div>
              {pageTypes.map(t => (
                <div key={t.handle} className={styles.sidebarItem} style={{ cursor: 'default', fontSize: 11 }}>
                  {t.name} <span style={{ color: 'var(--color-text-muted)' }}>({t.handle})</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className={styles.list}>
          <div className={styles.listFilters}>
            <input
              placeholder="Search…"
              value={list.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {list.error && <div className={styles.errorBanner}>{list.error}</div>}
          <div className={styles.listScroll}>
            {list.loading && <div className={styles.empty}>Loading…</div>}
            {!list.loading && list.items.length === 0 && !list.error && (
              <div className={styles.empty}>No items.</div>
            )}
            {!list.loading && list.items.map((item, idx) => {
              const raw = item.raw as Record<string, unknown>
              const title = pickTitle(raw) || `id=${item.id}`
              const meta = pickMeta(raw, resource)
              const isActive = selectedDetail?.id === item.id
              return (
                <div key={`${item.id}-${idx}`}
                  className={clsx(styles.row, isActive && styles.rowActive)}
                  onClick={() => void selectItem(item)}>
                  <div className={styles.rowTitle}>{title}</div>
                  <div className={styles.rowMeta}>
                    <span>id: {String(item.id)}</span>
                    {meta.map((m, i) => (
                      <span key={i} className={styles.statusBadge}>{m}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className={styles.detail}>
          {!selectedDetail ? (
            <div className={styles.empty}>Select an item to view its full record.</div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.detailTitle}>
                  {pickTitle(selectedDetail.raw) || `id=${selectedDetail.id}`}
                </div>
                <div className={styles.detailSub}>id: {String(selectedDetail.id)}</div>
              </div>
              <div className={styles.detailBody}>
                <pre className={styles.detailJson}>{JSON.stringify(selectedDetail.raw, null, 2)}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function pickTitle(raw: Record<string, unknown>): string {
  return (
    (raw.name as string | undefined) ??
    (raw.cName as string | undefined) ??
    (raw.title as string | undefined) ??
    (raw.fileName as string | undefined) ??
    (raw.username as string | undefined) ??
    (raw.uName as string | undefined) ??
    (raw.gName as string | undefined) ??
    (raw.treeNodeName as string | undefined) ??
    (raw.treeName as string | undefined) ??
    ''
  )
}

function pickMeta(raw: Record<string, unknown>, resource: ResourceKind): string[] {
  const out: string[] = []
  if (resource.kind === 'pages') {
    if (raw.isInTrash) out.push('trashed')
    else if (raw.isDraft) out.push('draft')
    else out.push((raw.status as string | undefined) ?? 'published')
    const type = (raw.pageType as string | undefined) ?? (raw.ptHandle as string | undefined)
    if (type) out.push(type)
  } else if (resource.kind === 'files') {
    const ext = (raw.fvExtension as string | undefined) ?? (raw.type as string | undefined)
    if (ext) out.push(ext)
  } else if (resource.kind === 'users') {
    const email = (raw.email as string | undefined) ?? (raw.uEmail as string | undefined)
    if (email) out.push(email)
  }
  return out
}
