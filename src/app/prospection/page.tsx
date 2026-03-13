'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  Plus, RefreshCw, X, Phone, Mail, ChevronRight,
  LayoutGrid, List, Flame, Thermometer, Snowflake, ArrowRightCircle,
  ArrowUp, ArrowDown, ChevronsUpDown, Download, Users, Trash2,
  CheckCircle2, Building2, Eye, Pencil, Search, AlertCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Toast from '@/components/Toast'

// ─── Types ───────────────────────────────────────────────────────────────────
type ProspectContact = {
  id: string
  prospect_id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
}

type Prospect = {
  id: string
  company_name: string
  sector: string | null
  region: string | null
  contact_name: string
  contact_role: string | null
  contact_phone: string | null
  contact_email: string | null
  type: string
  heat: 'cold' | 'warm' | 'hot'
  status: string
  attempts: number
  last_contact_at: string | null
  next_action: string | null
  next_date: string | null
  notes: string | null
  source: string | null
  converted_to_account_id: string | null
  converted_at: string | null
  created_by: string | null
  created_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUSES = [
  'À contacter',
  '1er contact',
  'RDV demandé',
  'RDV confirmé',
  'RDV fait',
  'Relance',
  'Qualifié ✓',
] as const

const STATUS_NEXT: Record<string, string> = {
  'À contacter': '1er contact',
  '1er contact': 'RDV demandé',
  'RDV demandé': 'RDV confirmé',
  'RDV confirmé': 'RDV fait',
  'RDV fait': 'Relance',
  'Relance': 'Qualifié ✓',
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'À contacter': { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',  dot: 'bg-slate-300'  },
  '1er contact': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-400'   },
  'RDV demandé': { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', dot: 'bg-violet-400' },
  'RDV confirmé':{ bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400'  },
  'RDV fait':    { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-400' },
  'Relance':     { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',   dot: 'bg-pink-400'   },
  'Qualifié ✓':  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500'},
}

const TYPES    = ['Direct', 'Marché Public', 'Prescripteur', 'Référencement', 'Partenaire'] as const
const SOURCES  = ['LinkedIn', 'Cold Call', 'Salon / Événement', 'Référence', 'Site web', 'Email', 'Réseaux', 'Autre']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isOverdue(d: string | null) {
  if (!d) return false
  const today = new Date(); today.setHours(0,0,0,0)
  return new Date(d) < today
}
function isToday(d: string | null) {
  if (!d) return false
  const today = new Date(); today.setHours(0,0,0,0)
  const x = new Date(d); x.setHours(0,0,0,0)
  return x.getTime() === today.getTime()
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })
}

function HeatIcon({ heat }: { heat: string }) {
  if (heat === 'hot')  return <Flame className="h-3.5 w-3.5 text-red-500" />
  if (heat === 'warm') return <Thermometer className="h-3.5 w-3.5 text-amber-500" />
  return <Snowflake className="h-3.5 w-3.5 text-blue-400" />
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE['À contacter']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{status}
    </span>
  )
}

function AttemptsBar({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-2 w-2 rounded-full ${i < n ? 'bg-slate-600' : 'bg-slate-100'}`} />
        ))}
      </div>
      <span className="text-xs text-slate-400 tabular-nums">{n}</span>
    </div>
  )
}

function Inp({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: any; placeholder?: string; type?: string
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
    </div>
  )
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: any; options: readonly string[]
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <select value={value} onChange={onChange}
        className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

const EMPTY: any = {
  company_name: '', sector: '', region: '', contact_name: '', contact_role: '',
  contact_phone: '', contact_email: '', type: 'Direct', heat: 'cold',
  status: 'À contacter', next_action: '', next_date: '', notes: '', source: '',
}

// ─── CompanyInput — autocomplete + détection doublon ─────────────────────────
function CompanyInput({
  value, onChange, existingProspects, editId,
  onDupSelect,
}: {
  value: string
  onChange: (v: string) => void
  existingProspects: Prospect[]
  editId: string | null
  onDupSelect: (p: Prospect) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(-1)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return existingProspects
      .filter(p => p.id !== editId && p.company_name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [value, existingProspects, editId])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setCursor(-1) }, [value])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, matches.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); onDupSelect(matches[cursor]); setOpen(false) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-1 text-xs font-medium text-slate-600">Société *</div>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (value.trim()) setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder="Ex: BCP, OCP, Lydec…"
        autoComplete="off"
        className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Prospects existants
          </div>
          {matches.map((p, i) => (
            <button key={p.id} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onDupSelect(p); setOpen(false) }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors
                ${cursor === i ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
              <div>
                <span className="font-semibold text-slate-800">{p.company_name}</span>
                {p.contact_name && <span className="ml-2 text-xs text-slate-400">· {p.contact_name}</span>}
              </div>
              <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold
                ${ p.status === 'Qualifié ✓' ? 'bg-emerald-50 text-emerald-700'
                  : p.heat === 'hot' ? 'bg-red-50 text-red-600'
                  : 'bg-slate-100 text-slate-500' }`}>
                {p.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AutocompleteInput — suggestions depuis valeurs existantes ──────────────
function AutocompleteInput({ label, value, onChange, suggestions, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  suggestions: string[]; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return suggestions.slice(0, 10)
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 10)
  }, [value, suggestions])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <input type="text" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setCursor(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, matches.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
          else if (e.key === 'Enter' && cursor >= 0 && matches[cursor]) { e.preventDefault(); onChange(matches[cursor]); setOpen(false) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg max-h-40 overflow-y-auto">
          {matches.map((s, i) => (
            <button key={s} type="button"
              onClick={() => { onChange(s); setOpen(false) }}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${cursor === i ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProspectionPage() {
  const router = useRouter()
  const [rows, setRows]     = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]       = useState<string | null>(null)
  const [info, setInfo]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [view, setView]     = useState<'list' | 'kanban'>('list')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Filters
  const [search, setSearch]           = useState('')
  const [heatFilter, setHeatFilter]     = useState('Tous')
  const [typeFilter, setTypeFilter]     = useState('Tous')
  const [statusFilter, setStatusFilter] = useState('Tous')
  const [regionFilter, setRegionFilter] = useState('Tous')
  const [showOverdue, setShowOverdue]   = useState(false)
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState({ ...EMPTY })
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<Prospect | null>(null)
  const [undoToast, setUndoToast] = useState<{ item: Prospect; timer: ReturnType<typeof setTimeout> } | null>(null)
  const undoCancelled = useRef(false)

  // Multi-contacts
  const [modalContacts, setModalContacts] = useState<ProspectContact[]>([])
  const [newContact, setNewContact] = useState({ full_name: '', email: '', phone: '', role: '' })
  const [contactsMap, setContactsMap] = useState<Record<string, ProspectContact[]>>({})

  // Convert modal
  const [convertP, setConvertP]   = useState<Prospect | null>(null)
  const [accounts, setAccounts]   = useState<{ id: string; name: string }[]>([])

  // All accounts for duplicate check + Grand Compte
  const [allAccounts, setAllAccounts] = useState<{ id: string; name: string; sector?: string; segment?: string }[]>([])
  // Grand Compte mode
  const [grandCompteMode, setGrandCompteMode] = useState(false)
  const [targetBu, setTargetBu] = useState('')
  const [accountMatch, setAccountMatch] = useState<{ id: string; name: string } | null>(null)

  // Qualify modal
  const [qualifyP, setQualifyP] = useState<Prospect | null>(null)
  const [qualifyForm, setQualifyForm] = useState({
    nom_compte: '', secteur: '', ville: '',
    contact_nom: '', contact_email: '', contact_tel: '',
  })
  const [qualifySaving, setQualifySaving] = useState(false)
  const [qualifyErr, setQualifyErr] = useState<string | null>(null)

  const SECTEUR_OPTIONS = [
    'IT', 'Banque/Finance', 'Industrie', 'Telecom', 'Distribution',
    'Services', 'Energie', 'Public', 'Sante', 'Autre',
  ] as const

  // Kanban drag & drop
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Prospection \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    // Load all accounts for duplicate check
    supabase.from('accounts').select('id,name,sector,segment').then(({ data }) => {
      if (data) setAllAccounts(data)
    })
  }, [])

  async function load() {
    setLoading(true); setErr(null)
    const [{ data, error }, contactsRes] = await Promise.all([
      supabase.from('prospects').select('*').order('created_at', { ascending: false }),
      supabase.from('prospect_contacts').select('*').order('is_primary', { ascending: false }).order('full_name'),
    ])
    if (error) { setErr(error.message); setLoading(false); return }
    setRows((data as Prospect[]) || [])
    // Build contacts map
    if (contactsRes && !contactsRes.error && contactsRes.data) {
      const map: Record<string, ProspectContact[]> = {}
      for (const c of contactsRes.data as ProspectContact[]) {
        if (!map[c.prospect_id]) map[c.prospect_id] = []
        map[c.prospect_id].push(c)
      }
      setContactsMap(map)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toast(msg: string, ok = true) { setInfo({ msg, ok }) }

  // Distinct sectors & regions for autocomplete
  const sectorSuggestions = useMemo(() => [...new Set(rows.map(r => r.sector).filter(Boolean) as string[])].sort(), [rows])
  const regionSuggestions = useMemo(() => [...new Set(rows.map(r => r.region).filter(Boolean) as string[])].sort(), [rows])

  const filtered = useMemo(() => {
    let r = rows.filter(x => !x.converted_at)
    const q = search.trim().toLowerCase()
    if (q) r = r.filter(x =>
      x.company_name.toLowerCase().includes(q) ||
      x.contact_name.toLowerCase().includes(q) ||
      (x.contact_phone || '').includes(q) ||
      (x.sector || '').toLowerCase().includes(q)
    )
    if (heatFilter !== 'Tous') r = r.filter(x => x.heat === heatFilter)
    if (typeFilter !== 'Tous') r = r.filter(x => x.type === typeFilter)
    if (statusFilter !== 'Tous') r = r.filter(x => x.status === statusFilter)
    if (regionFilter !== 'Tous') r = r.filter(x => (x.region || '') === regionFilter)
    if (showOverdue) r = r.filter(x => isOverdue(x.next_date) && x.status !== 'Qualifié ✓')
    if (dateFrom) r = r.filter(x => (x.created_at || '') >= dateFrom)
    if (dateTo)   r = r.filter(x => (x.created_at || '') <= dateTo + 'T23:59:59')
    return r
  }, [rows, search, heatFilter, typeFilter, statusFilter, regionFilter, showOverdue, dateFrom, dateTo])

  type SortKey = 'created_at'|'company_name'|'status'|'heat'|'attempts'|'next_date'|'type'
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'company_name': va = a.company_name; vb = b.company_name; break
        case 'status':   va = a.status; vb = b.status; break
        case 'heat':     va = ['cold','warm','hot'].indexOf(a.heat); vb = ['cold','warm','hot'].indexOf(b.heat); break
        case 'attempts': va = a.attempts; vb = b.attempts; break
        case 'next_date':va = a.next_date||''; vb = b.next_date||''; break
        case 'type':     va = a.type; vb = b.type; break
        default:         va = a.created_at||''; vb = b.created_at||''
      }
      if (typeof va === 'number') return dir * (va - vb)
      return dir * String(va).localeCompare(String(vb))
    })
  }, [filtered, sortKey, sortDir])

  const overdueCount = useMemo(
    () => rows.filter(x => !x.converted_at && isOverdue(x.next_date) && x.status !== 'Qualifié ✓').length,
    [rows]
  )

  const stats = useMemo(() => {
    const active = rows.filter(x => !x.converted_at)
    const converted = rows.filter(x => x.converted_at).length
    const bySource: Record<string, number> = {}
    for (const r of active) { const s = r.source || 'Autre'; bySource[s] = (bySource[s] || 0) + 1 }
    const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 6)
    return {
      total: active.length,
      hot: active.filter(x => x.heat === 'hot').length,
      qualifie: active.filter(x => x.status === 'Qualifié ✓').length,
      converted,
      convRate: rows.length > 0 ? Math.round(converted / rows.length * 100) : 0,
      bySt: Object.fromEntries(STATUSES.map(s => [s, active.filter(x => x.status === s).length])),
      topSources,
    }
  }, [rows])

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      // Status breakdown
      const statusMap = new Map<string, number>()
      sorted.forEach(p => statusMap.set(p.status, (statusMap.get(p.status)||0) + 1))

      const spec = {
        filename: `prospects_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Prospects',
          title: `Prospection · ${sorted.length} prospects · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Société','Contact','Rôle','Téléphone','Email','Statut','Heat','Tentatives','Dernière relance','Prochaine action','Prochaine date','Source','Secteur','Région','Créé le'],
          rows: sorted.map(p => [
            p.company_name, p.contact_name, p.contact_role||'—', p.contact_phone||'—',
            p.contact_email||'—', p.status, p.heat, p.attempts,
            p.last_contact_at||'—', p.next_action||'—', p.next_date||'—',
            p.source||'—', p.sector||'—', p.region||'—', (p.created_at||'').slice(0,10),
          ]),
          totalsRow: ['TOTAL', `${sorted.length} prospects`, '', '', '', '', '', '', '', '', '', '', '', '', ''],
        }],
        summary: {
          title: `Résumé Prospection · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total prospects', value: sorted.length, detail: `${sorted.filter(p=>p.heat==='hot').length} prospects chauds` },
            { label: 'Moy. tentatives', value: sorted.length > 0 ? (sorted.reduce((s,p)=>s+p.attempts,0)/sorted.length).toFixed(1) : '0', detail: 'Tentatives de contact par prospect' },
            { label: 'Taux de conversion', value: `${rows.length > 0 ? Math.round(rows.filter(p=>(p as any).converted_at).length / rows.length * 100) : 0}%`, detail: 'Prospects qualifiés / total' },
          ],
          breakdownTitle: 'Répartition par statut',
          breakdownHeaders: ['Statut', 'Nombre', '', '% du total'],
          breakdown: [...statusMap.entries()].sort((a,b)=>b[1]-a[1]).map(([st, count]) => [
            st, count, '', sorted.length > 0 ? `${Math.round(count/sorted.length*100)}%` : '0%',
          ]),
        },
      }
      const res = await authFetch('/api/excel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message||'Erreur export') }
    finally { setExporting(false) }
  }

  function openQualify(p: Prospect) {
    // Pre-fill qualify form from prospect data
    const primaryContact = contactsMap[p.id]?.find(c => c.is_primary) || contactsMap[p.id]?.[0]
    setQualifyP(p)
    setQualifyForm({
      nom_compte: p.company_name || '',
      secteur: p.sector || '',
      ville: p.region || '',
      contact_nom: primaryContact?.full_name || p.contact_name || '',
      contact_email: primaryContact?.email || p.contact_email || '',
      contact_tel: primaryContact?.phone || p.contact_phone || '',
    })
    setQualifyErr(null)
    setQualifySaving(false)
  }

  async function confirmQualify() {
    if (!qualifyP) return
    setQualifyErr(null)

    // Validation
    if (!qualifyForm.nom_compte.trim()) { setQualifyErr('Le nom du compte est obligatoire.'); return }
    if (!qualifyForm.secteur.trim()) { setQualifyErr('Le secteur d\'activite est obligatoire.'); return }
    if (!qualifyForm.ville.trim()) { setQualifyErr('La ville est obligatoire.'); return }
    if (!qualifyForm.contact_nom.trim()) { setQualifyErr('Le nom du contact principal est obligatoire.'); return }

    // Check duplicate account
    const dupAcc = allAccounts.find(a =>
      a.name.trim().toLowerCase() === qualifyForm.nom_compte.trim().toLowerCase()
    )
    if (dupAcc) {
      setQualifyErr(`Le compte "${dupAcc.name}" existe deja. Utilisez "Convertir" pour lier ce prospect a un compte existant.`)
      return
    }

    setQualifySaving(true)
    try {
      // 1. Create account
      const { data: newAccount, error: accErr } = await supabase
        .from('accounts')
        .insert({
          name: qualifyForm.nom_compte.trim(),
          segment: qualifyForm.secteur.trim(),
          sector: 'Prive',
          region: qualifyForm.ville.trim(),
        })
        .select('id')
        .single()

      if (accErr || !newAccount) {
        setQualifySaving(false)
        setQualifyErr(accErr?.message || 'Erreur lors de la creation du compte.')
        return
      }

      // 2. Create primary contact on the account
      if (qualifyForm.contact_nom.trim()) {
        await supabase.from('account_contacts').insert({
          account_id: newAccount.id,
          full_name: qualifyForm.contact_nom.trim(),
          email: qualifyForm.contact_email.trim() || null,
          phone: qualifyForm.contact_tel.trim() || null,
          role: null,
          is_primary: true,
        })
      }

      // 3. Update prospect: status = Qualifie, link to account
      const { error: prospErr } = await supabase.from('prospects').update({
        status: 'Qualifi\u00e9 \u2713',
        converted_to_account_id: newAccount.id,
        converted_at: new Date().toISOString(),
        attempts: qualifyP.attempts + 1,
        last_contact_at: new Date().toISOString().split('T')[0],
      }).eq('id', qualifyP.id)

      if (prospErr) {
        setQualifySaving(false)
        setQualifyErr(prospErr.message)
        return
      }

      // 4. Log activity
      await logActivity({
        action_type: 'convert',
        entity_type: 'prospect',
        entity_id: qualifyP.id,
        entity_name: qualifyP.company_name,
        detail: `Qualifie et converti en compte : ${qualifyForm.nom_compte.trim()}`,
      })

      // 5. Refresh allAccounts
      const { data: freshAccounts } = await supabase.from('accounts').select('id,name,sector,segment')
      if (freshAccounts) setAllAccounts(freshAccounts)

      setQualifySaving(false)
      setQualifyP(null)
      toast(`${qualifyP.company_name} qualifie et compte "${qualifyForm.nom_compte.trim()}" cree`)
      load()
    } catch (e: any) {
      setQualifySaving(false)
      setQualifyErr(e?.message || 'Erreur inattendue.')
    }
  }

  async function advanceStatus(p: Prospect) {
    const next = STATUS_NEXT[p.status]
    if (!next) return

    // Intercept: if next status is "Qualifie", open qualify modal instead
    if (next === 'Qualifi\u00e9 \u2713') {
      openQualify(p)
      return
    }

    try {
      const { error } = await supabase.from('prospects').update({
        status: next, attempts: p.attempts + 1,
        last_contact_at: new Date().toISOString().split('T')[0],
      }).eq('id', p.id)
      if (error) { setErr(error.message); return }
      toast(`${p.company_name} \u2192 ${next}`); load()
    } catch (e: any) { setErr(e.message || 'Erreur advanceStatus') }
  }

  async function handleProspectDrop(targetStatus: string) {
    setDragOverStatus(null)
    if (!dragId) return
    const p = rows.find(r => r.id === dragId)
    if (!p || p.status === targetStatus) { setDragId(null); return }

    // Intercept: if target is "Qualifie", open qualify modal
    if (targetStatus === 'Qualifi\u00e9 \u2713') {
      setDragId(null)
      openQualify(p)
      return
    }

    const update: any = { status: targetStatus }
    // If moving forward, bump attempts & update last_contact
    const fromIdx = STATUSES.indexOf(p.status as any)
    const toIdx = STATUSES.indexOf(targetStatus as any)
    if (toIdx > fromIdx) {
      update.attempts = p.attempts + 1
      update.last_contact_at = new Date().toISOString().split('T')[0]
    }
    const { error } = await supabase.from('prospects').update(update).eq('id', p.id)
    if (error) { setErr(error.message); setDragId(null); return }
    setDragId(null)
    toast(`${p.company_name} \u2192 ${targetStatus}`)
    load()
  }

  async function addAttempt(p: Prospect) {
    try {
      const { error } = await supabase.from('prospects').update({
        attempts: p.attempts + 1,
        last_contact_at: new Date().toISOString().split('T')[0],
      }).eq('id', p.id)
      if (error) { setErr(error.message); return }
      toast(`+1 tentative · ${p.company_name}`); load()
    } catch (e: any) { setErr(e.message || 'Erreur addAttempt') }
  }

  async function save() {
    setFormErr(null)
    if (!form.company_name.trim()) { setFormErr('Société obligatoire.'); return }
    if (!form.contact_name.trim()) { setFormErr('Contact obligatoire.'); return }

    // Vérification doublon stricte (case-insensitive) — prospects
    const dup = rows.find(p =>
      p.id !== editId &&
      p.company_name.trim().toLowerCase() === form.company_name.trim().toLowerCase()
    )
    if (dup) {
      setFormErr(`Ce prospect existe déjà : "${dup.company_name}" (statut : ${dup.status}).`)
      setDupWarning(dup)
      return
    }

    // Vérification vs comptes existants (block sauf Grand Compte)
    if (!editId && !grandCompteMode) {
      const accDup = allAccounts.find(a =>
        a.name.trim().toLowerCase() === form.company_name.trim().toLowerCase()
      )
      if (accDup) {
        setAccountMatch(accDup)
        setFormErr(`"${accDup.name}" existe déjà dans les comptes clients. Activer le mode Grand Compte pour prospecter une BU spécifique.`)
        return
      }
    }

    // Grand Compte : BU cible obligatoire
    if (grandCompteMode && !targetBu.trim()) {
      setFormErr('En mode Grand Compte, la BU cible est obligatoire.')
      return
    }

    setSaving(true)
    const payload: any = {
      company_name: form.company_name.trim(), sector: form.sector || null,
      region: form.region || null, contact_name: form.contact_name.trim(),
      contact_role: form.contact_role || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null, type: form.type, heat: form.heat,
      status: form.status, next_action: form.next_action || null,
      next_date: form.next_date || null,
      notes: grandCompteMode
        ? `[GRAND COMPTE · BU: ${targetBu}]${form.notes ? `\n${form.notes}` : ''}`
        : form.notes || null,
      source: form.source || null, created_by: userEmail,
    }
    let prospectId = editId
    if (editId) {
      const res = await supabase.from('prospects').update(payload).eq('id', editId)
      if (res.error) { setSaving(false); setFormErr(res.error.message); return }
    } else {
      const res = await supabase.from('prospects').insert(payload).select('id').single()
      if (res.error) { setSaving(false); setFormErr(res.error.message); return }
      prospectId = res.data.id
    }

    // Save additional contacts (prospect_contacts table)
    if (prospectId) {
      try {
        // Delete removed contacts
        const existingIds = modalContacts.filter(c => !c.id.startsWith('new_')).map(c => c.id)
        const oldContacts = contactsMap[prospectId] || []
        for (const old of oldContacts) {
          if (!existingIds.includes(old.id)) {
            await supabase.from('prospect_contacts').delete().eq('id', old.id)
          }
        }
        // Update existing contacts (in case user edited them inline)
        for (const c of modalContacts) {
          if (!c.id.startsWith('new_')) {
            await supabase.from('prospect_contacts').update({
              full_name: c.full_name.trim(),
              email: c.email || null,
              phone: c.phone || null,
              role: c.role || null,
              is_primary: c.is_primary,
            }).eq('id', c.id)
          }
        }
        // Insert new contacts
        for (const c of modalContacts) {
          if (c.id.startsWith('new_')) {
            await supabase.from('prospect_contacts').insert({
              prospect_id: prospectId,
              full_name: c.full_name.trim(),
              email: c.email || null,
              phone: c.phone || null,
              role: c.role || null,
              is_primary: c.is_primary,
            })
          }
        }
      } catch (e) {
        // Contacts table may not exist yet — fail silently
      }
    }

    setSaving(false)
    toast(editId ? `${form.company_name} mis à jour` : `${form.company_name} ajouté`)
    setModalOpen(false); setEditId(null); load()
  }

  async function del(p: Prospect) {
    // Protection: refuse si converti en compte
    if (p.converted_at) {
      toast('Ce prospect a ete converti en compte, suppression impossible.', false)
      return
    }
    // Protection: refuse si le compte lie a des deals
    if (p.converted_to_account_id) {
      const { count } = await supabase.from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', p.converted_to_account_id)
      if (count && count > 0) {
        toast(`Ce compte a ${count} deal(s), suppression impossible.`, false)
        return
      }
    }
    if (!confirm(`Supprimer ${p.company_name} ?`)) return
    setRows(prev => prev.filter(r => r.id !== p.id))
    undoCancelled.current = false
    const timer = setTimeout(async () => {
      if (undoCancelled.current) return
      await supabase.from('prospects').delete().eq('id', p.id)
      setUndoToast(null)
    }, 8000)
    setUndoToast({ item: p, timer })
  }

  function undoDelete() {
    if (!undoToast) return
    undoCancelled.current = true
    clearTimeout(undoToast.timer)
    setRows(prev => [undoToast.item, ...prev])
    setUndoToast(null)
  }

  async function openConvert(p: Prospect) {
    setConvertP(p)
    const { data } = await supabase.from('accounts').select('id,name').order('name')
    setAccounts(data || [])
  }

  async function confirmConvert(accountId: string, accountName: string) {
    if (!convertP) return
    await supabase.from('prospects').update({
      status: 'Qualifié ✓',
      converted_to_account_id: accountId,
      converted_at: new Date().toISOString(),
    }).eq('id', convertP.id)
    await supabase.from('activity_log').insert({
      user_email: userEmail, action_type: 'create', entity_type: 'prospect',
      entity_name: convertP.company_name, detail: `Converti → compte : ${accountName}`,
    })
    toast(`✓ ${convertP.company_name} → Compte "${accountName}"`)
    setConvertP(null); load()
  }

  function openCreate() {
    setEditId(null)
    const d = new Date(); d.setDate(d.getDate() + 3)
    setForm({ ...EMPTY, next_date: d.toISOString().split('T')[0] })
    setFormErr(null); setDupWarning(null); setAccountMatch(null)
    setGrandCompteMode(false); setTargetBu('')
    setModalContacts([]); setNewContact({ full_name: '', email: '', phone: '', role: '' })
    setModalOpen(true)
  }

  function openEdit(p: Prospect) {
    setEditId(p.id)
    // Detect if it's a Grand Compte prospect
    const isGC = p.notes?.startsWith('[GRAND COMPTE')
    const buMatch = p.notes?.match(/\[GRAND COMPTE · BU: (.+?)\]/)
    setGrandCompteMode(!!isGC)
    setTargetBu(buMatch?.[1] || '')
    setForm({
      company_name: p.company_name, sector: p.sector || '', region: p.region || '',
      contact_name: p.contact_name, contact_role: p.contact_role || '',
      contact_phone: p.contact_phone || '', contact_email: p.contact_email || '',
      type: p.type, heat: p.heat, status: p.status,
      next_action: p.next_action || '', next_date: p.next_date || '',
      notes: isGC ? (p.notes?.replace(/\[GRAND COMPTE · BU: .+?\]\n?/, '') || '') : (p.notes || ''),
      source: p.source || '',
    })
    // Load existing contacts for this prospect
    setModalContacts(contactsMap[p.id] || [])
    setNewContact({ full_name: '', email: '', phone: '', role: '' })
    setFormErr(null); setDupWarning(null); setAccountMatch(null); setModalOpen(true)
  }

  const fld = (k: string) => (e: React.ChangeEvent<any>) => setForm((p: any) => ({ ...p, [k]: e.target.value }))

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-lg">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Prospection</h1>
              <p className="text-xs text-slate-500">{stats.total} prospects actifs · {stats.converted} convertis · {stats.convRate}% taux</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors">
              <Plus className="h-4 w-4" /> Nouveau
            </button>
            <button onClick={exportExcel} disabled={exporting}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export…' : 'Excel'}
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{err}</div>}
        {info && <Toast message={info.msg} type={info.ok ? 'success' : 'error'} onClose={() => setInfo(null)} />}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Users className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total actifs</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{stats.converted} convertis</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600"><Flame className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chauds</span>
            </div>
            <div className="text-2xl font-black text-red-700">{stats.hot}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Heat = hot</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Qualifies</span>
            </div>
            <div className="text-2xl font-black text-emerald-700">{stats.qualifie}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Prets pour un deal</div>
          </div>
          <button onClick={() => setShowOverdue(v => !v)}
            className={`rounded-2xl ring-1 shadow-sm p-4 text-left transition-all hover:shadow-md
              ${showOverdue ? 'bg-red-50 ring-red-300 ring-2' : 'bg-white ring-slate-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${showOverdue ? 'bg-red-200 text-red-700' : 'bg-amber-100 text-amber-600'}`}><AlertCircle className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Relances retard</span>
            </div>
            <div className={`text-2xl font-black ${overdueCount > 0 ? 'text-red-700' : 'text-slate-900'}`}>{overdueCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{showOverdue ? 'Filtre actif' : 'Clic pour filtrer'}</div>
          </button>
        </div>

        {/* Source distribution */}
        {stats.topSources.length > 1 && (
          <div className="mt-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sources de prospection</div>
            <div className="flex gap-1 items-end h-8">
              {stats.topSources.map(([src, cnt]) => {
                const maxCnt = stats.topSources[0][1] as number
                const pct = maxCnt > 0 ? (cnt as number) / (maxCnt as number) * 100 : 0
                return (
                  <div key={src} className="flex-1 flex flex-col items-center gap-1" title={`${src}: ${cnt}`}>
                    <div className="w-full rounded-t bg-slate-900 transition-all" style={{ height: `${Math.max(pct, 8)}%` }} />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {stats.topSources.map(([src, cnt]) => (
                <div key={src} className="flex-1 text-center">
                  <div className="text-[9px] font-semibold text-slate-500 truncate">{src}</div>
                  <div className="text-[10px] font-bold text-slate-700">{cnt as number}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Funnel */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Funnel prospection</div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STATUSES.map(s => {
              const st = STATUS_STYLE[s]
              const active = statusFilter === s
              return (
                <div key={s}
                  onClick={() => setStatusFilter(active ? 'Tous' : s)}
                  className={`flex-1 min-w-[90px] rounded-xl border px-3 py-2.5 cursor-pointer transition-all
                    ${active ? 'ring-2 ring-slate-900 ring-offset-1' : 'hover:ring-1 hover:ring-slate-300'}
                    ${st.bg} ${st.border}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide truncate ${st.text}`}>{s}</div>
                  <div className={`mt-0.5 text-xl font-bold ${st.text}`}>{stats.bySt[s] || 0}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')}><X className="h-3.5 w-3.5 text-slate-300 hover:text-slate-600" /></button>}
          </div>

          {/* Heat */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            {[{k:'Tous',l:'Tous'},{k:'hot',l:'🔥'},{k:'warm',l:'🌡'},{k:'cold',l:'❄️'}].map(({k,l}) => (
              <button key={k} onClick={() => setHeatFilter(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                  ${heatFilter===k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            <option value="Tous">Type: Tous</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Region filter */}
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            <option value="Tous">Région: Tous</option>
            {[...new Set(rows.filter(x => !x.converted_at).map(x => x.region).filter(Boolean))].sort().map(r => (
              <option key={r} value={r!}>{r}</option>
            ))}
          </select>

          {/* Date range */}
          {(dateFrom || dateTo) ? (
            <div className="flex h-9 items-center gap-1 rounded-xl border bg-white px-2 shadow-sm text-xs">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent outline-none text-xs text-slate-600 w-[105px]" />
              <span className="text-slate-300">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-transparent outline-none text-xs text-slate-600 w-[105px]" />
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => { setDateFrom(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)); setDateTo(new Date().toISOString().slice(0, 10)) }}
              className="inline-flex h-9 items-center gap-1 rounded-xl border bg-white px-3 text-xs text-slate-500 hover:bg-slate-50 shadow-sm">
              📅 Dates
            </button>
          )}

          {/* Active filter indicator */}
          {(statusFilter !== 'Tous' || typeFilter !== 'Tous' || heatFilter !== 'Tous' || regionFilter !== 'Tous' || dateFrom || dateTo || showOverdue) && (
            <button onClick={() => { setStatusFilter('Tous'); setTypeFilter('Tous'); setHeatFilter('Tous'); setRegionFilter('Tous'); setDateFrom(''); setDateTo(''); setShowOverdue(false) }}
              className="inline-flex h-9 items-center gap-1 rounded-xl border bg-white px-3 text-xs text-slate-500 hover:text-red-500 shadow-sm">
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}

          {/* View toggle */}
          <div className="ml-auto flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            <button onClick={() => setView('list')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors
                ${view==='list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <List className="h-3.5 w-3.5" /> Liste
            </button>
            <button onClick={() => setView('kanban')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors
                ${view==='kanban' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>

          <div className="text-xs text-slate-400">{filtered.length} prospect{filtered.length>1?'s':''}</div>
        </div>

        {/* ── LIST ─────────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="mt-3 rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500">
                    {([
                      { col: 'created_at',   label: 'Créé',       w: 'w-[78px]' },
                      { col: 'company_name', label: 'Société',    w: '' },
                      { col: 'type',         label: 'Contact',    w: '', noSort: true },
                      { col: 'type',         label: 'Type',       w: '' },
                      { col: 'status',       label: 'Statut',     w: '' },
                      { col: 'attempts',     label: 'Tentatives', w: '' },
                      { col: 'next_date',    label: 'Next Step',  w: '', noSort: true },
                      { col: 'next_date',    label: 'Relance',    w: '' },
                      { col: 'type',         label: 'Source',     w: '', noSort: true },
                    ] as { col: SortKey; label: string; w: string; noSort?: boolean }[]).map(({ col, label, w, noSort }) => {
                      const active = sortKey === col && !noSort
                      const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown
                      return (
                        <th key={label}
                          onClick={() => {
                            if (noSort) return
                            if (sortKey !== col) { setSortKey(col); setSortDir('desc') }
                            else setSortDir(d => d === 'desc' ? 'asc' : 'desc')
                          }}
                          className={`px-4 py-3 text-left font-semibold select-none ${w}
                            ${noSort ? '' : 'cursor-pointer hover:text-slate-700'}
                            ${active ? 'text-slate-900' : ''}`}>
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {!noSort && <Icon className="h-3 w-3 opacity-50" />}
                          </span>
                        </th>
                      )
                    })}
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Chargement…
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400">Aucun prospect.</td></tr>
                  ) : sorted.map(p => {
                    const overdue = isOverdue(p.next_date) && p.status !== 'Qualifié ✓'
                    const todayFlag = isToday(p.next_date)
                    const nextS = STATUS_NEXT[p.status]
                    return (
                      <tr key={p.id} className={`group hover:bg-slate-50/60 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                        <td className="w-[78px] min-w-[78px] pl-3 pr-1 py-2.5">
                          <div className="flex flex-col gap-0.5 leading-none">
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                              {`${new Date(p.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })} ${String(new Date(p.created_at).getFullYear()).slice(-2)}`}
                            </span>
                            <span className="text-[9px] text-slate-300 tabular-nums">
                              {new Date(p.created_at).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <HeatIcon heat={p.heat} />
                            <div>
                              <div className="font-semibold text-slate-900">{p.company_name}</div>
                              {(p.sector || p.region) && (
                                <div className="text-[11px] text-slate-400">{[p.sector, p.region].filter(Boolean).join(' · ')}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="font-medium text-slate-800">{p.contact_name}</div>
                            {(contactsMap[p.id]?.length || 0) > 0 && (
                              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700" title={`${contactsMap[p.id].length} contact(s) additionnel(s)`}>
                                +{contactsMap[p.id].length}
                              </span>
                            )}
                          </div>
                          {p.contact_role && <div className="text-[11px] text-slate-400">{p.contact_role}</div>}
                          <div className="mt-0.5 flex items-center gap-2">
                            {p.contact_phone && (
                              <a href={`tel:${p.contact_phone}`} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                                <Phone className="h-3 w-3" />{p.contact_phone}
                              </a>
                            )}
                            {p.contact_email && (
                              <a href={`mailto:${p.contact_email}`} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                                <Mail className="h-3 w-3" />email
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{p.type}</span>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          <AttemptsBar n={p.attempts} />
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <div className="truncate text-xs text-slate-500" title={p.next_action || ''}>
                            {p.next_action || <span className="italic text-slate-300">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold tabular-nums
                            ${overdue ? 'text-red-600' : todayFlag ? 'text-orange-600' : 'text-slate-600'}`}>
                            {overdue ? '⚠ ' : todayFlag ? '🔥 ' : ''}{fmtDate(p.next_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{p.source || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => router.push(`/prospection/${p.id}`)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors" title="Voir la fiche">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEdit(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors" title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => del(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Supprimer">
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
          </div>
        )}

        {/* ── KANBAN ──────────────────────────────────────────────────────── */}
        {view === 'kanban' && (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-4">
            {STATUSES.map(status => {
              const cards = filtered.filter(p => p.status === status)
              const st = STATUS_STYLE[status]
              return (
                <div key={status}
                  className={`min-w-[240px] w-[240px] flex-shrink-0 rounded-2xl transition-colors ${dragOverStatus===status?'bg-blue-50 ring-2 ring-blue-300':''}`}
                  onDragOver={e => { e.preventDefault(); setDragOverStatus(status) }}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={e => { e.preventDefault(); handleProspectDrop(status) }}>
                  <div className={`mb-2 flex items-center justify-between rounded-xl border px-3 py-2 ${st.bg} ${st.border}`}>
                    <div className={`flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
                      <span className={`h-2 w-2 rounded-full ${st.dot}`} />{status}
                    </div>
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${st.bg} ${st.text}`}>{cards.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {cards.map(p => {
                      const overdue = isOverdue(p.next_date) && status !== 'Qualifié ✓'
                      const nextS = STATUS_NEXT[p.status]
                      return (
                        <div key={p.id}
                          draggable
                          onDragStart={() => setDragId(p.id)}
                          onDragEnd={() => { setDragId(null); setDragOverStatus(null) }}
                          className={`rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing
                            ${dragId===p.id?'opacity-50 ring-2 ring-blue-400':''}
                            ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <HeatIcon heat={p.heat} />
                              <span className="font-semibold text-slate-900 text-xs leading-tight truncate">{p.company_name}</span>
                            </div>
                            <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 flex-shrink-0">{p.type}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <span>{p.contact_name}{p.contact_role ? ` · ${p.contact_role}` : ''}</span>
                            {(contactsMap[p.id]?.length || 0) > 0 && (
                              <span className="rounded-full bg-blue-100 px-1 py-0.5 text-[8px] font-bold text-blue-700">+{contactsMap[p.id].length}</span>
                            )}
                          </div>
                          {p.contact_phone && (
                            <a href={`tel:${p.contact_phone}`} className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                              <Phone className="h-3 w-3" />{p.contact_phone}
                            </a>
                          )}
                          <div className="mt-2"><AttemptsBar n={p.attempts} /></div>
                          {p.next_action && <div className="mt-1.5 text-[11px] text-slate-400 italic leading-tight">{p.next_action}</div>}
                          {p.next_date && (
                            <div className={`mt-1 text-[11px] font-semibold
                              ${overdue ? 'text-red-600' : isToday(p.next_date) ? 'text-orange-600' : 'text-slate-400'}`}>
                              {overdue ? '⚠ ' : isToday(p.next_date) ? '🔥 ' : '📅 '}{fmtDate(p.next_date)}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
                            <button onClick={() => router.push(`/prospection/${p.id}`)}
                              className="flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              <Eye className="h-3 w-3" /> Voir
                            </button>
                            <button onClick={() => openEdit(p)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 transition-colors" title="Modifier">
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {cards.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">
                        Aucun prospect
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL CREATE/EDIT ────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          role="presentation" onClick={e => { if (e.target === e.currentTarget) { setModalOpen(false); setEditId(null) } }} onKeyDown={e => { if (e.key === 'Escape') { setModalOpen(false); setEditId(null) } }}>
          <div className="flex w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: 'calc(100dvh - 72px)' }}
            role="dialog" aria-modal="true" aria-label={editId ? 'Modifier le prospect' : 'Nouveau prospect'}>

            {/* ── Header ── */}
            <div className="flex shrink-0 items-center justify-between rounded-t-3xl bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5 sm:rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{editId ? '✏️' : '🎯'}</span>
                  <h2 className="text-base font-bold text-white">
                    {editId ? 'Modifier le prospect' : 'Nouveau prospect'}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {editId ? 'Mets à jour les informations' : 'Ajoute un nouveau prospect à ton pipeline'}
                </p>
              </div>
              <button onClick={() => { setModalOpen(false); setEditId(null) }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Duplicate warning — strict block, no bypass */}
              {dupWarning && (
                <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-base">🚫</span>
                    <div className="text-sm font-semibold text-red-900">
                      <strong>{dupWarning.company_name}</strong> existe déjà dans les prospects
                      <span className="ml-1.5 font-normal text-red-700">— statut : {dupWarning.status}</span>
                      {dupWarning.contact_name && <span className="ml-1.5 font-normal text-red-700">· Contact : {dupWarning.contact_name}</span>}
                      <p className="mt-1 text-xs font-normal text-red-600">1 société = 1 prospect. Pour ajouter un contact, modifiez le prospect existant.</p>
                    </div>
                  </div>
                  <div className="pl-7">
                    <button type="button"
                      onClick={() => { setModalOpen(false); setDupWarning(null); setFormErr(null); setTimeout(() => openEdit(dupWarning), 50) }}
                      className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors">
                      ✏️ Modifier le prospect existant
                    </button>
                  </div>
                </div>
              )}

              {/* Account match warning — Grand Compte option */}
              {accountMatch && !grandCompteMode && (
                <div className="flex flex-col gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-base">🏦</span>
                    <div className="text-sm font-semibold text-amber-900">
                      <strong>{accountMatch.name}</strong> existe déjà dans les comptes clients
                      <p className="mt-1 text-xs font-normal text-amber-700">
                        Tu ne peux pas créer un prospect classique pour un client existant.
                        Mais tu peux activer le <strong>mode Grand Compte</strong> pour prospecter une BU spécifique (ex: Infra, Cyber, Network…)
                      </p>
                    </div>
                  </div>
                  <div className="pl-7">
                    <button type="button"
                      onClick={() => { setGrandCompteMode(true); setAccountMatch(null); setFormErr(null) }}
                      className="rounded-xl border border-amber-400 bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 transition-colors">
                      🏢 Activer Prospection Grand Compte
                    </button>
                  </div>
                </div>
              )}

              {formErr && !dupWarning && !accountMatch && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  ⚠️ {formErr}
                </div>
              )}

              {/* Grand Compte banner */}
              {grandCompteMode && (
                <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏢</span>
                      <div>
                        <div className="text-sm font-bold text-violet-800">Mode Grand Compte</div>
                        <div className="text-xs text-violet-600">Prospection d'une BU spécifique sur un compte existant</div>
                      </div>
                    </div>
                    <button onClick={() => { setGrandCompteMode(false); setTargetBu('') }}
                      className="text-xs text-violet-500 hover:text-violet-700 underline transition-colors">
                      Désactiver
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-medium text-violet-700">BU cible *</div>
                    <select value={targetBu} onChange={e => setTargetBu(e.target.value)}
                      className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-400">
                      <option value="">Choisir la BU…</option>
                      <option value="HCI / Infra">HCI / Infra</option>
                      <option value="Network">Network</option>
                      <option value="Storage">Storage</option>
                      <option value="Cyber">Cyber</option>
                      <option value="Service">Service</option>
                      <option value="CSG">CSG</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Section 1 — Société */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🏢 Société</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <CompanyInput
                      value={form.company_name}
                      onChange={v => { setForm((p: any) => ({ ...p, company_name: v })); setDupWarning(null); setFormErr(null); setAccountMatch(null) }}
                      existingProspects={rows}
                      editId={editId}
                      onDupSelect={p => {
                        setForm((f: any) => ({ ...f, company_name: p.company_name }))
                        setDupWarning(p)
                      }}
                    />
                    {/* Show if company exists in accounts (real-time check) */}
                    {!editId && !grandCompteMode && form.company_name.trim().length > 2 && (() => {
                      const q = form.company_name.trim().toLowerCase()
                      const match = allAccounts.find(a => a.name.toLowerCase().includes(q))
                      if (match && !dupWarning) {
                        return (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                            <span>🏦</span>
                            <span><strong>{match.name}</strong> existe dans les comptes clients</span>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <AutocompleteInput label="Secteur" value={form.sector} onChange={v => setForm((p: any) => ({ ...p, sector: v }))} suggestions={sectorSuggestions} placeholder="IT, Banque, BTP…" />
                  <AutocompleteInput label="Région" value={form.region} onChange={v => setForm((p: any) => ({ ...p, region: v }))} suggestions={regionSuggestions} placeholder="Casablanca, Rabat…" />
                </div>
              </div>

              {/* Section 2 — Contact principal */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">👤 Contact principal</div>
                  {modalContacts.length > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      + {modalContacts.length} contact{modalContacts.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Inp label="Nom complet *" value={form.contact_name} onChange={fld('contact_name')} placeholder="Prénom Nom" />
                  <Inp label="Fonction / Rôle" value={form.contact_role} onChange={fld('contact_role')} placeholder="DSI, DG, Dir. Achats…" />
                  <Inp label="Téléphone" value={form.contact_phone} onChange={fld('contact_phone')} placeholder="+212 6 00 00 00 00" />
                  <Inp label="Email" value={form.contact_email} onChange={fld('contact_email')} placeholder="contact@societe.ma" type="email" />
                </div>
              </div>

              {/* Section 2b — Contacts additionnels */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                  <Users className="inline h-3 w-3 mr-1" />Contacts additionnels
                </div>

                {/* List existing additional contacts */}
                {modalContacts.length > 0 && (
                  <div className="space-y-2">
                    {modalContacts.map((c, i) => (
                      <div key={c.id} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5 space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input value={c.full_name}
                            onChange={e => setModalContacts(prev => prev.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))}
                            placeholder="Nom *"
                            className="h-8 w-full rounded-lg border border-blue-100 bg-blue-50/30 px-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-300" />
                          <input value={c.role || ''}
                            onChange={e => setModalContacts(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value || null } : x))}
                            placeholder="Role"
                            className="h-8 w-full rounded-lg border border-blue-100 bg-blue-50/30 px-2.5 text-sm text-slate-600 outline-none focus:border-blue-300" />
                          <input value={c.phone || ''}
                            onChange={e => setModalContacts(prev => prev.map((x, j) => j === i ? { ...x, phone: e.target.value || null } : x))}
                            placeholder="Telephone"
                            className="h-8 w-full rounded-lg border border-blue-100 bg-blue-50/30 px-2.5 text-sm text-slate-600 outline-none focus:border-blue-300" />
                          <div className="flex gap-2">
                            <input value={c.email || ''}
                              onChange={e => setModalContacts(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value || null } : x))}
                              placeholder="Email"
                              className="h-8 flex-1 rounded-lg border border-blue-100 bg-blue-50/30 px-2.5 text-sm text-slate-600 outline-none focus:border-blue-300" />
                            <button type="button"
                              onClick={() => setModalContacts(prev => prev.filter((_, j) => j !== i))}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new contact form */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={newContact.full_name}
                    onChange={e => setNewContact(c => ({ ...c, full_name: e.target.value }))}
                    placeholder="Nom du contact *"
                    className="h-9 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 placeholder:text-slate-400" />
                  <input value={newContact.role}
                    onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))}
                    placeholder="Rôle (DSI, Acheteur…)"
                    className="h-9 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 placeholder:text-slate-400" />
                  <input value={newContact.phone}
                    onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
                    placeholder="Téléphone"
                    className="h-9 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 placeholder:text-slate-400" />
                  <div className="flex gap-2">
                    <input value={newContact.email}
                      onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                      placeholder="Email"
                      className="h-9 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 placeholder:text-slate-400" />
                    <button type="button"
                      disabled={!newContact.full_name.trim()}
                      onClick={() => {
                        setModalContacts(prev => [...prev, {
                          id: `new_${Date.now()}`,
                          prospect_id: editId || '',
                          full_name: newContact.full_name.trim(),
                          email: newContact.email.trim() || null,
                          phone: newContact.phone.trim() || null,
                          role: newContact.role.trim() || null,
                          is_primary: false,
                        }])
                        setNewContact({ full_name: '', email: '', phone: '', role: '' })
                      }}
                      className="flex h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
                      <Plus className="h-3.5 w-3.5" /> Ajouter
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3 — Qualification */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Qualification</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600">Chaleur</div>
                    <div className="flex gap-2">
                      {([
                        { k: 'cold', label: '❄️ Froid', active: 'bg-blue-600 text-white border-blue-600' },
                        { k: 'warm', label: '🌡️ Tiède', active: 'bg-amber-500 text-white border-amber-500' },
                        { k: 'hot',  label: '🔥 Chaud', active: 'bg-red-500 text-white border-red-500' },
                      ] as const).map(h => (
                        <button key={h.k} type="button"
                          onClick={() => setForm((p: any) => ({ ...p, heat: h.k }))}
                          className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-all
                            ${form.heat === h.k ? h.active + ' shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editId && <Sel label="Statut" value={form.status} onChange={fld('status')} options={STATUSES} />}
                </div>
              </div>

              {/* Section 4 — Next step */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📅 Prochaine action</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Inp label="Action prévue" value={form.next_action} onChange={fld('next_action')}
                      placeholder="Ex: Rappeler lundi, Envoyer plaquette, Confirmer RDV…" />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600">Date de relance</div>
                    <input type="date" value={form.next_date} onChange={fld('next_date')}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600">Notes</div>
                    <textarea value={form.notes} onChange={fld('notes')} rows={2}
                      placeholder="Contexte, besoins, historique…"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none" />
                  </div>
                </div>
              </div>

            </div>

            {/* ── Footer ── */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button onClick={() => { setModalOpen(false); setEditId(null) }}
                className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors sm:flex-none">
                {saving
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Enregistrement…</>
                  : editId ? '✅ Mettre à jour' : '🎯 Créer le prospect'
                }
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── CONVERT MODAL ────────────────────────────────────────────────── */}
      {convertP && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') setConvertP(null) }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Convertir en compte CRM">
            <div className="border-b px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">Convertir en compte CRM</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Lier <strong>{convertP.company_name}</strong> à un compte existant
              </div>
            </div>
            <div className="p-5">
              <div className="mb-2 text-xs font-medium text-slate-600">Sélectionner le compte</div>
              <div className="max-h-64 overflow-auto rounded-xl border divide-y">
                {accounts.map(acc => (
                  <button key={acc.id} onClick={() => confirmConvert(acc.id, acc.name)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-emerald-50 hover:text-emerald-800 transition-colors">
                    <ArrowRightCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />{acc.name}
                  </button>
                ))}
                {accounts.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">
                    Aucun compte.{' '}
                    <a href="/accounts" className="text-blue-600 underline">Créer un compte d'abord.</a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t px-5 py-4">
              <button onClick={() => setConvertP(null)}
                className="h-10 rounded-xl border px-5 text-sm font-medium hover:bg-slate-50">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── QUALIFY MODAL ─────────────────────────────────────────────── */}
      {qualifyP && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          role="presentation" onClick={e => { if (e.target === e.currentTarget) setQualifyP(null) }} onKeyDown={e => { if (e.key === 'Escape') setQualifyP(null) }}>
          <div className="flex w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: 'calc(100dvh - 72px)' }}
            role="dialog" aria-modal="true" aria-label="Qualifier le prospect">

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between rounded-t-3xl bg-gradient-to-r from-emerald-700 to-emerald-500 px-6 py-5 sm:rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-white" />
                  <h2 className="text-base font-bold text-white">Qualifier le prospect</h2>
                </div>
                <p className="mt-0.5 text-xs text-emerald-100">
                  Creer le compte client pour <strong>{qualifyP.company_name}</strong>
                </p>
              </div>
              <button onClick={() => setQualifyP(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {qualifyErr && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {qualifyErr}
                </div>
              )}

              {/* Section: Compte */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Building2 className="inline h-3 w-3 mr-1" />Informations du compte
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-xs font-medium text-slate-600">Nom du compte *</div>
                    <input type="text"
                      value={qualifyForm.nom_compte}
                      onChange={e => setQualifyForm(f => ({ ...f, nom_compte: e.target.value }))}
                      placeholder="Nom de la societe"
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Secteur d'activite *</div>
                    <select
                      value={qualifyForm.secteur}
                      onChange={e => setQualifyForm(f => ({ ...f, secteur: e.target.value }))}
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400">
                      <option value="">Choisir le secteur...</option>
                      {SECTEUR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Ville *</div>
                    <input type="text"
                      value={qualifyForm.ville}
                      onChange={e => setQualifyForm(f => ({ ...f, ville: e.target.value }))}
                      placeholder="Casablanca, Rabat..."
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                </div>
              </div>

              {/* Section: Contact principal */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Users className="inline h-3 w-3 mr-1" />Contact principal
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-xs font-medium text-slate-600">Nom *</div>
                    <input type="text"
                      value={qualifyForm.contact_nom}
                      onChange={e => setQualifyForm(f => ({ ...f, contact_nom: e.target.value }))}
                      placeholder="Prenom Nom"
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Email</div>
                    <input type="email"
                      value={qualifyForm.contact_email}
                      onChange={e => setQualifyForm(f => ({ ...f, contact_email: e.target.value }))}
                      placeholder="contact@societe.ma"
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Telephone</div>
                    <input type="tel"
                      value={qualifyForm.contact_tel}
                      onChange={e => setQualifyForm(f => ({ ...f, contact_tel: e.target.value }))}
                      placeholder="+212 6 00 00 00 00"
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                </div>
              </div>

              {/* Info summary */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-700 leading-relaxed">
                    En validant, le prospect <strong>{qualifyP.company_name}</strong> passera au statut
                    <strong> Qualifie</strong> et un nouveau compte client sera cree dans le CRM
                    avec les informations ci-dessus.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button onClick={() => setQualifyP(null)}
                className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={confirmQualify} disabled={qualifySaving}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors sm:flex-none">
                {qualifySaving
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Qualification...</>
                  : <><CheckCircle2 className="h-4 w-4" /> Qualifier et creer le compte</>
                }
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Undo toast ── */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 shadow-2xl">
          <span className="text-sm text-white">
            <span className="font-bold">{undoToast.item.company_name}</span> supprimé
          </span>
          <button onClick={undoDelete}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 transition-colors">
            Annuler
          </button>
          <div className="h-1 w-20 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ animation: 'shrink 8s linear forwards' }} />
          </div>
        </div>
      )}
      <style>{`@keyframes shrink { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  )
}
