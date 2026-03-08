'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import {
  Plus, RefreshCw, X, Phone, Mail, ChevronRight,
  LayoutGrid, List, Flame, Thermometer, Snowflake, ArrowRightCircle,
  ArrowUp, ArrowDown, ChevronsUpDown, Download,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
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
  const [rows, setRows]     = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]       = useState<string | null>(null)
  const [info, setInfo]     = useState<string | null>(null)
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

  // Convert modal
  const [convertP, setConvertP]   = useState<Prospect | null>(null)
  const [accounts, setAccounts]   = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    document.title = 'Prospection \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
  }, [])

  async function load() {
    setLoading(true); setErr(null)
    const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false })
    if (error) { setErr(error.message); setLoading(false); return }
    setRows((data as Prospect[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toast(msg: string) { setInfo(msg); setTimeout(() => setInfo(null), 3500) }

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
  }, [rows, search, heatFilter, typeFilter, statusFilter, regionFilter, showOverdue])

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

  async function advanceStatus(p: Prospect) {
    const next = STATUS_NEXT[p.status]
    if (!next) return
    await supabase.from('prospects').update({
      status: next, attempts: p.attempts + 1,
      last_contact_at: new Date().toISOString().split('T')[0],
    }).eq('id', p.id)
    toast(`${p.company_name} → ${next}`); load()
  }

  async function addAttempt(p: Prospect) {
    await supabase.from('prospects').update({
      attempts: p.attempts + 1,
      last_contact_at: new Date().toISOString().split('T')[0],
    }).eq('id', p.id)
    toast(`+1 tentative · ${p.company_name}`); load()
  }

  async function save() {
    setFormErr(null)
    if (!form.company_name.trim()) { setFormErr('Société obligatoire.'); return }
    if (!form.contact_name.trim()) { setFormErr('Contact obligatoire.'); return }

    // Vérification doublon stricte (case-insensitive)
    const dup = rows.find(p =>
      p.id !== editId &&
      p.company_name.trim().toLowerCase() === form.company_name.trim().toLowerCase()
    )
    if (dup) {
      setFormErr(`Ce prospect existe déjà : "${dup.company_name}" (statut : ${dup.status}).`)
      setDupWarning(dup)
      return
    }
    setSaving(true)
    const payload = {
      company_name: form.company_name.trim(), sector: form.sector || null,
      region: form.region || null, contact_name: form.contact_name.trim(),
      contact_role: form.contact_role || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null, type: form.type, heat: form.heat,
      status: form.status, next_action: form.next_action || null,
      next_date: form.next_date || null, notes: form.notes || null,
      source: form.source || null, created_by: userEmail,
    }
    const res = editId
      ? await supabase.from('prospects').update(payload).eq('id', editId)
      : await supabase.from('prospects').insert(payload)
    setSaving(false)
    if (res.error) { setFormErr(res.error.message); return }
    toast(editId ? `${form.company_name} mis à jour` : `${form.company_name} ajouté`)
    setModalOpen(false); setEditId(null); load()
  }

  function del(p: Prospect) {
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
    setFormErr(null); setDupWarning(null); setModalOpen(true)
  }

  function openEdit(p: Prospect) {
    setEditId(p.id)
    setForm({
      company_name: p.company_name, sector: p.sector || '', region: p.region || '',
      contact_name: p.contact_name, contact_role: p.contact_role || '',
      contact_phone: p.contact_phone || '', contact_email: p.contact_email || '',
      type: p.type, heat: p.heat, status: p.status,
      next_action: p.next_action || '', next_date: p.next_date || '',
      notes: p.notes || '', source: p.source || '',
    })
    setFormErr(null); setDupWarning(null); setModalOpen(true)
  }

  const fld = (k: string) => (e: React.ChangeEvent<any>) => setForm((p: any) => ({ ...p, [k]: e.target.value }))

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Prospection</div>
            <div className="text-sm text-slate-500">
              Phase pré-deal — de la prise de contact jusqu'au 1er dossier · {stats.total} prospects actifs
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Nouveau prospect
            </button>
            <button onClick={exportExcel} disabled={exporting} title="Export Excel"
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export…' : 'Excel'}
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {err  && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Total actifs</div>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-xs text-slate-400 mt-0.5">{stats.converted} convertis · {stats.convRate}% taux</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1 text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              <Flame className="h-3.5 w-3.5 text-red-500" /> Chauds
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.hot}</div>
            <div className="text-xs text-slate-400 mt-0.5">Heat = hot</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Qualifiés ✓</div>
            <div className="text-2xl font-bold text-emerald-700">{stats.qualifie}</div>
            <div className="text-xs text-slate-400">Prêts pour un deal</div>
          </div>
          <div
            onClick={() => setShowOverdue(v => !v)}
            className={`rounded-2xl border p-4 shadow-sm cursor-pointer transition-colors
              ${showOverdue ? 'bg-red-50 border-red-200' : 'bg-white hover:bg-red-50'}`}
          >
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">⚠ Relances retard</div>
            <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>{overdueCount}</div>
            <div className="text-xs text-slate-400">{showOverdue ? 'Clic → tout voir' : 'Clic → filtrer'}</div>
          </div>
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

        {/* Toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Société, contact…"
              className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400" />
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
                          <div className="font-medium text-slate-800">{p.contact_name}</div>
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
                          <div className="flex flex-col gap-1.5">
                            <AttemptsBar n={p.attempts} />
                            <button onClick={() => addAttempt(p)}
                              className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                              + tentative
                            </button>
                          </div>
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
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {nextS && (
                              <button onClick={() => advanceStatus(p)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border bg-slate-900 px-2 text-[11px] text-white hover:bg-slate-700">
                                <ChevronRight className="h-3.5 w-3.5" />
                                {nextS === 'Qualifié ✓' ? '✓ Qualifier' : nextS}
                              </button>
                            )}
                            {p.status === 'Qualifié ✓' && !p.converted_at && (
                              <button onClick={() => openConvert(p)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-[11px] text-emerald-700 hover:bg-emerald-100">
                                <ArrowRightCircle className="h-3.5 w-3.5" /> Convertir
                              </button>
                            )}
                            <button onClick={() => openEdit(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-100">✎</button>
                            <button onClick={() => del(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border text-red-400 hover:bg-red-50">✕</button>
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
                <div key={status} className="min-w-[240px] w-[240px] flex-shrink-0">
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
                          className={`rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow
                            ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <HeatIcon heat={p.heat} />
                              <span className="font-semibold text-slate-900 text-xs leading-tight truncate">{p.company_name}</span>
                            </div>
                            <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 flex-shrink-0">{p.type}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{p.contact_name}{p.contact_role ? ` · ${p.contact_role}` : ''}</div>
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
                            {nextS ? (
                              <button onClick={() => advanceStatus(p)}
                                className="flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-lg border bg-slate-900 text-[11px] text-white hover:bg-slate-700">
                                <ChevronRight className="h-3 w-3" />{nextS === 'Qualifié ✓' ? 'Qualifier' : nextS}
                              </button>
                            ) : (!p.converted_at && (
                              <button onClick={() => openConvert(p)}
                                className="flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 hover:bg-emerald-100">
                                <ArrowRightCircle className="h-3 w-3" /> Convertir
                              </button>
                            ))}
                            <button onClick={() => addAttempt(p)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-100 text-[10px]" title="+1 tentative">+1</button>
                            <button onClick={() => openEdit(p)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-100 text-[10px]">✎</button>
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
          onClick={e => { if (e.target === e.currentTarget) { setModalOpen(false); setEditId(null) } }}>
          <div className="flex w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: 'calc(100dvh - 72px)' }}>

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

              {/* Duplicate warning */}
              {dupWarning && (
                <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-base">🚫</span>
                    <div className="text-sm font-semibold text-red-900">
                      <strong>{dupWarning.company_name}</strong> existe déjà dans les prospects
                      <span className="ml-1.5 font-normal text-red-700">— statut : {dupWarning.status}</span>
                      {dupWarning.contact_name && <span className="ml-1.5 font-normal text-red-700">· Contact : {dupWarning.contact_name}</span>}
                      <p className="mt-1 text-xs font-normal text-red-600">Impossible de créer un doublon. Modifiez le prospect existant pour mettre à jour les infos.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-7">
                    <button type="button"
                      onClick={() => { setModalOpen(false); setTimeout(() => openEdit(dupWarning), 50) }}
                      className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors">
                      ✏️ Modifier le prospect existant
                    </button>
                    <button type="button"
                      onClick={() => { setDupWarning(null); setFormErr(null) }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                      Changer le nom
                    </button>
                  </div>
                </div>
              )}

              {formErr && !dupWarning && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  ⚠️ {formErr}
                </div>
              )}

              {/* Section 1 — Société */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🏢 Société</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <CompanyInput
                      value={form.company_name}
                      onChange={v => { setForm((p: any) => ({ ...p, company_name: v })); setDupWarning(null); setFormErr(null) }}
                      existingProspects={rows}
                      editId={editId}
                      onDupSelect={p => {
                        setForm((f: any) => ({ ...f, company_name: p.company_name }))
                        setDupWarning(p)
                      }}
                    />
                  </div>
                  <AutocompleteInput label="Secteur" value={form.sector} onChange={v => setForm((p: any) => ({ ...p, sector: v }))} suggestions={sectorSuggestions} placeholder="IT, Banque, BTP…" />
                  <AutocompleteInput label="Région" value={form.region} onChange={v => setForm((p: any) => ({ ...p, region: v }))} suggestions={regionSuggestions} placeholder="Casablanca, Rabat…" />
                </div>
              </div>

              {/* Section 2 — Contact */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">👤 Contact</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Inp label="Nom complet *" value={form.contact_name} onChange={fld('contact_name')} placeholder="Prénom Nom" />
                  <Inp label="Fonction / Rôle" value={form.contact_role} onChange={fld('contact_role')} placeholder="DSI, DG, Dir. Achats…" />
                  <Inp label="Téléphone" value={form.contact_phone} onChange={fld('contact_phone')} placeholder="+212 6 00 00 00 00" />
                  <Inp label="Email" value={form.contact_email} onChange={fld('contact_email')} placeholder="contact@societe.ma" type="email" />
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
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
