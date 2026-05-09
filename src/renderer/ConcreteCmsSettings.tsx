import { useEffect, useState } from 'react'
import { ccms, SiteWithFlag, SiteUpsertInput } from './api'
import { STANDARD_CCMS_SCOPES } from '../shared/types'

const s: Record<string, React.CSSProperties> = {
  section: { marginBottom: 24 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)', marginBottom: 12 },
  card: { display: 'flex', flexDirection: 'column' as const, gap: 8, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-bg-secondary)', marginBottom: 12 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' },
  cardSub: { fontSize: 12, color: 'var(--color-text-muted)' },
  cardActions: { display: 'flex', gap: 8, marginLeft: 'auto' },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginTop: 8, display: 'block' },
  input: { width: '100%', padding: '6px 10px', background: 'var(--color-input-bg, var(--color-bg))', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: 13, boxSizing: 'border-box' as const, marginTop: 4 },
  btn: { padding: '6px 14px', background: 'var(--color-button-bg, var(--color-bg-secondary))', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnPrimary: { background: 'var(--color-accent, #4a8af4)', color: 'white', borderColor: 'var(--color-accent, #4a8af4)' },
  btnDanger: { color: 'var(--color-error, #e55)' },
  testOk: { fontSize: 12, color: 'var(--color-success, #3a3)', fontWeight: 500 },
  testFail: { fontSize: 12, color: 'var(--color-error, #e55)' },
  hint: { fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: 6 },
  scopeRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  scopeChip: { padding: '3px 10px', borderRadius: 999, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 11, color: 'var(--color-text-secondary)', cursor: 'pointer' },
  scopeChipActive: { background: 'var(--color-accent, #4a8af4)', color: 'white', borderColor: 'var(--color-accent, #4a8af4)' }
}

interface SiteFormState {
  id?: string
  name: string
  baseUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
}

const EMPTY_FORM: SiteFormState = {
  name: '',
  baseUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: ['system_info', 'page_read', 'file_read', 'user_read', 'group_read', 'topic_read']
}

export function ConcreteCmsSettings(): JSX.Element {
  const [sites, setSites] = useState<SiteWithFlag[]>([])
  const [editing, setEditing] = useState<SiteFormState | null>(null)
  const [adding, setAdding] = useState<SiteFormState | null>(null)

  const load = async (): Promise<void> => {
    const list = await ccms.listSites()
    setSites(list)
  }
  useEffect(() => { void load() }, [])

  return (
    <div style={s.section}>
      <div style={s.title}>Concrete CMS Sites</div>

      {sites.length === 0 && !adding && (
        <div style={s.cardSub}>No sites configured. Click "+ Add site" to connect one.</div>
      )}

      {sites.map(site => (
        <SiteCard
          key={site.id}
          site={site}
          editing={editing?.id === site.id ? editing : null}
          onEdit={() => setEditing({
            id: site.id,
            name: site.name,
            baseUrl: site.baseUrl,
            clientId: site.clientId,
            clientSecret: '',
            scopes: site.scopes
          })}
          onCancelEdit={() => setEditing(null)}
          onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
          allSites={sites}
          onSave={async () => {
            if (!editing) return
            const payload: SiteUpsertInput = {
              id: editing.id,
              name: editing.name,
              baseUrl: editing.baseUrl,
              clientId: editing.clientId,
              scopes: editing.scopes,
              clientSecret: editing.clientSecret || undefined
            }
            const r = await ccms.upsertSite(payload)
            if (!r.ok) { alert(r.error ?? 'Save failed.'); return }
            setEditing(null)
            await load()
          }}
          onRemove={async () => {
            if (!confirm(`Remove site "${site.name}" and its stored client secret?`)) return
            await ccms.removeSite(site.id)
            await load()
          }}
          onRefreshDiscovery={async () => {
            const r = await ccms.refreshDiscovery(site.id)
            if (!r.ok) alert(r.error)
            await load()
          }}
        />
      ))}

      {adding ? (
        <SiteEditor
          form={adding}
          onChange={(patch) => setAdding(prev => prev ? { ...prev, ...patch } : prev)}
          allSites={sites}
          isNew={true}
          onCancel={() => setAdding(null)}
          onSave={async () => {
            if (!adding) return
            const payload: SiteUpsertInput = {
              name: adding.name,
              baseUrl: adding.baseUrl,
              clientId: adding.clientId,
              scopes: adding.scopes,
              clientSecret: adding.clientSecret || undefined
            }
            const r = await ccms.upsertSite(payload)
            if (!r.ok) { alert(r.error ?? 'Save failed.'); return }
            setAdding(null)
            await load()
          }}
        />
      ) : (
        <button style={s.btn} onClick={() => setAdding({ ...EMPTY_FORM })}>+ Add site</button>
      )}

      <div style={{ ...s.hint, marginTop: 24 }}>
        Site metadata (name, URL, client ID, requested scopes) is saved in <code>.projectrose/config.json</code> and can be committed to your project.
        Client secrets are stored separately in your local userData and are never committed.
      </div>
    </div>
  )
}

interface SiteCardProps {
  site: SiteWithFlag
  editing: SiteFormState | null
  allSites: SiteWithFlag[]
  onEdit: () => void
  onCancelEdit: () => void
  onChange: (patch: Partial<SiteFormState>) => void
  onSave: () => void
  onRemove: () => void
  onRefreshDiscovery: () => void
}

function SiteCard({ site, editing, allSites, onEdit, onCancelEdit, onChange, onSave, onRemove, onRefreshDiscovery }: SiteCardProps): JSX.Element {
  const identityText = site.discovery?.identity
    ? `Connected as ${site.discovery.identity.name}`
    : (site.hasClientSecret ? 'Not yet tested' : 'No client secret set')
  const ptCount = site.discovery?.pageTypes.length ?? 0
  const ptmplCount = site.discovery?.pageTemplates.length ?? 0
  const akCount = site.discovery?.attributeKeys.length ?? 0
  const trCount = site.discovery?.topicTrees.length ?? 0

  if (editing) {
    return (
      <div style={s.card}>
        <SiteEditor form={editing} onChange={onChange} allSites={allSites} isNew={false} onCancel={onCancelEdit} onSave={onSave} />
      </div>
    )
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <div>
          <div style={s.cardTitle}>{site.name}</div>
          <div style={s.cardSub}>{site.baseUrl} · clientId: {site.clientId}</div>
          <div style={s.cardSub}>
            {identityText}
            {site.discovery && ` · ${ptCount} page types · ${ptmplCount} templates · ${akCount} attribute keys · ${trCount} topic trees`}
          </div>
          <div style={{ ...s.cardSub, marginTop: 4 }}>
            scopes: {site.scopes.join(', ') || '(none)'}
          </div>
        </div>
        <div style={s.cardActions}>
          <button style={s.btn} onClick={onRefreshDiscovery}>Refresh</button>
          <button style={s.btn} onClick={onEdit}>Edit</button>
          <button style={{ ...s.btn, ...s.btnDanger }} onClick={onRemove}>Remove</button>
        </div>
      </div>
    </div>
  )
}

interface SiteEditorProps {
  form: SiteFormState
  allSites: SiteWithFlag[]
  isNew: boolean
  onChange: (patch: Partial<SiteFormState>) => void
  onCancel: () => void
  onSave: () => void
}

function SiteEditor({ form, allSites, isNew, onChange, onCancel, onSave }: SiteEditorProps): JSX.Element {
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({ state: 'idle' })

  const trimmedName = form.name.trim()
  const dupName = allSites.some(s => s.name === trimmedName && s.id !== form.id)
  const validUrl = /^https?:\/\/.+/i.test(form.baseUrl.trim())
  const isLocalhost = (() => {
    try {
      const u = new URL(form.baseUrl.trim())
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    } catch { return false }
  })()
  const isHttp = form.baseUrl.trim().toLowerCase().startsWith('http://')
  const httpAllowed = isHttp ? isLocalhost : true

  const canSave = !!trimmedName && !dupName && validUrl && httpAllowed && !!form.clientId.trim() && (!isNew || !!form.clientSecret) && form.scopes.length > 0

  const integrationsUrl = (() => {
    try {
      return new URL('/dashboard/system/api/integrations', form.baseUrl.trim()).toString()
    } catch { return null }
  })()

  function toggleScope(scope: string): void {
    if (form.scopes.includes(scope)) onChange({ scopes: form.scopes.filter(x => x !== scope) })
    else onChange({ scopes: [...form.scopes, scope] })
  }

  return (
    <div style={isNew ? s.card : undefined}>
      {isNew && <div style={s.cardTitle}>Add Concrete CMS site</div>}

      <label style={s.label}>Friendly name *</label>
      <input style={s.input} placeholder="Main site" value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
      {dupName && <div style={s.testFail}>A site with this name already exists.</div>}

      <label style={s.label}>Base URL * (must be https:// unless localhost)</label>
      <input style={s.input} placeholder="https://example.com" value={form.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} />
      {!validUrl && form.baseUrl.length > 0 && <div style={s.testFail}>URL must start with http:// or https://.</div>}
      {isHttp && !isLocalhost && <div style={s.testFail}>HTTP is only allowed for localhost. Use HTTPS for remote sites.</div>}

      <label style={s.label}>Client ID *</label>
      <input style={s.input} placeholder="from your CCMS API integration" value={form.clientId} onChange={(e) => onChange({ clientId: e.target.value })} />

      <label style={s.label}>Client Secret{isNew ? ' *' : ' (leave blank to keep existing)'}</label>
      <input style={s.input} type="password" placeholder="from your CCMS API integration" value={form.clientSecret} onChange={(e) => onChange({ clientSecret: e.target.value })} />
      {integrationsUrl && (
        <div style={s.hint}>
          Create an integration at <a href={integrationsUrl} target="_blank" rel="noopener noreferrer">{integrationsUrl}</a> on the site.
        </div>
      )}

      <label style={s.label}>Scopes *</label>
      <div style={s.scopeRow}>
        {STANDARD_CCMS_SCOPES.map(scope => {
          const active = form.scopes.includes(scope)
          return (
            <button
              key={scope}
              type="button"
              style={{ ...s.scopeChip, ...(active ? s.scopeChipActive : {}) }}
              onClick={() => toggleScope(scope)}
            >
              {scope}
            </button>
          )
        })}
      </div>
      <div style={s.hint}>Select the scopes the integration was granted in the CCMS dashboard.</div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{ ...s.btn, ...s.btnPrimary }} disabled={!canSave} onClick={onSave}>Save</button>
        <button style={s.btn} onClick={onCancel}>Cancel</button>
        <button
          style={s.btn}
          disabled={!validUrl || !form.clientId || !form.clientSecret || form.scopes.length === 0}
          onClick={async () => {
            setTest({ state: 'testing' })
            const r = await ccms.testConnection({
              baseUrl: form.baseUrl.trim(),
              clientId: form.clientId.trim(),
              clientSecret: form.clientSecret,
              scopes: form.scopes
            })
            if (r.ok) {
              const id = r.identity?.name ?? '?'
              const warns = r.scopeWarnings && r.scopeWarnings.length > 0
                ? ` · missing scopes: ${r.scopeWarnings.join(', ')}`
                : ''
              setTest({
                state: 'ok',
                message: `Connected as ${id} · ${r.pageTypeCount ?? 0} page types · ${r.pageTemplateCount ?? 0} templates · ${r.attributeKeyCount ?? 0} attribute keys · ${r.topicTreeCount ?? 0} topic trees${warns}`
              })
            } else {
              setTest({ state: 'fail', message: r.error })
            }
          }}>
          Test connection
        </button>
        {test.state === 'testing' && <span style={s.cardSub}>Testing…</span>}
        {test.state === 'ok' && <span style={s.testOk}>{test.message}</span>}
        {test.state === 'fail' && <span style={s.testFail}>{test.message}</span>}
      </div>
    </div>
  )
}
