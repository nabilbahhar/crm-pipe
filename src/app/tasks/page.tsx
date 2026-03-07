'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { mad, fmt } from '@/lib/utils'
import {
  CheckCircle2, RefreshCw, ChevronRight, Package,
  Search, ArrowUp, ArrowDown, ChevronsUpDown, X,
  Clock, AlertCircle, PlayCircle, CircleDashed, CalendarClock,
} from 'lucide-react'

type TaskType   = 'relance_retard' | 'achat_manquant' | 'closing_retard'
type Priority   = 'high' | 'medium'
type FicheStatus = 'a_faire' | 'en_cours' | 'complete'
type SortKey    = 'priority' | 'title' | 'amount' | 'daysLate' | 'ficheStatus'

type Task = {
  id: string
  type: TaskType
  priority: Priority
  title: string
  subtitle: string
  detail: string
  amount: number
  daysLate: number
  ficheStatus: FicheStatus
  ficheProgress: number   // 0–100 % des lignes complètes
  linesTotal: number
  linesComplete: number
  entity_id: string
  entity?: any
}

const fmtAmt = (n: number) => `${fmt(n)} MAD`

// ── Status config ─────────────────────────────────────────────
const STATUS_CFG: Record<FicheStatus, { label: string; icon: React.ReactNode; badge: string; row: string }> = {
  a_faire:  {
    label: 'À faire',
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    badge: 'bg-slate-100 text-slate-500',
    row: '',
  },
  en_cours: {
    label: 'En cours',
    icon: <PlayCircle className="h-3.5 w-3.5" />,
    badge: 'bg-blue-100 text-blue-700',
    row: 'bg-blue-50/30',
  },
  complete: {
    label: 'Complet',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    badge: 'bg-emerald-100 text-emerald-700',
    row: '',
  },
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks]             = useState<Task[]>([])
  const [loading, setLoading]         = useState(true)
  const [err, setErr]                 = useState<string | null>(null)

  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<'Tous' | TaskType>('Tous')
  const [prioFilter, setPrioFilter]     = useState<'Tous' | Priority>('Tous')
  const [statusFilter, setStatusFilter] = useState<'Tous' | FicheStatus>('Tous')
  const [sortKey, setSortKey]           = useState<SortKey>('priority')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [a, b, c] = await Promise.all([loadRelances(), loadAchats(), loadClosingRetards()])
      setTasks([...a, ...b, ...c])
    } catch (e: any) { setErr(e?.message || 'Erreur chargement') }
    finally { setLoading(false) }
  }

  // ── Relances ────────────────────────────────────────────────
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
        id: `relance_${p.id}`,
        type: 'relance_retard',
        priority: daysLate > 3 ? 'high' : 'medium',
        title: p.company_name,
        subtitle: p.contact_name || '',
        detail: `${p.next_action || 'Relancer'} · ${p.status}`,
        amount: 0, daysLate,
        ficheStatus: 'a_faire',
        ficheProgress: 0,
        linesTotal: 0, linesComplete: 0,
        entity_id: p.id, entity: p,
      }
    })
  }

  // ── Fiches achat ─────────────────────────────────────────────
  async function loadAchats(): Promise<Task[]> {
    const { data: won, error } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, po_number, accounts(name)')
      .eq('status', 'Won')
      .order('amount', { ascending: false })
    if (error) throw error
    if (!won?.length) return []

    const { data: infos } = await supabase
      .from('purchase_info')
      .select('opportunity_id, purchase_lines(id, pu_achat, fournisseur, designation)')
      .in('opportunity_id', won.map((d: any) => d.id))

    // Build a map: opp_id → { total lines, complete lines }
    const infoMap = new Map<string, { total: number; complete: number }>()
    ;(infos || []).forEach((info: any) => {
      const lines: any[] = info.purchase_lines || []
      const complete = lines.filter(
        (ln: any) => Number(ln.pu_achat) > 0 && ln.fournisseur?.trim()
      ).length
      infoMap.set(info.opportunity_id, { total: lines.length, complete })
    })

    return won
      .filter((d: any) => {
        const info = infoMap.get(d.id)
        // Hide only if ALL lines are complete (total > 0 and complete === total)
        if (info && info.total > 0 && info.complete === info.total) return false
        return true
      })
      .map((d: any) => {
        const info = infoMap.get(d.id)
        let ficheStatus: FicheStatus = 'a_faire'
        let ficheProgress = 0
        let linesTotal = 0
        let linesComplete = 0

        if (info) {
          linesTotal    = info.total
          linesComplete = info.complete
          ficheProgress = info.total > 0 ? Math.round((info.complete / info.total) * 100) : 0
          ficheStatus   = info.total === 0 ? 'en_cours' : 'en_cours' // has a purchase_info record
        }

        return {
          id: `achat_${d.id}`,
          type: 'achat_manquant' as TaskType,
          priority: 'high' as Priority,
          title: (d.accounts as any)?.name || d.title,
          subtitle: d.title,
          detail: `PO ${d.po_number || '—'} · ${d.bu || '—'}`,
          amount: d.amount || 0,
          daysLate: 0,
          ficheStatus,
          ficheProgress,
          linesTotal,
          linesComplete,
          entity_id: d.id,
          entity: { ...d, accounts: d.accounts },
        }
      })
  }

  // ── Deals en retard closing ──────────────────────────────
  async function loadClosingRetards(): Promise<Task[]> {
    const now = new Date()
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, booking_month, stage, accounts(name)')
      .eq('status', 'Open')
      .lt('booking_month', thisM)
      .order('booking_month', { ascending: true })
    if (error) throw error
    return (data || []).map((d: any) => {
      const bm = d.booking_month || ''
      const bmDate = new Date(bm + '-01')
      const daysLate = Math.max(0, Math.floor((now.getTime() - bmDate.getTime()) / 86400000))
      return {
        id: `closing_${d.id}`,
        type: 'closing_retard' as TaskType,
        priority: (daysLate > 60 ? 'high' : 'medium') as Priority,
        title: (d.accounts as any)?.name || d.title,
        subtitle: d.title,
        detail: `${d.stage} · ${d.bu || '—'} · Closing: ${bm}`,
        amount: d.amount || 0,
        daysLate,
        ficheStatus: 'a_faire' as FicheStatus,
        ficheProgress: 0,
        linesTotal: 0, linesComplete: 0,
        entity_id: d.id, entity: d,
      }
    })
  }

  // ── Filtered & sorted list ────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let res = tasks.filter(t => {
      if (q && !t.title.toLowerCase().includes(q) && !t.subtitle.toLowerCase().includes(q)) return false
      if (typeFilter !== 'Tous' && t.type !== typeFilter) return false
      if (prioFilter !== 'Tous' && t.priority !== prioFilter) return false
      if (statusFilter !== 'Tous' && t.ficheStatus !== statusFilter) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    const statusOrder: Record<FicheStatus, number> = { en_cours: 0, a_faire: 1, complete: 2 }
    return [...res].sort((a, b) => {
      if (sortKey === 'priority')    return dir * ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      if (sortKey === 'amount')      return dir * (b.amount - a.amount)
      if (sortKey === 'daysLate')    return dir * (b.daysLate - a.daysLate)
      if (sortKey === 'title')       return dir * a.title.localeCompare(b.title, 'fr')
      if (sortKey === 'ficheStatus') return dir * (statusOrder[a.ficheStatus] - statusOrder[b.ficheStatus])
      return 0
    })
  }, [tasks, search, typeFilter, prioFilter, statusFilter, sortKey, sortDir])

  const totalTasks     = tasks.length
  const achatTasks     = tasks.filter(t => t.type === 'achat_manquant')
  const enCoursTasks   = achatTasks.filter(t => t.ficheStatus === 'en_cours')
  const aFaireTasks    = achatTasks.filter(t => t.ficheStatus === 'a_faire')
  const totalAchatAmt  = achatTasks.reduce((s, t) => s + t.amount, 0)
  const relances       = visible.filter(t => t.type === 'relance_retard')
  const achats         = visible.filter(t => t.type === 'achat_manquant')
  const closingRetards = visible.filter(t => t.type === 'closing_retard')

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  function SI({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 shrink-0" />
    return sortDir === 'desc' ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />
  }
  function TH({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none transition-colors whitespace-nowrap
          ${right ? 'text-right' : 'text-left'}
          ${sortKey === col ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
        <span className="inline-flex items-center gap-1">{!right && label}<SI col={col} />{right && label}</span>
      </th>
    )
  }

  const hasActiveFilters = search || typeFilter !== 'Tous' || prioFilter !== 'Tous' || statusFilter !== 'Tous'
  function resetFilters() { setSearch(''); setTypeFilter('Tous'); setPrioFilter('Tous'); setStatusFilter('Tous') }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md text-lg">✅</div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Tasks</h1>
              <p className="text-xs text-slate-500">{visible.length} affichées · {totalTasks} total</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total tâches',    value: totalTasks,                                                             txt: 'text-slate-800',   border: 'border-slate-100' },
            { label: 'Fiches à faire',  value: aFaireTasks.length,                                                     txt: 'text-amber-600',   border: 'border-amber-100' },
            { label: 'Fiches en cours', value: enCoursTasks.length,                                                    txt: 'text-blue-600',    border: 'border-blue-100'  },
            { label: 'CA à commander',  value: totalAchatAmt >= 1000 ? fmtAmt(totalAchatAmt) : `${totalAchatAmt} MAD`, txt: 'text-emerald-700', border: 'border-emerald-100' },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border ${k.border} bg-white p-4 shadow-sm`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
              <div className={`mt-1 text-xl font-black truncate ${k.txt}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher…"
              className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')}><X className="h-3.5 w-3.5 text-slate-300" /></button>}
          </div>

          {/* Type filter */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['Tous', 'achat_manquant', 'relance_retard', 'closing_retard'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
                  ${typeFilter === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'Tous' ? 'Tout' : t === 'achat_manquant' ? '📦 Fiches achat' : t === 'relance_retard' ? '⏰ Relances' : '📅 Closing retard'}
              </button>
            ))}
          </div>

          {/* Status filter — only relevant for achat tasks */}
          {(typeFilter === 'Tous' || typeFilter === 'achat_manquant') && (
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
              {([
                { key: 'Tous',     label: 'Tout' },
                { key: 'a_faire',  label: '⬜ À faire' },
                { key: 'en_cours', label: '🔵 En cours' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setStatusFilter(key as any)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
                    ${statusFilter === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Priority filter */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['Tous', 'high', 'medium'] as const).map(p => (
              <button key={p} onClick={() => setPrioFilter(p)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                  ${prioFilter === p ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {p === 'Tous' ? 'Toutes priorités' : p === 'high' ? '🔴 Urgent' : '🟡 Normal'}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button onClick={resetFilters}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-500 hover:text-red-500 transition-colors shadow-sm">
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
              {totalTasks === 0 ? 'Tout est à jour ! 🎉' : 'Aucun résultat'}
            </div>
            {totalTasks > 0 && (
              <button onClick={resetFilters} className="mt-2 text-sm text-blue-600 hover:underline">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Fiches achat ── */}
            {achats.length > 0 && (typeFilter === 'Tous' || typeFilter === 'achat_manquant') && (
              <TaskSection icon="📦" title="Fiches achat à compléter" count={achats.length} color="amber">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <TH col="title"       label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Deal</th>
                      <TH col="amount"      label="Montant" right />
                      <TH col="ficheStatus" label="Statut fiche" />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {achats.map(t => {
                      const cfg = STATUS_CFG[t.ficheStatus]
                      return (
                        <tr key={t.id} className={`transition-colors hover:bg-slate-50/60 ${cfg.row}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                              <span className="font-bold text-slate-900">{t.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px]">
                            <span className="truncate block">{t.subtitle}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {t.amount > 0 ? mad(t.amount) : '—'}
                          </td>
                          {/* Statut fiche avec progression */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${cfg.badge}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                              {t.ficheStatus === 'en_cours' && t.linesTotal > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-blue-500 transition-all"
                                      style={{ width: `${t.ficheProgress}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-semibold text-slate-500">
                                    {t.linesComplete}/{t.linesTotal}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center">
                              <button onClick={() => router.push(`/opportunities/${t.entity_id}/purchase`)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white transition-colors
                                  ${t.ficheStatus === 'en_cours'
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-amber-600 hover:bg-amber-700'}`}>
                                <Package className="h-3.5 w-3.5" />
                                {t.ficheStatus === 'en_cours' ? 'Compléter' : 'Remplir fiche'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Relances ── */}
            {relances.length > 0 && (typeFilter === 'Tous' || typeFilter === 'relance_retard') && (
              <TaskSection icon="⏰" title="Relances en retard" count={relances.length} color="red">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <TH col="title"    label="Prospect" />
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
                          <div className="flex items-center justify-center">
                            <a href="/prospection"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              Voir <ChevronRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Closing en retard ── */}
            {closingRetards.length > 0 && (typeFilter === 'Tous' || typeFilter === 'closing_retard') && (
              <TaskSection icon="📅" title="Deals — closing dépassé" count={closingRetards.length} color="red">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <TH col="title"    label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Deal</th>
                      <TH col="amount"   label="Montant" right />
                      <TH col="daysLate" label="Retard" right />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {closingRetards.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px]">
                          <span className="truncate block">{t.subtitle}</span>
                          <span className="text-[10px] text-slate-400">{t.detail}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {t.amount > 0 ? mad(t.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                            ${t.daysLate > 60 ? 'bg-red-100 text-red-700' : t.daysLate > 30 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {t.daysLate}j
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <button onClick={() => router.push(`/opportunities/${t.entity_id}`)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              Voir <ChevronRight className="h-3.5 w-3.5" />
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
    </div>
  )
}

// ── TaskSection ───────────────────────────────────────────────
function TaskSection({ icon, title, count, color, children }: {
  icon: string; title: string; count: number
  color: 'amber' | 'red'; children: React.ReactNode
}) {
  const cfg = {
    amber: { border: 'border-amber-200', bg: 'bg-amber-50',  text: 'text-amber-800', badge: 'bg-amber-200 text-amber-800' },
    red:   { border: 'border-red-200',   bg: 'bg-red-50',    text: 'text-red-800',   badge: 'bg-red-200 text-red-800'     },
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
