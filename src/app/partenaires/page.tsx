'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { Search, Handshake, Plus, X, Pencil, Trash2, ExternalLink, RefreshCw, Download, ArrowUp, ArrowDown, ChevronsUpDown, Eye } from 'lucide-react'
import { mad } from '@/lib/utils'
import Toast from '@/components/Toast'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
type CardRow = { id: string; name: string; type: string | null; website: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null; created_at: string | null }
type DealRow = { id: string; vendor: string | null; amount: number; status: string; bu: string | null; bu_lines: any }

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_OPTIONS = ['Constructeur', 'Éditeur', 'Distributeur', 'Autre'] as const
const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  Constructeur: { bg: 'bg-blue-50', text: 'text-blue-700' },
  'Éditeur': { bg: 'bg-violet-50', text: 'text-violet-700' },
  Distributeur: { bg: 'bg-amber-50', text: 'text-amber-700' },
  Autre: { bg: 'bg-slate-100', text: 'text-slate-600' },
}
const CHART_COLORS = ['#334155', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316']

// ─── Small components ─────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-slate-300 text-xs">—</span>
  const s = TYPE_STYLE[type] || TYPE_STYLE['Autre']
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>{type}</span>
}

function FL({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      {children}
    </div>
  )
}
const inputCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400"
const selectCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 appearance-none"

function Btn({ children, variant = 'ghost', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' }) {
  const vCls = { primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900', ghost: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200', outline: 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200', danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600' }[variant]
  const szCls = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-50 ${vCls} ${szCls} ${props.className || ''}`}>{children}</button>
}

type SortKey = 'name' | 'type' | 'deals' | 'won' | 'revenue' | 'pipeline'
type SortDir = 'asc' | 'desc'

function SortHead({ label, k, sort, setSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; setSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  const active = sort.key === k
  return (
    <th className="py-3 px-2 text-left text-xs font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-700 transition" onClick={() => setSort({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
      <span className="inline-flex items-center gap-1">{label}
        {active ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PartenairesPage() {
  const [cards, setCards] = useState<CardRow[]>([])
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('Tous')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'revenue', dir: 'desc' })
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'error' } | null>(null)

  // Modal
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<CardRow | null>(null)
  const [fName, setFName] = useState('')
  const [fType, setFType] = useState<string>('Constructeur')
  const [fWebsite, setFWebsite] = useState('')
  const [fContactName, setFContactName] = useState('')
  const [fContactEmail, setFContactEmail] = useState('')
  const [fContactPhone, setFContactPhone] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    const [c, d] = await Promise.all([
      supabase.from('cards').select('*').order('name'),
      supabase.from('opportunities').select('id,vendor,amount,status,bu,bu_lines'),
    ])
    if (c.data) setCards(c.data as CardRow[])
    if (d.data) setDeals(d.data as DealRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ── Deal stats by card ──────────────────────────────────────────────────
  const cardStats = useMemo(() => {
    const map: Record<string, { deals: number; won: number; lost: number; revenue: number; pipeline: number }> = {}
    for (const d of deals) {
      // Handle multi-BU deals
      const vendors: string[] = []
      if (d.bu === 'MULTI' && Array.isArray(d.bu_lines)) {
        for (const line of d.bu_lines) {
          if (line.card && line.card !== 'Prestation') vendors.push(line.card)
        }
      } else if (d.vendor && d.vendor !== 'MULTI' && d.vendor !== 'Prestation') {
        vendors.push(d.vendor)
      }
      for (const v of vendors) {
        if (!map[v]) map[v] = { deals: 0, won: 0, lost: 0, revenue: 0, pipeline: 0 }
        map[v].deals++
        if (d.status === 'Won') { map[v].won++; map[v].revenue += d.amount || 0 }
        if (d.status === 'Lost') map[v].lost++
        if (d.status === 'Open') map[v].pipeline += d.amount || 0
      }
    }
    return map
  }, [deals])

  // ── Computed stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalCards = cards.length
    const totalRevenue = Object.values(cardStats).reduce((s, v) => s + v.revenue, 0)
    const totalPipeline = Object.values(cardStats).reduce((s, v) => s + v.pipeline, 0)
    const activeCards = Object.keys(cardStats).length
    return { totalCards, totalRevenue, totalPipeline, activeCards }
  }, [cards, cardStats])

  // ── Charts data ─────────────────────────────────────────────────────────
  const topRevenueData = useMemo(() => {
    return Object.entries(cardStats)
      .filter(([, v]) => v.revenue > 0)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8)
      .map(([name, v]) => ({ name, revenue: v.revenue }))
  }, [cardStats])

  const topDealsData = useMemo(() => {
    return Object.entries(cardStats)
      .filter(([, v]) => v.deals > 0)
      .sort((a, b) => b[1].deals - a[1].deals)
      .slice(0, 8)
      .map(([name, v]) => ({ name, deals: v.deals, won: v.won }))
  }, [cardStats])

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of cards) {
      const t = c.type || 'Non classé'
      map[t] = (map[t] || 0) + 1
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [cards])

  // ── Enriched list ───────────────────────────────────────────────────────
  const enriched = useMemo(() => {
    return cards.map(c => ({
      ...c,
      stats: cardStats[c.name] || { deals: 0, won: 0, lost: 0, revenue: 0, pipeline: 0 },
    }))
  }, [cards, cardStats])

  // ── Filter + Sort ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = enriched
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.contact_name || '').toLowerCase().includes(q))
    }
    if (typeFilter !== 'Tous') list = list.filter(c => (c.type || 'Autre') === typeFilter)
    list.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      switch (sort.key) {
        case 'name': return dir * a.name.localeCompare(b.name)
        case 'type': return dir * (a.type || '').localeCompare(b.type || '')
        case 'deals': return dir * (a.stats.deals - b.stats.deals)
        case 'won': return dir * (a.stats.won - b.stats.won)
        case 'revenue': return dir * (a.stats.revenue - b.stats.revenue)
        case 'pipeline': return dir * (a.stats.pipeline - b.stats.pipeline)
        default: return 0
      }
    })
    return list
  }, [enriched, search, typeFilter, sort])

  // ── Form ────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditRow(null); setFName(''); setFType('Constructeur'); setFWebsite(''); setFContactName(''); setFContactEmail(''); setFContactPhone(''); setFNotes(''); setShowForm(true)
  }
  const openEdit = (c: CardRow) => {
    setEditRow(c); setFName(c.name); setFType(c.type || 'Constructeur'); setFWebsite(c.website || ''); setFContactName(c.contact_name || ''); setFContactEmail(c.contact_email || ''); setFContactPhone(c.contact_phone || ''); setFNotes(c.notes || ''); setShowForm(true)
  }
  const handleSave = async () => {
    if (!fName.trim()) { setToast({ msg: 'Nom obligatoire', type: 'error' }); return }
    setSaving(true)
    try {
      const payload = {
        name: fName.trim(),
        type: fType || null,
        website: fWebsite.trim() || null,
        contact_name: fContactName.trim() || null,
        contact_email: fContactEmail.trim() || null,
        contact_phone: fContactPhone.trim() || null,
        notes: fNotes.trim() || null,
      }
      if (editRow) {
        const { error } = await supabase.from('cards').update(payload).eq('id', editRow.id)
        if (error) throw error
        setToast({ msg: 'Partenaire modifié', type: 'success' })
      } else {
        const { error } = await supabase.from('cards').insert(payload)
        if (error) throw error
        setToast({ msg: 'Partenaire ajouté', type: 'success' })
      }
      setShowForm(false)
      load()
    } catch (e: any) {
      setToast({ msg: e?.message || 'Erreur', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const { error } = await supabase.from('cards').delete().eq('id', deleteId)
      if (error) throw error
      setToast({ msg: 'Partenaire supprimé', type: 'success' })
      setDeleteId(null)
      load()
    } catch (e: any) {
      setToast({ msg: e?.message || 'Erreur suppression', type: 'error' })
    }
  }

  // ── Excel ───────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    try {
      const rows = filtered.map(c => ({
        Partenaire: c.name,
        Type: c.type || '',
        Deals: c.stats.deals,
        Won: c.stats.won,
        'CA Won (MAD)': c.stats.revenue,
        'Pipeline (MAD)': c.stats.pipeline,
        Contact: c.contact_name || '',
        Email: c.contact_email || '',
        'Tél': c.contact_phone || '',
      }))
      const res = await authFetch('/api/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'partenaires', sheets: [{ name: 'Partenaires', data: rows }] }),
      })
      if (!res.ok) throw new Error('Erreur export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'partenaires.xlsx'; a.click()
      URL.revokeObjectURL(url)
      setToast({ msg: 'Export Excel OK', type: 'success' })
    } catch (e: any) {
      setToast({ msg: e?.message || 'Erreur export', type: 'error' })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-200">
            <Handshake className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Partenaires</h1>
            <p className="text-xs text-slate-400">{stats.totalCards} partenaires · {stats.activeCards} actifs · {mad(stats.totalRevenue)} CA</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="outline" onClick={exportExcel}><Download className="h-3.5 w-3.5" /> Excel</Btn>
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Btn>
          <Btn variant="primary" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Nouveau</Btn>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total partenaires</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{stats.totalCards}</div>
          <div className="mt-0.5 text-xs text-slate-400">{stats.activeCards} avec des deals</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-emerald-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">CA Won</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700">{mad(stats.totalRevenue)}</div>
          <div className="mt-0.5 text-xs text-emerald-500">Deals gagnés</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-blue-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Pipeline</div>
          <div className="mt-1 text-2xl font-extrabold text-blue-700">{mad(stats.totalPipeline)}</div>
          <div className="mt-0.5 text-xs text-blue-500">Deals Open</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total deals</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{Object.values(cardStats).reduce((s, v) => s + v.deals, 0)}</div>
          <div className="mt-0.5 text-xs text-slate-400">{Object.values(cardStats).reduce((s, v) => s + v.won, 0)} won</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top Revenue */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 lg:col-span-1">
          <div className="mb-3 text-xs font-bold text-slate-700">Top CA par partenaire</div>
          {topRevenueData.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topRevenueData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {topRevenueData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Deals */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 lg:col-span-1">
          <div className="mb-3 text-xs font-bold text-slate-700">Top deals par partenaire</div>
          {topDealsData.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topDealsData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="deals" fill="#94a3b8" radius={[0, 6, 6, 0]} name="Total deals" />
                <Bar dataKey="won" fill="#10b981" radius={[0, 6, 6, 0]} name="Won" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Type Distribution */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 lg:col-span-1">
          <div className="mb-3 text-xs font-bold text-slate-700">Répartition par type</div>
          {typeDistribution.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, value }) => `${name} (${value})`} style={{ fontSize: 10 }}>
                  {typeDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filters + Table */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un partenaire…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none">
            <option value="Tous">Type: Tous</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="Non classé">Non classé</option>
          </select>
          <span className="text-xs text-slate-400">{filtered.length} partenaire{filtered.length > 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 text-xs">
                <SortHead label="Partenaire" k="name" sort={sort} setSort={setSort} />
                <SortHead label="Type" k="type" sort={sort} setSort={setSort} />
                <SortHead label="Deals" k="deals" sort={sort} setSort={setSort} />
                <SortHead label="Won" k="won" sort={sort} setSort={setSort} />
                <SortHead label="CA Won" k="revenue" sort={sort} setSort={setSort} />
                <SortHead label="Pipeline" k="pipeline" sort={sort} setSort={setSort} />
                <th className="py-3 px-2 text-left text-xs font-semibold text-slate-500">Contact</th>
                <th className="py-3 px-2 text-left text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">Chargement…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">Aucun partenaire.</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-2">
                      <Link href={`/partenaires/${c.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                        {c.name}
                      </Link>
                      {c.website && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{c.website}</div>}
                    </td>
                    <td className="py-3 px-2"><TypeBadge type={c.type} /></td>
                    <td className="py-3 px-2 text-sm text-slate-700 font-medium">{c.stats.deals || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-2 text-sm font-semibold text-emerald-600">{c.stats.won || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-2 text-sm font-semibold text-slate-900">{c.stats.revenue > 0 ? mad(c.stats.revenue) : <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-2 text-sm text-blue-600">{c.stats.pipeline > 0 ? mad(c.stats.pipeline) : <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-2">
                      {c.contact_name ? (
                        <div>
                          <div className="text-xs font-medium text-slate-700">{c.contact_name}</div>
                          {c.contact_email && <div className="text-[10px] text-slate-400">{c.contact_email}</div>}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <Link href={`/partenaires/${c.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Voir fiche">
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <button onClick={() => openEdit(c)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Modifier">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(c.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition" title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          role="presentation" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
          onKeyDown={e => { if (e.key === 'Escape') setShowForm(false) }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 space-y-4" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{editRow ? 'Modifier le partenaire' : 'Nouveau partenaire'}</h2>
              <button onClick={() => setShowForm(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FL label="Nom *" required><input value={fName} onChange={e => setFName(e.target.value)} className={inputCls} placeholder="Ex: Dell, HPE…" /></FL>
              <FL label="Type"><select value={fType} onChange={e => setFType(e.target.value)} className={selectCls}>{TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></FL>
              <FL label="Site web"><input value={fWebsite} onChange={e => setFWebsite(e.target.value)} className={inputCls} placeholder="https://…" /></FL>
              <FL label="Contact"><input value={fContactName} onChange={e => setFContactName(e.target.value)} className={inputCls} placeholder="Nom du contact" /></FL>
              <FL label="Email"><input type="email" value={fContactEmail} onChange={e => setFContactEmail(e.target.value)} className={inputCls} placeholder="email@example.com" /></FL>
              <FL label="Téléphone"><input value={fContactPhone} onChange={e => setFContactPhone(e.target.value)} className={inputCls} placeholder="+212…" /></FL>
            </div>
            <FL label="Notes"><textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" placeholder="Notes…" /></FL>
            <div className="flex gap-3 pt-2">
              <Btn variant="ghost" onClick={() => setShowForm(false)} className="flex-1">Annuler</Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving} className="flex-[2]">{saving ? 'Sauvegarde…' : editRow ? 'Enregistrer' : 'Créer'}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          role="presentation" onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="text-base font-bold text-slate-900">Supprimer ce partenaire ?</h3>
            <p className="mt-2 text-sm text-slate-600">Cette action est irréversible. Les deals existants ne seront pas affectés.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDeleteId(null)}>Annuler</Btn>
              <Btn variant="danger" onClick={handleDelete}>Supprimer</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
