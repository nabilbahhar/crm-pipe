'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { RefreshCw, Plus, Pencil, Eye, ChevronRight, TrendingUp, Target, Award, Clock } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────
type DealRow = {
  id: string
  account_id: string
  title: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  bu: string | null
  vendor: string | null
  amount: number
  prob: number | null
  booking_month: string | null
  next_step: string | null
  notes: string | null
  multi_bu: boolean | null
  bu_lines: any
  po_number?: string | null
  po_date?: string | null
  accounts?: { name?: string } | null
}

// ─── Constants ──────────────────────────────────────────────────────────────
const STAGES = [
  'Lead',
  'Discovery',
  'Qualified',
  'Solutioning',
  'Proposal Sent',
  'Negotiation',
  'Commit',
  'Won',
  'Lost / No decision',
] as const

const STAGE_NEXT: Record<string, string> = {
  Lead: 'Discovery',
  Discovery: 'Qualified',
  Qualified: 'Solutioning',
  Solutioning: 'Proposal Sent',
  'Proposal Sent': 'Negotiation',
  Negotiation: 'Commit',
  Commit: 'Won',
}

const STAGE_PROB: Record<string, number> = {
  Lead: 10, Discovery: 20, Qualified: 40,
  Solutioning: 55, 'Proposal Sent': 70,
  Negotiation: 80, Commit: 90, Won: 100,
  'Lost / No decision': 0,
}

const STAGE_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  Lead:              { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' },
  Discovery:         { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
  Qualified:         { bg: 'bg-cyan-50',     text: 'text-cyan-700',    dot: 'bg-cyan-400' },
  Solutioning:       { bg: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-400' },
  'Proposal Sent':   { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400' },
  Negotiation:       { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400' },
  Commit:            { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Won:               { bg: 'bg-green-100',   text: 'text-green-800',   dot: 'bg-green-500' },
  'Lost / No decision': { bg: 'bg-red-50',  text: 'text-red-600',     dot: 'bg-red-400' },
}

const BUS = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const

const BU_COLOR: Record<string, string> = {
  HCI: 'bg-indigo-50 text-indigo-700',
  Network: 'bg-sky-50 text-sky-700',
  Storage: 'bg-teal-50 text-teal-700',
  Cyber: 'bg-red-50 text-red-700',
  Service: 'bg-violet-50 text-violet-700',
  CSG: 'bg-amber-50 text-amber-700',
  MULTI: 'bg-slate-100 text-slate-600',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', {
    style: 'currency', currency: 'MAD', maximumFractionDigits: 0,
  }).format(n || 0)

function probBar(prob: number, stage: string) {
  const color =
    prob >= 80 ? 'bg-emerald-500' :
    prob >= 60 ? 'bg-amber-400' :
    prob >= 30 ? 'bg-orange-400' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${prob}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{prob}%</span>
    </div>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const c = STAGE_COLOR[stage] || { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {stage}
    </span>
  )
}

function BuBadge({ bu }: { bu: string | null }) {
  if (!bu) return <span className="text-slate-400">—</span>
  const cls = BU_COLOR[bu] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {bu}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PipelinePage() {
  const [rows, setRows] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Filters
  const [stageFilter, setStageFilter] = useState<string>('Open')   // 'Open' | 'Won' | stage name
  const [buFilter, setBuFilter] = useState<string>('Tous')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<'amount' | 'prob' | 'booking_month' | 'stage'>('booking_month')
  const [sortAsc, setSortAsc] = useState(true)

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase
      .from('opportunities')
      .select('*, accounts(name)')
      .order('created_at', { ascending: false })
    if (error) { setErr(error.message); setLoading(false); return }
    setRows((data as DealRow[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Advance stage ─────────────────────────────────────────────────────────
  async function advanceStage(deal: DealRow) {
    const next = STAGE_NEXT[deal.stage]
    if (!next) return
    const newStatus = next === 'Won' ? 'Won' : 'Open'
    const newProb = STAGE_PROB[next] ?? deal.prob
    const { error } = await supabase
      .from('opportunities')
      .update({ stage: next, status: newStatus, prob: newProb })
      .eq('id', deal.id)
    if (error) { setErr(error.message); return }
    setInfo(`✓ ${deal.title} → ${next}`)
    setTimeout(() => setInfo(null), 3000)
    load()
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open = rows.filter(r => r.status === 'Open')
    const won  = rows.filter(r => r.status === 'Won')
    const lost = rows.filter(r => r.status === 'Lost')

    const pipeline   = open.reduce((s, r) => s + Number(r.amount || 0), 0)
    const forecast   = open.reduce((s, r) => s + Number(r.amount || 0) * (Number(r.prob || 0) / 100), 0)
    const wonTotal   = won.reduce((s, r) => s + Number(r.amount || 0), 0)

    const byStagePipe: Record<string, { count: number; amount: number }> = {}
    STAGES.forEach(s => { byStagePipe[s] = { count: 0, amount: 0 } })
    open.forEach(r => {
      const key = r.stage || 'Lead'
      if (!byStagePipe[key]) byStagePipe[key] = { count: 0, amount: 0 }
      byStagePipe[key].count++
      byStagePipe[key].amount += Number(r.amount || 0)
    })

    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const nextMonth = now.getMonth() === 11
      ? `${now.getFullYear() + 1}-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`
    const urgent = open.filter(r => r.booking_month === thisMonth || r.booking_month === nextMonth)

    return {
      totalOpen: open.length,
      totalWon: won.length,
      totalLost: lost.length,
      pipeline, forecast, wonTotal,
      byStagePipe,
      urgentCount: urgent.length,
      urgentAmount: urgent.reduce((s, r) => s + Number(r.amount || 0), 0),
      winRate: won.length + lost.length > 0
        ? Math.round((won.length / (won.length + lost.length)) * 100)
        : 0,
    }
  }, [rows])

  // ── Filtered + sorted rows ────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    let r = [...rows]

    // Stage/status filter
    if (stageFilter === 'Open')  r = r.filter(x => x.status === 'Open')
    else if (stageFilter === 'Won')  r = r.filter(x => x.status === 'Won')
    else if (stageFilter === 'Lost') r = r.filter(x => x.status === 'Lost')
    else r = r.filter(x => x.stage === stageFilter)

    // BU filter
    if (buFilter !== 'Tous') r = r.filter(x => x.bu === buFilter || (x.multi_bu && buFilter === 'MULTI'))

    // Search
    const q = search.trim().toLowerCase()
    if (q) r = r.filter(x =>
      (x.accounts?.name || '').toLowerCase().includes(q) ||
      (x.title || '').toLowerCase().includes(q) ||
      (x.vendor || '').toLowerCase().includes(q) ||
      (x.next_step || '').toLowerCase().includes(q)
    )

    // Sort
    r.sort((a, b) => {
      let av: any, bv: any
      if (sortCol === 'amount') { av = a.amount; bv = b.amount }
      else if (sortCol === 'prob') { av = a.prob || 0; bv = b.prob || 0 }
      else if (sortCol === 'booking_month') { av = a.booking_month || ''; bv = b.booking_month || '' }
      else { av = STAGES.indexOf(a.stage as any); bv = STAGES.indexOf(b.stage as any) }
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })

    return r
  }, [rows, stageFilter, buFilter, search, sortCol, sortAsc])

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(p => !p)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortIcon = (col: typeof sortCol) => (
    <span className="ml-1 text-slate-300">
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Pipeline Prospection</div>
            <div className="text-sm text-slate-500">
              Suivi des deals de Lead jusqu'au PO — {rows.filter(r => r.status === 'Open').length} deals actifs
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/opportunities"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Nouveau deal
            </Link>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-50"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>
          </div>
        </div>

        {err  && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <TrendingUp className="h-3.5 w-3.5" /> Pipeline actif
            </div>
            <div className="text-xl font-bold text-slate-900">{mad(stats.pipeline)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.totalOpen} deals ouverts</div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Target className="h-3.5 w-3.5" /> Forecast pondéré
            </div>
            <div className="text-xl font-bold text-violet-700">{mad(stats.forecast)}</div>
            <div className="mt-1 text-xs text-slate-500">Prob × Montant</div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Award className="h-3.5 w-3.5" /> Won (PO reçus)
            </div>
            <div className="text-xl font-bold text-emerald-700">{mad(stats.wonTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.totalWon} deals closés · Win rate {stats.winRate}%</div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Closing imminent
            </div>
            <div className="text-xl font-bold text-orange-600">{mad(stats.urgentAmount)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.urgentCount} deals ce mois / mois prochain</div>
          </div>
        </div>

        {/* ── Stage funnel bar ─────────────────────────────────────────────── */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Funnel par étape (deals ouverts)</div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won'] as const).map(s => {
              const d = stats.byStagePipe[s] || { count: 0, amount: 0 }
              const c = STAGE_COLOR[s]
              const isActive = stageFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStageFilter(isActive ? 'Open' : s)}
                  className={`flex-1 min-w-[90px] rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm
                    ${isActive ? `${c.bg} border-current ${c.text}` : 'border-slate-100 hover:border-slate-200'}`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wide truncate ${isActive ? c.text : 'text-slate-400'}`}>{s}</div>
                  <div className={`mt-0.5 text-lg font-bold ${isActive ? c.text : 'text-slate-700'}`}>{d.count}</div>
                  <div className={`text-[10px] tabular-nums ${isActive ? c.text : 'text-slate-400'}`}>
                    {d.amount > 0 ? (d.amount >= 1_000_000
                      ? `${(d.amount / 1_000_000).toFixed(1)}M`
                      : `${Math.round(d.amount / 1000)}K`) + ' MAD' : '—'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">

          {/* Status pills */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            {[
              { key: 'Open',  label: `Open (${stats.totalOpen})` },
              { key: 'Won',   label: `Won (${stats.totalWon})` },
              { key: 'Lost',  label: `Lost (${stats.totalLost})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStageFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                  ${stageFilter === key
                    ? key === 'Won'  ? 'bg-emerald-600 text-white'
                    : key === 'Lost' ? 'bg-red-600 text-white'
                    : 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* BU filter */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            {['Tous', ...BUS].map(b => (
              <button
                key={b}
                onClick={() => setBuFilter(b)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                  ${buFilter === b ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
            <input
              type="text"
              placeholder="Compte, titre, vendor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="text-xs text-slate-400">{displayRows.length} résultat{displayRows.length > 1 ? 's' : ''}</div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="mt-3 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-3 text-left font-semibold">Compte</th>
                  <th className="px-4 py-3 text-left font-semibold">Deal</th>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('stage')}>
                    Étape {sortIcon('stage')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">BU</th>
                  <th className="px-4 py-3 text-left font-semibold">Vendor / Carte</th>
                  <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                    Montant {sortIcon('amount')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('prob')}>
                    Prob {sortIcon('prob')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('booking_month')}>
                    Closing {sortIcon('booking_month')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Next Step</th>
                  <th className="px-4 py-3 text-left font-semibold">PO</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-sm text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Chargement…
                      </div>
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-sm text-slate-400">
                      Aucun deal pour les filtres sélectionnés.
                    </td>
                  </tr>
                ) : displayRows.map(r => {
                  const nextStage = STAGE_NEXT[r.stage]
                  const isWonOrLost = r.status === 'Won' || r.status === 'Lost'

                  // Vendor/card display
                  const vendorCell = r.multi_bu && Array.isArray(r.bu_lines) && r.bu_lines.length > 0
                    ? <span className="text-xs text-slate-500">{r.bu_lines.map((l: any) => l.card).filter(Boolean).join(', ') || r.vendor || '—'}</span>
                    : <span className="text-xs text-slate-700">{r.vendor || '—'}</span>

                  // Closing urgency
                  const now = new Date()
                  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                  const isUrgent = r.booking_month === thisMonth
                  const isPast = r.booking_month && r.booking_month < thisMonth && r.status === 'Open'

                  return (
                    <tr key={r.id} className="group hover:bg-slate-50/60 transition-colors">
                      {/* Compte */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{r.accounts?.name || '—'}</div>
                      </td>

                      {/* Deal title */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <Link
                          href={`/opportunities/${r.id}`}
                          className="block truncate font-medium text-slate-800 hover:text-slate-900 hover:underline"
                          title={r.title}
                        >
                          {r.title}
                        </Link>
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3">
                        <StageBadge stage={r.stage} />
                      </td>

                      {/* BU */}
                      <td className="px-4 py-3">
                        <BuBadge bu={r.multi_bu ? 'MULTI' : r.bu} />
                      </td>

                      {/* Vendor */}
                      <td className="px-4 py-3 max-w-[140px] truncate">{vendorCell}</td>

                      {/* Montant */}
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                        {mad(Number(r.amount || 0))}
                      </td>

                      {/* Probabilité */}
                      <td className="px-4 py-3">
                        {probBar(Number(r.prob || 0), r.stage)}
                      </td>

                      {/* Closing */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold tabular-nums ${
                          isPast ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-slate-600'
                        }`}>
                          {isPast ? '⚠ ' : isUrgent ? '🔥 ' : ''}{r.booking_month || '—'}
                        </span>
                      </td>

                      {/* Next Step */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="truncate text-xs text-slate-500" title={r.next_step || ''}>
                          {r.next_step || <span className="italic text-slate-300">—</span>}
                        </div>
                      </td>

                      {/* PO */}
                      <td className="px-4 py-3">
                        {r.po_number ? (
                          <div>
                            <div className="text-xs font-semibold text-emerald-700">{r.po_number}</div>
                            {r.po_date && (
                              <div className="text-[10px] text-slate-400">
                                {new Date(r.po_date).toLocaleDateString('fr-MA')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            href={`/opportunities/${r.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Voir le deal"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          {!isWonOrLost && nextStage && (
                            <button
                              onClick={() => advanceStage(r)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-slate-900 px-2 text-xs text-white hover:bg-slate-700"
                              title={`Avancer → ${nextStage}`}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              {nextStage === 'Won' ? 'Won ✓' : nextStage}
                            </button>
                          )}
                          <Link
                            href="/opportunities"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Modifier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {displayRows.length > 0 && (
            <div className="flex items-center justify-between border-t bg-slate-50/50 px-4 py-2.5">
              <div className="text-xs text-slate-400">
                {displayRows.length} deal{displayRows.length > 1 ? 's' : ''} affichés
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Total: <strong className="text-slate-800">
                  {mad(displayRows.reduce((s, r) => s + Number(r.amount || 0), 0))}
                </strong></span>
                <span>Forecast: <strong className="text-violet-700">
                  {mad(displayRows.reduce((s, r) => s + Number(r.amount || 0) * (Number(r.prob || 0) / 100), 0))}
                </strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ── By-BU breakdown ──────────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {BUS.map(bu => {
            const buDeals = rows.filter(r => r.status === 'Open' && (r.bu === bu || (r.multi_bu && Array.isArray(r.bu_lines) && r.bu_lines.some((l: any) => l.bu === bu))))
            const buAmt = buDeals.reduce((s, r) => {
              if (r.multi_bu && Array.isArray(r.bu_lines)) {
                return s + r.bu_lines.filter((l: any) => l.bu === bu).reduce((ss: number, l: any) => ss + Number(l.amount || 0), 0)
              }
              return s + Number(r.amount || 0)
            }, 0)
            const cls = BU_COLOR[bu] || 'bg-slate-50 text-slate-600'
            return (
              <div key={bu} className={`rounded-2xl border p-3 ${cls.includes('bg-') ? '' : 'bg-white'}`}
                style={{ background: 'white', borderColor: '#e2e8f0' }}>
                <div className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{bu}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{buDeals.length}</div>
                <div className="text-[11px] text-slate-400 tabular-nums">{mad(buAmt)}</div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
