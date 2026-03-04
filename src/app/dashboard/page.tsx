'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  RefreshCw, TrendingUp, Target, Award, Zap, AlertTriangle,
  ChevronDown, BarChart2, Activity, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Clock, Flame, Info, Trophy,
  Building2, MapPin, Calendar, Filter, SlidersHorizontal, X,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  LabelList, FunnelChart, Funnel, ComposedChart, Area,
} from 'recharts'
import CRMChatbot from './CRMChatbot'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
type ViewMode  = 'year' | 'quarter' | 'month' | 'range'
type ScopeMode = 'open_won' | 'open_only'

const SBU_ORDER = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const
type SBU = (typeof SBU_ORDER)[number] | 'MULTI' | 'Other'
const STAGE_ORDER = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const

const ANNUAL_TARGET = 30_000_000   // 30M MAD objectif Won annuel

const SBU_COLORS: Record<string, string> = {
  HCI: '#6366f1', Network: '#0ea5e9', Storage: '#14b8a6',
  Cyber: '#ef4444', Service: '#8b5cf6', CSG: '#f59e0b',
  MULTI: '#94a3b8', Other: '#cbd5e1',
}
const C = {
  pipeline: '#2563eb', forecast: '#7c3aed', commit: '#d97706',
  won: '#16a34a', lost: '#dc2626', csg: '#0f172a', cirs: '#64748b',
  grid: '#f1f5f9',
}
const STAGE_CFG: Record<string, { bg: string; text: string; dot: string }> = {
  Lead:              { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'   },
  Discovery:         { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400'    },
  Qualified:         { bg: 'bg-cyan-50',    text: 'text-cyan-700',   dot: 'bg-cyan-400'    },
  Solutioning:       { bg: 'bg-violet-50',  text: 'text-violet-700', dot: 'bg-violet-400'  },
  'Proposal Sent':   { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400'   },
  Negotiation:       { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-400'  },
  Commit:            { bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500' },
  Won:               { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500'   },
  'Lost / No decision': { bg:'bg-red-50',   text:'text-red-600',     dot:'bg-red-400'      },
}

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style:'currency', currency:'MAD', maximumFractionDigits:0 }).format(n||0)

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n/1000)}K`
  return String(Math.round(n))
}
const pct = (v: number, t: number) => (!t ? 0 : Math.round((v/t)*100))

const ymFrom = (raw: any): string|null => {
  if (!raw) return null
  if (typeof raw === 'string') { const s = raw.trim(); if (s.length>=7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0,7); return null }
  try { const d = new Date(raw); if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` } catch {}
  return null
}
const monthsOfYear  = (y: number) => Array.from({length:12},(_,i) => `${y}-${String(i+1).padStart(2,'0')}`)
const quarterMonths = (y: number, q: 'Q1'|'Q2'|'Q3'|'Q4') => {
  const s = q==='Q1'?1:q==='Q2'?4:q==='Q3'?7:10
  return Array.from({length:3},(_,i) => `${y}-${String(s+i).padStart(2,'0')}`)
}

const rangeMonths = (from: string, to: string): string[] => {
  if (!from||!to) return []
  const start=from.slice(0,7), end=to.slice(0,7)
  if (start>end) return []
  const res: string[] = []; let cur=start
  while (cur<=end) {
    res.push(cur)
    const [y,m]=cur.split('-').map(Number)
    cur=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`
    if (res.length>120) break
  }
  return res
}
const normStage  = (s: any) => String(s||'').trim() || 'Lead'
const normStatus = (r: any): 'Open'|'Won'|'Lost' => {
  const st = String(r?.status||'').trim()
  if (st==='Won'||st==='Lost'||st==='Open') return st
  const sg = normStage(r?.stage).toLowerCase()
  if (sg==='won') return 'Won'; if (sg.includes('lost')) return 'Lost'; return 'Open'
}
const normSBU = (raw: any): SBU => {
  const v = String(raw||'').trim(); if (!v) return 'Other'; const u = v.toUpperCase()
  if (u==='MULTI') return 'MULTI'; if (u.includes('CSG')) return 'CSG'
  if (u.includes('NETWORK')) return 'Network'; if (u.includes('STORAGE')) return 'Storage'
  if (u.includes('CYBER')) return 'Cyber'; if (u.includes('SERVICE')) return 'Service'
  if (u.includes('HCI')||u.includes('INFRA')) return 'HCI'; return 'Other'
}
const buGroup = (s: SBU): 'CSG'|'CIRS' => (s==='CSG'?'CSG':'CIRS')

const daysBetween = (a: string, b: string) => {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(0, Math.floor(ms/86400000))
}

type NormLine = { sbu: SBU; group: 'CSG'|'CIRS'; card: string; amount: number }
type Deal = {
  id: string; account_id: string|null; account_name: string; title: string
  stage: string; status: 'Open'|'Won'|'Lost'; prob: number; amount: number
  closingYm: string; closingYmReal: string|null; createdYm: string|null
  missingClosing: boolean; missingNextStep: boolean; isMulti: boolean
  lines: NormLine[]; daysOld: number; raw: any
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, delta, deltaLabel }: {
  label: string; value: string; sub?: string; icon: React.ReactNode
  color: 'blue'|'violet'|'amber'|'green'|'red'|'slate'
  delta?: 'up'|'down'|'neutral'; deltaLabel?: string
}) {
  const cfg = {
    blue:   { grad:'from-blue-600 to-blue-400',     accent:'bg-blue-500',   num:'text-slate-900', bar:'from-blue-500 to-blue-300'  },
    violet: { grad:'from-violet-600 to-violet-400', accent:'bg-violet-500', num:'text-slate-900', bar:'from-violet-500 to-violet-300'},
    amber:  { grad:'from-amber-500 to-orange-400',  accent:'bg-amber-500',  num:'text-slate-900', bar:'from-amber-400 to-orange-300'},
    green:  { grad:'from-emerald-600 to-teal-400',  accent:'bg-emerald-500',num:'text-slate-900', bar:'from-emerald-500 to-teal-300'},
    red:    { grad:'from-red-600 to-rose-400',       accent:'bg-red-500',    num:'text-slate-900', bar:'from-red-500 to-rose-300'  },
    slate:  { grad:'from-slate-800 to-slate-600',   accent:'bg-slate-600',  num:'text-slate-900', bar:'from-slate-500 to-slate-300'},
  }[color]
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
      {/* top accent bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${cfg.bar}`}/>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${cfg.grad} text-white shadow-md`}>
            {icon}
          </div>
          {delta && deltaLabel && (
            <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold
              ${delta==='up'?'bg-emerald-100 text-emerald-700':delta==='down'?'bg-red-100 text-red-600':'bg-slate-100 text-slate-500'}`}>
              {delta==='up'?<ArrowUp className="h-3 w-3"/>:delta==='down'?<ArrowDown className="h-3 w-3"/>:null}
              {deltaLabel}
            </span>
          )}
        </div>
        <div className={`mt-4 text-[1.6rem] font-black tracking-tight leading-none ${cfg.num}`}>{value}</div>
        <div className="mt-1.5 text-sm font-semibold text-slate-600">{label}</div>
        {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  )
}

function Panel({ title, sub, children, className, action }: {
  title: string; sub?: string; children: React.ReactNode; className?: string; action?: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden ${className||''}`}>
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500 shrink-0"/>
          <div>
            <div className="text-sm font-bold text-slate-900">{title}</div>
            {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SegBtn({ items, value, onChange }: {
  items:{id:string;label:string}[]; value:string; onChange:(v:string)=>void
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
      {items.map(it => (
        <button key={it.id} type="button" onClick={()=>onChange(it.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
            ${value===it.id?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

function ChartTip({active,payload,label,isAmt}:any) {
  if (!active||!payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-xl text-xs min-w-[140px]">
      <div className="mb-2 font-bold text-slate-800">{label}</div>
      {payload.map((p:any,i:number)=>(
        <div key={i} className="flex items-center justify-between gap-3 mt-1">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="h-2 w-2 rounded-full shrink-0" style={{background:p.color}}/>
            {p.name}
          </span>
          <span className="font-bold text-slate-900">{isAmt?fmt(p.value)+' MAD':p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({msg}:{msg?:string}) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-300">
      <BarChart2 className="h-8 w-8"/>
      <div className="text-sm font-medium">{msg||'Aucune donnée'}</div>
    </div>
  )
}

function StagePill({stage}:{stage:string}) {
  const c = STAGE_CFG[stage]||STAGE_CFG.Lead
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`}/>{stage}
    </span>
  )
}

function StatusBadge({status}:{status:string}) {
  if (status==='Won') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3"/>Won</span>
  if (status==='Lost') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600"><XCircle className="h-3 w-3"/>Lost</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700"><Clock className="h-3 w-3"/>Open</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const now = new Date()
  const thisYear = now.getFullYear()
  const todayStr = now.toISOString().slice(0,10)

  const [year, setYear]         = useState(thisYear)
  const [view, setView]         = useState<ViewMode>('quarter')
  const [quarter, setQuarter]   = useState<'Q1'|'Q2'|'Q3'|'Q4'>('Q1')
  const [month, setMonth]       = useState(`${thisYear}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [dateFrom, setDateFrom] = useState(`${thisYear}-01-01`)
  const [dateTo, setDateTo]     = useState(todayStr)
  const [scope, setScope]       = useState<ScopeMode>('open_won')
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState<string|null>(null)
  const [rows, setRows]         = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [sortKey, setSortKey]   = useState<'account'|'stage'|'sbu'|'card'|'amount'|'prob'|'closing'>('amount')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc')

  // ── Filtres avancés ──────────────────────────────────────────────────────
  const [showFilters, setShowFilters]   = useState(false)
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [buFilters, setBuFilters]       = useState<Set<string>>(new Set())

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter(prev => { const n=new Set(prev); n.has(v)?n.delete(v):n.add(v); return n })
  const clearFilters = () => { setStageFilters(new Set()); setStatusFilter(new Set()); setBuFilters(new Set()) }
  const activeFilterCount = stageFilters.size + statusFilter.size + buFilters.size

  const periodMonths = useMemo(()=>{
    if (view==='year')    return monthsOfYear(year)
    if (view==='quarter') return quarterMonths(year,quarter)
    if (view==='month')   return [month]
    if (view==='range')   return rangeMonths(dateFrom,dateTo)
    return []
  },[view,year,quarter,month,dateFrom,dateTo])

  const periodLabel = useMemo(()=>{
    if (view==='year')    return `Année ${year}`
    if (view==='quarter') return `${quarter} ${year}`
    if (view==='month')   return `Mois ${month}`
    if (view==='range')   return `${dateFrom} → ${dateTo}`
    return ''
  },[view,year,quarter,month,dateFrom,dateTo])

  // ── Previous period (for comparisons) ──────────────────────────────────
  const prevPeriodMonths = useMemo(()=>{
    if (view==='year') return monthsOfYear(year-1)
    if (view==='quarter') {
      const qs: ('Q1'|'Q2'|'Q3'|'Q4')[] = ['Q1','Q2','Q3','Q4']
      const idx = qs.indexOf(quarter)
      return idx===0 ? quarterMonths(year-1,'Q4') : quarterMonths(year,qs[idx-1])
    }
    const d = new Date(month+'-01'); d.setMonth(d.getMonth()-1)
    return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]
  },[view,year,quarter,month])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const [{ data: opps, error: e1 }, { data: accs, error: e2 }] = await Promise.all([
        supabase.from('opportunities').select('*, accounts(name,sector,segment,region)').order('created_at',{ascending:false}).limit(5000),
        supabase.from('accounts').select('id,name,sector,segment,region'),
      ])
      if (e1) throw e1; if (e2) throw e2
      setRows(opps||[]); setAccounts(accs||[])
    } catch(e:any) { setErr(e?.message||'Erreur') }
    finally { setLoading(false) }
  }
  useEffect(()=>{ load() },[])

  // ── Normalize all deals ─────────────────────────────────────────────────
  const deals: Deal[] = useMemo(()=>{
    return (rows||[]).flatMap(r=>{
      const id = String(r?.id||''); if (!id) return []
      const stage  = normStage(r?.stage)
      const status = normStatus(r)
      const prob   = Math.max(0,Math.min(100,Number(r?.prob??0)||0))
      const amount = Number(r?.amount??0)||0
      const closingYmReal = ymFrom(r?.booking_month)??ymFrom(r?.closing_month)??ymFrom(r?.closing_date)??ymFrom(r?.closing)??null
      const createdYm = ymFrom(r?.created_at)??null
      const closingYm = closingYmReal||createdYm||`${year}-01`
      const daysOld = createdYm ? daysBetween(createdYm+'-01', now.toISOString().slice(0,10)) : 0
      const missingClosing  = !closingYmReal
      const missingNextStep = !String(r?.next_step||'').trim()
      const isMulti = Boolean(r?.multi_bu)||(Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0)||String(r?.bu||'').toUpperCase()==='MULTI'
      const lines: NormLine[] = []
      if (isMulti&&Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0) {
        for (const x of r.bu_lines) {
          const sbu = normSBU(x?.bu)
          lines.push({sbu, group:buGroup(sbu), card:String(x?.card||x?.vendor||r?.vendor||'—').trim()||'—', amount:Number(x?.amount??0)||0})
        }
      } else {
        const sbu = normSBU(r?.bu)
        lines.push({sbu, group:buGroup(sbu), card:String(r?.vendor||r?.card||'—').trim()||'—', amount})
      }
      if (lines.length===0) { const sbu=normSBU(r?.bu||'Other'); lines.push({sbu,group:buGroup(sbu),card:'—',amount}) }
      return [{id, account_id:r?.account_id?String(r.account_id):null, account_name:String(r?.accounts?.name||r?.account_name||'—'), title:String(r?.title||r?.name||'—'), stage,status,prob,amount,closingYm,closingYmReal,createdYm,missingClosing,missingNextStep,isMulti,lines,daysOld,raw:r}]
    })
  },[rows,year])

  // ── Period slices ────────────────────────────────────────────────────────
  const inPeriodRaw = useMemo(()=>{
    if (view==='range' && dateFrom && dateTo) {
      const s=new Set(periodMonths)
      return deals.filter(d=>{
        const cd=d.raw?.closing_date?String(d.raw.closing_date).slice(0,10):null
        if (cd) return cd>=dateFrom&&cd<=dateTo
        return s.has(d.closingYm)
      })
    }
    const s=new Set(periodMonths)
    return deals.filter(d=>s.has(d.closingYm))
  },[deals,periodMonths,view,dateFrom,dateTo])

  const inPeriod = useMemo(()=>{
    let d=inPeriodRaw
    if (stageFilters.size>0)  d=d.filter(x=>stageFilters.has(x.stage))
    if (statusFilter.size>0)  d=d.filter(x=>statusFilter.has(x.status))
    if (buFilters.size>0)     d=d.filter(x=>x.lines.some(ln=>buFilters.has(ln.group)||buFilters.has(String(ln.sbu))))
    return d
  },[inPeriodRaw,stageFilters,statusFilter,buFilters])

  const inPrevPeriod = useMemo(()=>{ const s=new Set(prevPeriodMonths); return deals.filter(d=>s.has(d.closingYm)) },[deals,prevPeriodMonths])

  const openDeals  = useMemo(()=>inPeriod.filter(d=>d.status==='Open'),  [inPeriod])
  const wonDeals   = useMemo(()=>inPeriod.filter(d=>d.status==='Won'),   [inPeriod])
  const lostDeals  = useMemo(()=>inPeriod.filter(d=>d.status==='Lost'),  [inPeriod])
  const scopeDeals = useMemo(()=>scope==='open_only'?openDeals:[...openDeals,...wonDeals],[openDeals,wonDeals,scope])

  const prevOpenDeals = useMemo(()=>inPrevPeriod.filter(d=>d.status==='Open'), [inPrevPeriod])
  const prevWonDeals  = useMemo(()=>inPrevPeriod.filter(d=>d.status==='Won'),  [inPrevPeriod])


  // mv helper removed — montant uniquement

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(()=>{
    const pipeAmt    = openDeals.reduce((s,d)=>s+d.amount,0)
    const foreAmt    = openDeals.reduce((s,d)=>s+d.amount*(d.prob/100),0)
    const commitDeals= openDeals.filter(d=>d.stage.toLowerCase()==='commit')
    const commitAmt  = commitDeals.reduce((s,d)=>s+d.amount,0)
    const wonAmt     = wonDeals.reduce((s,d)=>s+d.amount,0)
    const lostAmt    = lostDeals.reduce((s,d)=>s+d.amount,0)
    const winRate    = wonDeals.length+lostDeals.length>0 ? Math.round(wonDeals.length/(wonDeals.length+lostDeals.length)*100) : 0
    const avgDeal    = openDeals.length>0 ? Math.round(pipeAmt/openDeals.length) : 0

    // Annual Won (all of selected year, not just period)
    const annualWon = deals.filter(d=>d.status==='Won'&&d.closingYm.startsWith(String(year))).reduce((s,d)=>s+d.amount,0)
    const annualCoverage = ANNUAL_TARGET>0 ? Math.min(100,Math.round(annualWon/ANNUAL_TARGET*100)) : 0

    // Prev period for deltas
    const prevPipe = prevOpenDeals.reduce((s,d)=>s+d.amount,0)
    const prevWon  = prevWonDeals.reduce((s,d)=>s+d.amount,0)

    const conf = pipeAmt>0 ? Math.round(foreAmt/pipeAmt*100) : 0

    return {
      pipeAmt, pipeCount:openDeals.length,
      foreAmt, foreCount:openDeals.filter(d=>d.prob>0).length,
      commitAmt, commitCount:commitDeals.length,
      wonAmt, wonCount:wonDeals.length, lostAmt, lostCount:lostDeals.length,
      winRate, avgDeal, conf,
      annualWon, annualCoverage,
      pipeVsPrev: prevPipe>0?Math.round((pipeAmt-prevPipe)/prevPipe*100):null,
      wonVsPrev:  prevWon>0?Math.round((wonAmt-prevWon)/prevWon*100):null,
    }
  },[openDeals,wonDeals,lostDeals,prevOpenDeals,prevWonDeals,deals,year])

  // ── Quality ─────────────────────────────────────────────────────────────
  const quality = useMemo(()=>({
    missingAmt:   openDeals.filter(d=>d.amount<=0).length,
    missingClose: openDeals.filter(d=>d.missingClosing).length,
    missingStep:  openDeals.filter(d=>d.missingNextStep).length,
    stale30:      openDeals.filter(d=>d.daysOld>=30&&d.daysOld<60).length,
    stale60:      openDeals.filter(d=>d.daysOld>=60&&d.daysOld<90).length,
    stale90:      openDeals.filter(d=>d.daysOld>=90).length,
  }),[openDeals])

  // ── Open/Won/Lost donut ─────────────────────────────────────────────────
  const donut = useMemo(()=>{
    const d=[
      {name:'Won',  value:wonDeals.reduce((s,d)=>s+d.amount,0),   color:C.won  },
      {name:'Open', value:openDeals.reduce((s,d)=>s+d.amount,0), color:C.pipeline},
      {name:'Lost', value:lostDeals.reduce((s,d)=>s+d.amount,0), color:C.lost },
    ]
    return {d, total:d.reduce((s,x)=>s+x.value,0)}
  },[openDeals,wonDeals,lostDeals])

  // ── Mix BU CSG vs CIRS ──────────────────────────────────────────────────
  const mixBU = useMemo(()=>{
    let csgA=0,cirsA=0
    for (const d of openDeals)
      for (const ln of d.lines) { if (ln.group==='CSG') csgA+=ln.amount; else cirsA+=ln.amount }
    const data=[
      {name:'CIRS',value:cirsA,color:C.cirs},
      {name:'CSG', value:csgA, color:C.csg },
    ]
    return {data,total:data.reduce((s,x)=>s+x.value,0)}
  },[openDeals])

  // ── Pipeline by SBU ─────────────────────────────────────────────────────
  const bySBU = useMemo(()=>{
    const map = new Map<string,{sbu:string;total:number;forecast:number;won:number;count:number}>()
    // Open: total + forecast
    for (const d of openDeals) for (const ln of d.lines) {
      const sbu=ln.sbu==='Other'?'Other':String(ln.sbu)
      const cur=map.get(sbu)||{sbu,total:0,forecast:0,won:0,count:0}
      cur.total+=ln.amount;cur.forecast+=ln.amount*(d.prob/100)
      map.set(sbu,cur)
    }
    // Won: add won column
    for (const d of wonDeals) for (const ln of d.lines) {
      const sbu=ln.sbu==='Other'?'Other':String(ln.sbu)
      const cur=map.get(sbu)||{sbu,total:0,forecast:0,won:0,count:0}
      cur.won+=ln.amount
      map.set(sbu,cur)
    }
    return [...map.values()].sort((a,b)=>{
      const i=(s:string)=>{const x=SBU_ORDER.findIndex(v=>v.toUpperCase()===s.toUpperCase());return x>=0?x:100}
      return i(a.sbu)-i(b.sbu)
    })
  },[openDeals,wonDeals])

  // ── BU Scorecard ─────────────────────────────────────────────────────────
  const buScorecard = useMemo(()=>{
    type Row={sbu:string;pipeline:number;forecast:number;won:number;lost:number;count:number;winRate:number;avgSize:number}
    const map=new Map<string,{pipeline:number;forecast:number;won:number;lost:number;count:number;wonCount:number;lostCount:number}>()
    const add=(sbu:string,amount:number,prob:number,status:'Open'|'Won'|'Lost')=>{
      const k=sbu==='Other'?'Other':sbu
      const cur=map.get(k)||{pipeline:0,forecast:0,won:0,lost:0,count:0,wonCount:0,lostCount:0}
      if (status==='Open'){cur.pipeline+=amount;cur.forecast+=amount*(prob/100);cur.count++}
      if (status==='Won'){cur.won+=amount;cur.wonCount++}
      if (status==='Lost'){cur.lost+=amount;cur.lostCount++}
      map.set(k,cur)
    }
    for (const d of inPeriod) for (const ln of d.lines) add(String(ln.sbu),ln.amount,d.prob,d.status)
    return [...map.entries()].map(([sbu,x])=>{
      const wr=x.wonCount+x.lostCount>0?Math.round(x.wonCount/(x.wonCount+x.lostCount)*100):0
      const avg=x.count>0?Math.round(x.pipeline/x.count):0
      return {sbu,...x,winRate:wr,avgSize:avg} as Row
    }).sort((a,b)=>b.pipeline-a.pipeline)
  },[inPeriod])

  // ── Conversion Funnel ────────────────────────────────────────────────────
  const funnel = useMemo(()=>{
    const funnelStages=['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit']
    return funnelStages.map(stage=>{
      const deals_at_stage = openDeals.filter(d=>d.stage===stage)
      const amount = deals_at_stage.reduce((s,d)=>s+d.amount,0)
      return {name:stage,value:amount,count:deals_at_stage.length}
    }).filter(x=>x.value>0)
  },[openDeals])

  // ── Pipeline by Stage ────────────────────────────────────────────────────
  const byStage = useMemo(()=>{
    const map=new Map<string,{stage:string;total:number}>()
    for (const d of openDeals) {
      const cur=map.get(d.stage)||{stage:d.stage,total:0}
      cur.total+=d.amount
      map.set(d.stage,cur)
    }
    return [...map.values()].sort((a,b)=>{
      const i=(s:string)=>{const x=STAGE_ORDER.findIndex(v=>v.toLowerCase()===s.toLowerCase());return x>=0?x:999}
      return i(a.stage)-i(b.stage)
    })
  },[openDeals])

  // ── Trend ────────────────────────────────────────────────────────────────
  const trend = useMemo(()=>monthsOfYear(year).map((m,i)=>{
    const base=deals.filter(d=>d.closingYm.startsWith(`${year}-`))
    const inM=base.filter(d=>d.closingYm===m)
    const open=inM.filter(d=>d.status==='Open')
    const won=inM.filter(d=>d.status==='Won')
    const isCommit=(s:string)=>s.toLowerCase()==='commit'
    return {
      month:MONTHS_FR[i],
      total:   open.reduce((s,d)=>s+d.amount,0),
      forecast:open.reduce((s,d)=>s+d.amount*(d.prob/100),0),
      commit:  open.filter(d=>isCommit(d.stage)).reduce((s,d)=>s+d.amount,0),
      won:     won.reduce((s,d)=>s+d.amount,0),
    }
  }),[deals,year])

  // ── Top Clients ──────────────────────────────────────────────────────────
  const topClients = useMemo(()=>{
    const map=new Map<string,{client:string;accountId:string|null;csg:number;cirs:number;total:number;deals:number;region:string}>()
    for (const d of scopeDeals) {
      const key=d.account_name; const cur=map.get(key)||{client:key,accountId:d.account_id,csg:0,cirs:0,total:0,deals:0,region:'—'}
      for(const ln of d.lines){if(ln.group==='CSG')cur.csg+=ln.amount;else cur.cirs+=ln.amount};cur.total=cur.csg+cur.cirs;cur.deals++
      // region from accounts
      const acc=accounts.find(a=>a.id===d.account_id)
      if (acc?.region) cur.region=acc.region
      map.set(key,cur)
    }
    return [...map.values()].sort((a,b)=>b.total-a.total).slice(0,5)
  },[scopeDeals,accounts])

  // ── Top Vendors ──────────────────────────────────────────────────────────
  const topVendors = useMemo(()=>{
    const map=new Map<string,{card:string;total:number}>()
    for (const d of scopeDeals) for (const ln of d.lines) {
      const card=(ln.card||'—').trim()||'—'; const cur=map.get(card)||{card,total:0}
      cur.total+=ln.amount; map.set(card,cur)
    }
    const arr=[...map.values()].sort((a,b)=>b.total-a.total).slice(0,8)
    const grand=arr.reduce((s,x)=>s+x.total,0)
    return arr.map(x=>({...x,pct:pct(x.total,grand)}))
  },[scopeDeals])

  // ── Geographic breakdown ─────────────────────────────────────────────────
  const byRegion = useMemo(()=>{
    const map=new Map<string,{region:string;total:number;count:number}>()
    for (const d of scopeDeals) {
      const acc=accounts.find(a=>a.id===d.account_id)
      const region=acc?.region||d.raw?.accounts?.region||'Non renseigné'
      const cur=map.get(region)||{region,total:0,count:0}
      cur.total+=d.amount; cur.count++; map.set(region,cur)
    }
    return [...map.values()].sort((a,b)=>b.total-a.total)
  },[scopeDeals,accounts])

  // ── Sector breakdown ─────────────────────────────────────────────────────
  const bySector = useMemo(()=>{
    const map=new Map<string,{sector:string;total:number;count:number}>()
    for (const d of scopeDeals) {
      const acc=accounts.find(a=>a.id===d.account_id)
      const sector=acc?.segment||d.raw?.accounts?.segment||'Non renseigné'
      const cur=map.get(sector)||{sector,total:0,count:0}
      cur.total+=d.amount; cur.count++; map.set(sector,cur)
    }
    return [...map.values()].sort((a,b)=>b.total-a.total).slice(0,8)
  },[scopeDeals,accounts])

  // ── Late bookings ────────────────────────────────────────────────────────
  const late = useMemo(()=>
    openDeals.filter(d=>d.closingYmReal&&d.closingYmReal<periodMonths[0])
      .sort((a,b)=>b.amount-a.amount).slice(0,15)
  ,[openDeals,periodMonths])

  // ── Stale deals (>60 days open) ──────────────────────────────────────────
  const staleDeals = useMemo(()=>
    openDeals.filter(d=>d.daysOld>=60).sort((a,b)=>b.daysOld-a.daysOld).slice(0,10)
  ,[openDeals])

  // ── Top Open / Won ────────────────────────────────────────────────────────
  const topOpen = useMemo(()=>[...openDeals].sort((a,b)=>b.amount-a.amount).slice(0,12),[openDeals])
  const topWon  = useMemo(()=>[...wonDeals].sort((a,b)=>b.amount-a.amount).slice(0,12),[wonDeals])

  // ── Sorted deals list ────────────────────────────────────────────────────
  const sortedDeals = useMemo(()=>{
    const best=(d:Deal)=>[...d.lines].sort((a,b)=>b.amount-a.amount)[0]
    return [...inPeriod].sort((a,b)=>{
      const dir=sortDir==='asc'?1:-1
      let va:any='',vb:any=''
      switch(sortKey){
        case 'account':va=a.account_name;vb=b.account_name;break
        case 'stage':va=a.stage;vb=b.stage;break
        case 'sbu':va=String(best(a)?.sbu);vb=String(best(b)?.sbu);break
        case 'card':va=best(a)?.card;vb=best(b)?.card;break
        case 'prob':va=a.prob;vb=b.prob;break
        case 'closing':va=a.closingYmReal||a.closingYm;vb=b.closingYmReal||b.closingYm;break
        default:va=a.amount;vb=b.amount
      }
      if (typeof va==='number'&&typeof vb==='number') return dir*(va-vb)
      return dir*String(va).localeCompare(String(vb))
    })
  },[inPeriod,sortKey,sortDir])

  const Th=({col,label,right}:{col:typeof sortKey;label:string;right?:boolean})=>{
    const active=sortKey===col
    return (
      <th onClick={()=>{ if(!active){setSortKey(col);setSortDir('desc')}else setSortDir(d=>d==='desc'?'asc':'desc') }}
        className={`px-4 py-3 text-xs font-semibold cursor-pointer select-none whitespace-nowrap transition-colors
          ${right?'text-right':'text-left'}
          ${active?'text-slate-900':'text-slate-400 hover:text-slate-600'}`}>
        {label}{active?(sortDir==='desc'?' ↓':' ↑'):''}
      </th>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-screen-2xl px-4 py-6 space-y-6">

        {/* ══ HEADER ══ */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg">
              <Activity className="h-5 w-5"/>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-xs text-slate-500">{periodLabel} · {inPeriodRaw.length} deals{activeFilterCount>0?` · ${inPeriod.length} filtrés`:''}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);setMonth(`${y}-01`)}}
                className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                {[thisYear-1,thisYear,thisYear+1].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400"/>
            </div>

            <SegBtn value={view} onChange={v=>setView(v as ViewMode)}
              items={[{id:'year',label:'Année'},{id:'quarter',label:'Trimestre'},{id:'month',label:'Mois'},{id:'range',label:'📅 Plage'}]}/>

            {view==='quarter'&&(
              <div className="relative">
                <select value={quarter} onChange={e=>setQuarter(e.target.value as any)}
                  className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none">
                  {(['Q1','Q2','Q3','Q4'] as const).map(q=><option key={q} value={q}>{q}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400"/>
              </div>
            )}
            {view==='month'&&(
              <div className="relative">
                <select value={month} onChange={e=>setMonth(e.target.value)}
                  className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none">
                  {monthsOfYear(year).map(m=><option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400"/>
              </div>
            )}

            <SegBtn value={scope} onChange={v=>setScope(v as ScopeMode)}
              items={[{id:'open_won',label:'Open+Won'},{id:'open_only',label:'Open'}]}/>

            {/* Bouton Filtres avancés */}
            <button type="button" onClick={()=>setShowFilters(v=>!v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition-all
                ${showFilters||activeFilterCount>0?'border-blue-400 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <SlidersHorizontal className="h-4 w-4"/>Filtres
              {activeFilterCount>0&&(
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">{activeFilterCount}</span>
              )}
            </button>

            <button onClick={load} disabled={loading} type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>
              {loading?'Chargement…':'Actualiser'}
            </button>
          </div>
        </div>

        {err&&(
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0"/>{err}
          </div>
        )}

        {/* ══ PLAGE PERSONNALISÉE ══ */}
        {view==='range'&&(
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 px-5 py-3.5">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0"/>
            <span className="text-sm font-semibold text-blue-800">Plage personnalisée :</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Du</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              <span className="text-xs text-slate-500">au</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <span className="text-xs font-semibold text-blue-600">→ {periodMonths.length} mois · {inPeriodRaw.length} deals</span>
          </div>
        )}

        {/* ══ FILTRES AVANCÉS ══ */}
        {showFilters&&(
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400"/>
                <span className="text-sm font-bold text-slate-900">Filtres avancés</span>
                {activeFilterCount>0&&<span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{activeFilterCount} actifs</span>}
              </div>
              {activeFilterCount>0&&(
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700">
                  <X className="h-3.5 w-3.5"/>Tout effacer
                </button>
              )}
            </div>
            <div className="p-5 space-y-5">

              {/* Statut */}
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Statut</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {id:'Open', bg:'bg-blue-50',    text:'text-blue-700',    dot:'bg-blue-400'},
                    {id:'Won',  bg:'bg-emerald-50', text:'text-emerald-700', dot:'bg-emerald-500'},
                    {id:'Lost', bg:'bg-red-50',     text:'text-red-600',     dot:'bg-red-400'},
                  ].map(s=>(
                    <button key={s.id} type="button" onClick={()=>toggleSet(setStatusFilter,s.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-all
                        ${statusFilter.has(s.id)?`${s.bg} ${s.text} border-current ring-1 ring-current/30`:'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <span className={`h-2 w-2 rounded-full ${s.dot}`}/>{s.id}
                      {statusFilter.has(s.id)&&<CheckCircle2 className="h-3 w-3"/>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Étape */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Étape</span>
                  {stageFilters.size>0&&<button onClick={()=>setStageFilters(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Effacer</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {STAGE_ORDER.map(s=>{
                    const cfg=STAGE_CFG[s]||STAGE_CFG.Lead
                    return (
                      <button key={s} type="button" onClick={()=>toggleSet(setStageFilters,s)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all
                          ${stageFilters.has(s)?`${cfg.bg} ${cfg.text} border-current ring-1 ring-current/30`:'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}/>{s}
                        {stageFilters.has(s)&&<CheckCircle2 className="h-3 w-3"/>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* BU */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Business Unit</span>
                  {buFilters.size>0&&<button onClick={()=>setBuFilters(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Effacer</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {['CSG','CIRS'].map(g=>(
                    <button key={g} type="button" onClick={()=>toggleSet(setBuFilters,g)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border transition-all
                        ${buFilters.has(g)?'bg-slate-900 text-white border-slate-900':'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                      {g}{buFilters.has(g)&&<CheckCircle2 className="h-3 w-3 ml-0.5"/>}
                    </button>
                  ))}
                  <span className="self-center text-slate-200 text-sm">|</span>
                  {Object.entries(SBU_COLORS).filter(([k])=>!['MULTI','Other'].includes(k)).map(([sbu,color])=>(
                    <button key={sbu} type="button" onClick={()=>toggleSet(setBuFilters,sbu)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all
                        ${buFilters.has(sbu)?'text-white border-transparent':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      style={buFilters.has(sbu)?{background:color,borderColor:color}:undefined}>
                      <span className="h-2 w-2 rounded-full" style={{background:color}}/>{sbu}
                      {buFilters.has(sbu)&&<CheckCircle2 className="h-3 w-3"/>}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount>0&&(
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-700 font-medium">
                  {[
                    statusFilter.size>0?`Statut: ${[...statusFilter].join(', ')}`:null,
                    stageFilters.size>0?`Étape: ${[...stageFilters].join(', ')}`:null,
                    buFilters.size>0?`BU: ${[...buFilters].join(', ')}`:null,
                  ].filter(Boolean).join(' · ')}
                  {' '}→ <strong>{inPeriod.length}</strong> deals sur {inPeriodRaw.length}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ OBJECTIF ANNUEL PROGRESS BAR ══ */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 text-white shadow-md">
                <Trophy className="h-5 w-5"/>
              </div>
              <div>
                <div className="text-sm font-black text-slate-900">Objectif annuel {year} — Won</div>
                <div className="text-xs text-slate-500">Cible : 30 000 000 MAD</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl font-black text-emerald-700">{fmt(kpis.annualWon)} MAD</div>
                <div className="text-xs text-slate-500">Won cumulé {year}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-slate-900">{kpis.annualCoverage}%</div>
                <div className="text-xs text-slate-500">de l'objectif</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-700">{fmt(Math.max(0,ANNUAL_TARGET-kpis.annualWon))} MAD</div>
                <div className="text-xs text-slate-500">restant</div>
              </div>
            </div>
          </div>
          <div className="px-6 pb-4">
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${kpis.annualCoverage>=100?'bg-emerald-500':kpis.annualCoverage>=70?'bg-amber-400':'bg-blue-500'}`}
                style={{width:`${kpis.annualCoverage}%`}}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400 font-medium">
              <span>0</span><span>7.5M (Q1)</span><span>15M (Q2)</span><span>22.5M (Q3)</span><span>30M</span>
            </div>
          </div>
        </div>

        {/* ══ KPI ROW (6 métriques) ══ */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Pipeline actif" color="blue" icon={<TrendingUp className="h-5 w-5"/>}
            value={fmt(kpis.pipeAmt)+' MAD'}
            sub={`${kpis.pipeCount} deals`}
            delta={kpis.pipeVsPrev!==null?(kpis.pipeVsPrev>=0?'up':'down'):undefined}
            deltaLabel={kpis.pipeVsPrev!==null?`${kpis.pipeVsPrev>0?'+':''}${kpis.pipeVsPrev}%`:undefined}/>
          <KpiCard label="Forecast pondéré" color="violet" icon={<Target className="h-5 w-5"/>}
            value={fmt(kpis.foreAmt)+' MAD'}
            sub={`Confiance ${kpis.conf}%`}/>
          <KpiCard label="En Commit" color="amber" icon={<Zap className="h-5 w-5"/>}
            value={fmt(kpis.commitAmt)+' MAD'}
            sub={`${kpis.commitCount} deals`}/>
          <KpiCard label="Won (période)" color="green" icon={<Award className="h-5 w-5"/>}
            value={fmt(kpis.wonAmt)+' MAD'}
            sub={`${kpis.wonCount} deals clôturés`}
            delta={kpis.wonVsPrev!==null?(kpis.wonVsPrev>=0?'up':'down'):undefined}
            deltaLabel={kpis.wonVsPrev!==null?`${kpis.wonVsPrev>0?'+':''}${kpis.wonVsPrev}%`:undefined}/>
          <KpiCard label="Win Rate" color="slate" icon={<CheckCircle2 className="h-5 w-5"/>}
            value={`${kpis.winRate}%`}
            sub={`${kpis.wonCount} Won / ${kpis.wonCount+kpis.lostCount} clôturés`}/>
          <KpiCard label="Taille moy. deal" color="slate" icon={<BarChart2 className="h-5 w-5"/>}
            value={fmt(kpis.avgDeal)+' MAD'}
            sub="Open deals"/>
        </div>

        {/* ══ ALERTES QUALITÉ ══ */}
        {(quality.missingAmt+quality.missingClose+quality.missingStep+quality.stale90) > 0 && (
          <div className="flex flex-wrap gap-2">
            {quality.missingAmt>0&&(
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5"/>{quality.missingAmt} deals sans montant
              </div>
            )}
            {quality.missingClose>0&&(
              <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
                <Calendar className="h-3.5 w-3.5"/>{quality.missingClose} sans date closing
              </div>
            )}
            {quality.missingStep>0&&(
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                <Info className="h-3.5 w-3.5"/>{quality.missingStep} sans next step
              </div>
            )}
            {quality.stale60>0&&(
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                <Clock className="h-3.5 w-3.5"/>{quality.stale60} deals ≥60 jours sans closing
              </div>
            )}
            {quality.stale90>0&&(
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                <Flame className="h-3.5 w-3.5 text-red-500"/>{quality.stale90} deals ≥90 jours — À relancer !
              </div>
            )}
          </div>
        )}

        {/* ══ ROW : 3 donuts / summary ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

          {/* Open/Won/Lost donut */}
          <Panel title="Répartition statuts" sub="Montant MAD · Période">
            {donut.total<=0?<Empty/>:(
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut.d} dataKey="value" nameKey="name" innerRadius={68} outerRadius={96} paddingAngle={4} strokeWidth={0}>
                        {donut.d.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip isAmt={true}/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-3 divide-x divide-slate-100">
                  {donut.d.map(e=>(
                    <div key={e.name} className="text-center px-2 py-1">
                      <div className="text-xl font-black text-slate-900">{fmt(e.value)}</div>
                      <div className="flex items-center gap-1 justify-center text-xs text-slate-500 mt-0.5">
                        <span className="h-2 w-2 rounded-full" style={{background:e.color}}/>{e.name}
                      </div>
                      <div className={`text-sm font-bold mt-0.5`} style={{color:e.color}}>{pct(e.value,donut.total)}%</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          {/* Mix CSG/CIRS */}
          <Panel title="Mix CSG vs CIRS" sub="Open · répartition BU">
            {mixBU.total<=0?<Empty/>:(
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={mixBU.data} dataKey="value" nameKey="name" innerRadius={68} outerRadius={96} paddingAngle={4} strokeWidth={0}
                        label={({cx,cy,midAngle=0,outerRadius:or,name,value})=>{
                          const RADIAN=Math.PI/180, rx=cx+((or||0)+20)*Math.cos(-midAngle*RADIAN), ry=cy+((or||0)+20)*Math.sin(-midAngle*RADIAN)
                          return <text x={rx} y={ry} textAnchor={rx>cx?'start':'end'} fill="#475569" fontSize={11} fontWeight={700}>{name} {pct(value,mixBU.total)}%</text>
                        }}>
                        {mixBU.data.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip isAmt={true}/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 divide-x divide-slate-100">
                  {mixBU.data.map(e=>(
                    <div key={e.name} className="text-center px-4 py-1">
                      <div className="text-3xl font-black text-slate-900">{pct(e.value,mixBU.total)}%</div>
                      <div className="flex items-center gap-1 justify-center text-xs text-slate-500 mt-0.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{background:e.color}}/><span className="font-semibold">{e.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{fmt(e.value)} MAD</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          {/* Pipeline by stage (mini bars) */}
          <Panel title="Répartition par étape" sub="Open · MAD">
            {byStage.length===0?<Empty/>:(
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byStage} layout="vertical" margin={{top:2,right:54,bottom:2,left:0}}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={fmt}/>
                    <YAxis type="category" dataKey="stage" tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false} width={112}/>
                    <Tooltip content={<ChartTip isAmt={true}/>}/>
                    <Bar dataKey="total" name="Montant" radius={[0,6,6,0]}>
                      {byStage.map((e,i)=>{
                        const colors=['#94a3b8','#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#f97316','#10b981','#16a34a','#ef4444']
                        return <Cell key={i} fill={colors[i%colors.length]}/>
                      })}
                      <LabelList dataKey="total" position="right" formatter={(v:any)=>fmt(v)} style={{fontSize:10,fill:'#64748b',fontWeight:600}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* ══ BU SCORECARD ══ */}
        <Panel title="📊 Scorecard par BU — Période" sub={`${periodLabel} · Pipeline / Forecast / Won / Win Rate / Taille moy.`}>
          <div className="overflow-auto -mx-5 px-5">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                  <th className="pb-2.5 text-left">BU</th>
                  <th className="pb-2.5 text-right">Pipeline</th>
                  <th className="pb-2.5 text-right">Forecast</th>
                  <th className="pb-2.5 text-right">Won</th>
                  <th className="pb-2.5 text-right">Lost</th>
                  <th className="pb-2.5 text-right">Win Rate</th>
                  <th className="pb-2.5 text-right">Taille moy.</th>
                  <th className="pb-2.5 text-right">Deals Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {buScorecard.map(row=>(
                  <tr key={row.sbu} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                        <span className="h-2.5 w-2.5 rounded-full" style={{background:SBU_COLORS[row.sbu]||'#94a3b8'}}/>
                        {row.sbu}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmt(row.pipeline)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{fmt(row.forecast)}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmt(row.won)}</td>
                    <td className="py-2.5 text-right tabular-nums text-red-500">{fmt(row.lost)}</td>
                    <td className="py-2.5 text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold
                        ${row.winRate>=60?'bg-emerald-100 text-emerald-700':row.winRate>=30?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}`}>
                        {row.winRate}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-500 text-xs">{fmt(row.avgSize)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.count}</td>
                  </tr>
                ))}
                {buScorecard.length===0&&(
                  <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">Aucune donnée</td></tr>
                )}
              </tbody>
              {buScorecard.length>0&&(
                <tfoot className="border-t-2 border-slate-200">
                  <tr className="text-xs font-bold text-slate-700">
                    <td className="pt-2 text-slate-900">TOTAL</td>
                    <td className="pt-2 text-right tabular-nums text-slate-900">{fmt(buScorecard.reduce((s,x)=>s+x.pipeline,0))}</td>
                    <td className="pt-2 text-right tabular-nums">{fmt(buScorecard.reduce((s,x)=>s+x.forecast,0))}</td>
                    <td className="pt-2 text-right tabular-nums text-emerald-700">{fmt(buScorecard.reduce((s,x)=>s+x.won,0))}</td>
                    <td className="pt-2 text-right tabular-nums text-red-500">{fmt(buScorecard.reduce((s,x)=>s+x.lost,0))}</td>
                    <td className="pt-2 text-right">—</td>
                    <td className="pt-2 text-right">—</td>
                    <td className="pt-2 text-right tabular-nums">{buScorecard.reduce((s,x)=>s+x.count,0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Panel>

        {/* ══ ROW : Pipeline BU + Tendance ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Pipeline par BU" sub={`Open · Total vs Forecast vs Won`}>
            {bySBU.length===0?<Empty/>:(
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySBU} margin={{top:10,right:10,bottom:10,left:0}} barGap={3} barCategoryGap="30%">
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false}/>
                    <XAxis dataKey="sbu" tick={{fontSize:12,fill:'#475569',fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={52} tickFormatter={fmt}/>
                    <Tooltip content={<ChartTip isAmt={true}/>}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
                    <Bar name="Total Open" dataKey="total"    fill="#1e293b" radius={[5,5,0,0]}/>
                    <Bar name="Forecast"   dataKey="forecast" fill="#3b82f6" radius={[5,5,0,0]}/>
                    <Bar name="Won"        dataKey="won"      fill="#10b981" radius={[5,5,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title={`Tendance ${year}`} sub="Total Open / Forecast / Commit / Won — par mois">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{top:10,right:10,bottom:5,left:0}}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={52} tickFormatter={fmt}/>
                  <Tooltip content={<ChartTip isAmt={true}/>}/>
                  <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
                  <Area type="monotone" dataKey="total" name="Total Open" fill="url(#gradTotal)" stroke="#1e293b" strokeWidth={2.5} fillOpacity={1} dot={false}/>
                  <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="6 3"/>
                  <Line type="monotone" dataKey="commit"   name="Commit"   stroke="#f59e0b" strokeWidth={2.5} dot={false}/>
                  <Line type="monotone" dataKey="won"      name="Won"      stroke="#10b981" strokeWidth={3} dot={{r:3,fill:'#10b981'}} activeDot={{r:5}}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* ══ ROW : Top Clients + Top Vendors ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Top 5 Clients" sub={`${scope==='open_only'?'Open':'Open+Won'} · CSG vs CIRS`}>
            {topClients.length===0?<Empty/>:(
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClients} margin={{top:10,right:10,bottom:36,left:0}}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false}/>
                    <XAxis dataKey="client" tick={{fontSize:10,fill:'#475569'}} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={48}/>
                    <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={52} tickFormatter={fmt}/>
                    <Tooltip content={<ChartTip isAmt={true}/>}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:4}}/>
                    <Bar name="CIRS" dataKey="cirs" stackId="a" fill="#64748b"/>
                    <Bar name="CSG"  dataKey="csg"  stackId="a" fill="#1e293b" radius={[6,6,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Top Constructeurs / Cartes" sub={`${scope==='open_only'?'Open':'Open+Won'}`}>
            {topVendors.length===0?<Empty/>:(
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topVendors} layout="vertical" margin={{top:4,right:54,bottom:4,left:0}}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={fmt}/>
                    <YAxis type="category" dataKey="card" tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false} width={112}/>
                    <Tooltip content={<ChartTip isAmt={true}/>}/>
                    <Bar name="Total" dataKey="total" radius={[0,6,6,0]}>
                      {topVendors.map((_,i)=>{
                        const palette=['#6366f1','#3b82f6','#8b5cf6','#06b6d4','#f59e0b','#10b981','#f97316','#ef4444']
                        return <Cell key={i} fill={palette[i%palette.length]}/>
                      })}
                      <LabelList dataKey="pct" position="right" formatter={(v:any)=>`${v}%`} style={{fontSize:10,fill:'#64748b',fontWeight:600}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* ══ ROW : Geo + Secteur ══ */}
        {(byRegion.length>0||bySector.length>0)&&(
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Pipeline par Région" sub={`Via comptes associés · ${scope==='open_only'?'Open':'Open+Won'}`}>
              {byRegion.length===0?<Empty/>:(
                <div className="space-y-3.5">
                  {byRegion.map((x,i)=>{
                    const colors=['#3b82f6','#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b']
                    const color=colors[i%colors.length]
                    const w=pct(x.total,byRegion[0]?.total||1)
                    return (
                      <div key={x.region} className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 w-28 text-xs font-semibold text-slate-700 shrink-0">
                          <MapPin className="h-3 w-3 shrink-0" style={{color}}/>{x.region}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${w}%`,background:color}}/>
                        </div>
                        <div className="text-xs font-bold text-slate-700 w-20 text-right tabular-nums">{fmt(x.total)} MAD</div>
                        <div className="text-xs text-slate-400 w-12 text-right">{x.count}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Pipeline par Secteur d'activité" sub={`Via comptes associés · ${scope==='open_only'?'Open':'Open+Won'}`}>
              {bySector.length===0?<Empty/>:(
                <div className="space-y-3.5">
                  {bySector.map((x,i)=>{
                    const colors=['#f59e0b','#f97316','#ef4444','#8b5cf6','#3b82f6','#06b6d4','#10b981','#64748b']
                    const color=colors[i%colors.length]
                    const w=pct(x.total,bySector[0]?.total||1)
                    return (
                      <div key={x.sector} className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 w-32 text-xs font-semibold text-slate-700 shrink-0 truncate" title={x.sector}>
                          <Building2 className="h-3 w-3 shrink-0" style={{color}}/>{x.sector}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${w}%`,background:color}}/>
                        </div>
                        <div className="text-xs font-bold text-slate-700 w-20 text-right tabular-nums">{fmt(x.total)} MAD</div>
                        <div className="text-xs text-slate-400 w-12 text-right">{x.count}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ══ ROW : Top Open + Top Won ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="🎯 Top Open Deals" sub="Trié par montant décroissant">
            {topOpen.length===0?<Empty/>:(
              <div className="overflow-auto max-h-64 -mx-5 px-5">
                <table className="w-full text-sm min-w-[420px]">
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
                    {topOpen.map(d=>(
                      <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs whitespace-nowrap">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[130px] truncate">
                          <Link href={`/pipeline?edit=${d.id}`} className="hover:text-blue-600 hover:underline">{d.title}</Link>
                        </td>
                        <td className="py-2 pr-3"><StagePill stage={d.stage}/></td>
                        <td className="py-2 text-right font-black text-slate-900 tabular-nums text-xs whitespace-nowrap">{fmt(d.amount)}</td>
                        <td className="py-2 text-right text-slate-500 tabular-nums text-xs">{d.prob}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="🏆 Top Won Deals" sub="Deals clôturés sur la période">
            {topWon.length===0?(
              <div className="flex h-32 items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
                <Award className="h-5 w-5"/>Aucun Won pour l'instant
              </div>
            ):(
              <div className="overflow-auto max-h-64 -mx-5 px-5">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">Deal</th>
                      <th className="pb-2 text-left">BU</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {topWon.map(d=>{
                      const best=[...d.lines].sort((a,b)=>b.amount-a.amount)[0]
                      return (
                        <tr key={d.id} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="py-2 pr-3 font-bold text-slate-900 text-xs whitespace-nowrap">{d.account_name}</td>
                          <td className="py-2 pr-3 text-xs text-slate-600 max-w-[150px] truncate">
                            <Link href={`/pipeline?edit=${d.id}`} className="hover:text-emerald-600 hover:underline">{d.title}</Link>
                          </td>
                          <td className="py-2 pr-3">
                            <span className="text-xs font-semibold" style={{color:SBU_COLORS[String(best?.sbu)]||'#64748b'}}>{String(best?.sbu||'—')}</span>
                          </td>
                          <td className="py-2 text-right font-black text-emerald-700 tabular-nums text-xs whitespace-nowrap">{fmt(d.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ══ RETARDS + STALE ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {late.length>0&&(
            <Panel title="⚠ Retard Booking" sub={`${late.length} deals Open avec closing < ${periodMonths[0]}`}>
              <div className="overflow-auto max-h-56 -mx-5 px-5">
                <table className="w-full text-sm min-w-[440px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">Deal</th>
                      <th className="pb-2 text-left">Closing prévu</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {late.map(d=>(
                      <tr key={d.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[140px] truncate">{d.title}</td>
                        <td className="py-2 pr-3 text-xs font-bold text-red-600">{d.closingYmReal}</td>
                        <td className="py-2 text-right font-bold text-slate-900 tabular-nums text-xs">{fmt(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {staleDeals.length>0&&(
            <Panel title="🔥 Deals Stagnants ≥60j" sub="Deals Open depuis longtemps sans action — à relancer">
              <div className="overflow-auto max-h-56 -mx-5 px-5">
                <table className="w-full text-sm min-w-[440px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">Deal</th>
                      <th className="pb-2 text-left">Étape</th>
                      <th className="pb-2 text-right">Jours</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {staleDeals.map(d=>(
                      <tr key={d.id} className="hover:bg-orange-50/30 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[130px] truncate">{d.title}</td>
                        <td className="py-2 pr-3"><StagePill stage={d.stage}/></td>
                        <td className="py-2 text-right">
                          <span className={`text-xs font-bold ${d.daysOld>=90?'text-red-600':d.daysOld>=60?'text-orange-600':'text-amber-600'}`}>
                            {d.daysOld}j
                          </span>
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900 tabular-nums text-xs">{fmt(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        {/* ══ LISTE COMPLÈTE DEALS ══ */}
        <Panel title="📋 Tous les deals — période" sub={`${periodLabel} · ${sortedDeals.length} deals · Clic sur en-tête pour trier`}>
          <div className="overflow-auto rounded-xl border border-slate-100 -mx-5">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <Th col="account" label="Compte"/>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Deal</th>
                    <Th col="stage" label="Étape"/>
                    <Th col="sbu" label="BU"/>
                    <Th col="card" label="Carte"/>
                    <Th col="amount" label="Montant" right/>
                    <Th col="prob" label="Prob" right/>
                    <Th col="closing" label="Closing"/>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedDeals.map(d=>{
                    const best=[...d.lines].sort((a,b)=>b.amount-a.amount)[0]
                    const mainSbu=String(best?.sbu||'—')
                    const mainCard=d.isMulti?`Multi (${d.lines.length})`:(best?.card||'—')
                    const isLate=d.closingYmReal&&d.closingYmReal<periodMonths[0]&&d.status==='Open'
                    return (
                      <tr key={d.id} className={`transition-colors ${isLate?'hover:bg-red-50/20':'hover:bg-slate-50/60'}`}>
                        <td className="px-4 py-2.5 font-bold text-slate-900 text-xs whitespace-nowrap">{d.account_name}</td>
                        <td className="px-4 py-2.5 max-w-[160px]">
                          <Link href={`/pipeline?edit=${d.id}`} className="block truncate text-xs text-slate-600 hover:text-blue-600 hover:underline" title={d.title}>{d.title}</Link>
                        </td>
                        <td className="px-4 py-2.5"><StagePill stage={d.stage}/></td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{background:SBU_COLORS[mainSbu]||'#94a3b8'}}/>{mainSbu}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[110px] truncate">{mainCard}</td>
                        <td className="px-4 py-2.5 font-black text-slate-900 tabular-nums text-right text-xs whitespace-nowrap">{mad(d.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-right text-xs">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1.5 w-10 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${d.prob>=80?'bg-emerald-500':d.prob>=60?'bg-amber-400':'bg-slate-300'}`} style={{width:`${d.prob}%`}}/>
                            </div>
                            <span className="text-slate-500 w-7">{d.prob}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {d.closingYmReal?(
                            <span className={isLate?'font-bold text-red-500':'text-slate-600'}>{d.closingYmReal}</span>
                          ):<span className="font-semibold text-red-400">manquant</span>}
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={d.status}/></td>
                      </tr>
                    )
                  })}
                  {sortedDeals.length===0&&(
                    <tr><td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-400">Aucun deal sur la période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {sortedDeals.length>0&&(
            <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
              <span>{sortedDeals.length} deals affichés · {inPeriod.length} total</span>
              <span className="font-bold text-slate-700">Total : {mad(sortedDeals.reduce((s,d)=>s+d.amount,0))}</span>
            </div>
          )}
        </Panel>

      </div>

      {/* ══ AI CHATBOT ══ */}
      <CRMChatbot deals={deals} accounts={accounts} periodLabel={periodLabel} />

    </div>
  )
}
