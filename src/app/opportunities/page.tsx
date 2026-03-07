'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Trash2, Pencil, X, RefreshCw, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'

type Account = { id: string; name: string }
type CardRow = { id: string; name: string }

type BuLine = { bu: string; card: string; amount: number }
type CardSplitLine = { card: string; amount: number }

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
  accounts?: { name?: string } | null
}

const STAGES = [
  'Lead',
  'Discovery',
  'Qualified',
  'Solutioning',
  'Proposal Sent',
  'Negotiation',
  'Commit',
  'Won',
  'Lost / No decision',
] as const

const STAGE_DEFAULT_PROB: Record<(typeof STAGES)[number], number> = {
  Lead: 10,
  Discovery: 20,
  Qualified: 40,
  Solutioning: 55,
  'Proposal Sent': 70,
  Negotiation: 80,
  Commit: 90,
  Won: 100,
  'Lost / No decision': 0,
}

const BUS = ['HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG'] as const

const SERVICE_CARD = 'Prestation'
const isServiceBu = (v: any) => String(v || '').trim().toLowerCase() === 'service'

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(' ')
}

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

function ComboBox(props: {
  label: string
  placeholder: string
  items: { id: string; label: string }[]
  valueId: string | null
  onPick: (id: string, label: string) => void
  rightHint?: React.ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  const picked = useMemo(
    () => (props.valueId ? props.items.find((x) => x.id === props.valueId) || null : null),
    [props.items, props.valueId]
  )

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = !t ? props.items : props.items.filter((x) => x.label.toLowerCase().includes(t))
    return base.slice(0, 40)
  }, [props.items, q])

  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0, left: 0, width: 0, openUp: false,
  })

  const recomputePos = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8, maxH = 340
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const top = openUp ? Math.max(8, r.top - gap - maxH) : r.bottom + gap
    setPos({ top, left: r.left, width: r.width, openUp })
  }

  useEffect(() => {
    if (!open) return
    recomputePos()
    const onScroll = () => recomputePos()
    const onResize = () => recomputePos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!btnRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const dropdown = open
    ? createPortal(
        <div ref={dropRef} className="fixed z-[9999] rounded-xl border bg-white p-2 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <input className="h-9 w-full rounded-lg border px-3 text-sm" value={q}
            onChange={(e) => setQ(e.target.value)} placeholder="Tape pour filtrer..." autoFocus />
          <div className="mt-2 max-h-[300px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-sm text-slate-500">Aucun résultat.</div>
            ) : (
              filtered.map((it) => (
                <button key={it.id} type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => { props.onPick(it.id, it.label); setOpen(false); setQ('') }}>
                  <span>{it.label}</span>
                </button>
              ))
            )}
          </div>
          {props.rightHint ? <div className="mt-2 border-t pt-2">{props.rightHint}</div> : null}
        </div>,
        document.body
      )
    : null

  return (
    <div className="relative">
      <div className="mb-1 text-xs font-medium text-slate-600">{props.label}</div>
      <button ref={btnRef} type="button"
        className={classNames('flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-sm',
          props.disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white')}
        onClick={() => { if (!props.disabled) setOpen((v) => !v) }}>
        <span className={classNames(!picked ? 'text-slate-400' : 'text-slate-900')}>
          {picked ? picked.label : props.placeholder}
        </span>
        <span className="ml-3 text-slate-400">▾</span>
      </button>
      {dropdown}
    </div>
  )
}

function LockedField(props: { label: string; value: string }) {
  return (
    <div className="relative">
      {props.label ? <div className="mb-1 text-xs font-medium text-slate-600">{props.label}</div> : null}
      <div className="flex h-10 w-full items-center rounded-xl border bg-slate-100 px-3 text-sm text-slate-700">
        {props.value}
      </div>
    </div>
  )
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className={classNames('w-full rounded-2xl bg-white shadow-xl', props.wide ? 'max-w-5xl' : 'max-w-3xl')}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          <button className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={props.onClose}>
            <X className="h-4 w-4" /> Fermer
          </button>
        </div>
        <div className="max-h-[82vh] overflow-auto p-5">{props.children}</div>
      </div>
    </div>
  )
}

type SortKey = 'account' | 'stage' | 'bu' | 'card' | 'amount' | 'prob' | 'closing'
type SortDir = 'asc' | 'desc'

export default function OpportunitiesPage() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const defaultClosing = `${yyyy}-${mm}`

  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CardRow[]>([])

  const cardItems = useMemo(() => cards.map((c) => ({ id: c.name, label: c.name })), [cards])
  const accountItems = useMemo(() => accounts.map((a) => ({ id: a.id, label: a.name })), [accounts])

  const [rows, setRows] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('closing')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [openEdit, setOpenEdit] = useState(false)

  const [accountId, setAccountId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState<(typeof STAGES)[number]>('Lead')
  const [autoProb, setAutoProb] = useState(true)
  const [prob, setProb] = useState<number>(STAGE_DEFAULT_PROB['Lead'])
  const [bookingMonth, setBookingMonth] = useState<string>(defaultClosing)
  const [nextStep, setNextStep] = useState('')
  const [notes, setNotes] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [poDateDMY, setPoDateDMY] = useState('')
  const [multiBu, setMultiBu] = useState(false)
  const [bu, setBu] = useState<(typeof BUS)[number]>('CSG')
  const [card, setCard] = useState<string>('Dell')
  const [amount, setAmount] = useState<number>(0)
  const lastNonServiceCardRef = useRef<string>('Dell')
  const [multiCard, setMultiCard] = useState(false)
  const [cardLines, setCardLines] = useState<CardSplitLine[]>([{ card: 'Dell', amount: 0 }])
  const [lines, setLines] = useState<BuLine[]>([{ bu: 'Storage', card: 'NetApp', amount: 0 }])

  const totalFromLines = useMemo(() => (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines])
  const totalFromCardLines = useMemo(() => (cardLines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0), [cardLines])
  const statusComputed = useMemo(() => computeStatus(stage), [stage])

  useEffect(() => {
    if (!autoProb) return
    setProb(STAGE_DEFAULT_PROB[stage])
  }, [stage, autoProb])

  useEffect(() => {
    if (multiBu) return
    if (isServiceBu(bu)) {
      if (card && card !== SERVICE_CARD) lastNonServiceCardRef.current = card
      if (card !== SERVICE_CARD) setCard(SERVICE_CARD)
      if (multiCard) setMultiCard(false)
    } else {
      if (card === SERVICE_CARD) setCard(lastNonServiceCardRef.current || 'Dell')
    }
  }, [bu, multiBu])

  useEffect(() => {
    if (multiBu && multiCard) setMultiCard(false)
  }, [multiBu])

  useEffect(() => {
    if (!multiBu && multiCard) setAmount(Number(totalFromCardLines) || 0)
  }, [multiBu, multiCard, totalFromCardLines])

  const resetForm = () => {
    setEditingId(null); setAccountId(null); setTitle(''); setStage('Lead')
    setAutoProb(true); setProb(STAGE_DEFAULT_PROB['Lead']); setBookingMonth(defaultClosing)
    setNextStep(''); setNotes(''); setPoNumber(''); setPoDateDMY('')
    setMultiBu(false); setMultiCard(false); setBu('CSG'); setCard('Dell'); setAmount(0)
    setLines([{ bu: 'Storage', card: 'NetApp', amount: 0 }])
    setCardLines([{ card: 'Dell', amount: 0 }])
    lastNonServiceCardRef.current = 'Dell'
  }

  const openCreate = () => { setErr(null); setInfo(null); resetForm(); setOpenEdit(true) }

  const detectMultiCardFromRow = (r: DealRow) => {
    const raw = Array.isArray(r.bu_lines) ? r.bu_lines : []
    const buVal = String(r.bu || '').trim()
    if (!buVal || buVal.toUpperCase() === 'MULTI') return false
    if (!raw.length) return false
    const sameBu = raw.every((x: any) => String(x?.bu || '').trim().toLowerCase() === buVal.toLowerCase())
    return sameBu && raw.length >= 2
  }

  const openModify = (r: DealRow) => {
    setInfo(null); setErr(null); setEditingId(r.id); setAccountId(r.account_id)
    setTitle(r.title || ''); setStage((r.stage as any) || 'Lead')
    const p = Number(r.prob ?? NaN)
    if (Number.isFinite(p)) { setAutoProb(false); setProb(clamp(p, 0, 100)) }
    else { setAutoProb(true); setProb((STAGE_DEFAULT_PROB as Record<string, number>)[String(r.stage || 'Lead')] ?? 10) }
    setBookingMonth(r.booking_month || defaultClosing)
    setNextStep(r.next_step || ''); setNotes(r.notes || '')
    setPoNumber(String(r.po_number || '').trim()); setPoDateDMY(isoToDMY(r.po_date || null))
    const isMulti = Boolean(r.multi_bu) || (r.bu || '').toUpperCase() === 'MULTI'
    setMultiBu(isMulti)
    if (!isMulti) {
      const buVal = ((r.bu as any) || 'CSG') as any; setBu(buVal)
      const isMC = detectMultiCardFromRow(r) && !isServiceBu(buVal); setMultiCard(isMC)
      const vend = (r.vendor as any) || 'Dell'
      if (!isServiceBu(buVal) && vend && vend !== SERVICE_CARD && vend !== 'MULTI') lastNonServiceCardRef.current = vend
      if (isServiceBu(buVal)) { setCard(SERVICE_CARD); setCardLines([{ card: SERVICE_CARD, amount: Number(r.amount || 0) }]); setAmount(Number(r.amount || 0)) }
      else if (isMC) {
        const raw = Array.isArray(r.bu_lines) ? r.bu_lines : []
        const safeLines: CardSplitLine[] = raw.map((x: any) => ({ card: String(x?.card || 'Dell'), amount: Number(x?.amount || 0) }))
        setCardLines(safeLines.length ? safeLines : [{ card: vend || 'Dell', amount: Number(r.amount || 0) }])
        setCard(vend && vend !== 'MULTI' ? vend : (safeLines[0]?.card || 'Dell')); setAmount(Number(r.amount || 0))
      } else { setCard(vend || 'Dell'); setAmount(Number(r.amount || 0)); setCardLines([{ card: vend || 'Dell', amount: Number(r.amount || 0) }]) }
      setLines([{ bu: 'Storage', card: 'NetApp', amount: 0 }])
    } else {
      setMultiCard(false)
      const parsed = Array.isArray(r.bu_lines) ? r.bu_lines : []
      const safe: BuLine[] = parsed.map((x: any) => { const b = String(x?.bu || '').trim(); return { bu: b, card: isServiceBu(b) ? SERVICE_CARD : String(x?.card || 'Dell'), amount: Number(x?.amount || 0) } })
      setLines(safe.length ? safe : [{ bu: 'Storage', card: 'NetApp', amount: 0 }])
      setAmount(Number(r.amount || 0)); setBu('CSG'); setCard('Dell'); setCardLines([{ card: 'Dell', amount: 0 }])
    }
    setOpenEdit(true)
  }

  const load = async () => {
    setLoading(true); setErr(null); setInfo(null)
    try {
      const [a, c, d] = await Promise.all([
        supabase.from('accounts').select('id,name').order('name', { ascending: true }),
        supabase.from('cards').select('id,name').order('name', { ascending: true }),
        supabase.from('opportunities')
          .select('id,account_id,title,stage,status,bu,vendor,amount,prob,booking_month,next_step,notes,multi_bu,bu_lines,po_number,po_date,accounts(name)')
          .order('created_at', { ascending: false }),
      ])
      if (a.error) throw new Error(a.error.message)
      if (d.error) throw new Error(d.error.message)
      setAccounts((a.data || []) as Account[])
      setCards((c.data || []) as CardRow[])
      setRows((d.data || []) as DealRow[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addCardIfMissing = async (name: string) => {
    const v = name.trim(); if (!v) return
    if (cards.some((c) => c.name.toLowerCase() === v.toLowerCase())) return
    const ins = await supabase.from('cards').insert({ name: v }).select('id,name').single()
    if (ins.error) throw new Error(ins.error.message)
    setCards((prev) => [...prev, ins.data as any].sort((x, y) => x.name.localeCompare(y.name)))
  }

  const validateRequired = () => {
    if (!accountId) return 'Compte obligatoire.'
    if (!title.trim()) return 'Intitulé du deal obligatoire.'
    if (!bookingMonth || !/^\d{4}-\d{2}$/.test(bookingMonth)) return 'Closing obligatoire (YYYY-MM).'
    if (!nextStep.trim()) return 'Next step obligatoire.'
    if (statusComputed === 'Won') {
      if (!poNumber.trim()) return 'WON: Numéro de PO obligatoire.'
      if (!poDateDMY.trim()) return 'WON: Date PO obligatoire (JJ/MM/AAAA).'
      if (!isValidDMY(poDateDMY)) return 'WON: Date PO invalide.'
    }
    if (!multiBu) {
      if (!bu) return 'BU obligatoire.'
      if ((Number(amount) || 0) <= 0) return 'Montant obligatoire ( > 0 ).'
      if (!isServiceBu(bu) && !multiCard && !card.trim()) return 'Carte obligatoire.'
      if (!isServiceBu(bu) && multiCard) {
        for (let i = 0; i < cardLines.length; i++) {
          if (!String(cardLines[i].card || '').trim()) return `Multi-carte: Carte manquante ligne ${i + 1}.`
          if ((Number(cardLines[i].amount) || 0) <= 0) return `Multi-carte: Montant manquant ligne ${i + 1}.`
        }
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (!String(lines[i].bu || '').trim()) return `Multi-BU: BU manquante ligne ${i + 1}.`
        if (!isServiceBu(lines[i].bu) && !String(lines[i].card || '').trim()) return `Multi-BU: Carte manquante ligne ${i + 1}.`
        if ((Number(lines[i].amount) || 0) <= 0) return `Multi-BU: Montant manquant ligne ${i + 1}.`
      }
    }
    return null
  }

  const onSave = async () => {
    setErr(null); setInfo(null)
    const v = validateRequired(); if (v) { setErr(v); return }
    const status = computeStatus(stage)
    const payload: any = {
      account_id: accountId, title: title.trim(), stage, status,
      prob: clamp(Number(prob) || 0, 0, 100), booking_month: bookingMonth || null,
      next_step: nextStep.trim(), notes: notes.trim() || null, multi_bu: Boolean(multiBu),
      po_number: status === 'Won' ? poNumber.trim() : null,
      po_date: status === 'Won' ? dmyToISO(poDateDMY) : null,
    }
    if (!multiBu) {
      payload.bu = bu
      if (isServiceBu(bu)) { payload.vendor = SERVICE_CARD; payload.bu_lines = null; payload.amount = Number(amount) || 0 }
      else if (multiCard) {
        const clean = cardLines.map((l) => ({ bu: String(bu), card: String(l.card || '').trim(), amount: Number(l.amount) || 0 }))
        payload.vendor = clean.length >= 2 ? 'MULTI' : (clean[0]?.card || card)
        payload.bu_lines = clean; payload.amount = Number(totalFromCardLines) || 0
      } else { payload.vendor = card; payload.bu_lines = null; payload.amount = Number(amount) || 0 }
    } else {
      const cleanLines = lines.map((l) => { const b = String(l.bu || '').trim(); return { bu: b, card: isServiceBu(b) ? SERVICE_CARD : String(l.card || '').trim(), amount: Number(l.amount) || 0 } })
      payload.bu = 'MULTI'; payload.vendor = 'MULTI'; payload.bu_lines = cleanLines; payload.amount = Number(totalFromLines) || 0
    }
    setLoading(true)
    try {
      if (editingId) {
        const r = await supabase.from('opportunities').update(payload).eq('id', editingId)
        if (r.error) throw new Error(r.error.message)
        setInfo('Deal modifié.')
      } else {
        const r = await supabase.from('opportunities').insert(payload)
        if (r.error) throw new Error(r.error.message)
        setInfo('Deal ajouté.')
      }
      setOpenEdit(false); resetForm(); await load()
    } catch (e: any) { setErr(e?.message || 'Erreur sauvegarde')
    } finally { setLoading(false) }
  }

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce deal ?')) return
    setLoading(true)
    try {
      const r = await supabase.from('opportunities').delete().eq('id', id)
      if (r.error) throw new Error(r.error.message)
      setInfo('Deal supprimé.'); await load()
    } catch (e: any) { setErr(e?.message || 'Erreur suppression')
    } finally { setLoading(false) }
  }

  const toggleSort = (key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return prev } setSortDir('asc'); return key })
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    const dir = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let A: any, B: any
      switch (sortKey) {
        case 'account': A = (a.accounts?.name || '').toLowerCase(); B = (b.accounts?.name || '').toLowerCase(); break
        case 'stage': A = (a.stage || '').toLowerCase(); B = (b.stage || '').toLowerCase(); break
        case 'bu': A = (a.bu || '').toLowerCase(); B = (b.bu || '').toLowerCase(); break
        case 'card': A = (a.vendor || '').toLowerCase(); B = (b.vendor || '').toLowerCase(); break
        case 'amount': A = Number(a.amount || 0); B = Number(b.amount || 0); break
        case 'prob': A = Number(a.prob ?? 0); B = Number(b.prob ?? 0); break
        default: A = (a.booking_month || ''); B = (b.booking_month || ''); break
      }
      if (typeof A === 'number' && typeof B === 'number') return (A - B) * dir
      return String(A).localeCompare(String(B)) * dir
    })
    return copy
  }, [rows, sortKey, sortDir])

  const SortHeader = (p: { k: SortKey; label: string }) => (
    <button type="button" className="inline-flex items-center gap-1 text-left text-slate-600 hover:text-slate-900" onClick={() => toggleSort(p.k)}>
      {p.label} <ArrowUpDown className="h-4 w-4 opacity-70" />
      {sortKey === p.k ? <span className="text-[11px] text-slate-500">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
    </button>
  )

  const cardCell = (r: DealRow) => {
    const buV = String(r.bu || '').toUpperCase()
    if (buV === 'MULTI') return 'Multi-BU'
    const bl = Array.isArray(r.bu_lines) ? r.bu_lines : []
    if (bl.length >= 2 && String(r.vendor || '').toUpperCase() === 'MULTI') return `Multi (${bl.length})`
    return r.vendor || '—'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Deals</div>
            <div className="text-sm text-slate-500">Créer / modifier les opportunités. Multi-BU + Multi-carte. Cartes = constructeurs/éditeurs.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouveau deal
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
            </button>
            <Link href="/accounts" className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100">Comptes</Link>
          </div>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}

        <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Liste des deals</div>
            <div className="text-xs text-slate-500">{rows.length} deals</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left">
                <tr className="border-b">
                  <th className="py-2"><SortHeader k="account" label="Compte" /></th>
                  <th className="py-2">Deal</th>
                  <th className="py-2"><SortHeader k="stage" label="Stage" /></th>
                  <th className="py-2"><SortHeader k="bu" label="BU" /></th>
                  <th className="py-2"><SortHeader k="card" label="Carte" /></th>
                  <th className="py-2"><SortHeader k="amount" label="Montant" /></th>
                  <th className="py-2"><SortHeader k="prob" label="Prob" /></th>
                  <th className="py-2"><SortHeader k="closing" label="Closing" /></th>
                  <th className="py-2">Next step</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 font-medium text-slate-900">{r.accounts?.name || '—'}</td>
                    <td className="py-2">{r.title}</td>
                    <td className="py-2">{r.stage}</td>
                    <td className="py-2">{r.bu || '—'}</td>
                    <td className="py-2">{cardCell(r)}</td>
                    <td className="py-2 font-medium text-slate-900">{mad(Number(r.amount || 0))}</td>
                    <td className="py-2">{Number(r.prob ?? 0)}%</td>
                    <td className="py-2">{r.booking_month || '—'}</td>
                    <td className="py-2">{r.next_step || '—'}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={() => openModify(r)}>
                          <Pencil className="h-4 w-4" /> Modifier
                        </button>
                        <button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700" onClick={() => onDelete(r.id)}>
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={10} className="py-6 text-center text-sm text-slate-500">Aucun deal pour l'instant.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <Modal open={openEdit} wide title={editingId ? 'Modifier un deal' : 'Nouveau deal'} onClose={() => { setOpenEdit(false); resetForm() }}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ComboBox label="Compte *" placeholder="Tape pour filtrer..." items={accountItems} valueId={accountId} onPick={(id) => setAccountId(id)}
              rightHint={<div className="flex items-center justify-between gap-2 text-sm"><div className="text-slate-600">Si le compte n'existe pas, ajoute-le dans Comptes.</div><Link className="rounded-lg border px-3 py-2 hover:bg-slate-50" href="/accounts">Ouvrir Comptes</Link></div>} />
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs font-medium text-slate-600">Intitulé du deal *</div>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Projet de stockage NAS" />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">Étape (pipeline) *</div>
              <select className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={stage} onChange={(e) => setStage(e.target.value as any)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <div className="mb-1 text-xs font-medium text-slate-600">Probabilité (%) *</div>
                <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" type="number" min={0} max={100} value={prob}
                  onChange={(e) => { setAutoProb(false); setProb(clamp(Number(e.target.value), 0, 100)) }} />
              </div>
              <label className="mb-2 flex select-none items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={autoProb} onChange={(e) => setAutoProb(e.target.checked)} /> Auto
              </label>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">Closing (YYYY-MM) *</div>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" type="month" value={bookingMonth} onChange={(e) => setBookingMonth(e.target.value)} />
            </div>
            {statusComputed === 'Won' ? (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">Numéro PO *</div>
                  <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-00123" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">Date PO (JJ/MM/AAAA) *</div>
                  <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={poDateDMY} onChange={(e) => setPoDateDMY(e.target.value)} placeholder="31/01/2026" />
                  {poDateDMY && !isValidDMY(poDateDMY) ? <div className="mt-1 text-xs text-red-600">Format: JJ/MM/AAAA</div> : null}
                </div>
              </>
            ) : null}
            <div className="lg:col-span-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={multiBu} onChange={(e) => setMultiBu(e.target.checked)} /> Multi-BU (plusieurs BU + cartes)
              </label>
            </div>
            {!multiBu ? (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">BU *</div>
                  <select className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={bu} onChange={(e) => setBu(e.target.value as any)}>
                    {BUS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                {!isServiceBu(bu) ? (
                  <div className="lg:col-span-2 flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={multiCard} onChange={(e) => {
                        const on = e.target.checked; setMultiCard(on)
                        if (on) { const s = card !== SERVICE_CARD ? card : lastNonServiceCardRef.current || 'Dell'; setCardLines([{ card: s, amount: Number(amount) || 0 }]); setCard(s) }
                        else { const f = cardLines[0]; if (f?.card) setCard(f.card) }
                      }} /> Multi-carte (même BU)
                    </label>
                  </div>
                ) : <div className="lg:col-span-2" />}
                {isServiceBu(bu) ? (
                  <LockedField label="Carte *" value={SERVICE_CARD} />
                ) : multiCard ? (
                  <div className="lg:col-span-3 rounded-2xl border bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Répartition Multi-carte (BU: {bu})</div><div className="text-sm">Total: <span className="font-semibold">{mad(totalFromCardLines)}</span></div></div>
                    <table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Carte *</th><th className="py-2 text-left">Montant *</th><th className="py-2">Action</th></tr></thead>
                      <tbody>{cardLines.map((l, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="py-2"><ComboBox label="" placeholder="Filtrer..." items={cardItems} valueId={l.card || null} onPick={(_id, label) => setCardLines((prev) => prev.map((x, i) => i === idx ? { ...x, card: label } : x))} /></td>
                          <td className="py-2"><input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" type="number" min={0} value={l.amount} onChange={(e) => setCardLines((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} /></td>
                          <td className="py-2"><button className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700" onClick={() => setCardLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <button className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100" onClick={() => setCardLines((prev) => [...prev, { card: cardItems[0]?.id || 'Dell', amount: 0 }])}>
                      <Plus className="h-4 w-4" /> Ajouter une carte
                    </button>
                    <div className="mt-3"><AddCardInline onAdd={async (name) => { await addCardIfMissing(name) }} /></div>
                  </div>
                ) : (
                  <ComboBox label="Carte *" placeholder="Tape pour filtrer..." items={cardItems} valueId={card} onPick={(_id, label) => { setCard(label); if (!isServiceBu(bu) && label !== SERVICE_CARD) lastNonServiceCardRef.current = label; setCardLines([{ card: label, amount: Number(amount) || 0 }]) }} />
                )}
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">Montant (MAD) *</div>
                  <input className={classNames('h-10 w-full rounded-xl border px-3 text-sm', multiCard ? 'bg-slate-100 text-slate-700' : 'bg-white')} type="number" min={0} value={amount} disabled={multiCard}
                    onChange={(e) => { const v = Number(e.target.value); setAmount(v); if (!multiCard) setCardLines([{ card, amount: v }]) }} />
                  {multiCard ? <div className="mt-1 text-xs text-slate-500">Calculé automatiquement.</div> : null}
                </div>
                {!isServiceBu(bu) && !multiCard ? (
                  <div className="lg:col-span-3"><AddCardInline onAdd={async (name) => { await addCardIfMissing(name); setCard(name); setCardLines([{ card: name, amount: Number(amount) || 0 }]) }} /></div>
                ) : null}
              </>
            ) : (
              <div className="lg:col-span-3 rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Répartition Multi-BU</div><div className="text-sm">Total: <span className="font-semibold">{mad(totalFromLines)}</span></div></div>
                <table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">BU *</th><th className="py-2 text-left">Carte *</th><th className="py-2 text-left">Montant *</th><th className="py-2">Action</th></tr></thead>
                  <tbody>{lines.map((l, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-2"><select className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={l.bu} onChange={(e) => { const v = e.target.value; setLines((prev) => prev.map((x, i) => i === idx ? { ...x, bu: v, card: isServiceBu(v) ? SERVICE_CARD : x.card === SERVICE_CARD ? 'Dell' : x.card } : x)) }}>{BUS.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                      <td className="py-2">{isServiceBu(l.bu) ? <LockedField label="" value={SERVICE_CARD} /> : <ComboBox label="" placeholder="Filtrer..." items={cardItems} valueId={l.card || null} onPick={(_id, label) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, card: label } : x))} />}</td>
                      <td className="py-2"><input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" type="number" min={0} value={l.amount} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} /></td>
                      <td className="py-2"><button className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
                <button className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100" onClick={() => setLines((prev) => [...prev, { bu: 'CSG', card: 'Dell', amount: 0 }])}>
                  <Plus className="h-4 w-4" /> Ajouter une ligne
                </button>
                <div className="mt-3"><AddCardInline onAdd={async (name) => { await addCardIfMissing(name) }} /></div>
              </div>
            )}
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs font-medium text-slate-600">Next step *</div>
              <input className="h-10 w-full rounded-xl border bg-white px-3 text-sm" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Prochaine action…" />
            </div>
            <div className="lg:col-span-3">
              <div className="mb-1 text-xs font-medium text-slate-600">Notes</div>
              <textarea className="min-h-[90px] w-full rounded-xl border bg-white p-3 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes…" />
            </div>
            <div className="lg:col-span-3 flex flex-wrap items-center justify-end gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm hover:bg-slate-100" onClick={() => { setOpenEdit(false); resetForm() }}>Annuler</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800" onClick={onSave} disabled={loading}>
                {editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}

function AddCardInline(props: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const onSubmit = async () => {
    const v = name.trim(); if (!v) return
    setLoading(true); setErr(null)
    try { await props.onAdd(v); setName('') }
    catch (e: any) { setErr(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs font-medium text-slate-700">Carte absente ? Ajouter ici</div>
      <div className="mt-2 flex gap-2">
        <input className="h-9 w-full rounded-lg border px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Fortinet" />
        <button type="button" className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-800 disabled:opacity-50" disabled={loading} onClick={onSubmit}>Ajouter</button>
      </div>
      {err ? <div className="mt-2 text-xs text-red-600">{err}</div> : null}
    </div>
  )
}
