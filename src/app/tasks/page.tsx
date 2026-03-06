'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import PurchaseModal from '@/components/PurchaseModal'
import {
  CheckCircle2, Clock, AlertTriangle, Package,
  RefreshCw, ChevronRight, Building2, TrendingUp,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type TaskType = 'relance_retard' | 'achat_manquant'

type Task = {
  id: string
  type: TaskType
  priority: 'high' | 'medium'
  title: string
  subtitle: string
  detail?: string
  entity_id: string
  entity?: any
}

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ─── Main ─────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [purchaseDeal, setPurchaseDeal] = useState<any | null>(null)
  const [doneIds, setDoneIds]     = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? null)
    })
  }, [])

  useEffect(() => {
    if (userEmail !== null) load()
  }, [userEmail])

  async function load() {
    setLoading(true); setErr(null)
    try {
      await Promise.all([loadRelances(), loadAchatManquant()])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  async function loadRelances() {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('prospects')
      .select('id, company_name, contact_name, status, heat, next_date, next_action, attempts')
      .is('converted_at', null)
      .neq('status', 'Qualifié ✓')
      .lt('next_date', today)
      .order('next_date', { ascending: true })

    if (error) throw error

    const newTasks: Task[] = (data || []).map(p => {
      const daysLate = Math.floor((Date.now() - new Date(p.next_date).getTime()) / 86400000)
      return {
        id: `relance_${p.id}`,
        type: 'relance_retard',
        priority: daysLate > 3 ? 'high' : 'medium',
        title: p.company_name,
        subtitle: p.contact_name || '',
        detail: `En retard de ${daysLate}j · ${p.next_action || 'Relancer'} · ${p.status}`,
        entity_id: p.id,
        entity: p,
      }
    })

    setTasks(prev => [
      ...prev.filter(t => t.type !== 'relance_retard'),
      ...newTasks,
    ])
  }

  async function loadAchatManquant() {
    // Won deals without purchase_info
    const { data: wonDeals, error: e1 } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, vendor, po_number, po_date, accounts(name)')
      .eq('status', 'Won')
      .order('created_at', { ascending: false })

    if (e1) throw e1

    if (!wonDeals?.length) return

    const wonIds = wonDeals.map(d => d.id)
    const { data: purchaseInfos } = await supabase
      .from('purchase_info')
      .select('opportunity_id')
      .in('opportunity_id', wonIds)

    const filledIds = new Set((purchaseInfos || []).map((p: any) => p.opportunity_id))

    const newTasks: Task[] = wonDeals
      .filter(d => !filledIds.has(d.id))
      .map(d => ({
        id: `achat_${d.id}`,
        type: 'achat_manquant' as const,
        priority: 'high' as const,
        title: (d.accounts as any)?.name || d.title,
        subtitle: d.title,
        detail: `${mad(d.amount)} · PO ${d.po_number || '—'}`,
        entity_id: d.id,
        entity: { ...d, accounts: d.accounts },
      }))

    setTasks(prev => [
      ...prev.filter(t => t.type !== 'achat_manquant'),
      ...newTasks,
    ])
  }

  const visibleTasks = useMemo(() =>
    tasks.filter(t => !doneIds.has(t.id))
      .sort((a, b) => {
        // high priority first, then by type
        if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
        return 0
      })
  , [tasks, doneIds])

  const relances   = visibleTasks.filter(t => t.type === 'relance_retard')
  const achats     = visibleTasks.filter(t => t.type === 'achat_manquant')

  const markDone = (id: string) => setDoneIds(prev => new Set([...prev, id]))

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md text-lg">
              ✅
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Tasks</h1>
              <p className="text-xs text-slate-500">
                {visibleTasks.length} tâche{visibleTasks.length !== 1 ? 's' : ''} en attente
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠️ {err}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-400" />
            <div className="text-lg font-bold text-slate-700">Tout est à jour ! 🎉</div>
            <div className="mt-1 text-sm text-slate-400">Aucune tâche en attente pour le moment.</div>
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Fiches achat manquantes ── */}
            {achats.length > 0 && (
              <TaskSection
                icon="📦"
                title="Fiches achat à compléter"
                count={achats.length}
                color="amber">
                {achats.map(task => (
                  <TaskCard key={task.id} task={task}
                    onDone={() => markDone(task.id)}
                    action={
                      <button
                        onClick={() => setPurchaseDeal(task.entity)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 transition-colors">
                        <Package className="h-3.5 w-3.5" /> Remplir fiche achat
                      </button>
                    }
                  />
                ))}
              </TaskSection>
            )}

            {/* ── Relances en retard ── */}
            {relances.length > 0 && (
              <TaskSection
                icon="⏰"
                title="Relances en retard"
                count={relances.length}
                color="red">
                {relances.map(task => (
                  <TaskCard key={task.id} task={task}
                    onDone={() => markDone(task.id)}
                    action={
                      <a href="/prospection"
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        Voir dans Prospection <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    }
                  />
                ))}
              </TaskSection>
            )}

          </div>
        )}
      </div>

      {/* Purchase modal */}
      {purchaseDeal && (
        <PurchaseModal
          deal={purchaseDeal}
          onClose={() => setPurchaseDeal(null)}
          onSaved={() => {
            setDoneIds(prev => new Set([...prev, `achat_${purchaseDeal.id}`]))
            setPurchaseDeal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── TaskSection ──────────────────────────────────────────────
function TaskSection({ icon, title, count, color, children }: {
  icon: string; title: string; count: number
  color: 'amber' | 'red' | 'blue'
  children: React.ReactNode
}) {
  const colors = {
    amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-200 text-amber-800' },
    red:   { border: 'border-red-200',   bg: 'bg-red-50',   text: 'text-red-800',   badge: 'bg-red-200 text-red-800'   },
    blue:  { border: 'border-blue-200',  bg: 'bg-blue-50',  text: 'text-blue-800',  badge: 'bg-blue-200 text-blue-800' },
  }[color]

  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
      <div className={`flex items-center gap-2 px-5 py-3 ${colors.bg} border-b ${colors.border}`}>
        <span className="text-base">{icon}</span>
        <span className={`text-sm font-bold ${colors.text}`}>{title}</span>
        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${colors.badge}`}>{count}</span>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────
function TaskCard({ task, action, onDone }: {
  task: Task
  action: React.ReactNode
  onDone: () => void
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
      <div className={`shrink-0 h-2 w-2 rounded-full mt-0.5 ${task.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 text-sm truncate">{task.title}</span>
          {task.subtitle && task.subtitle !== task.title && (
            <span className="text-xs text-slate-400 truncate hidden sm:block">{task.subtitle}</span>
          )}
        </div>
        {task.detail && <div className="mt-0.5 text-xs text-slate-500">{task.detail}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {action}
        <button onClick={onDone}
          title="Marquer comme traité"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50 transition-colors">
          <CheckCircle2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
