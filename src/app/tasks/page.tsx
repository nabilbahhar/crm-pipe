'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import PurchaseModal from '@/components/PurchaseModal'
import {
  CheckCircle2, RefreshCw, ChevronRight, Package,
  Search, ArrowUp, ArrowDown, ChevronsUpDown, X,
} from 'lucide-react'

type TaskType = 'relance_retard' | 'achat_manquant'
type Priority = 'high' | 'medium'
type SortKey  = 'priority' | 'title' | 'amount' | 'daysLate'

type Task = {
  id: string; type: TaskType; priority: Priority
  title: string; subtitle: string; detail: string
  amount: number; daysLate: number
  entity_id: string; entity?: any
}

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

const fmtAmt = (n: number) =>
  n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M MAD` : `${Math.round(n/1000)}K MAD`

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [purchaseDeal, setPurchaseDeal] = useState<any | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<'Tous' | TaskType>('Tous')
  const [prioFilter, setPrioFilter] = useState<'Tous' | Priority>('Tous')
  const [sortKey, setSortKey]       = useState<SortKey>('priority')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [a, b] = await Promise.all([loadRelances(), loadAchats()])
      setTasks([...a, ...b])
    } catch (e: any) { setErr(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }

  async function loadRelances(): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('prospects')
      .select('id, company_name, contact_name, status, next_date, next_action')
      .is('converted_at', null)
      .neq('status', 'Qualifié ✓')
      .lt('next_date', today)
      .order('next_date', { ascending: true })
    if (error) throw error
    return (data || []).map(p => {
      const daysLate = Math.floor((Date.now() - new Date(p.next_date).getTime()) / 86400000)
      return {
        id: `relance_${p.id}`, type: 'relance_retard', priority: daysLate > 3 ? 'high' : 'medium',
        title: p.company_name, subtitle: p.contact_name || '',
        detail: `${p.next_action || 'Relancer'} · ${p.status}`,
        amount: 0, daysLate, entity_id: p.id, entity: p,
      }
    })
  }

  async function loadAchats(): Promise<Task[]> {
    const { data: won, error } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, po_number, accounts(name)')
      .eq('status', 'Won').order('amount', { ascending: false })
    if (error) throw error
    if (!won?.length) return []
    const { data: filled } = await supabase
      .from('purchase_info').select('opportunity_id')
      .in('opportunity_id', won.map((d: any) => d.id))
    const filledIds = new Set((filled || []).map((p: any) => p.opportunity_id))
    return won.filter((d: any) => !filledIds.has(d.id)).map((d: any) => ({
      id: `achat_${d.id}`, type: 'achat_manquant', priority: 'high',
      title: (d.accounts as any)?.name || d.title, subtitle: d.title,
      detail: `PO ${d.po_number || '—'} · ${d.bu || '—'}`,
      amount: d.amount || 0, daysLate: 0,
      entity_id: d.id, entity: { ...d, accounts: d.accounts },
    }))
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let res = tasks.filter(t => {
      if (doneIds.has(t.id)) return false
      if (q && !t.title.toLowerCase().includes(q) && !t.subtitle.toLowerCase().includes(q)) return false
      if (typeFilter !== 'Tous' && t.type !== typeFilter) return false
      if (prioFilter !== 'Tous' && t.priority !== prioFilter) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...res].sort((a, b) => {
      if (sortKey === 'priority') return dir * ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      if (sortKey === 'amount')   return dir * (b.amount - a.amount)
      if (sortKey === 'daysLate') return dir * (b.daysLate - a.daysLate)
      if (sortKey === 'title')    return dir * a.title.localeCompare(b.title, 'fr')
      return 0
    })
  }, [tasks, doneIds, search, typeFilter, prioFilter, sortKey, sortDir])

  const allActive      = tasks.filter(t => !doneIds.has(t.id))
  const totalAchatAmt  = allActive.filter(t => t.type === 'achat_manquant').reduce((s, t) => s + t.amount, 0)
  const relances       = visible.filter(t => t.type === 'relance_retard')
  const achats         = visible.filter(t => t.type === 'achat_manquant')
  const markDone       = (id: string) => setDoneIds(prev => new Set([...prev, id]))

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  function SI({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 shrink-0" />
    return sortDir === 'desc'
      ? <ArrowDown className="h-3 w-3 shrink-0" />
      : <ArrowUp className="h-3 w-3 shrink-0" />
  }

  function TH({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none transition-colors
          ${right ? 'text-right' : 'text-left'}
          ${sortKey === col ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
        <span className="inline-flex items-center gap-1">{!right && label}<SI col={col} />{right && label}</span>
      </th>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md text-lg">✅</div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Tasks</h1>
              <p className="text-xs text-slate-500">{visible.length} affichées · {allActive.length} total</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total tâches',    value: allActive.length,                                                      txt: 'text-slate-800',   border: 'border-slate-100' },
            { label: 'Fiches achat',    value: allActive.filter(t => t.type === 'achat_manquant').length,             txt: 'text-amber-600',   border: 'border-amber-100' },
            { label: 'Relances retard', value: allActive.filter(t => t.type === 'relance_retard').length,             txt: 'text-red-600',     border: 'border-red-100'   },
            { label: 'CA à commander',  value: totalAchatAmt >= 1000 ? fmtAmt(totalAchatAmt) : `${totalAchatAmt} MAD`, txt: 'text-emerald-700', border: 'border-emerald-100', str: true },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border ${k.border} bg-white p-4 shadow-sm`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
              <div className={`mt-1 text-xl font-black truncate ${k.txt}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher…"
              className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')}><X className="h-3.5 w-3.5 text-slate-300" /></button>}
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['Tous', 'achat_manquant', 'relance_retard'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
                  ${typeFilter === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'Tous' ? 'Tout' : t === 'achat_manquant' ? '📦 Fiches achat' : '⏰ Relances'}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['Tous', 'high', 'medium'] as const).map(p => (
              <button key={p} onClick={() => setPrioFilter(p)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                  ${prioFilter === p ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {p === 'Tous' ? 'Toutes priorités' : p === 'high' ? '🔴 Urgent' : '🟡 Normal'}
              </button>
            ))}
          </div>

          {(search || typeFilter !== 'Tous' || prioFilter !== 'Tous') && (
            <button onClick={() => { setSearch(''); setTypeFilter('Tous'); setPrioFilter('Tous') }}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-500 hover:text-red-500 transition-colors">
              <X className="h-3.5 w-3.5" /> Réinitialiser
            </button>
          )}
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠️ {err}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-400" />
            <div className="text-lg font-bold text-slate-700">
              {allActive.length === 0 ? 'Tout est à jour ! 🎉' : 'Aucun résultat'}
            </div>
            {allActive.length > 0 && (
              <button onClick={() => { setSearch(''); setTypeFilter('Tous'); setPrioFilter('Tous') }}
                className="mt-2 text-sm text-blue-600 hover:underline">Réinitialiser les filtres</button>
            )}
          </div>
        ) : (
          <div className="space-y-5">

            {/* Fiches achat */}
            {achats.length > 0 && (typeFilter === 'Tous' || typeFilter === 'achat_manquant') && (
              <TaskSection icon="📦" title="Fiches achat à compléter" count={achats.length} color="amber">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Deal</th>
                      <TH col="amount" label="Montant" right />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">PO</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {achats.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{t.subtitle}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{t.amount > 0 ? mad(t.amount) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.entity?.po_number || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => setPurchaseDeal(t.entity)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 transition-colors">
                              <Package className="h-3.5 w-3.5" /> Remplir fiche
                            </button>
                            <button onClick={() => markDone(t.id)} title="Ignorer"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50 transition-colors">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* Relances */}
            {relances.length > 0 && (typeFilter === 'Tous' || typeFilter === 'relance_retard') && (
              <TaskSection icon="⏰" title="Relances en retard" count={relances.length} color="red">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <TH col="title" label="Prospect" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Action prévue</th>
                      <TH col="daysLate" label="Retard" right />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {relances.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.subtitle || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{t.entity?.next_action || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                            ${t.daysLate > 7 ? 'bg-red-100 text-red-700' : t.daysLate > 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {t.daysLate}j
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <a href="/prospection"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              Voir <ChevronRight className="h-3.5 w-3.5" />
                            </a>
                            <button onClick={() => markDone(t.id)} title="Ignorer"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50 transition-colors">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

          </div>
        )}
      </div>

      {purchaseDeal && (
        <PurchaseModal
          deal={purchaseDeal}
          onClose={() => setPurchaseDeal(null)}
          onSaved={() => { setDoneIds(prev => new Set([...prev, `achat_${purchaseDeal.id}`])); setPurchaseDeal(null) }}
        />
      )}
    </div>
  )
}

function TaskSection({ icon, title, count, color, children }: {
  icon: string; title: string; count: number
  color: 'amber' | 'red'; children: React.ReactNode
}) {
  const cfg = {
    amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-200 text-amber-800' },
    red:   { border: 'border-red-200',   bg: 'bg-red-50',   text: 'text-red-800',   badge: 'bg-red-200 text-red-800'   },
  }[color]
  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
      <div className={`flex items-center gap-2 px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
        <span>{icon}</span>
        <span className={`text-sm font-bold ${cfg.text}`}>{title}</span>
        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>{count}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
