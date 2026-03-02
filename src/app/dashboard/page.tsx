'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { RefreshCw } from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  LabelList,
} from 'recharts'

type ViewMode = 'year' | 'quarter' | 'month'
type MetricMode = 'amount' | 'count'
type ScopeMode = 'open_won' | 'open_only'

const SBU_ORDER = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const
type SBU = (typeof SBU_ORDER)[number] | 'MULTI' | 'Other'

const STAGE_ORDER = [
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

const COLORS = {
  bg: '#ffffff',
  grid: '#e5e7eb',
  text: '#0f172a',

  open: '#2563eb',
  won: '#16a34a',
  lost: '#dc2626',

  csg: '#0f172a',
  cirs: '#64748b',

  bar1: '#1d4ed8',
  bar2: '#0f172a',

  lineTotal: '#0f172a',
  lineForecast: '#2563eb',
  lineCommit: '#f59e0b',
  lineWon: '#16a34a',
}

function mad(n: number) {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)
}
function pct(v: number, total: number) {
  if (!total) return 0
  return Math.round((v / total) * 100)
}

function ymFromAny(raw: any): string | null {
  if (!raw) return null
  // if already YYYY-MM
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
    return null
  }
  // Date-like
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      return `${y}-${m}`
    }
  } catch {}
  return null
}

function monthsOfYear(year: number) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function quarterMonths(year: number, q: 'Q1' | 'Q2' | 'Q3' | 'Q4') {
  const start = q === 'Q1' ? 1 : q === 'Q2' ? 4 : q === 'Q3' ? 7 : 10
  return Array.from({ length: 3 }, (_, i) => `${year}-${String(start + i).padStart(2, '0')}`)
}

function normalizeStage(s: any): string {
  const v = String(s || '').trim()
  if (!v) return 'Lead'
  return v
}

function normalizeStatus(row: any): 'Open' | 'Won' | 'Lost' {
  const st = String(row?.status || '').trim()
  if (st === 'Won' || st === 'Lost' || st === 'Open') return st
  const stage = normalizeStage(row?.stage).toLowerCase()
  if (stage === 'won') return 'Won'
  if (stage.includes('lost')) return 'Lost'
  return 'Open'
}

function normalizeSBU(raw: any): SBU {
  const v = String(raw || '').trim()
  if (!v) return 'Other'
  const u = v.toUpperCase()

  if (u === 'MULTI') return 'MULTI'
  if (u.includes('CSG')) return 'CSG'
  if (u.includes('NETWORK')) return 'Network'
  if (u.includes('STORAGE')) return 'Storage'
  if (u.includes('CYBER')) return 'Cyber'
  if (u.includes('SERVICE')) return 'Service'
  if (u.includes('HCI')) return 'HCI'
  if (u.includes('INFRA')) return 'HCI'

  // fallback (garde lisible)
  return 'Other'
}

function buGroup(sbu: SBU): 'CSG' | 'CIRS' {
  return sbu === 'CSG' ? 'CSG' : 'CIRS'
}

type NormLine = {
  sbu: SBU
  group: 'CSG' | 'CIRS'
  card: string
  amount: number
}

type NormDeal = {
  id: string
  account_id: string | null
  account_name: string
  title: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  prob: number
  amount: number
  closingYmUsed: string // utilisé pour filtres période (closing si dispo sinon created_at)
  closingYmReal: string | null // closing réel (peut être null)
  missingClosing: boolean
  next_step_missing: boolean
  inside_blocked: boolean
  isMulti: boolean
  lines: NormLine[]
  raw: any
}

function CardShell(props: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${props.className || ''}`}>
      <div className="mb-2">
        <div className="text-sm font-semibold text-slate-900">{props.title}</div>
        {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </div>
  )
}

function TogglePill(props: { items: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border bg-white">
      {props.items.map(it => {
        const active = props.value === it.id
        return (
          <button
            key={it.id}
            className={`h-9 px-3 text-sm ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            onClick={() => props.onChange(it.id)}
            type="button"
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function SmallStat(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs text-slate-500">{props.label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-slate-500">{props.hint}</div> : null}
    </div>
  )
}

function NoData(props: { text?: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{props.text || 'Rien à afficher.'}</div>
}

export default function DashboardV3Page() {
  const now = new Date()
  const thisYear = now.getFullYear()

  const [year, setYear] = useState<number>(thisYear)
  const [viewMode, setViewMode] = useState<ViewMode>('quarter')
  const [quarter, setQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1')
  const [month, setMonth] = useState<string>(`${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [metricMode, setMetricMode] = useState<MetricMode>('amount')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('open_won')

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<any[]>([])

  const periodLabel = useMemo(() => {
    if (viewMode === 'year') return `Année ${year}`
    if (viewMode === 'quarter') return `Trimestre ${quarter} ${year}`
    return `Mois ${month}`
  }, [viewMode, year, quarter, month])

  const periodMonths = useMemo(() => {
    if (viewMode === 'year') return monthsOfYear(year)
    if (viewMode === 'quarter') return quarterMonths(year, quarter)
    return [month]
  }, [viewMode, year, quarter, month])

  const periodStartYm = periodMonths[0]
  const periodEndYm = periodMonths[periodMonths.length - 1]

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      // IMPORTANT: select('*') pour éviter les erreurs "column does not exist"
      const q = await supabase
        .from('opportunities')
        .select('*, accounts(name)')
        .order('created_at', { ascending: false })
        .limit(5000)

      if (q.error) throw new Error(q.error.message)
      setRows(q.data || [])
    } catch (e: any) {
      setErr(e?.message || 'fetch failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deals: NormDeal[] = useMemo(() => {
    const list: NormDeal[] = []
    for (const r of rows || []) {
      const id = String(r?.id || '')
      if (!id) continue

      const accountName = String(r?.accounts?.name || r?.account_name || '—')
      const title = String(r?.title || r?.name || '—')
      const stage = normalizeStage(r?.stage)
      const status = normalizeStatus(r)
      const prob = Math.max(0, Math.min(100, Number(r?.prob ?? 0) || 0))
      const amount = Number(r?.amount ?? 0) || 0

      const closingYmReal =
        ymFromAny(r?.booking_month) ??
        ymFromAny(r?.closing_month) ??
        ymFromAny(r?.closing_date) ??
        ymFromAny(r?.closing) ??
        null

      const createdYm = ymFromAny(r?.created_at) ?? null
      const closingYmUsed = closingYmReal || createdYm || `${year}-01`

      const missingClosing = !closingYmReal
      const nextStepMissing = !String(r?.next_step || '').trim()
      // “inside bloqués” : supporte plusieurs schémas (si colonne existe)
      const insideBlocked =
        String(r?.inside_status || '').toLowerCase().includes('block') ||
        Boolean(r?.inside_blocked) ||
        Boolean(r?.inside_locked)

      const isMulti =
        String(r?.deal_type || '').toLowerCase().trim() === 'multi' ||
        Boolean(r?.multi_bu) ||
        (Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0) ||
        String(r?.bu || '').toUpperCase() === 'MULTI'

      const lines: NormLine[] = []

      if (isMulti && Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0) {
        for (const x of r.bu_lines) {
          const sbu = normalizeSBU(x?.bu)
          const card = String(x?.card || x?.vendor || x?.name || r?.vendor || '—').trim() || '—'
          const a = Number(x?.amount ?? 0) || 0
          lines.push({ sbu, group: buGroup(sbu), card, amount: a })
        }
      } else {
        const sbu = normalizeSBU(r?.bu)
        const card = String(r?.vendor || r?.card || '—').trim() || '—'
        lines.push({ sbu, group: buGroup(sbu), card, amount })
      }

      // si multi mais lignes vides => fallback safe
      if (isMulti && lines.length === 0) {
        const sbu = normalizeSBU(r?.bu || 'MULTI')
        const card = String(r?.vendor || 'MULTI')
        lines.push({ sbu, group: buGroup(sbu), card, amount })
      }

      list.push({
        id,
        account_id: r?.account_id ? String(r.account_id) : null,
        account_name: accountName,
        title,
        stage,
        status,
        prob,
        amount,
        closingYmUsed,
        closingYmReal,
        missingClosing,
        next_step_missing: nextStepMissing,
        inside_blocked: insideBlocked,
        isMulti,
        lines,
        raw: r,
      })
    }
    return list
  }, [rows, year])

  const dealsInPeriod = useMemo(() => {
    const set = new Set(periodMonths)
    return deals.filter(d => set.has(d.closingYmUsed))
  }, [deals, periodMonths])

  const scopeDeals = useMemo(() => {
    if (scopeMode === 'open_only') return dealsInPeriod.filter(d => d.status === 'Open')
    return dealsInPeriod.filter(d => d.status === 'Open' || d.status === 'Won')
  }, [dealsInPeriod, scopeMode])

  const openDeals = useMemo(() => dealsInPeriod.filter(d => d.status === 'Open'), [dealsInPeriod])
  const wonDeals = useMemo(() => dealsInPeriod.filter(d => d.status === 'Won'), [dealsInPeriod])
  const lostDeals = useMemo(() => dealsInPeriod.filter(d => d.status === 'Lost'), [dealsInPeriod])

  const metricValue = (vAmount: number, vCount: number) => (metricMode === 'amount' ? vAmount : vCount)

  const kpis = useMemo(() => {
    // pipeline = Open (montant ou count)
    const pipelineAmount = openDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const pipelineCount = openDeals.length

    // forecast = Σ(Open montant * prob)
    const forecastAmount = openDeals.reduce((s, d) => s + (d.amount || 0) * ((d.prob || 0) / 100), 0)
    const forecastCount = openDeals.filter(d => (d.prob || 0) > 0).length

    // commit = Open dont stage = Commit (ou proche)
    const isCommit = (stage: string) => String(stage).toLowerCase().trim() === 'commit'
    const commitDeals = openDeals.filter(d => isCommit(d.stage))
    const commitAmount = commitDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const commitCount = commitDeals.length

    // won
    const wonAmount = wonDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const wonCount = wonDeals.length

    const conf = pipelineAmount > 0 ? (forecastAmount / pipelineAmount) * 100 : 0

    return {
      pipelineAmount,
      pipelineCount,
      forecastAmount,
      forecastCount,
      commitAmount,
      commitCount,
      wonAmount,
      wonCount,
      confidencePct: conf,
    }
  }, [openDeals, wonDeals])

  // Data quality (Open deals only, sur la période)
  const quality = useMemo(() => {
    const base = openDeals
    const missingAmount = base.filter(d => (d.amount || 0) <= 0).length
    const missingClosing = base.filter(d => d.missingClosing).length
    const missingNextStep = base.filter(d => d.next_step_missing).length
    const insideBlocked = base.filter(d => d.inside_blocked).length
    return { missingAmount, missingClosing, missingNextStep, insideBlocked }
  }, [openDeals])

  // Open/Won/Lost donut
  const statusDonut = useMemo(() => {
    const openA = openDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const wonA = wonDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const lostA = lostDeals.reduce((s, d) => s + (d.amount || 0), 0)

    const openC = openDeals.length
    const wonC = wonDeals.length
    const lostC = lostDeals.length

    const total = metricValue(openA + wonA + lostA, openC + wonC + lostC)

    const data = [
      { name: 'Lost', value: metricValue(lostA, lostC), color: COLORS.lost },
      { name: 'Open', value: metricValue(openA, openC), color: COLORS.open },
      { name: 'Won', value: metricValue(wonA, wonC), color: COLORS.won },
    ]

    return { data, total }
  }, [openDeals, wonDeals, lostDeals, metricMode])

  // Mix BU (CSG vs CIRS) - Open only
  const mixBu = useMemo(() => {
    const base = openDeals
    let csgAmount = 0
    let cirsAmount = 0
    let csgCount = 0
    let cirsCount = 0

    for (const d of base) {
      if (metricMode === 'count') {
        // une opportunité “compte” pour le groupe majoritaire (par montant de lignes)
        const sumCsg = d.lines.filter(x => x.group === 'CSG').reduce((s, x) => s + (x.amount || 0), 0)
        const sumCirs = d.lines.filter(x => x.group === 'CIRS').reduce((s, x) => s + (x.amount || 0), 0)
        if (sumCsg >= sumCirs) csgCount += 1
        else cirsCount += 1
      } else {
        for (const ln of d.lines) {
          if (ln.group === 'CSG') csgAmount += ln.amount || 0
          else cirsAmount += ln.amount || 0
        }
      }
    }

    const data = [
      { name: 'CIRS', value: metricValue(cirsAmount, cirsCount), color: COLORS.cirs },
      { name: 'CSG', value: metricValue(csgAmount, csgCount), color: COLORS.csg },
    ]
    const total = data.reduce((s, x) => s + x.value, 0)
    return { data, total }
  }, [openDeals, metricMode])

  // Pipeline par SBU (Open) : Total + Forecast
  const pipelineBySbu = useMemo(() => {
    const map = new Map<string, { sbu: string; total: number; forecast: number; count: number }>()
    for (const d of openDeals) {
      for (const ln of d.lines) {
        const sbu = ln.sbu === 'Other' ? 'Other' : String(ln.sbu)
        const cur = map.get(sbu) || { sbu, total: 0, forecast: 0, count: 0 }
        if (metricMode === 'count') {
          cur.count += 1
        } else {
          cur.total += ln.amount || 0
          cur.forecast += (ln.amount || 0) * ((d.prob || 0) / 100)
        }
        map.set(sbu, cur)
      }
    }

    const ordered = [...map.values()].map(x => ({
      sbu: x.sbu,
      total: metricMode === 'amount' ? x.total : x.count,
      forecast: metricMode === 'amount' ? x.forecast : x.count, // en mode count, forecast = count (simple)
    }))

    // order stable
    const orderIdx = (s: string) => {
      const i = SBU_ORDER.findIndex(v => v.toUpperCase() === s.toUpperCase())
      if (i >= 0) return i
      if (s.toUpperCase() === 'MULTI') return 99
      return 100
    }
    ordered.sort((a, b) => orderIdx(a.sbu) - orderIdx(b.sbu))
    return ordered
  }, [openDeals, metricMode])

  // Pipeline par stage (Open)
  const pipelineByStage = useMemo(() => {
    const map = new Map<string, { stage: string; total: number; count: number }>()
    for (const d of openDeals) {
      const st = d.stage || '—'
      const cur = map.get(st) || { stage: st, total: 0, count: 0 }
      if (metricMode === 'count') cur.count += 1
      else cur.total += d.amount || 0
      map.set(st, cur)
    }
    const arr = [...map.values()].map(x => ({
      stage: x.stage,
      total: metricMode === 'amount' ? x.total : x.count,
    }))

    const idx = (s: string) => {
      const i = STAGE_ORDER.findIndex(v => v.toLowerCase() === s.toLowerCase())
      return i >= 0 ? i : 999
    }
    arr.sort((a, b) => idx(a.stage) - idx(b.stage))
    return arr
  }, [openDeals, metricMode])

  // Tendance sur l’année (mois) : Total(Open) / Forecast(Open) / Commit(Open) / Won
  const trend = useMemo(() => {
    const months = monthsOfYear(year)
    const baseYear = deals.filter(d => d.closingYmUsed.startsWith(`${year}-`))

    const isCommit = (stage: string) => String(stage).toLowerCase().trim() === 'commit'

    const rows = months.map(m => {
      const inM = baseYear.filter(d => d.closingYmUsed === m)
      const open = inM.filter(d => d.status === 'Open')
      const won = inM.filter(d => d.status === 'Won')

      const openTotal = metricMode === 'amount' ? open.reduce((s, d) => s + (d.amount || 0), 0) : open.length
      const forecast = metricMode === 'amount'
        ? open.reduce((s, d) => s + (d.amount || 0) * ((d.prob || 0) / 100), 0)
        : open.filter(d => (d.prob || 0) > 0).length
      const commit = metricMode === 'amount'
        ? open.filter(d => isCommit(d.stage)).reduce((s, d) => s + (d.amount || 0), 0)
        : open.filter(d => isCommit(d.stage)).length
      const wonTotal = metricMode === 'amount' ? won.reduce((s, d) => s + (d.amount || 0), 0) : won.length

      return { month: m, total: openTotal, forecast, commit, won: wonTotal }
    })

    return rows
  }, [deals, year, metricMode])

  // Top clients (Open+Won par défaut) + split CSG vs CIRS
  const topClients = useMemo(() => {
    const map = new Map<string, { client: string; csg: number; cirs: number; total: number; count: number }>()
    for (const d of scopeDeals) {
      const key = d.account_name || '—'
      const cur = map.get(key) || { client: key, csg: 0, cirs: 0, total: 0, count: 0 }

      if (metricMode === 'count') {
        cur.count += 1
        cur.total += 1
      } else {
        for (const ln of d.lines) {
          if (ln.group === 'CSG') cur.csg += ln.amount || 0
          else cur.cirs += ln.amount || 0
        }
        cur.total = cur.csg + cur.cirs
      }

      map.set(key, cur)
    }

    const arr = [...map.values()]
      .map(x => ({
        client: x.client,
        csg: metricMode === 'amount' ? x.csg : 0,
        cirs: metricMode === 'amount' ? x.cirs : 0,
        total: metricMode === 'amount' ? x.total : x.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return arr
  }, [scopeDeals, metricMode])

  // Top cards (Open+Won)
  const topCards = useMemo(() => {
    const map = new Map<string, { card: string; total: number; count: number }>()
    for (const d of scopeDeals) {
      for (const ln of d.lines) {
        const card = (ln.card || '—').trim() || '—'
        const cur = map.get(card) || { card, total: 0, count: 0 }
        if (metricMode === 'count') cur.count += 1
        else cur.total += ln.amount || 0
        map.set(card, cur)
      }
    }

    const arr = [...map.values()]
      .map(x => ({ card: x.card, total: metricMode === 'amount' ? x.total : x.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const grand = arr.reduce((s, x) => s + x.total, 0)
    const arr2 = arr.map(x => ({ ...x, pct: pct(x.total, grand) }))

    return { arr: arr2, grand }
  }, [scopeDeals, metricMode])

  // Retard booking (M-1) : Open dont closing < début de la période sélectionnée
  const lateBooking = useMemo(() => {
    const start = periodStartYm
    const late = openDeals
      .filter(d => {
        // on ne considère que ceux qui ont un closing réel
        if (!d.closingYmReal) return false
        return d.closingYmReal < start
      })
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 12)
    return late
  }, [openDeals, periodStartYm])

  // Top open / top won tables
  const topOpenDeals = useMemo(() => {
    return [...openDeals].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10)
  }, [openDeals])

  const topWonDeals = useMemo(() => {
    return [...wonDeals].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10)
  }, [wonDeals])

  // Liste des deals (période) + tri
  const [sortKey, setSortKey] = useState<'account' | 'sbu' | 'card' | 'amount' | 'prob' | 'closing' | 'stage'>('amount')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const sortedDeals = useMemo(() => {
    const getMainSbu = (d: NormDeal) => {
      // si multi, prend la ligne max
      const best = [...d.lines].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0]
      return best?.sbu || '—'
    }
    const getMainCard = (d: NormDeal) => {
      const best = [...d.lines].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0]
      return best?.card || '—'
    }

    const arr = [...dealsInPeriod]
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      let va: any = ''
      let vb: any = ''

      switch (sortKey) {
        case 'account':
          va = a.account_name; vb = b.account_name; break
        case 'stage':
          va = a.stage; vb = b.stage; break
        case 'sbu':
          va = String(getMainSbu(a)); vb = String(getMainSbu(b)); break
        case 'card':
          va = String(getMainCard(a)); vb = String(getMainCard(b)); break
        case 'prob':
          va = a.prob || 0; vb = b.prob || 0; break
        case 'closing':
          va = a.closingYmReal || a.closingYmUsed; vb = b.closingYmReal || b.closingYmUsed; break
        case 'amount':
        default:
          va = a.amount || 0; vb = b.amount || 0; break
      }

      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb))
    })
    return arr
  }, [dealsInPeriod, sortKey, sortDir])

  const headerSort = (key: typeof sortKey, label: string) => {
    const active = sortKey === key
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 text-left ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
        onClick={() => {
          if (!active) {
            setSortKey(key)
            setSortDir('desc')
          } else {
            setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
          }
        }}
      >
        {label}
        <span className="text-xs">{active ? (sortDir === 'desc' ? '↓' : '↑') : ''}</span>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-screen-2xl px-3 py-6 sm:px-4">
        {/* HEADER */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-slate-900">Dashboard V3 (Direction)</div>
            <div className="text-sm text-slate-500">{periodLabel}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-xl border bg-white px-3 text-sm"
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value)
                setYear(y)
                setMonth(`${y}-01`)
              }}
            >
              {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <TogglePill
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              items={[
                { id: 'year', label: 'Année' },
                { id: 'quarter', label: 'Trimestre' },
                { id: 'month', label: 'Mois' },
              ]}
            />

            {viewMode === 'quarter' ? (
              <select className="h-9 rounded-xl border bg-white px-3 text-sm" value={quarter} onChange={(e) => setQuarter(e.target.value as any)}>
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            ) : null}

            {viewMode === 'month' ? (
              <select className="h-9 rounded-xl border bg-white px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
                {monthsOfYear(year).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : null}

            <TogglePill
              value={metricMode}
              onChange={(v) => setMetricMode(v as MetricMode)}
              items={[
                { id: 'amount', label: 'Montant' },
                { id: 'count', label: 'Nombre' },
              ]}
            />

            <TogglePill
              value={scopeMode}
              onChange={(v) => setScopeMode(v as ScopeMode)}
              items={[
                { id: 'open_won', label: 'Open+Won' },
                { id: 'open_only', label: 'Open only' },
              ]}
            />

            <button
              className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100"
              onClick={load}
              disabled={loading}
              type="button"
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>

            <Link className="inline-flex h-9 items-center rounded-xl border bg-white px-3 text-sm hover:bg-slate-100" href="/deals">
              Deals
            </Link>
            <Link className="inline-flex h-9 items-center rounded-xl border bg-white px-3 text-sm hover:bg-slate-100" href="/accounts">
              Comptes
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{String(err)}</div>
        ) : null}

        {/* KPI ROW */}
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SmallStat
            label="Pipeline (Open)"
            value={metricMode === 'amount' ? mad(kpis.pipelineAmount) : String(kpis.pipelineCount)}
            hint={`Deals Open: ${kpis.pipelineCount} · Total deals: ${dealsInPeriod.length}`}
          />
          <SmallStat
            label="Forecast (probabilisé)"
            value={metricMode === 'amount' ? mad(kpis.forecastAmount) : String(kpis.forecastCount)}
            hint={`Confidence: ${kpis.confidencePct.toFixed(1)}% · Deals probabilisés: ${kpis.forecastCount}`}
          />
          <SmallStat
            label="Commit (période)"
            value={metricMode === 'amount' ? mad(kpis.commitAmount) : String(kpis.commitCount)}
            hint={`Deals Commit: ${kpis.commitCount}`}
          />
          <SmallStat
            label="Won (période)"
            value={metricMode === 'amount' ? mad(kpis.wonAmount) : String(kpis.wonCount)}
            hint={`Won deals: ${kpis.wonCount}`}
          />
        </div>

        {/* ROW 1 */}
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <CardShell title="Mix BU (CSG vs CIRS)" subtitle={`Périmètre: Open · ${metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'}`}>
            {mixBu.total <= 0 ? (
              <NoData text={`Rien à afficher (valeurs = 0). Passe en “Nombre” ou mets des montants.`} />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mixBu.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={2}
                      label={({ name, value }) => `${name} ${pct(Number(value || 0), mixBu.total)}%`}
                    >
                      {mixBu.data.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>

          <CardShell
            title="Qualité des données (période)"
            subtitle="Objectif: repérer ce qui casse les graphes (montants/closing/next step)."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs text-slate-500">Montant manquant</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{quality.missingAmount}</div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs text-slate-500">Closing mois manquant</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{quality.missingClosing}</div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs text-slate-500">Next step manquant</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{quality.missingNextStep}</div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs text-slate-500">Inside bloqués</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{quality.insideBlocked}</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Open = deals encore en cours. Forecast = Σ(Montant × Probabilité). Les deals sans “Closing” utilisent la date de création
              pour être visibles dans la période, mais restent comptés en “Closing manquant”.
            </div>
          </CardShell>

          <CardShell title="Open / Won / Lost" subtitle={`${metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'} · Période`}>
            {statusDonut.total <= 0 ? (
              <NoData text="Rien à afficher." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDonut.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={2}
                      label={({ name, value }) => `${name} ${pct(Number(value || 0), statusDonut.total)}%`}
                    >
                      {statusDonut.data.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>
        </div>

        {/* ROW 2 */}
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CardShell title="Pipeline par SBU (Total vs Forecast probabilisé)" subtitle={`Open · ${metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'}`}>
            {pipelineBySbu.length === 0 ? (
              <NoData />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineBySbu} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="sbu" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={metricMode === 'amount' ? 80 : 40} />
                    <Tooltip
                      formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))}
                    />
                    <Legend />
                    <Bar name="Forecast (probabilité)" dataKey="forecast" fill={COLORS.bar1} radius={[8, 8, 0, 0]}>
                      <LabelList
                        dataKey="forecast"
                        position="top"
                        formatter={(v: any) => ''}
                      />
                    </Bar>
                    <Bar name="Total (Open)" dataKey="total" fill={COLORS.bar2} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>

          <CardShell title="Pipeline par stage (Open)" subtitle={`Open · ${metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'}`}>
            {pipelineByStage.length === 0 ? (
              <NoData />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineByStage} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 40 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={120} />
                    <Tooltip formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))} />
                    <Legend />
                    <Bar name="Total" dataKey="total" fill={COLORS.bar2} radius={[0, 8, 8, 0]}>
                      <LabelList
                        dataKey="total"
                        position="right"
                        formatter={(v: any) => (metricMode === 'amount' ? `${pct(Number(v || 0), pipelineByStage.reduce((s, x) => s + x.total, 0))}%` : '')}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>
        </div>

        {/* ROW 3 */}
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CardShell title="Tendance (Total / Forecast / Commit / Won) — basé sur l’année" subtitle={`Année ${year} · ${metricMode === 'amount' ? 'MAD' : 'Nombre'}`}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={metricMode === 'amount' ? 80 : 40} />
                  <Tooltip formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="commit" name="Commit" stroke={COLORS.lineCommit} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="forecast" name="Forecast" stroke={COLORS.lineForecast} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="total" name="Total (Open)" stroke={COLORS.lineTotal} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="won" name="Won" stroke={COLORS.lineWon} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardShell>

          <CardShell
            title="Top Clients (CSG vs CIRS)"
            subtitle={`Périmètre: ${scopeMode === 'open_only' ? 'Open' : 'Open+Won'} · ${metricMode === 'amount' ? 'MAD' : 'Nombre'} · Top 5`}
          >
            {topClients.length === 0 ? (
              <NoData />
            ) : metricMode === 'count' ? (
              <div className="text-sm text-slate-600">
                En mode “Nombre”, on affiche le top 5 en tableau (le split CSG/CIRS est pertinent en Montant).
                <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Nombre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClients.map((x) => (
                        <tr key={x.client} className="border-t">
                          <td className="px-3 py-2 font-medium text-slate-900">{x.client}</td>
                          <td className="px-3 py-2">{x.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClients} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="client" tick={{ fontSize: 12 }} interval={0} height={50} />
                    <YAxis tick={{ fontSize: 12 }} width={90} />
                    <Tooltip formatter={(v: any) => mad(Number(v || 0))} />
                    <Legend />
                    <Bar name="CIRS" dataKey="cirs" stackId="a" fill={COLORS.cirs} radius={[8, 8, 0, 0]} />
                    <Bar name="CSG" dataKey="csg" stackId="a" fill={COLORS.csg} radius={[8, 8, 0, 0]}>
                      <LabelList
                        dataKey="csg"
                        position="top"
                        formatter={(_: any, _payload?: any, idx?: number) => {
                          const i = typeof idx === 'number' ? idx : 0
                          const total = topClients[i]?.total || 0
                          const grandTotal = topClients.reduce((s, r) => s + r.total, 0)
                          return total ? `${pct(total, grandTotal)}%` : ''
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 text-xs text-slate-500">
              Si tu veux voir les “Won” (ACWA, etc.), garde “Open+Won”. Si tu veux focus pipeline, mets “Open only”.
            </div>
          </CardShell>
        </div>

        {/* ROW 4 */}
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CardShell title="Top Constructeurs / Cartes" subtitle={`Périmètre: ${scopeMode === 'open_only' ? 'Open' : 'Open+Won'} · ${metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'}`}>
            {topCards.arr.length === 0 ? (
              <NoData />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCards.arr} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 40 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} width={metricMode === 'amount' ? 90 : 50} />
                    <YAxis type="category" dataKey="card" tick={{ fontSize: 12 }} width={120} />
                    <Tooltip formatter={(v: any) => (metricMode === 'amount' ? mad(Number(v || 0)) : String(v))} />
                    <Legend />
                    <Bar name={metricMode === 'amount' ? 'Montant (MAD)' : 'Nombre'} dataKey="total" fill={COLORS.bar1} radius={[0, 8, 8, 0]}>
                      <LabelList dataKey="pct" position="right" formatter={(v: any) => `${Number(v || 0)}%`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>

          <CardShell title="Retard Booking (M-1) — liste" subtitle={`Open · closing < début période (${periodStartYm})`}>
            {lateBooking.length === 0 ? (
              <NoData text="Rien à afficher pour l’instant (pas de deals Open en retard sur closing)." />
            ) : (
              <div className="overflow-hidden rounded-xl border bg-white">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Deal</th>
                        <th className="px-3 py-2">Stage</th>
                        <th className="px-3 py-2">Closing</th>
                        <th className="px-3 py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lateBooking.map(d => (
                        <tr key={d.id} className="border-t">
                          <td className="px-3 py-2 font-medium text-slate-900">{d.account_name}</td>
                          <td className="px-3 py-2">{d.title}</td>
                          <td className="px-3 py-2">{d.stage}</td>
                          <td className="px-3 py-2">{d.closingYmReal}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{mad(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardShell>
        </div>

        {/* ROW 5: TOP TABLES */}
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CardShell title="Top Open Deals (action)" subtitle="Open · trié par montant">
            {topOpenDeals.length === 0 ? (
              <NoData />
            ) : (
              <div className="overflow-hidden rounded-xl border bg-white">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Deal</th>
                        <th className="px-3 py-2">Stage</th>
                        <th className="px-3 py-2">Montant</th>
                        <th className="px-3 py-2">Prob</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOpenDeals.map(d => (
                        <tr key={d.id} className="border-t">
                          <td className="px-3 py-2 font-medium text-slate-900">{d.account_name}</td>
                          <td className="px-3 py-2">{d.title}</td>
                          <td className="px-3 py-2">{d.stage}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{mad(d.amount)}</td>
                          <td className="px-3 py-2">{d.prob}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardShell>

          <CardShell title="Top Won Deals (réalisé)" subtitle="Won · trié par montant">
            {topWonDeals.length === 0 ? (
              <NoData />
            ) : (
              <div className="overflow-hidden rounded-xl border bg-white">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Deal</th>
                        <th className="px-3 py-2">Stage</th>
                        <th className="px-3 py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topWonDeals.map(d => (
                        <tr key={d.id} className="border-t">
                          <td className="px-3 py-2 font-medium text-slate-900">{d.account_name}</td>
                          <td className="px-3 py-2">{d.title}</td>
                          <td className="px-3 py-2">{d.stage}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{mad(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardShell>
        </div>

        {/* ROW 6: LISTE DES DEALS (période) + TRI */}
        <div className="mt-4">
          <CardShell title="Liste des deals (période)" subtitle={`Tri: clique sur (Compte, Stage, BU, Carte, Montant, Prob, Closing). Période: ${periodLabel}`}>
            <div className="overflow-hidden rounded-xl border bg-white">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{headerSort('account', 'Compte')}</th>
                      <th className="px-3 py-2">Deal</th>
                      <th className="px-3 py-2">{headerSort('stage', 'Stage')}</th>
                      <th className="px-3 py-2">{headerSort('sbu', 'BU')}</th>
                      <th className="px-3 py-2">{headerSort('card', 'Carte')}</th>
                      <th className="px-3 py-2">{headerSort('amount', 'Montant')}</th>
                      <th className="px-3 py-2">{headerSort('prob', 'Prob')}</th>
                      <th className="px-3 py-2">{headerSort('closing', 'Closing')}</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDeals.map(d => {
                      const bestLine = [...d.lines].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0]
                      const mainSbu = bestLine?.sbu || '—'
                      const mainCard = d.isMulti ? `Multi (${d.lines.length})` : (bestLine?.card || '—')
                      const closing = d.closingYmReal || '—'
                      return (
                        <tr key={d.id} className="border-t">
                          <td className="px-3 py-2 font-medium text-slate-900">{d.account_name}</td>
                          <td className="px-3 py-2">{d.title}</td>
                          <td className="px-3 py-2">{d.stage}</td>
                          <td className="px-3 py-2">{String(mainSbu)}</td>
                          <td className="px-3 py-2">{mainCard}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{mad(d.amount)}</td>
                          <td className="px-3 py-2">{d.prob}%</td>
                          <td className="px-3 py-2">{closing}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                d.status === 'Won'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : d.status === 'Lost'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {sortedDeals.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                          Aucun deal sur la période.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Conseil: évite les montants = 0 et mets un closing (YYYY-MM) pour que tous les graphes soient cohérents.
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  )
}