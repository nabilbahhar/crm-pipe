'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import PurchaseModal from '@/components/PurchaseModal'
import { RefreshCw, Package, ChevronRight, Search, AlertCircle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type SupplyStatus = 'a_commander' | 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'

type Order = {
  id: string
  opportunity_id: string
  status: SupplyStatus
  supply_notes: string | null
  placed_at: string | null
  ordered_at: string | null
  received_at: string | null
  delivered_at: string | null
  invoiced_at: string | null
  updated_at: string | null
  opportunities?: {
    id: string; title: string; amount: number
    po_number: string | null; po_date: string | null
    bu: string | null; vendor: string | null
    accounts?: { name?: string } | null
    purchase_info?: { id: string; frais_engagement: number; purchase_lines?: any[] }[] | null
  }
}

// ─── Config statuts ───────────────────────────────────────────
const STATUS_CONFIG: Record<SupplyStatus, {
  label: string; icon: string; color: string
  bg: string; border: string; next?: SupplyStatus
}> = {
  a_commander: { label: 'À commander', icon: '🟡', color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200', next: 'place'    },
  place:       { label: 'Placé',        icon: '🔵', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',  next: 'commande' },
  commande:    { label: 'Commandé',     icon: '🟣', color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200',next: 'en_stock' },
  en_stock:    { label: 'En stock',     icon: '🟠', color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200',next: 'livre'    },
  livre:       { label: 'Livré',        icon: '🟢', color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200',next: 'facture' },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',  bg: 'bg-slate-100',  border: 'border-slate-200'                   },
}

const ALL_STATUSES: SupplyStatus[] = ['a_commander','place','commande','en_stock','livre','facture']

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

// ─── Main ─────────────────────────────────────────────────────
export default function SupplyPage() {
  const [orders, setOrders]       = useState<Order[]>([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<SupplyStatus | 'Tous'>('Tous')
  const [updating, setUpdating]   = useState<string | null>(null)
  const [noteOpen, setNoteOpen]   = useState<string | null>(null)
  const [noteText, setNoteText]   = useState('')
  const [purchaseDeal, setPurchaseDeal] = useState<any | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    load()
  }, [])

  async function load() {
    setLoading(true); setErr(null)
    const { data, error } = await supabase
      .from('supply_orders')
      .select(`
        *,
        opportunities (
          id, title, amount, po_number, po_date, bu, vendor,
          accounts(name),
          purchase_info(id, frais_engagement, purchase_lines(*))
        )
      `)
      .order('created_at', { ascending: false })

    if (error) { setErr(error.message); setLoading(false); return }
    setOrders((data || []) as Order[])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      const name = o.opportunities?.accounts?.name || o.opportunities?.title || ''
      if (q && !name.toLowerCase().includes(q)) return false
      if (statusFilter !== 'Tous' && o.status !== statusFilter) return false
      return true
    })
  }, [orders, search, statusFilter])

  // Grouped by status
  const grouped = useMemo(() => {
    const g: Record<SupplyStatus, Order[]> = {
      a_commander: [], place: [], commande: [], en_stock: [], livre: [], facture: [],
    }
    filtered.forEach(o => { g[o.status as SupplyStatus]?.push(o) })
    return g
  }, [filtered])

  async function advanceStatus(order: Order) {
    const cfg = STATUS_CONFIG[order.status]
    if (!cfg.next) return
    setUpdating(order.id)

    const now = new Date().toISOString()
    const timestamps: Record<string, string> = {
      place: 'placed_at', commande: 'ordered_at',
      en_stock: 'received_at', livre: 'delivered_at', facture: 'invoiced_at',
    }
    const tsField = timestamps[cfg.next]

    await supabase.from('supply_orders').update({
      status: cfg.next,
      ...(tsField ? { [tsField]: now } : {}),
      updated_by: userEmail,
      updated_at: now,
    }).eq('id', order.id)

    setUpdating(null)
    load()
  }

  async function saveNote(orderId: string) {
    await supabase.from('supply_orders').update({
      supply_notes: noteText,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)
    setNoteOpen(null)
    load()
  }

  const toCommanderCount = grouped.a_commander.length

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Supply</h1>
              <p className="text-xs text-slate-500">
                Suivi commandes · {orders.length} commande{orders.length !== 1 ? 's' : ''}
                {toCommanderCount > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {toCommanderCount} à commander
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        {/* KPI bar */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s]
            const count = grouped[s].length
            return (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'Tous' : s)}
                className={`rounded-2xl border p-3 text-left transition-all shadow-sm
                  ${statusFilter === s ? `${cfg.bg} ${cfg.border}` : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{cfg.icon} {cfg.label}</div>
                <div className={`mt-1 text-2xl font-black ${statusFilter === s ? cfg.color : 'text-slate-800'}`}>{count}</div>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Chercher un compte…"
              className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>
          <div className="text-xs text-slate-400">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <Package className="mb-3 h-10 w-10 text-slate-300" />
            <div className="text-sm font-semibold text-slate-500">Aucune commande</div>
            <div className="mt-1 text-xs text-slate-400">Les deals Won apparaissent ici une fois la fiche achat remplie.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {ALL_STATUSES.filter(s => statusFilter === 'Tous' || statusFilter === s)
              .filter(s => grouped[s].length > 0)
              .map(status => {
                const cfg = STATUS_CONFIG[status]
                return (
                  <div key={status} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                    <div className={`flex items-center gap-2 px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
                      <span className="text-base">{cfg.icon}</span>
                      <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.border} border ${cfg.bg} ${cfg.color}`}>
                        {grouped[status].length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                            <th className="px-4 py-2.5 text-left">Compte / Deal</th>
                            <th className="px-4 py-2.5 text-left">BU</th>
                            <th className="px-4 py-2.5 text-right">Montant</th>
                            <th className="px-4 py-2.5 text-left">PO</th>
                            <th className="px-4 py-2.5 text-left">Fournisseurs</th>
                            <th className="px-4 py-2.5 text-left">Note</th>
                            <th className="px-4 py-2.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {grouped[status].map(order => {
                            const opp    = order.opportunities
                            const lines  = opp?.purchase_info?.[0]?.purchase_lines || []
                            const fournisseurs = [...new Set(lines.map((l: any) => l.fournisseur).filter(Boolean))]
                            const hasPurchase  = (opp?.purchase_info?.length || 0) > 0
                            const nextCfg      = cfg.next ? STATUS_CONFIG[cfg.next] : null

                            return (
                              <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-900">
                                    {opp?.accounts?.name || opp?.title || '—'}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-0.5">{opp?.title}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                    {opp?.bu || '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                  {opp?.amount ? mad(opp.amount) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-xs font-semibold text-slate-700">{opp?.po_number || '—'}</div>
                                  {opp?.po_date && <div className="text-[10px] text-slate-400">{opp.po_date}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  {!hasPurchase ? (
                                    <button onClick={() => setPurchaseDeal(opp)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">
                                      <AlertCircle className="h-3 w-3" /> Fiche vide
                                    </button>
                                  ) : fournisseurs.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {fournisseurs.map((f, i) => (
                                        <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                          {f}
                                        </span>
                                      ))}
                                    </div>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-3 max-w-[150px]">
                                  {noteOpen === order.id ? (
                                    <div className="flex items-center gap-1">
                                      <input value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveNote(order.id) }}
                                        autoFocus
                                        placeholder="Note…"
                                        className="h-7 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-slate-400" />
                                      <button onClick={() => saveNote(order.id)}
                                        className="h-7 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white">✓</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setNoteOpen(order.id); setNoteText(order.supply_notes || '') }}
                                      className="text-xs text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[140px] text-left">
                                      {order.supply_notes || '+ note'}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {nextCfg && (
                                    <button
                                      disabled={updating === order.id || !hasPurchase}
                                      onClick={() => advanceStatus(order)}
                                      title={!hasPurchase ? 'Remplir la fiche achat d\'abord' : ''}
                                      className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white transition-colors disabled:opacity-40
                                        ${updating === order.id ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                      {updating === order.id ? '…' : `→ ${nextCfg.label}`}
                                    </button>
                                  )}
                                  {status === 'facture' && (
                                    <span className="text-xs font-semibold text-emerald-600">✅ Terminé</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {purchaseDeal && (
        <PurchaseModal
          deal={purchaseDeal}
          onClose={() => setPurchaseDeal(null)}
          onSaved={() => { setPurchaseDeal(null); load() }}
        />
      )}
    </div>
  )
}
