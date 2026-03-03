'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  RefreshCw, TrendingUp, Target, Award, Zap, AlertTriangle,
  ChevronDown, BarChart2, Activity, ArrowUp, ArrowDown, Minus,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, LabelList,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────
type ViewMode = 'year' | 'quarter' | 'month'
type MetricMode = 'amount' | 'count'
type ScopeMode = 'open_won' | 'open_only'
const SBU_ORDER = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const
type SBU = (typeof SBU_ORDER)[number] | 'MULTI' | 'Other'
const STAGE_ORDER = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const

const SBU_COLORS: Record<string, string> = {
  HCI: '#6366f1', Network: '#0ea5e9', Storage: '#14b8a6',
  Cyber: '#ef4444', Service: '#8b5cf6', CSG: '#f59e0b',
  MULTI: '#94a3b8', Other: '#cbd5e1',
}
const CHART = {
  pipeline: '#3b82f6', forecast: '#8b5cf6', commit: '#f59e0b',
  won: '#10b981', lost: '#ef4444', csg: '#1e293b', cirs: '#64748b', grid: '#f1f5f9',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)
const pct = (v: number, t: number) => (!t ? 0 : Math.round((v / t) * 100))
const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}
const ymFrom = (raw: any): string | null => {
  if (!raw) return null
  if (typeof raw === 'string') { const s = raw.trim(); if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); return null }
  try { const d = new Date(raw); if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` } catch {}
  return null
}
const monthsOfYear = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
const quarterMonths = (y: number, q: 'Q1'|'Q2'|'Q3'|'Q4') => {
  const s = q === 'Q1' ? 1 : q === 'Q2' ? 4 : q === 'Q3' ? 7 : 10
  return Array.from({ length: 3 }, (_, i) => `${y}-${String(s + i).padStart(2, '0')}`)
}
const normStage = (s: any) => String(s || '').trim() || 'Lead'
const normStatus = (r: any): 'Open'|'Won'|'Lost' => {
  const st = String(r?.status || '').trim()
  if (st === 'Won' || st === 'Lost' || st === 'Open') return st
  const sg = normStage(r?.stage).toLowerCase()
  if (sg === 'won') return 'Won'; if (sg.includes('lost')) return 'Lost'; return 'Open'
}
const normSBU = (raw: any): SBU => {
  const v = String(raw || '').trim(); if (!v) return 'Other'
  const u = v.toUpperCase()
  if (u === 'MULTI') return 'MULTI'; if (u.includes('CSG')) return 'CSG'
  if (u.includes('NETWORK')) return 'Network'; if (u.includes('STORAGE')) return 'Storage'
  if (u.includes('CYBER')) return 'Cyber'; if (u.includes('SERVICE')) return 'Service'
  if (u.includes('HCI') || u.includes('INFRA')) return 'HCI'; return 'Other'
}
const buGroup = (s: SBU): 'CSG'|'CIRS' => (s === 'CSG' ? 'CSG' : 'CIRS')

type NormLine = { sbu: SBU; group: 'CSG'|'CIRS'; card: string; amount: number }
type Deal = {
  id: string; account_id: string|null; account_name: string; title: string
  stage: string; status: 'Open'|'Won'|'Lost'; prob: number; amount: number
  closingYm: string; closingYmReal: string|null; missingClosing: boolean
  missingNextStep: boolean; isMulti: boolean; lines: NormLine[]; raw: any
}

// ─── UI Components ───────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, icon, trend }: {
  label: string; value: string; sub?: string
  color: 'blue'|'violet'|'amber'|'green'; icon: React.ReactNode; trend?: 'up'|'down'|'flat'
}) {
  const cfg = {
    blue:   { grad: 'from-blue-600 to-blue-500',   ring: 'ring-blue-100',   bg: 'bg-blue-50',   num: 'text-blue-700' },
    violet: { grad: 'from-violet-600 to-violet-500', ring: 'ring-violet-100', bg: 'bg-violet-50', num: 'text-violet-700' },
    amber:  { grad: 'from-amber-500 to-amber-400',  ring: 'ring-amber-100',  bg: 'bg-amber-50',  num: 'text-amber-700' },
    green:  { grad: 'from-emerald-600 to-emerald-500', ring: 'ring-emerald-100', bg: 'bg-emerald-50', num: 'text-emerald-700' },
  }[color]
  return (
    <div className={`relative overflow-hidden rounded-2xl ${cfg.bg} ring-1 ${cfg.ring} p-5 flex flex-col gap-3`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${cfg.grad} text-white shadow-md`}>
          {icon}
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold
            ${trend === 'up' ? 'bg-emerald-100 text-emerald-700' : trend === 'down' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
            {trend === 'up' ? <ArrowUp className="h-3 w-3" /> : trend === 'down' ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </span>
        )}
      </div>
      <div>
        <div className={`text-2xl font-black tracking-tight ${cfg.num}`}>{value}</div>
        <div className="mt-0.5 text-sm font-semibold text-slate-700">{label}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

function Panel({ title, sub, children, className }: {
  title: string; sub?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden ${className || ''}`}>
      <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SegButton({ items, value, onChange }: {
  items: { id: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
      {items.map(it => (
        <button key={it.id} type="button" onClick={() => onChange(it.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
            ${value === it.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

function ChartTip({ active, payload, label, isAmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-xl text-xs">
      <div className="mb-2 font-bold text-slate-800">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-900">{isAmt ? fmt(p.value) + ' MAD' : p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ msg }: { msg?: string }) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-300">
      <BarChart2 className="h-8 w-8" />
      <div className="text-sm font-medium">{msg || 'Aucune donnée'}</div>
    </div>
  )
}

function StagePill({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    Lead: 'bg-slate-100 text-slate-600',
    Discovery: 'bg-blue-50 text-blue-700',
    Qualified: 'bg-cyan-50 text-cyan-700',
    Solutioning: 'bg-violet-50 text-violet-700',
    'Proposal Sent': 'bg-amber-50 text-amber-700',
    Negotiation: 'bg-orange-50 text-orange-700',
    Commit: 'bg-emerald-50 text-emerald-700',
    Won: 'bg-green-100 text-green-800',
    'Lost / No decision': 'bg-red-50 text-red-600',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[stage] || 'bg-slate-100 text-slate-600'}`}>
      {stage}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  if (status === 'Won') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Won</span>
  if (status === 'Lost') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600"><XCircle className="h-3 w-3" />Lost</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"><Clock className="h-3 w-3" />Open</span>
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const now = new Date()
  const thisYear = now.getFullYear()
  const [year, setYear] = useState(thisYear)
  const [view, setView] = useState<ViewMode>('quarter')
  const [quarter, setQuarter] = useState<'Q1'|'Q2'|'Q3'|'Q4'>('Q1')
  const [month, setMonth] = useState(`${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [metric, setMetric] = useState<MetricMode>('amount')
  const [scope, setScope] = useState<ScopeMode>('open_won')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string|null>(null)
  const [rows, setRows] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<'account'|'stage'|'sbu'|'card'|'amount'|'prob'|'closing'>('amount')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const periodMonths = useMemo(() => {
    if (view === 'year') return monthsOfYear(year)
    if (view === 'quarter') return quarterMonths(year, quarter)
    return [month]
  }, [view, year, quarter, month])

  const periodLabel = useMemo(() => {
    if (view === 'year') return `Année ${year}`
    if (view === 'quarter') return `${quarter} ${year}`
    return `Mois ${month}`
  }, [view, year, quarter, month])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase.from('opportunities').select('*, accounts(name)').order('created_at', { ascending: false }).limit(5000)
      if (error) throw error
      setRows(data || [])
    } catch (e: any) { setErr(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const deals: Deal[] = useMemo(() => {
    return (rows || []).flatMap(r => {
      const id = String(r?.id || ''); if (!id) return []
      const stage = normStage(r?.stage)
      const status = normStatus(r)
      const prob = Math.max(0, Math.min(100, Number(r?.prob ?? 0) || 0))
      const amount = Number(r?.amount ?? 0) || 0
      const closingYmReal = ymFrom(r?.booking_month) ?? ymFrom(r?.closing_month) ?? ymFrom(r?.closing_date) ?? ymFrom(r?.closing) ?? null
      const createdYm = ymFrom(r?.created_at) ?? null
      const closingYm = closingYmReal || createdYm || `${year}-01`
      const missingClosing = !closingYmReal
      const missingNextStep = !String(r?.next_step || '').trim()
      const isMulti = Boolean(r?.multi_bu) || (Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0) || String(r?.bu || '').toUpperCase() === 'MULTI'
      const lines: NormLine[] = []
      if (isMulti && Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0) {
        for (const x of r.bu_lines) {
          const sbu = normSBU(x?.bu)
          lines.push({ sbu, group: buGroup(sbu), card: String(x?.card || x?.vendor || r?.vendor || '—').trim() || '—', amount: Number(x?.amount ?? 0) || 0 })
        }
      } else {
        const sbu = normSBU(r?.bu)
        lines.push({ sbu, group: buGroup(sbu), card: String(r?.vendor || r?.card || '—').trim() || '—', amount })
      }
      if (lines.length === 0) { const sbu = normSBU(r?.bu || 'Other'); lines.push({ sbu, group: buGroup(sbu), card: '—', amount }) }
      return [{ id, account_id: r?.account_id ? String(r.account_id) : null, account_name: String(r?.accounts?.name || r?.account_name || '—'), title: String(r?.title || r?.name || '—'), stage, status, prob, amount, closingYm, closingYmReal, missingClosing, missingNextStep, isMulti, lines, raw: r }]
    })
  }, [rows, year])

  const inPeriod = useMemo(() => { const s = new Set(periodMonths); return deals.filter(d => s.has(d.closingYm)) }, [deals, periodMonths])
  const openDeals = useMemo(() => inPeriod.filter(d => d.status === 'Open'), [inPeriod])
  const wonDeals = useMemo(() => inPeriod.filter(d => d.status === 'Won'), [inPeriod])
  const lostDeals = useMemo(() => inPeriod.filter(d => d.status === 'Lost'), [inPeriod])
  const scopeDeals = useMemo(() => scope === 'open_only' ? openDeals : [...openDeals, ...wonDeals], [openDeals, wonDeals, scope])
  const mv = (a: number, c: number) => (metric === 'amount' ? a : c)

  const kpis = useMemo(() => {
    const pipeAmt = openDeals.reduce((s, d) => s + d.amount, 0)
    const foreAmt = openDeals.reduce((s, d) => s + d.amount * (d.prob / 100), 0)
    const commitDeals = openDeals.filter(d => d.stage.toLowerCase() === 'commit')
    const commitAmt = commitDeals.reduce((s, d) => s + d.amount, 0)
    const wonAmt = wonDeals.reduce((s, d) => s + d.amount, 0)
    return { pipeAmt, pipeCount: openDeals.length, foreAmt, foreCount: openDeals.filter(d => d.prob > 0).length, commitAmt, commitCount: commitDeals.length, wonAmt, wonCount: wonDeals.length, conf: pipeAmt ? Math.round((foreAmt / pipeAmt) * 100) : 0 }
  }, [openDeals, wonDeals])

  const quality = useMemo(() => ({
    missingAmt: openDeals.filter(d => d.amount <= 0).length,
    missingClose: openDeals.filter(d => d.missingClosing).length,
    missingStep: openDeals.filter(d => d.missingNextStep).length,
  }), [openDeals])

  const donut = useMemo(() => {
    const d = [
      { name: 'Won', value: mv(wonDeals.reduce((s,d)=>s+d.amount,0), wonDeals.length), color: CHART.won },
      { name: 'Open', value: mv(openDeals.reduce((s,d)=>s+d.amount,0), openDeals.length), color: CHART.pipeline },
      { name: 'Lost', value: mv(lostDeals.reduce((s,d)=>s+d.amount,0), lostDeals.length), color: CHART.lost },
    ]
    return { d, total: d.reduce((s,x)=>s+x.value,0) }
  }, [openDeals, wonDeals, lostDeals, metric])

  const mixBU = useMemo(() => {
    let csgA = 0, cirsA = 0, csgC = 0, cirsC = 0
    for (const d of openDeals) {
      if (metric === 'count') {
        const sumCsg = d.lines.filter(x => x.group === 'CSG').reduce((s,x) => s+x.amount, 0)
        const sumCirs = d.lines.filter(x => x.group === 'CIRS').reduce((s,x) => s+x.amount, 0)
        if (sumCsg >= sumCirs) csgC++; else cirsC++
      } else { for (const ln of d.lines) { if (ln.group === 'CSG') csgA += ln.amount; else cirsA += ln.amount } }
    }
    const data = [{ name: 'CIRS', value: mv(cirsA, cirsC), color: CHART.cirs }, { name: 'CSG', value: mv(csgA, csgC), color: CHART.csg }]
    return { data, total: data.reduce((s,x)=>s+x.value,0) }
  }, [openDeals, metric])

  const bySBU = useMemo(() => {
    const map = new Map<string, { sbu: string; total: number; forecast: number }>()
    for (const d of openDeals) for (const ln of d.lines) {
      const sbu = ln.sbu === 'Other' ? 'Other' : String(ln.sbu)
      const cur = map.get(sbu) || { sbu, total: 0, forecast: 0 }
      if (metric === 'count') { cur.total++; cur.forecast++ }
      else { cur.total += ln.amount; cur.forecast += ln.amount * (d.prob / 100) }
      map.set(sbu, cur)
    }
    return [...map.values()].sort((a, b) => {
      const idx = (s: string) => { const i = SBU_ORDER.findIndex(v => v.toUpperCase() === s.toUpperCase()); return i >= 0 ? i : 100 }
      return idx(a.sbu) - idx(b.sbu)
    })
  }, [openDeals, metric])

  const byStage = useMemo(() => {
    const map = new Map<string, { stage: string; total: number }>()
    for (const d of openDeals) {
      const cur = map.get(d.stage) || { stage: d.stage, total: 0 }
      cur.total += metric === 'amount' ? d.amount : 1
      map.set(d.stage, cur)
    }
    return [...map.values()].sort((a, b) => {
      const i = (s: string) => { const x = STAGE_ORDER.findIndex(v => v.toLowerCase() === s.toLowerCase()); return x >= 0 ? x : 999 }
      return i(a.stage) - i(b.stage)
    })
  }, [openDeals, metric])

  const trend = useMemo(() => monthsOfYear(year).map(m => {
    const base = deals.filter(d => d.closingYm.startsWith(`${year}-`))
    const inM = base.filter(d => d.closingYm === m)
    const open = inM.filter(d => d.status === 'Open')
    const won = inM.filter(d => d.status === 'Won')
    const mv2 = (a: number, c: number) => metric === 'amount' ? a : c
    return {
      month: new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
      total: mv2(open.reduce((s,d)=>s+d.amount,0), open.length),
      forecast: mv2(open.reduce((s,d)=>s+d.amount*(d.prob/100),0), open.filter(d=>d.prob>0).length),
      commit: mv2(open.filter(d=>d.stage.toLowerCase()==='commit').reduce((s,d)=>s+d.amount,0), open.filter(d=>d.stage.toLowerCase()==='commit').length),
      won: mv2(won.reduce((s,d)=>s+d.amount,0), won.length),
    }
  }), [deals, year, metric])

  const topClients = useMemo(() => {
    const map = new Map<string, { client: string; csg: number; cirs: number; total: number }>()
    for (const d of scopeDeals) {
      const key = d.account_name; const cur = map.get(key) || { client: key, csg: 0, cirs: 0, total: 0 }
      if (metric === 'count') { cur.total++ }
      else { for (const ln of d.lines) { if (ln.group === 'CSG') cur.csg += ln.amount; else cur.cirs += ln.amount }; cur.total = cur.csg + cur.cirs }
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  }, [scopeDeals, metric])

  const topVendors = useMemo(() => {
    const map = new Map<string, { card: string; total: number }>()
    for (const d of scopeDeals) for (const ln of d.lines) {
      const card = (ln.card || '—').trim() || '—'; const cur = map.get(card) || { card, total: 0 }
      cur.total += metric === 'amount' ? ln.amount : 1; map.set(card, cur)
    }
    const arr = [...map.values()].sort((a,b)=>b.total-a.total).slice(0, 8)
    const grand = arr.reduce((s,x)=>s+x.total,0)
    return arr.map(x => ({ ...x, pct: pct(x.total, grand) }))
  }, [scopeDeals, metric])

  const late = useMemo(() => openDeals.filter(d => d.closingYmReal && d.closingYmReal < periodMonths[0]).sort((a,b)=>b.amount-a.amount).slice(0, 12), [openDeals, periodMonths])
  const topOpen = useMemo(() => [...openDeals].sort((a,b)=>b.amount-a.amount).slice(0, 10), [openDeals])
  const topWon = useMemo(() => [...wonDeals].sort((a,b)=>b.amount-a.amount).slice(0, 10), [wonDeals])

  const sortedDeals = useMemo(() => {
    const bestLine = (d: Deal) => [...d.lines].sort((a,b)=>b.amount-a.amount)[0]
    return [...inPeriod].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      let va: any = '', vb: any = ''
      switch (sortKey) {
        case 'account': va = a.account_name; vb = b.account_name; break
        case 'stage': va = a.stage; vb = b.stage; break
        case 'sbu': va = String(bestLine(a)?.sbu); vb = String(bestLine(b)?.sbu); break
        case 'card': va = bestLine(a)?.card; vb = bestLine(b)?.card; break
        case 'prob': va = a.prob; vb = b.prob; break
        case 'closing': va = a.closingYmReal || a.closingYm; vb = b.closingYmReal || b.closingYm; break
        default: va = a.amount; vb = b.amount
      }
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb))
    })
  }, [inPeriod, sortKey, sortDir])

  const Th = ({ col, label }: { col: typeof sortKey; label: string }) => {
    const active = sortKey === col
    return (
      <th onClick={() => { if (!active) { setSortKey(col); setSortDir('desc') } else setSortDir(d => d === 'desc' ? 'asc' : 'desc') }}
        className={`px-4 py-3 text-left text-xs font-semibold cursor-pointer select-none whitespace-nowrap transition-colors
          ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
        {label}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-screen-2xl px-4 py-6 space-y-6">

        {/* ── HEADER ── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-xs text-slate-500">{periodLabel} · {inPeriod.length} deals</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
            </div>

            <SegButton value={view} onChange={v => setView(v as ViewMode)}
              items={[{ id: 'year', label: 'Année' }, { id: 'quarter', label: 'Trimestre' }, { id: 'month', label: 'Mois' }]} />

            {view === 'quarter' && (
              <div className="relative">
                <select value={quarter} onChange={e => setQuarter(e.target.value as any)}
                  className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none">
                  {(['Q1','Q2','Q3','Q4'] as const).map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            )}
            {view === 'month' && (
              <div className="relative">
                <select value={month} onChange={e => setMonth(e.target.value)}
                  className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none">
                  {monthsOfYear(year).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            )}

            <SegButton value={metric} onChange={v => setMetric(v as MetricMode)}
              items={[{ id: 'amount', label: 'Montant' }, { id: 'count', label: 'Nombre' }]} />
            <SegButton value={scope} onChange={v => setScope(v as ScopeMode)}
              items={[{ id: 'open_won', label: 'Open+Won' }, { id: 'open_only', label: 'Open' }]} />

            <button onClick={load} disabled={loading} type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pipeline actif" color="blue" icon={<TrendingUp className="h-5 w-5" />}
            value={metric === 'amount' ? fmt(kpis.pipeAmt) + ' MAD' : String(kpis.pipeCount)}
            sub={`${kpis.pipeCount} deals · Confiance ${kpis.conf}%`} />
          <MetricCard label="Forecast pondéré" color="violet" icon={<Target className="h-5 w-5" />}
            value={metric === 'amount' ? fmt(kpis.foreAmt) + ' MAD' : String(kpis.foreCount)}
            sub={`${kpis.foreCount} deals probabilisés`} />
          <MetricCard label="En Commit" color="amber" icon={<Zap className="h-5 w-5" />}
            value={metric === 'amount' ? fmt(kpis.commitAmt) + ' MAD' : String(kpis.commitCount)}
            sub={`${kpis.commitCount} deals stade Commit`} />
          <MetricCard label="Won (période)" color="green" icon={<Award className="h-5 w-5" />}
            value={metric === 'amount' ? fmt(kpis.wonAmt) + ' MAD' : String(kpis.wonCount)}
            sub={`${kpis.wonCount} deals clôturés`} />
        </div>

        {/* ── ALERTES QUALITÉ (bandeau compact) ── */}
        {(quality.missingAmt + quality.missingClose + quality.missingStep) > 0 && (
          <div className="flex flex-wrap gap-3">
            {quality.missingAmt > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4" /> {quality.missingAmt} deals sans montant
              </div>
            )}
            {quality.missingClose > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                <AlertTriangle className="h-4 w-4" /> {quality.missingClose} deals sans closing
              </div>
            )}
            {quality.missingStep > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> {quality.missingStep} sans next step
              </div>
            )}
          </div>
        )}

        {/* ── ROW 1 : Donut statuts + Mix BU + SBU ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel title="Open / Won / Lost" sub={metric === 'amount' ? 'MAD' : 'Nb deals'}>
            {donut.total <= 0 ? <Empty /> : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut.d} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={3}>
                      {donut.d.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex justify-center gap-4">
              {donut.d.map(e => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                  <span className="text-slate-600 font-medium">{e.name}</span>
                  <span className="font-bold text-slate-900">{metric === 'amount' ? fmt(e.value) : e.value}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Mix CSG vs CIRS" sub={`Open · ${metric === 'amount' ? 'MAD' : 'Nb'}`}>
            {mixBU.total <= 0 ? <Empty /> : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mixBU.data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={3}
                      label={({ name, value }) => `${name} ${pct(Number(value || 0), mixBU.total)}%`}
                      labelLine={false}>
                      {mixBU.data.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex justify-center gap-6">
              {mixBU.data.map(e => (
                <div key={e.name} className="text-center">
                  <div className="text-lg font-black text-slate-900">{pct(e.value, mixBU.total)}%</div>
                  <div className="text-xs text-slate-500 font-medium">{e.name}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Pipeline par étape" sub={`Open · ${metric === 'amount' ? 'MAD' : 'Nb'}`}>
            {byStage.length === 0 ? <Empty /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byStage} layout="vertical" margin={{ top: 0, right: 45, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={108} />
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                    <Bar dataKey="total" name="Total" fill="#6366f1" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" formatter={(v: any) => fmt(v)} style={{ fontSize: 9, fill: '#94a3b8' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* ── ROW 2 : SBU détail + Tendance ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Pipeline par BU" sub={`Open · Total vs Forecast · ${metric === 'amount' ? 'MAD' : 'Nb'}`}>
            {bySBU.length === 0 ? <Empty /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySBU} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} barGap={2}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="sbu" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} tickFormatter={fmt} />
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                    <Bar name="Total Open" dataKey="total" fill="#1e293b" radius={[4, 4, 0, 0]} />
                    <Bar name="Forecast" dataKey="forecast" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title={`Tendance ${year}`} sub={`Total / Forecast / Commit / Won`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} tickFormatter={fmt} />
                  <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                  <Line type="monotone" dataKey="total" name="Total Open" stroke={CHART.csg} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="forecast" name="Forecast" stroke={CHART.pipeline} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="commit" name="Commit" stroke={CHART.commit} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="won" name="Won" stroke={CHART.won} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* ── ROW 3 : Top Clients + Top Vendors ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Top 5 Clients" sub={`${scope === 'open_only' ? 'Open' : 'Open+Won'}`}>
            {topClients.length === 0 ? <Empty /> : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClients} margin={{ top: 5, right: 10, bottom: 28, left: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="client" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={42} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} tickFormatter={fmt} />
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                    <Bar name="CIRS" dataKey="cirs" stackId="a" fill={CHART.cirs} radius={[0, 0, 0, 0]} />
                    <Bar name="CSG" dataKey="csg" stackId="a" fill={CHART.csg} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Top Constructeurs / Cartes" sub={`${scope === 'open_only' ? 'Open' : 'Open+Won'}`}>
            {topVendors.length === 0 ? <Empty /> : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topVendors} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="card" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip content={<ChartTip isAmt={metric === 'amount'} />} />
                    <Bar name="Total" dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="pct" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 9, fill: '#94a3b8' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* ── ROW 4 : Top Open + Top Won ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Top Open Deals" sub="Trié par montant">
            {topOpen.length === 0 ? <Empty /> : (
              <div className="overflow-auto max-h-60 -mx-5 px-5">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">Deal</th>
                      <th className="pb-2 text-left">Étape</th>
                      <th className="pb-2 text-right">Montant</th>
                      <th className="pb-2 text-right">Prob</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {topOpen.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 pr-3 font-semibold text-slate-900 whitespace-nowrap text-xs">{d.account_name}</td>
                        <td className="py-2 pr-3 text-slate-600 text-xs max-w-[130px] truncate">
                          <Link href={`/opportunities?edit=${d.id}`} className="hover:text-blue-600 hover:underline">{d.title}</Link>
                        </td>
                        <td className="py-2 pr-3"><StagePill stage={d.stage} /></td>
                        <td className="py-2 text-right font-bold text-slate-900 tabular-nums text-xs whitespace-nowrap">{fmt(d.amount)}</td>
                        <td className="py-2 text-right text-slate-500 tabular-nums text-xs">{d.prob}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Top Won Deals" sub="Clôturés sur la période">
            {topWon.length === 0 ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
                <Award className="h-5 w-5" /> Aucun Won pour l'instant
              </div>
            ) : (
              <div className="overflow-auto max-h-60 -mx-5 px-5">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">Deal</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {topWon.map(d => (
                      <tr key={d.id} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="py-2 pr-3 font-semibold text-slate-900 whitespace-nowrap text-xs">{d.account_name}</td>
                        <td className="py-2 pr-3 text-slate-600 text-xs max-w-[160px] truncate">
                          <Link href={`/opportunities?edit=${d.id}`} className="hover:text-emerald-600 hover:underline">{d.title}</Link>
                        </td>
                        <td className="py-2 text-right font-black text-emerald-700 tabular-nums text-xs whitespace-nowrap">{fmt(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── RETARDS ── */}
        {late.length > 0 && (
          <Panel title="⚠ Retard Booking" sub={`${late.length} deals Open avec closing dépassé`}>
            <div className="overflow-auto max-h-52 -mx-5 px-5">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                    <th className="pb-2 text-left">Client</th>
                    <th className="pb-2 text-left">Deal</th>
                    <th className="pb-2 text-left">Closing prévu</th>
                    <th className="pb-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {late.map(d => (
                    <tr key={d.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="py-2 pr-3 font-semibold text-slate-900 text-xs">{d.account_name}</td>
                      <td className="py-2 pr-3 text-slate-600 text-xs max-w-[160px] truncate">{d.title}</td>
                      <td className="py-2 pr-3 text-xs font-bold text-red-600">{d.closingYmReal}</td>
                      <td className="py-2 text-right font-bold text-slate-900 tabular-nums text-xs">{fmt(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── LISTE COMPLÈTE ── */}
        <Panel title="Tous les deals — période" sub={`${periodLabel} · ${sortedDeals.length} deals`}>
          <div className="overflow-auto rounded-xl border border-slate-100 -mx-5">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm min-w-[780px]">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <Th col="account" label="Compte" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Deal</th>
                    <Th col="stage" label="Étape" />
                    <Th col="sbu" label="BU" />
                    <Th col="card" label="Carte" />
                    <Th col="amount" label="Montant" />
                    <Th col="prob" label="Prob" />
                    <Th col="closing" label="Closing" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedDeals.map(d => {
                    const best = [...d.lines].sort((a,b)=>b.amount-a.amount)[0]
                    const mainSbu = String(best?.sbu || '—')
                    const mainCard = d.isMulti ? `Multi (${d.lines.length})` : (best?.card || '—')
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap text-xs">{d.account_name}</td>
                        <td className="px-4 py-2.5 max-w-[150px]">
                          <Link href={`/opportunities?edit=${d.id}`} className="block truncate text-xs text-slate-600 hover:text-blue-600 hover:underline" title={d.title}>{d.title}</Link>
                        </td>
                        <td className="px-4 py-2.5"><StagePill stage={d.stage} /></td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SBU_COLORS[mainSbu] || '#94a3b8' }} />{mainSbu}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[110px] truncate">{mainCard}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-900 tabular-nums text-right text-xs whitespace-nowrap">{mad(d.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-500 text-right text-xs">{d.prob}%</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">
                          {d.closingYmReal ? <span className="text-slate-600">{d.closingYmReal}</span> : <span className="font-semibold text-red-400">manquant</span>}
                        </td>
                        <td className="px-4 py-2.5"><StatusDot status={d.status} /></td>
                      </tr>
                    )
                  })}
                  {sortedDeals.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">Aucun deal sur la période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

      </div>
    </div>
  )
}
