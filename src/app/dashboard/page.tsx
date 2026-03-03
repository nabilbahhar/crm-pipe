'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  RefreshCw, TrendingUp, Target, Award, Zap, AlertTriangle,
  ChevronDown, BarChart2, Activity, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Clock, Flame, Info, Trophy,
  Building2, MapPin, Calendar, Filter, X, SlidersHorizontal,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  LabelList, ComposedChart, Area, ScatterChart, Scatter, ZAxis,
  ReferenceLine,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
type ViewMode   = 'year' | 'quarter' | 'month' | 'range'
type MetricMode = 'amount' | 'count'
const SBU_ORDER = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const
type SBU = (typeof SBU_ORDER)[number] | 'MULTI' | 'Other'
const ALL_STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const
const ANNUAL_TARGET = 30_000_000
const SBU_COLORS: Record<string, string> = {
  HCI: '#6366f1', Network: '#0ea5e9', Storage: '#14b8a6',
  Cyber: '#ef4444', Service: '#8b5cf6', CSG: '#f59e0b',
  MULTI: '#94a3b8', Other: '#cbd5e1',
}
const C = { pipeline:'#2563eb',forecast:'#7c3aed',commit:'#d97706',won:'#16a34a',lost:'#dc2626',csg:'#0f172a',cirs:'#64748b',grid:'#f1f5f9' }
const STAGE_CFG: Record<string,{bg:string;text:string;dot:string;bar:string}> = {
  Lead:                 {bg:'bg-slate-100',  text:'text-slate-600',  dot:'bg-slate-400',   bar:'#94a3b8'},
  Discovery:            {bg:'bg-blue-50',    text:'text-blue-700',   dot:'bg-blue-400',    bar:'#60a5fa'},
  Qualified:            {bg:'bg-cyan-50',    text:'text-cyan-700',   dot:'bg-cyan-400',    bar:'#22d3ee'},
  Solutioning:          {bg:'bg-violet-50',  text:'text-violet-700', dot:'bg-violet-400',  bar:'#a78bfa'},
  'Proposal Sent':      {bg:'bg-amber-50',   text:'text-amber-700',  dot:'bg-amber-400',   bar:'#fbbf24'},
  Negotiation:          {bg:'bg-orange-50',  text:'text-orange-700', dot:'bg-orange-400',  bar:'#fb923c'},
  Commit:               {bg:'bg-emerald-50', text:'text-emerald-700',dot:'bg-emerald-500', bar:'#34d399'},
  Won:                  {bg:'bg-green-100',  text:'text-green-800',  dot:'bg-green-500',   bar:'#16a34a'},
  'Lost / No decision': {bg:'bg-red-50',     text:'text-red-600',    dot:'bg-red-400',     bar:'#f87171'},
}
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const mad = (n:number) => new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD',maximumFractionDigits:0}).format(n||0)
const fmt = (n:number) => { if(n>=1_000_000) return `${(n/1_000_000).toFixed(1)}M`; if(n>=1_000) return `${Math.round(n/1000)}K`; return String(Math.round(n)) }
const pct = (v:number,t:number) => (!t?0:Math.round((v/t)*100))
const ymFrom = (raw:any):string|null => {
  if(!raw) return null
  if(typeof raw==='string'){const s=raw.trim();if(s.length>=7&&/^\d{4}-\d{2}/.test(s)) return s.slice(0,7);return null}
  try{const d=new Date(raw);if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}catch{}
  return null
}
const monthsOfYear  = (y:number) => Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`)
const quarterMonths = (y:number,q:'Q1'|'Q2'|'Q3'|'Q4') => {
  const s=q==='Q1'?1:q==='Q2'?4:q==='Q3'?7:10
  return Array.from({length:3},(_,i)=>`${y}-${String(s+i).padStart(2,'0')}`)
}
const rangeMonths = (from:string,to:string) => {
  if(!from||!to) return []
  const start=from.slice(0,7),end=to.slice(0,7)
  if(start>end) return []
  const res:string[]=[];let cur=start
  while(cur<=end){
    res.push(cur);const[y,m]=cur.split('-').map(Number)
    cur=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`
    if(res.length>120) break
  }
  return res
}
const normStage  = (s:any) => String(s||'').trim()||'Lead'
const normStatus = (r:any):'Open'|'Won'|'Lost' => {
  const st=String(r?.status||'').trim()
  if(st==='Won'||st==='Lost'||st==='Open') return st
  const sg=normStage(r?.stage).toLowerCase()
  if(sg==='won') return 'Won';if(sg.includes('lost')) return 'Lost';return 'Open'
}
const normSBU = (raw:any):SBU => {
  const v=String(raw||'').trim();if(!v) return 'Other';const u=v.toUpperCase()
  if(u==='MULTI') return 'MULTI';if(u.includes('CSG')) return 'CSG'
  if(u.includes('NETWORK')) return 'Network';if(u.includes('STORAGE')) return 'Storage'
  if(u.includes('CYBER')) return 'Cyber';if(u.includes('SERVICE')) return 'Service'
  if(u.includes('HCI')||u.includes('INFRA')) return 'HCI';return 'Other'
}
const buGroup = (s:SBU):'CSG'|'CIRS' => (s==='CSG'?'CSG':'CIRS')
const daysBetween = (a:string,b:string) => Math.max(0,Math.floor((new Date(b).getTime()-new Date(a).getTime())/86400000))

type NormLine = {sbu:SBU;group:'CSG'|'CIRS';card:string;amount:number}
type Deal = {
  id:string;account_id:string|null;account_name:string;title:string
  stage:string;status:'Open'|'Won'|'Lost';prob:number;amount:number
  closingYm:string;closingYmReal:string|null;createdYm:string|null
  createdDate:string|null;closingDate:string|null
  missingClosing:boolean;missingNextStep:boolean;isMulti:boolean
  lines:NormLine[];daysOld:number;raw:any
}

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({label,value,sub,color,icon,delta,deltaLabel}:{
  label:string;value:string;sub?:string;icon:React.ReactNode
  color:'blue'|'violet'|'amber'|'green'|'red'|'slate'
  delta?:'up'|'down';deltaLabel?:string
}) {
  const cfg={
    blue:   {grad:'from-blue-600 to-blue-500',   ring:'ring-blue-100',    bg:'bg-blue-50',    num:'text-blue-700'},
    violet: {grad:'from-violet-600 to-violet-500',ring:'ring-violet-100',  bg:'bg-violet-50',  num:'text-violet-700'},
    amber:  {grad:'from-amber-500 to-amber-400',  ring:'ring-amber-100',   bg:'bg-amber-50',   num:'text-amber-700'},
    green:  {grad:'from-emerald-600 to-emerald-500',ring:'ring-emerald-100',bg:'bg-emerald-50',num:'text-emerald-700'},
    red:    {grad:'from-red-600 to-red-500',      ring:'ring-red-100',     bg:'bg-red-50',     num:'text-red-700'},
    slate:  {grad:'from-slate-700 to-slate-600',  ring:'ring-slate-200',   bg:'bg-slate-50',   num:'text-slate-800'},
  }[color]
  return (
    <div className={`relative overflow-hidden rounded-2xl ${cfg.bg} ring-1 ${cfg.ring} p-5`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${cfg.grad} text-white shadow-md`}>{icon}</div>
        {delta&&deltaLabel&&(
          <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold
            ${delta==='up'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600'}`}>
            {delta==='up'?<ArrowUp className="h-3 w-3"/>:<ArrowDown className="h-3 w-3"/>}{deltaLabel}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-black tracking-tight ${cfg.num}`}>{value}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-700">{label}</div>
      {sub&&<div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function Panel({title,sub,children,className,action}:{
  title:string;sub?:string;children:React.ReactNode;className?:string;action?:React.ReactNode
}) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden ${className||''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div>
          <div className="text-sm font-bold text-slate-900">{title}</div>
          {sub&&<div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SegBtn({items,value,onChange}:{items:{id:string;label:string}[];value:string;onChange:(v:string)=>void}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
      {items.map(it=>(
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
  if(!active||!payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-xl text-xs min-w-[150px]">
      {label&&<div className="mb-2 font-bold text-slate-800 border-b border-slate-100 pb-1">{label}</div>}
      {payload.map((p:any,i:number)=>(
        <div key={i} className="flex items-center justify-between gap-3 mt-1">
          <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full shrink-0" style={{background:p.color}}/>{p.name}</span>
          <span className="font-bold text-slate-900">{isAmt?fmt(p.value)+' MAD':p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({msg}:{msg?:string}) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-300">
      <BarChart2 className="h-8 w-8"/><div className="text-sm font-medium">{msg||'Aucune donnée'}</div>
    </div>
  )
}

function StagePill({stage}:{stage:string}) {
  const c=STAGE_CFG[stage]||STAGE_CFG.Lead
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`}/>{stage}
    </span>
  )
}
function StatusBadge({status}:{status:string}) {
  if(status==='Won')  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3"/>Won</span>
  if(status==='Lost') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600"><XCircle className="h-3 w-3"/>Lost</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700"><Clock className="h-3 w-3"/>Open</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNNEL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function FunnelConversion({data,isAmt}:{data:{stage:string;value:number;count:number}[];isAmt:boolean}) {
  if(!data.length) return <Empty/>
  const max=data[0]?.value||1
  return (
    <div className="space-y-2">
      {data.map((row,i)=>{
        const barW=Math.max(8,Math.round((row.value/max)*100))
        const convRate=i>0&&data[i-1].value>0?Math.round((row.value/data[i-1].value)*100):null
        const cfg=STAGE_CFG[row.stage]||STAGE_CFG.Lead
        return (
          <div key={row.stage}>
            <div className="flex items-center gap-3 mb-0.5">
              <div className="w-36 shrink-0">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}/>{row.stage}
                </span>
              </div>
              <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                <div className="h-full rounded-lg transition-all duration-500" style={{width:`${barW}%`,background:cfg.bar||'#94a3b8'}}/>
              </div>
              <div className="w-28 text-right text-xs font-bold text-slate-700 tabular-nums">
                {isAmt?fmt(row.value)+' MAD':row.count+' deals'}
              </div>
              {convRate!==null?(
                <div className={`w-12 text-right text-[10px] font-black tabular-nums ${convRate>=50?'text-emerald-600':convRate>=25?'text-amber-600':'text-red-500'}`}>
                  ↓{convRate}%
                </div>
              ):<div className="w-12"/>}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
        <div className="w-36 text-xs font-semibold text-slate-500 shrink-0">Conversion globale</div>
        <div className="flex-1"/>
        <div className="w-28"/>
        <div className="w-12 text-right text-xs font-black text-slate-800">
          {data.length>1&&data[0].value>0?`${pct(data[data.length-1].value,data[0].value)}%`:'—'}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const now = new Date()
  const thisYear = now.getFullYear()
  const todayStr = now.toISOString().slice(0,10)

  // ── Period ──────────────────────────────────────────────────────────────
  const [year, setYear]         = useState(thisYear)
  const [view, setView]         = useState<ViewMode>('quarter')
  const [quarter, setQuarter]   = useState<'Q1'|'Q2'|'Q3'|'Q4'>('Q1')
  const [month, setMonth]       = useState(`${thisYear}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [dateFrom, setDateFrom] = useState(`${thisYear}-01-01`)
  const [dateTo, setDateTo]     = useState(todayStr)

  // ── Content filters ─────────────────────────────────────────────────────
  const [metric, setMetric]               = useState<MetricMode>('amount')
  const [stageFilters, setStageFilters]   = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter]   = useState<Set<string>>(new Set())
  const [buFilters, setBuFilters]         = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters]     = useState(false)

  // ── Data ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string|null>(null)
  const [rows, setRows]       = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<'account'|'stage'|'sbu'|'card'|'amount'|'prob'|'closing'>('amount')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const toggleSet = useCallback((setter:React.Dispatch<React.SetStateAction<Set<string>>>,v:string)=>{
    setter(prev=>{ const n=new Set(prev); n.has(v)?n.delete(v):n.add(v); return n })
  },[])

  const activeFilterCount = stageFilters.size+statusFilter.size+buFilters.size
  const clearFilters = ()=>{ setStageFilters(new Set()); setStatusFilter(new Set()); setBuFilters(new Set()) }

  // ── Derived period months ───────────────────────────────────────────────
  const periodMonths = useMemo(()=>{
    if(view==='year')    return monthsOfYear(year)
    if(view==='quarter') return quarterMonths(year,quarter)
    if(view==='month')   return [month]
    if(view==='range')   return rangeMonths(dateFrom,dateTo)
    return []
  },[view,year,quarter,month,dateFrom,dateTo])

  const periodLabel = useMemo(()=>{
    if(view==='year')    return `Année ${year}`
    if(view==='quarter') return `${quarter} ${year}`
    if(view==='month')   return `Mois ${month}`
    if(view==='range')   return `${dateFrom} → ${dateTo}`
    return ''
  },[view,year,quarter,month,dateFrom,dateTo])

  const prevPeriodMonths = useMemo(()=>{
    if(view==='year')    return monthsOfYear(year-1)
    if(view==='quarter'){
      const qs:('Q1'|'Q2'|'Q3'|'Q4')[]=['Q1','Q2','Q3','Q4'];const idx=qs.indexOf(quarter)
      return idx===0?quarterMonths(year-1,'Q4'):quarterMonths(year,qs[idx-1])
    }
    if(view==='month'){
      const d=new Date(month+'-01');d.setMonth(d.getMonth()-1)
      return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]
    }
    return []
  },[view,year,quarter,month])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const [{data:opps,error:e1},{data:accs,error:e2}] = await Promise.all([
        supabase.from('opportunities').select('*, accounts(name,sector,segment,region)').order('created_at',{ascending:false}).limit(5000),
        supabase.from('accounts').select('id,name,sector,segment,region'),
      ])
      if(e1) throw e1; if(e2) throw e2
      setRows(opps||[]); setAccounts(accs||[])
    } catch(e:any) { setErr(e?.message||'Erreur') }
    finally { setLoading(false) }
  }
  useEffect(()=>{ load() },[])

  // ── Normalize ───────────────────────────────────────────────────────────
  const deals: Deal[] = useMemo(()=>
    (rows||[]).flatMap(r=>{
      const id=String(r?.id||'');if(!id) return []
      const stage=normStage(r?.stage),status=normStatus(r)
      const prob=Math.max(0,Math.min(100,Number(r?.prob??0)||0))
      const amount=Number(r?.amount??0)||0
      const closingYmReal=ymFrom(r?.booking_month)??ymFrom(r?.closing_month)??ymFrom(r?.closing_date)??ymFrom(r?.closing)??null
      const createdYm=ymFrom(r?.created_at)??null
      const closingYm=closingYmReal||createdYm||`${year}-01`
      const createdDate=r?.created_at?String(r.created_at).slice(0,10):null
      const closingDate=r?.closing_date?String(r.closing_date).slice(0,10):null
      const daysOld=createdDate?daysBetween(createdDate,todayStr):0
      const isMulti=Boolean(r?.multi_bu)||(Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0)||String(r?.bu||'').toUpperCase()==='MULTI'
      const lines:NormLine[]=[]
      if(isMulti&&Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0)
        for(const x of r.bu_lines){const sbu=normSBU(x?.bu);lines.push({sbu,group:buGroup(sbu),card:String(x?.card||x?.vendor||r?.vendor||'—').trim()||'—',amount:Number(x?.amount??0)||0})}
      else{const sbu=normSBU(r?.bu);lines.push({sbu,group:buGroup(sbu),card:String(r?.vendor||r?.card||'—').trim()||'—',amount})}
      if(!lines.length){const sbu=normSBU(r?.bu||'Other');lines.push({sbu,group:buGroup(sbu),card:'—',amount})}
      return [{id,account_id:r?.account_id?String(r.account_id):null,
        account_name:String(r?.accounts?.name||r?.account_name||'—'),
        title:String(r?.title||r?.name||'—'),
        stage,status,prob,amount,closingYm,closingYmReal,createdYm,createdDate,closingDate,
        missingClosing:!closingYmReal,missingNextStep:!String(r?.next_step||'').trim(),
        isMulti,lines,daysOld,raw:r}]
    })
  ,[rows,year,todayStr])

  // ── Period base ──────────────────────────────────────────────────────────
  const inPeriod = useMemo(()=>{
    if(view==='range'&&dateFrom&&dateTo){
      return deals.filter(d=>{
        if(d.closingDate) return d.closingDate>=dateFrom&&d.closingDate<=dateTo
        return new Set(periodMonths).has(d.closingYm)
      })
    }
    const s=new Set(periodMonths)
    return deals.filter(d=>s.has(d.closingYm))
  },[deals,periodMonths,view,dateFrom,dateTo])

  const inPrevPeriod = useMemo(()=>{const s=new Set(prevPeriodMonths);return deals.filter(d=>s.has(d.closingYm))},[deals,prevPeriodMonths])

  // ── Apply content filters ────────────────────────────────────────────────
  const applyFilters = useCallback((list:Deal[])=>{
    let d=list
    if(stageFilters.size>0)  d=d.filter(x=>stageFilters.has(x.stage))
    if(statusFilter.size>0)  d=d.filter(x=>statusFilter.has(x.status))
    if(buFilters.size>0)     d=d.filter(x=>x.lines.some(ln=>buFilters.has(ln.group)||buFilters.has(String(ln.sbu))))
    return d
  },[stageFilters,statusFilter,buFilters])

  const filtered  = useMemo(()=>applyFilters(inPeriod),[inPeriod,applyFilters])
  // For charts: apply stage+BU but not status (separate open/won/lost)
  const chartBase = useMemo(()=>{
    let d=inPeriod
    if(stageFilters.size>0) d=d.filter(x=>stageFilters.has(x.stage))
    if(buFilters.size>0)    d=d.filter(x=>x.lines.some(ln=>buFilters.has(ln.group)||buFilters.has(String(ln.sbu))))
    return d
  },[inPeriod,stageFilters,buFilters])

  const openDeals = useMemo(()=>chartBase.filter(d=>d.status==='Open'),[chartBase])
  const wonDeals  = useMemo(()=>chartBase.filter(d=>d.status==='Won'), [chartBase])
  const lostDeals = useMemo(()=>chartBase.filter(d=>d.status==='Lost'),[chartBase])
  const prevOpen  = useMemo(()=>inPrevPeriod.filter(d=>d.status==='Open'),[inPrevPeriod])
  const prevWon   = useMemo(()=>inPrevPeriod.filter(d=>d.status==='Won'), [inPrevPeriod])
  const scopeDeals= useMemo(()=>statusFilter.size>0?filtered:chartBase.filter(d=>d.status==='Open'||d.status==='Won'),[filtered,chartBase,statusFilter])

  const mv = (a:number,c:number) => (metric==='amount'?a:c)

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(()=>{
    const pipeAmt=openDeals.reduce((s,d)=>s+d.amount,0)
    const foreAmt=openDeals.reduce((s,d)=>s+d.amount*(d.prob/100),0)
    const commitD=openDeals.filter(d=>d.stage.toLowerCase()==='commit')
    const commitAmt=commitD.reduce((s,d)=>s+d.amount,0)
    const wonAmt=wonDeals.reduce((s,d)=>s+d.amount,0)
    const lostAmt=lostDeals.reduce((s,d)=>s+d.amount,0)
    const winRate=wonDeals.length+lostDeals.length>0?Math.round(wonDeals.length/(wonDeals.length+lostDeals.length)*100):0
    const annualWon=deals.filter(d=>d.status==='Won'&&d.closingYm.startsWith(String(year))).reduce((s,d)=>s+d.amount,0)
    const prevPipeAmt=prevOpen.reduce((s,d)=>s+d.amount,0)
    const prevWonAmt=prevWon.reduce((s,d)=>s+d.amount,0)
    return {
      pipeAmt,pipeCount:openDeals.length,foreAmt,foreCount:openDeals.filter(d=>d.prob>0).length,
      commitAmt,commitCount:commitD.length,wonAmt,wonCount:wonDeals.length,
      lostAmt,lostCount:lostDeals.length,winRate,
      avgDeal:openDeals.length>0?Math.round(pipeAmt/openDeals.length):0,
      conf:pipeAmt>0?Math.round(foreAmt/pipeAmt*100):0,
      annualWon,annualCoverage:Math.min(100,Math.round(annualWon/ANNUAL_TARGET*100)),
      pipeVsPrev:prevPipeAmt>0?Math.round((pipeAmt-prevPipeAmt)/prevPipeAmt*100):null,
      wonVsPrev: prevWonAmt>0?Math.round((wonAmt-prevWonAmt)/prevWonAmt*100):null,
    }
  },[openDeals,wonDeals,lostDeals,prevOpen,prevWon,deals,year])

  const quality = useMemo(()=>({
    missingAmt:   openDeals.filter(d=>d.amount<=0).length,
    missingClose: openDeals.filter(d=>d.missingClosing).length,
    missingStep:  openDeals.filter(d=>d.missingNextStep).length,
    stale60:      openDeals.filter(d=>d.daysOld>=60&&d.daysOld<90).length,
    stale90:      openDeals.filter(d=>d.daysOld>=90).length,
  }),[openDeals])

  // ── Chart data ───────────────────────────────────────────────────────────
  const donut = useMemo(()=>{
    const d=[
      {name:'Won', value:mv(wonDeals.reduce((s,d)=>s+d.amount,0),wonDeals.length),  color:C.won},
      {name:'Open',value:mv(openDeals.reduce((s,d)=>s+d.amount,0),openDeals.length),color:C.pipeline},
      {name:'Lost',value:mv(lostDeals.reduce((s,d)=>s+d.amount,0),lostDeals.length),color:C.lost},
    ]
    return{d,total:d.reduce((s,x)=>s+x.value,0)}
  },[openDeals,wonDeals,lostDeals,metric])

  const mixBU = useMemo(()=>{
    let csgA=0,cirsA=0,csgC=0,cirsC=0
    for(const d of openDeals){
      if(metric==='count'){const sc=d.lines.filter(x=>x.group==='CSG').reduce((s,x)=>s+x.amount,0);const si=d.lines.filter(x=>x.group==='CIRS').reduce((s,x)=>s+x.amount,0);if(sc>=si)csgC++;else cirsC++}
      else{for(const ln of d.lines){if(ln.group==='CSG')csgA+=ln.amount;else cirsA+=ln.amount}}
    }
    const data=[{name:'CIRS',value:mv(cirsA,cirsC),color:C.cirs},{name:'CSG',value:mv(csgA,csgC),color:C.csg}]
    return{data,total:data.reduce((s,x)=>s+x.value,0)}
  },[openDeals,metric])

  const byStage = useMemo(()=>{
    const map=new Map<string,{stage:string;total:number}>()
    for(const d of openDeals){const cur=map.get(d.stage)||{stage:d.stage,total:0};cur.total+=metric==='amount'?d.amount:1;map.set(d.stage,cur)}
    return[...map.values()].sort((a,b)=>{const i=(s:string)=>{const x=ALL_STAGES.findIndex(v=>v.toLowerCase()===s.toLowerCase());return x>=0?x:999};return i(a.stage)-i(b.stage)})
  },[openDeals,metric])

  const bySBU = useMemo(()=>{
    const map=new Map<string,{sbu:string;total:number;forecast:number;won:number}>()
    for(const d of openDeals) for(const ln of d.lines){const sbu=String(ln.sbu);const cur=map.get(sbu)||{sbu,total:0,forecast:0,won:0};if(metric==='count'){cur.total++;cur.forecast++}else{cur.total+=ln.amount;cur.forecast+=ln.amount*(d.prob/100)};map.set(sbu,cur)}
    for(const d of wonDeals) for(const ln of d.lines){const sbu=String(ln.sbu);const cur=map.get(sbu)||{sbu,total:0,forecast:0,won:0};cur.won+=metric==='amount'?ln.amount:1;map.set(sbu,cur)}
    return[...map.values()].sort((a,b)=>{const i=(s:string)=>{const x=SBU_ORDER.findIndex(v=>v.toUpperCase()===s.toUpperCase());return x>=0?x:100};return i(a.sbu)-i(b.sbu)})
  },[openDeals,wonDeals,metric])

  const trend = useMemo(()=>monthsOfYear(year).map((m,i)=>{
    const base=deals.filter(d=>d.closingYm.startsWith(`${year}-`))
    const inM=base.filter(d=>d.closingYm===m);const open=inM.filter(d=>d.status==='Open');const won=inM.filter(d=>d.status==='Won')
    const mv2=(a:number,c:number)=>metric==='amount'?a:c
    return{month:MONTHS_FR[i],total:mv2(open.reduce((s,d)=>s+d.amount,0),open.length),forecast:mv2(open.reduce((s,d)=>s+d.amount*(d.prob/100),0),open.filter(d=>d.prob>0).length),commit:mv2(open.filter(d=>d.stage.toLowerCase()==='commit').reduce((s,d)=>s+d.amount,0),open.filter(d=>d.stage.toLowerCase()==='commit').length),won:mv2(won.reduce((s,d)=>s+d.amount,0),won.length)}
  }),[deals,year,metric])

  // ── NEW: Funnel de conversion ────────────────────────────────────────────
  const funnelData = useMemo(()=>{
    const stages=['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit']
    return stages.map(stage=>{
      const d=openDeals.filter(x=>x.stage===stage)
      return{stage,value:metric==='amount'?d.reduce((s,x)=>s+x.amount,0):d.length,count:d.length}
    }).filter(x=>x.value>0)
  },[openDeals,metric])

  // ── NEW: Scatter (Montant vs Probabilité) ────────────────────────────────
  const scatterData = useMemo(()=>openDeals.filter(d=>d.amount>0&&d.prob>0).map(d=>{
    const best=[...d.lines].sort((a,b)=>b.amount-a.amount)[0]
    return{x:d.prob,y:d.amount/1000,z:Math.min(d.amount/50000+4,20),name:d.account_name,sbu:String(best?.sbu||'Other'),stage:d.stage,title:d.title}
  }),[openDeals])
  const scatterBySBU = useMemo(()=>{
    const map=new Map<string,typeof scatterData>()
    for(const p of scatterData){const arr=map.get(p.sbu)||[];arr.push(p);map.set(p.sbu,arr)}
    return[...map.entries()]
  },[scatterData])

  // ── NEW: Forecast Accuracy ───────────────────────────────────────────────
  const forecastAccuracy = useMemo(()=>MONTHS_FR.map((label,i)=>{
    const m=`${year}-${String(i+1).padStart(2,'0')}`
    const inM=deals.filter(d=>d.closingYm===m)
    const openM=inM.filter(d=>d.status==='Open'),wonM=inM.filter(d=>d.status==='Won')
    const forecast=openM.reduce((s,d)=>s+d.amount*(d.prob/100),0)
    const won=wonM.reduce((s,d)=>s+d.amount,0)
    const accuracy=forecast>0?Math.min(150,Math.round(won/forecast*100)):null
    return{month:label,forecast:Math.round(forecast/1000),won:Math.round(won/1000),accuracy}
  }),[deals,year])

  // ── Top charts ───────────────────────────────────────────────────────────
  const topClients = useMemo(()=>{
    const map=new Map<string,{client:string;csg:number;cirs:number;total:number;deals:number}>()
    for(const d of scopeDeals){const key=d.account_name;const cur=map.get(key)||{client:key,csg:0,cirs:0,total:0,deals:0};if(metric==='count'){cur.total++;cur.deals++}else{for(const ln of d.lines){if(ln.group==='CSG')cur.csg+=ln.amount;else cur.cirs+=ln.amount};cur.total=cur.csg+cur.cirs;cur.deals++};map.set(key,cur)}
    return[...map.values()].sort((a,b)=>b.total-a.total).slice(0,5)
  },[scopeDeals,metric])

  const topVendors = useMemo(()=>{
    const map=new Map<string,{card:string;total:number}>()
    for(const d of scopeDeals) for(const ln of d.lines){const card=(ln.card||'—').trim()||'—';const cur=map.get(card)||{card,total:0};cur.total+=metric==='amount'?ln.amount:1;map.set(card,cur)}
    const arr=[...map.values()].sort((a,b)=>b.total-a.total).slice(0,8);const grand=arr.reduce((s,x)=>s+x.total,0)
    return arr.map(x=>({...x,pct:pct(x.total,grand)}))
  },[scopeDeals,metric])

  const byRegion = useMemo(()=>{
    const map=new Map<string,{region:string;total:number;count:number}>()
    for(const d of scopeDeals){const acc=accounts.find(a=>a.id===d.account_id);const region=acc?.region||d.raw?.accounts?.region||'Non renseigné';const cur=map.get(region)||{region,total:0,count:0};cur.total+=metric==='amount'?d.amount:1;cur.count++;map.set(region,cur)}
    return[...map.values()].sort((a,b)=>b.total-a.total)
  },[scopeDeals,accounts,metric])

  const bySector = useMemo(()=>{
    const map=new Map<string,{sector:string;total:number;count:number}>()
    for(const d of scopeDeals){const acc=accounts.find(a=>a.id===d.account_id);const sector=acc?.segment||d.raw?.accounts?.segment||'Non renseigné';const cur=map.get(sector)||{sector,total:0,count:0};cur.total+=metric==='amount'?d.amount:1;cur.count++;map.set(sector,cur)}
    return[...map.values()].sort((a,b)=>b.total-a.total).slice(0,8)
  },[scopeDeals,accounts,metric])

  const buScorecard = useMemo(()=>{
    const map=new Map<string,{pipeline:number;forecast:number;won:number;lost:number;count:number;wonCount:number;lostCount:number}>()
    const add=(sbu:string,amount:number,prob:number,status:'Open'|'Won'|'Lost')=>{
      const cur=map.get(sbu)||{pipeline:0,forecast:0,won:0,lost:0,count:0,wonCount:0,lostCount:0}
      if(status==='Open'){cur.pipeline+=amount;cur.forecast+=amount*(prob/100);cur.count++}
      if(status==='Won'){cur.won+=amount;cur.wonCount++}
      if(status==='Lost'){cur.lost+=amount;cur.lostCount++}
      map.set(sbu,cur)
    }
    for(const d of chartBase) for(const ln of d.lines) add(String(ln.sbu),ln.amount,d.prob,d.status)
    return[...map.entries()].map(([sbu,x])=>({sbu,...x,winRate:x.wonCount+x.lostCount>0?Math.round(x.wonCount/(x.wonCount+x.lostCount)*100):0,avgSize:x.count>0?Math.round(x.pipeline/x.count):0})).sort((a,b)=>b.pipeline-a.pipeline)
  },[chartBase])

  const late      = useMemo(()=>openDeals.filter(d=>d.closingYmReal&&d.closingYmReal<periodMonths[0]).sort((a,b)=>b.amount-a.amount).slice(0,15),[openDeals,periodMonths])
  const staleDeals= useMemo(()=>openDeals.filter(d=>d.daysOld>=60).sort((a,b)=>b.daysOld-a.daysOld).slice(0,10),[openDeals])
  const topOpen   = useMemo(()=>[...openDeals].sort((a,b)=>b.amount-a.amount).slice(0,12),[openDeals])
  const topWon    = useMemo(()=>[...wonDeals].sort((a,b)=>b.amount-a.amount).slice(0,12),[wonDeals])

  const sortedDeals = useMemo(()=>{
    const best=(d:Deal)=>[...d.lines].sort((a,b)=>b.amount-a.amount)[0]
    return[...filtered].sort((a,b)=>{
      const dir=sortDir==='asc'?1:-1;let va:any='',vb:any=''
      switch(sortKey){
        case 'account':va=a.account_name;vb=b.account_name;break;case 'stage':va=a.stage;vb=b.stage;break
        case 'sbu':va=String(best(a)?.sbu);vb=String(best(b)?.sbu);break;case 'card':va=best(a)?.card;vb=best(b)?.card;break
        case 'prob':va=a.prob;vb=b.prob;break;case 'closing':va=a.closingYmReal||a.closingYm;vb=b.closingYmReal||b.closingYm;break
        default:va=a.amount;vb=b.amount
      }
      if(typeof va==='number'&&typeof vb==='number') return dir*(va-vb)
      return dir*String(va).localeCompare(String(vb))
    })
  },[filtered,sortKey,sortDir])

  const Th=({col,label,right}:{col:typeof sortKey;label:string;right?:boolean})=>{
    const active=sortKey===col
    return (
      <th onClick={()=>{if(!active){setSortKey(col);setSortDir('desc')}else setSortDir(d=>d==='desc'?'asc':'desc')}}
        className={`px-4 py-3 text-xs font-semibold cursor-pointer select-none whitespace-nowrap transition-colors
          ${right?'text-right':'text-left'} ${active?'text-slate-900':'text-slate-400 hover:text-slate-600'}`}>
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
              <p className="text-xs text-slate-500">{periodLabel} · {inPeriod.length} deals{activeFilterCount>0?` · ${filtered.length} filtrés`:''}</p>
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
              items={[{id:'year',label:'Année'},{id:'quarter',label:'Trim.'},{id:'month',label:'Mois'},{id:'range',label:'📅 Plage'}]}/>
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
            <SegBtn value={metric} onChange={v=>setMetric(v as MetricMode)}
              items={[{id:'amount',label:'Montant'},{id:'count',label:'Nombre'}]}/>
            <button type="button" onClick={()=>setShowFilters(v=>!v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition-all
                ${showFilters||activeFilterCount>0?'border-blue-400 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <SlidersHorizontal className="h-4 w-4"/>Filtres
              {activeFilterCount>0&&<span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">{activeFilterCount}</span>}
            </button>
            <button onClick={load} disabled={loading} type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>{loading?'Chargement…':'Actualiser'}
            </button>
          </div>
        </div>

        {/* ══ DATE RANGE ══ */}
        {view==='range'&&(
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0"/>
            <span className="text-sm font-semibold text-blue-800">Plage personnalisée :</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Du</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              <span className="text-xs font-medium text-slate-600">au</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <span className="text-xs text-blue-600 font-semibold">→ {periodMonths.length} mois · {inPeriod.length} deals</span>
          </div>
        )}

        {/* ══ FILTERS PANEL ══ */}
        {showFilters&&(
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500"/>
                <span className="text-sm font-bold text-slate-900">Filtres avancés</span>
                {activeFilterCount>0&&<span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{activeFilterCount} actifs</span>}
              </div>
              {activeFilterCount>0&&(
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700">
                  <X className="h-3.5 w-3.5"/>Réinitialiser tout
                </button>
              )}
            </div>
            <div className="p-5 space-y-5">
              {/* Stage */}
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Étape du deal</span>
                  {stageFilters.size>0&&<button onClick={()=>setStageFilters(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Tout désélectionner</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_STAGES.map(s=>{
                    const cfg=STAGE_CFG[s]||STAGE_CFG.Lead
                    return (
                      <button key={s} type="button" onClick={()=>toggleSet(setStageFilters,s)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border
                          ${stageFilters.has(s)?`${cfg.bg} ${cfg.text} border-current ring-1 ring-current/40`:`border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}/>{s}
                        {stageFilters.has(s)&&<CheckCircle2 className="h-3 w-3 ml-0.5"/>}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Status */}
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Statut</span>
                  {statusFilter.size>0&&<button onClick={()=>setStatusFilter(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Tout désélectionner</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {id:'Open',bg:'bg-blue-50',text:'text-blue-700',dot:'bg-blue-400'},
                    {id:'Won', bg:'bg-emerald-50',text:'text-emerald-700',dot:'bg-emerald-500'},
                    {id:'Lost',bg:'bg-red-50',text:'text-red-600',dot:'bg-red-400'},
                  ].map(s=>(
                    <button key={s.id} type="button" onClick={()=>toggleSet(setStatusFilter,s.id)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all border
                        ${statusFilter.has(s.id)?`${s.bg} ${s.text} border-current ring-1 ring-current/40`:'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <span className={`h-2 w-2 rounded-full ${s.dot}`}/>{s.id}
                      {statusFilter.has(s.id)&&<CheckCircle2 className="h-3.5 w-3.5"/>}
                    </button>
                  ))}
                </div>
              </div>
              {/* BU */}
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Business Unit</span>
                  {buFilters.size>0&&<button onClick={()=>setBuFilters(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Tout désélectionner</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {['CSG','CIRS'].map(g=>(
                    <button key={g} type="button" onClick={()=>toggleSet(setBuFilters,g)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all border
                        ${buFilters.has(g)?'bg-slate-900 text-white border-slate-900':'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                      {g}{buFilters.has(g)&&<CheckCircle2 className="h-3 w-3"/>}
                    </button>
                  ))}
                  <span className="self-center text-slate-300 text-xs">|</span>
                  {Object.entries(SBU_COLORS).filter(([k])=>!['MULTI','Other'].includes(k)).map(([sbu,color])=>(
                    <button key={sbu} type="button" onClick={()=>toggleSet(setBuFilters,sbu)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border
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
                  Filtre actif : {[stageFilters.size>0?`Stages: ${[...stageFilters].join(', ')}`:null,statusFilter.size>0?`Status: ${[...statusFilter].join(', ')}`:null,buFilters.size>0?`BU: ${[...buFilters].join(', ')}`:null].filter(Boolean).join(' · ')}
                  {' '}→ <strong>{filtered.length} deals</strong> sur {inPeriod.length}
                </div>
              )}
            </div>
          </div>
        )}

        {err&&<div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0"/>{err}</div>}

        {/* ══ OBJECTIF ══ */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 text-white shadow-md"><Trophy className="h-5 w-5"/></div>
              <div><div className="text-sm font-black text-slate-900">Objectif annuel {year} — Won</div><div className="text-xs text-slate-500">Cible : 30 000 000 MAD</div></div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right"><div className="text-2xl font-black text-emerald-700">{fmt(kpis.annualWon)} MAD</div><div className="text-xs text-slate-500">Won cumulé {year}</div></div>
              <div className="text-right"><div className="text-xl font-black text-slate-900">{kpis.annualCoverage}%</div><div className="text-xs text-slate-500">de l'objectif</div></div>
              <div className="text-right"><div className="text-lg font-bold text-slate-700">{fmt(Math.max(0,ANNUAL_TARGET-kpis.annualWon))} MAD</div><div className="text-xs text-slate-500">restant</div></div>
            </div>
          </div>
          <div className="px-6 pb-4">
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${kpis.annualCoverage>=100?'bg-emerald-500':kpis.annualCoverage>=70?'bg-amber-400':'bg-blue-500'}`} style={{width:`${kpis.annualCoverage}%`}}/>
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400 font-medium">
              <span>0</span><span>7.5M Q1</span><span>15M Q2</span><span>22.5M Q3</span><span>30M</span>
            </div>
          </div>
        </div>

        {/* ══ KPIs ══ */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Pipeline actif" color="blue" icon={<TrendingUp className="h-5 w-5"/>} value={metric==='amount'?fmt(kpis.pipeAmt)+' MAD':String(kpis.pipeCount)} sub={`${kpis.pipeCount} deals`} delta={kpis.pipeVsPrev!==null?(kpis.pipeVsPrev>=0?'up':'down'):undefined} deltaLabel={kpis.pipeVsPrev!==null?`${kpis.pipeVsPrev>0?'+':''}${kpis.pipeVsPrev}%`:undefined}/>
          <KpiCard label="Forecast pondéré" color="violet" icon={<Target className="h-5 w-5"/>} value={metric==='amount'?fmt(kpis.foreAmt)+' MAD':String(kpis.foreCount)} sub={`Confiance ${kpis.conf}%`}/>
          <KpiCard label="En Commit" color="amber" icon={<Zap className="h-5 w-5"/>} value={metric==='amount'?fmt(kpis.commitAmt)+' MAD':String(kpis.commitCount)} sub={`${kpis.commitCount} deals`}/>
          <KpiCard label="Won (période)" color="green" icon={<Award className="h-5 w-5"/>} value={metric==='amount'?fmt(kpis.wonAmt)+' MAD':String(kpis.wonCount)} sub={`${kpis.wonCount} clôturés`} delta={kpis.wonVsPrev!==null?(kpis.wonVsPrev>=0?'up':'down'):undefined} deltaLabel={kpis.wonVsPrev!==null?`${kpis.wonVsPrev>0?'+':''}${kpis.wonVsPrev}%`:undefined}/>
          <KpiCard label="Win Rate" color="slate" icon={<CheckCircle2 className="h-5 w-5"/>} value={`${kpis.winRate}%`} sub={`${kpis.wonCount}W / ${kpis.wonCount+kpis.lostCount} clôturés`}/>
          <KpiCard label="Taille moy." color="slate" icon={<BarChart2 className="h-5 w-5"/>} value={fmt(kpis.avgDeal)+' MAD'} sub="Deal Open moyen"/>
        </div>

        {/* ══ ALERTES ══ */}
        {(quality.missingAmt+quality.missingClose+quality.missingStep+quality.stale90)>0&&(
          <div className="flex flex-wrap gap-2">
            {quality.missingAmt>0&&<div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><AlertTriangle className="h-3.5 w-3.5"/>{quality.missingAmt} deals sans montant</div>}
            {quality.missingClose>0&&<div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700"><Calendar className="h-3.5 w-3.5"/>{quality.missingClose} sans closing</div>}
            {quality.missingStep>0&&<div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"><Info className="h-3.5 w-3.5"/>{quality.missingStep} sans next step</div>}
            {quality.stale60>0&&<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><Clock className="h-3.5 w-3.5"/>{quality.stale60} deals ≥60j</div>}
            {quality.stale90>0&&<div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"><Flame className="h-3.5 w-3.5 text-red-500"/>{quality.stale90} deals ≥90j — À relancer !</div>}
          </div>
        )}

        {/* ══ ROW: Donuts + Stages ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel title="Répartition statuts" sub={`${metric==='amount'?'Montant':'Nb'} · Période`}>
            {donut.total<=0?<Empty/>:(
              <>
                <div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={donut.d} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3}>{donut.d.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/></PieChart></ResponsiveContainer></div>
                <div className="mt-3 flex justify-around">{donut.d.map(e=><div key={e.name} className="text-center"><div className="text-lg font-black text-slate-900">{metric==='amount'?fmt(e.value):e.value}</div><div className="flex items-center gap-1 justify-center text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{background:e.color}}/>{e.name}</div><div className="text-xs font-semibold text-slate-400">{pct(e.value,donut.total)}%</div></div>)}</div>
              </>
            )}
          </Panel>
          <Panel title="Mix CSG vs CIRS" sub="Open · répartition BU">
            {mixBU.total<=0?<Empty/>:(
              <>
                <div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={mixBU.data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3}>{mixBU.data.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/></PieChart></ResponsiveContainer></div>
                <div className="mt-3 flex justify-around">{mixBU.data.map(e=><div key={e.name} className="text-center"><div className="text-2xl font-black text-slate-900">{pct(e.value,mixBU.total)}%</div><div className="flex items-center gap-1 justify-center text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{background:e.color}}/>{e.name}</div><div className="text-xs text-slate-400">{metric==='amount'?fmt(e.value)+' MAD':e.value}</div></div>)}</div>
              </>
            )}
          </Panel>
          <Panel title="Pipeline par étape" sub={`Open · ${metric==='amount'?'MAD':'Nb'}`}>
            {byStage.length===0?<Empty/>:(
              <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={byStage} layout="vertical" margin={{top:0,right:44,bottom:0,left:0}}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={fmt}/><YAxis type="category" dataKey="stage" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} width={108}/><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/><Bar dataKey="total" name="Total" radius={[0,4,4,0]}>{byStage.map((e,i)=><Cell key={i} fill={STAGE_CFG[e.stage]?.bar||'#94a3b8'}/>)}<LabelList dataKey="total" position="right" formatter={(v:any)=>fmt(v)} style={{fontSize:9,fill:'#94a3b8'}}/></Bar></BarChart></ResponsiveContainer></div>
            )}
          </Panel>
        </div>

        {/* ══ NEW: FUNNEL DE CONVERSION ══ */}
        <Panel title="🔽 Funnel de Conversion" sub="Open · de Lead à Commit · taux de conversion entre étapes (↓XX% = passent à l'étape suivante)">
          <FunnelConversion data={funnelData} isAmt={metric==='amount'}/>
          {funnelData.length===0&&<Empty/>}
        </Panel>

        {/* ══ SCORECARD BU ══ */}
        <Panel title="📊 Scorecard par BU" sub={`${periodLabel} · Pipeline / Forecast / Won / Win Rate`}>
          <div className="overflow-auto -mx-5 px-5">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="border-b border-slate-100 text-xs font-semibold text-slate-400"><th className="pb-2.5 text-left">BU</th><th className="pb-2.5 text-right">Pipeline</th><th className="pb-2.5 text-right">Forecast</th><th className="pb-2.5 text-right">Won</th><th className="pb-2.5 text-right">Lost</th><th className="pb-2.5 text-right">Win Rate</th><th className="pb-2.5 text-right">Taille moy.</th><th className="pb-2.5 text-right">Deals</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {buScorecard.map(row=>(
                  <tr key={row.sbu} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 pr-4"><span className="inline-flex items-center gap-2 font-bold text-slate-800"><span className="h-2.5 w-2.5 rounded-full" style={{background:SBU_COLORS[row.sbu]||'#94a3b8'}}/>{row.sbu}</span></td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmt(row.pipeline)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{fmt(row.forecast)}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmt(row.won)}</td>
                    <td className="py-2.5 text-right tabular-nums text-red-500">{fmt(row.lost)}</td>
                    <td className="py-2.5 text-right"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${row.winRate>=60?'bg-emerald-100 text-emerald-700':row.winRate>=30?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}`}>{row.winRate}%</span></td>
                    <td className="py-2.5 text-right tabular-nums text-slate-500 text-xs">{fmt(row.avgSize)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.count}</td>
                  </tr>
                ))}
                {!buScorecard.length&&<tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">Aucune donnée</td></tr>}
              </tbody>
              {buScorecard.length>0&&(
                <tfoot className="border-t-2 border-slate-200">
                  <tr className="text-xs font-bold text-slate-700">
                    <td className="pt-2 text-slate-900">TOTAL</td>
                    <td className="pt-2 text-right tabular-nums text-slate-900">{fmt(buScorecard.reduce((s,x)=>s+x.pipeline,0))}</td>
                    <td className="pt-2 text-right tabular-nums">{fmt(buScorecard.reduce((s,x)=>s+x.forecast,0))}</td>
                    <td className="pt-2 text-right tabular-nums text-emerald-700">{fmt(buScorecard.reduce((s,x)=>s+x.won,0))}</td>
                    <td className="pt-2 text-right tabular-nums text-red-500">{fmt(buScorecard.reduce((s,x)=>s+x.lost,0))}</td>
                    <td className="pt-2 text-right">—</td><td className="pt-2 text-right">—</td>
                    <td className="pt-2 text-right tabular-nums">{buScorecard.reduce((s,x)=>s+x.count,0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Panel>

        {/* ══ ROW: BU + Tendance ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Pipeline par BU" sub="Open · Total vs Forecast vs Won">
            {bySBU.length===0?<Empty/>:(
              <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={bySBU} margin={{top:5,right:10,bottom:5,left:0}} barGap={2}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="sbu" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={48} tickFormatter={fmt}/><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/><Bar name="Total Open" dataKey="total" fill="#1e293b" radius={[4,4,0,0]}/><Bar name="Forecast" dataKey="forecast" fill="#3b82f6" radius={[4,4,0,0]}/><Bar name="Won" dataKey="won" fill="#10b981" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
            )}
          </Panel>
          <Panel title={`Tendance ${year}`} sub="Total Open / Forecast / Commit / Won">
            <div className="h-64"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trend} margin={{top:5,right:10,bottom:5,left:0}}><CartesianGrid stroke={C.grid} strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={48} tickFormatter={fmt}/><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/><Area type="monotone" dataKey="total" name="Total Open" fill="#dbeafe" stroke={C.csg} strokeWidth={2} fillOpacity={0.3} dot={false}/><Line type="monotone" dataKey="forecast" name="Forecast" stroke={C.pipeline} strokeWidth={2} dot={false} strokeDasharray="5 3"/><Line type="monotone" dataKey="commit" name="Commit" stroke={C.commit} strokeWidth={2} dot={false}/><Line type="monotone" dataKey="won" name="Won" stroke={C.won} strokeWidth={2.5} dot={false}/></ComposedChart></ResponsiveContainer></div>
          </Panel>
        </div>

        {/* ══ NEW: FORECAST ACCURACY ══ */}
        <Panel title="📈 Forecast Accuracy" sub={`${year} · Forecast probabilisé vs Won réalisé (K MAD) · ligne = précision %`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastAccuracy} margin={{top:5,right:30,bottom:5,left:0}}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3"/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="l" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={48}/>
                <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={36} unit="%"/>
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-xs min-w-[160px]">
                      <div className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{label}</div>
                      {payload.map((p:any,i:number)=>(
                        <div key={i} className="flex items-center justify-between gap-3 mt-1">
                          <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{background:p.color}}/>{p.name}</span>
                          <span className="font-bold text-slate-900">{p.dataKey==='accuracy'?`${p.value||'—'}%`:`${p.value||0}K`}</span>
                        </div>
                      ))}
                    </div>
                  )
                }}/>
                <ReferenceLine yAxisId="r" y={100} stroke="#16a34a" strokeDasharray="4 2" strokeWidth={1.5}/>
                <Bar yAxisId="l" name="Forecast (K)" dataKey="forecast" fill="#818cf8" radius={[4,4,0,0]} fillOpacity={0.7}/>
                <Bar yAxisId="l" name="Won réalisé (K)" dataKey="won" fill="#10b981" radius={[4,4,0,0]}/>
                <Line yAxisId="r" type="monotone" dataKey="accuracy" name="Précision %" stroke="#f59e0b" strokeWidth={2.5} dot={{r:3,fill:'#f59e0b'}} connectNulls={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-slate-400">Ligne verte = 100% (Forecast = Réalisé). Au-dessus = deal sous-estimé. En-dessous = surestimé.</div>
        </Panel>

        {/* ══ NEW: SCATTER PLOT ══ */}
        {scatterData.length>0&&(
          <Panel title="🎯 Matrice Deals — Montant vs Probabilité" sub="Open · chaque bulle = 1 deal · couleur = BU · taille = montant">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{top:10,right:20,bottom:30,left:0}}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 3"/>
                  <XAxis type="number" dataKey="x" name="Probabilité" unit="%" domain={[0,100]} tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} label={{value:'Probabilité (%)',position:'insideBottom',offset:-15,fontSize:10,fill:'#94a3b8'}}/>
                  <YAxis type="number" dataKey="y" name="Montant" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={48} label={{value:'Montant (K MAD)',angle:-90,position:'insideLeft',fontSize:10,fill:'#94a3b8'}}/>
                  <ZAxis type="number" dataKey="z" range={[30,200]}/>
                  <ReferenceLine x={50} stroke="#e2e8f0" strokeWidth={1}/>
                  <Tooltip cursor={{strokeDasharray:'3 3'}} content={({active,payload})=>{
                    if(!active||!payload?.length) return null
                    const d=payload[0]?.payload
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-xs max-w-[220px]">
                        <div className="font-bold text-slate-900 mb-1">{d?.name}</div>
                        <div className="text-slate-500 truncate mb-1.5">{d?.title}</div>
                        <div className="flex items-center gap-1.5 mb-1.5"><span className="h-2 w-2 rounded-full" style={{background:SBU_COLORS[d?.sbu]||'#94a3b8'}}/><span className="font-semibold text-slate-700">{d?.sbu}</span></div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="text-slate-500">Prob</div><div className="font-bold">{d?.x}%</div>
                          <div className="text-slate-500">Montant</div><div className="font-bold">{fmt(d?.y*1000)} MAD</div>
                          <div className="text-slate-500">Étape</div><div className="font-bold">{d?.stage}</div>
                        </div>
                      </div>
                    )
                  }}/>
                  {scatterBySBU.map(([sbu,points])=>(
                    <Scatter key={sbu} name={sbu} data={points} fill={SBU_COLORS[sbu]||'#94a3b8'} fillOpacity={0.8}/>
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {scatterBySBU.map(([sbu])=>(
                <span key={sbu} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{background:SBU_COLORS[sbu]||'#94a3b8'}}/>{sbu} ({scatterData.filter(d=>d.sbu===sbu).length})
                </span>
              ))}
            </div>
            <div className="mt-1.5 text-xs text-slate-400">💡 En haut à droite = montant élevé + probabilité haute → deals prioritaires à accélérer.</div>
          </Panel>
        )}

        {/* ══ Top Clients + Vendors ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Top 5 Clients" sub="CSG vs CIRS">
            {topClients.length===0?<Empty/>:(
              <div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={topClients} margin={{top:5,right:10,bottom:28,left:0}}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="client" tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={42}/><YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={48} tickFormatter={fmt}/><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/><Bar name="CIRS" dataKey="cirs" stackId="a" fill={C.cirs}/><Bar name="CSG" dataKey="csg" stackId="a" fill={C.csg} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
            )}
          </Panel>
          <Panel title="Top Constructeurs / Cartes" sub="">
            {topVendors.length===0?<Empty/>:(
              <div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={topVendors} layout="vertical" margin={{top:0,right:48,bottom:0,left:0}}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={fmt}/><YAxis type="category" dataKey="card" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} width={110}/><Tooltip content={<ChartTip isAmt={metric==='amount'}/>}/><Bar name="Total" dataKey="total" fill="#8b5cf6" radius={[0,4,4,0]}><LabelList dataKey="pct" position="right" formatter={(v:any)=>`${v}%`} style={{fontSize:9,fill:'#94a3b8'}}/></Bar></BarChart></ResponsiveContainer></div>
            )}
          </Panel>
        </div>

        {/* ══ Géo + Secteur ══ */}
        {(byRegion.length>0||bySector.length>0)&&(
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Pipeline par Région" sub="Via comptes associés">
              {byRegion.length===0?<Empty/>:(
                <div className="space-y-2.5">
                  {byRegion.map(x=>(
                    <div key={x.region} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-28 text-xs font-medium text-slate-700 shrink-0"><MapPin className="h-3 w-3 text-slate-400"/>{x.region}</div>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:`${pct(x.total,byRegion[0]?.total||1)*100/100}%`}}/></div>
                      <div className="text-xs font-bold text-slate-700 w-20 text-right tabular-nums">{metric==='amount'?fmt(x.total)+' MAD':x.total}</div>
                      <div className="text-xs text-slate-400 w-12 text-right">{x.count} deals</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Pipeline par Secteur" sub="Via comptes associés">
              {bySector.length===0?<Empty/>:(
                <div className="space-y-2.5">
                  {bySector.map(x=>(
                    <div key={x.sector} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-32 text-xs font-medium text-slate-700 shrink-0 truncate" title={x.sector}><Building2 className="h-3 w-3 text-slate-400 shrink-0"/>{x.sector}</div>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-violet-400" style={{width:`${pct(x.total,bySector[0]?.total||1)*100/100}%`}}/></div>
                      <div className="text-xs font-bold text-slate-700 w-20 text-right tabular-nums">{metric==='amount'?fmt(x.total)+' MAD':x.total}</div>
                      <div className="text-xs text-slate-400 w-12 text-right">{x.count} deals</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ══ Top Open + Won ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="🎯 Top Open Deals" sub="Trié par montant">
            {topOpen.length===0?<Empty/>:(
              <div className="overflow-auto max-h-64 -mx-5 px-5">
                <table className="w-full text-sm min-w-[420px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-xs font-semibold text-slate-400"><th className="pb-2 text-left">Client</th><th className="pb-2 text-left">Deal</th><th className="pb-2 text-left">Étape</th><th className="pb-2 text-right">Montant</th><th className="pb-2 text-right">Prob</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {topOpen.map(d=>(
                      <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs whitespace-nowrap">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[130px] truncate"><Link href={`/opportunities?edit=${d.id}`} className="hover:text-blue-600 hover:underline">{d.title}</Link></td>
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
          <Panel title="🏆 Top Won Deals" sub="Clôturés sur la période">
            {topWon.length===0?(
              <div className="flex h-32 items-center justify-center gap-2 text-sm font-semibold text-emerald-600"><Award className="h-5 w-5"/>Aucun Won pour l'instant</div>
            ):(
              <div className="overflow-auto max-h-64 -mx-5 px-5">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-xs font-semibold text-slate-400"><th className="pb-2 text-left">Client</th><th className="pb-2 text-left">Deal</th><th className="pb-2 text-left">BU</th><th className="pb-2 text-right">Montant</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {topWon.map(d=>{const best=[...d.lines].sort((a,b)=>b.amount-a.amount)[0];return(
                      <tr key={d.id} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs whitespace-nowrap">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[150px] truncate"><Link href={`/opportunities?edit=${d.id}`} className="hover:text-emerald-600 hover:underline">{d.title}</Link></td>
                        <td className="py-2 pr-3"><span className="text-xs font-semibold" style={{color:SBU_COLORS[String(best?.sbu)]||'#64748b'}}>{String(best?.sbu||'—')}</span></td>
                        <td className="py-2 text-right font-black text-emerald-700 tabular-nums text-xs whitespace-nowrap">{fmt(d.amount)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ══ Late + Stale ══ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {late.length>0&&(
            <Panel title="⚠ Retard Booking" sub={`${late.length} deals Open avec closing antérieur`}>
              <div className="overflow-auto max-h-56 -mx-5 px-5">
                <table className="w-full text-sm min-w-[440px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-xs font-semibold text-slate-400"><th className="pb-2 text-left">Client</th><th className="pb-2 text-left">Deal</th><th className="pb-2 text-left">Closing</th><th className="pb-2 text-right">Montant</th></tr></thead>
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
            <Panel title="🔥 Deals Stagnants ≥60j" sub="Open depuis longtemps — à relancer">
              <div className="overflow-auto max-h-56 -mx-5 px-5">
                <table className="w-full text-sm min-w-[440px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-xs font-semibold text-slate-400"><th className="pb-2 text-left">Client</th><th className="pb-2 text-left">Deal</th><th className="pb-2 text-left">Étape</th><th className="pb-2 text-right">Jours</th><th className="pb-2 text-right">Montant</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {staleDeals.map(d=>(
                      <tr key={d.id} className="hover:bg-orange-50/30 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-900 text-xs">{d.account_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[130px] truncate">{d.title}</td>
                        <td className="py-2 pr-3"><StagePill stage={d.stage}/></td>
                        <td className="py-2 text-right"><span className={`text-xs font-bold ${d.daysOld>=90?'text-red-600':d.daysOld>=60?'text-orange-600':'text-amber-600'}`}>{d.daysOld}j</span></td>
                        <td className="py-2 text-right font-bold text-slate-900 tabular-nums text-xs">{fmt(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        {/* ══ LISTE COMPLÈTE ══ */}
        <Panel title="📋 Tous les deals — période"
          sub={`${periodLabel}${activeFilterCount>0?` · filtrés: ${sortedDeals.length}/${inPeriod.length}`:` · ${sortedDeals.length} deals`} · Clic colonne pour trier`}>
          <div className="overflow-auto rounded-xl border border-slate-100 -mx-5">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr><Th col="account" label="Compte"/><th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Deal</th><Th col="stage" label="Étape"/><Th col="sbu" label="BU"/><Th col="card" label="Carte"/><Th col="amount" label="Montant" right/><Th col="prob" label="Prob" right/><Th col="closing" label="Closing"/><th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Statut</th></tr>
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
                        <td className="px-4 py-2.5 max-w-[160px]"><Link href={`/opportunities?edit=${d.id}`} className="block truncate text-xs text-slate-600 hover:text-blue-600 hover:underline" title={d.title}>{d.title}</Link></td>
                        <td className="px-4 py-2.5"><StagePill stage={d.stage}/></td>
                        <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"><span className="h-2 w-2 rounded-full shrink-0" style={{background:SBU_COLORS[mainSbu]||'#94a3b8'}}/>{mainSbu}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[110px] truncate">{mainCard}</td>
                        <td className="px-4 py-2.5 font-black text-slate-900 tabular-nums text-right text-xs whitespace-nowrap">{mad(d.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-right text-xs">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1.5 w-10 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${d.prob>=80?'bg-emerald-500':d.prob>=60?'bg-amber-400':'bg-slate-300'}`} style={{width:`${d.prob}%`}}/></div>
                            <span className="text-slate-500 w-7">{d.prob}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{d.closingYmReal?<span className={isLate?'font-bold text-red-500':'text-slate-600'}>{d.closingYmReal}</span>:<span className="font-semibold text-red-400">manquant</span>}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={d.status}/></td>
                      </tr>
                    )
                  })}
                  {!sortedDeals.length&&<tr><td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-400">Aucun deal pour cette sélection.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {sortedDeals.length>0&&(
            <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
              <span>{sortedDeals.length} deals · {inPeriod.length} dans la période</span>
              <span className="font-bold text-slate-700">Total : {mad(sortedDeals.reduce((s,d)=>s+d.amount,0))}</span>
            </div>
          )}
        </Panel>

      </div>
    </div>
  )
}
