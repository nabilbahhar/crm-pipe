'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { mad, fmtDate, ownerName, STAGE_CFG } from '@/lib/utils'
import {
  ArrowLeft, Handshake, Pencil, X, Globe, Phone, Mail, User,
  Tag, FileText, Calendar, TrendingUp, Target, RefreshCw,
  ExternalLink, Save,
} from 'lucide-react'
import Toast from '@/components/Toast'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
type CardRow = { id: string; name: string; type: string | null; website: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null; created_at: string | null }
type DealRow = { id: string; title: string; amount: number; status: string; stage: string; bu: string | null; vendor: string | null; bu_lines: any; booking_month: string | null; owner_email: string | null; prob: number | null; created_at: string; account_id: string | null }
type AccountRow = { id: string; name: string }

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

function DetailRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-slate-400 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28 shrink-0">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate">{value || '—'}</a>
      ) : (
        <span className="text-sm text-slate-700 truncate">{value || '—'}</span>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const c = status === 'Won' ? 'bg-emerald-50 text-emerald-700' : status === 'Lost' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{status}</span>
}

function StagePill({ stage }: { stage: string }) {
  const cfg = STAGE_CFG[stage] || { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{stage}</span>
}

function Btn({ children, variant = 'ghost', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' }) {
  const vCls = { primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900', ghost: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200', outline: 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200', danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600' }[variant]
  const szCls = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-50 ${vCls} ${szCls} ${props.className || ''}`}>{children}</button>
}

function FL({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      {children}
    </div>
  )
}
const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'
const selectCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 appearance-none'

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function PartenaireDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  // ─── State ──────────────────────────────────────────────────
  const [card, setCard] = useState<CardRow | null>(null)
  const [deals, setDeals] = useState<DealRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'error' } | null>(null)

  // Edit form
  const [editing, setEditing] = useState(false)
  const [fName, setFName] = useState('')
  const [fType, setFType] = useState<string>('Constructeur')
  const [fWebsite, setFWebsite] = useState('')
  const [fContactName, setFContactName] = useState('')
  const [fContactEmail, setFContactEmail] = useState('')
  const [fContactPhone, setFContactPhone] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // ─── Load ───────────────────────────────────────────────────
  useEffect(() => { if (id) loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (card) document.title = `${card.name} · Partenaires · CRM-PIPE` }, [card])

  async function loadAll() {
    setLoading(true)
    const [cardRes, dealsRes, accRes] = await Promise.all([
      supabase.from('cards').select('*').eq('id', id).single(),
      supabase.from('opportunities').select('id,title,amount,status,stage,bu,vendor,bu_lines,booking_month,owner_email,prob,created_at,account_id'),
      supabase.from('accounts').select('id,name'),
    ])
    if (cardRes.data) {
      const c = cardRes.data as CardRow
      setCard(c)
      setFName(c.name)
      setFType(c.type || 'Constructeur')
      setFWebsite(c.website || '')
      setFContactName(c.contact_name || '')
      setFContactEmail(c.contact_email || '')
      setFContactPhone(c.contact_phone || '')
      setFNotes(c.notes || '')
    }
    if (dealsRes.data) setDeals(dealsRes.data as DealRow[])
    if (accRes.data) setAccounts(accRes.data as AccountRow[])
    setLoading(false)
  }

  // ─── Linked deals (deals that reference this card/vendor) ──
  const linkedDeals = useMemo(() => {
    if (!card) return []
    const name = card.name
    return deals.filter(d => {
      // Multi-BU: check bu_lines for card match
      if (d.bu === 'MULTI' && Array.isArray(d.bu_lines)) {
        return d.bu_lines.some((line: any) => line.card === name)
      }
      // Single-vendor deals
      return d.vendor === name
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [card, deals])

  // ─── KPIs ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = linkedDeals.length
    const open = linkedDeals.filter(d => d.status === 'Open')
    const won = linkedDeals.filter(d => d.status === 'Won')
    const lost = linkedDeals.filter(d => d.status === 'Lost')
    const caWon = won.reduce((s, d) => s + (d.amount || 0), 0)
    const pipeline = open.reduce((s, d) => s + (d.amount || 0), 0)
    const winRate = total > 0 ? Math.round((won.length / (won.length + lost.length || 1)) * 100) : 0
    return { total, open: open.length, won: won.length, lost: lost.length, caWon, pipeline, winRate }
  }, [linkedDeals])

  // ─── Charts ─────────────────────────────────────────────────
  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of linkedDeals) {
      map[d.status] = (map[d.status] || 0) + 1
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [linkedDeals])

  const monthlyRevenue = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of linkedDeals.filter(d => d.status === 'Won' && d.booking_month)) {
      const m = d.booking_month!
      map[m] = (map[m] || 0) + (d.amount || 0)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({ month, amount }))
  }, [linkedDeals])

  const topAccountsData = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {}
    const accMap = new Map(accounts.map(a => [a.id, a.name]))
    for (const d of linkedDeals.filter(d => d.status === 'Won' && d.account_id)) {
      const accName = accMap.get(d.account_id!) || 'Inconnu'
      if (!map[accName]) map[accName] = { name: accName, amount: 0 }
      map[accName].amount += d.amount || 0
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 8)
  }, [linkedDeals, accounts])

  // ─── Account name map ───────────────────────────────────────
  const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts])

  // ─── Edit handlers ──────────────────────────────────────────
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
      const { error } = await supabase.from('cards').update(payload).eq('id', id)
      if (error) throw error
      setToast({ msg: 'Partenaire modifié', type: 'success' })
      setEditing(false)
      loadAll()
    } catch (e: any) {
      setToast({ msg: e?.message || 'Erreur', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-12 text-center">
        <div className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
        <p className="mt-3 text-sm text-slate-400">Chargement…</p>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-12 text-center">
        <p className="text-sm text-slate-500">Partenaire introuvable.</p>
        <Link href="/partenaires" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Retour</Link>
      </div>
    )
  }

  const STATUS_COLOR: Record<string, string> = { Won: '#10b981', Lost: '#ef4444', Open: '#3b82f6' }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/partenaires" className="hover:text-slate-700 transition-colors">Partenaires</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium truncate max-w-[200px]">{card.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-200 text-lg font-bold">
            {card.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">{card.name} <TypeBadge type={card.type} /></h1>
            <p className="text-xs text-slate-400">{kpis.total} deal{kpis.total > 1 ? 's' : ''} · {kpis.won} won · Win rate {kpis.winRate}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={loadAll}><RefreshCw className="h-3.5 w-3.5" /></Btn>
          <Btn variant="primary" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Modifier</Btn>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total deals</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{kpis.total}</div>
          <div className="mt-0.5 text-xs text-slate-400">{kpis.open} open · {kpis.lost} lost</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-emerald-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">CA Won</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700">{mad(kpis.caWon)}</div>
          <div className="mt-0.5 text-xs text-emerald-500">{kpis.won} deal{kpis.won > 1 ? 's' : ''} gagné{kpis.won > 1 ? 's' : ''}</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-blue-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Pipeline</div>
          <div className="mt-1 text-2xl font-extrabold text-blue-700">{mad(kpis.pipeline)}</div>
          <div className="mt-0.5 text-xs text-blue-500">{kpis.open} deal{kpis.open > 1 ? 's' : ''} en cours</div>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Win Rate</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{kpis.winRate}%</div>
          <div className="mt-0.5 text-xs text-slate-400">{kpis.won} / {kpis.won + kpis.lost} fermés</div>
        </div>
      </div>

      {/* Info Card + Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Info Card */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 lg:col-span-1">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Handshake className="h-4 w-4 text-slate-400" /> Informations</h2>
          <div className="space-y-0.5">
            <DetailRow icon={<Tag />} label="Type" value={card.type || '—'} />
            <DetailRow icon={<Globe />} label="Site web" value={card.website || '—'} href={card.website || undefined} />
            <DetailRow icon={<User />} label="Contact" value={card.contact_name || '—'} />
            <DetailRow icon={<Mail />} label="Email" value={card.contact_email || '—'} href={card.contact_email ? `mailto:${card.contact_email}` : undefined} />
            <DetailRow icon={<Phone />} label="Téléphone" value={card.contact_phone || '—'} href={card.contact_phone ? `tel:${card.contact_phone}` : undefined} />
            <DetailRow icon={<Calendar />} label="Créé le" value={card.created_at ? fmtDate(card.created_at) : '—'} />
          </div>
          {card.notes && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Notes</div>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{card.notes}</p>
            </div>
          )}
        </div>

        {/* Status distribution */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 lg:col-span-1">
          <div className="mb-3 text-xs font-bold text-slate-700">Répartition par statut</div>
          {statusDistribution.length === 0 ? <p className="text-xs text-slate-400 py-8 text-center">Aucun deal</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, value }) => `${name} (${value})`} style={{ fontSize: 10 }}>
                  {statusDistribution.map((entry, i) => <Cell key={i} fill={STATUS_COLOR[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Comptes by revenue */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 lg:col-span-1">
          <div className="mb-3 text-xs font-bold text-slate-700">Top comptes (CA Won)</div>
          {topAccountsData.length === 0 ? <p className="text-xs text-slate-400 py-8 text-center">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topAccountsData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]} name="CA Won">
                  {topAccountsData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Monthly Revenue Chart (full width) */}
      {monthlyRevenue.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
          <div className="mb-3 text-xs font-bold text-slate-700">CA mensuel (Won)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyRevenue} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => mad(Number(v))} />
              <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} name="CA Won" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Deals Table */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Target className="h-4 w-4 text-slate-400" /> Deals associés <span className="text-xs font-normal text-slate-400">({linkedDeals.length})</span></h2>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 text-xs">
                <th className="py-3 px-3 text-left font-semibold text-slate-500">Deal</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Compte</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Montant</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Statut</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Stage</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Booking</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Owner</th>
                <th className="py-3 px-2 text-left font-semibold text-slate-500">Créé</th>
              </tr>
            </thead>
            <tbody>
              {linkedDeals.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-400">Aucun deal lié à ce partenaire.</td></tr>
              ) : (
                linkedDeals.map(d => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <Link href={`/opportunities/${d.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors flex items-center gap-1">
                        {d.title} <ExternalLink className="h-3 w-3 text-slate-300" />
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-xs text-slate-600">{d.account_id ? accMap.get(d.account_id) || '—' : '—'}</td>
                    <td className="py-3 px-2 text-sm font-semibold text-slate-900">{mad(d.amount)}</td>
                    <td className="py-3 px-2"><StatusPill status={d.status} /></td>
                    <td className="py-3 px-2"><StagePill stage={d.stage} /></td>
                    <td className="py-3 px-2 text-xs text-slate-500">{d.booking_month || '—'}</td>
                    <td className="py-3 px-2 text-xs text-slate-500">{d.owner_email ? ownerName(d.owner_email) : '—'}</td>
                    <td className="py-3 px-2 text-xs text-slate-400">{fmtDate(d.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="presentation" onClick={e => { if (e.target === e.currentTarget) setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 space-y-4" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Modifier le partenaire</h2>
              <button onClick={() => setEditing(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FL label="Nom *" required><input value={fName} onChange={e => setFName(e.target.value)} className={inputCls} placeholder="Ex: Dell, HPE…" /></FL>
              <FL label="Type"><select value={fType} onChange={e => setFType(e.target.value)} className={selectCls}>{TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></FL>
              <FL label="Site web"><input value={fWebsite} onChange={e => setFWebsite(e.target.value)} className={inputCls} placeholder="https://…" /></FL>
              <FL label="Contact"><input value={fContactName} onChange={e => setFContactName(e.target.value)} className={inputCls} placeholder="Nom du contact" /></FL>
              <FL label="Email"><input type="email" value={fContactEmail} onChange={e => setFContactEmail(e.target.value)} className={inputCls} placeholder="email@example.com" /></FL>
              <FL label="Téléphone"><input value={fContactPhone} onChange={e => setFContactPhone(e.target.value)} className={inputCls} placeholder="+212…" /></FL>
            </div>
            <FL label="Notes"><textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" placeholder="Notes…" /></FL>
            <div className="flex gap-3 pt-2">
              <Btn variant="ghost" onClick={() => setEditing(false)} className="flex-1">Annuler</Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving} className="flex-[2]"><Save className="h-3.5 w-3.5" />{saving ? 'Sauvegarde…' : 'Enregistrer'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
