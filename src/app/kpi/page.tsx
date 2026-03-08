'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { normSBU, ymFrom, getAnnualTarget } from '@/lib/utils'
import {
  ResponsiveContainer, Tooltip, ComposedChart, CartesianGrid,
  Bar, Line, XAxis, YAxis,
} from 'recharts'

const PROFILES: Record<string, any> = {
  'nabil.imdh@gmail.com': { name: 'Nabil', view: 'annual' },
  's.chitachny@compucom.ma': { name: 'Salim', view: 'quarterly' },
}

const CSG_MIN = 0.40
const CSG_MAX = 0.60
const CIRS_MIN = 0.50
const MONTHS_FR = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec']
const QUARTERS: Record<string, number[]> = { Q1:[1,2,3], Q2:[4,5,6], Q3:[7,8,9], Q4:[10,11,12] }
const SBU_COLORS: Record<string, string> = {
  CSG:'#0f172a', HCI:'#2563eb', Network:'#16a34a',
  Cyber:'#dc2626', Service:'#d97706', Storage:'#7c3aed', Other:'#94a3b8',
}

function fmtMAD(n: number, compact = false) {
  if (compact) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(2).replace(/\.?0+$/,'') + ' M'
    if (n >= 1_000) return (n/1_000).toFixed(0) + ' K'
    return n.toFixed(0)
  }
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD'
}


function buildStats(deals: any[]) {
  const buMap: Record<string,number> = {}
  let total = 0
  for (const r of deals) {
    const amount = Number(r?.amount??0)||0
    const isMulti = String(r?.deal_type||'').toLowerCase()==='multi'||Boolean(r?.multi_bu)||(Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0)
    if (isMulti&&Array.isArray(r?.bu_lines)&&r?.bu_lines.length>0) {
      for (const x of r.bu_lines) {
        const sbu = normSBU(x?.bu)
        const a = Number(x?.amount??0)||0
        buMap[sbu] = (buMap[sbu]||0)+a; total+=a
      }
    } else {
      const sbu = normSBU(r?.bu)
      buMap[sbu] = (buMap[sbu]||0)+amount; total+=amount
    }
  }
  const csg = buMap['CSG']||0
  const cirs = total-csg
  return { total, buMap, csg, cirs, csgR: total>0?csg/total:0, cirsR: total>0?cirs/total:0 }
}

export default function KPIPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string|null>(null)
  const [year, setYear] = useState(2026)
  const [email, setEmail] = useState<string|null>(null)
  const [activeQ, setActiveQ] = useState<string>('Q1')
  const [AT, setATState] = useState(30_000_000)
  useEffect(() => { document.title = 'KPI \u00b7 CRM-PIPE'; setATState(getAnnualTarget()) }, [])

  const profile = email ? (PROFILES[email]??null) : null

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email??null)
      const { data, error } = await supabase.from('opportunities').select('*, accounts(name)').order('created_at',{ascending:false}).limit(5000)
      if (error) throw error
      setRows(data||[])
    } catch(e:any) { setErr(e?.message||'Erreur') } finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  const wonYear = useMemo(()=>rows.filter(r=>{
    const s = String(r?.status||'').trim()
    const st = String(r?.stage||'').trim().toLowerCase()
    if (s!=='Won'&&st!=='won') return false
    const ym = ymFrom(r?.booking_month)??ymFrom(r?.closing_month)??ymFrom(r?.closing_date)??ymFrom(r?.created_at)
    return ym?.startsWith(String(year))??false
  }),[rows,year])

  const annual = useMemo(()=>buildStats(wonYear),[wonYear])

  const quarters = useMemo(()=>Object.entries(QUARTERS).map(([q,months])=>{
    const deals = wonYear.filter(r=>{
      const ym = ymFrom(r?.booking_month)??ymFrom(r?.closing_month)??ymFrom(r?.closing_date)??ymFrom(r?.created_at)
      if (!ym) return false
      return months.includes(parseInt(ym.split('-')[1]||'0'))
    })
    const s = buildStats(deals)
    const target = AT/4
    const ok = s.total>=target && s.cirsR>=CIRS_MIN
    return { q, deals:deals.length, ...s, target, ok, earned: ok?5000:0 }
  }),[wonYear,AT])

  const nc = useMemo(()=>{
    const { total: won, csgR } = annual
    const hitObj = won>=AT
    const goodMix = csgR>=CSG_MIN&&csgR<=CSG_MAX
    const surperf = won>AT
    const surplus = Math.max(0,won-AT)
    const base = hitObj?300_000:0
    const bonusMix = hitObj&&goodMix?150_000:0
    const bonusSurperf = surperf?surplus*0.02:0
    return { hitObj, goodMix, surperf, base, bonusMix, bonusSurperf, surplus, total:base+bonusMix+bonusSurperf }
  },[annual,AT])

  const monthlyData = useMemo(()=>{
    const mMap:Record<string,number> = {}
    for (let m=1;m<=12;m++) mMap[`${year}-${String(m).padStart(2,'0')}`]=0
    for (const r of wonYear) {
      const ym = ymFrom(r?.booking_month)??ymFrom(r?.closing_month)??ymFrom(r?.closing_date)??ymFrom(r?.created_at)
      if (ym&&mMap[ym]!==undefined) mMap[ym]+=Number(r?.amount??0)||0
    }
    let cumul=0
    return Object.entries(mMap).sort().map(([,val],i)=>{ cumul+=val; return { month:MONTHS_FR[i], mensuel:val, cumul, objectif:AT } })
  },[wonYear,year,AT])

  const topAccounts = useMemo(()=>{
    const m:Record<string,number>={}
    for (const r of wonYear) { const n=String(r?.accounts?.name||r?.account_name||'--'); m[n]=(m[n]||0)+(Number(r?.amount??0)||0) }
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6)
  },[wonYear])

  const pct = Math.min(100,annual.total>0?(annual.total/AT)*100:0)
  const selQ = quarters.find(q=>q.q===activeQ)
  const salimEarned = quarters.reduce((s,q)=>s+q.earned,0)

  if (!loading && !profile) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center text-slate-500 text-sm">
        <div className="text-2xl mb-2">&#x1F512;</div>
        Profil non reconnu ({email})<br/>Contacte Nabil.
      </div>
    </div>
  )

  const Header = () => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-2xl font-bold text-slate-900">KPI {year} — {profile?.name}</div>
        <div className="text-sm text-slate-500">
          {profile?.view==='annual' ? 'Commissions annuelles · Objectif 30 M MAD Won' : 'Commissions trimestrielles · 5 000 MAD / trimestre validé'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select value={year} onChange={e=>setYear(Number(e.target.value))} className="h-9 rounded-xl border bg-white px-3 text-sm outline-none">
          {[2026,2025,2024].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="h-9 rounded-xl border bg-white px-3 text-sm hover:bg-slate-50">{loading?'...':'Rafraichir'}</button>
      </div>
    </div>
  )

  // ── SALIM VIEW ──
  if (profile?.view==='quarterly') return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-4">
        <Header/>
        {err&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Recap annuel {year}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><div className="text-xs text-slate-500">Won total</div><div className="text-xl font-black text-slate-900">{fmtMAD(annual.total,true)}</div></div>
            <div><div className="text-xs text-slate-500">CIRS (infra)</div><div className={`text-xl font-black ${annual.cirsR>=CIRS_MIN?'text-emerald-600':'text-amber-600'}`}>{(annual.cirsR*100).toFixed(1)}%</div></div>
            <div><div className="text-xs text-slate-500">Trimestres valides</div><div className="text-xl font-black text-slate-900">{quarters.filter(q=>q.ok).length} / 4</div></div>
            <div><div className="text-xs text-slate-500">Commissions gagnees</div><div className={`text-xl font-black ${salimEarned>0?'text-emerald-600':'text-slate-400'}`}>{fmtMAD(salimEarned)}</div></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quarters.map(qd=>(
            <button key={qd.q} onClick={()=>setActiveQ(qd.q)}
              className={`rounded-2xl border p-4 text-left transition-all shadow-sm ${activeQ===qd.q?'border-slate-900 bg-slate-900 text-white':qd.ok?'border-emerald-300 bg-emerald-50':'bg-white hover:bg-slate-50'}`}>
              <div className={`text-xs font-bold uppercase ${activeQ===qd.q?'text-white/60':'text-slate-400'}`}>{qd.q}</div>
              <div className={`text-lg font-black mt-1 ${activeQ===qd.q?'text-white':'text-slate-900'}`}>{fmtMAD(qd.total,true)}</div>
              <div className={`text-xs mt-1 font-semibold ${qd.ok?(activeQ===qd.q?'text-emerald-300':'text-emerald-600'):(activeQ===qd.q?'text-white/50':'text-slate-400')}`}>
                {qd.ok?`+${fmtMAD(qd.earned)}`:'En cours'}
              </div>
            </button>
          ))}
        </div>

        {selQ&&(
          <div className={`rounded-2xl border-2 p-5 shadow-sm ${selQ.ok?'border-emerald-400 bg-emerald-50':'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-black text-slate-900">{selQ.q} {year}</div>
                <div className="text-xs text-slate-500">{selQ.deals} deals Won</div>
              </div>
              <div className={`text-right ${selQ.ok?'text-emerald-600':'text-slate-400'}`}>
                <div className="text-2xl font-black">{selQ.ok?fmtMAD(selQ.earned):'0 MAD'}</div>
                <div className="text-xs">{selQ.ok?'Commission validee':'Non valide'}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className={`rounded-xl p-4 ${selQ.total>=selQ.target?'bg-emerald-100':'bg-white border'}`}>
                <div className="text-xs font-semibold text-slate-500 mb-2">Condition 1 — Won ≥ 7,5M</div>
                <div className={`text-2xl font-black ${selQ.total>=selQ.target?'text-emerald-700':'text-slate-400'}`}>{fmtMAD(selQ.total,true)}</div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full rounded-full ${selQ.total>=selQ.target?'bg-emerald-500':'bg-slate-400'}`} style={{width:`${Math.min(100,(selQ.total/selQ.target)*100)}%`}}/>
                </div>
                <div className="text-xs mt-1 text-slate-500">{selQ.total>=selQ.target?'OK':'Manque '+fmtMAD(selQ.target-selQ.total,true)}</div>
              </div>
              <div className={`rounded-xl p-4 ${selQ.cirsR>=CIRS_MIN?'bg-emerald-100':'bg-white border'}`}>
                <div className="text-xs font-semibold text-slate-500 mb-2">Condition 2 — CIRS ≥ 50%</div>
                <div className={`text-2xl font-black ${selQ.cirsR>=CIRS_MIN?'text-emerald-700':'text-amber-600'}`}>{(selQ.cirsR*100).toFixed(1)}%</div>
                <div className="mt-2 h-4 rounded-full overflow-hidden flex">
                  <div className="bg-slate-800 transition-all" style={{width:`${selQ.csgR*100}%`}}/>
                  <div className="bg-blue-500 flex-1"/>
                </div>
                <div className="flex justify-between text-xs mt-1 text-slate-500">
                  <span>CSG {(selQ.csgR*100).toFixed(0)}%</span>
                  <span>CIRS {(selQ.cirsR*100).toFixed(0)}% {selQ.cirsR>=CIRS_MIN?'':'⚠️'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Regles commissions {year}</div>
          <div className="text-sm text-slate-600 space-y-1">
            <div>Chaque trimestre : Won ≥ <strong>7,5M MAD</strong> ET CIRS ≥ <strong>50%</strong> → <strong>5 000 MAD</strong></div>
            <div>4 trimestres = <strong>20 000 MAD</strong> sur l'annee</div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── NABIL VIEW ──
  const buBars = ['HCI','Network','Storage','Cyber','Service','CSG']
    .map(bu=>({ bu, amount:annual.buMap[bu]||0, pct:annual.total>0?Math.round(((annual.buMap[bu]||0)/annual.total)*100):0 }))
    .filter(x=>x.amount>0)

  const tier = nc.surperf?'SURPERFORMANCE':nc.hitObj?'OBJECTIF ATTEINT':'EN COURS'
  const tierColor = nc.surperf?'text-emerald-600':nc.hitObj?'text-blue-600':'text-slate-500'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-4">
        <Header/>
        {err&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Won YTD {year}</div>
              <div className="text-4xl font-black text-slate-900">{fmtMAD(annual.total,true)}</div>
              <div className="text-sm text-slate-500 mt-1">sur objectif 30 M MAD</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-black ${tierColor}`}>{tier}</div>
              <div className="text-3xl font-black text-slate-900 mt-1">{pct.toFixed(1)}%</div>
            </div>
          </div>
          <div className="h-5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${nc.surperf?'bg-emerald-500':nc.hitObj?'bg-blue-500':pct>70?'bg-amber-500':'bg-slate-800'}`} style={{width:`${pct}%`}}/>
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span>0</span>
            <span className="font-medium text-slate-600">Reste : {fmtMAD(Math.max(0,AT-annual.total),true)}</span>
            <span>{fmtMAD(AT,true)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Won {year}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{fmtMAD(annual.total,true)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{wonYear.length} deals</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Reste objectif</div>
            <div className={`text-2xl font-bold mt-1 ${annual.total>=AT?'text-emerald-600':'text-slate-900'}`}>
              {annual.total>=AT?'Atteint':fmtMAD(AT-annual.total,true)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{pct.toFixed(1)}% accompli</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">CSG</div>
            <div className={`text-2xl font-bold mt-1 ${nc.goodMix?'text-emerald-600':'text-amber-600'}`}>{(annual.csgR*100).toFixed(1)}%</div>
            <div className="text-xs text-slate-500 mt-0.5">{nc.goodMix?'Mix OK 50/50':'Cible 40-60%'}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">CIRS</div>
            <div className={`text-2xl font-bold mt-1 ${nc.goodMix?'text-emerald-600':'text-amber-600'}`}>{(annual.cirsR*100).toFixed(1)}%</div>
            <div className="text-xs text-slate-500 mt-0.5">{fmtMAD(annual.cirs,true)}</div>
          </div>
        </div>

        <div className={`rounded-2xl border-2 p-6 shadow-sm ${nc.surperf?'border-emerald-400 bg-emerald-50':nc.hitObj?'border-blue-400 bg-blue-50':'border-slate-200 bg-white'}`}>
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-4">Commission {year}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className={`rounded-xl p-4 ${nc.hitObj?'bg-white shadow-sm':'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Base — Objectif {fmtMAD(AT,true)}</div>
              <div className={`text-2xl font-black ${nc.hitObj?'text-slate-900':'text-slate-300'}`}>{fmtMAD(nc.base,true)}</div>
              <div className="text-xs mt-1 text-slate-500">{nc.hitObj?`1% x ${fmtMAD(AT,true)}`:'Manque '+fmtMAD(AT-annual.total,true)}</div>
            </div>
            <div className={`rounded-xl p-4 ${nc.goodMix&&nc.hitObj?'bg-white shadow-sm':'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Bonus Mix 50/50</div>
              <div className={`text-2xl font-black ${nc.goodMix&&nc.hitObj?'text-blue-600':'text-slate-300'}`}>{nc.goodMix&&nc.hitObj?'150 K':'0 K'}</div>
              <div className="text-xs mt-1 text-slate-500">{nc.goodMix?'Mix OK':`CSG: ${(annual.csgR*100).toFixed(0)}% (cible 40-60%)`}</div>
            </div>
            <div className={`rounded-xl p-4 ${nc.surperf?'bg-emerald-100 shadow-sm':'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Surperf &gt;30M (+2%)</div>
              <div className={`text-2xl font-black ${nc.surperf?'text-emerald-700':'text-slate-300'}`}>{nc.surperf?fmtMAD(nc.bonusSurperf,true):'0 K'}</div>
              <div className="text-xs mt-1 text-slate-500">{nc.surperf?`2% x ${fmtMAD(nc.surplus,true)}`:'Depasse 30M pour activer'}</div>
            </div>
          </div>
          <div className={`mt-4 flex items-center justify-between rounded-xl p-4 ${nc.surperf?'bg-emerald-600':nc.hitObj?'bg-slate-900':'bg-slate-200'}`}>
            <div className={`text-sm font-semibold ${nc.hitObj?'text-white/70':'text-slate-500'}`}>Total estime</div>
            <div className={`text-3xl font-black ${nc.hitObj?'text-white':'text-slate-400'}`}>{fmtMAD(nc.total)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Won par mois + cumul {year}</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyData} margin={{top:5,right:10,bottom:0,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="month" tick={{fontSize:10}}/>
                <YAxis tick={{fontSize:9}} tickFormatter={(v:number)=>v>=1_000_000?(v/1_000_000).toFixed(0)+'M':v>=1000?(v/1000).toFixed(0)+'K':String(v)}/>
                <Tooltip formatter={(v:any,name:any)=>[fmtMAD(Number(v)||0,true),name==='mensuel'?'Mensuel':name==='cumul'?'Cumul':'Objectif']}/>
                <Bar dataKey="mensuel" fill="#1e293b" radius={[3,3,0,0]}/>
                <Line type="monotone" dataKey="cumul" stroke="#2563eb" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="objectif" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Repartition Won par BU</div>
            {buBars.length===0 ? <div className="flex items-center justify-center h-48 text-sm text-slate-400">Pas de Won en {year}</div> : (
              <div className="space-y-3 mt-2">
                {buBars.sort((a,b)=>b.amount-a.amount).map(({bu,amount,pct:p})=>(
                  <div key={bu} className="flex items-center gap-3">
                    <div className="w-16 text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:SBU_COLORS[bu]||'#94a3b8'}}/>
                      {bu}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${p}%`,background:SBU_COLORS[bu]||'#94a3b8'}}/>
                    </div>
                    <div className="text-xs text-right w-24 text-slate-600 font-medium">{fmtMAD(amount,true)} <span className="text-slate-400">({p}%)</span></div>
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-slate-900" style={{width:`${annual.csgR*100}%`}}/>
                    <div className="bg-blue-500 flex-1"/>
                  </div>
                  <div className="flex justify-between text-xs mt-1 text-slate-500">
                    <span>CSG {(annual.csgR*100).toFixed(1)}%</span>
                    <span className={nc.goodMix?'text-emerald-600 font-bold':'text-amber-600'}>{nc.goodMix?'Mix OK':'Cible 40-60%'}</span>
                    <span>CIRS {(annual.cirsR*100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {topAccounts.length>0&&(
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Top clients Won {year}</div>
            <div className="space-y-2">
              {topAccounts.map(([name,amount],i)=>(
                <div key={name} className="flex items-center gap-3">
                  <div className="text-xs font-bold text-slate-400 w-5 text-right">{i+1}</div>
                  <div className="text-sm font-medium text-slate-800 w-44 truncate" title={name}>{name}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-800" style={{width:`${annual.total>0?(amount/annual.total)*100:0}%`}}/>
                  </div>
                  <div className="text-xs font-semibold text-slate-700 w-20 text-right">{fmtMAD(amount,true)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Regles commission 2026</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-xs text-slate-600">
            <div className="rounded-xl bg-slate-50 p-3"><div className="font-semibold text-slate-800 mb-1">Base</div><div>Won ≥ 30M → <strong>300 000 MAD</strong></div></div>
            <div className="rounded-xl bg-blue-50 p-3"><div className="font-semibold text-slate-800 mb-1">Bonus Mix 50/50</div><div>CSG 40-60% → <strong>+150 000 MAD</strong></div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="font-semibold text-slate-800 mb-1">Surperf &gt;30M</div><div>+<strong>2%</strong> du surplus</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
