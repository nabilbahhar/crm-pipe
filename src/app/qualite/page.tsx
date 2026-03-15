'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { mad, fmt, ownerName } from '@/lib/utils'
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2, TrendingUp, TrendingDown, ChevronRight, Package, FileText, Wrench, CreditCard, ArrowRight } from 'lucide-react'
import Toast from '@/components/Toast'

// ── Types ────────────────────────────────────────────────────────────────
type Deal = { id: string; title: string; status: string; stage: string; amount: number; owner: string; created_at: string; booking_month: string | null; accounts?: { name: string } | null }
type SupplyOrder = { id: string; opportunity_id: string; status: string; product: string; created_at: string; eta: string | null; delivered_at: string | null; opportunities?: { title: string; accounts?: { name: string } | null } | null }
type Invoice = { id: string; opportunity_id: string; status: string; invoice_number: string | null; amount: number; due_date: string | null; paid_date: string | null; created_at: string; opportunities?: { title: string; accounts?: { name: string } | null } | null }

type QualityAlert = {
  id: string
  type: 'supply_delay' | 'payment_overdue' | 'deal_stale' | 'invoice_missing' | 'delivery_slow'
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  entity: string
  entityId: string
  date: string
  department: string
}

// ── Dept config ─────────────────────────────────────────────────────────
const DEPT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  supply:  { label: 'Supply Chain', color: 'text-violet-600', bg: 'bg-violet-50 ring-violet-200', icon: Package },
  finance: { label: 'Finance', color: 'text-amber-600', bg: 'bg-amber-50 ring-amber-200', icon: CreditCard },
  projets: { label: 'Projets', color: 'text-pink-600', bg: 'bg-pink-50 ring-pink-200', icon: Wrench },
  vente:   { label: 'Vente', color: 'text-blue-600', bg: 'bg-blue-50 ring-blue-200', icon: TrendingUp },
}

const SEVERITY_STYLE = {
  critical: { bg: 'bg-red-50 ring-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', icon: AlertTriangle },
  warning:  { bg: 'bg-amber-50 ring-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: Clock },
  info:     { bg: 'bg-blue-50 ring-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
}

export default function QualitePage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [supply, setSupply] = useState<SupplyOrder[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('Tous')
  const [filterSeverity, setFilterSeverity] = useState('Tous')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    document.title = 'Qualité · CRM-PIPE'
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [dRes, sRes, iRes] = await Promise.all([
      supabase.from('opportunities').select('id,title,status,stage,amount,owner,created_at,booking_month,accounts(name)').limit(5000),
      supabase.from('supply_orders').select('id,opportunity_id,status,product,created_at,eta,delivered_at,opportunities(title,accounts(name))').limit(5000),
      supabase.from('invoices').select('id,opportunity_id,status,invoice_number,amount,due_date,paid_date,created_at,opportunities(title,accounts(name))').limit(5000),
    ])
    setDeals((dRes.data as any[]) || [])
    setSupply((sRes.data as any[]) || [])
    setInvoices((iRes.data as any[]) || [])
    setLoading(false)
  }

  // ── Generate quality alerts ────────────────────────────────────────────
  const alerts = useMemo<QualityAlert[]>(() => {
    const now = new Date()
    const result: QualityAlert[] = []

    // 1. Supply delays — ETA dépassé mais pas encore livré
    supply.forEach(s => {
      if (s.status === 'livre' || s.status === 'facture') return
      if (s.eta) {
        const eta = new Date(s.eta)
        const daysLate = Math.floor((now.getTime() - eta.getTime()) / 86400000)
        if (daysLate > 0) {
          result.push({
            id: `supply_delay_${s.id}`,
            type: 'supply_delay',
            severity: daysLate > 7 ? 'critical' : 'warning',
            title: `Livraison en retard de ${daysLate}j`,
            detail: `${s.product} — ETA était le ${new Date(s.eta).toLocaleDateString('fr-MA')}`,
            entity: s.opportunities?.title || 'Deal inconnu',
            entityId: s.opportunity_id,
            date: s.eta,
            department: 'supply',
          })
        }
      }
      // Pas d'ETA après 3 jours
      if (!s.eta && s.status === 'place') {
        const daysSince = Math.floor((now.getTime() - new Date(s.created_at).getTime()) / 86400000)
        if (daysSince > 3) {
          result.push({
            id: `supply_noeta_${s.id}`,
            type: 'supply_delay',
            severity: daysSince > 7 ? 'critical' : 'warning',
            title: `Pas d'ETA depuis ${daysSince}j`,
            detail: `${s.product} — placé le ${new Date(s.created_at).toLocaleDateString('fr-MA')}, toujours sans ETA`,
            entity: s.opportunities?.title || 'Deal inconnu',
            entityId: s.opportunity_id,
            date: s.created_at,
            department: 'supply',
          })
        }
      }
    })

    // 2. Payment overdue — facture échue non payée
    invoices.forEach(inv => {
      if (inv.status === 'payee' || inv.status === 'annulee') return
      if (inv.due_date) {
        const due = new Date(inv.due_date)
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000)
        if (daysOverdue > 0) {
          result.push({
            id: `payment_${inv.id}`,
            type: 'payment_overdue',
            severity: daysOverdue > 30 ? 'critical' : daysOverdue > 7 ? 'warning' : 'info',
            title: `Paiement en retard de ${daysOverdue}j`,
            detail: `Facture ${inv.invoice_number || '—'} · ${mad(inv.amount)} · Échéance ${due.toLocaleDateString('fr-MA')}`,
            entity: inv.opportunities?.title || 'Deal inconnu',
            entityId: inv.opportunity_id,
            date: inv.due_date,
            department: 'finance',
          })
        }
      }
    })

    // 3. Deals stagnants — Won depuis > 7j sans supply order
    const dealIdsWithSupply = new Set(supply.map(s => s.opportunity_id))
    const dealIdsWithInvoice = new Set(invoices.map(i => i.opportunity_id))
    deals.forEach(d => {
      if (d.status !== 'Won') return
      const daysSinceWon = Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 86400000)

      // Won mais pas de supply après 7j
      if (!dealIdsWithSupply.has(d.id) && daysSinceWon > 7) {
        result.push({
          id: `stale_nosupply_${d.id}`,
          type: 'deal_stale',
          severity: daysSinceWon > 30 ? 'critical' : 'warning',
          title: `Deal Won sans supply depuis ${daysSinceWon}j`,
          detail: `${(d.accounts as any)?.name || '—'} · ${mad(d.amount)} — Aucune commande supply créée`,
          entity: d.title,
          entityId: d.id,
          date: d.created_at,
          department: 'supply',
        })
      }

      // Won + livré mais pas facturé après 14j
      const dealSupplies = supply.filter(s => s.opportunity_id === d.id)
      const allDelivered = dealSupplies.length > 0 && dealSupplies.every(s => s.status === 'livre' || s.status === 'facture')
      if (allDelivered && !dealIdsWithInvoice.has(d.id)) {
        const lastDelivery = dealSupplies.reduce((max, s) => {
          const t = s.delivered_at ? new Date(s.delivered_at).getTime() : 0
          return t > max ? t : max
        }, 0)
        if (lastDelivery > 0) {
          const daysSinceDelivery = Math.floor((now.getTime() - lastDelivery) / 86400000)
          if (daysSinceDelivery > 14) {
            result.push({
              id: `noinvoice_${d.id}`,
              type: 'invoice_missing',
              severity: daysSinceDelivery > 30 ? 'critical' : 'warning',
              title: `Livré depuis ${daysSinceDelivery}j sans facture`,
              detail: `${(d.accounts as any)?.name || '—'} · ${mad(d.amount)} — Matériel livré mais pas facturé`,
              entity: d.title,
              entityId: d.id,
              date: new Date(lastDelivery).toISOString(),
              department: 'finance',
            })
          }
        }
      }
    })

    // 4. Deals Open stagnants — pas de mise à jour > 30j
    deals.forEach(d => {
      if (d.status !== 'Open') return
      if (!d.booking_month) return
      const booking = new Date(d.booking_month + '-01')
      const daysOverdue = Math.floor((now.getTime() - booking.getTime()) / 86400000)
      if (daysOverdue > 30) {
        result.push({
          id: `stale_open_${d.id}`,
          type: 'deal_stale',
          severity: daysOverdue > 90 ? 'critical' : 'warning',
          title: `Closing dépassé de ${daysOverdue}j`,
          detail: `${(d.accounts as any)?.name || '—'} · ${mad(d.amount)} · Stage: ${d.stage} · Closing prévu: ${booking.toLocaleDateString('fr-MA', { month: 'short', year: 'numeric' })}`,
          entity: d.title,
          entityId: d.id,
          date: d.booking_month + '-01',
          department: 'vente',
        })
      }
    })

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    result.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return result
  }, [deals, supply, invoices])

  // ── KPIs ──
  const kpis = useMemo(() => {
    const critical = alerts.filter(a => a.severity === 'critical').length
    const warning = alerts.filter(a => a.severity === 'warning').length
    const byDept = Object.keys(DEPT_CONFIG).reduce((acc, dept) => {
      acc[dept] = alerts.filter(a => a.department === dept).length
      return acc
    }, {} as Record<string, number>)

    // Quality score: 100 - (critical * 10 + warning * 3)
    const totalDeals = deals.length || 1
    const score = Math.max(0, Math.min(100, Math.round(100 - ((critical * 10 + warning * 3) / totalDeals) * 100)))

    return { total: alerts.length, critical, warning, score, byDept }
  }, [alerts, deals])

  // ── Filtered ──
  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (filterDept !== 'Tous' && a.department !== filterDept) return false
      if (filterSeverity !== 'Tous' && a.severity !== filterSeverity) return false
      return true
    })
  }, [alerts, filterDept, filterSeverity])

  // ── Score color ──
  const scoreColor = kpis.score >= 80 ? 'text-emerald-600' : kpis.score >= 60 ? 'text-amber-600' : 'text-red-600'
  const scoreBg = kpis.score >= 80 ? 'bg-emerald-50 ring-emerald-200' : kpis.score >= 60 ? 'bg-amber-50 ring-amber-200' : 'bg-red-50 ring-red-200'

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Qualité de Service</h1>
              <p className="text-xs text-slate-500">{kpis.total} alertes · {kpis.critical} critiques · Score {kpis.score}%</p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {/* Score */}
          <div className={`rounded-2xl ${scoreBg} ring-1 shadow-sm p-4 text-center`}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Score Qualité</div>
            <div className={`text-3xl font-black mt-1 ${scoreColor}`}>{kpis.score}%</div>
            <div className="text-[10px] text-slate-400 mt-1">{kpis.score >= 80 ? 'Bon' : kpis.score >= 60 ? 'À surveiller' : 'Critique'}</div>
          </div>
          {/* Critical */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">Critiques</div>
            <div className="text-2xl font-black text-red-600 mt-1">{kpis.critical}</div>
            <div className="text-[10px] text-slate-400 mt-1">Action immédiate</div>
          </div>
          {/* Warning */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Alertes</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{kpis.warning}</div>
            <div className="text-[10px] text-slate-400 mt-1">À surveiller</div>
          </div>
          {/* Supply */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Supply</div>
            <div className="text-2xl font-black text-violet-600 mt-1">{kpis.byDept.supply || 0}</div>
            <div className="text-[10px] text-slate-400 mt-1">alertes logistique</div>
          </div>
          {/* Finance */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Finance</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{kpis.byDept.finance || 0}</div>
            <div className="text-[10px] text-slate-400 mt-1">alertes paiement</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrer</span>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm">
            <option value="Tous">Tous les départements</option>
            {Object.entries(DEPT_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm">
            <option value="Tous">Toutes sévérités</option>
            <option value="critical">🔴 Critique</option>
            <option value="warning">🟠 Alerte</option>
            <option value="info">🔵 Info</option>
          </select>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} alerte{filtered.length > 1 ? 's' : ''}</span>
        </div>

        {/* Alerts List */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
              <div className="text-lg font-bold text-emerald-600">Tout est en ordre !</div>
              <div className="text-sm text-slate-400 mt-1">Aucune alerte qualité détectée</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(alert => {
                const sev = SEVERITY_STYLE[alert.severity]
                const dept = DEPT_CONFIG[alert.department]
                const SevIcon = sev.icon
                const DeptIcon = dept?.icon || Package
                return (
                  <div key={alert.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${sev.badge} flex-shrink-0`}>
                      <SevIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{alert.title}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sev.badge}`}>
                          {alert.severity === 'critical' ? 'Critique' : alert.severity === 'warning' ? 'Alerte' : 'Info'}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${dept?.bg || 'bg-slate-100'} ring-1`}>
                          <DeptIcon className="h-3 w-3 inline mr-1" />
                          {dept?.label || alert.department}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{alert.detail}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] font-semibold text-slate-700">{alert.entity}</span>
                        <a href={`/opportunities/${alert.entityId}`} className="text-[11px] text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-0.5">
                          Voir le deal <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="border-t border-slate-50 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-400">
              {filtered.length} alerte{filtered.length > 1 ? 's' : ''} · {filtered.filter(a => a.severity === 'critical').length} critiques · {filtered.filter(a => a.severity === 'warning').length} alertes
            </div>
          )}
        </div>

        {/* Department Quality Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(DEPT_CONFIG).map(([key, cfg]) => {
            const deptAlerts = alerts.filter(a => a.department === key)
            const critCount = deptAlerts.filter(a => a.severity === 'critical').length
            const warnCount = deptAlerts.filter(a => a.severity === 'warning').length
            const DIcon = cfg.icon
            return (
              <div key={key} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${cfg.bg} ring-1`}>
                    <DIcon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{cfg.label}</div>
                    <div className="text-[10px] text-slate-400">{deptAlerts.length} alerte{deptAlerts.length > 1 ? 's' : ''}</div>
                  </div>
                </div>
                {deptAlerts.length === 0 ? (
                  <div className="text-xs text-emerald-500 font-semibold">✓ Aucune alerte</div>
                ) : (
                  <div className="space-y-1">
                    {critCount > 0 && <div className="text-xs"><span className="font-bold text-red-600">{critCount}</span> <span className="text-slate-400">critique{critCount > 1 ? 's' : ''}</span></div>}
                    {warnCount > 0 && <div className="text-xs"><span className="font-bold text-amber-600">{warnCount}</span> <span className="text-slate-400">alerte{warnCount > 1 ? 's' : ''}</span></div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
