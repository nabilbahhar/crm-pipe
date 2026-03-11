'use client'
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import { fmtDate, ownerName } from '@/lib/utils'
import {
  CalendarDays, MapPin, Users, Plus, X, Pencil, Trash2,
  Search, RefreshCw, Eye, ChevronDown, UserCheck, UserPlus,
  CheckCircle2, Clock, PlayCircle, CalendarCheck,
} from 'lucide-react'
import Toast from '@/components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type EventType = 'UTD' | 'Workshop' | 'Conference' | 'Salon'
type EventStatus = 'planifie' | 'en_cours' | 'termine'
type FollowUpStatus = 'a_relancer' | 'relance' | 'rdv_pris' | 'pas_interesse'

type EventRow = {
  id: string
  name: string
  type: EventType
  date_start: string
  date_end: string
  location: string | null
  description: string | null
  status: EventStatus
  budget: number | null
  notes: string | null
  created_at: string
  created_by: string | null
}

type InvitationRow = {
  id: string
  event_id: string
  account_id: string
  contact_name: string | null
  invited_by: string | null
  attended: boolean
  follow_up_status: FollowUpStatus | null
  follow_up_notes: string | null
  created_at: string
}

type AccountOption = { id: string; name: string }

// ─── Config ───────────────────────────────────────────────────────────────────
const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'UTD', label: 'UTD' },
  { value: 'Workshop', label: 'Workshop' },
  { value: 'Conference', label: 'Conference' },
  { value: 'Salon', label: 'Salon' },
]

const STATUS_CFG: Record<EventStatus, { label: string; color: string; bg: string; dot: string; border: string }> = {
  planifie: { label: 'Planifie', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-200' },
  en_cours: { label: 'En cours', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' },
  termine:  { label: 'Termine', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-200' },
}

const FOLLOW_UP_CFG: Record<FollowUpStatus, { label: string; color: string; bg: string; dot: string }> = {
  a_relancer:     { label: 'A relancer', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  relance:        { label: 'Relance', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  rdv_pris:       { label: 'RDV pris', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  pas_interesse:  { label: 'Pas interesse', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
}

const TYPE_STYLE: Record<EventType, { bg: string; text: string }> = {
  UTD:        { bg: 'bg-indigo-50',  text: 'text-indigo-700'  },
  Workshop:   { bg: 'bg-violet-50',  text: 'text-violet-700'  },
  Conference: { bg: 'bg-cyan-50',    text: 'text-cyan-700'    },
  Salon:      { bg: 'bg-amber-50',   text: 'text-amber-700'   },
}

// ─── Small components ─────────────────────────────────────────────────────────
function FL({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'
const selectCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 appearance-none'
const textareaCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 resize-none'

function Btn({ children, variant = 'ghost', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' }) {
  const vCls = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900',
    ghost:   'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
    outline: 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200',
    danger:  'bg-red-600 text-white hover:bg-red-700 border-red-600',
  }[variant]
  const szCls = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-50 ${vCls} ${szCls} ${props.className || ''}`}>
      {children}
    </button>
  )
}

function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }} role="presentation">
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="text-base font-bold text-slate-900">{title}</div>
          <button onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function ConfirmDialog({ open, title, msg, danger, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; msg: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void; onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 p-6" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="text-base font-bold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-500 leading-relaxed whitespace-pre-line">{msg}</div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel || 'Confirmer'}</Btn>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: EventStatus }) {
  const c = STATUS_CFG[status] || STATUS_CFG.planifie
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function TypeBadge({ type }: { type: EventType }) {
  const s = TYPE_STYLE[type] || { bg: 'bg-slate-100', text: 'text-slate-600' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {type}
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents]             = useState<EventRow[]>([])
  const [invitations, setInvitations]   = useState<InvitationRow[]>([])
  const [accounts, setAccounts]         = useState<AccountOption[]>([])
  const [loading, setLoading]           = useState(true)
  const [err, setErr]                   = useState<string | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  const [userEmail, setUserEmail]       = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filters
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<EventType | 'Tous'>('Tous')
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'Tous'>('Tous')

  // Event form modal
  const [formOpen, setFormOpen]         = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null)
  const [fName, setFName]               = useState('')
  const [fType, setFType]               = useState<EventType>('UTD')
  const [fDateStart, setFDateStart]     = useState('')
  const [fDateEnd, setFDateEnd]         = useState('')
  const [fLocation, setFLocation]       = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fStatus, setFStatus]           = useState<EventStatus>('planifie')
  const [fBudget, setFBudget]           = useState('')
  const [fNotes, setFNotes]             = useState('')
  const [busySave, setBusySave]         = useState(false)

  // Detail modal (invitations)
  const [detailEvent, setDetailEvent]   = useState<EventRow | null>(null)
  const [detailOpen, setDetailOpen]     = useState(false)

  // Invitation form
  const [invAccId, setInvAccId]         = useState('')
  const [invContact, setInvContact]     = useState('')
  const [invBy, setInvBy]               = useState('')
  const [busyInv, setBusyInv]           = useState(false)

  // Confirm dialog
  const [confirm, setConfirm] = useState({ open: false, title: '', msg: '', danger: false, confirmLabel: '', onConfirm: () => {} })

  // KPI filter
  const [kpiFilter, setKpiFilter]       = useState<'all' | 'planifie' | 'en_cours' | 'termine'>('all')

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || null)

      const [{ data: ev, error: e1 }, { data: inv, error: e2 }, { data: acc, error: e3 }] = await Promise.all([
        supabase.from('events').select('*').order('date_start', { ascending: false }),
        supabase.from('event_invitations').select('*').order('created_at', { ascending: false }),
        supabase.from('accounts').select('id,name').order('name'),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      setEvents((ev || []) as EventRow[])
      setInvitations((inv || []) as InvitationRow[])
      setAccounts((acc || []) as AccountOption[])
    } catch (e: any) { setErr(e?.message || 'Erreur chargement') }
    finally { setLoading(false) }
  }
  useEffect(() => { document.title = 'Evenements \u00b7 CRM-PIPE'; loadAll() }, [])

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10)
    const total = events.length
    const upcoming = events.filter(e => e.status === 'planifie').length
    const inProgress = events.filter(e => e.status === 'en_cours').length
    const completed = events.filter(e => e.status === 'termine').length
    const totalInvited = invitations.length
    const totalAttended = invitations.filter(i => i.attended).length
    return { total, upcoming, inProgress, completed, totalInvited, totalAttended }
  }, [events, invitations])

  // ── Invitations per event ────────────────────────────────────────────────
  const invByEvent = useMemo(() => {
    const map: Record<string, InvitationRow[]> = {}
    for (const inv of invitations) {
      if (!map[inv.event_id]) map[inv.event_id] = []
      map[inv.event_id].push(inv)
    }
    return map
  }, [invitations])

  // ── Account name map ────────────────────────────────────────────────────
  const accMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of accounts) m[a.id] = a.name
    return m
  }, [accounts])

  // ── Filtered events ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = events
    if (kpiFilter !== 'all') list = list.filter(e => e.status === kpiFilter)
    if (typeFilter !== 'Tous') list = list.filter(e => e.type === typeFilter)
    if (statusFilter !== 'Tous') list = list.filter(e => e.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [events, search, typeFilter, statusFilter, kpiFilter])

  // ── Form helpers ─────────────────────────────────────────────────────────
  function resetForm() {
    setFName(''); setFType('UTD'); setFDateStart(''); setFDateEnd('')
    setFLocation(''); setFDescription(''); setFStatus('planifie')
    setFBudget(''); setFNotes(''); setEditingEvent(null)
  }

  function openCreate() {
    resetForm()
    setFormOpen(true)
  }

  function openEdit(ev: EventRow) {
    setEditingEvent(ev)
    setFName(ev.name)
    setFType(ev.type)
    setFDateStart(ev.date_start || '')
    setFDateEnd(ev.date_end || '')
    setFLocation(ev.location || '')
    setFDescription(ev.description || '')
    setFStatus(ev.status)
    setFBudget(ev.budget != null ? String(ev.budget) : '')
    setFNotes(ev.notes || '')
    setFormOpen(true)
  }

  function openDetail(ev: EventRow) {
    setDetailEvent(ev)
    setDetailOpen(true)
    setInvAccId('')
    setInvContact('')
    setInvBy(userEmail || '')
  }

  // ── Save event ───────────────────────────────────────────────────────────
  const onSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = fName.trim()
    if (!n) return setErr('Nom obligatoire')
    if (!fDateStart) return setErr('Date debut obligatoire')
    if (!fDateEnd) return setErr('Date fin obligatoire')

    setBusySave(true); setErr(null)
    try {
      const payload = {
        name: n,
        type: fType,
        date_start: fDateStart,
        date_end: fDateEnd,
        location: fLocation.trim() || null,
        description: fDescription.trim() || null,
        status: fStatus,
        budget: fBudget ? Number(fBudget) : null,
        notes: fNotes.trim() || null,
      }

      if (editingEvent) {
        const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id)
        if (error) throw error
        await logActivity({ action_type: 'update', entity_type: 'account', entity_id: editingEvent.id, entity_name: n, detail: `Evenement modifie: ${n}` })
        showToast('Evenement modifie')
      } else {
        const { error } = await supabase.from('events').insert({ ...payload, created_by: userEmail })
        if (error) throw error
        await logActivity({ action_type: 'create', entity_type: 'account', entity_name: n, detail: `Evenement cree: ${n}` })
        showToast('Evenement cree')
      }

      setFormOpen(false)
      resetForm()
      await loadAll()
    } catch (e: any) { setErr(e?.message || 'Erreur sauvegarde') }
    finally { setBusySave(false) }
  }

  // ── Delete event ─────────────────────────────────────────────────────────
  function askDeleteEvent(ev: EventRow) {
    const invCount = (invByEvent[ev.id] || []).length
    setConfirm({
      open: true,
      title: 'Supprimer cet evenement ?',
      msg: `"${ev.name}"${invCount ? ` et ses ${invCount} invitation(s)` : ''} seront supprimes definitivement.`,
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        setConfirm(c => ({ ...c, open: false }))
        try {
          // Delete invitations first
          if (invCount) {
            const { error: e1 } = await supabase.from('event_invitations').delete().eq('event_id', ev.id)
            if (e1) throw e1
          }
          const { error } = await supabase.from('events').delete().eq('id', ev.id)
          if (error) throw error
          await logActivity({ action_type: 'delete', entity_type: 'account', entity_id: ev.id, entity_name: ev.name, detail: `Evenement supprime: ${ev.name}` })
          showToast('Evenement supprime')
          await loadAll()
        } catch (e: any) { setErr(e?.message || 'Erreur suppression') }
      },
    })
  }

  // ── Add invitation ───────────────────────────────────────────────────────
  const onAddInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detailEvent || !invAccId) return setErr('Selectionnez un compte')
    setBusyInv(true); setErr(null)
    try {
      const { error } = await supabase.from('event_invitations').insert({
        event_id: detailEvent.id,
        account_id: invAccId,
        contact_name: invContact.trim() || null,
        invited_by: invBy.trim() || userEmail,
        attended: false,
        follow_up_status: 'a_relancer',
      })
      if (error) throw error
      const accName = accMap[invAccId] || invAccId
      await logActivity({ action_type: 'create', entity_type: 'account', entity_name: accName, detail: `Invitation ajoutee pour ${detailEvent.name}` })
      showToast(`${accName} invite a ${detailEvent.name}`)
      setInvAccId(''); setInvContact('')
      await loadAll()
    } catch (e: any) { setErr(e?.message || 'Erreur ajout invitation') }
    finally { setBusyInv(false) }
  }

  // ── Toggle attended ──────────────────────────────────────────────────────
  const toggleAttended = async (inv: InvitationRow) => {
    try {
      const { error } = await supabase.from('event_invitations').update({ attended: !inv.attended }).eq('id', inv.id)
      if (error) throw error
      showToast(inv.attended ? 'Presence retiree' : 'Presence confirmee')
      await loadAll()
    } catch (e: any) { setErr(e?.message || 'Erreur') }
  }

  // ── Update follow-up ────────────────────────────────────────────────────
  const updateFollowUp = async (inv: InvitationRow, status: FollowUpStatus) => {
    try {
      const { error } = await supabase.from('event_invitations').update({ follow_up_status: status }).eq('id', inv.id)
      if (error) throw error
      showToast('Suivi mis a jour')
      await loadAll()
    } catch (e: any) { setErr(e?.message || 'Erreur') }
  }

  // ── Delete invitation ────────────────────────────────────────────────────
  const deleteInvitation = async (inv: InvitationRow) => {
    try {
      const { error } = await supabase.from('event_invitations').delete().eq('id', inv.id)
      if (error) throw error
      showToast('Invitation supprimee')
      await loadAll()
    } catch (e: any) { setErr(e?.message || 'Erreur suppression') }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100/80">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto max-w-[1500px] px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                <CalendarDays className="h-7 w-7 text-blue-400" />
                Evenements
              </h1>
              <p className="mt-1 text-sm text-slate-400">Suivi des evenements de prospection : UTD, workshops, salons, conferences</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadAll} disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={openCreate}
                className="flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 transition-colors">
                <Plus className="h-4 w-4" /> Nouvel evenement
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1500px] px-6 -mt-4 pb-12">

        {/* Error banner */}
        {err && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <span className="font-semibold">Erreur :</span> {err}
            <button onClick={() => setErr(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-6">
          {([
            { key: 'all' as const, label: 'Total evenements', value: kpis.total, icon: CalendarDays, iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
            { key: 'planifie' as const, label: 'A venir', value: kpis.upcoming, icon: Clock, iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
            { key: 'en_cours' as const, label: 'En cours', value: kpis.inProgress, icon: PlayCircle, iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
            { key: 'termine' as const, label: 'Termines', value: kpis.completed, icon: CalendarCheck, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
          ]).map(k => (
            <button key={k.key} onClick={() => setKpiFilter(kpiFilter === k.key ? 'all' : k.key)}
              className={`rounded-2xl border bg-white p-4 text-left transition-all hover:shadow-md ${kpiFilter === k.key && k.key !== 'all' ? 'ring-2 ring-blue-400 border-blue-200' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${k.iconBg}`}>
                  <k.icon className={`h-5 w-5 ${k.iconColor}`} />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-slate-900">{k.value}</div>
                  <div className="text-[11px] font-medium text-slate-500 leading-tight">{k.label}</div>
                </div>
              </div>
            </button>
          ))}
          {/* Invited */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                <UserPlus className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">{kpis.totalInvited}</div>
                <div className="text-[11px] font-medium text-slate-500 leading-tight">Total invites</div>
              </div>
            </div>
          </div>
          {/* Attended */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">{kpis.totalAttended}</div>
                <div className="text-[11px] font-medium text-slate-500 leading-tight">Total presents</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un evenement..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400" />
          </div>
          <div className="relative">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as EventType | 'Tous')}
              className="h-10 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none transition focus:border-blue-400 appearance-none">
              <option value="Tous">Tous types</option>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as EventStatus | 'Tous')}
              className="h-10 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none transition focus:border-blue-400 appearance-none">
              <option value="Tous">Tous statuts</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="text-xs text-slate-500">{filtered.length} evenement{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-300" />
              <span className="ml-3 text-sm text-slate-400">Chargement...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <CalendarDays className="h-10 w-10 mb-3" />
              <div className="text-sm font-medium">Aucun evenement</div>
              <div className="text-xs mt-1">Cliquez sur "Nouvel evenement" pour commencer</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Evenement</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Dates</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Lieu</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Statut</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Invites</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Presents</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ev => {
                    const evInv = invByEvent[ev.id] || []
                    const attended = evInv.filter(i => i.attended).length
                    return (
                      <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{ev.name}</div>
                          {ev.description && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[260px]">{ev.description}</div>}
                        </td>
                        <td className="px-4 py-3"><TypeBadge type={ev.type} /></td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-700">{fmtDate(ev.date_start)}</div>
                          <div className="text-[10px] text-slate-400">au {fmtDate(ev.date_end)}</div>
                        </td>
                        <td className="px-4 py-3">
                          {ev.location ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {ev.location}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <Users className="h-3.5 w-3.5 text-slate-400" /> {evInv.length}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${attended > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            <UserCheck className="h-3.5 w-3.5" /> {attended}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openDetail(ev)} title="Voir details"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEdit(ev)} title="Modifier"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => askDeleteEvent(ev)} title="Supprimer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
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
      </div>

      {/* ── Event Form Modal ──────────────────────────────────────────────── */}
      <Modal open={formOpen} title={editingEvent ? 'Modifier l\'evenement' : 'Nouvel evenement'} onClose={() => { setFormOpen(false); resetForm() }}>
        <form onSubmit={onSaveEvent} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FL label="Nom de l'evenement" required>
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="ex: UTD Palo Alto" className={inputCls} />
            </FL>
            <FL label="Type" required>
              <select value={fType} onChange={e => setFType(e.target.value as EventType)} className={selectCls}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FL>
            <FL label="Date debut" required>
              <input type="date" value={fDateStart} onChange={e => setFDateStart(e.target.value)} className={inputCls} />
            </FL>
            <FL label="Date fin" required>
              <input type="date" value={fDateEnd} onChange={e => setFDateEnd(e.target.value)} className={inputCls} />
            </FL>
            <FL label="Lieu">
              <input value={fLocation} onChange={e => setFLocation(e.target.value)} placeholder="ex: Marrakech, Palo Alto" className={inputCls} />
            </FL>
            <FL label="Statut">
              <select value={fStatus} onChange={e => setFStatus(e.target.value as EventStatus)} className={selectCls}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FL>
            <FL label="Budget (MAD)">
              <input type="number" value={fBudget} onChange={e => setFBudget(e.target.value)} placeholder="0" className={inputCls} />
            </FL>
          </div>
          <FL label="Description">
            <textarea value={fDescription} onChange={e => setFDescription(e.target.value)} rows={2} placeholder="Description de l'evenement..." className={textareaCls} />
          </FL>
          <FL label="Notes">
            <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Notes internes..." className={textareaCls} />
          </FL>
          {err && <div className="text-sm text-red-600 font-medium">{err}</div>}
          <div className="flex justify-end gap-2.5 pt-2">
            <Btn variant="ghost" type="button" onClick={() => { setFormOpen(false); resetForm() }}>Annuler</Btn>
            <Btn variant="primary" type="submit" disabled={busySave}>
              {busySave ? 'Enregistrement...' : editingEvent ? 'Modifier' : 'Creer'}
            </Btn>
          </div>
        </form>
      </Modal>

      {/* ── Detail / Invitations Modal ────────────────────────────────────── */}
      <Modal open={detailOpen} title={detailEvent ? `${detailEvent.name} — Invitations` : 'Detail'} onClose={() => setDetailOpen(false)} wide>
        {detailEvent && (() => {
          const evInv = invByEvent[detailEvent.id] || []
          const attended = evInv.filter(i => i.attended).length
          return (
            <div className="space-y-6">
              {/* Event summary */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <div className="text-[11px] font-medium text-slate-500 mb-1">Type</div>
                  <TypeBadge type={detailEvent.type} />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 mb-1">Dates</div>
                  <div className="text-sm font-semibold text-slate-900">{fmtDate(detailEvent.date_start)} - {fmtDate(detailEvent.date_end)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 mb-1">Lieu</div>
                  <div className="text-sm text-slate-700 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {detailEvent.location || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 mb-1">Statut</div>
                  <StatusBadge status={detailEvent.status} />
                </div>
              </div>

              {detailEvent.description && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600">
                  {detailEvent.description}
                </div>
              )}

              {/* Stats line */}
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-violet-500" />
                  <span className="font-semibold text-slate-700">{evInv.length}</span>
                  <span className="text-slate-500">invite(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-slate-700">{attended}</span>
                  <span className="text-slate-500">present(s)</span>
                </div>
                {evInv.length > 0 && (
                  <div className="text-xs text-slate-400">
                    Taux de presence : <span className="font-bold text-slate-700">{Math.round((attended / evInv.length) * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Add invitation form */}
              <form onSubmit={onAddInvitation} className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
                <div className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> Ajouter une invitation
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <select value={invAccId} onChange={e => setInvAccId(e.target.value)} className={selectCls}>
                      <option value="">-- Compte --</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <input value={invContact} onChange={e => setInvContact(e.target.value)} placeholder="Nom du contact" className={inputCls} />
                  </div>
                  <div>
                    <input value={invBy} onChange={e => setInvBy(e.target.value)} placeholder="Invite par" className={inputCls} />
                  </div>
                  <div>
                    <Btn variant="primary" type="submit" disabled={busyInv} className="w-full">
                      <UserPlus className="h-3.5 w-3.5" /> {busyInv ? '...' : 'Inviter'}
                    </Btn>
                  </div>
                </div>
              </form>

              {/* Invitations table */}
              {evInv.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Compte</th>
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Contact</th>
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Invite par</th>
                        <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">Present</th>
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Suivi</th>
                        <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evInv.map(inv => {
                        const fup = inv.follow_up_status ? FOLLOW_UP_CFG[inv.follow_up_status] : null
                        return (
                          <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 font-semibold text-slate-900">{accMap[inv.account_id] || inv.account_id}</td>
                            <td className="px-4 py-2.5 text-slate-600">{inv.contact_name || '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{inv.invited_by ? ownerName(inv.invited_by) : '—'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => toggleAttended(inv)}
                                className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors ${inv.attended ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                {inv.attended ? <><CheckCircle2 className="h-3 w-3" /> Oui</> : 'Non'}
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                value={inv.follow_up_status || 'a_relancer'}
                                onChange={e => updateFollowUp(inv, e.target.value as FollowUpStatus)}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-300 appearance-none">
                                {Object.entries(FOLLOW_UP_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => deleteInvitation(inv)} title="Supprimer"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors mx-auto">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Breakdown by sales rep */}
              {evInv.length > 0 && (() => {
                const byRep: Record<string, { invited: number; attended: number }> = {}
                for (const inv of evInv) {
                  const rep = inv.invited_by || 'Non attribue'
                  if (!byRep[rep]) byRep[rep] = { invited: 0, attended: 0 }
                  byRep[rep].invited++
                  if (inv.attended) byRep[rep].attended++
                }
                return (
                  <div>
                    <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> Repartition par commercial
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {Object.entries(byRep).map(([rep, data]) => (
                        <div key={rep} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold text-slate-800 truncate">{ownerName(rep)}</div>
                          <div className="mt-1 flex items-center gap-3 text-[11px]">
                            <span className="text-violet-600 font-medium">{data.invited} invit.</span>
                            <span className="text-emerald-600 font-medium">{data.attended} pres.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}
      </Modal>

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        msg={confirm.msg}
        danger={confirm.danger}
        confirmLabel={confirm.confirmLabel}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />
    </div>
  )
}
