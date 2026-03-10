'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { mad, fmt, fmtDate, normSBU, SBU_COLORS, BU_BADGE_CLS } from '@/lib/utils'
import {
  RefreshCw, Shield, Key, AlertTriangle, Clock, Search,
  Download, Calendar, Building2, Filter, ChevronDown, X,
  CheckCircle2, ExternalLink,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────
type RenewalLine = {
  id: string
  designation: string
  ref: string | null
  warranty_months: number | null
  license_months: number | null
  purchase_info: {
    opportunity_id: string | null
    opportunities: {
      id: string
      title: string
      po_date: string | null
      bu: string | null
      accounts: { name: string } | null
    } | null
  } | null
}

type RenewalItem = {
  lineId: string
  type: 'license' | 'warranty'
  product: string
  ref: string | null
  months: number
  startDate: string | null
  expiryDate: Date | null
  daysRemaining: number | null
  dealTitle: string
  dealId: string | null
  accountName: string
  bu: string | null
}

type Tab = 'licenses' | 'warranties'

// ── Helpers ────────────────────────────────────────────────
function urgencyClass(days: number | null): { badge: string; text: string; label: string } {
  if (days === null) return { badge: 'bg-slate-100 text-slate-500 border-slate-200', text: 'text-slate-500', label: 'N/A' }
  if (days < 0) return { badge: 'bg-red-100 text-red-700 border-red-200', text: 'text-red-600', label: 'Expiré' }
  if (days <= 30) return { badge: 'bg-red-50 text-red-600 border-red-200', text: 'text-red-600', label: `${days}j` }
  if (days <= 90) return { badge: 'bg-orange-50 text-orange-600 border-orange-200', text: 'text-orange-600', label: `${days}j` }
  if (days <= 180) return { badge: 'bg-amber-50 text-amber-600 border-amber-200', text: 'text-amber-600', label: `${days}j` }
  return { badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', text: 'text-emerald-600', label: `${days}j` }
}

function expiryLabel(d: Date | null): string {
  if (!d) return '—'
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ── Main ──────────────────────────────────────────────────
export default function RenewalsPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lines, setLines] = useState<RenewalLine[]>([])
  const [tab, setTab] = useState<Tab>('licenses')
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('Tous')

  useEffect(() => { document.title = 'Renouvellements · CRM-PIPE'; load() }, [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('purchase_lines')
        .select('id, designation, ref, warranty_months, license_months, purchase_info(opportunity_id, opportunities(id, title, po_date, bu, accounts(name)))')
      if (error) throw error
      setLines((data || []) as unknown as RenewalLine[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const items: RenewalItem[] = useMemo(() => {
    const today = new Date()
    const result: RenewalItem[] = []
    for (const line of lines) {
      const opp = line.purchase_info?.opportunities
      const poDate = opp?.po_date ? new Date(opp.po_date) : null
      const base = {
        lineId: line.id,
        product: line.designation || '—',
        ref: line.ref,
        dealTitle: opp?.title || '—',
        dealId: opp?.id || null,
        accountName: opp?.accounts?.name || '—',
        bu: opp?.bu || null,
      }
      // License renewal
      if (line.license_months && line.license_months > 0 && poDate) {
        const exp = new Date(poDate)
        exp.setMonth(exp.getMonth() + line.license_months)
        const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        result.push({ ...base, type: 'license', months: line.license_months, startDate: opp?.po_date || null, expiryDate: exp, daysRemaining: days })
      }
      // Warranty renewal
      if (line.warranty_months && line.warranty_months > 0 && poDate) {
        const exp = new Date(poDate)
        exp.setMonth(exp.getMonth() + line.warranty_months)
        const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        result.push({ ...base, type: 'warranty', months: line.warranty_months, startDate: opp?.po_date || null, expiryDate: exp, daysRemaining: days })
      }
    }
    // Sort by expiry date (nearest first)
    result.sort((a, b) => {
      if (!a.expiryDate) return 1
      if (!b.expiryDate) return -1
      return a.expiryDate.getTime() - b.expiryDate.getTime()
    })
    return result
  }, [lines])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(it => {
      if (tab === 'licenses' && it.type !== 'license') return false
      if (tab === 'warranties' && it.type !== 'warranty') return false
      if (buFilter !== 'Tous' && normSBU(it.bu) !== buFilter) return false
      if (q && !it.product.toLowerCase().includes(q) && !it.accountName.toLowerCase().includes(q) && !it.dealTitle.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, tab, search, buFilter])

  // KPIs
  const kpis = useMemo(() => {
    const tabItems = items.filter(it => tab === 'licenses' ? it.type === 'license' : it.type === 'warranty')
    return {
      total: tabItems.length,
      expired: tabItems.filter(it => it.daysRemaining !== null && it.daysRemaining < 0).length,
      within30: tabItems.filter(it => it.daysRemaining !== null && it.daysRemaining >= 0 && it.daysRemaining <= 30).length,
      within90: tabItems.filter(it => it.daysRemaining !== null && it.daysRemaining > 30 && it.daysRemaining <= 90).length,
      active: tabItems.filter(it => it.daysRemaining !== null && it.daysRemaining > 0).length,
    }
  }, [items, tab])

  const buOptions = useMemo(() => {
    const set = new Set(items.map(it => normSBU(it.bu)).filter(b => b !== 'Other'))
    return ['Tous', ...Array.from(set).sort()]
  }, [items])

  // Excel export
  async function exportExcel() {
    const headers = ['Produit', 'Référence', 'Type', 'Compte', 'Projet', 'BU', 'Début', 'Expiration', 'Jours restants']
    const rows = filtered.map(it => [
      it.product, it.ref || '', it.type === 'license' ? 'Licence' : 'Garantie',
      it.accountName, it.dealTitle, it.bu || '—',
      it.startDate ? fmtDate(it.startDate) : '—',
      it.expiryDate ? expiryLabel(it.expiryDate) : '—',
      it.daysRemaining ?? '—',
    ])
    try {
      const res = await authFetch('/api/excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `renouvellements_${tab}.xlsx`,
          sheets: [{ name: tab === 'licenses' ? 'Licences' : 'Garanties', title: `Renouvellements — ${tab === 'licenses' ? 'Licences' : 'Support/Garantie'}`, headers, rows }],
        }),
      })
      if (!res.ok) throw new Error('Erreur export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `renouvellements_${tab}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto max-w-[1500px] px-6 py-8 sm:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Renouvellements</h1>
              <p className="mt-1 text-sm text-slate-400">Suivi des licences et garanties — expirations triées par urgence</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={exportExcel}
                className="flex h-9 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20 transition-colors">
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button onClick={load}
                className="flex h-9 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20 transition-colors">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-6 py-6 sm:px-8 space-y-6">
        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" /> {err}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            <button onClick={() => setTab('licenses')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${tab === 'licenses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Key className="h-4 w-4" /> Licences
            </button>
            <button onClick={() => setTab('warranties')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${tab === 'warranties' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Shield className="h-4 w-4" /> Support / Garantie
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Total', value: kpis.total, icon: <CheckCircle2 className="h-5 w-5" />, color: 'from-slate-800 to-slate-600' },
            { label: 'Actifs', value: kpis.active, icon: <Shield className="h-5 w-5" />, color: 'from-emerald-600 to-teal-400' },
            { label: 'Expirés', value: kpis.expired, icon: <AlertTriangle className="h-5 w-5" />, color: 'from-red-600 to-rose-400' },
            { label: '< 30 jours', value: kpis.within30, icon: <Clock className="h-5 w-5" />, color: 'from-orange-600 to-amber-400' },
            { label: '< 90 jours', value: kpis.within90, icon: <Calendar className="h-5 w-5" />, color: 'from-amber-500 to-yellow-400' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden">
              <div className={`h-1 bg-gradient-to-r ${k.color}`} />
              <div className="p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${k.color} text-white shadow-md`}>{k.icon}</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{k.value}</div>
                <div className="text-xs font-semibold text-slate-500">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher produit, compte, projet..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </div>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none">
            {buOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="text-xs text-slate-400">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Produit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Compte</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Projet</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">BU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Expiration</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400">Restant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                    <RefreshCw className="inline h-4 w-4 animate-spin mr-2" />Chargement...
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                    Aucun renouvellement {tab === 'licenses' ? 'de licence' : 'de garantie'} trouvé.
                  </td></tr>
                ) : filtered.map(it => {
                  const urg = urgencyClass(it.daysRemaining)
                  const sbu = normSBU(it.bu)
                  return (
                    <tr key={`${it.lineId}-${it.type}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 text-xs">{it.product}</div>
                        {it.ref && <div className="text-[10px] text-slate-400 mt-0.5">Réf: {it.ref}</div>}
                        <div className="mt-0.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${it.type === 'license' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {it.type === 'license' ? <Key className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
                            {it.type === 'license' ? `Licence ${it.months}m` : `Garantie ${it.months}m`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-800">{it.accountName}</td>
                      <td className="px-4 py-3">
                        {it.dealId ? (
                          <Link href={`/opportunities/${it.dealId}`} className="text-xs text-slate-600 hover:text-blue-600 hover:underline">
                            {it.dealTitle}
                          </Link>
                        ) : <span className="text-xs text-slate-400">{it.dealTitle}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${BU_BADGE_CLS[sbu] || 'bg-slate-100 text-slate-600'}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SBU_COLORS[sbu] || '#94a3b8' }} />
                          {sbu}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-slate-800">{expiryLabel(it.expiryDate)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${urg.badge}`}>
                          {it.daysRemaining !== null && it.daysRemaining < 0 ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {urg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
