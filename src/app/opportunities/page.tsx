'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Pencil, Clock, User, TrendingUp, Calendar, FileText, Layers, X, Save, Check } from 'lucide-react'

const STAGES = [
  'Lead', 'Discovery', 'Qualified', 'Solutioning',
  'Proposal Sent', 'Negotiation', 'Commit', 'Won', 'Lost / No decision',
] as const

const STAGE_DEFAULT_PROB: Record<string, number> = {
  Lead: 10, Discovery: 20, Qualified: 40, Solutioning: 55,
  'Proposal Sent': 70, Negotiation: 80, Commit: 90, Won: 100, 'Lost / No decision': 0,
}

const BUS = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const
const SERVICE_CARD = 'Prestation'
const isServiceBu = (v: any) => String(v || '').trim().toLowerCase() === 'service'

function computeStatus(stage: string): 'Open' | 'Won' | 'Lost' {
  const s = (stage || '').toLowerCase()
  if (s === 'won') return 'Won'
  if (s.includes('lost')) return 'Lost'
  return 'Open'
}
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)) }
function dmyToISO(dmy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dmy || '').trim())
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}
function isoToDMY(iso: string | null | undefined): string {
  const v = String(iso || '').trim()
  if (!v) return ''
  const base = v.includes('T') ? v.split('T')[0] : v
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
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
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type DealRow = {
  id: string; account_id: string; title: string; stage: string
  status: 'Open' | 'Won' | 'Lost'; bu: string | null; vendor: string | null
  amount: number; prob: number | null; booking_month: string | null
  next_step: string | null; notes: string | null; multi_bu: boolean | null
  bu_lines: any; po_number?: string | null; po_date?: string | null
  accounts?: { id?: string; name?: string } | null
}
type Account = { id: string; name: string }
type CardRow = { name: string }
type ActivityRow = {
  id: string; user_email: string; action_type: string
  entity_name: string; detail: string | null; created_at: string
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
  create: '#10b981', update: '#3b82f6', delete: '#ef4444', stage: '#f59e0b',
}
const ACTION_LABELS: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression', stage: 'Changement stage',
}

function EditPanel({ deal, accounts, cards, onClose, onSaved }: {
  deal: DealRow; accounts: Account[]; cards: CardRow[]
  onClose: () => void; onSaved: () => void
}) {
  const [stage, setStage] = useState<string>(deal.stage || 'Lead')
  const [accountId, setAccountId] = useState<string>(deal.account_id || '')
  const [title, setTitle] = useState(deal.title || '')
  const [prob, setProb] = useState(String(deal.prob ?? STAGE_DEFAULT_PROB[deal.stage] ?? 50))
  const [bookingMonth, setBookingMonth] = useState(deal.booking_month || '')
  const [nextStep, setNextStep] = useState(deal.next_step || '')
  const [notes, setNotes] = useState(deal.notes || '')
  const [bu, setBu] = useState<string>((!deal.multi_bu && deal.bu && deal.bu !== 'MULTI') ? deal.bu : 'HCI')
  const [card, setCard] = useState((!deal.multi_bu && deal.vendor && deal.vendor !== 'MULTI') ? deal.vendor : '')
  const [amount, setAmount] = useState(String(deal.amount || ''))
  const [multiBu, setMultiBu] = useState(Boolean(deal.multi_bu) || deal.bu === 'MULTI')
  const [lines, setLines] = useState<{ bu: string; card: string; amount: string }[]>(
    Array.isArray(deal.bu_lines) && (Boolean(deal.multi_bu) || deal.bu === 'MULTI')
      ? deal.bu_lines.map((l: any) => ({ bu: l.bu || 'HCI', card: l.card || '', amount: String(l.amount || '') }))
      : [{ bu: 'HCI', card: '', amount: '' }]
  )
  const [poNumber, setPoNumber] = useState(deal.po_number || '')
  const [poDateDMY, setPoDateDMY] = useState(isoToDMY(deal.po_date))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const statusComputed = useMemo(() => computeStatus(stage), [stage])
  const cardOptions = cards.map(c => c.name)
  const totalMultiBu = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  const onSave = async () => {
    setErr(null)
    if (!title.trim()) return setErr('Intitulé obligatoire')
    if (!accountId) return setErr('Client obligatoire')

    const payload: any = {
      account_id: accountId, title: title.trim(), stage,
      status: statusComputed, prob: clamp(Number(prob) || 0, 0, 100),
      booking_month: bookingMonth || null, next_step: nextStep.trim(),
      notes: notes.trim() || null, multi_bu: Boolean(multiBu),
    }

    if (statusComputed === 'Won') {
      payload.po_number = poNumber.trim()
      payload.po_date = dmyToISO(poDateDMY)
    } else {
      payload.po_number = null
      payload.po_date = null
    }

    if (!multiBu) {
      payload.bu = bu
      payload.vendor = isServiceBu(bu) ? SERVICE_CARD : card
      payload.bu_lines = null
      payload.amount = Number(amount) || 0
    } else {
      const cleanLines = lines.map(l => ({
        bu: l.bu, card: isServiceBu(l.bu) ? SERVICE_CARD : l.card, amount: Number(l.amount) || 0,
      }))
      payload.bu = 'MULTI'; payload.vendor = 'MULTI'
      payload.bu_lines = cleanLines
      payload.amount = cleanLines.reduce((s, l) => s + l.amount, 0)
    }

    setLoading(true)
    try {
      const r = await supabase.from('opportunities').update(payload).eq('id', deal.id)
      if (r.error) throw new Error(r.error.message)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const acc = accounts.find(a => a.id === accountId)
        await supabase.from('activity_log').insert({
          user_email: user.email, action_type: 'update', entity_type: 'deal',
          entity_id: deal.id, entity_name: title.trim(),
          detail: `${acc?.name || ''} · ${stage}`,
        })
      }
      setSuccess(true)
      setTimeout(() => { setSuccess(false); onSaved() }, 800)
    } catch (e: any) {
      setErr(e?.message || 'Erreur sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border">
        <div className="flex items-center justify-between border-b px-5 py-4 flex-shrink-0">
          <div className="text-base font-semibold text-slate-900">Modifier le deal</div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4">
          {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Client *</label>
              <select className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Intitulé du deal *</label>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Projet stockage NAS" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stage *</label>
              <select className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={stage} onChange={e => { const s = e.target.value; setStage(s); setProb(String(STAGE_DEFAULT_PROB[s] ?? 50)) }}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Probabilité (%)</label>
              <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={prob} onChange={e => setProb(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Closing prévu (AAAA-MM)</label>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={bookingMonth} onChange={e => setBookingMonth(e.target.value)} placeholder="2026-03" />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="sr-only peer" checked={multiBu} onChange={e => setMultiBu(e.target.checked)} />
                <div className="h-5 w-9 rounded-full bg-slate-200 peer-checked:bg-slate-900 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4" />
              </label>
              <span className="text-sm font-medium text-slate-700">Multi-BU</span>
            </div>
            {!multiBu && (<>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">BU</label>
                <select className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={bu} onChange={e => setBu(e.target.value)}>
                  {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Carte / Constructeur</label>
                {isServiceBu(bu)
                  ? <input className="h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm text-slate-400" value={SERVICE_CARD} disabled />
                  : <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={card} onChange={e => setCard(e.target.value)} list="cards_dl" placeholder="Dell, HP, Cisco..." />
                }
                <datalist id="cards_dl">{cardOptions.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Montant (MAD)</label>
                <input type="number" min={0} className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            </>)}
            {multiBu && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-2">Lignes Multi-BU</label>
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2">
                      <select className="h-9 rounded-xl border bg-white px-2 text-sm" value={l.bu} onChange={e => { const n = [...lines]; n[i].bu = e.target.value; if (isServiceBu(e.target.value)) n[i].card = SERVICE_CARD; setLines(n) }}>
                        {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input className="h-9 rounded-xl border bg-white px-2 text-sm" placeholder="Carte" value={l.card} disabled={isServiceBu(l.bu)} onChange={e => { const n = [...lines]; n[i].card = e.target.value; setLines(n) }} list="cards_dl" />
                      <div className="flex gap-1">
                        <input type="number" className="h-9 flex-1 rounded-xl border bg-white px-2 text-sm" placeholder="Montant" value={l.amount} onChange={e => { const n = [...lines]; n[i].amount = e.target.value; setLines(n) }} />
                        {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="h-9 w-9 rounded-xl border bg-white hover:bg-red-50 text-red-500">×</button>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setLines([...lines, { bu: 'HCI', card: '', amount: '' }])} className="text-xs text-slate-500 hover:text-slate-900 underline">+ Ajouter une ligne</button>
                  <div className="text-sm font-semibold text-slate-700">Total : {mad(totalMultiBu)}</div>
                </div>
              </div>
            )}
            {statusComputed === 'Won' && (<>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">N° PO</label>
                <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-12345" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date PO (JJ/MM/AAAA)</label>
                <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={poDateDMY} onChange={e => setPoDateDMY(e.target.value)} placeholder="01/03/2026" />
              </div>
            </>)}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Next Step</label>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none" value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="Prochaine action..." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes internes</label>
              <textarea rows={3} className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none resize-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes internes..." />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t px-5 py-4 flex-shrink-0">
          <button onClick={onClose} className="h-10 px-5 rounded-xl border text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
          <button onClick={onSave} disabled={loading || success}
            className={`h-10 px-6 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-70 ${success ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
            {success ? <><Check className="h-4 w-4" /> Sauvegardé !</> : loading ? 'Sauvegarde…' : <><Save className="h-4 w-4" /> Sauvegarder</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [deal, setDeal] = useState<DealRow | null>(null)
  const [history, setHistory] = useState<ActivityRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const [dealRes, accsRes, cardsRes] = await Promise.all([
        supabase.from('opportunities').select('*, accounts(id, name)').eq('id', id).single(),
        supabase.from('accounts').select('id,name').order('name'),
        supabase.from('cards').select('name').order('name'),
      ])
      if (dealRes.error) throw new Error(dealRes.error.message)
      setDeal(dealRes.data as DealRow)
      setAccounts((accsRes.data || []) as Account[])
      setCards((cardsRes.data || []) as CardRow[])

      const { data: byId } = await supabase.from('activity_log')
        .select('id,user_email,action_type,entity_name,detail,created_at')
        .eq('entity_id', id).order('created_at', { ascending: false }).limit(50)

      const allHistory: ActivityRow[] = [...(byId || [])]
      const seen = new Set(allHistory.map(x => x.id))
      if (dealRes.data?.title) {
        const { data: byName } = await supabase.from('activity_log')
          .select('id,user_email,action_type,entity_name,detail,created_at')
          .eq('entity_name', dealRes.data.title).order('created_at', { ascending: false }).limit(50)
        for (const item of (byName || [])) {
          if (!seen.has(item.id)) { seen.add(item.id); allHistory.push(item as ActivityRow) }
        }
      }
      allHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setHistory(allHistory)
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement deal')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-sm text-slate-500">Chargement…</div></div>
  if (err || !deal) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="text-sm text-red-600">{err || 'Deal introuvable'}</div>
      <Link href="/opportunities" className="text-sm text-slate-600 underline">Retour aux deals</Link>
    </div>
  )

  const stageStyle = STAGE_COLORS[deal.stage] || STAGE_COLORS['Lead']
  const accountName = deal.accounts?.name || '—'
  const isMulti = Boolean(deal.multi_bu) || deal.bu === 'MULTI'
  const buLines = Array.isArray(deal.bu_lines) ? deal.bu_lines : []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <Link href="/opportunities" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4">
            <ArrowLeft className="h-4 w-4" /> Retour aux deals
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <span className="rounded-full px-3 py-1 text-xs font-semibold border" style={{ background: stageStyle.bg, color: stageStyle.text, borderColor: stageStyle.border }}>{deal.stage}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deal.status === 'Won' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : deal.status === 'Lost' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>{deal.status}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>
              <div className="mt-1 text-sm text-slate-500">Client : <span className="font-medium text-slate-700">{accountName}</span></div>
            </div>
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 h-10 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800">
              <Pencil className="h-4 w-4" /> Modifier ce deal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
          {[
            { label: 'Montant', value: mad(deal.amount), sub: undefined, icon: <TrendingUp className="h-4 w-4" /> },
            { label: 'Probabilité', value: `${deal.prob ?? 0}%`, sub: `Forecast : ${mad((deal.amount || 0) * ((deal.prob || 0) / 100))}`, icon: <Layers className="h-4 w-4" /> },
            { label: 'Closing prévu', value: deal.booking_month || '—', sub: undefined, icon: <Calendar className="h-4 w-4" /> },
            { label: 'BU', value: isMulti ? `Multi-BU (${buLines.length})` : (deal.bu || '—'), sub: !isMulti ? (deal.vendor || undefined) : undefined, icon: <FileText className="h-4 w-4" /> },
          ].map(k => (
            <div key={k.label} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-slate-400">{k.icon}</div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</div>
              </div>
              <div className="text-xl font-bold text-slate-900">{k.value}</div>
              {k.sub && <div className="text-xs text-slate-400 mt-1">{k.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-4">Informations du deal</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {([['Client', accountName], ['Stage', deal.stage], ['BU', isMulti ? 'Multi-BU' : (deal.bu || '—')], ['Carte', isMulti ? `${buLines.length} lignes` : (deal.vendor || '—')], ['Montant', mad(deal.amount)], ['Probabilité', `${deal.prob ?? 0}%`], ['Closing', deal.booking_month || '—'], ['Statut', deal.status]] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs text-slate-400 mb-1">{label}</div>
                    {label === 'Stage'
                      ? <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold border" style={{ background: stageStyle.bg, color: stageStyle.text, borderColor: stageStyle.border }}>{value}</span>
                      : <div className="font-medium text-slate-900">{value}</div>}
                  </div>
                ))}
              </div>
              {isMulti && buLines.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-slate-400 mb-2">Répartition Multi-BU</div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">BU</th><th className="px-3 py-2">Carte</th><th className="px-3 py-2 text-right">Montant</th></tr></thead>
                      <tbody>{buLines.map((l: any, i: number) => <tr key={i} className="border-t"><td className="px-3 py-2 font-medium">{l.bu}</td><td className="px-3 py-2 text-slate-600">{l.card}</td><td className="px-3 py-2 text-right font-medium">{mad(l.amount)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {deal.status === 'Won' && (deal.po_number || deal.po_date) && (
                <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <div className="text-xs font-semibold text-emerald-700 mb-2">Informations PO</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {deal.po_number && <div><div className="text-xs text-emerald-600">Numéro PO</div><div className="font-medium text-emerald-800">{deal.po_number}</div></div>}
                    {deal.po_date && <div><div className="text-xs text-emerald-600">Date PO</div><div className="font-medium text-emerald-800">{deal.po_date}</div></div>}
                  </div>
                </div>
              )}
            </div>
            {deal.next_step && (
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-2">→ Next Step</div>
                <div className="text-sm text-slate-700 leading-relaxed">{deal.next_step}</div>
              </div>
            )}
            {deal.notes && (
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-2">Notes internes</div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{deal.notes}</div>
              </div>
            )}
          </div>
          <div className="lg:col-span-1">
            <div className="rounded-2xl border bg-white p-5 shadow-sm sticky top-20">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-slate-400" />
                <div className="text-sm font-semibold text-slate-900">Historique</div>
              </div>
              {history.length === 0
                ? <div className="text-xs text-slate-400 text-center py-6">Aucune modification enregistrée</div>
                : <div className="space-y-3 max-h-[500px] overflow-auto">
                    {history.map(a => (
                      <div key={a.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: ACTION_COLORS[a.action_type] || '#64748b' }} />
                          <div className="w-px flex-1 bg-slate-100 mt-1" />
                        </div>
                        <div className="pb-3 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <User className="h-3 w-3 text-slate-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-slate-900">{userName(a.user_email)}</span>
                            <span className="text-white px-1.5 py-0.5 rounded-full" style={{ background: ACTION_COLORS[a.action_type] || '#64748b', fontSize: 10 }}>{ACTION_LABELS[a.action_type] || a.action_type}</span>
                          </div>
                          {a.detail && <div className="text-xs text-slate-500 mt-0.5 truncate">{a.detail}</div>}
                          <div className="text-xs text-slate-400 mt-0.5">{formatDate(a.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditPanel
          deal={deal} accounts={accounts} cards={cards}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load() }}
        />
      )}
    </div>
  )
}
