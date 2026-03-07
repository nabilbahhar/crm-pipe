'use client'
import DealFormModal from '@/components/DealFormModal'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  Search, RefreshCw, Plus, Pencil, Eye, X, ChevronDown,
  TrendingUp, CheckCircle2, XCircle, Clock, AlertTriangle,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter,
} from 'lucide-react'

// ─── Import depuis utils ──────────────────────────────────────────────────────
import { mad, fmt, normStatus, STAGE_CFG, BU_BADGE_CLS } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
type SupplyStatus = 'a_commander' | 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'

type Deal = {
  id: string; account_id: string|null; title: string; stage: string
  status: 'Open'|'Won'|'Lost'; bu: string|null; vendor: string|null
  amount: number; prob: number|null; booking_month: string|null
  next_step: string|null; notes: string|null; multi_bu: boolean|null
  bu_lines: any; created_at: string|null; accounts?: { name?: string }|null
  // Supply join
  supply_orders?: { status: SupplyStatus }[] | null
  purchase_info?: { id: string; purchase_lines?: { pu_achat: number|null; fournisseur: string|null }[] }[] | null
}

const STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const
const BUS    = ['HCI','Network','Storage','Cyber','Service','CSG'] as const
const STATUS_ALL = ['Tous', 'Open', 'Won', 'Lost'] as const

// ─── Supply helpers ──────────────────────────────────────────────────────────
const SUPPLY_CFG: Record<SupplyStatus, { label: string; icon: string; color: string; bg: string }> = {
  a_commander: { label: 'À commander', icon: '📋', color: 'text-amber-700',   bg: 'bg-amber-50'   },
  place:       { label: 'Placé',        icon: '📤', color: 'text-blue-700',    bg: 'bg-blue-50'    },
  commande:    { label: 'Commandé',     icon: '🔄', color: 'text-violet-700',  bg: 'bg-violet-50'  },
  en_stock:    { label: 'En stock',     icon: '📦', color: 'text-orange-700',  bg: 'bg-orange-50'  },
  livre:       { label: 'Livré',        icon: '🚚', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',   bg: 'bg-slate-100'  },
}

function getSupplyStatus(d: Deal): SupplyStatus | null {
  const orders = d.supply_orders
  if (!orders || orders.length === 0) return null
  return orders[0].status
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
  const st = getSupplyStatus(d)
  if (!st) return null
  const cfg = SUPPLY_CFG[st]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function FicheBadge({ d }: { d: Deal }) {
  const st = getFicheStatus(d)
  if (!st) return null
  if (st === 'complete') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 whitespace-nowrap">
      ✓ Fiche OK
    </span>
  )
  if (st === 'en_cours') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 whitespace-nowrap">
      ⏳ En cours
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 whitespace-nowrap">
      ⚠ À faire
    </span>
  )
}

// ─── Helpers locaux ─────────────────────────────────────────────────────────────
const mainBU = (d: Deal): string => {
  if (d.multi_bu || (Array.isArray(d.bu_lines) && d.bu_lines.length > 0)) return 'MULTI'
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
  const [rows, setRows]       = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string|null>(null)

  // Filters
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<typeof STATUS_ALL[number]>('Tous')
  const [stageFilter, setStageFilter]     = useState('Tous')
  const [buFilter, setBuFilter]           = useState('Tous')
  const [showFilters, setShowFilters]     = useState(false)
  const [supplyFilter, setSupplyFilter]   = useState<'Tous' | 'avec_supply' | 'sans_supply'>('Tous')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')

  // Sort
  const [sortKey, setSortKey]   = useState<SortKey>('amount')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc')

  // ── Edit modal ──
  const searchParams = useSearchParams()
  const router = useRouter()
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [editRow, setEditRow]         = useState<any>(null)

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
      const { data, error } = await supabase.from('opportunities')
        .select('*, accounts(name), supply_orders(status), purchase_info(id, purchase_lines(pu_achat, fournisseur))')
        .order('created_at', { ascending: false })
        .limit(3000)
      if (error) throw error
      setRows((data || []) as Deal[])
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
      if (supplyFilter === 'avec_supply'  && getSupplyStatus(d) === null) return false
      if (supplyFilter === 'sans_supply'  && (status !== 'Won' || getSupplyStatus(d) !== null)) return false

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
  }, [rows, search, statusFilter, stageFilter, buFilter, dateFrom, dateTo, supplyFilter])

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

  const hasFilters = search || statusFilter !== 'Tous' || stageFilter !== 'Tous' || buFilter !== 'Tous' || dateFrom || dateTo || supplyFilter !== 'Tous'
  const resetFilters = () => {
    setSearch(''); setStatusFilter('Tous'); setStageFilter('Tous')
    setBuFilter('Tous'); setDateFrom(''); setDateTo(''); setSupplyFilter('Tous')
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

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
                    <option value="MULTI">MULTI</option>
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
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <TH col="created_at" label="Créé" />
                    <TH col="account" label="Client" />
                    <TH col="title" label="Deal" />
                    <TH col="stage" label="Étape" />
                    <TH col="status" label="Statut" />
                    <TH col="bu" label="BU" />
                    <TH col="vendor" label="Carte" />
                    <TH col="amount" label="Montant" right />
                    <TH col="prob" label="Prob" />
                    <TH col="closing" label="Closing" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Supply</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Fiche achat</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Actions</th>
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
                        <td className="w-[78px] min-w-[78px] pl-3 pr-1 py-2.5">
                          {(() => { const c = fmtCreated(d.created_at); return c ? (
                            <div className="flex flex-col gap-0.5 leading-none">
                              <span className="text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">{c.d}</span>
                              <span className="text-[9px] text-slate-300 tabular-nums">{c.t}</span>
                            </div>
                          ) : <span className="text-slate-200 text-[10px]">—</span> })()}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900 text-xs whitespace-nowrap max-w-[130px] truncate" title={account}>
                          {account}
                        </td>
                        <td className="px-4 py-2.5 max-w-[170px]">
                          <div className="truncate text-xs text-slate-700 font-medium" title={d.title || ''}>{d.title || '—'}</div>
                        </td>
                        <td className="px-4 py-2.5"><StagePill stage={d.stage || 'Lead'} /></td>
                        <td className="px-4 py-2.5"><StatusBadge status={status} /></td>
                        <td className="px-4 py-2.5"><BUPill bu={bu} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[100px] truncate">{d.vendor || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-black text-slate-900 tabular-nums text-xs whitespace-nowrap">
                          {mad(d.amount || 0)}
                        </td>
                        <td className="px-4 py-2.5"><ProbBar prob={d.prob || 0} /></td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">
                          {d.booking_month ? (
                            <span className={isLate ? 'font-bold text-red-500' : 'text-slate-600'}>{d.booking_month}</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {status === 'Won' ? <SupplyBadge d={d} /> : <span className="text-slate-200 text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {status === 'Won' ? (
                            <FicheBadge d={d} />
                          ) : <span className="text-slate-200 text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/opportunities/${d.id}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => setEditRow(d)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-16 text-center text-sm text-slate-400">
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
