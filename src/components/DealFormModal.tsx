'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import { X, Plus, Trash2, Save, ChevronDown, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
type Account   = { id: string; name: string }
type CardRow   = { id: string; name: string }
type BuLine    = { bu: string; card: string; amount: number }
type CardSplit = { card: string; amount: number }

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = [
  'Lead', 'Discovery', 'Qualified', 'Solutioning',
  'Proposal Sent', 'Negotiation', 'Commit', 'Won', 'Lost / No decision',
] as const

const STAGE_PROB: Record<string, number> = {
  Lead: 10, Discovery: 20, Qualified: 40, Solutioning: 55,
  'Proposal Sent': 70, Negotiation: 80, Commit: 90,
  Won: 100, 'Lost / No decision': 0,
}

const BUS = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const

const SERVICE_CARD = 'Prestation'
const isService = (v: any) => String(v || '').trim().toLowerCase() === 'service'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeStatus(stage: string): 'Open' | 'Won' | 'Lost' {
  const s = (stage || '').toLowerCase()
  if (s === 'won') return 'Won'
  if (s.includes('lost')) return 'Lost'
  return 'Open'
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function isValidDMY(dmy: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dmy || '').trim())
  if (!m) return false
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3])
  if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd))
  return dt.getUTCFullYear() === yyyy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd
}

function dmyToISO(dmy: string): string | null {
  if (!isValidDMY(dmy)) return null
  const [dd, mm, yyyy] = dmy.trim().split('/')
  return `${yyyy}-${mm}-${dd}`
}

function isoToDMY(iso: string | null | undefined): string {
  const v = String(iso || '').trim()
  if (!v) return ''
  const base = v.includes('T') ? v.split('T')[0] : v
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

// ─── ComboBox (portal dropdown, searchable) ───────────────────────────────────
function ComboBox(props: {
  label: string
  placeholder: string
  items: { id: string; label: string }[]
  valueId: string | null
  onPick: (id: string, label: string) => void
  hint?: React.ReactNode
  disabled?: boolean
}) {
  const [open, setOpen]   = useState(false)
  const [q, setQ]         = useState('')
  const btnRef            = useRef<HTMLButtonElement | null>(null)
  const dropRef           = useRef<HTMLDivElement | null>(null)
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 0 })

  const picked   = useMemo(() => props.valueId ? props.items.find(x => x.id === props.valueId) ?? null : null, [props.items, props.valueId])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (!t ? props.items : props.items.filter(x => x.label.toLowerCase().includes(t))).slice(0, 40)
  }, [props.items, q])

  const recompute = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left, width: r.width })
  }

  useEffect(() => {
    if (!open) return
    recompute()
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => { window.removeEventListener('scroll', recompute, true); window.removeEventListener('resize', recompute) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const dropdown = open ? createPortal(
    <div ref={dropRef} className="fixed z-[9999] rounded-xl border border-slate-200 bg-white shadow-xl p-2"
      style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 240) }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)}
        placeholder="Tape pour filtrer…"
        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
      <div className="mt-2 max-h-[280px] overflow-auto space-y-0.5">
        {filtered.length === 0
          ? <div className="px-3 py-2 text-sm text-slate-400">Aucun résultat.</div>
          : filtered.map(it => (
              <button key={it.id} type="button"
                className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                onClick={() => { props.onPick(it.id, it.label); setOpen(false); setQ('') }}>
                {it.label}
              </button>
            ))
        }
      </div>
      {props.hint && <div className="mt-2 border-t border-slate-100 pt-2">{props.hint}</div>}
    </div>,
    document.body
  ) : null

  return (
    <div>
      {props.label && <div className="mb-1 text-xs font-semibold text-slate-600">{props.label}</div>}
      <button ref={btnRef} type="button"
        disabled={Boolean(props.disabled)}
        onClick={() => { if (!props.disabled) setOpen(v => !v) }}
        className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors
          ${props.disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white hover:border-slate-300'}`}>
        <span className={picked ? 'text-slate-900' : 'text-slate-400'}>
          {picked ? picked.label : props.placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {dropdown}
    </div>
  )
}

// ─── LockedField ──────────────────────────────────────────────────────────────
function LockedField({ label, value }: { label?: string; value: string }) {
  return (
    <div>
      {label && <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>}
      <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">
        {value}
      </div>
    </div>
  )
}

// ─── AddCardInline ────────────────────────────────────────────────────────────
function AddCardInline({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const submit = async () => {
    const v = name.trim()
    if (!v) return
    setErr(null); setLoading(true)
    try {
      await onAdd(v)
      setName(''); setOk(true)
      setTimeout(() => setOk(false), 2000)
    } catch (e: any) {
      setErr(e?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">Carte absente ? Ajouter dans la liste</div>
      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Ex: Fortinet, Barco…"
          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400" />
        <button type="button" disabled={loading || !name.trim()} onClick={submit}
          className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition-colors">
          {ok ? '✓ Ajouté' : loading ? '…' : 'Ajouter'}
        </button>
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children, span3 }: { label?: string; children: React.ReactNode; span3?: boolean }) {
  return (
    <div className={span3 ? 'col-span-3' : undefined}>
      {label && <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>}
      {children}
    </div>
  )
}

const inp = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  editRow?: any | null
  onClose: () => void
  onSaved: () => void
}

export default function DealFormModal({ editRow, onClose, onSaved }: Props) {
  const isEdit = Boolean(editRow)
  const now    = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // ── Data ──────────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards]       = useState<CardRow[]>([])
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  const accountItems = useMemo(() => accounts.map(a => ({ id: a.id, label: a.name })), [accounts])
  const cardItems    = useMemo(() => cards.map(c => ({ id: c.name, label: c.name })), [cards])

  // ── Form fields ──────────────────────────────────────────────────────────
  const [accountId,   setAccountId]   = useState<string | null>(null)
  const [title,       setTitle]       = useState('')
  const [stage,       setStage]       = useState<string>('Lead')
  const [autoProb,    setAutoProb]    = useState(true)
  const [prob,        setProb]        = useState(STAGE_PROB['Lead'])
  const [bookingMonth,setBookingMonth]= useState(defaultMonth)
  const [nextStep,    setNextStep]    = useState('')
  const [notes,       setNotes]       = useState('')

  // PO (Won only)
  const [poNumber,  setPoNumber]  = useState('')
  const [poDateDMY, setPoDateDMY] = useState('')

  // BU mode
  const [multiBu,   setMultiBu]   = useState(false)
  const [bu,        setBu]        = useState<string>('CSG')
  const [card,      setCard]      = useState('Dell')
  const [amount,    setAmount]    = useState(0)
  const [multiCard, setMultiCard] = useState(false)
  const [cardLines, setCardLines] = useState<CardSplit[]>([{ card: 'Dell', amount: 0 }])
  const [lines,     setLines]     = useState<BuLine[]>([{ bu: 'Storage', card: 'NetApp', amount: 0 }])

  const lastNonServiceCard = useRef('Dell')

  // ── Computed ──────────────────────────────────────────────────────────────
  const status           = useMemo(() => computeStatus(stage), [stage])
  const totalFromLines   = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines])
  const totalFromCards   = useMemo(() => cardLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [cardLines])

  // ── Auto-prob ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoProb) return
    setProb(STAGE_PROB[stage] ?? 10)
  }, [stage, autoProb])

  // ── Service BU logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (multiBu) return
    if (isService(bu)) {
      if (card && card !== SERVICE_CARD) lastNonServiceCard.current = card
      if (card !== SERVICE_CARD) setCard(SERVICE_CARD)
      if (multiCard) setMultiCard(false)
    } else {
      if (card === SERVICE_CARD) setCard(lastNonServiceCard.current || 'Dell')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bu, multiBu])

  // ── multiCard → amount = sum ──────────────────────────────────────────────
  useEffect(() => {
    if (!multiBu && multiCard) setAmount(totalFromCards)
  }, [multiBu, multiCard, totalFromCards])

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('accounts').select('id,name').order('name'),
      supabase.from('cards').select('id,name').order('name'),
    ]).then(([a, c]) => {
      if (a.data) setAccounts(a.data as Account[])
      if (c.data) setCards(c.data as CardRow[])
    })
  }, [])

  // ── Populate form when editing ────────────────────────────────────────────
  useEffect(() => {
    if (!editRow) return
    const r = editRow

    setAccountId(r.account_id || null)
    setTitle(r.title || '')
    setStage((r.stage as any) || 'Lead')

    const p = Number(r.prob ?? NaN)
    if (Number.isFinite(p)) { setAutoProb(false); setProb(clamp(p, 0, 100)) }
    else { setAutoProb(true); setProb(STAGE_PROB[r.stage ?? 'Lead'] ?? 10) }

    setBookingMonth(r.booking_month || defaultMonth)
    setNextStep(r.next_step || '')
    setNotes(r.notes || '')
    setPoNumber(String(r.po_number || '').trim())
    setPoDateDMY(isoToDMY(r.po_date))

    const isMulti = Boolean(r.multi_bu) || (r.bu || '').toUpperCase() === 'MULTI'
    setMultiBu(isMulti)

    if (!isMulti) {
      const buVal = r.bu || 'CSG'
      setBu(buVal)
      const raw = Array.isArray(r.bu_lines) ? r.bu_lines : []
      const isMC = raw.length >= 2 && raw.every((x: any) => String(x?.bu || '').toLowerCase() === buVal.toLowerCase()) && !isService(buVal)
      setMultiCard(isMC)
      const vend = r.vendor || 'Dell'
      if (!isService(buVal) && vend && vend !== SERVICE_CARD && vend !== 'MULTI') lastNonServiceCard.current = vend

      if (isService(buVal)) {
        setCard(SERVICE_CARD)
        setCardLines([{ card: SERVICE_CARD, amount: Number(r.amount || 0) }])
        setAmount(Number(r.amount || 0))
      } else if (isMC) {
        const cl: CardSplit[] = raw.map((x: any) => ({ card: String(x?.card || 'Dell'), amount: Number(x?.amount || 0) }))
        setCardLines(cl.length ? cl : [{ card: vend || 'Dell', amount: Number(r.amount || 0) }])
        setCard(vend && vend !== 'MULTI' ? vend : (cl[0]?.card || 'Dell'))
        setAmount(Number(r.amount || 0))
      } else {
        setCard(vend || 'Dell')
        setAmount(Number(r.amount || 0))
        setCardLines([{ card: vend || 'Dell', amount: Number(r.amount || 0) }])
      }
      setLines([{ bu: 'Storage', card: 'NetApp', amount: 0 }])
    } else {
      setMultiCard(false)
      const parsed = Array.isArray(r.bu_lines) ? r.bu_lines : []
      const safe: BuLine[] = parsed.map((x: any) => {
        const b = String(x?.bu || 'CSG')
        return { bu: b, card: isService(b) ? SERVICE_CARD : String(x?.card || 'Dell'), amount: Number(x?.amount || 0) }
      })
      setLines(safe.length ? safe : [{ bu: 'Storage', card: 'NetApp', amount: 0 }])
      setAmount(Number(r.amount || 0))
      setBu('CSG'); setCard('Dell')
      setCardLines([{ card: 'Dell', amount: 0 }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRow])

  // ── Add card to DB ─────────────────────────────────────────────────────────
  const addCardIfMissing = async (name: string) => {
    const v = name.trim()
    if (!v) return
    const exists = cards.some(c => c.name.toLowerCase() === v.toLowerCase())
    if (exists) return
    const { data, error } = await supabase.from('cards').insert({ name: v }).select('id,name').single()
    if (error) throw new Error(error.message)
    setCards(prev => [...prev, data as CardRow].sort((a, b) => a.name.localeCompare(b.name)))
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!accountId) return 'Compte obligatoire.'
    if (!title.trim()) return 'Intitulé du deal obligatoire.'
    if (!stage) return 'Étape obligatoire.'
    if (!bookingMonth || !/^\d{4}-\d{2}$/.test(bookingMonth)) return 'Closing obligatoire (format YYYY-MM).'
    if (!nextStep.trim()) return 'Next step obligatoire.'

    if (status === 'Won') {
      if (!poNumber.trim()) return 'WON : Numéro de PO obligatoire.'
      if (!poDateDMY.trim()) return 'WON : Date PO obligatoire (JJ/MM/AAAA).'
      if (!isValidDMY(poDateDMY)) return 'WON : Date PO invalide. Format attendu : JJ/MM/AAAA.'
    }

    if (!multiBu) {
      if (!bu) return 'BU obligatoire.'
      if ((Number(amount) || 0) <= 0) return 'Montant obligatoire (> 0).'
      if (!isService(bu)) {
        if (!multiCard) {
          if (!card.trim()) return 'Carte obligatoire.'
        } else {
          for (let i = 0; i < cardLines.length; i++) {
            if (!String(cardLines[i].card || '').trim()) return `Multi-carte : Carte manquante ligne ${i + 1}.`
            if ((Number(cardLines[i].amount) || 0) <= 0) return `Multi-carte : Montant manquant ligne ${i + 1}.`
          }
        }
      }
    } else {
      if (!lines.length) return 'Multi-BU : ajoute au moins une ligne.'
      for (let i = 0; i < lines.length; i++) {
        if (!String(lines[i].bu || '').trim()) return `Multi-BU : BU manquante ligne ${i + 1}.`
        if (!isService(lines[i].bu) && !String(lines[i].card || '').trim()) return `Multi-BU : Carte manquante ligne ${i + 1}.`
        if ((Number(lines[i].amount) || 0) <= 0) return `Multi-BU : Montant manquant ligne ${i + 1}.`
      }
    }
    return null
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setErr(null)
    const v = validate()
    if (v) { setErr(v); return }

    setSaving(true)
    try {
      const payload: any = {
        account_id: accountId,
        title: title.trim(),
        stage,
        status,
        prob: clamp(Number(prob) || 0, 0, 100),
        booking_month: bookingMonth || null,
        next_step: nextStep.trim(),
        notes: notes.trim() || null,
        multi_bu: Boolean(multiBu),
        po_number: status === 'Won' ? poNumber.trim() : null,
        po_date:   status === 'Won' ? dmyToISO(poDateDMY) : null,
      }

      if (!multiBu) {
        payload.bu = bu
        if (isService(bu)) {
          payload.vendor = SERVICE_CARD
          payload.bu_lines = null
          payload.amount = Number(amount) || 0
        } else if (multiCard) {
          const clean = cardLines.map(l => ({ bu: String(bu), card: String(l.card || '').trim(), amount: Number(l.amount) || 0 }))
          payload.vendor   = clean.length >= 2 ? 'MULTI' : (clean[0]?.card || card)
          payload.bu_lines = clean
          payload.amount   = totalFromCards
        } else {
          payload.vendor   = card
          payload.bu_lines = null
          payload.amount   = Number(amount) || 0
        }
      } else {
        const cleanLines = lines.map(l => {
          const b = String(l.bu || '').trim()
          return { bu: b, card: isService(b) ? SERVICE_CARD : String(l.card || '').trim(), amount: Number(l.amount) || 0 }
        })
        payload.bu       = 'MULTI'
        payload.vendor   = 'MULTI'
        payload.bu_lines = cleanLines
        payload.amount   = totalFromLines
      }

      if (isEdit) {
        const { error } = await supabase.from('opportunities').update(payload).eq('id', editRow.id)
        if (error) throw error
        await logActivity({
          action_type: status === 'Won' ? 'won' : status === 'Lost' ? 'lost' : 'update',
          entity_type: 'deal',
          entity_id: editRow.id,
          entity_name: title.trim(),
          detail: `${stage} · ${payload.bu || ''} · ${payload.amount ? payload.amount + ' MAD' : ''}`.trim(),
        })
      } else {
        const { data: inserted, error } = await supabase.from('opportunities').insert(payload).select('id').single()
        if (error) throw error
        await logActivity({
          action_type: 'create',
          entity_type: 'deal',
          entity_id: inserted?.id ?? undefined,
          entity_name: title.trim(),
          detail: `${stage} · ${payload.bu || ''} · ${payload.amount ? payload.amount + ' MAD' : ''}`.trim(),
        })
      }

      onSaved()
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="text-base font-bold text-slate-900">
              {isEdit ? 'Modifier le deal' : 'Nouveau deal'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {isEdit
                ? (editRow?.accounts?.name || editRow?.account_id || '')
                : 'Remplis tous les champs obligatoires (*)'}
            </div>
          </div>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Infos principales ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            {/* Compte */}
            <ComboBox
              label="Compte *"
              placeholder="Tape pour filtrer…"
              items={accountItems}
              valueId={accountId}
              onPick={(id) => setAccountId(id)}
              hint={
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Compte absent ? Ajoute-le dans Comptes.</span>
                  <Link href="/accounts" target="_blank"
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium hover:bg-slate-50">
                    <ExternalLink className="h-3 w-3" /> Comptes
                  </Link>
                </div>
              }
            />

            {/* Titre */}
            <Field label="Intitulé du deal *" span3={false}>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Projet stockage NAS OCP…"
                className={inp} />
            </Field>

            {/* Étape */}
            <Field label="Étape (pipeline) *">
              <div className="relative">
                <select value={stage} onChange={e => setStage(e.target.value)}
                  className={inp + ' appearance-none pr-9'}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>

            {/* Probabilité + AUTO */}
            <div className="flex items-end gap-3">
              <Field label={`Probabilité (%) *`}>
                <input type="number" min={0} max={100}
                  value={prob}
                  disabled={autoProb}
                  onChange={e => { setAutoProb(false); setProb(clamp(Number(e.target.value), 0, 100)) }}
                  className={inp + (autoProb ? ' bg-slate-50 text-slate-400' : '')} />
              </Field>
              <label className="mb-2 flex shrink-0 cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={autoProb}
                  onChange={e => setAutoProb(e.target.checked)}
                  className="h-4 w-4 rounded" />
                Auto
              </label>
            </div>

            {/* Closing */}
            <Field label="Closing (YYYY-MM) *">
              <input type="month" value={bookingMonth} onChange={e => setBookingMonth(e.target.value)}
                className={inp} />
            </Field>

            {/* Statut calculé (lecture seule) */}
            <Field label="Statut (calculé)">
              <div className={`flex h-10 items-center rounded-xl border px-3 text-sm font-semibold
                ${status === 'Won' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                  status === 'Lost' ? 'border-red-200 bg-red-50 text-red-600' :
                  'border-blue-200 bg-blue-50 text-blue-700'}`}>
                {status}
              </div>
            </Field>
          </div>

          {/* ── PO (Won uniquement) ── */}
          {status === 'Won' && (
            <Section title="📋 PO — obligatoire pour les deals Won">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Numéro PO *">
                  <input value={poNumber} onChange={e => setPoNumber(e.target.value)}
                    placeholder="Ex: PO-2026-00123"
                    className={inp} />
                </Field>
                <Field label="Date PO (JJ/MM/AAAA) *">
                  <input value={poDateDMY} onChange={e => setPoDateDMY(e.target.value)}
                    placeholder="31/01/2026"
                    className={inp} />
                  {poDateDMY && !isValidDMY(poDateDMY) &&
                    <div className="mt-1 text-xs text-red-600">Format attendu : JJ/MM/AAAA</div>}
                </Field>
              </div>
            </Section>
          )}

          {/* ── Toggle Multi-BU ── */}
          <label className="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={multiBu}
              onChange={e => { setMultiBu(e.target.checked); if (e.target.checked) setMultiCard(false) }}
              className="h-4 w-4 rounded" />
            Multi-BU — plusieurs BU et cartes différentes
          </label>

          {/* ── Single BU ── */}
          {!multiBu && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                {/* BU */}
                <Field label="BU *">
                  <div className="relative">
                    <select value={bu}
                      onChange={e => {
                        const v = e.target.value
                        if (!isService(v) && card !== SERVICE_CARD) lastNonServiceCard.current = card
                        setBu(v)
                      }}
                      className={inp + ' appearance-none pr-9'}>
                      {BUS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </Field>

                {/* Multi-carte checkbox (pas Service) */}
                {!isService(bu) ? (
                  <div className="sm:col-span-2 flex items-end pb-2">
                    <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={multiCard}
                        onChange={e => {
                          const on = e.target.checked
                          setMultiCard(on)
                          if (on) {
                            const seed = card && card !== SERVICE_CARD ? card : lastNonServiceCard.current || 'Dell'
                            setCardLines([{ card: seed, amount: Number(amount) || 0 }])
                            setCard(seed)
                          } else {
                            if (cardLines[0]?.card) setCard(cardLines[0].card)
                          }
                        }}
                        className="h-4 w-4 rounded" />
                      Multi-carte (même BU) — split montant par carte
                    </label>
                  </div>
                ) : <div className="sm:col-span-2" />}

                {/* Carte ou table multi-carte */}
                {isService(bu) ? (
                  <LockedField label="Carte (constructeur/éditeur) *" value={SERVICE_CARD} />
                ) : multiCard ? (
                  <div className="sm:col-span-3">
                    <Section title={`Répartition Multi-carte — BU : ${bu}  •  Total : ${mad(totalFromCards)}`}>
                      <div className="overflow-auto">
                        <table className="w-full min-w-[600px] text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                              <th className="py-2 text-left">Carte *</th>
                              <th className="py-2 text-left">Montant (MAD) *</th>
                              <th className="py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {cardLines.map((l, i) => (
                              <tr key={i} className="border-b border-slate-100 last:border-0">
                                <td className="py-2 pr-3">
                                  <ComboBox label="" placeholder="Tape pour filtrer…"
                                    items={cardItems} valueId={l.card || null}
                                    onPick={(_id, label) => setCardLines(prev => prev.map((x, j) => j === i ? { ...x, card: label } : x))} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input type="number" min={0} value={l.amount}
                                    onChange={e => setCardLines(prev => prev.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))}
                                    className={inp} />
                                </td>
                                <td className="py-2">
                                  <button type="button"
                                    onClick={() => setCardLines(prev => prev.filter((_, j) => j !== i))}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button type="button"
                          onClick={() => setCardLines(prev => [...prev, { card: cardItems[0]?.id || 'Dell', amount: 0 }])}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium hover:bg-slate-50 transition-colors">
                          <Plus className="h-3.5 w-3.5" /> Ajouter une carte
                        </button>
                      </div>
                      <div className="mt-3">
                        <AddCardInline onAdd={addCardIfMissing} />
                      </div>
                    </Section>
                  </div>
                ) : (
                  <ComboBox label="Carte (constructeur/éditeur) *"
                    placeholder="Tape pour filtrer…"
                    items={cardItems} valueId={card}
                    onPick={(_id, label) => {
                      setCard(label)
                      if (!isService(bu) && label !== SERVICE_CARD) lastNonServiceCard.current = label
                      setCardLines([{ card: label, amount: Number(amount) || 0 }])
                    }} />
                )}

                {/* Montant */}
                <Field label="Montant (MAD) *">
                  <input type="number" min={0} value={amount}
                    disabled={multiCard}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setAmount(v)
                      if (!multiCard) setCardLines([{ card, amount: v }])
                    }}
                    className={inp + (multiCard ? ' bg-slate-100 text-slate-500' : '')} />
                  {multiCard && <div className="mt-1 text-xs text-slate-400">Calculé automatiquement (somme des cartes).</div>}
                </Field>
              </div>

              {/* AddCardInline (single card, non-service) */}
              {!isService(bu) && !multiCard && (
                <AddCardInline
                  onAdd={async name => {
                    await addCardIfMissing(name)
                    setCard(name)
                    setCardLines([{ card: name, amount: Number(amount) || 0 }])
                  }}
                />
              )}
            </div>
          )}

          {/* ── Multi-BU ── */}
          {multiBu && (
            <Section title={`Répartition Multi-BU  •  Total : ${mad(totalFromLines)}`}>
              <div className="overflow-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-2 text-left">BU *</th>
                      <th className="py-2 text-left">Carte *</th>
                      <th className="py-2 text-left">Montant (MAD) *</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3">
                          <div className="relative">
                            <select value={l.bu}
                              onChange={e => {
                                const v = e.target.value
                                setLines(prev => prev.map((x, j) => j === i ? {
                                  ...x, bu: v,
                                  card: isService(v) ? SERVICE_CARD : x.card === SERVICE_CARD ? 'Dell' : x.card,
                                } : x))
                              }}
                              className={inp + ' appearance-none pr-9'}>
                              {BUS.map(x => <option key={x} value={x}>{x}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          {isService(l.bu)
                            ? <LockedField value={SERVICE_CARD} />
                            : <ComboBox label="" placeholder="Tape pour filtrer…"
                                items={cardItems} valueId={l.card || null}
                                onPick={(_id, label) => setLines(prev => prev.map((x, j) => j === i ? { ...x, card: label } : x))} />
                          }
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" min={0} value={l.amount}
                            onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))}
                            className={inp} />
                        </td>
                        <td className="py-2">
                          <button type="button"
                            onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button"
                  onClick={() => setLines(prev => [...prev, { bu: 'CSG', card: 'Dell', amount: 0 }])}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium hover:bg-slate-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                </button>
                <span className="text-xs text-slate-400">Total calculé automatiquement.</span>
              </div>
              <div className="mt-3">
                <AddCardInline onAdd={addCardIfMissing} />
              </div>
            </Section>
          )}

          {/* ── Next step + Notes ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Next step *">
              <input value={nextStep} onChange={e => setNextStep(e.target.value)}
                placeholder="Ex: Relancer lundi, envoyer offre…"
                className={inp} />
            </Field>
            <Field label="Notes" span3={false}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Notes internes…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none" />
            </Field>
          </div>

          {/* Error */}
          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Sauvegarde…' : isEdit ? 'Enregistrer les modifications' : 'Créer le deal'}
          </button>
        </div>

      </div>
    </div>
  )
}
