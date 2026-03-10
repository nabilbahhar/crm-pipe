'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import { buildSupportEmail } from '@/lib/emailTemplates'
import {
  mad, fmt, fmtDate, fmtDateTime, ownerName,
  TICKET_STATUS_CFG, TicketStatus,
  TICKET_TYPE_CFG, TicketType,
  COMPUCOM_EMAILS,
} from '@/lib/utils'
import {
  ShieldCheck, Plus, RefreshCw, Download, Search,
  X, ChevronDown, Mail, Pencil, Trash2, AlertTriangle,
  Clock, CheckCircle2, Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Ticket = {
  id: string; opportunity_id: string | null; account_id: string | null
  title: string; description: string | null
  type: string; priority: string; status: string
  assigned_to: string | null; resolved_at: string | null
  notes: string | null; created_by: string | null
  created_at: string; updated_at: string | null
  opportunities?: { id: string; title: string; accounts?: { name: string } | null } | null
  accounts?: { id: string; name: string } | null
}
type Deal = { id: string; title: string; accounts?: { name?: string } | null }
type WarrantyDeal = {
  dealId: string; dealTitle: string; accountName: string
  poDate: string; warrantyMonths: number; licenseMonths: number
  designation: string; expiresIn: number; type: 'garantie' | 'licence'
}

const PRIORITIES = [
  { value: 'normal', label: 'Normal', cls: 'bg-slate-100 text-slate-700' },
  { value: 'haute', label: 'Haute', cls: 'bg-amber-50 text-amber-700' },
  { value: 'urgent', label: 'Urgent', cls: 'bg-red-50 text-red-600' },
]

// ─── Page ─────────────────────────────────────────────────────
export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [warranties, setWarranties] = useState<WarrantyDeal[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [emailHtml, setEmailHtml] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')

  // Form state
  const [fDeal, setFDeal] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fType, setFType] = useState<string>('sav')
  const [fPriority, setFPriority] = useState<string>('normal')
  const [fAssigned, setFAssigned] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [dealSearch, setDealSearch] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || ''))
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: tix }, { data: wonDeals }, { data: plData }] = await Promise.all([
      supabase.from('support_tickets').select('*, opportunities(id, title, accounts(name)), accounts(id, name)').order('created_at', { ascending: false }),
      supabase.from('opportunities').select('id, title, accounts(name)').eq('status', 'Won'),
      supabase.from('purchase_lines').select('warranty_months, license_months, designation, purchase_info!inner(opportunity_id, opportunities!inner(id, title, po_date, accounts(name)))'),
    ])
    setTickets(tix || [])
    setDeals((wonDeals || []).map((d: any) => ({
      ...d,
      accounts: Array.isArray(d.accounts) ? (d.accounts[0] || null) : (d.accounts || null),
    })))

    // Build warranty expiration list
    const today = new Date()
    const warns: WarrantyDeal[] = []
    for (const pl of (plData || []) as any[]) {
      const opp = pl.purchase_info?.opportunities
      if (!opp?.po_date) continue
      const poDate = new Date(opp.po_date)
      if (pl.warranty_months && pl.warranty_months > 0) {
        const exp = new Date(poDate); exp.setMonth(exp.getMonth() + pl.warranty_months)
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        if (diffDays <= 90) {
          warns.push({ dealId: opp.id, dealTitle: opp.title, accountName: opp.accounts?.name || '—', poDate: opp.po_date, warrantyMonths: pl.warranty_months, licenseMonths: pl.license_months || 0, designation: pl.designation, expiresIn: diffDays, type: 'garantie' })
        }
      }
      if (pl.license_months && pl.license_months > 0) {
        const exp = new Date(poDate); exp.setMonth(exp.getMonth() + pl.license_months)
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        if (diffDays <= 90) {
          warns.push({ dealId: opp.id, dealTitle: opp.title, accountName: opp.accounts?.name || '—', poDate: opp.po_date, warrantyMonths: pl.warranty_months || 0, licenseMonths: pl.license_months, designation: pl.designation, expiresIn: diffDays, type: 'licence' })
        }
      }
    }
    warns.sort((a, b) => a.expiresIn - b.expiresIn)
    setWarranties(warns)
    setLoading(false)
  }

  // ─── KPIs ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return {
      open: tickets.filter(t => t.status === 'ouvert').length,
      inProgress: tickets.filter(t => t.status === 'en_cours').length,
      resolvedMonth: tickets.filter(t => (t.status === 'resolu' || t.status === 'ferme') && t.resolved_at?.startsWith(thisMonth)).length,
      warrantyAlerts: warranties.length,
    }
  }, [tickets, warranties])

  // ─── Filtered list ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tickets
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    if (typeFilter !== 'all') list = list.filter(t => t.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.opportunities?.title || '').toLowerCase().includes(q) ||
        (t.opportunities?.accounts?.name || t.accounts?.name || '').toLowerCase().includes(q) ||
        (t.assigned_to || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [tickets, statusFilter, typeFilter, search])

  // ─── Filtered deals for searchable ComboBox ───────────────
  const filteredDeals = useMemo(() => {
    if (!dealSearch.trim()) return deals
    const q = dealSearch.toLowerCase()
    return deals.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.accounts?.name || '').toLowerCase().includes(q)
    )
  }, [deals, dealSearch])

  // ─── CRUD ──────────────────────────────────────────────────
  function openCreate() {
    setEditId(null); setFDeal(''); setDealSearch(''); setFTitle(''); setFDesc(''); setFType('sav'); setFPriority('normal'); setFAssigned(''); setFNotes(''); setShowModal(true)
  }
  function openEdit(t: Ticket) {
    setEditId(t.id); setFDeal(t.opportunity_id || ''); setDealSearch(''); setFTitle(t.title); setFDesc(t.description || ''); setFType(t.type); setFPriority(t.priority); setFAssigned(t.assigned_to || ''); setFNotes(t.notes || ''); setShowModal(true)
  }

  async function save() {
    if (!fTitle.trim()) return
    setSaving(true)
    const payload: any = {
      title: fTitle.trim(), description: fDesc.trim() || null,
      type: fType, priority: fPriority,
      assigned_to: fAssigned.trim() || null,
      notes: fNotes.trim() || null,
      opportunity_id: fDeal || null,
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      await supabase.from('support_tickets').update(payload).eq('id', editId)
      logActivity({ action_type: 'update', entity_type: 'ticket', entity_name: fTitle, detail: 'Ticket support mis à jour' })
    } else {
      payload.created_by = userEmail
      payload.status = 'ouvert'
      await supabase.from('support_tickets').insert(payload)
      logActivity({ action_type: 'create', entity_type: 'ticket', entity_name: fTitle, detail: 'Ticket support créé' })
    }
    setSaving(false); setShowModal(false); load()
  }

  async function changeStatus(t: Ticket, newStatus: string) {
    const up: any = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus === 'resolu' || newStatus === 'ferme') up.resolved_at = new Date().toISOString()
    await supabase.from('support_tickets').update(up).eq('id', t.id)
    logActivity({ action_type: 'update', entity_type: 'ticket', entity_name: t.title, detail: `Ticket → ${(TICKET_STATUS_CFG as any)[newStatus]?.label || newStatus}` })
    load()
  }

  async function deleteTicket(t: Ticket) {
    if (!confirm(`Supprimer le ticket "${t.title}" ?`)) return
    await supabase.from('support_tickets').delete().eq('id', t.id)
    logActivity({ action_type: 'delete', entity_type: 'ticket', entity_name: t.title, detail: 'Ticket support supprimé' })
    load()
  }

  function genEmail(t: Ticket) {
    const html = buildSupportEmail({
      ticketTitle: t.title,
      dealTitle: t.opportunities?.title || '—',
      accountName: t.opportunities?.accounts?.name || t.accounts?.name || '—',
      type: (TICKET_TYPE_CFG as any)[t.type]?.label || t.type,
      priority: PRIORITIES.find(p => p.value === t.priority)?.label || t.priority,
      description: t.description || '',
      senderName: ownerName(userEmail),
    })
    setEmailHtml(html)
  }

  async function exportExcel() {
    const rows = filtered.map(t => [
      t.title, t.opportunities?.title || '—', t.opportunities?.accounts?.name || t.accounts?.name || '—',
      (TICKET_TYPE_CFG as any)[t.type]?.label || t.type,
      PRIORITIES.find(p => p.value === t.priority)?.label || t.priority,
      (TICKET_STATUS_CFG as any)[t.status]?.label || t.status,
      t.assigned_to || '—',
      fmtDate(t.created_at),
    ])
    const resp = await authFetch('/api/excel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: `support_${new Date().toISOString().slice(0, 10)}`,
        sheets: [{ title: 'Tickets Support', headers: ['Titre', 'Deal', 'Client', 'Type', 'Priorité', 'Statut', 'Assigné à', 'Créé le'], rows }],
        summary: { title: 'Support / SAV', kpis: [{ label: 'Ouverts', value: kpis.open }, { label: 'En cours', value: kpis.inProgress }, { label: 'Résolus (mois)', value: kpis.resolvedMonth }] },
      }),
    })
    if (resp.ok) {
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: url, download: `support_${new Date().toISOString().slice(0, 10)}.xlsx` }).click()
    }
  }

  // ─── Render ────────────────────────────────────────────────
  const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'
  const selectCls = inputCls + ' appearance-none'

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><ShieldCheck className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">Support / SAV</h1><p className="text-xs text-slate-500">Tickets, garanties & maintenance</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Excel</button>
          <button onClick={load} className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 h-9 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Ticket</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Ouverts', value: kpis.open, icon: '🔴', color: 'text-red-600' },
          { label: 'En cours', value: kpis.inProgress, icon: '🟡', color: 'text-amber-600' },
          { label: 'Résolus (mois)', value: kpis.resolvedMonth, icon: '🟢', color: 'text-emerald-600' },
          { label: 'Alertes garantie', value: kpis.warrantyAlerts, icon: '⚠️', color: 'text-orange-600' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><span>{k.icon}</span>{k.label}</div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Warranty Alerts */}
      {warranties.length > 0 && (
        <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-orange-800 mb-3"><AlertTriangle className="h-4 w-4" />Renouvellements à venir (≤ 90 jours)</h3>
          <div className="space-y-2">
            {warranties.slice(0, 10).map((w, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-white border border-orange-100 px-4 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${w.expiresIn <= 0 ? 'bg-red-100 text-red-700' : w.expiresIn <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                    {w.expiresIn <= 0 ? 'Expiré' : `${w.expiresIn}j`}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${w.type === 'garantie' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{w.type === 'garantie' ? 'Garantie' : 'Licence'}</span>
                  <Link href={`/opportunities/${w.dealId}`} className="font-semibold text-slate-900 hover:text-blue-600">{w.dealTitle}</Link>
                  <span className="text-slate-500">· {w.accountName}</span>
                  <span className="text-slate-400">· {w.designation}</span>
                </div>
                <span className="text-xs text-slate-500">{w.type === 'garantie' ? w.warrantyMonths : w.licenseMonths} mois</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ticket..." className={`${inputCls} pl-9`} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${selectCls} w-[160px]`}>
          <option value="all">Tous statuts</option>
          {Object.entries(TICKET_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={`${selectCls} w-[160px]`}>
          <option value="all">Tous types</option>
          {Object.entries(TICKET_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center text-sm text-slate-400">Aucun ticket</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Titre</th>
                <th className="px-4 py-3 text-left font-semibold">Deal / Client</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Priorité</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-left font-semibold">Assigné</th>
                <th className="px-4 py-3 text-left font-semibold">Créé</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(t => {
                const sCfg = (TICKET_STATUS_CFG as any)[t.status] || TICKET_STATUS_CFG.ouvert
                const tCfg = (TICKET_TYPE_CFG as any)[t.type] || TICKET_TYPE_CFG.sav
                const pCfg = PRIORITIES.find(p => p.value === t.priority) || PRIORITIES[0]
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{t.title}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{t.opportunities?.title || '—'}</div>
                      <div className="text-xs text-slate-400">{t.opportunities?.accounts?.name || t.accounts?.name || ''}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tCfg.bg} ${tCfg.color}`}>{tCfg.icon} {tCfg.label}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.cls}`}>{pCfg.label}</span></td>
                    <td className="px-4 py-3">
                      <select value={t.status} onChange={e => changeStatus(t, e.target.value)} className="rounded-lg border-0 bg-transparent text-xs font-semibold cursor-pointer focus:ring-0 p-0">
                        {Object.entries(TICKET_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.assigned_to || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => genEmail(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Email Mernassi"><Mail className="h-3.5 w-3.5" /></button>
                        <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteTicket(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create/Edit Modal ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">{editId ? 'Modifier le ticket' : 'Nouveau ticket'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1 hover:bg-slate-100"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Deal associé</label>
                <select value={fDeal} onChange={e => setFDeal(e.target.value)} className={selectCls}>
                  <option value="">— Aucun —</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.title} {d.accounts?.name ? `(${d.accounts.name})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Titre *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)} className={inputCls} placeholder="Ex: Remplacement disque serveur" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                  <select value={fType} onChange={e => setFType(e.target.value)} className={selectCls}>
                    {Object.entries(TICKET_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Priorité</label>
                  <select value={fPriority} onChange={e => setFPriority(e.target.value)} className={selectCls}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Assigné à</label>
                <input value={fAssigned} onChange={e => setFAssigned(e.target.value)} className={inputCls} placeholder="Nom de l'intervenant" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} placeholder="Détails du ticket..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes internes</label>
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} placeholder="Notes..." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuler</button>
              <button onClick={save} disabled={saving || !fTitle.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 h-9 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Email Preview Modal ───────────────────────────── */}
      {emailHtml && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setEmailHtml(null) }}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="text-sm font-bold text-slate-900">📧 Email Support — Mernassi</div>
                <div className="text-xs text-slate-500">À : {COMPUCOM_EMAILS.mernassi}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { navigator.clipboard.writeText(emailHtml); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Copier HTML</button>
                <button onClick={() => setEmailHtml(null)} className="rounded-lg p-1 hover:bg-slate-200"><X className="h-4 w-4 text-slate-500" /></button>
              </div>
            </div>
            <iframe srcDoc={emailHtml} sandbox="allow-popups" title="Aperçu email" className="w-full h-[400px] border-0" />
          </div>
        </div>
      )}
    </div>
  )
}
