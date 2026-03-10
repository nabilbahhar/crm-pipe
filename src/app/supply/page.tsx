'use client'
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  mad, fmtDate, paymentTermLabel,
  SUPPLY_STATUS_CFG, SUPPLY_STATUS_ORDER, type SupplyStatus,
  LINE_STATUS_CFG, LINE_STATUS_ORDER, type LineStatus,
  COMPUCOM_EMAILS, ownerName,
} from '@/lib/utils'
import { buildSupplyEmail } from '@/lib/emailTemplates'
import PurchaseModal from '@/components/PurchaseModal'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Package, ChevronRight, ChevronDown, Search, AlertCircle, Download, Clock, Mail, Copy, ExternalLink, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type PurchaseLine = {
  id: string
  purchase_info_id: string
  ref: string | null
  designation: string | null
  qty: number
  pu_vente: number
  pt_vente: number
  pu_achat: number
  fournisseur: string | null
  fournisseur_id: string | null
  contact_fournisseur: string | null
  email_fournisseur: string | null
  tel_fournisseur: string | null
  line_status: LineStatus | null
  eta: string | null
  eta_updated_at: string | null
  status_note: string | null
  warranty_months: number | null
  license_months: number | null
  sort_order: number | null
}

type Order = {
  id: string
  opportunity_id: string
  status: SupplyStatus
  supply_notes: string | null
  placed_at: string | null
  ordered_at: string | null
  received_at: string | null
  delivered_at: string | null
  invoiced_at: string | null
  updated_at: string | null
  opportunities?: {
    id: string; title: string; amount: number
    po_number: string | null; po_date: string | null
    bu: string | null; vendor: string | null
    accounts?: { name?: string } | null
    purchase_info?: { id: string; frais_engagement: number; payment_terms: string | null; notes: string | null; purchase_lines?: PurchaseLine[] }[] | null
  }
}

// Aliases for backward compat with existing references in this file
const STATUS_CONFIG = SUPPLY_STATUS_CFG
const ALL_STATUSES = SUPPLY_STATUS_ORDER

// ─── Inline note editor for purchase lines ───────────────────
function LineNoteCell({ lineId, note, onSave }: { lineId: string; note: string | null; onSave: (id: string, n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(note || '')
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(lineId, val); setEditing(false) } }}
          autoFocus placeholder="Note…"
          className="h-6 w-full rounded border border-slate-200 px-1.5 text-[10px] outline-none focus:border-blue-300" />
        <button onClick={() => { onSave(lineId, val); setEditing(false) }}
          className="h-6 rounded bg-slate-900 px-1.5 text-[9px] font-bold text-white">OK</button>
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(note || ''); setEditing(true) }}
      className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[120px] text-left">
      {note || '+ note'}
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function SupplyPage() {
  const sp = useSearchParams()
  const [orders, setOrders]       = useState<Order[]>([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<SupplyStatus | 'Tous'>('Tous')
  const [updating, setUpdating]   = useState<string | null>(null)
  const [noteOpen, setNoteOpen]   = useState<string | null>(null)
  const [noteText, setNoteText]   = useState('')
  const [purchaseDeal, setPurchaseDeal] = useState<any | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [emailHtml, setEmailHtml] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [buFilter, setBuFilter] = useState('Tous')
  const [vendorFilter, setVendorFilter] = useState('Tous')
  const [busyLines, setBusyLines] = useState<Set<string>>(new Set())

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // Cleanup toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    document.title = 'Supply \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    // Read vendor filter from URL params (e.g., from fournisseurs page link)
    const urlVendor = sp.get('vendor')
    if (urlVendor) setVendorFilter(urlVendor)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('supply_orders')
        .select(`
          *,
          opportunities (
            id, title, amount, po_number, po_date, bu, vendor,
            accounts(name),
            purchase_info(id, frais_engagement, payment_terms, notes, purchase_lines(*))
          )
        `)
        .order('created_at', { ascending: false })

      if (error) { setErr(error.message); return }
      setOrders((data || []) as Order[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur réseau lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const buOptions = useMemo(() =>
    [...new Set(orders.map(o => o.opportunities?.bu || '').filter(Boolean))].sort()
  , [orders])

  const vendorOptions = useMemo(() =>
    [...new Set(orders.map(o => o.opportunities?.vendor || '').filter(Boolean))].sort()
  , [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      const name = o.opportunities?.accounts?.name || o.opportunities?.title || ''
      if (q && !name.toLowerCase().includes(q)
        && !(o.opportunities?.vendor || '').toLowerCase().includes(q)
        && !(o.opportunities?.po_number || '').toLowerCase().includes(q)
        && !(o.supply_notes || '').toLowerCase().includes(q)) return false
      if (statusFilter !== 'Tous' && o.status !== statusFilter) return false
      if (buFilter !== 'Tous' && (o.opportunities?.bu || '') !== buFilter) return false
      if (vendorFilter !== 'Tous' && (o.opportunities?.vendor || '') !== vendorFilter) return false
      return true
    })
  }, [orders, search, statusFilter, buFilter, vendorFilter])

  const filteredTotal = useMemo(() =>
    filtered.reduce((s, o) => s + (o.opportunities?.amount || 0), 0)
  , [filtered])

  // Grouped by status
  const grouped = useMemo(() => {
    const g: Record<SupplyStatus, Order[]> = {
      a_commander: [], place: [], commande: [], en_stock: [], livre: [], facture: [],
    }
    filtered.forEach(o => { g[o.status as SupplyStatus]?.push(o) })
    return g
  }, [filtered])

  async function changeStatus(order: Order, newStatus: SupplyStatus) {
    if (newStatus === order.status || updating) return
    setUpdating(order.id)

    try {
      const now = new Date().toISOString()
      const timestamps: Record<string, string> = {
        place: 'placed_at', commande: 'ordered_at',
        en_stock: 'received_at', livre: 'delivered_at', facture: 'invoiced_at',
      }
      const tsField = timestamps[newStatus]
      const oldLabel = STATUS_CONFIG[order.status]?.label || order.status
      const newLabel = STATUS_CONFIG[newStatus]?.label || newStatus

      const { error } = await supabase.from('supply_orders').update({
        status: newStatus,
        ...(tsField ? { [tsField]: now } : {}),
        updated_by: userEmail,
        updated_at: now,
      }).eq('id', order.id)

      if (error) { showToast('Erreur mise à jour statut'); return }

      logActivity({
        action_type: 'update',
        entity_type: 'deal',
        entity_id: order.opportunity_id,
        entity_name: order.opportunities?.title || '—',
        detail: `Supply: ${oldLabel} → ${newLabel}`,
      })

      showToast(`${order.opportunities?.accounts?.name || 'Commande'} → ${newLabel}`)
      await load()
    } finally {
      setUpdating(null)
    }
  }

  async function updateLineStatus(lineId: string, newStatus: LineStatus, orderTitle: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        line_status: newStatus,
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour ligne'); return }
      showToast(`Ligne → ${LINE_STATUS_CFG[newStatus]?.label || newStatus}`)
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  async function updateLineEta(lineId: string, eta: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        eta: eta || null,
        eta_updated_at: new Date().toISOString(),
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour ETA'); return }
      showToast('ETA mise à jour')
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  async function updateLineNote(lineId: string, note: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        status_note: note || null,
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour note'); return }
      showToast('Note ligne mise à jour')
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  function generateSupplyEmail(order: Order) {
    const opp = order.opportunities
    if (!opp) return
    const pi = opp.purchase_info?.[0]
    const lines = pi?.purchase_lines || []
    const html = buildSupplyEmail({
      dealTitle: opp.title,
      accountName: opp.accounts?.name || '—',
      poNumber: opp.po_number || '—',
      amount: opp.amount,
      paymentTerms: paymentTermLabel(pi?.payment_terms),
      lines: lines.map(l => ({
        ref: l.ref || '', designation: l.designation || '', qty: l.qty,
        pu_achat: l.pu_achat, fournisseur: l.fournisseur || '',
        contact: l.contact_fournisseur || '', email: l.email_fournisseur || '', tel: l.tel_fournisseur || '',
      })),
      frais: pi?.frais_engagement || 0,
      notes: pi?.notes || '',
      senderName: ownerName(userEmail),
    })
    setEmailHtml(html)
  }

  function copyEmailHtml() {
    if (!emailHtml) return
    navigator.clipboard.writeText(emailHtml)
    showToast('HTML copié dans le presse-papier')
  }

  async function saveNote(orderId: string) {
    await supabase.from('supply_orders').update({
      supply_notes: noteText,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)
    setNoteOpen(null)
    load()
  }

  const toCommanderCount = grouped.a_commander.length

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = filtered.reduce((s,o) => s+(o.opportunities?.amount||0), 0)

      // Status breakdown
      const statusMap = new Map<string, { count: number; amount: number }>()
      filtered.forEach(o => {
        const label = STATUS_CONFIG[o.status]?.label || o.status
        const prev = statusMap.get(label) || { count: 0, amount: 0 }
        statusMap.set(label, { count: prev.count + 1, amount: prev.amount + (o.opportunities?.amount||0) })
      })

      const spec = {
        filename: `supply_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Supply',
          title: `Suivi Supply · ${filtered.length} commandes · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Compte','Deal','Statut','BU','Vendor','Montant (MAD)','PO','PO Date','Fournisseurs','Placé le','Commandé le','Livré le','Note'],
          rows: filtered.map(o => {
            const opp = o.opportunities
            const lines = opp?.purchase_info?.[0]?.purchase_lines || []
            const fournisseurs = [...new Set(lines.map((l: any) => l.fournisseur).filter(Boolean))].join(', ')
            return [
              opp?.accounts?.name||'—', opp?.title||'—',
              STATUS_CONFIG[o.status]?.label||o.status,
              opp?.bu||'—', opp?.vendor||'—', opp?.amount||0,
              opp?.po_number||'—', opp?.po_date||'—',
              fournisseurs||'—',
              o.placed_at ? new Date(o.placed_at).toLocaleDateString('fr-MA') : '—',
              o.ordered_at ? new Date(o.ordered_at).toLocaleDateString('fr-MA') : '—',
              o.delivered_at ? new Date(o.delivered_at).toLocaleDateString('fr-MA') : '—',
              o.supply_notes||'—',
            ]
          }),
          totalsRow: ['TOTAL', `${filtered.length} commandes`, '', '', '', totalAmt, '', '', '', '', '', '', ''],
          notes: `Montant total: ${mad(totalAmt)}`,
        }],
        summary: {
          title: `Résumé Supply · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total commandes', value: filtered.length, detail: `Montant: ${mad(totalAmt)}` },
            { label: 'En cours', value: filtered.filter(o => !['livre','facture'].includes(o.status)).length, detail: 'À commander + Placé + Commandé + En stock' },
            { label: 'Livrées', value: filtered.filter(o => o.status === 'livre').length, detail: 'En attente facturation' },
            { label: 'Facturées', value: filtered.filter(o => o.status === 'facture').length, detail: 'Cycle terminé' },
          ],
          breakdownTitle: 'Répartition par statut',
          breakdownHeaders: ['Statut', 'Montant (MAD)', 'Nb commandes', '% du total'],
          breakdown: [...statusMap.entries()].map(([label, v]) => [
            label, v.amount, v.count, totalAmt > 0 ? `${Math.round(v.amount / totalAmt * 100)}%` : '0%',
          ]),
        },
      }
      const res = await authFetch('/api/excel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message||'Erreur export') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Supply</h1>
              <p className="text-xs text-slate-500">
                Suivi commandes · {orders.length} commande{orders.length !== 1 ? 's' : ''}
                {toCommanderCount > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {toCommanderCount} à commander
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} title="Export Excel" disabled={exporting}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        {/* KPI bar */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s]
            const count = grouped[s].length
            return (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'Tous' : s)}
                className={`rounded-2xl border p-3 text-left transition-all shadow-sm
                  ${statusFilter === s ? `${cfg.bg} ${cfg.border}` : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{cfg.icon} {cfg.label}</div>
                <div className={`mt-1 text-2xl font-black ${statusFilter === s ? cfg.color : 'text-slate-800'}`}>{count}</div>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Compte, vendor, PO…"
              className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>
          {buOptions.length > 1 && (
            <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
              className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
              <option value="Tous">BU: Tous</option>
              {buOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {vendorOptions.length > 1 && (
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
              <option value="Tous">Carte: Tous</option>
              {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span>{filtered.length} commande{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-slate-700">{mad(filteredTotal)}</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <Package className="mb-3 h-10 w-10 text-slate-300" />
            <div className="text-sm font-semibold text-slate-500">Aucune commande</div>
            <div className="mt-1 text-xs text-slate-400">Les deals Won apparaissent ici une fois la fiche achat remplie.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {ALL_STATUSES.filter(s => statusFilter === 'Tous' || statusFilter === s)
              .filter(s => grouped[s].length > 0)
              .map(status => {
                const cfg = STATUS_CONFIG[status]
                return (
                  <div key={status} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                    <div className={`flex items-center gap-2 px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
                      <span className="text-base">{cfg.icon}</span>
                      <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.border} border ${cfg.bg} ${cfg.color}`}>
                        {grouped[status].length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                            <th className="w-8 px-2 py-2.5" />
                            <th className="px-4 py-2.5 text-left">Compte / Deal</th>
                            <th className="px-4 py-2.5 text-left">BU</th>
                            <th className="px-4 py-2.5 text-right">Montant</th>
                            <th className="px-4 py-2.5 text-left">PO</th>
                            <th className="px-4 py-2.5 text-left">Paiement</th>
                            <th className="px-4 py-2.5 text-left">Fournisseurs</th>
                            <th className="px-4 py-2.5 text-left">Note</th>
                            <th className="px-4 py-2.5 text-center">Statut</th>
                            <th className="px-4 py-2.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {grouped[status].map(order => {
                            const opp    = order.opportunities
                            const pi     = opp?.purchase_info?.[0]
                            const lines  = pi?.purchase_lines || []
                            const fournisseurs = [...new Set(lines.map((l: any) => l.fournisseur).filter(Boolean))]
                            const hasPurchase  = (opp?.purchase_info?.length || 0) > 0
                            const isExpanded   = expandedRows.has(order.id)

                            const isOverdue = status === 'a_commander' && (() => {
                              const ts = order.placed_at || order.updated_at
                              return ts ? (Date.now() - new Date(ts).getTime()) > 24*60*60*1000 : false
                            })()
                            const daysSince = (() => {
                              const ts = status === 'a_commander' ? (order.placed_at || order.updated_at)
                                : status === 'place' ? order.placed_at
                                : status === 'commande' ? order.ordered_at
                                : null
                              if (!ts) return null
                              return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
                            })()

                            return (
                              <React.Fragment key={order.id}>
                              <tr className={`hover:bg-slate-50/60 transition-colors ${isOverdue ? 'bg-red-50/40' : ''}`}>
                                {/* Expand toggle */}
                                <td className="px-2 py-3 text-center">
                                  {lines.length > 0 && (
                                    <button onClick={() => toggleExpand(order.id)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                                      {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                        : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Link href={`/opportunities/${opp?.id || order.opportunity_id}`} className="group/link">
                                    <div className="font-bold text-slate-900 group-hover/link:text-blue-600 transition-colors">
                                      {opp?.accounts?.name || opp?.title || '—'}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {opp?.title}
                                      {daysSince != null && daysSince > 0 && (
                                        <span className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                                          <Clock className="h-2.5 w-2.5" />{daysSince}j
                                        </span>
                                      )}
                                    </div>
                                  </Link>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                    {opp?.bu || '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                  {opp?.amount ? mad(opp.amount) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-xs font-semibold text-slate-700">{opp?.po_number || '—'}</div>
                                  {opp?.po_date && <div className="text-[10px] text-slate-400">{opp.po_date}</div>}
                                </td>
                                {/* Payment terms */}
                                <td className="px-4 py-3">
                                  <span className="text-xs text-slate-600">
                                    {paymentTermLabel(pi?.payment_terms)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {!hasPurchase ? (
                                    <button onClick={() => setPurchaseDeal(opp)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">
                                      <AlertCircle className="h-3 w-3" /> Fiche vide
                                    </button>
                                  ) : fournisseurs.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {fournisseurs.map((f, i) => (
                                        <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                          {f}
                                        </span>
                                      ))}
                                    </div>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-3 max-w-[150px]">
                                  {noteOpen === order.id ? (
                                    <div className="flex items-center gap-1">
                                      <input value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveNote(order.id) }}
                                        autoFocus
                                        placeholder="Note…"
                                        className="h-7 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-slate-400" />
                                      <button onClick={() => saveNote(order.id)}
                                        className="h-7 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white">OK</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setNoteOpen(order.id); setNoteText(order.supply_notes || '') }}
                                      className="text-xs text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[140px] text-left">
                                      {order.supply_notes || '+ note'}
                                    </button>
                                  )}
                                </td>
                                {/* Status dropdown */}
                                <td className="px-4 py-3 text-center">
                                  <select
                                    value={order.status}
                                    disabled={!!updating}
                                    onChange={e => changeStatus(order, e.target.value as SupplyStatus)}
                                    className={`h-8 rounded-xl border px-2 text-xs font-bold outline-none transition-colors cursor-pointer
                                      ${STATUS_CONFIG[order.status].bg} ${STATUS_CONFIG[order.status].border} ${STATUS_CONFIG[order.status].color}
                                      disabled:opacity-40 disabled:cursor-not-allowed`}>
                                    {ALL_STATUSES.map(s => (
                                      <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Actions: email */}
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {hasPurchase && lines.length > 0 && (
                                      <button onClick={() => generateSupplyEmail(order)}
                                        title="Générer email Supply"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                                        <Mail className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {lines.length > 0 && (
                                      <button onClick={() => toggleExpand(order.id)}
                                        title={isExpanded ? 'Masquer lignes' : 'Voir lignes'}
                                        className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[10px] font-bold transition-colors
                                          ${isExpanded ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                        {lines.length} ligne{lines.length > 1 ? 's' : ''}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded purchase lines */}
                              {isExpanded && lines.length > 0 && (
                                <tr>
                                  <td colSpan={10} className="bg-slate-50/80 px-4 py-3">
                                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                                            <th className="px-3 py-2 text-left">Désignation</th>
                                            <th className="px-3 py-2 text-center">Qté</th>
                                            <th className="px-3 py-2 text-left">Fournisseur</th>
                                            <th className="px-3 py-2 text-center">Statut ligne</th>
                                            <th className="px-3 py-2 text-center">ETA</th>
                                            <th className="px-3 py-2 text-center">Garantie</th>
                                            <th className="px-3 py-2 text-center">Licence</th>
                                            <th className="px-3 py-2 text-left">Note</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                          {lines.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(line => {
                                            const lsCfg = LINE_STATUS_CFG[line.line_status as LineStatus] || LINE_STATUS_CFG.pending
                                            return (
                                              <tr key={line.id} className="hover:bg-slate-50/60">
                                                <td className="px-3 py-2">
                                                  <div className="font-semibold text-slate-800">{line.designation || '—'}</div>
                                                  {line.ref && <div className="text-[10px] text-slate-400">Réf: {line.ref}</div>}
                                                </td>
                                                <td className="px-3 py-2 text-center font-semibold">{line.qty}</td>
                                                <td className="px-3 py-2">
                                                  {line.fournisseur ? (
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                      {line.fournisseur}
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <select
                                                    value={line.line_status || 'pending'}
                                                    disabled={busyLines.has(line.id)}
                                                    onChange={e => updateLineStatus(line.id, e.target.value as LineStatus, opp?.title || '')}
                                                    className={`h-7 rounded-lg border px-1.5 text-[10px] font-bold outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                                                      ${lsCfg.bg} ${lsCfg.border} ${lsCfg.color}`}>
                                                    {LINE_STATUS_ORDER.map(ls => (
                                                      <option key={ls} value={ls}>{LINE_STATUS_CFG[ls].icon} {LINE_STATUS_CFG[ls].label}</option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <input
                                                    type="date"
                                                    value={line.eta ? line.eta.slice(0, 10) : ''}
                                                    disabled={busyLines.has(line.id)}
                                                    onChange={e => updateLineEta(line.id, e.target.value)}
                                                    className="h-7 rounded-lg border border-slate-200 px-1.5 text-[10px] outline-none focus:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                                  />
                                                  {line.eta_updated_at && (
                                                    <div className="text-[9px] text-slate-400 mt-0.5">maj {fmtDate(line.eta_updated_at)}</div>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {line.warranty_months ? (
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                      {line.warranty_months} mois
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {line.license_months ? (
                                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                                      {line.license_months} mois
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2">
                                                  <LineNoteCell lineId={line.id} note={line.status_note} onSave={updateLineNote} />
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {purchaseDeal && (
        <PurchaseModal
          deal={purchaseDeal}
          onClose={() => setPurchaseDeal(null)}
          onSaved={() => { setPurchaseDeal(null); load() }}
        />
      )}

      {/* Email preview modal */}
      {emailHtml && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setEmailHtml(null)}>
          <div className="relative w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Aperçu email Supply</h3>
              </div>
              <button onClick={() => setEmailHtml(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Email preview */}
            <div className="flex-1 overflow-auto p-4">
              <iframe
                srcDoc={emailHtml}
                className="w-full rounded-xl border border-slate-200"
                style={{ minHeight: 400, height: '60vh' }}
                sandbox="allow-same-origin"
              />
            </div>
            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button onClick={copyEmailHtml}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                <Copy className="h-3.5 w-3.5" /> Copier HTML
              </button>
              <button onClick={() => {
                const subject = encodeURIComponent('Demande de commande')
                window.open(`mailto:${COMPUCOM_EMAILS.supply}?subject=${subject}`, '_blank')
              }}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir mailto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 animate-in slide-in-from-bottom-4">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
