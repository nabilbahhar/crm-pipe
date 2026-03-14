'use client'
import DealFormModal from '@/components/DealFormModal'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import {
  Search, RefreshCw, Plus, Pencil, Eye, X, ChevronDown,
  TrendingUp, CheckCircle2, XCircle, Clock, AlertTriangle,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter, Download, Trash2,
} from 'lucide-react'
import { logActivity } from '@/lib/logActivity'

// ─── Import depuis utils ──────────────────────────────────────────────────────
import { mad, fmt, normStatus, normMainBU, normSBU, STAGE_CFG, BU_BADGE_CLS, MAIN_BU_COLORS, ownerName } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
type SupplyStatus = 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'

type Deal = {
  id: string; account_id: string|null; title: string; stage: string
  status: 'Open'|'Won'|'Lost'; bu: string|null; vendor: string|null
  amount: number; prob: number|null; booking_month: string|null
  next_step: string|null; notes: string|null; multi_bu: boolean|null
  bu_lines: any; created_at: string|null; accounts?: { name?: string }|null
  owner_email?: string|null
  // Supply join
  supply_orders?: { status: SupplyStatus }[] | null
  purchase_info?: { id: string; purchase_lines?: { pu_achat: number|null; fournisseur: string|null }[] }[] | null
}

const STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const
const BUS    = ['HCI','Network','Storage','Cyber','Service','CSG'] as const
const STATUS_ALL = ['Tous', 'Open', 'Won', 'Lost'] as const

// ─── Supply helpers ──────────────────────────────────────────────────────────
const SUPPLY_CFG: Record<SupplyStatus, { label: string; icon: string; color: string; bg: string }> = {
  place:       { label: 'Placé',        icon: '📤', color: 'text-blue-700',    bg: 'bg-blue-50'    },
  commande:    { label: 'Commandé',     icon: '🔄', color: 'text-violet-700',  bg: 'bg-violet-50'  },
  en_stock:    { label: 'En stock',     icon: '📦', color: 'text-orange-700',  bg: 'bg-orange-50'  },
  livre:       { label: 'Livré',        icon: '🚚', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',   bg: 'bg-slate-100'  },
}

function getSupplyStatus(d: Deal): SupplyStatus | null {
  const orders = d.supply_orders
  if (!orders || orders.length === 0) return null
  return orders[0]?.status ?? null
}

function getFicheStatus(d: Deal): 'complete' | 'en_cours' | 'a_faire' | null {
  if (normStatus(d) !== 'Won') return null
  const info = d.purchase_info
  if (!info || info.length === 0) return 'a_faire'
  const lines = info[0]?.purchase_lines || []
  if (lines.length === 0) return 'en_cours'
  const complete = lines.filter(l => Number(l.pu_achat) > 0 && l.fournisseur?.trim()).length
  if (complete === lines.length) return 'complete'
  return 'en_cours'
}

function SupplyBadge({ d }: { d: Deal }) {
  if (normStatus(d) !== 'Won') return null
  const st = getSupplyStatus(d)
  if (!st) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400 whitespace-nowrap">
      — Pas de commande
    </span>
  )
  const cfg = SUPPLY_CFG[st]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Helpers locaux ─────────────────────────────────────────────────────────────
const mainBU = (d: Deal): string => {
  if (Array.isArray(d.bu_lines) && d.bu_lines.length > 0) {
    const cartes = [...new Set(d.bu_lines.map((l: any) => l.bu || l.card).filter(Boolean))]
    return cartes.join(' + ')
  }
  return d.bu || '—'
}

// ─── Components ───────────────────────────────────────────────────────────────
function StagePill({ stage }: { stage: string }) {
  const c = STAGE_CFG[stage] || STAGE_CFG.Lead
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{stage}
    </span>
  )
}
function BUPill({ bu }: { bu: string }) {
  if (!bu || bu === '—') return <span className="text-slate-300 text-xs">—</span>
  const cls = BU_BADGE_CLS[bu] || 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{bu}</span>
}
function StatusBadge({ status }: { status: string }) {
  if (status === 'Won') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />Won
    </span>
  )
  if (status === 'Lost') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
      <XCircle className="h-3 w-3" />Lost
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
      <Clock className="h-3 w-3" />Open
    </span>
  )
}
function ProbBar({ prob }: { prob: number }) {
  const color = prob >= 80 ? 'bg-emerald-500' : prob >= 60 ? 'bg-amber-400' : prob >= 30 ? 'bg-orange-400' : 'bg-slate-200'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${prob}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-7">{prob}%</span>
    </div>
  )
}

type SortKey = 'account'|'title'|'stage'|'bu'|'vendor'|'amount'|'prob'|'closing'|'status'|'created_at'

// ─── Date helper ──────────────────────────────────────────────────────────────
function fmtCreated(iso: string | null): { d: string; t: string } | null {
  if (!iso) return null
  const dt = new Date(iso)
  return {
    d: dt.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' }) + ' ' + String(dt.getFullYear()).slice(-2),
    t: dt.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function DealsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [rows, setRows]       = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string|null>(null)

  // Filters — initialisés depuis les query params URL
  const initStatus = (searchParams.get('status') || 'Tous') as typeof STATUS_ALL[number]
  const initStage  = searchParams.get('stage') || 'Tous'
  const initBU     = searchParams.get('bu') || 'Tous'
  const initOwner  = searchParams.get('owner') || 'Tous'

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<typeof STATUS_ALL[number]>(STATUS_ALL.includes(initStatus) ? initStatus : 'Tous')
  const [stageFilter, setStageFilter]     = useState(initStage)
  const [buFilter, setBuFilter]           = useState(initBU)
  const [mainBuFilter, setMainBuFilter]   = useState('Tous')
  const [showFilters, setShowFilters]     = useState(initStage !== 'Tous' || initBU !== 'Tous' || initOwner !== 'Tous')
  const [supplyFilter, setSupplyFilter]   = useState<'Tous' | 'avec_supply' | 'sans_supply'>('Tous')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [ownerFilter, setOwnerFilter]     = useState(initOwner)
  const [vendorFilter, setVendorFilter]   = useState('Tous')

  // Sort
  const [sortKey, setSortKey]   = useState<SortKey>('amount')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc')
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [editRow, setEditRow]         = useState<any>(null)
  const [confirmDel, setConfirmDel]   = useState<{ open: boolean; deal: Deal | null }>({ open: false, deal: null })
  const [deleting, setDeleting]       = useState(false)
  const [undoToast, setUndoToast]     = useState<{ deal: Deal; timer: ReturnType<typeof setTimeout> } | null>(null)
  const undoCancelled = useRef(false)

  useEffect(() => { document.title = 'Deals \u00b7 CRM-PIPE' }, [])

  const undoDelete = () => {
    if (!undoToast) return
    undoCancelled.current = true
    clearTimeout(undoToast.timer)
    setRows(prev => [undoToast.deal, ...prev])
    setUndoToast(null)
  }

  const deleteDeal = async () => {
    if (!confirmDel.deal) return
    const deal = confirmDel.deal
    setConfirmDel({ open: false, deal: null })
    // Optimistic remove from UI
    setRows(prev => prev.filter(r => r.id !== deal.id))
    undoCancelled.current = false
    // Delayed actual delete (8s undo window)
    const timer = setTimeout(async () => {
      if (undoCancelled.current) return
      try {
        // Cascade: supprimer les données liées avant l'opportunité
        const { data: piRows } = await supabase.from('purchase_info').select('id').eq('opportunity_id', deal.id)
        const piIds = (piRows || []).map((r: any) => r.id)
        await Promise.all([
          supabase.from('deal_files').delete().eq('opportunity_id', deal.id),
          supabase.from('supply_orders').delete().eq('opportunity_id', deal.id),
          supabase.from('project_services').delete().eq('opportunity_id', deal.id),
          supabase.from('deal_registrations').delete().eq('opportunity_id', deal.id),
          supabase.from('invoices').delete().eq('opportunity_id', deal.id),
          supabase.from('support_tickets').delete().eq('opportunity_id', deal.id),
          ...(piIds.length ? [supabase.from('purchase_lines').delete().in('purchase_info_id', piIds)] : []),
        ])
        if (piIds.length) await supabase.from('purchase_info').delete().eq('opportunity_id', deal.id)
        const { error } = await supabase.from('opportunities').delete().eq('id', deal.id)
        if (error) throw error
        await logActivity({ action_type: 'delete', entity_type: 'deal', entity_id: deal.id, entity_name: deal.title || '—', detail: `${deal.accounts?.name || ''} · ${mad(deal.amount || 0)}` })
      } catch (e: any) {
        setRows(prev => [deal, ...prev]) // restore on error
        alert(e?.message?.includes('foreign') ? 'Impossible : données liées.' : e?.message || 'Erreur')
      }
      setUndoToast(null)
    }, 8000)
    setUndoToast({ deal, timer })
  }

  // Open modal from ?edit= param after data loads
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && rows.length > 0) {
      const found = rows.find(r => r.id === editId)
      if (found) { setEditRow(found); router.replace('/opportunities') }
    }
  }, [searchParams, rows])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      // ── 1. Deals (sans join supply pour éviter les problèmes FK Supabase) ──
      const { data, error } = await supabase.from('opportunities')
        .select('*, accounts(name)')
        .order('created_at', { ascending: false })
        .limit(3000)
      if (error) throw error
      const deals = (data || []) as Deal[]

      // ── 2. Supply orders via API (bypasses RLS) + purchase_info ────────────
      const wonIds = deals.filter(d => d.status === 'Won').map(d => d.id)
      if (wonIds.length > 0) {
        const [supplyRes, { data: infoData }] = await Promise.all([
          authFetch('/api/supply').then(r => r.json()).catch(() => ({ orders: [] })),
          supabase.from('purchase_info')
            .select('opportunity_id, purchase_lines(pu_achat, fournisseur)')
            .in('opportunity_id', wonIds),
        ])
        // Build supply map from API response
        const supplyMap = new Map<string, SupplyStatus>()
        ;((supplyRes?.orders || []) as any[]).forEach((o: any) => {
          if (o.opportunity_id) supplyMap.set(o.opportunity_id, o.status)
        })
        const ficheMap = new Map<string, { pu_achat: number|null; fournisseur: string|null }[]>()
        ;(infoData || []).forEach((inf: any) => {
          if (inf.opportunity_id)
            ficheMap.set(inf.opportunity_id, inf.purchase_lines || [])
        })
        // Merge into deals
        deals.forEach(d => {
          if (supplyMap.has(d.id)) d.supply_orders = [{ status: supplyMap.get(d.id)! }]
          if (ficheMap.has(d.id)) d.purchase_info = [{ id: d.id, purchase_lines: ficheMap.get(d.id) }]
        })
      }

      setRows(deals)
    } catch (e: any) { setErr(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const open = rows.filter(d => normStatus(d) === 'Open')
    const won  = rows.filter(d => normStatus(d) === 'Won')
    const lost = rows.filter(d => normStatus(d) === 'Lost')
    const pipeAmt = open.reduce((s,d) => s + (d.amount||0), 0)
    const wonAmt  = won.reduce((s,d) => s + (d.amount||0), 0)
    const foreAmt = open.reduce((s,d) => s + (d.amount||0) * ((d.prob||0)/100), 0)
    const winRate = won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0
    return { open: open.length, won: won.length, lost: lost.length, pipeAmt, wonAmt, foreAmt, winRate }
  }, [rows])

  // ── Filtered + sorted ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(d => {
      const status  = normStatus(d)
      const account = String(d.accounts?.name || '')
      const bu      = mainBU(d)

      if (statusFilter !== 'Tous' && status !== statusFilter) return false
      if (stageFilter  !== 'Tous' && d.stage !== stageFilter) return false
      if (buFilter     !== 'Tous' && bu !== buFilter) return false
      if (mainBuFilter !== 'Tous' && normMainBU(d.bu) !== mainBuFilter) return false
      if (supplyFilter === 'avec_supply'  && getSupplyStatus(d) === null) return false
      if (supplyFilter === 'sans_supply'  && (status !== 'Won' || getSupplyStatus(d) !== null)) return false
      if (ownerFilter  !== 'Tous' && (d.owner_email||'') !== ownerFilter) return false
      if (vendorFilter !== 'Tous' && (d.vendor||'') !== vendorFilter) return false

      // ✅ FIX: comparaison date-only (évite les bugs de timezone)
      if (dateFrom && (d.created_at || '').slice(0, 10) < dateFrom) return false
      if (dateTo   && (d.created_at || '').slice(0, 10) > dateTo)   return false

      if (q && !(
        d.title?.toLowerCase().includes(q) ||
        account.toLowerCase().includes(q) ||
        (d.vendor||'').toLowerCase().includes(q) ||
        d.stage?.toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [rows, search, statusFilter, stageFilter, buFilter, dateFrom, dateTo, supplyFilter, ownerFilter, vendorFilter])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'account':    va = a.accounts?.name||''; vb = b.accounts?.name||''; break
        case 'title':      va = a.title||''; vb = b.title||''; break
        case 'stage':      va = STAGES.indexOf(a.stage as any); vb = STAGES.indexOf(b.stage as any); break
        case 'bu':         va = mainBU(a); vb = mainBU(b); break
        case 'vendor':     va = a.vendor||''; vb = b.vendor||''; break
        case 'prob':       va = a.prob||0; vb = b.prob||0; break
        case 'closing':    va = a.booking_month||''; vb = b.booking_month||''; break
        case 'status':     va = normStatus(a); vb = normStatus(b); break
        case 'created_at': va = a.created_at||''; vb = b.created_at||''; break
        default:           va = a.amount||0; vb = b.amount||0
      }
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb))
    })
  }, [filtered, sortKey, sortDir])

  // ── Sort header ───────────────────────────────────────────────────────
  function TH({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    const active = sortKey === col
    const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown
    return (
      <th onClick={() => { if (!active) { setSortKey(col); setSortDir('desc') } else setSortDir(d => d === 'desc' ? 'asc' : 'desc') }}
        className={`px-4 py-3 text-xs font-semibold cursor-pointer select-none whitespace-nowrap transition-colors
          ${right ? 'text-right' : 'text-left'}
          ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
        <span className="inline-flex items-center gap-1">
          {!right && label}
          <Icon className="h-3.5 w-3.5" />
          {right && label}
        </span>
      </th>
    )
  }

  const ownerOptions = useMemo(() =>
    [...new Set(rows.map(r => r.owner_email || '').filter(Boolean))].sort()
  , [rows])

  const vendorOptions = useMemo(() =>
    [...new Set(rows.map(r => r.vendor || '').filter(Boolean))].sort()
  , [rows])

  const hasFilters = search || statusFilter !== 'Tous' || stageFilter !== 'Tous' || buFilter !== 'Tous' || dateFrom || dateTo || supplyFilter !== 'Tous' || ownerFilter !== 'Tous' || vendorFilter !== 'Tous'
  const resetFilters = () => {
    setSearch(''); setStatusFilter('Tous'); setStageFilter('Tous')
    setBuFilter('Tous'); setDateFrom(''); setDateTo(''); setSupplyFilter('Tous')
    setOwnerFilter('Tous'); setVendorFilter('Tous')
  }

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = sorted.reduce((s,d) => s + (d.amount||0), 0)
      const wonDeals = sorted.filter(d => normStatus(d)==='Won')
      const lostDeals = sorted.filter(d => normStatus(d)==='Lost')
      const openDeals = sorted.filter(d => normStatus(d)==='Open')
      const wonAmt = wonDeals.reduce((s,d) => s+(d.amount||0), 0)
      const openAmt = openDeals.reduce((s,d) => s+(d.amount||0), 0)
      const forecastAmt = openDeals.reduce((s,d) => s+(d.amount||0)*((d.prob||0)/100), 0)
      const winRate = wonDeals.length + lostDeals.length > 0
        ? Math.round(wonDeals.length / (wonDeals.length + lostDeals.length) * 100) : 0

      // BU breakdown — split multi-BU deals into individual BU contributions
      const buMap = new Map<string, { count: number; amount: number }>()
      sorted.forEach(d => {
        if (Array.isArray(d.bu_lines) && d.bu_lines.length > 0) {
          for (const l of d.bu_lines) {
            const bu = String(l.bu || l.card || 'Other').trim() || 'Other'
            const amt = Number(l.amount || 0)
            const prev = buMap.get(bu) || { count: 0, amount: 0 }
            buMap.set(bu, { count: prev.count + 1, amount: prev.amount + amt })
          }
        } else {
          const bu = d.bu || 'Other'
          const prev = buMap.get(bu) || { count: 0, amount: 0 }
          buMap.set(bu, { count: prev.count + 1, amount: prev.amount + (d.amount || 0) })
        }
      })

      const spec = {
        filename: `deals_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Deals',
          title: `Export Deals · ${sorted.length} deals · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Client','Deal','Étape','Statut','BU','Vendor','Montant (MAD)','Prob %','Closing','Owner','Next Step','Créé le'],
          rows: sorted.map(d => [
            d.accounts?.name || '—', d.title || '—', d.stage || 'Lead', normStatus(d),
            mainBU(d), d.vendor || '—', d.amount || 0, d.prob || 0,
            d.booking_month || '—', ownerName(d.owner_email),
            d.next_step || '—', (d.created_at || '').slice(0, 10),
          ]),
          totalsRow: ['TOTAL', `${sorted.length} deals`, '', '', '', '', totalAmt, '', '', '', '', ''],
          notes: `Won: ${mad(wonAmt)} · Open: ${mad(openAmt)} · Forecast: ${mad(forecastAmt)} · Win Rate: ${winRate}%`,
        }],
        summary: {
          title: `Résumé Deals · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total Deals', value: sorted.length, detail: `Open: ${openDeals.length} · Won: ${wonDeals.length} · Lost: ${lostDeals.length}` },
            { label: 'Pipeline (Open)', value: openAmt, detail: `${openDeals.length} deals en cours` },
            { label: 'Forecast pondéré', value: Math.round(forecastAmt), detail: 'Montant × probabilité' },
            { label: 'Won', value: wonAmt, detail: `${wonDeals.length} deals clôturés` },
            { label: 'Win Rate', value: `${winRate}%`, detail: `${wonDeals.length} Won / ${wonDeals.length + lostDeals.length} clôturés` },
          ],
          breakdownTitle: 'Répartition par BU',
          breakdownHeaders: ['BU', 'Montant (MAD)', 'Nb deals', '% du total'],
          breakdown: [...buMap.entries()].sort((a,b) => b[1].amount - a[1].amount).map(([bu, v]) => [
            bu, v.amount, v.count, totalAmt > 0 ? `${Math.round(v.amount / totalAmt * 100)}%` : '0%',
          ]),
        },
      }
      const res = await authFetch('/api/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message || 'Erreur export') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Deals</h1>
              <p className="text-xs text-slate-500">{rows.length} deals · {filtered.length} affichés</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} type="button" disabled={exporting}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export…' : 'Excel'}
            </button>
            <button onClick={load} disabled={loading} type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button onClick={() => setShowNewDeal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Nouveau deal
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />{err}
          </div>
        )}

        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-500">Pipeline</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{fmt(kpis.pipeAmt)}</div>
            <div className="mt-0.5 text-xs text-slate-500">{kpis.open} deals Open</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-violet-500">Forecast</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{fmt(kpis.foreAmt)}</div>
            <div className="mt-0.5 text-xs text-slate-500">Pondéré par probabilité</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Won</div>
            <div className="mt-1 text-2xl font-black text-emerald-700">{fmt(kpis.wonAmt)}</div>
            <div className="mt-0.5 text-xs text-slate-500">{kpis.won} deals clôturés</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Win Rate</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{kpis.winRate}%</div>
            <div className="mt-0.5 text-xs text-slate-500">{kpis.won} Won / {kpis.won + kpis.lost} clôturés</div>
          </div>
        </div>

        {/* ── TABLE ── */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 min-w-[200px]">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un deal, client…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
            </div>

            {/* Status filter pills */}
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {STATUS_ALL.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                    ${statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {s}
                </button>
              ))}
            </div>

            {/* More filters toggle */}
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors
                ${showFilters ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <Filter className="h-3.5 w-3.5" /> Filtres {showFilters && <X className="h-3 w-3" />}
            </button>

            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              {sorted.length} deals
              {hasFilters && (
                <button onClick={resetFilters} className="text-blue-600 hover:underline font-semibold">
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Extended filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Étape :</span>
                <div className="relative">
                  <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                    className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:outline-none">
                    <option value="Tous">Toutes</option>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-400" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">BU :</span>
                <div className="relative">
                  <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
                    className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:outline-none">
                    <option value="Tous">Toutes</option>
                    {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                    <option value="MULTI">Multi-BU</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-400" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Supply :</span>
                <div className="relative">
                  <select value={supplyFilter} onChange={e => setSupplyFilter(e.target.value as any)}
                    className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:outline-none">
                    <option value="Tous">Tous</option>
                    <option value="avec_supply">Avec commande supply</option>
                    <option value="sans_supply">Won sans commande</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-400" />
                </div>
              </div>
              {ownerOptions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Owner :</span>
                  <div className="relative">
                    <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
                      className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:outline-none">
                      <option value="Tous">Tous</option>
                      {ownerOptions.map(e => <option key={e} value={e}>{ownerName(e)}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              )}
              {vendorOptions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Carte :</span>
                  <div className="relative">
                    <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                      className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:outline-none">
                      <option value="Tous">Toutes</option>
                      {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Créé du :</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400" />
                <span className="text-xs text-slate-400">au</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-auto">
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <TH col="created_at" label="Créé" />
                    <TH col="account" label="Client" />
                    <TH col="title" label="Deal" />
                    <TH col="stage" label="Étape" />
                    <TH col="status" label="Statut" />
                    <TH col="bu" label="BU" />
                    <TH col="amount" label="Montant" right />
                    <TH col="prob" label="Prob" />
                    <TH col="closing" label="Closing" />
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Supply</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.map(d => {
                    const status  = normStatus(d)
                    const account = d.accounts?.name || '—'
                    const bu      = mainBU(d)
                    const isLate  = d.booking_month && d.booking_month < new Date().toISOString().slice(0, 7) && status === 'Open'
                    return (
                      <tr key={d.id} className={`group transition-colors ${isLate ? 'hover:bg-red-50/30' : 'hover:bg-slate-50/70'}`}>
                        <td className="w-[70px] min-w-[70px] pl-3 pr-1 py-2">
                          {(() => { const c = fmtCreated(d.created_at); return c ? (
                            <div className="flex flex-col gap-0.5 leading-none">
                              <span className="text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">{c.d}</span>
                              <span className="text-[9px] text-slate-300 tabular-nums">{c.t}</span>
                            </div>
                          ) : <span className="text-slate-200 text-[10px]">—</span> })()}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900 text-xs whitespace-nowrap max-w-[120px] truncate" title={account}>
                          {account}
                        </td>
                        <td className="px-3 py-2 max-w-[180px]">
                          <div className="truncate text-xs text-slate-700 font-medium" title={d.title || ''}>{d.title || '—'}</div>
                          {d.vendor && <div className="truncate text-[10px] text-slate-400 mt-0.5">{d.vendor}</div>}
                        </td>
                        <td className="px-3 py-2"><StagePill stage={d.stage || 'Lead'} /></td>
                        <td className="px-3 py-2"><StatusBadge status={status} /></td>
                        <td className="px-3 py-2"><BUPill bu={bu} /></td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 tabular-nums text-xs whitespace-nowrap">
                          {mad(d.amount || 0)}
                        </td>
                        <td className="px-3 py-2"><ProbBar prob={d.prob || 0} /></td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {d.booking_month ? (
                            <span className={isLate ? 'font-bold text-red-500' : 'text-slate-600'}>{d.booking_month}</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <SupplyBadge d={d} />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <Link href={`/opportunities/${d.id}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                              title="Voir le deal">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => setEditRow(d)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-amber-600 transition-colors"
                              title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setConfirmDel({ open: true, deal: d })}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                              title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-sm text-slate-400">
                        {rows.length === 0 ? 'Aucun deal.' : 'Aucun résultat pour ces filtres.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sorted.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-400">
              <span>{sorted.length} deal{sorted.length > 1 ? 's' : ''} · {rows.length} total</span>
              <span className="font-semibold text-slate-700">
                Total : {mad(sorted.reduce((s,d) => s + (d.amount||0), 0))}
              </span>
            </div>
          )}
        </div>

        {/* ── Deal Form Modal ── */}
        {(showNewDeal || editRow) && (
          <DealFormModal
            editRow={editRow}
            onClose={() => { setShowNewDeal(false); setEditRow(null) }}
            onSaved={() => { load(); setShowNewDeal(false); setEditRow(null) }}
          />
        )}

      </div>

      {/* ── Confirm delete modal ── */}
      {confirmDel.open && confirmDel.deal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') setConfirmDel({ open: false, deal: null }) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" role="alertdialog" aria-modal="true" aria-label="Confirmer la suppression du deal">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Supprimer ce deal ?</div>
                  <div className="text-xs text-slate-500">Tu pourras annuler pendant 8 secondes</div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 mb-4">
                <div className="text-xs font-bold text-slate-800 truncate">{confirmDel.deal.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{confirmDel.deal.accounts?.name || '—'} · {mad(confirmDel.deal.amount || 0)}</div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setConfirmDel({ open: false, deal: null })}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button onClick={deleteDeal} disabled={deleting}
                  className="h-9 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60">
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo toast ── */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-4">
          <span className="text-sm text-white">
            <span className="font-bold">{undoToast.deal.title}</span> supprimé
          </span>
          <button onClick={undoDelete}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 transition-colors">
            Annuler
          </button>
          <div className="h-1 w-20 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full animate-shrink" style={{ animation: 'shrink 8s linear forwards' }} />
          </div>
        </div>
      )}
      <style>{`@keyframes shrink { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  )
}

export default function DealsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Chargement…</div>}>
      <DealsPageInner />
    </Suspense>
  )
}
