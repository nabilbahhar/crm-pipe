'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Pencil, Clock, User, TrendingUp, Calendar, FileText, Layers } from 'lucide-react'

type DealRow = {
  id: string
  account_id: string
  title: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  bu: string | null
  vendor: string | null
  amount: number
  prob: number | null
  booking_month: string | null
  next_step: string | null
  notes: string | null
  multi_bu: boolean | null
  bu_lines: any
  po_number?: string | null
  po_date?: string | null
  created_at?: string
  accounts?: { name?: string } | null
}

type ActivityRow = {
  id: string
  user_email: string
  action_type: string
  entity_name: string
  detail: string | null
  created_at: string
}

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Lead':               { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  'Discovery':          { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  'Qualified':          { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  'Solutioning':        { bg: '#faf5ff', text: '#9333ea', border: '#e9d5ff' },
  'Proposal Sent':      { bg: '#fdf2f8', text: '#db2777', border: '#fbcfe8' },
  'Negotiation':        { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  'Commit':             { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  'Won':                { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  'Lost / No decision': { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
}

const ACTION_COLORS: Record<string, string> = {
  create: '#10b981',
  update: '#3b82f6',
  delete: '#ef4444',
  stage: '#f59e0b',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  stage: 'Changement de stage',
}

function mad(n: number) {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)
}

function userName(email: string) {
  if (email === 'nabil.imdh@gmail.com') return 'Nabil'
  if (email === 's.chitachny@compucom.ma') return 'Salim'
  return email.split('@')[0]
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function InfoCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-slate-400">{icon}</div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [deal, setDeal] = useState<DealRow | null>(null)
  const [history, setHistory] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data: dealData, error: dealError } = await supabase
        .from('opportunities')
        .select('*, accounts(name)')
        .eq('id', id)
        .single()

      if (dealError) throw new Error(dealError.message)
      setDeal(dealData as DealRow)

      // Load history by entity_id
      const { data: byId } = await supabase
        .from('activity_log')
        .select('id,user_email,action_type,entity_name,detail,created_at')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(50)

      const allHistory: ActivityRow[] = [...(byId || [])]
      const seen = new Set(allHistory.map((x) => x.id))

      // Also search by deal title
      if (dealData?.title) {
        const { data: byName } = await supabase
          .from('activity_log')
          .select('id,user_email,action_type,entity_name,detail,created_at')
          .eq('entity_name', dealData.title)
          .order('created_at', { ascending: false })
          .limit(50)
        for (const item of (byName || [])) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            allHistory.push(item as ActivityRow)
          }
        }
      }

      allHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setHistory(allHistory)
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement deal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Chargement…</div>
      </div>
    )
  }

  if (err || !deal) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-red-600">{err || 'Deal introuvable'}</div>
        <Link href="/opportunities" className="text-sm text-slate-600 underline">Retour aux deals</Link>
      </div>
    )
  }

  const stageStyle = STAGE_COLORS[deal.stage] || STAGE_COLORS['Lead']
  const accountName = deal.accounts?.name || '—'
  const isMulti = Boolean(deal.multi_bu) || deal.bu === 'MULTI'
  const lines = Array.isArray(deal.bu_lines) ? deal.bu_lines : []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6">

        {/* Back + Header */}
        <div className="mb-6">
          <Link
            href="/opportunities"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Retour aux deals
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold border"
                  style={{ background: stageStyle.bg, color: stageStyle.text, borderColor: stageStyle.border }}
                >
                  {deal.stage}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  deal.status === 'Won' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  deal.status === 'Lost' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {deal.status}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">{deal.title}</h1>
              <div className="mt-1 text-sm text-slate-500">Client : <span className="font-medium text-slate-700">{accountName}</span></div>
            </div>

            <Link
              href={`/opportunities`}
              className="inline-flex items-center gap-2 h-10 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800 transition-colors"
            >
              <Pencil className="h-4 w-4" /> Modifier
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
          <InfoCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Montant"
            value={mad(deal.amount)}
          />
          <InfoCard
            icon={<Layers className="h-4 w-4" />}
            label="Probabilité"
            value={`${deal.prob ?? 0}%`}
            sub={`Forecast : ${mad((deal.amount || 0) * ((deal.prob || 0) / 100))}`}
          />
          <InfoCard
            icon={<Calendar className="h-4 w-4" />}
            label="Closing prévu"
            value={deal.booking_month || '—'}
          />
          <InfoCard
            icon={<FileText className="h-4 w-4" />}
            label="BU"
            value={isMulti ? `Multi-BU (${lines.length})` : (deal.bu || '—')}
            sub={!isMulti ? (deal.vendor || undefined) : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Left: Details */}
          <div className="lg:col-span-2 space-y-4">

            {/* Deal Info */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-4">Informations du deal</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Client</div>
                  <div className="font-medium text-slate-900">{accountName}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Stage</div>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold border"
                    style={{ background: stageStyle.bg, color: stageStyle.text, borderColor: stageStyle.border }}
                  >
                    {deal.stage}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">BU</div>
                  <div className="font-medium text-slate-900">{isMulti ? 'Multi-BU' : (deal.bu || '—')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Carte / Constructeur</div>
                  <div className="font-medium text-slate-900">{isMulti ? `${lines.length} lignes` : (deal.vendor || '—')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Montant</div>
                  <div className="font-bold text-slate-900">{mad(deal.amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Probabilité</div>
                  <div className="font-medium text-slate-900">{deal.prob ?? 0}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Closing prévu</div>
                  <div className="font-medium text-slate-900">{deal.booking_month || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Statut</div>
                  <div className="font-medium text-slate-900">{deal.status}</div>
                </div>
              </div>

              {/* Multi-BU lines */}
              {isMulti && lines.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-slate-400 mb-2">Répartition Multi-BU</div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">BU</th>
                          <th className="px-3 py-2">Carte</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 font-medium">{l.bu}</td>
                            <td className="px-3 py-2 text-slate-600">{l.card}</td>
                            <td className="px-3 py-2 text-right font-medium">{mad(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PO Info */}
              {deal.status === 'Won' && (deal.po_number || deal.po_date) && (
                <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <div className="text-xs font-semibold text-emerald-700 mb-2">Informations PO</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {deal.po_number && (
                      <div>
                        <div className="text-xs text-emerald-600">Numéro PO</div>
                        <div className="font-medium text-emerald-800">{deal.po_number}</div>
                      </div>
                    )}
                    {deal.po_date && (
                      <div>
                        <div className="text-xs text-emerald-600">Date PO</div>
                        <div className="font-medium text-emerald-800">{deal.po_date}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Next Step */}
            {deal.next_step && (
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-2">→ Next Step</div>
                <div className="text-sm text-slate-700 leading-relaxed">{deal.next_step}</div>
              </div>
            )}

            {/* Notes */}
            {deal.notes && (
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-2">Notes internes</div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{deal.notes}</div>
              </div>
            )}
          </div>

          {/* Right: History */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border bg-white p-5 shadow-sm sticky top-20">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-slate-400" />
                <div className="text-sm font-semibold text-slate-900">Historique des modifications</div>
              </div>

              {history.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-6">
                  Aucune modification enregistrée
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-auto">
                  {history.map((a) => {
                    const color = ACTION_COLORS[a.action_type] || '#64748b'
                    const label = ACTION_LABELS[a.action_type] || a.action_type
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                            style={{ background: color }}
                          />
                          <div className="w-px flex-1 bg-slate-100 mt-1" />
                        </div>
                        <div className="pb-3 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <User className="h-3 w-3 text-slate-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-slate-900">{userName(a.user_email)}</span>
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white" style={{ background: color, fontSize: 10 }}>
                              {label}
                            </span>
                          </div>
                          {a.detail && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate" title={a.detail}>{a.detail}</div>
                          )}
                          <div className="text-xs text-slate-400 mt-0.5">{formatDate(a.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
