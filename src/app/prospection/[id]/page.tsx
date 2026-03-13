'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import {
  ArrowLeft, Phone, Mail, Users, Flame, Thermometer, Snowflake,
  ChevronRight, CheckCircle2, ArrowRightCircle, Plus, Pencil, Trash2,
  RefreshCw, Calendar, MessageSquare, Clock, Building2, X,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────
type ProspectContact = {
  id: string; prospect_id: string; full_name: string
  email: string | null; phone: string | null; role: string | null; is_primary: boolean
}

type Prospect = {
  id: string; company_name: string; sector: string | null; region: string | null
  contact_name: string; contact_role: string | null; contact_phone: string | null
  contact_email: string | null; type: string; segment: string | null; heat: 'cold' | 'warm' | 'hot'
  status: string; attempts: number; last_contact_at: string | null
  next_action: string | null; next_date: string | null; notes: string | null
  source: string | null; converted_to_account_id: string | null
  converted_at: string | null; created_by: string | null; created_at: string
}

const STATUSES = [
  'À contacter', '1er contact', 'RDV demandé', 'RDV confirmé',
  'RDV fait', 'Relance', 'Qualifié ✓',
] as const

const STATUS_NEXT: Record<string, string> = {
  'À contacter': '1er contact', '1er contact': 'RDV demandé',
  'RDV demandé': 'RDV confirmé', 'RDV confirmé': 'RDV fait',
  'RDV fait': 'Relance', 'Relance': 'Qualifié ✓',
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'À contacter': { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-300' },
  '1er contact': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
  'RDV demandé': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-400' },
  'RDV confirmé': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
  'RDV fait': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-400' },
  'Relance': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-400' },
  'Qualifié ✓': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
}

const SEG_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'Privé': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  'Public': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Semi-public': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
}

const SECTEUR_OPTIONS = [
  'IT', 'Banque/Finance', 'Industrie', 'Telecom', 'Distribution',
  'Services', 'Energie', 'Public', 'Sante', 'Autre',
] as const

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function HeatBadge({ heat }: { heat: string }) {
  const cfg = heat === 'hot'
    ? { icon: <Flame className="h-3.5 w-3.5" />, bg: 'bg-red-100 text-red-700 border-red-200', label: 'Chaud' }
    : heat === 'warm'
    ? { icon: <Thermometer className="h-3.5 w-3.5" />, bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Tiede' }
    : { icon: <Snowflake className="h-3.5 w-3.5" />, bg: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Froid' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE['À contacter']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{status}
    </span>
  )
}

export default function ProspectDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [contacts, setContacts] = useState<ProspectContact[]>([])
  const [loading, setLoading] = useState(true)
  const [activities, setActivities] = useState<any[]>([])

  // Qualify modal state
  const [qualifyOpen, setQualifyOpen] = useState(false)
  const [qualifyForm, setQualifyForm] = useState({
    nom_compte: '', secteur: '', ville: '',
    contact_nom: '', contact_email: '', contact_tel: '',
  })
  const [qualifySaving, setQualifySaving] = useState(false)
  const [qualifyErr, setQualifyErr] = useState<string | null>(null)

  // Convert modal
  const [convertOpen, setConvertOpen] = useState(false)
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: c }, { data: acts }] = await Promise.all([
      supabase.from('prospects').select('*').eq('id', id).single(),
      supabase.from('prospect_contacts').select('*').eq('prospect_id', id).order('is_primary', { ascending: false }),
      supabase.from('activity_log').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    ])
    if (p) {
      setProspect(p as Prospect)
      document.title = `${p.company_name} · Prospection`
    }
    setContacts((c || []) as ProspectContact[])
    setActivities(acts || [])
    setLoading(false)
  }

  async function advanceStatus() {
    if (!prospect) return
    const nextS = STATUS_NEXT[prospect.status]
    if (!nextS) return
    if (nextS === 'Qualifié ✓') {
      openQualify()
      return
    }
    const { error } = await supabase.from('prospects').update({
      status: nextS,
      attempts: prospect.attempts + 1,
      last_contact_at: new Date().toISOString().split('T')[0],
    }).eq('id', prospect.id)
    if (!error) {
      await logActivity({
        action_type: 'update', entity_type: 'prospect',
        entity_id: prospect.id, entity_name: prospect.company_name,
        detail: `Statut: ${prospect.status} → ${nextS}`,
      })
      load()
    }
  }

  async function addAttempt() {
    if (!prospect) return
    await supabase.from('prospects').update({
      attempts: prospect.attempts + 1,
      last_contact_at: new Date().toISOString().split('T')[0],
    }).eq('id', prospect.id)
    load()
  }

  function openQualify() {
    if (!prospect) return
    const primary = contacts.find(c => c.is_primary) || contacts[0]
    setQualifyForm({
      nom_compte: prospect.company_name,
      secteur: prospect.sector || '',
      ville: prospect.region || '',
      contact_nom: primary?.full_name || prospect.contact_name || '',
      contact_email: primary?.email || prospect.contact_email || '',
      contact_tel: primary?.phone || prospect.contact_phone || '',
    })
    setQualifyErr(null)
    setQualifyOpen(true)
  }

  async function confirmQualify() {
    if (!prospect) return
    if (!qualifyForm.nom_compte.trim()) { setQualifyErr('Le nom du compte est obligatoire.'); return }
    if (!qualifyForm.secteur.trim()) { setQualifyErr('Le secteur est obligatoire.'); return }
    if (!qualifyForm.ville.trim()) { setQualifyErr('La ville est obligatoire.'); return }
    if (!qualifyForm.contact_nom.trim()) { setQualifyErr('Le nom du contact est obligatoire.'); return }

    setQualifySaving(true)
    try {
      // Check duplicate account
      const { data: existingAccounts } = await supabase.from('accounts').select('id,name')
      const dup = (existingAccounts || []).find((a: any) => a.name.trim().toLowerCase() === qualifyForm.nom_compte.trim().toLowerCase())
      if (dup) { setQualifyErr(`Le compte "${dup.name}" existe deja.`); setQualifySaving(false); return }

      // Create account
      const { data: newAcc, error: accErr } = await supabase.from('accounts').insert({
        name: qualifyForm.nom_compte.trim(),
        segment: prospect.segment || 'Privé',
        sector: qualifyForm.secteur.trim(),
        region: qualifyForm.ville.trim(),
      }).select('id').single()
      if (accErr || !newAcc) { setQualifyErr(accErr?.message || 'Erreur'); setQualifySaving(false); return }

      // Create primary contact
      if (qualifyForm.contact_nom.trim()) {
        await supabase.from('account_contacts').insert({
          account_id: newAcc.id,
          full_name: qualifyForm.contact_nom.trim(),
          email: qualifyForm.contact_email.trim() || null,
          phone: qualifyForm.contact_tel.trim() || null,
          is_primary: true,
        })
      }

      // Update prospect
      await supabase.from('prospects').update({
        status: 'Qualifié ✓',
        converted_to_account_id: newAcc.id,
        converted_at: new Date().toISOString(),
        attempts: prospect.attempts + 1,
        last_contact_at: new Date().toISOString().split('T')[0],
      }).eq('id', prospect.id)

      await logActivity({
        action_type: 'convert', entity_type: 'prospect',
        entity_id: prospect.id, entity_name: prospect.company_name,
        detail: `Qualifie et converti en compte : ${qualifyForm.nom_compte.trim()}`,
      })

      setQualifyOpen(false)
      setToast({ msg: `${prospect.company_name} qualifie et converti en compte !`, ok: true })
      load()
    } catch (e: any) { setQualifyErr(e?.message || 'Erreur') }
    finally { setQualifySaving(false) }
  }

  async function openConvertModal() {
    setConvertOpen(true)
    const { data } = await supabase.from('accounts').select('id,name').order('name')
    setAccounts(data || [])
  }

  async function confirmConvert(accountId: string, accountName: string) {
    if (!prospect) return
    await supabase.from('prospects').update({
      status: 'Qualifié ✓',
      converted_to_account_id: accountId,
      converted_at: new Date().toISOString(),
    }).eq('id', prospect.id)
    await logActivity({
      action_type: 'convert', entity_type: 'prospect',
      entity_id: prospect.id, entity_name: prospect.company_name,
      detail: `Converti vers compte existant : ${accountName}`,
    })
    setConvertOpen(false)
    setToast({ msg: `Converti vers ${accountName}`, ok: true })
    load()
  }

  if (loading) return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  if (!prospect) return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="text-center">
        <div className="text-lg font-bold text-slate-700">Prospect introuvable</div>
        <button onClick={() => router.push('/prospection')} className="mt-3 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    </div>
  )

  const nextS = STATUS_NEXT[prospect.status]
  const isConverted = !!prospect.converted_at
  const st = STATUS_STYLE[prospect.status] || STATUS_STYLE['À contacter']
  const isOverdue = prospect.next_date && new Date(prospect.next_date) < new Date(new Date().toISOString().split('T')[0])
  const primaryContact = contacts.find(c => c.is_primary) || contacts[0]

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1100px] px-4 py-6 space-y-5">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-[300] rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all
            ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.msg}
            <button onClick={() => setToast(null)} className="ml-3 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5 inline" /></button>
          </div>
        )}

        {/* ── BACK ── */}
        <button onClick={() => router.push('/prospection')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Prospection
        </button>

        {/* ── HEADER ── */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-black text-white">{prospect.company_name}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <HeatBadge heat={prospect.heat} />
                  <StatusBadge status={prospect.status} />
                  {(prospect.segment || 'Privé') && (
                    <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">{prospect.segment || 'Privé'}</span>
                  )}
                  {isConverted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Converti
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isConverted && nextS && nextS !== 'Qualifié ✓' && (
                  <button onClick={advanceStatus}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-colors shadow-sm">
                    <ChevronRight className="h-4 w-4" /> {nextS}
                  </button>
                )}
                {!isConverted && nextS === 'Qualifié ✓' && (
                  <button onClick={openQualify}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white hover:bg-emerald-600 transition-colors shadow-sm">
                    <CheckCircle2 className="h-4 w-4" /> Qualifier
                  </button>
                )}
                {!isConverted && prospect.status === 'Qualifié ✓' && (
                  <button onClick={openConvertModal}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white hover:bg-emerald-600 transition-colors shadow-sm">
                    <ArrowRightCircle className="h-4 w-4" /> Convertir en compte
                  </button>
                )}
                {!isConverted && (
                  <button onClick={addAttempt}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/20 px-3 text-sm font-semibold text-white hover:bg-white/30 transition-colors">
                    +1 tentative
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4">
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tentatives</div>
              <div className="text-lg font-black text-slate-900">{prospect.attempts}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Dernier contact</div>
              <div className="text-sm font-bold text-slate-700">{fmtDate(prospect.last_contact_at)}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Prochaine relance</div>
              <div className={`text-sm font-bold ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                {isOverdue && '⚠ '}{fmtDate(prospect.next_date)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Source</div>
              <div className="text-sm font-bold text-slate-700">{prospect.source || '—'}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ── LEFT: Contact + Details ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Contact principal */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Users className="h-3.5 w-3.5" /></div>
                <span className="text-sm font-bold text-slate-900">Contact principal</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">{prospect.contact_name}</div>
                  {prospect.contact_role && <div className="text-sm text-slate-500">{prospect.contact_role}</div>}
                </div>
                <div className="flex flex-wrap gap-3">
                  {prospect.contact_phone && (
                    <a href={`tel:${prospect.contact_phone}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors">
                      <Phone className="h-4 w-4 text-emerald-500" /> {prospect.contact_phone}
                    </a>
                  )}
                  {prospect.contact_email && (
                    <a href={`mailto:${prospect.contact_email}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors">
                      <Mail className="h-4 w-4 text-blue-500" /> {prospect.contact_email}
                    </a>
                  )}
                </div>
              </div>

              {/* Additional contacts */}
              {contacts.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contacts additionnels ({contacts.length})</div>
                  <div className="space-y-2">
                    {contacts.map(c => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{c.full_name}{c.is_primary && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">Principal</span>}</div>
                          {c.role && <div className="text-xs text-slate-400">{c.role}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Mail className="h-3 w-3" /></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Next step */}
            {prospect.next_action && (
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600"><Calendar className="h-3.5 w-3.5" /></div>
                  <span className="text-sm font-bold text-slate-900">Prochaine action</span>
                </div>
                <div className="text-sm text-slate-700">{prospect.next_action}</div>
                {prospect.next_date && (
                  <div className={`mt-1 text-xs font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                    {isOverdue ? '⚠ En retard — ' : 'Prevue le '}{fmtDate(prospect.next_date)}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {prospect.notes && (
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MessageSquare className="h-3.5 w-3.5" /></div>
                  <span className="text-sm font-bold text-slate-900">Notes</span>
                </div>
                <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{prospect.notes}</div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Info + Historique ── */}
          <div className="space-y-5">

            {/* Details */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Informations</div>
              <div className="space-y-3 text-sm">
                {prospect.sector && <div className="flex justify-between"><span className="text-slate-400">Secteur</span><span className="font-semibold text-slate-700">{prospect.sector}</span></div>}
                {prospect.region && <div className="flex justify-between"><span className="text-slate-400">Region</span><span className="font-semibold text-slate-700">{prospect.region}</span></div>}
                <div className="flex justify-between"><span className="text-slate-400">Segment</span>{(() => { const seg = prospect.segment || 'Privé'; const s = SEG_STYLE[seg] || SEG_STYLE['Privé']; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{seg}</span> })()}</div>
                <div className="flex justify-between"><span className="text-slate-400">Cree le</span><span className="font-semibold text-slate-700">{fmtDate(prospect.created_at)}</span></div>
                {prospect.created_by && <div className="flex justify-between"><span className="text-slate-400">Par</span><span className="font-semibold text-slate-700">{prospect.created_by}</span></div>}
              </div>
            </div>

            {/* Funnel position */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Position funnel</div>
              <div className="space-y-1.5">
                {STATUSES.map(s => {
                  const isCurrent = prospect.status === s
                  const idx = STATUSES.indexOf(s)
                  const currentIdx = STATUSES.indexOf(prospect.status as any)
                  const isPast = idx < currentIdx
                  const stl = STATUS_STYLE[s]
                  return (
                    <div key={s} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                      ${isCurrent ? `${stl.bg} ${stl.text} ring-1 ${stl.border}` : isPast ? 'text-slate-400 line-through' : 'text-slate-300'}`}>
                      <span className={`h-2 w-2 rounded-full ${isCurrent ? stl.dot : isPast ? 'bg-slate-300' : 'bg-slate-100'}`} />
                      {s}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Activity log */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Clock className="h-3.5 w-3.5" /></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Historique</span>
              </div>
              {activities.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">Aucune activite enregistree</div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {activities.map((a: any) => (
                    <div key={a.id} className="flex gap-2 text-xs">
                      <div className="text-slate-300 whitespace-nowrap tabular-nums">
                        {new Date(a.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}
                      </div>
                      <div className="text-slate-600">{a.detail || a.action_type}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── QUALIFY MODAL ── */}
      {qualifyOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setQualifyOpen(false) }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Qualifier & Creer un compte
              </h2>
              <p className="text-xs text-emerald-100 mt-0.5">Les infos du prospect seront importees dans le nouveau compte</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {qualifyErr && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{qualifyErr}</div>}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Nom du compte *</label>
                <input value={qualifyForm.nom_compte} onChange={e => setQualifyForm(f => ({ ...f, nom_compte: e.target.value }))}
                  className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Secteur *</label>
                  <select value={qualifyForm.secteur} onChange={e => setQualifyForm(f => ({ ...f, secteur: e.target.value }))}
                    className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none">
                    <option value="">—</option>
                    {SECTEUR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Ville *</label>
                  <input value={qualifyForm.ville} onChange={e => setQualifyForm(f => ({ ...f, ville: e.target.value }))}
                    className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contact principal *</label>
                <input value={qualifyForm.contact_nom} onChange={e => setQualifyForm(f => ({ ...f, contact_nom: e.target.value }))}
                  className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                  <input value={qualifyForm.contact_email} onChange={e => setQualifyForm(f => ({ ...f, contact_email: e.target.value }))}
                    className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Telephone</label>
                  <input value={qualifyForm.contact_tel} onChange={e => setQualifyForm(f => ({ ...f, contact_tel: e.target.value }))}
                    className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <button onClick={() => setQualifyOpen(false)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
              <button onClick={confirmQualify} disabled={qualifySaving}
                className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {qualifySaving ? 'En cours…' : 'Qualifier & Creer le compte'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONVERT MODAL ── */}
      {convertOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setConvertOpen(false) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightCircle className="h-5 w-5" /> Convertir vers un compte existant
              </h2>
            </div>
            <div className="px-6 py-5 space-y-2 max-h-[400px] overflow-y-auto">
              {accounts.length === 0 ? (
                <div className="text-sm text-slate-400 py-4 text-center">Aucun compte disponible</div>
              ) : accounts.map(a => (
                <button key={a.id} onClick={() => confirmConvert(a.id, a.name)}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors">
                  <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-800">{a.name}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <button onClick={() => setConvertOpen(false)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
