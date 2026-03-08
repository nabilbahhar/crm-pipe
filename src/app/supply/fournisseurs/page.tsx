'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import {
  Plus, Search, Edit2, Trash2, X, Save, Loader2, Download,
  Building2, Phone, Mail, MapPin, Tag, TrendingUp,
  Package, Users, ChevronUp, ChevronDown, ChevronsUpDown,
  BarChart2, ShoppingCart, FileText, RefreshCw, ChevronRight, ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Supplier = {
  id: string; name: string; contact: string | null; email: string | null
  tel: string | null; address: string | null; category: string | null
  notes: string | null; created_at: string; created_by: string | null
}
type SupplierStats = {
  supplier_name: string; total_orders: number; total_lines: number
  total_achat_ht: number; total_vente_ht: number
  last_order_date: string | null; nb_clients: number; avg_marge_pct: number | null
}
type SupplierRow = Supplier & Partial<SupplierStats>

const CATEGORIES = ['Matériel IT', 'Logiciels', 'Réseau & Infra', 'Périphériques', 'Services', 'Autre']

const mad = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' MAD'

// ─── Modal Edition ────────────────────────────────────────────
function SupplierModal({
  supplier, onClose, onSaved, userEmail,
}: {
  supplier: Partial<Supplier> | null
  onClose: () => void; onSaved: () => void; userEmail: string | null
}) {
  const [form, setForm] = useState({
    name: supplier?.name || '', contact: supplier?.contact || '',
    email: supplier?.email || '', tel: supplier?.tel || '',
    address: supplier?.address || '', category: supplier?.category || '',
    notes: supplier?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inp = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 transition-colors'

  async function handleSave() {
    if (!form.name.trim()) { setErr('Le nom est obligatoire.'); return }
    setSaving(true); setErr(null)
    try {
      const payload = { ...form, name: form.name.trim() }
      if (supplier?.id) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', supplier.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, created_by: userEmail })
        if (error) throw error
      }
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Erreur sauvegarde')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white text-lg">🏭</div>
            <div>
              <div className="text-sm font-bold text-slate-900">{supplier?.id ? 'Modifier' : 'Nouveau'} fournisseur</div>
              {supplier?.id && <div className="text-xs text-slate-400">{supplier.name}</div>}
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Nom fournisseur <span className="text-red-400">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dell Technologies, HP, Cisco…" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Contact principal</label>
              <input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Nom du contact" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Catégorie</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inp}>
                <option value="">— Choisir —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@fournisseur.com" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Téléphone</label>
              <input value={form.tel} onChange={e => set('tel', e.target.value)} placeholder="+212 6XX XXX XXX" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Adresse</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Casablanca, Maroc…" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Délais livraison, conditions tarifaires…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sauvegarde…</> : <><Save className="h-3.5 w-3.5" />Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
type SortKey = 'name' | 'total_orders' | 'total_achat_ht' | 'last_order_date' | 'avg_marge_pct'

export default function SuppliersPage() {
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [stats, setStats]           = useState<SupplierStats[]>([])
  const [loading, setLoading]       = useState(true)
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [modal, setModal]           = useState<Partial<Supplier> | null | false>(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('Toutes')
  const [sortKey, setSortKey]       = useState<SortKey>('name')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Fournisseurs \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: sups }, { data: statsData }] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('supplier_stats').select('*'),
    ])
    setSuppliers(sups || [])
    setStats(statsData || [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce fournisseur ?')) return
    setDeleting(id)
    await supabase.from('suppliers').delete().eq('id', id)
    setDeleting(null)
    loadAll()
  }

  // Merge suppliers + stats
  const rows: SupplierRow[] = suppliers.map(s => ({
    ...s,
    ...(stats.find(st => st.supplier_name?.toLowerCase() === s.name?.toLowerCase()) || {}),
  }))

  // Totals for KPI
  const totalSuppliers = rows.length
  const totalAchat     = stats.reduce((s, r) => s + (Number(r.total_achat_ht) || 0), 0)
  const totalOrders    = stats.reduce((s, r) => s + (Number(r.total_orders)    || 0), 0)
  const avgMarge       = stats.filter(r => r.avg_marge_pct != null).reduce((s, r, _, a) => s + (Number(r.avg_marge_pct) || 0) / a.length, 0)

  // Filter
  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || r.name.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q)
    const matchC = catFilter === 'Toutes' || r.category === catFilter
    return matchQ && matchC
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av: any = a[sortKey as keyof SupplierRow], bv: any = b[sortKey as keyof SupplierRow]
    if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
    if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 text-slate-300" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
  }
  const Th = ({ label, k, right }: { label: string; k?: SortKey; right?: boolean }) => (
    <th onClick={k ? () => toggleSort(k) : undefined}
      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${right ? 'text-right' : 'text-left'} ${k ? 'cursor-pointer hover:text-slate-600 select-none' : ''}`}>
      <span className="inline-flex items-center gap-1">{label}{k && <SortIcon k={k} />}</span>
    </th>
  )

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAchat = sorted.reduce((s,x) => s+(x.total_achat_ht||0), 0)
      const totalVente = sorted.reduce((s,x) => s+(x.total_vente_ht||0), 0)
      const totalOrders = sorted.reduce((s,x) => s+(x.total_orders||0), 0)
      const avgMarge = sorted.length > 0 ? sorted.reduce((s,x) => s+(x.avg_marge_pct||0), 0) / sorted.length : 0

      const catMap = new Map<string, { count: number; achat: number }>()
      sorted.forEach(s => {
        const cat = s.category || 'Non catégorisé'
        const prev = catMap.get(cat) || { count: 0, achat: 0 }
        catMap.set(cat, { count: prev.count + 1, achat: prev.achat + (s.total_achat_ht||0) })
      })

      const spec = {
        filename: `fournisseurs_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Fournisseurs',
          title: `Fournisseurs · ${sorted.length} · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Nom','Contact','Email','Téléphone','Catégorie','Commandes','Lignes','Achat HT (MAD)','Vente HT (MAD)','Marge %','Clients'],
          rows: sorted.map(s => [
            s.name, s.contact||'—', s.email||'—', s.tel||'—', s.category||'—',
            s.total_orders||0, s.total_lines||0,
            s.total_achat_ht||0, s.total_vente_ht||0,
            s.avg_marge_pct!=null ? Number(s.avg_marge_pct.toFixed(1)) : 0,
            s.nb_clients||0,
          ]),
          totalsRow: ['TOTAL', `${sorted.length}`, '', '', '', totalOrders, sorted.reduce((s,x)=>s+(x.total_lines||0),0), totalAchat, totalVente, '', ''],
        }],
        summary: {
          title: `Résumé Fournisseurs · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total fournisseurs', value: sorted.length, detail: `${totalOrders} commandes au total` },
            { label: 'Total achat HT', value: totalAchat, detail: 'Montant total des achats' },
            { label: 'Total vente HT', value: totalVente, detail: 'Montant total des ventes' },
            { label: 'Marge moyenne', value: `${avgMarge.toFixed(1)}%`, detail: 'Marge brute moyenne' },
          ],
          breakdownTitle: 'Répartition par catégorie',
          breakdownHeaders: ['Catégorie', 'Achat HT (MAD)', 'Nb fournisseurs', '% du total'],
          breakdown: [...catMap.entries()].sort((a,b) => b[1].achat - a[1].achat).map(([cat, v]) => [
            cat, v.achat, v.count, totalAchat > 0 ? `${Math.round(v.achat / totalAchat * 100)}%` : '0%',
          ]),
        },
      }
      const res = await fetch('/api/excel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message||'Erreur export') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Fournisseurs</h1>
            <p className="text-xs text-slate-500 mt-0.5">Base de données achats · {totalSuppliers} fournisseur{totalSuppliers > 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} title="Export Excel" disabled={exporting}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => setModal({})}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Ajouter fournisseur
            </button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: '🏭', label: 'Fournisseurs', value: totalSuppliers.toString(), color: 'text-slate-800' },
            { icon: '📦', label: 'Total commandes', value: totalOrders.toString(), color: 'text-blue-700' },
            { icon: '💰', label: 'Volume achat', value: mad(totalAchat), color: 'text-slate-800' },
            { icon: '📊', label: 'Marge moy.', value: stats.length ? `${avgMarge.toFixed(1)}%` : '—', color: avgMarge >= 20 ? 'text-emerald-700' : avgMarge >= 10 ? 'text-amber-600' : 'text-red-600' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{k.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</span>
              </div>
              <div className={`text-lg font-black ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── Bar chart: top 6 suppliers by volume ── */}
        {stats.filter(s => Number(s.total_achat_ht) > 0).length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">📈 Volume achat par fournisseur</div>
            <BarChartSuppliers stats={stats} />
          </div>
        )}

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un fournisseur…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="flex flex-wrap gap-2">
            {['Toutes', ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`h-8 rounded-xl px-3 text-xs font-semibold transition-colors ${catFilter === c ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {c}
              </button>
            ))}
          </div>
          <button onClick={loadAll} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">🏭</span>
              <p className="text-sm font-semibold text-slate-700">Aucun fournisseur trouvé</p>
              <p className="text-xs text-slate-400 mt-1">Ajoute ton premier fournisseur pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <Th label="Fournisseur" k="name" />
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Catégorie</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact</th>
                    <Th label="Commandes" k="total_orders" right />
                    <Th label="Volume achat" k="total_achat_ht" right />
                    <Th label="Marge moy." k="avg_marge_pct" right />
                    <Th label="Dernière cmd." k="last_order_date" right />
                    <th className="px-4 py-3 w-[80px]" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(s => {
                    const isExpanded = expandedId === s.id
                    const marge      = Number(s.avg_marge_pct)
                    const hasOrders  = Number(s.total_orders) > 0
                    return (
                      <>
                        <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                                {s.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-900 text-sm">{s.name}</span>
                                  {Number(s.total_orders) > 0 && (
                                    <Link href={`/supply?vendor=${encodeURIComponent(s.name)}`}
                                      onClick={e => e.stopPropagation()}
                                      title="Voir commandes"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-300 hover:bg-blue-50 hover:text-blue-500 transition-colors">
                                      <ExternalLink className="h-3 w-3" />
                                    </Link>
                                  )}
                                </div>
                                {s.address && <div className="text-[11px] text-slate-400">{s.address}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {s.category ? (
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-100">{s.category}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700 font-medium">{s.contact || <span className="text-slate-300">—</span>}</div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {s.email && (
                                <a href={`mailto:${s.email}`} onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                                  title={`Envoyer un email à ${s.email}`}>
                                  <Mail className="h-2.5 w-2.5" />{s.email}
                                </a>
                              )}
                              {s.tel && (
                                <a href={`tel:${s.tel}`} onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
                                  title={`Appeler ${s.tel}`}>
                                  <Phone className="h-2.5 w-2.5" />{s.tel}
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasOrders ? (
                              <span className="font-bold text-slate-800">{s.total_orders}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasOrders ? (
                              <span className="font-semibold text-slate-700">{mad(s.total_achat_ht || 0)}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasOrders && marge > 0 ? (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${marge >= 20 ? 'bg-emerald-100 text-emerald-700' : marge >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                {marge.toFixed(1)}%
                              </span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-400">
                            {s.last_order_date ? new Date(s.last_order_date).toLocaleDateString('fr-MA') : <span className="text-slate-200">—</span>}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setModal(s)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                                {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded row */}
                        {isExpanded && (
                          <tr key={`${s.id}-exp`} className="bg-slate-50/80">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                                <InfoBlock icon="📦" label="Lignes commandées" value={s.total_lines?.toString() || '—'} />
                                <InfoBlock icon="💰" label="Total vente HT" value={mad(s.total_vente_ht || 0)} />
                                <InfoBlock icon="🏢" label="Clients servis" value={s.nb_clients?.toString() || '—'} />
                                <InfoBlock icon="📅" label="Créé le" value={new Date(s.created_at).toLocaleDateString('fr-MA')} />
                              </div>
                              {s.notes && (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                                  <span className="font-semibold text-slate-500">Notes : </span>{s.notes}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {modal !== false && (
        <SupplierModal
          supplier={modal}
          userEmail={userEmail}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); loadAll() }}
        />
      )}
    </div>
  )
}

// ─── Mini bar chart ────────────────────────────────────────────
function BarChartSuppliers({ stats }: { stats: SupplierStats[] }) {
  const top = [...stats]
    .filter(s => Number(s.total_achat_ht) > 0)
    .sort((a, b) => Number(b.total_achat_ht) - Number(a.total_achat_ht))
    .slice(0, 7)
  const max = Math.max(...top.map(s => Number(s.total_achat_ht)))
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toFixed(0)
  const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899']
  return (
    <div className="flex items-end gap-3 h-32">
      {top.map((s, i) => {
        const h = max > 0 ? (Number(s.total_achat_ht) / max) * 100 : 0
        return (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[10px] font-bold text-slate-600">{fmt(Number(s.total_achat_ht))}</div>
            <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(h, 4)}%`, background: COLORS[i % COLORS.length], minHeight: 4, maxHeight: 72 }} />
            <div className="text-[10px] text-slate-500 truncate w-full text-center max-w-[80px]">{s.supplier_name}</div>
          </div>
        )
      })}
    </div>
  )
}

function InfoBlock({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{icon} {label}</div>
      <div className="text-sm font-semibold text-slate-700">{value}</div>
    </div>
  )
}
