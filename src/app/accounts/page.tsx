'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Search, ExternalLink, Users, Building2, MapPin, RefreshCw, Plus, X, Pencil, Trash2, Star, Phone, Mail, ChevronDown, ArrowUp, ArrowDown, ChevronsUpDown, GitBranch } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type AccountRow = { id: string; name: string; sector: string|null; segment: string|null; region: string|null; created_at: string|null }
type ContactRow = { id: string; account_id: string; full_name: string|null; email: string|null; phone: string|null; role: string|null; is_primary: boolean }

const SEGMENT_OPTIONS = ['Public', 'Semi-public', 'Privé'] as const
const REGION_OPTIONS  = ['Rabat', 'Casablanca', 'Nord Ma', 'Sud Ma'] as const

const SEG_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'Privé':       { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  'Public':      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Semi-public': { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
}

// ─── Small components ─────────────────────────────────────────────────────────
function SegBadge({ seg }: { seg: string|null }) {
  if (!seg) return <span className="text-slate-300 text-xs">—</span>
  const s = SEG_STYLE[seg] || { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{seg}
    </span>
  )
}

function FL({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      {children}
    </div>
  )
}
const inputCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400"
const selectCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 appearance-none"

function Btn({ children, variant = 'ghost', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'ghost'|'danger'|'outline'; size?: 'sm'|'md' }) {
  const vCls = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900',
    ghost:   'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
    outline: 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200',
    danger:  'bg-red-600 text-white hover:bg-red-700 border-red-600',
  }[variant]
  const szCls = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-50 ${vCls} ${szCls} ${props.className || ''}`}>
      {children}
    </button>
  )
}

function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="text-base font-bold text-slate-900">{title}</div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function ConfirmDialog({ open, title, msg, danger, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; msg: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 p-6">
        <div className="text-base font-bold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-500 leading-relaxed whitespace-pre-line">{msg}</div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel || 'Confirmer'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState<string|null>(null)
  const [toast, setToast]       = useState<string|null>(null)
  const [dealCounts, setDealCounts]   = useState<Record<string, number>>({})
  const [wonAmtMap, setWonAmtMap]     = useState<Record<string, number>>({})
  const [lastDealMap, setLastDealMap] = useState<Record<string, string>>({})

  // Filters
  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState('Tous')
  const [regFilter, setRegFilter] = useState('Tous')

  // Add form
  const [aName, setAName]       = useState('')
  const [aSeg, setASeg]         = useState<typeof SEGMENT_OPTIONS[number]>('Privé')
  const [aSector, setASector]   = useState('')
  const [aRegion, setARegion]   = useState<typeof REGION_OPTIONS[number]>('Rabat')
  const [showAddForm, setShowAddForm] = useState(false)

  // Edit modal
  const [editOpen, setEditOpen]     = useState(false)
  const [editRow, setEditRow]       = useState<AccountRow|null>(null)
  const [eName, setEName]           = useState('')
  const [eSeg, setESeg]             = useState<typeof SEGMENT_OPTIONS[number]>('Privé')
  const [eSector, setESector]       = useState('')
  const [eRegion, setERegion]       = useState<typeof REGION_OPTIONS[number]>('Rabat')
  const [busyEdit, setBusyEdit]     = useState(false)

  // Contacts modal
  const [contOpen, setContOpen]     = useState(false)
  const [contAccount, setContAccount] = useState<AccountRow|null>(null)
  const [contacts, setContacts]     = useState<ContactRow[]>([])
  const [contLoading, setContLoading] = useState(false)
  const [cName, setCName]           = useState('')
  const [cEmail, setCEmail]         = useState('')
  const [cPhone, setCPhone]         = useState('')
  const [cRole, setCRole]           = useState('')
  const [cPrimary, setCPrimary]     = useState(false)

  // Confirm
  const [confirm, setConfirm] = useState({ open: false, title: '', msg: '', danger: false, confirmLabel: '', onConfirm: () => {} })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const uniqueSectors = useMemo(() => [...new Set(accounts.map(a => a.segment).filter(Boolean) as string[])].sort(), [accounts])

  // Date filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Sort
  const [sortKey, setSortKey] = useState<'created_at'|'name'|'sector'|'segment'|'region'|'deals'|'won_amt'|'last_deal'>('name')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const existsName = (n: string, excludeId?: string) => accounts.some(a => a.id !== excludeId && (a.name || '').trim().toLowerCase() === n.trim().toLowerCase())

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true); setErr(null)
    try {
      const [{ data: acc, error: e1 }, { data: opps }] = await Promise.all([
        supabase.from('accounts').select('id,name,sector,segment,region,created_at').order('name'),
        supabase.from('opportunities').select('account_id,status,amount,booking_month,created_at'),
      ])
      if (e1) throw e1
      setAccounts((acc || []) as AccountRow[])

      // ── Build maps from all opportunities ──────────────────────────────────
      const counts: Record<string, number>  = {}
      const wonAmt: Record<string, number>  = {}
      const lastDeal: Record<string, string> = {}

      for (const d of opps || []) {
        const aid = d.account_id; if (!aid) continue
        // Active pipeline count (Open only)
        if (d.status === 'Open') counts[aid] = (counts[aid] || 0) + 1
        // Won CA
        if (d.status === 'Won') wonAmt[aid] = (wonAmt[aid] || 0) + (d.amount || 0)
        // Last deal date (booking_month or created_at, keep most recent)
        const dateKey = d.booking_month || (d.created_at || '').slice(0, 7)
        if (dateKey && (!lastDeal[aid] || dateKey > lastDeal[aid])) lastDeal[aid] = dateKey
      }

      setDealCounts(counts)
      setWonAmtMap(wonAmt)
      setLastDealMap(lastDeal)
    } catch (e: any) { setErr(e?.message || 'Erreur chargement') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadAll() }, [])

  // ── Add ──────────────────────────────────────────────────────────────────
  const onAdd = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErr(null)
    const n = aName.trim()
    if (!n) return setErr('Nom du client obligatoire')
    if (!aSector.trim()) return setErr('Secteur d\'activité obligatoire')
    if (existsName(n)) return setErr('Ce client existe déjà.')
    setLoading(true)
    try {
      const { error } = await supabase.from('accounts').insert({ name: n, sector: aSeg, segment: aSector.trim(), region: aRegion })
      if (error) throw error
      setAName(''); setASector('')
      setShowAddForm(false)
      showToast(`✓ ${n} ajouté`)
      await loadAll()
    } catch (e: any) { setErr(e?.message) }
    finally { setLoading(false) }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  const openEdit = (row: AccountRow) => {
    setEditRow(row); setEName(row.name); setESeg((row.sector as any) || 'Privé')
    setESector(row.segment || ''); setERegion((row.region as any) || 'Rabat')
    setErr(null); setEditOpen(true)
  }
  const onSaveEdit = async () => {
    if (!editRow) return; setErr(null)
    const n = eName.trim()
    if (!n || !eSector.trim()) return setErr('Nom et secteur obligatoires')
    if (existsName(n, editRow.id)) return setErr('Un autre compte existe déjà avec ce nom.')
    setBusyEdit(true)
    try {
      const { error } = await supabase.from('accounts').update({ name: n, sector: eSeg, segment: eSector.trim(), region: eRegion }).eq('id', editRow.id)
      if (error) throw error
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_log').insert({ user_email: user.email, action_type: 'update', entity_type: 'account', entity_id: editRow.id, entity_name: n, detail: `${eSeg} · ${eSector} · ${eRegion}` })
      setEditOpen(false); setEditRow(null)
      showToast(`✓ ${n} mis à jour`)
      await loadAll()
    } catch (e: any) { setErr(e?.message) }
    finally { setBusyEdit(false) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteAccount = (row: AccountRow) => {
    setConfirm({
      open: true, title: 'Supprimer le client', danger: true, confirmLabel: 'Supprimer',
      msg: `Supprimer définitivement "${row.name}" ?\n\nLes deals liés bloqueront la suppression.`,
      onConfirm: async () => {
        setConfirm(c => ({ ...c, open: false })); setErr(null); setLoading(true)
        try {
          const { error } = await supabase.from('accounts').delete().eq('id', row.id)
          if (error) {
            const m = (error.message || '').toLowerCase()
            throw new Error(m.includes('foreign key') ? 'Suppression impossible : ce client a des deals liés.' : error.message)
          }
          const { data: { user } } = await supabase.auth.getUser()
          if (user) await supabase.from('activity_log').insert({ user_email: user.email, action_type: 'delete', entity_type: 'account', entity_id: row.id, entity_name: row.name, detail: `${row.sector || ''} · ${row.region || ''}` })
          if (editRow?.id === row.id) { setEditOpen(false); setEditRow(null) }
          showToast(`✓ ${row.name} supprimé`)
          await loadAll()
        } catch (e: any) { setErr(e?.message) }
        finally { setLoading(false) }
      }
    })
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  const loadContacts = async (accountId: string) => {
    setContLoading(true)
    try {
      const { data, error } = await supabase.from('account_contacts').select('id,account_id,full_name,email,phone,role,is_primary').eq('account_id', accountId).order('is_primary', { ascending: false }).order('full_name')
      if (error) throw error
      setContacts((data || []) as ContactRow[])
    } catch (e: any) { setErr(e?.message) }
    finally { setContLoading(false) }
  }
  const openContacts = async (row: AccountRow) => {
    setContAccount(row); setContOpen(true)
    setCName(''); setCEmail(''); setCPhone(''); setCRole(''); setCPrimary(false)
    await loadContacts(row.id)
  }
  const addContact = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!contAccount || !cName.trim()) return
    setContLoading(true)
    try {
      if (cPrimary) await supabase.from('account_contacts').update({ is_primary: false }).eq('account_id', contAccount.id)
      const { error } = await supabase.from('account_contacts').insert({ account_id: contAccount.id, full_name: cName.trim(), email: cEmail.trim() || null, phone: cPhone.trim() || null, role: cRole.trim() || null, is_primary: cPrimary })
      if (error) throw error
      setCName(''); setCEmail(''); setCPhone(''); setCRole(''); setCPrimary(false)
      await loadContacts(contAccount.id)
    } catch (e: any) { setErr(e?.message) }
    finally { setContLoading(false) }
  }
  const setPrimary = async (contactId: string) => {
    if (!contAccount) return; setContLoading(true)
    try {
      await supabase.from('account_contacts').update({ is_primary: false }).eq('account_id', contAccount.id)
      await supabase.from('account_contacts').update({ is_primary: true }).eq('id', contactId)
      await loadContacts(contAccount.id)
    } catch (e: any) { setErr(e?.message) }
    finally { setContLoading(false) }
  }
  const deleteContact = (row: ContactRow) => {
    setConfirm({
      open: true, title: 'Supprimer le contact', danger: true, confirmLabel: 'Supprimer',
      msg: `Supprimer "${row.full_name}" ?`,
      onConfirm: async () => {
        setConfirm(c => ({ ...c, open: false }))
        if (!contAccount) return; setContLoading(true)
        try {
          await supabase.from('account_contacts').delete().eq('id', row.id)
          await loadContacts(contAccount.id)
        } catch (e: any) { setErr(e?.message) }
        finally { setContLoading(false) }
      }
    })
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const bySeg: Record<string, number> = {}; const byReg: Record<string, number> = {}; const bySector: Record<string, number> = {}
    for (const a of accounts) {
      const seg = a.sector || 'Autre'; bySeg[seg] = (bySeg[seg] || 0) + 1
      const reg = a.region || 'Autre'; byReg[reg] = (byReg[reg] || 0) + 1
      const sec = a.segment || 'Autre'; bySector[sec] = (bySector[sec] || 0) + 1
    }
    return { total: accounts.length, bySeg, byReg, topSectors: Object.entries(bySector).sort((a,b)=>b[1]-a[1]).slice(0,6), topRegs: Object.entries(byReg).sort((a,b)=>b[1]-a[1]) }
  }, [accounts])

  // ── Filtered + Sorted ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter(a =>
      (!q || (a.name||'').toLowerCase().includes(q) || (a.segment||'').toLowerCase().includes(q) || (a.region||'').toLowerCase().includes(q)) &&
      (segFilter === 'Tous' || a.sector === segFilter) &&
      (regFilter === 'Tous' || a.region === regFilter) &&
      (!dateFrom || (a.created_at || '') >= dateFrom) &&
      (!dateTo   || (a.created_at || '') <= dateTo + 'T23:59:59')
    )
  }, [accounts, search, segFilter, regFilter, dateFrom, dateTo])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'name':       va = a.name||'';       vb = b.name||'';       break
        case 'sector':     va = a.sector||'';     vb = b.sector||'';     break
        case 'segment':    va = a.segment||'';    vb = b.segment||'';    break
        case 'region':     va = a.region||'';     vb = b.region||'';     break
        case 'deals':      va = dealCounts[a.id]||0; vb = dealCounts[b.id]||0; break
        case 'won_amt':    va = wonAmtMap[a.id]||0; vb = wonAmtMap[b.id]||0; break
        case 'last_deal':  va = lastDealMap[a.id]||''; vb = lastDealMap[b.id]||''; break
        case 'created_at': va = a.created_at||''; vb = b.created_at||''; break
        default:           va = a.name||'';       vb = b.name||''
      }
      if (typeof va === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb), 'fr')
    })
  }, [filtered, sortKey, sortDir, dealCounts, wonAmtMap, lastDealMap])

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Comptes</h1>
              <p className="text-xs text-slate-500">Base clients CRM · {stats.total} comptes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={loadAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Btn>
            <Btn variant="primary" onClick={() => setShowAddForm(v => !v)}>
              <Plus className="h-4 w-4" />
              Ajouter un client
            </Btn>
          </div>
        </div>

        {/* ── TOAST / ERR ── */}
        {toast && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}
        {err && <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        {/* ── KPI STRIP ── */}
        {stats.total > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total</div>
              <div className="mt-1 text-3xl font-black text-slate-900">{stats.total}</div>
              <div className="mt-0.5 text-xs text-slate-500">comptes actifs</div>
            </div>
            {Object.entries(stats.bySeg).sort((a,b)=>b[1]-a[1]).map(([seg, cnt]) => {
              const s = SEG_STYLE[seg] || { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' }
              return (
                <div key={seg} className={`rounded-2xl ring-1 ring-slate-200 shadow-sm p-4 ${s.bg}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${s.text}`}>{seg}</div>
                  <div className={`mt-1 text-3xl font-black ${s.text}`}>{cnt}</div>
                  <div className={`mt-0.5 text-xs ${s.text} opacity-70`}>{Math.round(cnt/stats.total*100)}% du portefeuille</div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── BARS SECTEUR / RÉGION ── */}
        {stats.total > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="mb-3 text-sm font-bold text-slate-900">Top secteurs d'activité</div>
              <div className="space-y-2.5">
                {stats.topSectors.map(([sec, cnt]) => (
                  <div key={sec} className="flex items-center gap-3">
                    <div className="w-36 truncate text-xs text-slate-700 font-medium" title={sec}>{sec}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${Math.round(cnt/stats.total*100)}%` }} />
                    </div>
                    <div className="w-6 text-right text-xs font-semibold text-slate-600">{cnt}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="mb-3 text-sm font-bold text-slate-900">Répartition par région</div>
              <div className="space-y-2.5">
                {stats.topRegs.map(([reg, cnt]) => (
                  <div key={reg} className="flex items-center gap-3">
                    <div className="w-36 text-xs text-slate-700 font-medium">{reg}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round(cnt/stats.total*100)}%` }} />
                    </div>
                    <div className="w-6 text-right text-xs font-semibold text-slate-600">{cnt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ADD FORM ── */}
        {showAddForm && (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="text-sm font-bold text-slate-900">Nouveau client</div>
              <button onClick={() => setShowAddForm(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onAdd} className="p-5 grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <FL label="Client" required>
                  <input className={inputCls} placeholder="Ex: BKAM, OCP, Aptiv…" value={aName} onChange={e => setAName(e.target.value)} list="acc_names" />
                  <datalist id="acc_names">{accounts.map(a => <option key={a.id} value={a.name} />)}</datalist>
                  <div className="mt-1 text-[11px] text-slate-400">Tape pour éviter les doublons.</div>
                </FL>
              </div>
              <div>
                <FL label="Segment" required>
                  <div className="relative">
                    <select className={selectCls} value={aSeg} onChange={e => setASeg(e.target.value as any)}>
                      {SEGMENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </FL>
              </div>
              <div>
                <FL label="Secteur d'activité" required>
                  <input className={inputCls} placeholder="Banque / Industrie…" value={aSector} onChange={e => setASector(e.target.value)} list="sectors_add" />
                  <datalist id="sectors_add">{uniqueSectors.map(x => <option key={x} value={x} />)}</datalist>
                </FL>
              </div>
              <div>
                <FL label="Région" required>
                  <div className="relative">
                    <select className={selectCls} value={aRegion} onChange={e => setARegion(e.target.value as any)}>
                      {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </FL>
              </div>
              <div className="flex items-end">
                <Btn variant="primary" type="submit" disabled={loading} className="w-full">
                  <Plus className="h-4 w-4" /> Ajouter
                </Btn>
              </div>
            </form>
          </div>
        )}

        {/* ── LIST ── */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 min-w-[180px]">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
            </div>

            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {['Tous', ...SEGMENT_OPTIONS].map(s => (
                <button key={s} onClick={() => setSegFilter(s)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                    ${segFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {s}
                </button>
              ))}
            </div>

            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {['Tous', ...REGION_OPTIONS].map(r => (
                <button key={r} onClick={() => setRegFilter(r)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                    ${regFilter === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {r}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              {filtered.length} / {accounts.length} comptes
              {(search || segFilter !== 'Tous' || regFilter !== 'Tous' || dateFrom || dateTo) && (
                <button onClick={() => { setSearch(''); setSegFilter('Tous'); setRegFilter('Tous'); setDateFrom(''); setDateTo('') }}
                  className="text-blue-600 hover:underline font-semibold">Réinitialiser</button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto">
            {(() => {
              type SortCol = 'created_at'|'name'|'sector'|'segment'|'region'|'deals'
              function TH({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
                const active = sortKey === col
                const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown
                return (
                  <th onClick={() => { if (!active) { setSortKey(col); setSortDir('asc') } else setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}
                    className={`cursor-pointer select-none py-3 text-xs font-semibold transition-colors whitespace-nowrap
                      ${right ? 'px-4 text-right' : 'px-4 text-left'}
                      ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                    <span className="inline-flex items-center gap-1">
                      {!right && label}<Icon className="h-3.5 w-3.5 shrink-0" />{right && label}
                    </span>
                  </th>
                )
              }
              return (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH col="created_at" label="Créé" />
                  <TH col="name" label="Client" />
                  <TH col="sector" label="Segment" />
                  <TH col="segment" label="Secteur d'activité" />
                  <TH col="region" label="Région" />
                  <TH col="deals" label="Deals actifs" right />
                  <TH col="won_amt" label="CA Won" right />
                  <TH col="last_deal" label="Dernier deal" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    {accounts.length === 0 ? 'Aucun client. Commencez par en ajouter un.' : 'Aucun résultat pour ces filtres.'}
                  </td></tr>
                ) : sorted.map(a => {
                  const deals = dealCounts[a.id] || 0
                  return (
                    <tr key={a.id} className="group hover:bg-slate-50/60 transition-colors">
                      <td className="w-[78px] min-w-[78px] pl-3 pr-1 py-2.5">
                        {a.created_at ? (
                          <div className="flex flex-col gap-0.5 leading-none">
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                              {`${new Date(a.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })} ${String(new Date(a.created_at).getFullYear()).slice(-2)}`}
                            </span>
                            <span className="text-[9px] text-slate-300 tabular-nums">
                              {new Date(a.created_at).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        ) : <span className="text-slate-200 text-[10px]">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-900">{a.name}</div>
                      </td>
                      <td className="px-4 py-3"><SegBadge seg={a.sector} /></td>
                      <td className="px-4 py-3 text-slate-600 text-sm">{a.segment || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {a.region ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <MapPin className="h-3 w-3 text-slate-400" />{a.region}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {deals > 0 ? (
                          <Link href={`/pipeline?account=${encodeURIComponent(a.name)}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors">
                            {deals} deal{deals > 1 ? 's' : ''} <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {wonAmtMap[a.id] ? (
                          <span className="text-xs font-black text-emerald-700">
                            {wonAmtMap[a.id] >= 1_000_000
                              ? `${(wonAmtMap[a.id]/1_000_000).toFixed(1)}M`
                              : wonAmtMap[a.id] >= 1000
                              ? `${Math.round(wonAmtMap[a.id]/1000)}K`
                              : String(Math.round(wonAmtMap[a.id]))} MAD
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {lastDealMap[a.id] ? (
                          <span className="text-xs font-semibold text-slate-500 tabular-nums">{lastDealMap[a.id]}</span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/pipeline?account=${encodeURIComponent(a.name)}`}
                            className="inline-flex h-7 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
                            <GitBranch className="h-3 w-3" /> Pipeline
                          </Link>
                          <Btn size="sm" variant="ghost" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" /> Modifier
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => openContacts(a)}>
                            <Users className="h-3.5 w-3.5" /> Contacts
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => deleteAccount(a)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-50 border-red-100">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
              )
            })()}
          </div>

          {sorted.length > 0 && (
            <div className="border-t border-slate-50 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-400">
              {sorted.length} compte{sorted.length > 1 ? 's' : ''} affichés · {stats.total} total
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      <Modal open={editOpen} title={editRow ? `Modifier : ${editRow.name}` : 'Modifier'} onClose={() => setEditOpen(false)}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <FL label="Nom du client" required>
              <input className={inputCls} value={eName} onChange={e => setEName(e.target.value)} />
            </FL>
          </div>
          <FL label="Segment client" required>
            <div className="relative">
              <select className={selectCls} value={eSeg} onChange={e => setESeg(e.target.value as any)}>
                {SEGMENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </FL>
          <FL label="Région" required>
            <div className="relative">
              <select className={selectCls} value={eRegion} onChange={e => setERegion(e.target.value as any)}>
                {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </FL>
          <div className="md:col-span-2">
            <FL label="Secteur d'activité" required>
              <input className={inputCls} value={eSector} onChange={e => setESector(e.target.value)} list="sectors_edit" />
              <datalist id="sectors_edit">{uniqueSectors.map(x => <option key={x} value={x} />)}</datalist>
            </FL>
          </div>
        </div>
        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>Annuler</Btn>
            <Btn variant="primary" onClick={onSaveEdit} disabled={busyEdit}>
              {busyEdit ? 'Enregistrement…' : 'Enregistrer'}
            </Btn>
          </div>
          {editRow && <Btn variant="danger" size="sm" onClick={() => deleteAccount(editRow)} disabled={busyEdit}><Trash2 className="h-3.5 w-3.5" /> Supprimer</Btn>}
        </div>
      </Modal>

      {/* ── CONTACTS MODAL ── */}
      <Modal open={contOpen} title={contAccount ? `Contacts — ${contAccount.name}` : 'Contacts'}
        onClose={() => { setContOpen(false); setContAccount(null); setContacts([]) }}>
        {contAccount && (
          <div className="space-y-4">
            {/* Info strip */}
            <div className="flex flex-wrap gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs">
              {contAccount.sector && <SegBadge seg={contAccount.sector} />}
              {contAccount.segment && <span className="rounded-full bg-white ring-1 ring-slate-200 px-2.5 py-0.5 font-medium text-slate-600">{contAccount.segment}</span>}
              {contAccount.region && <span className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-slate-200 px-2.5 py-0.5 font-medium text-slate-600"><MapPin className="h-3 w-3" />{contAccount.region}</span>}
              <div className="flex-1" />
              <Btn size="sm" variant="ghost" onClick={() => loadContacts(contAccount.id)} disabled={contLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${contLoading ? 'animate-spin' : ''}`} />
              </Btn>
            </div>

            {/* Add contact form */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
              <div className="mb-3 text-sm font-bold text-slate-900">Ajouter un contact</div>
              <form onSubmit={addContact} className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <FL label="Nom" required><input className={inputCls} value={cName} onChange={e => setCName(e.target.value)} placeholder="Prénom Nom" /></FL>
                </div>
                <FL label="Email"><input type="email" className={inputCls} value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="email@client.ma" /></FL>
                <FL label="Téléphone"><input className={inputCls} value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="06…" /></FL>
                <div className="md:col-span-3">
                  <FL label="Rôle"><input className={inputCls} value={cRole} onChange={e => setCRole(e.target.value)} placeholder="DSI / Acheteur / Responsable…" /></FL>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" className="rounded" checked={cPrimary} onChange={e => setCPrimary(e.target.checked)} />
                    Principal
                  </label>
                  <Btn variant="primary" type="submit" size="sm" disabled={contLoading}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </Btn>
                </div>
              </form>
            </div>

            {/* Contacts list */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-bold text-slate-900">Liste des contacts</div>
                <div className="text-xs text-slate-400">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</div>
              </div>
              {contacts.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">Aucun contact pour ce client.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-slate-50 text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold">Nom</th>
                        <th className="px-4 py-2.5 text-left font-semibold">Rôle</th>
                        <th className="px-4 py-2.5 text-left font-semibold">Contact</th>
                        <th className="px-4 py-2.5 text-left font-semibold">Statut</th>
                        <th className="px-4 py-2.5 text-left font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {contacts.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-slate-900 text-xs">{c.full_name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{c.role || '—'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Mail className="h-3 w-3" />{c.email}</a>}
                              {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Phone className="h-3 w-3" />{c.phone}</a>}
                              {!c.email && !c.phone && <span className="text-xs text-slate-300">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {c.is_primary ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Principal
                              </span>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1.5">
                              {!c.is_primary && <Btn size="sm" variant="ghost" onClick={() => setPrimary(c.id)}>Définir principal</Btn>}
                              <Btn size="sm" variant="ghost" onClick={() => deleteContact(c)} className="text-red-500 hover:bg-red-50 border-red-100">
                                <Trash2 className="h-3 w-3" />
                              </Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm.open} title={confirm.title} msg={confirm.msg}
        danger={confirm.danger} confirmLabel={confirm.confirmLabel}
        onConfirm={confirm.onConfirm} onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />
    </div>
  )
}
