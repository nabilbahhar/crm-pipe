'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { X, Plus, Trash2, Save, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Account = { id: string; name: string }

type BuLine = {
  bu: string
  vendor: string
  card: string
  amount: string
}

export type DealFormData = {
  account_id: string
  title: string
  stage: string
  multi_bu: boolean
  auto_prob: boolean
  // Single BU mode
  bu: string
  vendor: string
  card: string
  amount: string
  extra_cards: string[]  // additional cartes
  // Multi BU mode
  bu_lines: BuLine[]
  prob: string
  booking_month: string
  next_step: string
  notes: string
  po_number: string
  po_date: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = [
  'Lead','Discovery','Qualified','Solutioning',
  'Proposal Sent','Negotiation','Commit','Won','Lost / No decision',
] as const

const BUS = ['HCI','Network','Storage','Cyber','Service','CSG'] as const

const VENDORS: Record<string, string[]> = {
  HCI:     ['HPE','Dell','Lenovo','Fujitsu','Cisco','Autre'],
  Network: ['Cisco','Fortinet','HPE Aruba','Juniper','Palo Alto','Autre'],
  Storage: ['HPE','Dell','NetApp','Pure Storage','IBM','Autre'],
  Cyber:   ['Fortinet','Palo Alto','CrowdStrike','Checkpoint','Trend Micro','Autre'],
  Service: ['Compucom','Autre'],
  CSG:     ['Dell','HPE','Lenovo','Apple','Samsung','Zebra','Cisco','HP Inc','Autre'],
}

const CARTES: Record<string, string[]> = {
  HCI:     ['HPE','Dell','Lenovo','Fujitsu','Cisco','Multi'],
  Network: ['Cisco','Fortinet','HPE Aruba','Juniper','Multi'],
  Storage: ['HPE','Dell','NetApp','Pure Storage','Multi'],
  Cyber:   ['Fortinet','Palo Alto','CrowdStrike','Multi'],
  Service: ['Compucom','Multi'],
  CSG:     ['Dell','HPE','Lenovo','Apple','Samsung','Zebra','Cisco','HP Inc','Multi'],
}


const STAGE_PROB: Record<string, number> = {
  Lead: 10, Discovery: 20, Qualified: 40, Solutioning: 55,
  'Proposal Sent': 70, Negotiation: 80, Commit: 90,
  Won: 100, 'Lost / No decision': 0,
}

const EMPTY_LINE: BuLine = { bu: 'CSG', vendor: '', card: '', amount: '' }

function emptyForm(): DealFormData {
  return {
    account_id: '', title: '', stage: 'Solutioning',
    multi_bu: false,
    auto_prob: true,
    bu: 'CSG', vendor: '', card: '', amount: '',
    extra_cards: [],
    bu_lines: [{ ...EMPTY_LINE }],
    prob: '50', booking_month: '', next_step: '', notes: '',
    po_number: '', po_date: '',
  }
}

export function dealFromRow(row: any): DealFormData {
  const isMulti = Boolean(row.multi_bu) || (Array.isArray(row.bu_lines) && row.bu_lines.length > 0)
  return {
    account_id: row.account_id || '',
    title: row.title || '',
    stage: row.stage || 'Solutioning',
    multi_bu: isMulti,
    auto_prob: false,
    bu: row.bu || 'CSG',
    vendor: row.vendor || '',
    card: row.card || '',
    amount: String(row.amount || ''),
    extra_cards: [],
    bu_lines: isMulti && Array.isArray(row.bu_lines) && row.bu_lines.length > 0
      ? row.bu_lines.map((l: any) => ({
          bu: l.bu || 'CSG',
          vendor: l.vendor || '',
          card: l.card || '',
          amount: String(l.amount || ''),
        }))
      : [{ ...EMPTY_LINE }],
    prob: String(row.prob ?? '50'),
    booking_month: row.booking_month || '',
    next_step: row.next_step || '',
    notes: row.notes || '',
    po_number: row.po_number || '',
    po_date: row.po_date || '',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  /** null = create mode, object = edit mode */
  editRow?: any | null
  onClose: () => void
  onSaved: () => void
}

export default function DealFormModal({ editRow, onClose, onSaved }: Props) {
  const isEdit = Boolean(editRow)
  const [form, setForm] = useState<DealFormData>(editRow ? dealFromRow(editRow) : emptyForm())
  const [accounts, setAccounts] = useState<Account[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load accounts for dropdown
  useEffect(() => {
    supabase.from('accounts').select('id, name').order('name')
      .then(({ data }) => setAccounts((data || []) as Account[]))
  }, [])

  function set(key: keyof DealFormData, val: any) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'stage' && f.auto_prob) {
        next.prob = String(STAGE_PROB[val as string] ?? f.prob)
      }
      if (key === 'auto_prob' && val === true) {
        next.prob = String(STAGE_PROB[f.stage] ?? f.prob)
      }
      return next
    })
  }

  // BU line helpers
  function setLine(i: number, key: keyof BuLine, val: string) {
    setForm(f => {
      const lines = [...f.bu_lines]
      lines[i] = { ...lines[i], [key]: val }
      return { ...f, bu_lines: lines }
    })
  }
  function addLine() {
    setForm(f => ({ ...f, bu_lines: [...f.bu_lines, { ...EMPTY_LINE }] }))
  }
  function removeLine(i: number) {
    setForm(f => ({ ...f, bu_lines: f.bu_lines.filter((_, idx) => idx !== i) }))
  }

  // Compute total amount
  const totalAmount = form.multi_bu
    ? form.bu_lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    : parseFloat(form.amount) || 0

  async function handleSave() {
    if (!form.account_id) { setErr('Sélectionnez un compte'); return }
    if (!form.title.trim()) { setErr('Le titre est requis'); return }

    setSaving(true); setErr(null)

    const payload: any = {
      account_id: form.account_id,
      title: form.title.trim(),
      stage: form.stage,
      status: 'Open',
      prob: parseInt(form.prob) || 0,
      booking_month: form.booking_month || null,
      next_step: form.next_step.trim() || null,
      notes: form.notes.trim() || null,
      po_number: form.po_number.trim() || null,
      po_date: form.po_date || null,
      multi_bu: form.multi_bu,
    }

    if (form.multi_bu) {
      const lines = form.bu_lines.filter(l => l.bu)
      payload.bu_lines = lines.map(l => ({
        bu: l.bu,
        vendor: l.vendor || null,
        card: l.card || null,
        amount: parseFloat(l.amount) || 0,
      }))
      payload.bu = null
      payload.vendor = null
      payload.amount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    } else {
      payload.bu = form.bu || null
      payload.vendor = form.vendor || null
      payload.card = form.card || null
      payload.amount = parseFloat(form.amount) || 0
      payload.bu_lines = null
    }

    try {
      let error
      if (isEdit) {
        ;({ error } = await supabase.from('opportunities').update(payload).eq('id', editRow.id))
      } else {
        ;({ error } = await supabase.from('opportunities').insert(payload))
      }
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-200 flex flex-col max-h-[95vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="text-base font-bold text-slate-900">
              {isEdit ? 'Modifier le deal' : 'Nouveau deal'}
            </div>
            {isEdit && (
              <div className="text-xs text-slate-400 mt-0.5">{editRow?.accounts?.name || editRow?.account_id}</div>
            )}
          </div>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">

          {/* Compte + Titre */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Compte *</label>
              <div className="relative">
                <select
                  value={form.account_id}
                  onChange={e => set('account_id', e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-8 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white appearance-none"
                >
                  <option value="">-- Sélectionner --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Titre du deal *</label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="Ex: Fourniture serveurs HPE..."
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Stage + Prob + AUTO */}
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Étape</label>
              <div className="relative">
                <select value={form.stage} onChange={e => set('stage', e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-8 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Probabilité (%)
              </label>
              <input type="number" min="0" max="100"
                value={form.prob} onChange={e => set('prob', e.target.value)}
                disabled={form.auto_prob}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400" />
            </div>
            <div className="h-10 flex items-center gap-2 px-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
              onClick={() => set('auto_prob', !form.auto_prob)}>
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${form.auto_prob ? 'bg-slate-900 border-slate-900' : 'border-slate-400 bg-white'}`}>
                {form.auto_prob && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span className="text-xs font-semibold text-slate-700 select-none">AUTO</span>
            </div>
          </div>

          {/* Multi BU toggle */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <button
              type="button"
              onClick={() => set('multi_bu', !form.multi_bu)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.multi_bu ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.multi_bu ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-semibold text-slate-700">Multi BU</span>
            {form.multi_bu && totalAmount > 0 && (
              <span className="ml-auto text-sm font-black text-slate-900">
                Total : {new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(totalAmount)} MAD
              </span>
            )}
          </div>

          {/* ── SINGLE BU ── */}
          {!form.multi_bu && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">BU</label>
                <div className="relative">
                  <select value={form.bu} onChange={e => { set('bu', e.target.value); set('vendor', ''); set('card', '') }}
                    className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-8 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                    {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Vendor</label>
                <div className="relative">
                  <select value={form.vendor} onChange={e => set('vendor', e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-8 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                    <option value="">--</option>
                    {(VENDORS[form.bu] || []).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Carte</label>
                <div className="relative">
                  <select value={form.card} onChange={e => set('card', e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-8 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                    <option value="">--</option>
                    {(CARTES[form.bu] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Montant (MAD)</label>
                <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)}
                  placeholder="0"
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            {/* Extra cartes */}
            {form.extra_cards.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mt-2">
                <div className="relative flex-1">
                  <select value={c} onChange={e => {
                    const cards = [...form.extra_cards]; cards[i] = e.target.value; set('extra_cards', cards)
                  }} className="h-9 w-full rounded-lg border border-slate-200 pl-3 pr-7 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                    <option value="">-- Carte --</option>
                    {(CARTES[form.bu] || []).map(c2 => <option key={c2} value={c2}>{c2}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={() => set('extra_cards', form.extra_cards.filter((_, j) => j !== i))}
                  className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button onClick={() => set('extra_cards', [...form.extra_cards, ''])} type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              <Plus className="h-3.5 w-3.5" /> Nouvelle carte
            </button>
          )}

          {/* ── MULTI BU LINES ── */}
          {form.multi_bu && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">Lignes BU</span>
                <button onClick={addLine} type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                  <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                </button>
              </div>
              {form.bu_lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end bg-slate-50 rounded-xl p-3">
                  {/* BU */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">BU</label>
                    <div className="relative">
                      <select value={line.bu} onChange={e => { setLine(i, 'bu', e.target.value); setLine(i, 'vendor', ''); setLine(i, 'card', '') }}
                        className="h-9 w-full rounded-lg border border-slate-200 pl-2 pr-6 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                        {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  {/* Vendor */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Vendor</label>
                    <div className="relative">
                      <select value={line.vendor} onChange={e => setLine(i, 'vendor', e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 pl-2 pr-6 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                        <option value="">--</option>
                        {(VENDORS[line.bu] || []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  {/* Carte */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Carte</label>
                    <div className="relative">
                      <select value={line.card} onChange={e => setLine(i, 'card', e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 pl-2 pr-6 text-sm outline-none focus:border-blue-400 bg-white appearance-none">
                        <option value="">--</option>
                        {(CARTES[line.bu] || []).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  {/* Montant */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Montant</label>
                    <input type="number" value={line.amount} onChange={e => setLine(i, 'amount', e.target.value)}
                      placeholder="0"
                      className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                  {/* Remove */}
                  <button onClick={() => removeLine(i)} type="button" disabled={form.bu_lines.length <= 1}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Closing + Next Step */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Closing (YYYY-MM)</label>
              <input value={form.booking_month} onChange={e => set('booking_month', e.target.value)}
                placeholder="2026-03"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Next Step</label>
              <input value={form.next_step} onChange={e => set('next_step', e.target.value)}
                placeholder="Ex: Relancer le client..."
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* PO Number + PO Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">N° PO</label>
              <input value={form.po_number} onChange={e => set('po_number', e.target.value)}
                placeholder="PO-2026-XXXX"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date PO</label>
              <input type="date" value={form.po_date} onChange={e => set('po_date', e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Informations complémentaires..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
          </div>

          {/* Error */}
          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Sauvegarde…' : isEdit ? 'Sauvegarder' : 'Créer le deal'}
          </button>
        </div>

      </div>
    </div>
  )
}
