'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import {
  Search, Trash2, Loader2, AlertTriangle, X, ExternalLink,
  TrendingUp, CheckCircle2, XCircle, Clock, RotateCcw, ChevronDown,
  Building2, Filter, SlidersHorizontal,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────
type Deal = {
  id: string; title: string; status: 'Open' | 'Won' | 'Lost'
  stage: string; amount: number; prob: number
  created_at: string; updated_at?: string; owner_email?: string
  close_date?: string; booking_month?: string
  bu?: string; vendor?: string; po_number?: string; next_step?: string
  account_id?: string | null
  accounts?: { name?: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────
const mad = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MAD'

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const closingOf = (d: Deal) =>
  d.booking_month || d.close_date

const STATUS_CFG = {
  Open: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  icon: <Clock className="h-3 w-3" />,        dot: 'bg-amber-400'   },
  Won:  { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',icon: <CheckCircle2 className="h-3 w-3" />, dot: 'bg-emerald-500' },
  Lost: { bg: 'bg-red-50',     text: 'text-red-600',    border: 'border-red-200',    icon: <XCircle className="h-3 w-3" />,       dot: 'bg-red-400'     },
} as const

const STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit']

// ─── Delete confirmation modal ────────────────────────────────
function DeleteModal({
  deal, onConfirm, onCancel, deleting
}: {
  deal: Deal; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed.toLowerCase() === 'supprimer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-red-100 bg-red-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-red-900">Supprimer ce deal ?</h2>
              <p className="mt-0.5 text-sm text-red-600">Cette action est irréversible.</p>
            </div>
          </div>
        </div>

        {/* Deal info */}
        <div className="px-6 py-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-4">
            <div className="font-bold text-slate-900">{deal.title}</div>
            {deal.accounts?.name && (
              <div className="mt-0.5 text-sm text-slate-500 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {deal.accounts.name}
              </div>
            )}
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="font-bold text-slate-800">{mad(deal.amount)}</span>
              <span className="text-slate-300">·</span>
              <span className={`font-semibold ${STATUS_CFG[deal.status].text}`}>{deal.status}</span>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-3">
            Tape <strong className="text-red-600 font-mono">supprimer</strong> pour confirmer :
          </p>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="supprimer"
            autoFocus
            className="w-full h-10 rounded-xl border-2 border-slate-200 px-4 text-sm outline-none focus:border-red-400 transition font-mono"
          />
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onCancel}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={!confirmed || deleting}
            className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
            {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Suppression…</> : <><Trash2 className="h-4 w-4" /> Supprimer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Undo Status Modal ────────────────────────────────────────
function UndoStatusModal({
  deal, onConfirm, onCancel, undoing
}: {
  deal: Deal; targetStatus: 'Open' | 'Won' | 'Lost'; onConfirm: (s: 'Open'|'Won'|'Lost') => void; onCancel: () => void; undoing: boolean
}) {
  const [target, setTarget] = useState<'Open'|'Won'|'Lost'>('Open')
  const current = STATUS_CFG[deal.status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-blue-900">Modifier le statut</h2>
              <p className="mt-0.5 text-sm text-blue-600">Changer le statut de ce deal</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
            <span className="text-slate-500">Statut actuel : </span>
            <span className={`font-bold ${current.text}`}>{deal.status}</span>
          </div>
          <p className="text-sm font-semibold text-slate-700">Changer vers :</p>
          <div className="grid grid-cols-3 gap-2">
            {(['Open','Won','Lost'] as const).filter(s => s !== deal.status).map(s => {
              const cfg = STATUS_CFG[s]
              return (
                <button key={s} onClick={() => setTarget(s)}
                  className={`rounded-xl border-2 p-3 text-sm font-bold transition flex flex-col items-center gap-1.5
                    ${target === s ? `${cfg.border} ${cfg.bg} ${cfg.text}` : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}>
                  <span className="text-lg">{s === 'Open' ? '🔓' : s === 'Won' ? '🏆' : '❌'}</span>
                  {s}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onCancel}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button onClick={() => onConfirm(target)} disabled={undoing}
            className="flex-1 h-10 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40 transition flex items-center justify-center gap-2">
            {undoing ? <><Loader2 className="h-4 w-4 animate-spin" /> Mise à jour…</> : <><RotateCcw className="h-4 w-4" /> Confirmer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function DealsPage() {
  const router = useRouter()

  const [deals, setDeals]         = useState<Deal[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusF, setStatusF]     = useState<Set<string>>(new Set())
  const [stageF, setStageF]       = useState<Set<string>>(new Set())

  // Delete
  const [toDelete, setToDelete]   = useState<Deal | null>(null)
  const [deleting, setDeleting]   = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  // Undo status
  const [toUndo, setToUndo]       = useState<Deal | null>(null)
  const [undoing, setUndoing]     = useState(false)

  // Toast
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadDeals() }, [])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadDeals() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, title, status, stage, amount, prob, created_at, updated_at, owner_email, close_date, booking_month, bu, vendor, po_number, next_step, account_id')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) { console.error('Deals query error:', error); setDeals([]) }
      else if (data) setDeals(data.map(d => ({
        ...d,
        accounts: null
      })))
    } catch (e) {
      console.error('loadDeals exception:', e)
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────
  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    setDeleteErr(null)
    try {
      // Delete related records first
      await Promise.all([
        supabase.from('deal_files').delete().eq('opportunity_id', toDelete.id),
        supabase.from('purchase_lines')
          .delete()
          .in('purchase_info_id',
            (await supabase.from('purchase_info').select('id').eq('opportunity_id', toDelete.id)).data?.map((r:any)=>r.id) || []
          ),
        supabase.from('supply_orders').delete().eq('opportunity_id', toDelete.id),
      ])
      await supabase.from('purchase_info').delete().eq('opportunity_id', toDelete.id)
      const { error } = await supabase.from('opportunities').delete().eq('id', toDelete.id)
      if (error) throw error

      await logActivity({
        action_type: 'delete', entity_type: 'deal', entity_id: toDelete.id,
        entity_name: toDelete.accounts?.name || toDelete.title,
        detail: `Deal supprimé · ${mad(toDelete.amount)} · ${toDelete.status}`,
      })

      setDeals(p => p.filter(d => d.id !== toDelete.id))
      setToDelete(null)
      showToast(`Deal "${toDelete.title}" supprimé`)
    } catch (e: any) {
      setDeleteErr(e?.message || 'Erreur suppression')
    }
    setDeleting(false)
  }

  // ── Undo/Change status ──────────────────────────────────────
  async function confirmUndo(newStatus: 'Open' | 'Won' | 'Lost') {
    if (!toUndo) return
    setUndoing(true)
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', toUndo.id)
      if (error) throw error

      await logActivity({
        action_type: 'update', entity_type: 'deal', entity_id: toUndo.id,
        entity_name: toUndo.accounts?.name || toUndo.title,
        detail: `Statut modifié : ${toUndo.status} → ${newStatus}`,
      })

      setDeals(p => p.map(d => d.id === toUndo.id ? { ...d, status: newStatus } : d))
      showToast(`Statut mis à jour → ${newStatus}`)
      setToUndo(null)
    } catch (e: any) {
      showToast(e?.message || 'Erreur mise à jour', 'error')
    }
    setUndoing(false)
  }

  // ── Filter ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return deals.filter(d => {
      if (q && !d.title.toLowerCase().includes(q) && !(d.accounts?.name||'').toLowerCase().includes(q) && !(d.po_number||'').toLowerCase().includes(q)) return false
      if (statusF.size > 0 && !statusF.has(d.status)) return false
      if (stageF.size > 0 && !stageF.has(d.stage)) return false
      return true
    })
  }, [deals, search, statusF, stageF])

  const kpis = useMemo(() => ({
    total:    deals.length,
    open:     deals.filter(d => d.status === 'Open').reduce((s,d) => s + d.amount, 0),
    won:      deals.filter(d => d.status === 'Won').reduce((s,d) => s + d.amount, 0),
    lostCnt:  deals.filter(d => d.status === 'Lost').length,
  }), [deals])

  function toggleFilter(set: Set<string>, val: string): Set<string> {
    const n = new Set(set)
    n.has(val) ? n.delete(val) : n.add(val)
    return n
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900">Deals</h1>
            <p className="text-sm text-slate-400">{deals.length} deal{deals.length > 1 ? 's' : ''} au total</p>
          </div>
          <button onClick={() => router.push('/pipeline')}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 transition shadow-sm">
            <TrendingUp className="h-4 w-4" /> Vue Pipeline
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total deals"   value={String(kpis.total)}  color="slate"   />
          <KpiCard label="Pipeline Open" value={mad(kpis.open)}      color="amber"   />
          <KpiCard label="Gagné (total)" value={mad(kpis.won)}       color="emerald" />
          <KpiCard label="Deals perdus"  value={String(kpis.lostCnt)} color="red"    />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1" style={{ minWidth: 220 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full h-9 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400 transition shadow-sm" />
          </div>
          <div className="flex items-center gap-1.5">
            {(['Open','Won','Lost'] as const).map(s => {
              const c = STATUS_CFG[s]
              const active = statusF.has(s)
              return (
                <button key={s} onClick={() => setStatusF(toggleFilter(statusF, s))}
                  className={`h-9 rounded-xl border px-3 text-xs font-bold transition ${active ? `${c.bg} ${c.text} ${c.border}` : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                  {s}
                </button>
              )
            })}
          </div>
          {(statusF.size > 0 || stageF.size > 0 || search) && (
            <button onClick={() => { setStatusF(new Set()); setStageF(new Set()); setSearch('') }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 transition flex items-center gap-1.5">
              <X className="h-3.5 w-3.5" /> Effacer
            </button>
          )}
          <span className="ml-auto text-sm text-slate-400">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-slate-500 font-medium">Aucun deal trouvé</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Deal / Client</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 w-24">Statut</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-32">Stage</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-40">Montant</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-20">Prob</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-28">Clôture</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(d => {
                  const scfg = STATUS_CFG[d.status]
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Deal info */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 leading-snug">{d.title}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {d.accounts?.name && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Building2 className="h-3 w-3 shrink-0" />{d.accounts.name}
                            </span>
                          )}
                          {d.bu && <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 font-medium">{d.bu}</span>}
                          {d.po_number && <span className="text-[10px] text-slate-400 font-mono">PO {d.po_number}</span>}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${scfg.bg} ${scfg.text} ${scfg.border}`}>
                          {scfg.icon} {d.status}
                        </span>
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-medium text-slate-600">{d.stage || '—'}</span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-bold text-slate-900 tabular-nums">{mad(d.amount)}</span>
                      </td>

                      {/* Prob */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${d.prob || 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums w-7">{d.prob || 0}%</span>
                        </div>
                      </td>

                      {/* Closing */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-500">{fmtDate(closingOf(d))}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Open detail */}
                          <button onClick={() => router.push(`/opportunities/${d.id}`)} title="Voir détail"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>

                          {/* Change status (undo) */}
                          <button onClick={() => setToUndo(d)} title="Modifier le statut"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          <button onClick={() => { setDeleteErr(null); setToDelete(d) }} title="Supprimer"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-200 hover:bg-red-50 hover:text-red-500 transition">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── Delete modal ── */}
      {toDelete && (
        <DeleteModal
          deal={toDelete}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
          deleting={deleting}
        />
      )}

      {/* ── Undo/Status modal ── */}
      {toUndo && (
        <UndoStatusModal
          deal={toUndo}
          targetStatus="Open"
          onConfirm={confirmUndo}
          onCancel={() => setToUndo(null)}
          undoing={undoing}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-xl text-sm font-semibold transition-all
          ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: string; color: 'slate'|'amber'|'emerald'|'red' }) {
  const styles = {
    slate:   'bg-slate-900 text-white',
    amber:   'bg-amber-50 border border-amber-100 text-amber-900',
    emerald: 'bg-emerald-50 border border-emerald-100 text-emerald-900',
    red:     'bg-red-50 border border-red-100 text-red-900',
  }
  const sub = {
    slate:   'text-slate-400',
    amber:   'text-amber-500',
    emerald: 'text-emerald-500',
    red:     'text-red-400',
  }
  return (
    <div className={`rounded-2xl p-4 ${styles[color]}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${sub[color]}`}>{label}</div>
      <div className="text-base font-black tabular-nums leading-tight">{value}</div>
    </div>
  )
}
