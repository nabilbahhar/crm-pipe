'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  mad, fmtDate, paymentTermLabel,
  SUPPLY_STATUS_CFG, SUPPLY_STATUS_ORDER, type SupplyStatus,
  LINE_STATUS_CFG, LINE_STATUS_ORDER, type LineStatus,
  COMPUCOM_EMAILS, ownerName,
  normMainBU, MAIN_BU_COLORS,
  PAYMENT_TERMS,
} from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { buildSupplyEmail } from '@/lib/emailTemplates'
import PurchaseModal from '@/components/PurchaseModal'
import Toast from '@/components/Toast'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  RefreshCw, Package, ChevronRight, ChevronDown, Search,
  AlertCircle, Download, Clock, Mail, Copy, ExternalLink, X,
  FileText, CheckSquare, Square, Check,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type PurchaseLine = {
  id: string
  purchase_info_id: string
  ref: string | null
  designation: string | null
  qty: number
  pu_vente: number
  pt_vente: number
  pu_achat: number
  fournisseur: string | null
  fournisseur_id: string | null
  contact_fournisseur: string | null
  email_fournisseur: string | null
  tel_fournisseur: string | null
  line_status: LineStatus | null
  eta: string | null
  eta_updated_at: string | null
  status_note: string | null
  warranty_months: number | null
  license_months: number | null
  sort_order: number | null
}

type Order = {
  id: string
  opportunity_id: string
  status: SupplyStatus
  supply_notes: string | null
  placed_at: string | null
  ordered_at: string | null
  received_at: string | null
  delivered_at: string | null
  invoiced_at: string | null
  updated_at: string | null
  opportunities?: {
    id: string; title: string; amount: number
    po_number: string | null; po_date: string | null
    bu: string | null; vendor: string | null
    accounts?: { name?: string } | null
    purchase_info?: { id: string; frais_engagement: number; payment_terms: string | null; notes: string | null; purchase_lines?: PurchaseLine[] }[] | null
  }
}

// Aliases
const STATUS_CONFIG = SUPPLY_STATUS_CFG
const ALL_STATUSES = SUPPLY_STATUS_ORDER

// ─── Inline note editor for purchase lines ───────────────────
function LineNoteCell({ lineId, note, onSave }: { lineId: string; note: string | null; onSave: (id: string, n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(note || '')
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(lineId, val); setEditing(false) } }}
          autoFocus placeholder="Note…"
          className="h-6 w-full rounded border border-slate-200 px-1.5 text-[10px] outline-none focus:border-blue-300" />
        <button onClick={() => { onSave(lineId, val); setEditing(false) }}
          className="h-6 rounded bg-slate-900 px-1.5 text-[9px] font-bold text-white">OK</button>
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(note || ''); setEditing(true) }}
      className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[120px] text-left">
      {note || '+ note'}
    </button>
  )
}

// ─── Facturation Modal ────────────────────────────────────────
function FacturationModal({
  order, lines, paymentTerms, userEmail, onClose, onSaved,
}: {
  order: Order
  lines: PurchaseLine[]
  paymentTerms: string | null
  userEmail: string | null
  onClose: () => void
  onSaved: () => void
}) {
  // Only show lines that are "livre" or above (not already facture)
  const invoiceableLines = lines.filter(l => {
    const s = l.line_status || 'pending'
    return s === 'livre' // Only livre lines can be invoiced
  })
  const alreadyFacture = lines.filter(l => l.line_status === 'facture')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(invoiceableLines.map(l => l.id)))
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [pmTerms, setPmTerms] = useState(paymentTerms || '30j')
  const [saving, setSaving] = useState(false)

  const allSelected = invoiceableLines.length > 0 && selectedIds.size === invoiceableLines.length
  const isGlobal = selectedIds.size === lines.filter(l => l.line_status !== 'facture').length

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(invoiceableLines.map(l => l.id)))
  }

  function toggleLine(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Compute due date from payment terms + invoice date
  function getDueDate(): string {
    const base = new Date(invoiceDate)
    if (pmTerms === 'a_la_livraison') return invoiceDate
    if (pmTerms === '30j') { base.setDate(base.getDate() + 30); return base.toISOString().slice(0, 10) }
    if (pmTerms === '60j') { base.setDate(base.getDate() + 60); return base.toISOString().slice(0, 10) }
    if (pmTerms === '90j') { base.setDate(base.getDate() + 90); return base.toISOString().slice(0, 10) }
    base.setDate(base.getDate() + 30)
    return base.toISOString().slice(0, 10)
  }

  const selectedLines = invoiceableLines.filter(l => selectedIds.has(l.id))
  const invoiceAmount = selectedLines.reduce((s, l) => s + (l.pt_vente || l.qty * l.pu_vente), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoiceNumber.trim()) { alert('Veuillez entrer le numéro de facture.'); return }
    if (selectedIds.size === 0) { alert('Sélectionnez au moins une ligne à facturer.'); return }

    setSaving(true)
    try {
      const opp = order.opportunities!
      const dueDate = getDueDate()

      // 1. Update selected lines to "facture"
      for (const lineId of selectedIds) {
        await supabase.from('purchase_lines').update({
          line_status: 'facture' as LineStatus,
        }).eq('id', lineId)
      }

      // 2. Check if ALL lines are now facture
      const remainingNonFacture = lines.filter(l =>
        l.line_status !== 'facture' && !selectedIds.has(l.id)
      )
      const allFactured = remainingNonFacture.length === 0

      // 3. If all factured, update supply order status
      if (allFactured) {
        await supabase.from('supply_orders').update({
          status: 'facture' as SupplyStatus,
          invoiced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', order.id)
      }

      // 4. Create invoice in invoices table
      const { error: invError } = await supabase.from('invoices').insert({
        opportunity_id: order.opportunity_id,
        invoice_number: invoiceNumber.trim(),
        amount: invoiceAmount,
        issue_date: invoiceDate,
        due_date: dueDate,
        status: 'emise',
        payment_terms: pmTerms,
        notes: isGlobal
          ? `Facturation globale — ${selectedLines.length} lignes`
          : `Facturation partielle — ${selectedLines.length}/${lines.length} lignes`,
        created_by: userEmail,
      })
      if (invError) throw invError

      // 5. Log activity
      await logActivity({
        action_type: 'update',
        entity_type: 'deal',
        entity_id: order.opportunity_id,
        entity_name: opp.title,
        detail: `Facturé: ${invoiceNumber} — ${mad(invoiceAmount)} (${selectedLines.length} ligne${selectedLines.length > 1 ? 's' : ''})`,
      })

      onSaved()
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la facturation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="presentation" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Facturer les lignes"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Facturer — {order.opportunities?.accounts?.name || order.opportunities?.title}</div>
              <div className="text-xs text-slate-500">
                {order.opportunities?.title} · PO {order.opportunities?.po_number || '—'}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Already invoiced info */}
          {alreadyFacture.length > 0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-800">
              <strong>{alreadyFacture.length}</strong> ligne{alreadyFacture.length > 1 ? 's' : ''} déjà facturée{alreadyFacture.length > 1 ? 's' : ''}
            </div>
          )}

          {/* Select lines */}
          {invoiceableLines.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center text-sm text-amber-700">
              Aucune ligne livré à facturer. Toutes les lignes doivent avoir le statut « Livré » avant de pouvoir être facturées.
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Lignes à facturer
                  </label>
                  <button type="button" onClick={toggleAll}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    {allSelected ? 'Tout décocher' : 'Facturation globale'}
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {invoiceableLines.map(line => (
                    <label key={line.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                        ${selectedIds.has(line.id) ? 'bg-emerald-50/50' : 'bg-white hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selectedIds.has(line.id)}
                        onChange={() => toggleLine(line.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {line.designation || '—'}
                          {line.ref && <span className="ml-1 text-slate-400">[{line.ref}]</span>}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Qté {line.qty} · {line.fournisseur || '—'}
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {mad(line.pt_vente || line.qty * line.pu_vente)}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Invoice details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    N° Facture <span className="text-red-500">*</span>
                  </label>
                  <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="FAC-XXX-YYY"
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
                    required />
                  <div className="text-[10px] text-slate-400 mt-1">
                    Identique au n° du système interne Compucom
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Date facture <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
                    required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Modalités paiement</label>
                  <select value={pmTerms} onChange={e => setPmTerms(e.target.value)}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none">
                    {PAYMENT_TERMS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Échéance</label>
                  <div className="h-9 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                    {fmtDate(getDueDate())}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {isGlobal ? '✅ Facturation globale' : `📋 Facturation partielle (${selectedIds.size}/${lines.length})`}
                    </div>
                    <div className="text-lg font-black text-white mt-1">{mad(invoiceAmount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">{selectedIds.size} ligne{selectedIds.size > 1 ? 's' : ''}</div>
                    <div className="text-xs font-semibold text-slate-300 mt-0.5">
                      N° {invoiceNumber || '...'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={saving || selectedIds.size === 0}
                  className="h-9 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {saving ? 'Facturation...' : `Facturer ${selectedIds.size} ligne${selectedIds.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function SupplyPage() {
  const sp = useSearchParams()
  const [orders, setOrders]       = useState<Order[]>([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<SupplyStatus | 'Tous'>('Tous')
  const [updating, setUpdating]   = useState<string | null>(null)
  const [noteOpen, setNoteOpen]   = useState<string | null>(null)
  const [noteText, setNoteText]   = useState('')
  const [purchaseDeal, setPurchaseDeal] = useState<any | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [emailHtml, setEmailHtml] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [buFilter, setBuFilter] = useState('Tous')
  const [vendorFilter, setVendorFilter] = useState('Tous')
  const [busyLines, setBusyLines] = useState<Set<string>>(new Set())
  const [factureOrder, setFactureOrder] = useState<Order | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
  }

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    document.title = 'Supply · CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    const urlVendor = sp.get('vendor')
    if (urlVendor) setVendorFilter(urlVendor)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('supply_orders')
        .select(`
          *,
          opportunities (
            id, title, amount, po_number, po_date, bu, vendor,
            accounts(name),
            purchase_info(id, frais_engagement, payment_terms, notes, purchase_lines(*))
          )
        `)
        .order('created_at', { ascending: false })

      if (error) { setErr(error.message); return }
      setOrders((data || []) as Order[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur réseau lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const buOptions = useMemo(() => {
    const bus = orders.map(o => normMainBU(o.opportunities?.bu) || '').filter(Boolean)
    return [...new Set(bus)].sort()
  }, [orders])

  const vendorOptions = useMemo(() =>
    [...new Set(orders.map(o => o.opportunities?.vendor || '').filter(Boolean))].sort()
  , [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      const name = o.opportunities?.accounts?.name || o.opportunities?.title || ''
      if (q && !name.toLowerCase().includes(q)
        && !(o.opportunities?.vendor || '').toLowerCase().includes(q)
        && !(o.opportunities?.po_number || '').toLowerCase().includes(q)
        && !(o.supply_notes || '').toLowerCase().includes(q)) return false
      if (statusFilter !== 'Tous' && o.status !== statusFilter) return false
      if (buFilter !== 'Tous' && (normMainBU(o.opportunities?.bu) || '') !== buFilter) return false
      if (vendorFilter !== 'Tous' && (o.opportunities?.vendor || '') !== vendorFilter) return false
      return true
    })
  }, [orders, search, statusFilter, buFilter, vendorFilter])

  const filteredTotal = useMemo(() =>
    filtered.reduce((s, o) => s + (o.opportunities?.amount || 0), 0)
  , [filtered])

  // Grouped by status
  const grouped = useMemo(() => {
    const g: Record<SupplyStatus, Order[]> = {
      a_commander: [], place: [], commande: [], en_stock: [], livre: [], facture: [],
    }
    filtered.forEach(o => { g[o.status as SupplyStatus]?.push(o) })
    return g
  }, [filtered])

  // ── Derive order status from line statuses ──
  function deriveOrderStatus(lines: PurchaseLine[]): SupplyStatus | null {
    if (lines.length === 0) return null
    const statuses = lines.map(l => l.line_status || 'pending')
    if (statuses.every(s => s === 'facture')) return 'facture'
    if (statuses.every(s => s === 'livre' || s === 'facture')) return 'livre'
    if (statuses.every(s => s === 'en_stock' || s === 'livre' || s === 'facture')) return 'en_stock'
    if (statuses.some(s => s === 'commande' || s === 'sous_douane' || s === 'en_stock' || s === 'livre' || s === 'facture')) return 'commande'
    return null
  }

  async function changeStatus(order: Order, newStatus: SupplyStatus) {
    if (newStatus === order.status || updating) return
    setUpdating(order.id)

    try {
      const now = new Date().toISOString()
      const timestamps: Record<string, string> = {
        place: 'placed_at', commande: 'ordered_at',
        en_stock: 'received_at', livre: 'delivered_at', facture: 'invoiced_at',
      }
      const tsField = timestamps[newStatus]
      const oldLabel = STATUS_CONFIG[order.status]?.label || order.status
      const newLabel = STATUS_CONFIG[newStatus]?.label || newStatus

      const { error } = await supabase.from('supply_orders').update({
        status: newStatus,
        ...(tsField ? { [tsField]: now } : {}),
        updated_by: userEmail,
        updated_at: now,
      }).eq('id', order.id)

      if (error) { showToast('Erreur mise à jour statut', false); return }

      logActivity({
        action_type: 'update',
        entity_type: 'deal',
        entity_id: order.opportunity_id,
        entity_name: order.opportunities?.title || '—',
        detail: `Supply: ${oldLabel} → ${newLabel}`,
      })

      showToast(`${order.opportunities?.accounts?.name || 'Commande'} → ${newLabel}`)
      await load()
    } finally {
      setUpdating(null)
    }
  }

  async function updateLineStatus(lineId: string, newStatus: LineStatus, orderId: string, orderTitle: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        line_status: newStatus,
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour ligne', false); return }

      // After updating a line, check if we should auto-update order status
      // Reload the order's lines and derive
      const order = orders.find(o => o.id === orderId)
      if (order) {
        const lines = order.opportunities?.purchase_info?.[0]?.purchase_lines || []
        // Update in memory for derive check
        const updatedLines = lines.map(l => l.id === lineId ? { ...l, line_status: newStatus } : l)
        const derived = deriveOrderStatus(updatedLines)
        if (derived && derived !== order.status) {
          const timestamps: Record<string, string> = {
            place: 'placed_at', commande: 'ordered_at',
            en_stock: 'received_at', livre: 'delivered_at', facture: 'invoiced_at',
          }
          const tsField = timestamps[derived]
          await supabase.from('supply_orders').update({
            status: derived,
            ...(tsField ? { [tsField]: new Date().toISOString() } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', orderId)
        }
      }

      showToast(`Ligne → ${LINE_STATUS_CFG[newStatus]?.label || newStatus}`)
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  async function updateLineEta(lineId: string, eta: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        eta: eta || null,
        eta_updated_at: new Date().toISOString(),
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour ETA', false); return }
      showToast('ETA mise à jour')
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  async function updateLineNote(lineId: string, note: string) {
    if (busyLines.has(lineId)) return
    setBusyLines(prev => new Set(prev).add(lineId))
    try {
      const { error } = await supabase.from('purchase_lines').update({
        status_note: note || null,
      }).eq('id', lineId)
      if (error) { showToast('Erreur mise à jour note', false); return }
      showToast('Note ligne mise à jour')
      await load()
    } finally {
      setBusyLines(prev => { const n = new Set(prev); n.delete(lineId); return n })
    }
  }

  function generateSupplyEmail(order: Order) {
    const opp = order.opportunities
    if (!opp) return
    const pi = opp.purchase_info?.[0]
    const lines = pi?.purchase_lines || []
    const html = buildSupplyEmail({
      dealTitle: opp.title,
      accountName: opp.accounts?.name || '—',
      poNumber: opp.po_number || '—',
      amount: opp.amount,
      paymentTerms: paymentTermLabel(pi?.payment_terms),
      lines: lines.map(l => ({
        ref: l.ref || '', designation: l.designation || '', qty: l.qty,
        pu_achat: l.pu_achat, fournisseur: l.fournisseur || '',
        contact: l.contact_fournisseur || '', email: l.email_fournisseur || '', tel: l.tel_fournisseur || '',
      })),
      frais: pi?.frais_engagement || 0,
      notes: pi?.notes || '',
      senderName: ownerName(userEmail),
    })
    setEmailHtml(html)
  }

  function copyEmailHtml() {
    if (!emailHtml) return
    navigator.clipboard.writeText(emailHtml)
    showToast('HTML copié dans le presse-papier')
  }

  async function saveNote(orderId: string) {
    const { error } = await supabase.from('supply_orders').update({
      supply_notes: noteText,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)
    if (error) { alert('Erreur: ' + error.message); return }
    setNoteOpen(null)
    load()
  }

  const toCommanderCount = grouped.a_commander.length

  // ── Line progress helpers ──
  function getLineProgress(lines: PurchaseLine[]) {
    if (lines.length === 0) return { total: 0, livre: 0, facture: 0, pct: 0 }
    const livre = lines.filter(l => l.line_status === 'livre' || l.line_status === 'facture').length
    const facture = lines.filter(l => l.line_status === 'facture').length
    return { total: lines.length, livre, facture, pct: Math.round((facture / lines.length) * 100) }
  }

  function canInvoice(lines: PurchaseLine[]) {
    return lines.some(l => l.line_status === 'livre')
  }

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = filtered.reduce((s,o) => s+(o.opportunities?.amount||0), 0)
      const statusMap = new Map<string, { count: number; amount: number }>()
      filtered.forEach(o => {
        const label = STATUS_CONFIG[o.status]?.label || o.status
        const prev = statusMap.get(label) || { count: 0, amount: 0 }
        statusMap.set(label, { count: prev.count + 1, amount: prev.amount + (o.opportunities?.amount||0) })
      })

      const spec = {
        filename: `supply_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Supply',
          title: `Suivi Supply · ${filtered.length} commandes · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Compte','Deal','Statut','BU','Vendor','Montant (MAD)','PO','PO Date','Fournisseurs','Lignes','Livré','Facturé','Placé le','Commandé le','Livré le','Note'],
          rows: filtered.map(o => {
            const opp = o.opportunities
            const lines = opp?.purchase_info?.[0]?.purchase_lines || []
            const fournisseurs = [...new Set(lines.map((l: any) => l.fournisseur).filter(Boolean))].join(', ')
            const prog = getLineProgress(lines)
            return [
              opp?.accounts?.name||'—', opp?.title||'—',
              STATUS_CONFIG[o.status]?.label||o.status,
              opp?.bu||'—', opp?.vendor||'—', opp?.amount||0,
              opp?.po_number||'—', opp?.po_date||'—',
              fournisseurs||'—',
              prog.total, prog.livre, prog.facture,
              o.placed_at ? new Date(o.placed_at).toLocaleDateString('fr-MA') : '—',
              o.ordered_at ? new Date(o.ordered_at).toLocaleDateString('fr-MA') : '—',
              o.delivered_at ? new Date(o.delivered_at).toLocaleDateString('fr-MA') : '—',
              o.supply_notes||'—',
            ]
          }),
          totalsRow: ['TOTAL', `${filtered.length} commandes`, '', '', '', totalAmt, '', '', '', '', '', '', '', '', '', ''],
          notes: `Montant total: ${mad(totalAmt)}`,
        }],
        summary: {
          title: `Résumé Supply · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total commandes', value: filtered.length, detail: `Montant: ${mad(totalAmt)}` },
            { label: 'En cours', value: filtered.filter(o => !['livre','facture'].includes(o.status)).length, detail: 'À commander + Placé + Commandé + En stock' },
            { label: 'Livrées', value: filtered.filter(o => o.status === 'livre').length, detail: 'En attente facturation' },
            { label: 'Facturées', value: filtered.filter(o => o.status === 'facture').length, detail: 'Cycle terminé' },
          ],
          breakdownTitle: 'Répartition par statut',
          breakdownHeaders: ['Statut', 'Montant (MAD)', 'Nb commandes', '% du total'],
          breakdown: [...statusMap.entries()].map(([label, v]) => [
            label, v.amount, v.count, totalAmt > 0 ? `${Math.round(v.amount / totalAmt * 100)}%` : '0%',
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

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Supply</h1>
              <p className="text-xs text-slate-500">
                Suivi commandes ligne par ligne · {orders.length} commande{orders.length !== 1 ? 's' : ''}
                {toCommanderCount > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {toCommanderCount} à commander
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} title="Export Excel" disabled={exporting}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        {/* KPI bar */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s]
            const count = grouped[s].length
            return (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'Tous' : s)}
                className={`rounded-2xl border p-3 text-left transition-all shadow-sm
                  ${statusFilter === s ? `${cfg.bg} ${cfg.border}` : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{cfg.icon} {cfg.label}</div>
                <div className={`mt-1 text-2xl font-black ${statusFilter === s ? cfg.color : 'text-slate-800'}`}>{count}</div>
              </button>
            )
          })}
        </div>

        {/* Mini chart — Supply par statut (horizontal bar) */}
        {orders.length > 0 && (() => {
          const SUPPLY_HEX: Record<string, string> = {
            a_commander: '#f59e0b', place: '#3b82f6', commande: '#8b5cf6',
            en_stock: '#f97316', livre: '#10b981', facture: '#64748b',
          }
          const chartData = SUPPLY_STATUS_ORDER.map(s => ({
            name: SUPPLY_STATUS_CFG[s].label,
            value: grouped[s].length,
            fill: SUPPLY_HEX[s] || '#94a3b8',
          }))
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Commandes par statut</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    formatter={(v: any) => [`${v} commande${Number(v) > 1 ? 's' : ''}`, '']} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Compte, vendor, PO…"
              className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            <option value="Tous">BU: Tous</option>
            <option value="CSG">CSG</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Cyber Sécurité">Cyber Sécurité</option>
          </select>
          {vendorOptions.length > 1 && (
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
              <option value="Tous">Carte: Tous</option>
              {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span>{filtered.length} commande{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-slate-700">{mad(filteredTotal)}</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <Package className="mb-3 h-10 w-10 text-slate-300" />
            <div className="text-sm font-semibold text-slate-500">Aucune commande</div>
            <div className="mt-1 text-xs text-slate-400">Les deals Won apparaissent ici une fois la fiche achat remplie.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {ALL_STATUSES.filter(s => statusFilter === 'Tous' || statusFilter === s)
              .filter(s => grouped[s].length > 0)
              .map(status => {
                const cfg = STATUS_CONFIG[status]
                return (
                  <div key={status} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                    <div className={`flex items-center gap-2 px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
                      <span className="text-base">{cfg.icon}</span>
                      <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.border} border ${cfg.bg} ${cfg.color}`}>
                        {grouped[status].length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                            <th className="w-8 px-2 py-2.5" />
                            <th className="px-4 py-2.5 text-left">Compte / Deal</th>
                            <th className="px-4 py-2.5 text-left">BU</th>
                            <th className="px-4 py-2.5 text-right">Montant</th>
                            <th className="px-4 py-2.5 text-left">PO</th>
                            <th className="px-4 py-2.5 text-left">Paiement</th>
                            <th className="px-4 py-2.5 text-center">Lignes</th>
                            <th className="px-4 py-2.5 text-left">Note</th>
                            <th className="px-4 py-2.5 text-center">Statut</th>
                            <th className="px-4 py-2.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {grouped[status].map(order => {
                            const opp    = order.opportunities
                            const pi     = opp?.purchase_info?.[0]
                            const lines  = pi?.purchase_lines || []
                            const fournisseurs = [...new Set(lines.map((l: any) => l.fournisseur).filter(Boolean))]
                            const hasPurchase  = (opp?.purchase_info?.length || 0) > 0
                            const isExpanded   = expandedRows.has(order.id)
                            const prog = getLineProgress(lines)
                            const canFact = canInvoice(lines)

                            const isOverdue = status === 'a_commander' && (() => {
                              const ts = order.placed_at || order.updated_at
                              return ts ? (Date.now() - new Date(ts).getTime()) > 24*60*60*1000 : false
                            })()
                            const daysSince = (() => {
                              const ts = status === 'a_commander' ? (order.placed_at || order.updated_at)
                                : status === 'place' ? order.placed_at
                                : status === 'commande' ? order.ordered_at
                                : null
                              if (!ts) return null
                              return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
                            })()

                            return (
                              <React.Fragment key={order.id}>
                              <tr className={`hover:bg-slate-50/60 transition-colors ${isOverdue ? 'bg-red-50/40' : ''}`}>
                                {/* Expand toggle */}
                                <td className="px-2 py-3 text-center">
                                  {lines.length > 0 && (
                                    <button onClick={() => toggleExpand(order.id)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                                      {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                        : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Link href={`/opportunities/${opp?.id || order.opportunity_id}`} className="group/link">
                                    <div className="font-bold text-slate-900 group-hover/link:text-blue-600 transition-colors">
                                      {opp?.accounts?.name || opp?.title || '—'}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {opp?.title}
                                      {daysSince != null && daysSince > 0 && (
                                        <span className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                                          <Clock className="h-2.5 w-2.5" />{daysSince}j
                                        </span>
                                      )}
                                    </div>
                                  </Link>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                    {opp?.bu || '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                  {opp?.amount ? mad(opp.amount) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-xs font-semibold text-slate-700">{opp?.po_number || '—'}</div>
                                  {opp?.po_date && <div className="text-[10px] text-slate-400">{opp.po_date}</div>}
                                </td>
                                {/* Payment terms */}
                                <td className="px-4 py-3">
                                  <span className="text-xs text-slate-600">
                                    {paymentTermLabel(pi?.payment_terms)}
                                  </span>
                                </td>
                                {/* Lines progress */}
                                <td className="px-4 py-3">
                                  {lines.length > 0 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-slate-700">{prog.facture}/{prog.total}</span>
                                        <span className="text-[10px] text-slate-400">facturées</span>
                                      </div>
                                      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-emerald-500 transition-all"
                                          style={{ width: `${prog.pct}%` }} />
                                      </div>
                                      {prog.livre > prog.facture && (
                                        <span className="text-[9px] font-semibold text-blue-600">{prog.livre - prog.facture} livrée{prog.livre - prog.facture > 1 ? 's' : ''}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 max-w-[150px]">
                                  {noteOpen === order.id ? (
                                    <div className="flex items-center gap-1">
                                      <input value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveNote(order.id) }}
                                        autoFocus
                                        placeholder="Note…"
                                        className="h-7 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-slate-400" />
                                      <button onClick={() => saveNote(order.id)}
                                        className="h-7 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white">OK</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setNoteOpen(order.id); setNoteText(order.supply_notes || '') }}
                                      className="text-xs text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[140px] text-left">
                                      {order.supply_notes || '+ note'}
                                    </button>
                                  )}
                                </td>
                                {/* Status dropdown */}
                                <td className="px-4 py-3 text-center">
                                  <select
                                    value={order.status}
                                    disabled={!!updating}
                                    onChange={e => changeStatus(order, e.target.value as SupplyStatus)}
                                    className={`h-8 rounded-xl border px-2 text-xs font-bold outline-none transition-colors cursor-pointer
                                      ${STATUS_CONFIG[order.status].bg} ${STATUS_CONFIG[order.status].border} ${STATUS_CONFIG[order.status].color}
                                      disabled:opacity-40 disabled:cursor-not-allowed`}>
                                    {ALL_STATUSES.map(s => (
                                      <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Actions */}
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {/* Facturer button */}
                                    {canFact && (
                                      <button onClick={() => setFactureOrder(order)}
                                        title="Facturer"
                                        className="inline-flex h-8 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">
                                        <FileText className="h-3.5 w-3.5" /> Facturer
                                      </button>
                                    )}
                                    {hasPurchase && lines.length > 0 && (
                                      <button onClick={() => generateSupplyEmail(order)}
                                        title="Générer email Supply"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                                        <Mail className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {lines.length > 0 && (
                                      <button onClick={() => toggleExpand(order.id)}
                                        title={isExpanded ? 'Masquer lignes' : 'Voir lignes'}
                                        className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[10px] font-bold transition-colors
                                          ${isExpanded ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                        {lines.length} ligne{lines.length > 1 ? 's' : ''}
                                      </button>
                                    )}
                                    {!hasPurchase && (
                                      <button onClick={() => setPurchaseDeal(opp)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">
                                        <AlertCircle className="h-3 w-3" /> Fiche vide
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded purchase lines */}
                              {isExpanded && lines.length > 0 && (
                                <tr>
                                  <td colSpan={10} className="bg-slate-50/80 px-4 py-3">
                                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                                            <th className="px-3 py-2 text-left">Désignation</th>
                                            <th className="px-3 py-2 text-center">Qté</th>
                                            <th className="px-3 py-2 text-left">Fournisseur</th>
                                            <th className="px-3 py-2 text-center">Statut ligne</th>
                                            <th className="px-3 py-2 text-center">ETA</th>
                                            <th className="px-3 py-2 text-center">Garantie</th>
                                            <th className="px-3 py-2 text-center">Licence</th>
                                            <th className="px-3 py-2 text-left">Note</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                          {lines.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(line => {
                                            const lsCfg = LINE_STATUS_CFG[line.line_status as LineStatus] || LINE_STATUS_CFG.pending
                                            return (
                                              <tr key={line.id} className={`hover:bg-slate-50/60 ${line.line_status === 'facture' ? 'bg-green-50/30' : ''}`}>
                                                <td className="px-3 py-2">
                                                  <div className="font-semibold text-slate-800">{line.designation || '—'}</div>
                                                  {line.ref && <div className="text-[10px] text-slate-400">Réf: {line.ref}</div>}
                                                </td>
                                                <td className="px-3 py-2 text-center font-semibold">{line.qty}</td>
                                                <td className="px-3 py-2">
                                                  {line.fournisseur ? (
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                      {line.fournisseur}
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <select
                                                    value={line.line_status || 'pending'}
                                                    disabled={busyLines.has(line.id) || line.line_status === 'facture'}
                                                    onChange={e => updateLineStatus(line.id, e.target.value as LineStatus, order.id, opp?.title || '')}
                                                    className={`h-7 rounded-lg border px-1.5 text-[10px] font-bold outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                                                      ${lsCfg.bg} ${lsCfg.border} ${lsCfg.color}`}>
                                                    {LINE_STATUS_ORDER.map(ls => (
                                                      <option key={ls} value={ls}>{LINE_STATUS_CFG[ls].icon} {LINE_STATUS_CFG[ls].label}</option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {line.line_status !== 'facture' ? (
                                                    <>
                                                      <input
                                                        type="date"
                                                        value={line.eta ? line.eta.slice(0, 10) : ''}
                                                        disabled={busyLines.has(line.id)}
                                                        onChange={e => updateLineEta(line.id, e.target.value)}
                                                        className="h-7 rounded-lg border border-slate-200 px-1.5 text-[10px] outline-none focus:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                                      />
                                                      {line.eta_updated_at && (
                                                        <div className="text-[9px] text-slate-400 mt-0.5">maj {fmtDate(line.eta_updated_at)}</div>
                                                      )}
                                                    </>
                                                  ) : (
                                                    <span className="text-[10px] text-green-600 font-semibold">✓ Facturé</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {line.warranty_months ? (
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                      {line.warranty_months} mois
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {line.license_months ? (
                                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                                      {line.license_months} mois
                                                    </span>
                                                  ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2">
                                                  <LineNoteCell lineId={line.id} note={line.status_note} onSave={updateLineNote} />
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Quick facturer button in expanded view */}
                                    {canFact && (
                                      <div className="mt-3 flex justify-end">
                                        <button onClick={() => setFactureOrder(order)}
                                          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm">
                                          <FileText className="h-3.5 w-3.5" /> Facturer les lignes livrées
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Facturation Modal */}
      {factureOrder && (
        <FacturationModal
          order={factureOrder}
          lines={factureOrder.opportunities?.purchase_info?.[0]?.purchase_lines || []}
          paymentTerms={factureOrder.opportunities?.purchase_info?.[0]?.payment_terms || null}
          userEmail={userEmail}
          onClose={() => setFactureOrder(null)}
          onSaved={() => { setFactureOrder(null); showToast('Facture créée avec succès !'); load() }}
        />
      )}

      {purchaseDeal && (
        <PurchaseModal
          deal={purchaseDeal}
          onClose={() => setPurchaseDeal(null)}
          onSaved={() => { setPurchaseDeal(null); load() }}
        />
      )}

      {/* Email preview modal */}
      {emailHtml && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="presentation" onClick={() => setEmailHtml(null)} onKeyDown={e => { if (e.key === 'Escape') setEmailHtml(null) }}>
          <div className="relative w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl"
            role="dialog" aria-modal="true" aria-label="Aperçu email Supply"
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Aperçu email Supply</h3>
              </div>
              <button onClick={() => setEmailHtml(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Email preview */}
            <div className="flex-1 overflow-auto p-4">
              <iframe
                srcDoc={emailHtml}
                className="w-full rounded-xl border border-slate-200"
                style={{ minHeight: 400, height: '60vh' }}
                sandbox="allow-same-origin"
              />
            </div>
            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button onClick={copyEmailHtml}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                <Copy className="h-3.5 w-3.5" /> Copier HTML
              </button>
              <button onClick={() => {
                const subject = encodeURIComponent('Demande de commande')
                window.open(`mailto:${COMPUCOM_EMAILS.supply}?subject=${subject}`, '_blank')
              }}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir mailto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.ok ? 'success' : 'error'} onClose={() => setToast(null)} />}
    </div>
  )
}
