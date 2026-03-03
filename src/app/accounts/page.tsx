'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Search, ExternalLink } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type AccountRow = {
  id: string
  name: string
  sector: string | null   // Segment client: Public / Semi-public / Privé
  segment: string | null  // Secteur d'activité: Industrie, Banque...
  region: string | null
}

type ContactRow = {
  id: string
  account_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SEGMENT_CLIENT_OPTIONS = ['Public', 'Semi-public', 'Privé'] as const
const REGION_OPTIONS = ['Rabat', 'Casablanca', 'Nord Ma', 'Sud Ma'] as const

const SEGMENT_STYLE: Record<string, { bg: string; text: string }> = {
  'Privé':       { bg: 'bg-blue-50',    text: 'text-blue-700'    },
  'Public':      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'Semi-public': { bg: 'bg-amber-50',   text: 'text-amber-700'   },
}

// ─── Mini components ──────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-medium text-slate-600">{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400 ${props.className || ''}`}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400 ${props.className || ''}`}
    />
  )
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
) {
  const v = props.variant || 'ghost'
  const cls =
    v === 'primary' ? 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900' :
    v === 'danger'  ? 'bg-red-600 text-white hover:bg-red-500 border-red-600' :
    'bg-white hover:bg-slate-50 border-slate-200'
  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors ${cls} ${props.className || ''}`}
    />
  )
}

function Chip({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium bg-${color}-100 text-${color}-700`}>{children}</span>
}

function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-slate-400 text-xs">—</span>
  const s = SEGMENT_STYLE[segment] || { bg: 'bg-slate-100', text: 'text-slate-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {segment}
    </span>
  )
}

function Modal({ open, title, children, onClose }: {
  open: boolean; title: string; children: React.ReactNode; onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 text-slate-600" onClick={onClose}>Fermer</button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(85vh-64px)]">{children}</div>
      </div>
    </div>
  )
}

function ConfirmModal(props: {
  open: boolean; title: string; message: string
  confirmLabel?: string; danger?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border">
        <div className="p-6">
          <div className="flex items-start gap-4">
            {props.danger && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <span style={{ fontSize: 20, color: '#dc2626' }}>⚠</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-slate-900">{props.title}</div>
              <div className="mt-1 text-sm text-slate-500 leading-relaxed whitespace-pre-line">{props.message}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button className="h-10 px-5 rounded-xl border text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={props.onCancel}>
            Annuler
          </button>
          <button
            className={`h-10 px-5 rounded-xl text-sm font-semibold text-white ${props.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}
            onClick={props.onConfirm}
          >
            {props.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

type ConfirmState = {
  open: boolean; title: string; message: string
  confirmLabel?: string; danger?: boolean; onConfirm: () => void
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const [accounts, setAccounts]   = useState<AccountRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState<string | null>(null)
  const [info, setInfo]           = useState<string | null>(null)

  // Deal counts per account
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({})

  // Filters
  const [search, setSearch]             = useState('')
  const [segFilter, setSegFilter]       = useState('Tous')
  const [regionFilter, setRegionFilter] = useState('Tous')

  // Add form
  const [name, setName]                 = useState('')
  const [segmentClient, setSegmentClient] = useState<(typeof SEGMENT_CLIENT_OPTIONS)[number]>('Privé')
  const [sectorActivite, setSectorActivite] = useState('')
  const [region, setRegion]             = useState<(typeof REGION_OPTIONS)[number]>('Rabat')

  // Edit modal
  const [editOpen, setEditOpen]         = useState(false)
  const [editRow, setEditRow]           = useState<AccountRow | null>(null)
  const [editName, setEditName]         = useState('')
  const [editSegmentClient, setEditSegmentClient] = useState<(typeof SEGMENT_CLIENT_OPTIONS)[number]>('Privé')
  const [editSectorActivite, setEditSectorActivite] = useState('')
  const [editRegion, setEditRegion]     = useState<(typeof REGION_OPTIONS)[number]>('Rabat')
  const [busyEdit, setBusyEdit]         = useState(false)

  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false, title: '', message: '', onConfirm: () => {}
  })

  // Contacts modal
  const [contactsOpen, setContactsOpen]       = useState(false)
  const [contactsAccount, setContactsAccount] = useState<AccountRow | null>(null)
  const [contacts, setContacts]               = useState<ContactRow[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [cFullName, setCFullName] = useState('')
  const [cEmail, setCEmail]       = useState('')
  const [cPhone, setCPhone]       = useState('')
  const [cRole, setCRole]         = useState('')
  const [cPrimary, setCPrimary]   = useState(false)

  const uniqueSectorActivite = useMemo(() => {
    const s = new Set<string>()
    for (const a of accounts) {
      if (a.segment && a.segment.trim()) s.add(a.segment.trim())
    }
    return Array.from(s).sort((x, y) => x.localeCompare(y))
  }, [accounts])

  function toast(msg: string) { setInfo(msg); setTimeout(() => setInfo(null), 3000) }

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadAccounts = async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('accounts').select('id,name,sector,segment,region').order('name', { ascending: true })
      if (error) throw error
      setAccounts((data || []) as AccountRow[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement comptes')
    } finally {
      setLoading(false)
    }
  }

  const loadDealCounts = async () => {
    const { data } = await supabase
      .from('opportunities')
      .select('account_id, status')
      .eq('status', 'Open')
    if (!data) return
    const counts: Record<string, number> = {}
    for (const d of data) {
      if (d.account_id) counts[d.account_id] = (counts[d.account_id] || 0) + 1
    }
    setDealCounts(counts)
  }

  useEffect(() => { loadAccounts(); loadDealCounts() }, [])

  // ── Add ────────────────────────────────────────────────────────────────────
  const existsExactName = (n: string, excludeId?: string) => {
    const x = n.trim().toLowerCase()
    if (!x) return false
    return accounts.some(a => a.id !== excludeId && (a.name || '').trim().toLowerCase() === x)
  }

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const n = name.trim()
    if (!n) return setErr('Client obligatoire.')
    if (!sectorActivite.trim()) return setErr('Secteur d\'activité obligatoire.')
    if (!region) return setErr('Région obligatoire.')
    if (existsExactName(n)) return setErr('Ce client existe déjà. Utilise l\'autocomplete pour éviter les doublons.')
    setLoading(true)
    try {
      const { error } = await supabase.from('accounts').insert({
        name: n, sector: segmentClient, segment: sectorActivite.trim(), region,
      })
      if (error) throw error
      setName(''); setSectorActivite(''); setSegmentClient('Privé'); setRegion('Rabat')
      toast(`${n} ajouté`)
      await loadAccounts(); await loadDealCounts()
    } catch (e: any) {
      setErr(e?.message || 'Erreur ajout compte')
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  const openEdit = (row: AccountRow) => {
    setErr(null); setEditRow(row)
    setEditName(row.name || '')
    setEditSegmentClient((row.sector as any) || 'Privé')
    setEditSectorActivite(row.segment || '')
    setEditRegion((row.region as any) || 'Rabat')
    setEditOpen(true)
  }

  const onSaveEdit = async () => {
    if (!editRow) return; setErr(null)
    const n = editName.trim()
    if (!n) return setErr('Client obligatoire.')
    if (!editSectorActivite.trim()) return setErr('Secteur d\'activité obligatoire.')
    if (!editRegion) return setErr('Région obligatoire.')
    if (existsExactName(n, editRow.id)) return setErr('Un autre compte existe déjà avec ce nom.')
    setBusyEdit(true)
    try {
      const { error } = await supabase.from('accounts').update({
        name: n, sector: editSegmentClient, segment: editSectorActivite.trim(), region: editRegion,
      }).eq('id', editRow.id)
      if (error) throw error
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('activity_log').insert({
          user_email: user.email, action_type: 'update', entity_type: 'account',
          entity_id: editRow.id, entity_name: n,
          detail: `${editSegmentClient} · ${editSectorActivite} · ${editRegion}`,
        })
      }
      setEditOpen(false); setEditRow(null)
      toast(`${n} mis à jour`)
      await loadAccounts()
    } catch (e: any) {
      setErr(e?.message || 'Erreur modification')
    } finally {
      setBusyEdit(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const friendlyDeleteError = (message: string) => {
    const m = (message || '').toLowerCase()
    if (m.includes('foreign key')) return 'Suppression impossible : ce client a des deals liés.\nSupprime ou réaffecte les deals d\'abord.'
    if (m.includes('row-level security')) return 'Suppression bloquée par la sécurité (RLS).'
    return message || 'Erreur suppression'
  }

  const deleteAccount = async (row: AccountRow) => {
    setConfirm({
      open: true,
      title: 'Confirmer la suppression',
      message: `Supprimer définitivement "${row.name}" ?\n\nSi ce client a des deals liés, la suppression sera refusée.`,
      confirmLabel: 'Supprimer définitivement',
      danger: true,
      onConfirm: async () => {
        setConfirm(c => ({ ...c, open: false })); setErr(null); setLoading(true)
        try {
          const { error } = await supabase.from('accounts').delete().eq('id', row.id)
          if (error) throw error
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('activity_log').insert({
              user_email: user.email, action_type: 'delete', entity_type: 'account',
              entity_id: row.id, entity_name: row.name,
              detail: `${row.sector || ''} · ${row.region || ''}`,
            })
          }
          if (editRow?.id === row.id) { setEditOpen(false); setEditRow(null) }
          if (contactsAccount?.id === row.id) { setContactsOpen(false); setContactsAccount(null); setContacts([]) }
          toast(`${row.name} supprimé`)
          await loadAccounts()
        } catch (e: any) {
          setErr(friendlyDeleteError(e?.message || 'Erreur suppression'))
        } finally {
          setLoading(false)
        }
      }
    })
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  const loadContacts = async (accountId: string) => {
    setContactsLoading(true); setErr(null)
    try {
      const { data, error } = await supabase.from('account_contacts')
        .select('id,account_id,full_name,email,phone,role,is_primary')
        .eq('account_id', accountId)
        .order('is_primary', { ascending: false })
        .order('full_name', { ascending: true })
      if (error) throw error
      setContacts((data || []) as ContactRow[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement contacts')
    } finally {
      setContactsLoading(false)
    }
  }

  const openContacts = async (row: AccountRow) => {
    setContactsAccount(row); setContactsOpen(true)
    setCFullName(''); setCEmail(''); setCPhone(''); setCRole(''); setCPrimary(false)
    await loadContacts(row.id)
  }

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactsAccount) return; setErr(null)
    const fn = cFullName.trim()
    if (!fn) return setErr('Nom du contact obligatoire.')
    setContactsLoading(true)
    try {
      if (cPrimary) {
        const r0 = await supabase.from('account_contacts').update({ is_primary: false }).eq('account_id', contactsAccount.id)
        if (r0.error) throw r0.error
      }
      const { error } = await supabase.from('account_contacts').insert({
        account_id: contactsAccount.id, full_name: fn,
        email: cEmail.trim() || null, phone: cPhone.trim() || null,
        role: cRole.trim() || null, is_primary: cPrimary,
      })
      if (error) throw error
      setCFullName(''); setCEmail(''); setCPhone(''); setCRole(''); setCPrimary(false)
      await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur ajout contact')
    } finally {
      setContactsLoading(false)
    }
  }

  const setPrimary = async (contactId: string) => {
    if (!contactsAccount) return; setErr(null); setContactsLoading(true)
    try {
      const r1 = await supabase.from('account_contacts').update({ is_primary: false }).eq('account_id', contactsAccount.id)
      if (r1.error) throw r1.error
      const r2 = await supabase.from('account_contacts').update({ is_primary: true }).eq('id', contactId)
      if (r2.error) throw r2.error
      await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur set principal')
    } finally {
      setContactsLoading(false)
    }
  }

  const deleteContact = async (row: ContactRow) => {
    if (!window.confirm(`Supprimer le contact "${row.full_name || ''}" ?`)) return
    setErr(null); setContactsLoading(true)
    try {
      const { error } = await supabase.from('account_contacts').delete().eq('id', row.id)
      if (error) throw error
      if (contactsAccount) await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur suppression contact')
    } finally {
      setContactsLoading(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const accountStats = useMemo(() => {
    const bySegment: Record<string, number> = {}
    const bySector: Record<string, number> = {}
    const byRegion: Record<string, number> = {}
    for (const a of accounts) {
      const seg = a.sector || 'Autre'
      bySegment[seg] = (bySegment[seg] || 0) + 1
      const sec = a.segment || 'Autre'
      bySector[sec] = (bySector[sec] || 0) + 1
      const reg = a.region || 'Autre'
      byRegion[reg] = (byRegion[reg] || 0) + 1
    }
    const topSectors = Object.entries(bySector).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const topRegions = Object.entries(byRegion).sort((a, b) => b[1] - a[1])
    return { total: accounts.length, bySegment, bySector, byRegion, topSectors, topRegions }
  }, [accounts])

  // ── Filtered list ──────────────────────────────────────────────────────────
  const displayAccounts = useMemo(() => {
    let r = [...accounts]
    const q = search.trim().toLowerCase()
    if (q) r = r.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.segment || '').toLowerCase().includes(q) ||
      (a.region || '').toLowerCase().includes(q)
    )
    if (segFilter !== 'Tous') r = r.filter(a => a.sector === segFilter)
    if (regionFilter !== 'Tous') r = r.filter(a => a.region === regionFilter)
    return r
  }, [accounts, search, segFilter, regionFilter])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Comptes</div>
            <div className="text-sm text-slate-500">Base clients CRM · {accountStats.total} comptes</div>
          </div>
          <Button onClick={() => { loadAccounts(); loadDealCounts() }} disabled={loading}>
            {loading ? 'Chargement…' : 'Rafraîchir'}
          </Button>
        </div>

        {err && (
          <div className="mt-4 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}
        {info && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>
        )}

        {/* ── KPIs ── */}
        {accounts.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Total clients</div>
                <div className="text-2xl font-bold text-slate-900">{accountStats.total}</div>
              </div>
              {Object.entries(accountStats.bySegment)
                .sort((a, b) => b[1] - a[1])
                .map(([seg, count]) => {
                  const s = SEGMENT_STYLE[seg] || { bg: 'bg-slate-50', text: 'text-slate-600' }
                  return (
                    <div key={seg} className={`rounded-2xl border p-4 shadow-sm ${s.bg}`}>
                      <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${s.text}`}>{seg}</div>
                      <div className={`text-2xl font-bold ${s.text}`}>{count}</div>
                      <div className={`text-xs mt-0.5 ${s.text} opacity-70`}>
                        {Math.round(count / accountStats.total * 100)}% du portefeuille
                      </div>
                    </div>
                  )
                })}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-3">Top secteurs d'activité</div>
                <div className="space-y-2">
                  {accountStats.topSectors.map(([sec, count]) => (
                    <div key={sec} className="flex items-center gap-3">
                      <div className="text-sm text-slate-700 w-36 truncate" title={sec}>{sec}</div>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-slate-800 transition-all"
                          style={{ width: `${Math.round(count / accountStats.total * 100)}%` }} />
                      </div>
                      <div className="text-xs font-medium text-slate-600 w-6 text-right">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-3">Répartition par région</div>
                <div className="space-y-2">
                  {accountStats.topRegions.map(([reg, count]) => (
                    <div key={reg} className="flex items-center gap-3">
                      <div className="text-sm text-slate-700 w-36 truncate">{reg}</div>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.round(count / accountStats.total * 100)}%` }} />
                      </div>
                      <div className="text-xs font-medium text-slate-600 w-6 text-right">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Add form ── */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">Ajouter un client</div>
          <form onSubmit={onAdd} className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <FieldLabel>Client *</FieldLabel>
              <Input placeholder="Ex: BKAM / APTIV" value={name} onChange={e => setName(e.target.value)} list="accounts_names" />
              <datalist id="accounts_names">{accounts.map(a => <option key={a.id} value={a.name} />)}</datalist>
              <div className="mt-1 text-[11px] text-slate-400">Tape quelques lettres pour éviter les doublons.</div>
            </div>
            <div>
              <FieldLabel>Segment client *</FieldLabel>
              <Select value={segmentClient} onChange={e => setSegmentClient(e.target.value as any)}>
                {SEGMENT_CLIENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Secteur d'activité *</FieldLabel>
              <Input placeholder="Industrie / Banque / Assurance…" value={sectorActivite}
                onChange={e => setSectorActivite(e.target.value)} list="sectors_list" />
              <datalist id="sectors_list">{uniqueSectorActivite.map(x => <option key={x} value={x} />)}</datalist>
              <div className="mt-1 text-[11px] text-slate-400">Nouveau secteur → disponible ensuite.</div>
            </div>
            <div>
              <FieldLabel>Région *</FieldLabel>
              <Select value={region} onChange={e => setRegion(e.target.value as any)}>
                {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="primary" type="submit" disabled={loading} className="w-full h-10">Ajouter</Button>
            </div>
          </form>
        </div>

        {/* ── List ── */}
        <div className="mt-4 rounded-2xl border bg-white shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="flex h-9 items-center gap-2 rounded-xl border bg-slate-50 px-3">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un compte…"
                className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
              )}
            </div>

            {/* Segment filter */}
            <div className="flex gap-1 rounded-xl border bg-slate-50 p-1">
              {['Tous', ...SEGMENT_CLIENT_OPTIONS].map(s => (
                <button key={s} onClick={() => setSegFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors
                    ${segFilter === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-white'}`}>
                  {s}
                </button>
              ))}
            </div>

            {/* Region filter */}
            <div className="flex gap-1 rounded-xl border bg-slate-50 p-1">
              {['Tous', ...REGION_OPTIONS].map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors
                    ${regionFilter === r ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-white'}`}>
                  {r}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs text-slate-400">
              {displayAccounts.length} compte{displayAccounts.length > 1 ? 's' : ''}
              {(search || segFilter !== 'Tous' || regionFilter !== 'Tous') && (
                <button onClick={() => { setSearch(''); setSegFilter('Tous'); setRegionFilter('Tous') }}
                  className="ml-2 text-blue-600 hover:underline">Réinitialiser</button>
              )}
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-3 text-left font-semibold">Client</th>
                  <th className="px-4 py-3 text-left font-semibold">Segment</th>
                  <th className="px-4 py-3 text-left font-semibold">Secteur d'activité</th>
                  <th className="px-4 py-3 text-left font-semibold">Région</th>
                  <th className="px-4 py-3 text-left font-semibold">Deals actifs</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      {accounts.length === 0 ? 'Aucun client pour l\'instant.' : 'Aucun résultat pour ces filtres.'}
                    </td>
                  </tr>
                ) : displayAccounts.map(a => {
                  const dealsCount = dealCounts[a.id] || 0
                  return (
                    <tr key={a.id} className="group hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{a.name}</div>
                      </td>
                      <td className="px-4 py-3"><SegmentBadge segment={a.sector} /></td>
                      <td className="px-4 py-3 text-slate-600">{a.segment || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{a.region || '—'}</td>
                      <td className="px-4 py-3">
                        {dealsCount > 0 ? (
                          <Link href={`/pipeline?account=${encodeURIComponent(a.name)}`}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                            {dealsCount} deal{dealsCount > 1 ? 's' : ''} <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button onClick={() => openEdit(a)}>Modifier</Button>
                          <Button onClick={() => openContacts(a)}>Contacts</Button>
                          <Button
                            variant="danger"
                            onClick={() => deleteAccount(a)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Supprimer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {displayAccounts.length > 0 && (
            <div className="border-t bg-slate-50/50 px-4 py-2.5 text-xs text-slate-400">
              {displayAccounts.length} compte{displayAccounts.length > 1 ? 's' : ''} affichés · {accounts.length} total
            </div>
          )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      <Modal open={editOpen} title={editRow ? `Modifier : ${editRow.name}` : 'Modifier'} onClose={() => setEditOpen(false)}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <FieldLabel>Client *</FieldLabel>
            <Input value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Segment client *</FieldLabel>
            <Select value={editSegmentClient} onChange={e => setEditSegmentClient(e.target.value as any)}>
              {SEGMENT_CLIENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Région *</FieldLabel>
            <Select value={editRegion} onChange={e => setEditRegion(e.target.value as any)}>
              {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Secteur d'activité *</FieldLabel>
            <Input value={editSectorActivite} onChange={e => setEditSectorActivite(e.target.value)} list="sectors_list_edit" />
            <datalist id="sectors_list_edit">{uniqueSectorActivite.map(x => <option key={x} value={x} />)}</datalist>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={onSaveEdit} disabled={busyEdit}>
              {busyEdit ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
          {editRow && (
            <Button variant="danger" onClick={() => deleteAccount(editRow)} disabled={busyEdit}>
              Supprimer le compte
            </Button>
          )}
        </div>
      </Modal>

      {/* ── Contacts modal ── */}
      <Modal
        open={contactsOpen}
        title={contactsAccount ? `Contacts — ${contactsAccount.name}` : 'Contacts'}
        onClose={() => { setContactsOpen(false); setContactsAccount(null); setContacts([]) }}
      >
        {contactsAccount && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {contactsAccount.sector && <Chip color="slate">{contactsAccount.sector}</Chip>}
              {contactsAccount.segment && <Chip color="slate">{contactsAccount.segment}</Chip>}
              {contactsAccount.region && <Chip color="slate">{contactsAccount.region}</Chip>}
              <div className="flex-1" />
              <Button onClick={() => loadContacts(contactsAccount.id)} disabled={contactsLoading}>
                {contactsLoading ? '…' : 'Rafraîchir'}
              </Button>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">Ajouter un contact</div>
              <form onSubmit={addContact} className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <FieldLabel>Nom *</FieldLabel>
                  <Input value={cFullName} onChange={e => setCFullName(e.target.value)} placeholder="Ex: Bounab Ikram" />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="ex@client.com" />
                </div>
                <div>
                  <FieldLabel>Téléphone</FieldLabel>
                  <Input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="06..." />
                </div>
                <div className="md:col-span-3">
                  <FieldLabel>Rôle</FieldLabel>
                  <Input value={cRole} onChange={e => setCRole(e.target.value)} placeholder="Responsable compte / Acheteur / DSI..." />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={cPrimary} onChange={e => setCPrimary(e.target.checked)} />
                    Principal
                  </label>
                  <Button variant="primary" type="submit" disabled={contactsLoading}>Ajouter</Button>
                </div>
              </form>
            </div>

            <div className="mt-4 rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Liste des contacts</div>
                <div className="text-xs text-slate-500">{contacts.length} contacts</div>
              </div>
              <div className="overflow-x-hidden">
                <table className="w-full table-fixed text-sm">
                  <thead className="text-left text-slate-500">
                    <tr className="border-b">
                      <th className="py-2 w-[22%]">Nom</th>
                      <th className="py-2 w-[20%]">Rôle</th>
                      <th className="py-2 w-[26%]">Email</th>
                      <th className="py-2 w-[14%]">Téléphone</th>
                      <th className="py-2 w-[8%]">Principal</th>
                      <th className="py-2 w-[10%]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id} className="border-b last:border-b-0">
                        <td className="py-2 font-medium text-slate-900 truncate" title={c.full_name || ''}>{c.full_name || '—'}</td>
                        <td className="py-2 truncate" title={c.role || ''}>{c.role || '—'}</td>
                        <td className="py-2 truncate" title={c.email || ''}>
                          {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a> : '—'}
                        </td>
                        <td className="py-2 truncate">
                          {c.phone ? <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline">{c.phone}</a> : '—'}
                        </td>
                        <td className="py-2">
                          {c.is_primary ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Oui</span> : <span className="text-slate-400">Non</span>}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {!c.is_primary && <Button onClick={() => setPrimary(c.id)}>Définir</Button>}
                            <Button variant="danger" onClick={() => deleteContact(c)}>Suppr.</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {contacts.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-slate-400">Aucun contact.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirm.open} title={confirm.title} message={confirm.message}
        confirmLabel={confirm.confirmLabel} danger={confirm.danger}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />
    </div>
  )
}
