'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { mad, fmt, fmtDate, fmtDateTime, STAGE_CFG, ownerName } from '@/lib/utils'
import {
  ArrowLeft, Building2, ChevronRight, Plus, X, Pencil, Trash2,
  Star, Phone, Mail, MapPin, Tag, Target, Calendar, FileText,
  Upload, Download, Loader2, Users, TrendingUp, ExternalLink,
  Clock, Paperclip, MessageSquare, Save, Edit2, RefreshCw,
  File as FileIcon, Presentation, BarChart2, Activity,
} from 'lucide-react'
import Toast from '@/components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type AccountRow = { id: string; name: string; sector: string | null; segment: string | null; region: string | null; created_at: string | null }
type ContactRow = { id: string; account_id: string; full_name: string | null; email: string | null; phone: string | null; role: string | null; is_primary: boolean }
type DealRow = { id: string; title: string; amount: number; status: string; stage: string; bu: string | null; vendor: string | null; booking_month: string | null; owner_email: string | null; prob: number | null; created_at: string }
type MeetingRow = { id: string; account_id: string; title: string; meeting_date: string; attendees: string | null; summary: string; created_by: string | null; created_at: string; updated_at: string | null }
type AccountFile = { id: string; account_id: string; file_type: string; file_name: string; file_url: string; uploaded_by: string | null; created_at: string }
type ActivityRow = { id: string; action_type: string; entity_type: string; entity_name: string; detail: string; created_at: string; user_email?: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const SEG_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'Privé': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  'Public': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Semi-public': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
}
const FILE_TYPE_LABELS: Record<string, string> = { cr: 'Compte rendu', presentation: 'Présentation', excel: 'Fichier Excel', autre: 'Autre' }
const FILE_TYPE_ICONS: Record<string, string> = { cr: '📝', presentation: '📊', excel: '📗', autre: '📎' }
const ACTION_ICON: Record<string, string> = { create: '🟢', update: '🔵', delete: '🔴' }

// ─── Small components ─────────────────────────────────────────────────────────
function SegBadge({ seg }: { seg: string | null }) {
  if (!seg) return <span className="text-slate-300 text-xs">—</span>
  const s = SEG_STYLE[seg] || { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{seg}</span>
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-slate-400 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-700 truncate">{value || '—'}</span>
    </div>
  )
}

function Btn({ children, variant = 'ghost', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' }) {
  const vCls = { primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900', ghost: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200', outline: 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200', danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600' }[variant]
  const szCls = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-50 ${vCls} ${szCls} ${props.className || ''}`}>{children}</button>
}

function StatusPill({ status }: { status: string }) {
  const c = status === 'Won' ? 'bg-emerald-50 text-emerald-700' : status === 'Lost' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{status}</span>
}

function ConfirmDialog({ open, title, msg, danger, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; msg: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{msg}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel || 'Confirmer'}</Btn>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'
const selectCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 appearance-none'

function FileTypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0'
  if (type === 'presentation') return <Presentation className={`${cls} text-orange-500`} />
  if (type === 'excel') return <BarChart2 className={`${cls} text-emerald-600`} />
  if (type === 'cr') return <MessageSquare className={`${cls} text-indigo-500`} />
  return <FileIcon className={`${cls} text-slate-400`} />
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  // ─── State ──────────────────────────────────────────────────
  const [account, setAccount] = useState<AccountRow | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [deals, setDeals] = useState<DealRow[]>([])
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [files, setFiles] = useState<AccountFile[]>([])
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  // Toast / confirm
  const [toast, setToast] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; msg: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void }>({ open: false, title: '', msg: '', onConfirm: () => {} })

  // Meeting form
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [editMeeting, setEditMeeting] = useState<MeetingRow | null>(null)
  const [mTitle, setMTitle] = useState('')
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10))
  const [mAttendees, setMAttendees] = useState('')
  const [mSummary, setMSummary] = useState('')
  const [busyMeeting, setBusyMeeting] = useState(false)

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false)
  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cRole, setCRole] = useState('')
  const [cPrimary, setCPrimary] = useState(false)
  const [busyContact, setBusyContact] = useState(false)

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('autre')

  // ─── Data loading ───────────────────────────────────────────
  useEffect(() => { if (id) loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) } }, [toast])
  useEffect(() => { if (account) document.title = `${account.name} · CRM-PIPE` }, [account])

  async function loadAll() {
    setLoading(true)
    const [accRes, ctcRes, dealsRes, mtgRes, filesRes, actRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).single(),
      supabase.from('account_contacts').select('*').eq('account_id', id).order('is_primary', { ascending: false }).order('full_name' as any),
      supabase.from('opportunities').select('id,title,amount,status,stage,bu,vendor,booking_month,owner_email,prob,created_at').eq('account_id', id).order('created_at', { ascending: false }),
      supabase.from('account_meetings').select('*').eq('account_id', id).order('meeting_date', { ascending: false }),
      supabase.from('account_files').select('*').eq('account_id', id).order('created_at', { ascending: false }),
      supabase.from('activity_log').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    ])
    setAccount(accRes.data as AccountRow | null)
    setContacts((ctcRes.data || []) as ContactRow[])
    setDeals((dealsRes.data || []) as DealRow[])
    setMeetings((mtgRes.data || []) as MeetingRow[])
    const f = (filesRes.data || []) as AccountFile[]
    setFiles(f)
    setActivities((actRes.data || []) as ActivityRow[])

    // Generate signed URLs for files
    const urls: Record<string, string> = {}
    await Promise.all(f.map(async (fi) => {
      const { data } = await supabase.storage.from('account-files').createSignedUrl(fi.file_url, 3600)
      if (data?.signedUrl) urls[fi.id] = data.signedUrl
    }))
    setFileUrls(urls)
    setLoading(false)
  }

  // ─── Computed KPIs ──────────────────────────────────────────
  const dealsOpen = useMemo(() => deals.filter(d => d.status === 'Open'), [deals])
  const caWon = useMemo(() => deals.filter(d => d.status === 'Won').reduce((s, d) => s + (d.amount || 0), 0), [deals])
  const caPipeline = useMemo(() => dealsOpen.reduce((s, d) => s + (d.amount || 0), 0), [dealsOpen])
  const primaryContact = useMemo(() => contacts.find(c => c.is_primary) || contacts[0] || null, [contacts])

  // ─── Meeting CRUD ───────────────────────────────────────────
  function resetMeetingForm() {
    setEditMeeting(null); setMTitle(''); setMDate(new Date().toISOString().slice(0, 10)); setMAttendees(''); setMSummary('')
  }
  function startEditMeeting(m: MeetingRow) {
    setEditMeeting(m); setMTitle(m.title); setMDate(m.meeting_date); setMAttendees(m.attendees || ''); setMSummary(m.summary); setShowMeetingForm(true)
  }
  async function saveMeeting(ev: React.FormEvent) {
    ev.preventDefault()
    if (!mTitle.trim() || !mSummary.trim()) { setToast('⚠️ Titre et résumé obligatoires'); return }
    setBusyMeeting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (editMeeting) {
        await supabase.from('account_meetings').update({ title: mTitle.trim(), meeting_date: mDate, attendees: mAttendees.trim() || null, summary: mSummary.trim(), updated_at: new Date().toISOString() }).eq('id', editMeeting.id)
        await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'update', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `CR modifié : ${mTitle.trim()}` })
        setToast('✓ CR mis à jour')
      } else {
        await supabase.from('account_meetings').insert({ account_id: id, title: mTitle.trim(), meeting_date: mDate, attendees: mAttendees.trim() || null, summary: mSummary.trim(), created_by: user?.email || 'unknown' })
        await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'create', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `CR ajouté : ${mTitle.trim()}` })
        setToast('✓ CR ajouté')
      }
      setShowMeetingForm(false); resetMeetingForm(); await loadAll()
    } catch { setToast('❌ Erreur sauvegarde CR') }
    finally { setBusyMeeting(false) }
  }
  function confirmDeleteMeeting(m: MeetingRow) {
    setConfirm({ open: true, title: 'Supprimer le CR', msg: `Supprimer "${m.title}" ?`, danger: true, confirmLabel: 'Supprimer', onConfirm: async () => {
      setConfirm(c => ({ ...c, open: false }))
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('account_meetings').delete().eq('id', m.id)
      await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'delete', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `CR supprimé : ${m.title}` })
      setToast('✓ CR supprimé'); await loadAll()
    }})
  }

  // ─── Contact CRUD ───────────────────────────────────────────
  function resetContactForm() { setCName(''); setCEmail(''); setCPhone(''); setCRole(''); setCPrimary(false) }
  async function addContact(ev: React.FormEvent) {
    ev.preventDefault()
    if (!cName.trim()) { setToast('⚠️ Nom obligatoire'); return }
    setBusyContact(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('account_contacts').insert({ account_id: id, full_name: cName.trim(), email: cEmail.trim() || null, phone: cPhone.trim() || null, role: cRole.trim() || null, is_primary: cPrimary })
      await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'create', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `Contact ajouté : ${cName.trim()}` })
      setShowContactForm(false); resetContactForm(); setToast('✓ Contact ajouté'); await loadAll()
    } catch { setToast('❌ Erreur ajout contact') }
    finally { setBusyContact(false) }
  }
  async function setPrimary(c: ContactRow) {
    await supabase.from('account_contacts').update({ is_primary: false }).eq('account_id', id)
    await supabase.from('account_contacts').update({ is_primary: true }).eq('id', c.id)
    setToast(`✓ ${c.full_name} défini comme principal`); await loadAll()
  }
  function confirmDeleteContact(c: ContactRow) {
    setConfirm({ open: true, title: 'Supprimer le contact', msg: `Supprimer "${c.full_name}" ?`, danger: true, confirmLabel: 'Supprimer', onConfirm: async () => {
      setConfirm(prev => ({ ...prev, open: false }))
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('account_contacts').delete().eq('id', c.id)
      await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'delete', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `Contact supprimé : ${c.full_name}` })
      setToast('✓ Contact supprimé'); await loadAll()
    }})
  }

  // ─── File upload / delete ───────────────────────────────────
  async function handleFileUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${id}/${ts}_${safeName}`

      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'account-files')
      form.append('path', path)
      form.append('account_id', id)
      form.append('file_type', uploadType)
      form.append('uploaded_by', user?.email || 'unknown')

      const res = await authFetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur upload') }

      await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'create', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `Document ajouté : ${file.name} (${FILE_TYPE_LABELS[uploadType] || uploadType})` })
      setToast(`✓ ${file.name} uploadé`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadAll()
    } catch (e: any) { setToast(`❌ ${e?.message || 'Erreur upload'}`) }
    finally { setUploading(false) }
  }
  function confirmDeleteFile(f: AccountFile) {
    setConfirm({ open: true, title: 'Supprimer le document', msg: `Supprimer "${f.file_name}" ?`, danger: true, confirmLabel: 'Supprimer', onConfirm: async () => {
      setConfirm(prev => ({ ...prev, open: false }))
      try {
        const res = await authFetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: 'account-files', paths: [f.file_url], fileIds: [f.id], dbTable: 'account_files' }) })
        if (!res.ok) throw new Error('Erreur suppression')
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('activity_log').insert({ user_email: user?.email, action_type: 'delete', entity_type: 'account', entity_id: id, entity_name: account!.name, detail: `Document supprimé : ${f.file_name}` })
        setToast(`✓ ${f.file_name} supprimé`); await loadAll()
      } catch { setToast('❌ Erreur suppression fichier') }
    }})
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  if (!account) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f8fafc]">
      <Building2 className="h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">Compte introuvable</p>
      <Link href="/accounts" className="text-sm text-blue-600 hover:underline">← Retour aux comptes</Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-12">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">

        {/* ─── Toast ─────────────────────────────────────────────── */}
        {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}

        {/* ─── Confirm dialog ────────────────────────────────────── */}
        <ConfirmDialog open={confirm.open} title={confirm.title} msg={confirm.msg} danger={confirm.danger} confirmLabel={confirm.confirmLabel} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(c => ({ ...c, open: false }))} />

        {/* ═══════════════════════════════════════════════════════════
            SECTION 1 — Breadcrumb + Header
        ═══════════════════════════════════════════════════════════ */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-600 transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/accounts" className="hover:text-slate-600 transition-colors">Comptes</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600 font-medium truncate max-w-[200px]">{account.name}</span>
        </nav>

        <div className="flex items-start gap-3">
          <button onClick={() => router.back()} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">{account.name}</h1>
              <SegBadge seg={account.sector} />
            </div>
            <p className="mt-1 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {account.segment && <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{account.segment}</span>}
              {account.region && <><span className="text-slate-300">·</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{account.region}</span></>}
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Créé le {fmtDate(account.created_at)}</span>
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2 — Informations & KPIs
        ═══════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Informations Compte</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
              <div className="rounded-xl bg-slate-900 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Deals actifs</div>
                <div className="text-xl font-black text-white tabular-nums">{dealsOpen.length}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">CA Won</div>
                <div className="text-base font-black text-emerald-700 tabular-nums">{mad(caWon)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">CA Pipeline</div>
                <div className="text-base font-black text-blue-700 tabular-nums">{mad(caPipeline)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Contacts</div>
                <div className="text-xl font-black text-slate-800 tabular-nums">{contacts.length}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <DetailRow icon={<Tag />} label="Segment" value={account.sector || '—'} />
              <DetailRow icon={<Target />} label="Secteur" value={account.segment || '—'} />
              <DetailRow icon={<MapPin />} label="Région" value={account.region || '—'} />
              <DetailRow icon={<Calendar />} label="Créé le" value={fmtDate(account.created_at)} />
              <DetailRow icon={<TrendingUp />} label="Total deals" value={`${deals.length} deal(s)`} />
              {primaryContact && <DetailRow icon={<Users />} label="Contact principal" value={primaryContact.full_name || '—'} />}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3 — Contacts
        ═══════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">👤 Contacts ({contacts.length})</span>
            <Btn size="sm" variant="primary" onClick={() => { resetContactForm(); setShowContactForm(v => !v) }}><Plus className="h-3.5 w-3.5" /> Ajouter</Btn>
          </div>

          {showContactForm && (
            <form onSubmit={addContact} className="border-b border-slate-100 p-5 bg-slate-50/30">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Nom <span className="text-red-500">*</span></label>
                  <input className={inputCls} value={cName} onChange={e => setCName(e.target.value)} placeholder="Nom complet" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
                  <input className={inputCls} type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="email@exemple.com" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Téléphone</label>
                  <input className={inputCls} value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="+212 6..." />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Rôle</label>
                  <input className={inputCls} value={cRole} onChange={e => setCRole(e.target.value)} placeholder="DSI, DAF, ..." />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={cPrimary} onChange={e => setCPrimary(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  <span className="font-medium text-slate-700">Contact principal</span>
                </label>
                <div className="flex-1" />
                <Btn variant="ghost" size="sm" type="button" onClick={() => setShowContactForm(false)}>Annuler</Btn>
                <Btn variant="primary" size="sm" type="submit" disabled={busyContact}>{busyContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5" /> Ajouter</>}</Btn>
              </div>
            </form>
          )}

          {contacts.length === 0 && !showContactForm ? (
            <div className="py-10 text-center text-sm text-slate-400">Aucun contact. Cliquez sur &quot;Ajouter&quot; pour commencer.</div>
          ) : contacts.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-sm" style={{ minWidth: 600 }}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Rôle</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Coordonnées</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Statut</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{c.full_name || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{c.role || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Mail className="h-3 w-3" />{c.email}</a>}
                          {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline"><Phone className="h-3 w-3" />{c.phone}</a>}
                          {!c.email && !c.phone && <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.is_primary && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Star className="h-3 w-3" />Principal</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!c.is_primary && (
                            <button onClick={() => setPrimary(c)} title="Définir comme principal" className="rounded-lg p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"><Star className="h-3.5 w-3.5" /></button>
                          )}
                          <button onClick={() => confirmDeleteContact(c)} title="Supprimer" className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4 — Comptes Rendus (CR)
        ═══════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📝 Comptes Rendus ({meetings.length})</span>
            <Btn size="sm" variant="primary" onClick={() => { resetMeetingForm(); setShowMeetingForm(v => !v) }}><Plus className="h-3.5 w-3.5" /> Nouveau CR</Btn>
          </div>

          {showMeetingForm && (
            <form onSubmit={saveMeeting} className="border-b border-slate-100 p-5 bg-slate-50/30">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Titre du CR <span className="text-red-500">*</span></label>
                  <input className={inputCls} value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Objet de la réunion" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date <span className="text-red-500">*</span></label>
                  <input type="date" className={inputCls} value={mDate} onChange={e => setMDate(e.target.value)} />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Participants</label>
                <input className={inputCls} value={mAttendees} onChange={e => setMAttendees(e.target.value)} placeholder="Noms séparés par des virgules" />
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Compte rendu <span className="text-red-500">*</span></label>
                <textarea className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 resize-y" rows={5} value={mSummary} onChange={e => setMSummary(e.target.value)} placeholder="Points discutés, décisions prises, actions à suivre..." />
              </div>
              <div className="mt-3 flex gap-2">
                <Btn variant="primary" type="submit" disabled={busyMeeting}>
                  {busyMeeting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5" /> {editMeeting ? 'Mettre à jour' : 'Enregistrer'}</>}
                </Btn>
                <Btn variant="ghost" type="button" onClick={() => { setShowMeetingForm(false); resetMeetingForm() }}>Annuler</Btn>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-50">
            {meetings.length === 0 && !showMeetingForm ? (
              <div className="py-10 text-center text-sm text-slate-400">Aucun compte rendu. Cliquez sur &quot;Nouveau CR&quot; pour documenter vos réunions.</div>
            ) : meetings.map(m => (
              <div key={m.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{m.title}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums"><Calendar className="h-3 w-3" />{fmtDate(m.meeting_date)}</span>
                    </div>
                    {m.attendees && (
                      <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1"><Users className="h-3 w-3 shrink-0" />{m.attendees}</div>
                    )}
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{m.summary}</p>
                    <div className="mt-2 text-[10px] text-slate-400">
                      Par {m.created_by ? ownerName(m.created_by) : '—'} · {fmtDateTime(m.created_at)}
                      {m.updated_at && <span className="ml-2 italic">(modifié {fmtDateTime(m.updated_at)})</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditMeeting(m)} title="Modifier" className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => confirmDeleteMeeting(m)} title="Supprimer" className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 5 — Documents & PJ
        ═══════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📎 Documents & PJ ({files.length})</span>
          </div>
          <div className="p-5 space-y-4">
            {/* Upload zone */}
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                  <select className={selectCls} value={uploadType} onChange={e => setUploadType(e.target.value)}>
                    <option value="cr">📝 Compte rendu</option>
                    <option value="presentation">📊 Présentation</option>
                    <option value="excel">📗 Fichier Excel</option>
                    <option value="autre">📎 Autre</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Fichier</label>
                  <input type="file" ref={fileInputRef} accept=".pdf,.pptx,.ppt,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png,.gif,.webp,.csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-3 file:h-9 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-50 file:transition-colors file:cursor-pointer" />
                </div>
                {uploading && <Loader2 className="h-5 w-5 animate-spin text-blue-500 mb-2" />}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">PDF, PPTX, XLSX, DOCX, Images — max 10 MB</p>
            </div>

            {/* File list by category */}
            {(['cr', 'presentation', 'excel', 'autre'] as const).map(type => {
              const typeFiles = files.filter(f => f.file_type === type)
              if (typeFiles.length === 0) return null
              return (
                <div key={type}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{FILE_TYPE_ICONS[type]} {FILE_TYPE_LABELS[type]} ({typeFiles.length})</div>
                  <div className="space-y-1.5">
                    {typeFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-slate-300 transition-colors group">
                        <FileTypeIcon type={f.file_type} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{f.file_name}</div>
                          <div className="text-[10px] text-slate-400">{f.uploaded_by ? ownerName(f.uploaded_by) : '—'} · {fmtDate(f.created_at)}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {fileUrls[f.id] && (
                            <a href={fileUrls[f.id]} target="_blank" rel="noreferrer" title="Télécharger" className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Download className="h-3.5 w-3.5" /></a>
                          )}
                          <button onClick={() => confirmDeleteFile(f)} title="Supprimer" className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {files.length === 0 && !uploading && (
              <p className="text-center text-sm text-slate-400 py-4">Aucun document. Utilisez le formulaire ci-dessus pour ajouter des fichiers.</p>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 6 — Deals liés
        ═══════════════════════════════════════════════════════════ */}
        {deals.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">💼 Deals liés ({deals.length})</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Deal</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Statut</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Stage</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">BU</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Montant</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Booking</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deals.map(d => {
                    const stageCfg = STAGE_CFG[d.stage] || { bg: 'bg-slate-100', text: 'text-slate-600' }
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/opportunities/${d.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline transition-colors">{d.title}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-center"><StatusPill status={d.status} /></td>
                        <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${stageCfg.bg} ${stageCfg.text}`}>{d.stage}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{d.bu || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-800">{mad(d.amount)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600">{d.booking_month || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{ownerName(d.owner_email)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            SECTION 7 — Historique d'activité
        ═══════════════════════════════════════════════════════════ */}
        {activities.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🕐 Historique ({activities.length})</span>
            </div>
            <div className="divide-y divide-slate-50">
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <span className="mt-0.5 text-sm shrink-0">{ACTION_ICON[a.action_type] || '⚪'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700">
                      <span className="font-semibold">{a.user_email ? ownerName(a.user_email) : '—'}</span>
                      <span className="ml-1.5 text-slate-500">{a.detail || `${a.action_type} ${a.entity_type}`}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">{fmtDateTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
