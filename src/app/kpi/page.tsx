'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, ComposedChart, Area,
} from 'recharts'

// ─── Constants ────────────────────────────────────────────────────────────────
const OBJECTIF       = 30_000_000   // 30M MAD
const COMMISSION_BASE = 300_000     // 300K garanti si objectif atteint
const BONUS_MIX       = 150_000     // +150K si mix CSG/CIRS 50/50
const SURPERF_RATE    = 0.02        // 2% sur le CA au-dessus de 30M
const CSG_TARGET_MIN  = 0.40        // tolérance mix : 40-60% CSG
const CSG_TARGET_MAX  = 0.60

const SBU_COLORS: Record<string, string> = {
  CSG:     '#0f172a',
  HCI:     '#2563eb',
  Network: '#16a34a',
  Cyber:   '#dc2626',
  Service: '#d97706',
  Storage: '#7c3aed',
  Other:   '#94a3b8',
}

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMAD(n: number, compact = false) {
  if (compact) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + ' M'
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K'
    return n.toFixed(0)
  }
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD'
}

function normalizeSBU(raw: any): string {
  const u = String(raw || '').trim().toUpperCase()
  if (!u) return 'Other'
  if (u.includes('CSG'))     return 'CSG'
  if (u.includes('NETWORK')) return 'Network'
  if (u.includes('STORAGE')) return 'Storage'
  if (u.includes('CYBER'))   return 'Cyber'
  if (u.includes('SERVICE')) return 'Service'
  if (u.includes('HCI') || u.includes('INFRA')) return 'HCI'
  return 'Other'
}

function ymFrom(raw: any): string | null {
  if (!raw) return null
  const s = String(raw)
  const m = s.match(/(\d{4})[^\d](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  if (/^\d{4}-\d{2}$/.test(s)) return s
  return null
}

// ─── Commission calculator ────────────────────────────────────────────────────
function computeCommission(wonTotal: number, csgRatio: number) {
  const hitObjectif  = wonTotal >= OBJECTIF
  const goodMix      = csgRatio >= CSG_TARGET_MIN && csgRatio <= CSG_TARGET_MAX
  const surperf      = wonTotal > OBJECTIF
  const surplus      = Math.max(0, wonTotal - OBJECTIF)

  const base         = hitObjectif ? COMMISSION_BASE : 0
  const bonusMix     = hitObjectif && goodMix ? BONUS_MIX : 0
  const bonusSurperf = surperf ? surplus * SURPERF_RATE : 0
  const total        = base + bonusMix + bonusSurperf

  return { hitObjectif, goodMix, surperf, base, bonusMix, bonusSurperf, total, surplus }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function KPIPage() {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [year, setYear]     = useState(2026)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*, accounts(name)')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw error
      setRows(data || [])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Won deals for selected year ─────────────────────────────────────────────
  const wonDeals = useMemo(() => {
    return rows.filter(r => {
      const status = String(r?.status || '').trim()
      const stage  = String(r?.stage || '').trim().toLowerCase()
      const isWon  = status === 'Won' || stage === 'won'
      if (!isWon) return false

      const ym = ymFrom(r?.booking_month) ?? ymFrom(r?.closing_month) ?? ymFrom(r?.closing_date) ?? ymFrom(r?.created_at)
      return ym?.startsWith(String(year)) ?? false
    })
  }, [rows, year])

  // ── Won total + BU breakdown ────────────────────────────────────────────────
  const { wonTotal, buAmounts, csgTotal, cirsTotal, csgRatio } = useMemo(() => {
    const buMap: Record<string, number> = {}
    let total = 0

    for (const r of wonDeals) {
      const amount = Number(r?.amount ?? 0) || 0
      const isMulti = String(r?.deal_type || '').toLowerCase() === 'multi' ||
        Boolean(r?.multi_bu) || (Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0)

      if (isMulti && Array.isArray(r?.bu_lines) && r?.bu_lines.length > 0) {
        for (const x of r.bu_lines) {
          const sbu = normalizeSBU(x?.bu)
          const a   = Number(x?.amount ?? 0) || 0
          buMap[sbu] = (buMap[sbu] || 0) + a
          total += a
        }
      } else {
        const sbu = normalizeSBU(r?.bu)
        buMap[sbu] = (buMap[sbu] || 0) + amount
        total += amount
      }
    }

    const csg  = buMap['CSG'] || 0
    const cirs = total - csg
    return {
      wonTotal:  total,
      buAmounts: buMap,
      csgTotal:  csg,
      cirsTotal: cirs,
      csgRatio:  total > 0 ? csg / total : 0,
    }
  }, [wonDeals])

  // ── Commission ─────────────────────────────────────────────────────────────
  const commission = useMemo(() => computeCommission(wonTotal, csgRatio), [wonTotal, csgRatio])

  // ── Monthly data ───────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const mMap: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      mMap[`${year}-${String(m).padStart(2, '0')}`] = 0
    }
    for (const r of wonDeals) {
      const ym = ymFrom(r?.booking_month) ?? ymFrom(r?.closing_month) ?? ymFrom(r?.closing_date) ?? ymFrom(r?.created_at)
      if (!ym) continue
      const amount = Number(r?.amount ?? 0) || 0
      if (mMap[ym] !== undefined) mMap[ym] += amount
    }
    let cumul = 0
    return Object.entries(mMap).sort().map(([ym, val], i) => {
      cumul += val
      return { month: MONTHS_FR[i], mensuel: val, cumul, objectif: OBJECTIF }
    })
  }, [wonDeals, year])

  // ── Top accounts ───────────────────────────────────────────────────────────
  const topAccounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of wonDeals) {
      const name = String(r?.accounts?.name || r?.account_name || '—')
      m[name] = (m[name] || 0) + (Number(r?.amount ?? 0) || 0)
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [wonDeals])

  // ── BU bar data ────────────────────────────────────────────────────────────
  const buBarData = useMemo(() => {
    const order = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG']
    return order.map(bu => ({
      bu,
      amount: buAmounts[bu] || 0,
      pct: wonTotal > 0 ? Math.round(((buAmounts[bu] || 0) / wonTotal) * 100) : 0,
    })).filter(x => x.amount > 0)
  }, [buAmounts, wonTotal])

  const progressPct = Math.min(100, wonTotal > 0 ? (wonTotal / OBJECTIF) * 100 : 0)

  // ── Tier label ─────────────────────────────────────────────────────────────
  const tier = commission.surperf ? 'SURPERFORMANCE 🚀' :
               commission.hitObjectif ? 'OBJECTIF ATTEINT ✅' : 'EN COURS…'
  const tierColor = commission.surperf ? 'text-emerald-600' :
                    commission.hitObjectif ? 'text-blue-600' : 'text-slate-500'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Objectifs & KPI 2026</div>
            <div className="text-sm text-slate-500">
              Commission Nabil · Objectif annuel : <strong>30 000 000 MAD</strong> Won
              <span className="ml-2 text-xs text-amber-600">(Won = facturé en attendant les vraies factures)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="h-9 rounded-xl border bg-white px-3 text-sm outline-none"
            >
              {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={load} disabled={loading}
              className="h-9 rounded-xl border bg-white px-3 text-sm hover:bg-slate-50 transition-colors"
            >
              {loading ? '...' : 'Rafraîchir'}
            </button>
          </div>
        </div>

        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        {/* ── Big progress card ── */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Won YTD {year}</div>
              <div className="text-4xl font-black text-slate-900">{fmtMAD(wonTotal, true)}</div>
              <div className="text-sm text-slate-500 mt-1">sur objectif de 30 M MAD</div>
            </div>
            <div className={`text-right`}>
              <div className={`text-lg font-black ${tierColor}`}>{tier}</div>
              <div className="text-3xl font-black text-slate-900 mt-1">{progressPct.toFixed(1)}%</div>
              <div className="text-sm text-slate-500">de l'objectif</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                commission.surperf ? 'bg-emerald-500' :
                commission.hitObjectif ? 'bg-blue-500' :
                progressPct > 70 ? 'bg-amber-500' : 'bg-slate-800'
              }`}
              style={{ width: `${progressPct}%` }}
            />
            {/* 30M marker */}
            <div className="absolute top-0 right-0 h-full w-0.5 bg-slate-400/50" />
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span>0</span>
            <span className="font-medium text-slate-600">
              Reste : {fmtMAD(Math.max(0, OBJECTIF - wonTotal), true)}
            </span>
            <span>30 M</span>
          </div>
        </div>

        {/* ── 4 KPIs ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Won {year}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{fmtMAD(wonTotal, true)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{wonDeals.length} deals</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Reste objectif</div>
            <div className={`text-2xl font-bold mt-1 ${wonTotal >= OBJECTIF ? 'text-emerald-600' : 'text-slate-900'}`}>
              {wonTotal >= OBJECTIF ? '✅ Atteint' : fmtMAD(OBJECTIF - wonTotal, true)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{progressPct.toFixed(1)}% accompli</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">CSG (part)</div>
            <div className={`text-2xl font-bold mt-1 ${
              commission.goodMix ? 'text-emerald-600' : csgRatio > CSG_TARGET_MAX ? 'text-red-600' : 'text-amber-600'
            }`}>
              {(csgRatio * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {commission.goodMix ? '✅ Mix OK (50/50)' : `Cible : 40–60% CSG`}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Infra CIRS</div>
            <div className={`text-2xl font-bold mt-1 ${
              commission.goodMix ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {((1 - csgRatio) * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{fmtMAD(cirsTotal, true)}</div>
          </div>
        </div>

        {/* ── Commission card (hero) ── */}
        <div className={`rounded-2xl border-2 p-6 shadow-sm ${
          commission.surperf ? 'border-emerald-400 bg-emerald-50' :
          commission.hitObjectif ? 'border-blue-400 bg-blue-50' :
          'border-slate-200 bg-white'
        }`}>
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-4">
            💰 Estimation commissions {year}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Base */}
            <div className={`rounded-xl p-4 ${commission.hitObjectif ? 'bg-white shadow-sm' : 'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Base — Objectif 30M</div>
              <div className={`text-2xl font-black ${commission.hitObjectif ? 'text-slate-900' : 'text-slate-300'}`}>
                {fmtMAD(commission.base, true)}
              </div>
              <div className="text-xs mt-1 text-slate-500">
                {commission.hitObjectif ? '✅ 1% × 30M MAD' : `⏳ Manque ${fmtMAD(OBJECTIF - wonTotal, true)}`}
              </div>
            </div>

            {/* Mix */}
            <div className={`rounded-xl p-4 ${commission.goodMix ? 'bg-white shadow-sm' : 'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Bonus Mix CSG/Infra 50/50</div>
              <div className={`text-2xl font-black ${commission.goodMix && commission.hitObjectif ? 'text-blue-600' : 'text-slate-300'}`}>
                {commission.goodMix && commission.hitObjectif ? fmtMAD(BONUS_MIX, true) : '0 K'}
              </div>
              <div className="text-xs mt-1 text-slate-500">
                {commission.goodMix ? '✅ Mix OK' : `CSG : ${(csgRatio*100).toFixed(0)}% (cible 40-60%)`}
              </div>
            </div>

            {/* Surperf */}
            <div className={`rounded-xl p-4 ${commission.surperf ? 'bg-emerald-100 shadow-sm' : 'bg-white/60'}`}>
              <div className="text-xs font-medium text-slate-500 mb-1">Surperformance &gt;30M (+2%)</div>
              <div className={`text-2xl font-black ${commission.surperf ? 'text-emerald-700' : 'text-slate-300'}`}>
                {commission.surperf ? fmtMAD(commission.bonusSurperf, true) : '0 K'}
              </div>
              <div className="text-xs mt-1 text-slate-500">
                {commission.surperf
                  ? `✅ 2% × ${fmtMAD(commission.surplus, true)} surplus`
                  : `Dépasse les 30M pour activer`}
              </div>
            </div>
          </div>

          {/* Total */}
          <div className={`mt-4 flex items-center justify-between rounded-xl p-4 ${
            commission.surperf ? 'bg-emerald-600' :
            commission.hitObjectif ? 'bg-slate-900' : 'bg-slate-200'
          }`}>
            <div className={`text-sm font-semibold ${commission.hitObjectif ? 'text-white/70' : 'text-slate-500'}`}>
              Total estimé
            </div>
            <div className={`text-3xl font-black ${commission.hitObjectif ? 'text-white' : 'text-slate-400'}`}>
              {fmtMAD(commission.total)}
            </div>
          </div>

          {/* Max potentiel */}
          {!commission.hitObjectif && (
            <div className="mt-3 text-xs text-slate-500 text-center">
              Potentiel max si objectif + mix atteints : <strong>{fmtMAD(COMMISSION_BASE + BONUS_MIX)}</strong>
            </div>
          )}
          {commission.hitObjectif && !commission.surperf && (
            <div className="mt-3 text-xs text-slate-500 text-center">
              🚀 Passe {fmtMAD(OBJECTIF, true)} pour activer la surperformance à 2% sur le surplus
            </div>
          )}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

          {/* Monthly chart */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-1">Won par mois + cumul {year}</div>
            <div className="text-xs text-slate-500 mb-3">Barres = mensuel · Ligne = cumul · Pointillés = objectif 30M</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickFormatter={v => v >= 1_000_000 ? (v/1_000_000).toFixed(0)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : String(v)}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtMAD(v, true), name === 'mensuel' ? 'Mensuel' : name === 'cumul' ? 'Cumul' : 'Objectif']}
                />
                <Bar dataKey="mensuel" fill="#1e293b" radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="cumul" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="objectif" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* BU breakdown */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-1">Répartition Won par BU</div>
            <div className="text-xs text-slate-500 mb-3">
              CSG {fmtMAD(csgTotal, true)} · CIRS {fmtMAD(cirsTotal, true)}
            </div>
            {buBarData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-slate-400">Pas encore de Won en {year}</div>
            ) : (
              <div className="space-y-3 mt-2">
                {buBarData.sort((a, b) => b.amount - a.amount).map(({ bu, amount, pct }) => (
                  <div key={bu} className="flex items-center gap-3">
                    <div className="w-16 text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SBU_COLORS[bu] || '#94a3b8' }} />
                      {bu}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: SBU_COLORS[bu] || '#94a3b8' }} />
                    </div>
                    <div className="text-xs text-right w-24 text-slate-600 font-medium">
                      {fmtMAD(amount, true)} <span className="text-slate-400">({pct}%)</span>
                    </div>
                  </div>
                ))}

                {/* CSG vs CIRS visual */}
                <div className="mt-4 pt-3 border-t">
                  <div className="text-xs font-semibold text-slate-500 mb-2 flex justify-between">
                    <span>Mix CSG / CIRS</span>
                    <span className={commission.goodMix ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                      {commission.goodMix ? '✅ 50/50 OK' : `CSG: ${(csgRatio*100).toFixed(0)}% — cible 40-60%`}
                    </span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-slate-900 transition-all" style={{ width: `${csgRatio*100}%` }} title={`CSG ${(csgRatio*100).toFixed(1)}%`} />
                    <div className="bg-blue-500 flex-1 transition-all" title={`CIRS ${((1-csgRatio)*100).toFixed(1)}%`} />
                  </div>
                  <div className="flex justify-between text-xs mt-1 text-slate-500">
                    <span>■ CSG {(csgRatio*100).toFixed(1)}%</span>
                    <span>■ CIRS {((1-csgRatio)*100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Top accounts ── */}
        {topAccounts.length > 0 && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Top clients Won {year}</div>
            <div className="space-y-2">
              {topAccounts.map(([name, amount], i) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}</div>
                  <div className="text-sm font-medium text-slate-800 w-44 truncate" title={name}>{name}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-800 transition-all"
                      style={{ width: `${wonTotal > 0 ? (amount / wonTotal) * 100 : 0}%` }} />
                  </div>
                  <div className="text-xs font-semibold text-slate-700 w-20 text-right">{fmtMAD(amount, true)}</div>
                  <div className="text-xs text-slate-400 w-10 text-right">
                    {wonTotal > 0 ? ((amount / wonTotal) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Règles rappel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">📋 Règles de commission 2026</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-xs text-slate-600">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold text-slate-800 mb-1">Base — Performance</div>
              <div>Won ≥ 30M MAD → <strong>300 000 MAD</strong></div>
              <div className="text-slate-400 mt-1">= 1% de l'objectif annuel</div>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <div className="font-semibold text-slate-800 mb-1">Bonus — Mix 50/50</div>
              <div>CSG ≈ 50% + CIRS ≈ 50% → <strong>+150 000 MAD</strong></div>
              <div className="text-slate-400 mt-1">Tolérance : CSG entre 40% et 60%</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="font-semibold text-slate-800 mb-1">Surperformance &gt; 30M</div>
              <div>+<strong>2%</strong> du CA au-dessus de 30M</div>
              <div className="text-slate-400 mt-1">Ex: 60M → +2% × 30M = +600 000 MAD</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
