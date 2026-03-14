'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  mad, fmt, fmtDate, fmtDateTime, pct,
  INVOICE_STATUS_CFG, INVOICE_STATUS_ORDER,
  type InvoiceStatus, paymentTermLabel, ownerName, PAYMENT_TERMS,
} from '@/lib/utils'
import { buildInvoiceReminderEmail } from '@/lib/emailTemplates'
import {
  RefreshCw, Search, Plus, Download, FileText, AlertTriangle,
  Pencil, Trash2, Mail, ChevronRight, X, Copy, Check,
  DollarSign, Clock, Bell, CheckCircle2, TrendingUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceLine = {
  purchase_line_id: string
  purchase_lines?: {
    ref: string | null
    designation: string | null
    qty: number
    pt_vente: number
    fournisseur: string | null
  } | null
}

type Invoice = {
  id: string
  opportunity_id: string
  invoice_number: string
  amount: number
  issue_date: string
  due_date: string
  status: InvoiceStatus
  payment_terms: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
  invoice_lines?: InvoiceLine[]
  opportunities?: {
    id: string
    title: string
    amount: number
    accounts?: { name?: string } | null
    purchase_info?: { payment_terms?: string }[] | null
  } | null
}

type WonDeal = {
  id: string
  title: string
  amount: number
  accounts?: { name?: string } | null
  purchase_info?: { payment_terms?: string }[] | null
}

const STATUS_CONFIG = INVOICE_STATUS_CFG
const ALL_STATUSES = INVOICE_STATUS_ORDER
const MONTHS_FR = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const currentYear = new Date().getFullYear()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Filters
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'Toutes'>('Toutes')
  const [yearFilter, setYearFilter]     = useState(currentYear)

  // Modals
  const [showForm, setShowForm]       = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [showEmail, setShowEmail]     = useState<Invoice | null>(null)
  const [confirmDel, setConfirmDel]   = useState<Invoice | null>(null)
  const [deleting, setDeleting]       = useState(false)
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  // Overdue alert
  const [overdueAlert, setOverdueAlert] = useState<Invoice[]>([])

  useEffect(() => {
    document.title = 'Facturation \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    load()
  }, [])

  async function load() {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        opportunities (
          id, title, amount,
          accounts(name),
          purchase_info(payment_terms)
        ),
        invoice_lines (
          purchase_line_id,
          purchase_lines (ref, designation, qty, pt_vente, fournisseur)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) { setErr(error.message); setLoading(false); return }
    const rows = (data || []) as Invoice[]
    setInvoices(rows)

    // Check for overdue emise invoices
    const today = new Date().toISOString().slice(0, 10)
    const overdue = rows.filter(
      inv => inv.status === 'emise' && inv.due_date < today
    )
    setOverdueAlert(overdue)

    setLoading(false)
  }

  // ── Filtered ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      // Year filter
      const issueYear = inv.issue_date ? new Date(inv.issue_date).getFullYear() : null
      if (issueYear !== yearFilter) return false

      // Status filter
      if (statusFilter !== 'Toutes' && inv.status !== statusFilter) return false

      // Search
      if (q) {
        const num = (inv.invoice_number || '').toLowerCase()
        const deal = (inv.opportunities?.title || '').toLowerCase()
        const account = (inv.opportunities?.accounts?.name || '').toLowerCase()
        if (!num.includes(q) && !deal.includes(q) && !account.includes(q)) return false
      }

      return true
    })
  }, [invoices, search, statusFilter, yearFilter])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const yearInvoices = invoices.filter(inv => {
      const y = inv.issue_date ? new Date(inv.issue_date).getFullYear() : null
      return y === yearFilter
    })

    const totalFacture = yearInvoices.reduce((s, inv) => s + (inv.amount || 0), 0)
    const echues = yearInvoices.filter(inv => inv.status === 'echue')
    const relancees = yearInvoices.filter(inv => inv.status === 'relancee')
    const payees = yearInvoices.filter(inv => inv.status === 'payee')
    const payeeAmount = payees.reduce((s, inv) => s + (inv.amount || 0), 0)
    const tauxRecouvrement = totalFacture > 0 ? (payeeAmount / totalFacture) * 100 : 0

    return {
      totalFacture,
      echuesCount: echues.length,
      relanceesCount: relancees.length,
      payeesCount: payees.length,
      payeeAmount,
      tauxRecouvrement,
    }
  }, [invoices, yearFilter])

  // ── Chart data ──────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0')
      const ym = `${yearFilter}-${m}`
      return { month: MONTHS_FR[i], ym, facture: 0, paye: 0 }
    })

    invoices.forEach(inv => {
      if (!inv.issue_date) return
      const d = new Date(inv.issue_date)
      if (d.getFullYear() !== yearFilter) return
      const idx = d.getMonth()
      months[idx].facture += inv.amount || 0
      if (inv.status === 'payee') {
        months[idx].paye += inv.amount || 0
      }
    })

    return months
  }, [invoices, yearFilter])

  // ── Year options ────────────────────────────────────────────────────────────
  const yearOptions = useMemo(() => {
    const years = new Set<number>()
    years.add(currentYear)
    invoices.forEach(inv => {
      if (inv.issue_date) years.add(new Date(inv.issue_date).getFullYear())
    })
    return [...years].sort((a, b) => b - a)
  }, [invoices, currentYear])

  // ── Status change ───────────────────────────────────────────────────────────
  async function changeStatus(inv: Invoice, newStatus: InvoiceStatus) {
    const { error } = await supabase
      .from('invoices')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', inv.id)

    if (error) { alert(error.message); return }
    await logActivity({
      action_type: 'update',
      entity_type: 'invoice',
      entity_id: inv.id,
      entity_name: inv.invoice_number || '—',
      detail: `Statut: ${STATUS_CONFIG[inv.status]?.label || inv.status} -> ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
    })
    load()
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function deleteInvoice() {
    if (!confirmDel) return
    setDeleting(true)
    const { error } = await supabase.from('invoices').delete().eq('id', confirmDel.id)
    if (error) { alert(error.message); setDeleting(false); return }
    await logActivity({
      action_type: 'delete',
      entity_type: 'invoice',
      entity_id: confirmDel.id,
      entity_name: confirmDel.invoice_number || '—',
      detail: `${confirmDel.opportunities?.accounts?.name || ''} - ${mad(confirmDel.amount)}`,
    })
    setConfirmDel(null)
    setDeleting(false)
    load()
  }

  // ── Excel export ────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = filtered.reduce((s, inv) => s + (inv.amount || 0), 0)
      const statusMap = new Map<string, { count: number; amount: number }>()
      filtered.forEach(inv => {
        const label = STATUS_CONFIG[inv.status]?.label || inv.status
        const prev = statusMap.get(label) || { count: 0, amount: 0 }
        statusMap.set(label, { count: prev.count + 1, amount: prev.amount + (inv.amount || 0) })
      })

      const spec = {
        filename: `factures_${yearFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [{
          name: 'Factures',
          title: `Factures ${yearFilter} - ${filtered.length} factures - ${new Date().toLocaleDateString('fr-MA')}`,
          headers: [
            'N Facture', 'Deal', 'Client', 'Montant (MAD)', 'Date Emission',
            'Date Echeance', 'Statut', 'Modalites', 'Notes', 'Cree par',
          ],
          rows: filtered.map(inv => [
            inv.invoice_number || '—',
            inv.opportunities?.title || '—',
            inv.opportunities?.accounts?.name || '—',
            inv.amount || 0,
            inv.issue_date || '—',
            inv.due_date || '—',
            STATUS_CONFIG[inv.status]?.label || inv.status,
            paymentTermLabel(inv.payment_terms),
            inv.notes || '—',
            ownerName(inv.created_by),
          ]),
          totalsRow: ['TOTAL', `${filtered.length} factures`, '', totalAmt, '', '', '', '', '', ''],
          notes: `Total facture: ${mad(totalAmt)} - Paye: ${mad(kpis.payeeAmount)} - Recouvrement: ${kpis.tauxRecouvrement.toFixed(1)}%`,
        }],
        summary: {
          title: `Resume Facturation ${yearFilter} - ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total facture', value: totalAmt, detail: `${filtered.length} factures` },
            { label: 'Factures payees', value: kpis.payeeAmount, detail: `${kpis.payeesCount} factures` },
            { label: 'Taux de recouvrement', value: `${kpis.tauxRecouvrement.toFixed(1)}%`, detail: 'Paye / Total' },
            { label: 'Factures echues', value: kpis.echuesCount, detail: 'En attente de reglement' },
          ],
          breakdownTitle: 'Repartition par statut',
          breakdownHeaders: ['Statut', 'Montant (MAD)', 'Nb factures', '% du total'],
          breakdown: [...statusMap.entries()].map(([label, v]) => [
            label, v.amount, v.count, totalAmt > 0 ? `${Math.round(v.amount / totalAmt * 100)}%` : '0%',
          ]),
        },
      }

      const res = await authFetch('/api/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      })
      if (!res.ok) throw new Error('Export echoue')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = spec.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.message || 'Erreur export')
    } finally {
      setExporting(false)
    }
  }

  // ── Mark overdue ────────────────────────────────────────────────────────────
  async function markOverdueAsEchue() {
    for (const inv of overdueAlert) {
      await supabase
        .from('invoices')
        .update({ status: 'echue', updated_at: new Date().toISOString() })
        .eq('id', inv.id)
    }
    setOverdueAlert([])
    load()
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Facturation & Paiement</h1>
              <p className="text-xs text-slate-500">
                Suivi factures {yearFilter} &middot; {invoices.length} facture{invoices.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={exporting}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export...' : 'Excel'}
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => { setEditInvoice(null); setShowForm(true) }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Nouvelle facture
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />{err}
          </div>
        )}

        {/* ── Overdue alert ── */}
        {overdueAlert.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <div>
                  <div className="text-sm font-bold text-red-800">
                    {overdueAlert.length} facture{overdueAlert.length > 1 ? 's' : ''} emise{overdueAlert.length > 1 ? 's' : ''} depassee{overdueAlert.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-red-600">
                    Ces factures ont depasse leur date d'echeance. Voulez-vous les marquer comme &laquo; Echue &raquo; ?
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setOverdueAlert([])}
                  className="h-8 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
                  Ignorer
                </button>
                <button onClick={markOverdueAsEchue}
                  className="h-8 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 transition-colors">
                  Marquer echues
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-500">
              <DollarSign className="h-3.5 w-3.5" /> Total facture
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">{fmt(kpis.totalFacture)}</div>
            <div className="mt-0.5 text-xs text-slate-500">{mad(kpis.totalFacture)}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-500">
              <Clock className="h-3.5 w-3.5" /> Echues
            </div>
            <div className="mt-1 text-2xl font-black text-red-600">{kpis.echuesCount}</div>
            <div className="mt-0.5 text-xs text-slate-500">En retard de paiement</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-500">
              <Bell className="h-3.5 w-3.5" /> Relancees
            </div>
            <div className="mt-1 text-2xl font-black text-orange-600">{kpis.relanceesCount}</div>
            <div className="mt-0.5 text-xs text-slate-500">Client relance</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Payees
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-700">{kpis.payeesCount}</div>
            <div className="mt-0.5 text-xs text-slate-500">{mad(kpis.payeeAmount)}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-500">
              <TrendingUp className="h-3.5 w-3.5" /> Recouvrement
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {kpis.tauxRecouvrement.toFixed(1)} %
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Paye / Facture</div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="N facture, deal, client..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as InvoiceStatus | 'Toutes')}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            <option value="Toutes">Toutes</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span>{filtered.length} facture{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-slate-700">
              {mad(filtered.reduce((s, inv) => s + (inv.amount || 0), 0))}
            </span>
          </div>
        </div>

        {/* ── Chart ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-bold text-slate-800">
            Facture vs Paye - {yearFilter}
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
                  return String(v)
                }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    mad(Number(value) || 0),
                    name === 'facture' ? 'Facturé' : 'Payé',
                  ]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="facture" fill="#3b82f6" radius={[4, 4, 0, 0]} name="facture" />
                <Bar dataKey="paye" fill="#10b981" radius={[4, 4, 0, 0]} name="paye" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="mb-3 h-10 w-10 text-slate-300" />
              <div className="text-sm font-semibold text-slate-500">Aucune facture</div>
              <div className="mt-1 text-xs text-slate-400">Cliquez sur &laquo; Nouvelle facture &raquo; pour commencer.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">N Facture</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Deal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Client</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400">Montant</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400">Lignes</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Emission</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Echeance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Statut</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(inv => {
                    const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.emise
                    const nextStatus = cfg.next
                    const today = new Date().toISOString().slice(0, 10)
                    const isOverdue = inv.due_date < today && inv.status !== 'payee'
                    const daysOverdue = isOverdue
                      ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
                      : 0
                    const lines = inv.invoice_lines || []
                    const isExpanded = expandedId === inv.id

                    return (
                      <React.Fragment key={inv.id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isOverdue ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 text-xs">{inv.invoice_number || '—'}</div>
                          {inv.payment_terms && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{paymentTermLabel(inv.payment_terms)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-slate-700 max-w-[180px] truncate" title={inv.opportunities?.title}>
                            {inv.opportunities?.title || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-slate-900 max-w-[150px] truncate">
                            {inv.opportunities?.accounts?.name || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums text-xs whitespace-nowrap">
                          {mad(inv.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lines.length > 0 ? (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${
                                isExpanded
                                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
                              }`}
                              title="Voir les lignes facturées"
                            >
                              <FileText className="h-3 w-3" />
                              {lines.length}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {fmtDate(inv.issue_date)}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">
                          <span className={isOverdue ? 'font-bold text-red-600' : 'text-slate-600'}>
                            {fmtDate(inv.due_date)}
                          </span>
                          {isOverdue && daysOverdue > 0 && (
                            <span className="ml-1 text-[10px] font-bold text-red-500">
                              +{daysOverdue}j
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* Edit */}
                            <button onClick={() => { setEditInvoice(inv); setShowForm(true) }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-amber-600 transition-colors"
                              title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            {/* Advance status */}
                            {nextStatus && (
                              <button onClick={() => changeStatus(inv, nextStatus)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                                title={`Passer a ${STATUS_CONFIG[nextStatus]?.label || nextStatus}`}>
                                <ChevronRight className="h-3 w-3" />
                                {STATUS_CONFIG[nextStatus]?.label || nextStatus}
                              </button>
                            )}

                            {/* Reminder email */}
                            {(inv.status === 'echue' || inv.status === 'relancee') && (
                              <button onClick={() => setShowEmail(inv)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors"
                                title="Relancer">
                                <Mail className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Delete */}
                            <button onClick={() => setConfirmDel(inv)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                              title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable row: invoice lines detail */}
                      {isExpanded && lines.length > 0 && (
                        <tr className="bg-blue-50/40">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="rounded-xl bg-white border border-blue-100 overflow-hidden">
                              <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100">
                                <span className="text-[11px] font-bold text-blue-700">Lignes facturées ({lines.length})</span>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100">
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-400">Ref</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-400">Designation</th>
                                    <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-slate-400">Qte</th>
                                    <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-slate-400">Pt Vente</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-400">Fournisseur</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {lines.map((ln, i) => {
                                    const pl = ln.purchase_lines
                                    return (
                                      <tr key={ln.purchase_line_id || i} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">{pl?.ref || '—'}</td>
                                        <td className="px-3 py-1.5 text-[11px] text-slate-600 max-w-[250px] truncate">{pl?.designation || '—'}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-[11px] font-semibold text-slate-800">{pl?.qty ?? '—'}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-[11px] font-semibold text-slate-800">{pl?.pt_vente ? mad(pl.pt_vente) : '—'}</td>
                                        <td className="px-3 py-1.5 text-[11px] text-slate-500">{pl?.fournisseur || '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-400">
              <span>{filtered.length} facture{filtered.length > 1 ? 's' : ''}</span>
              <span className="font-semibold text-slate-700">
                Total : {mad(filtered.reduce((s, inv) => s + (inv.amount || 0), 0))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <InvoiceFormModal
          invoice={editInvoice}
          userEmail={userEmail}
          onClose={() => { setShowForm(false); setEditInvoice(null) }}
          onSaved={() => { setShowForm(false); setEditInvoice(null); load() }}
        />
      )}

      {/* ── Email Preview Modal ── */}
      {showEmail && (
        <EmailPreviewModal
          invoice={showEmail}
          userEmail={userEmail}
          onClose={() => setShowEmail(null)}
          onStatusUpdate={() => { setShowEmail(null); load() }}
        />
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') setConfirmDel(null) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" role="alertdialog" aria-modal="true" aria-label="Confirmer la suppression de la facture">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Supprimer cette facture ?</div>
                  <div className="text-xs text-slate-500">Cette action est irreversible.</div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 mb-4">
                <div className="text-xs font-bold text-slate-800 truncate">{confirmDel.invoice_number}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {confirmDel.opportunities?.accounts?.name || '—'} &middot; {mad(confirmDel.amount)}
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setConfirmDel(null)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button onClick={deleteInvoice} disabled={deleting}
                  className="h-9 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60">
                  {deleting ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// InvoiceFormModal
// ═══════════════════════════════════════════════════════════════════════════════

function InvoiceFormModal({
  invoice, userEmail, onClose, onSaved,
}: {
  invoice: Invoice | null
  userEmail: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!invoice

  // Won deals for selection
  const [wonDeals, setWonDeals]     = useState<WonDeal[]>([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [dealSearch, setDealSearch] = useState('')

  // Form fields
  const [selectedDealId, setSelectedDealId] = useState(invoice?.opportunity_id || '')
  const [invoiceNumber, setInvoiceNumber]   = useState(invoice?.invoice_number || '')
  const [amount, setAmount]                 = useState<number | ''>(invoice?.amount ?? '')
  const [issueDate, setIssueDate]           = useState(invoice?.issue_date || new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate]               = useState(invoice?.due_date || (() => {
    // Default due date: issue date + 30 days
    const d = new Date(); d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })())
  const [paymentTerms, setPaymentTerms]     = useState(invoice?.payment_terms || '')
  const [notes, setNotes]                   = useState(invoice?.notes || '')
  const [saving, setSaving]                 = useState(false)

  // Auto-generate invoice number for new invoices
  useEffect(() => {
    if (isEdit) return
    async function generateNumber() {
      try {
        const year = new Date().getFullYear()
        const { count } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
        const next = (count ?? 0) + 1
        setInvoiceNumber(`FAC-${year}-${String(next).padStart(3, '0')}`)
      } catch (e) {
        console.error('[invoices] generateNumber error:', e)
        setInvoiceNumber(`FAC-${new Date().getFullYear()}-001`)
      }
    }
    generateNumber()
  }, [isEdit])

  // Derived client name
  const selectedDeal = useMemo(() => wonDeals.find(d => d.id === selectedDealId), [wonDeals, selectedDealId])
  const clientName = selectedDeal?.accounts?.name || invoice?.opportunities?.accounts?.name || ''

  useEffect(() => {
    loadDeals()
  }, [])

  async function loadDeals() {
    setDealsLoading(true)
    const { data } = await supabase
      .from('opportunities')
      .select('id, title, amount, accounts(name), purchase_info(payment_terms)')
      .eq('status', 'Won')
      .order('title', { ascending: true })
      .limit(500)
    setWonDeals((data || []) as WonDeal[])
    setDealsLoading(false)
  }

  // Auto-fill payment terms when deal changes
  useEffect(() => {
    if (!isEdit && selectedDeal) {
      const dealPaymentTerms = selectedDeal.purchase_info?.[0]?.payment_terms
      if (dealPaymentTerms) setPaymentTerms(dealPaymentTerms)
    }
  }, [selectedDealId, selectedDeal, isEdit])

  const filteredDeals = useMemo(() => {
    if (!dealSearch.trim()) return wonDeals
    const q = dealSearch.toLowerCase()
    return wonDeals.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.accounts?.name || '').toLowerCase().includes(q)
    )
  }, [wonDeals, dealSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDealId || !invoiceNumber.trim() || !amount || Number(amount) <= 0 || !issueDate || !dueDate) {
      alert('Veuillez remplir tous les champs obligatoires (montant > 0).')
      return
    }

    setSaving(true)
    try {
      const payload = {
        opportunity_id: selectedDealId,
        invoice_number: invoiceNumber.trim(),
        amount,
        issue_date: issueDate,
        due_date: dueDate,
        payment_terms: paymentTerms || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (isEdit && invoice) {
        const { error } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', invoice.id)
        if (error) throw error

        await logActivity({
          action_type: 'update',
          entity_type: 'invoice',
          entity_id: invoice.id,
          entity_name: invoiceNumber,
          detail: `${clientName} - ${mad(amount)}`,
        })
      } else {
        const { error } = await supabase
          .from('invoices')
          .insert({
            ...payload,
            status: 'emise' as InvoiceStatus,
            created_by: userEmail,
          })
        if (error) throw error

        await logActivity({
          action_type: 'create',
          entity_type: 'invoice',
          entity_name: invoiceNumber,
          detail: `${clientName} - ${mad(amount)}`,
        })
      }

      onSaved()
    } catch (e: any) {
      alert(e?.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={isEdit ? 'Modifier la facture' : 'Nouvelle facture'}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                {isEdit ? 'Modifier la facture' : 'Nouvelle facture'}
              </div>
              <div className="text-xs text-slate-500">
                {isEdit ? invoice?.invoice_number : 'Creer une facture depuis un deal Won'}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Deal selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Deal (Won) <span className="text-red-500">*</span>
            </label>
            {dealsLoading ? (
              <div className="text-xs text-slate-400">Chargement des deals...</div>
            ) : (
              <>
                <input
                  value={dealSearch}
                  onChange={e => setDealSearch(e.target.value)}
                  placeholder="Rechercher un deal..."
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 mb-2"
                />
                <select value={selectedDealId} onChange={e => setSelectedDealId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  required>
                  <option value="">-- Selectionner un deal --</option>
                  {filteredDeals.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.accounts?.name || '—'}) - {mad(d.amount)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Client (auto) */}
          {clientName && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Client</div>
              <div className="text-sm font-semibold text-slate-800">{clientName}</div>
            </div>
          )}

          {/* Invoice number */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              N Facture <span className="text-red-500">*</span>
            </label>
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="FAC-2026-001"
              className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              required />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Montant (MAD) <span className="text-red-500">*</span>
            </label>
            <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))}
              placeholder="0"
              className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              required min={0} step={0.01} />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Date d'emission <span className="text-red-500">*</span>
              </label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Date d'echeance <span className="text-red-500">*</span>
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                required />
            </div>
          </div>

          {/* Payment terms */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Modalites de paiement</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
              className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="">-- Choisir --</option>
              {PAYMENT_TERMS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Notes optionnelles..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 justify-end">
            <button type="button" onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60">
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre a jour' : 'Creer la facture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EmailPreviewModal
// ═══════════════════════════════════════════════════════════════════════════════

function EmailPreviewModal({
  invoice, userEmail, onClose, onStatusUpdate,
}: {
  invoice: Invoice
  userEmail: string | null
  onClose: () => void
  onStatusUpdate: () => void
}) {
  const [copied, setCopied] = useState(false)

  const daysOverdue = Math.max(0, Math.floor(
    (Date.now() - new Date(invoice.due_date).getTime()) / 86400000
  ))

  const senderName = ownerName(userEmail)

  const emailHtml = buildInvoiceReminderEmail({
    invoiceNumber: invoice.invoice_number,
    dealTitle: invoice.opportunities?.title || '—',
    accountName: invoice.opportunities?.accounts?.name || '—',
    amount: invoice.amount,
    issueDate: fmtDate(invoice.issue_date),
    dueDate: fmtDate(invoice.due_date),
    paymentTerms: paymentTermLabel(invoice.payment_terms),
    daysOverdue,
    senderName,
  })

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(emailHtml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the iframe content
      const el = document.createElement('textarea')
      el.value = emailHtml
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function markAsRelancee() {
    if (invoice.status !== 'relancee') {
      await supabase
        .from('invoices')
        .update({ status: 'relancee', updated_at: new Date().toISOString() })
        .eq('id', invoice.id)

      await logActivity({
        action_type: 'update',
        entity_type: 'invoice',
        entity_id: invoice.id,
        entity_name: invoice.invoice_number,
        detail: `Relance envoyee - ${invoice.opportunities?.accounts?.name || ''}`,
      })
    }
    onStatusUpdate()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col" role="dialog" aria-modal="true" aria-label="Email de relance facture">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Email de relance</div>
              <div className="text-xs text-slate-500">
                {invoice.invoice_number} &middot; {invoice.opportunities?.accounts?.name || '—'} &middot; {daysOverdue}j de retard
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600 shrink-0">
          <div>
            <span className="text-slate-400">Destinataire :</span>{' '}
            <span className="font-semibold">{invoice.opportunities?.accounts?.name || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400">Montant :</span>{' '}
            <span className="font-bold text-red-600">{mad(invoice.amount)}</span>
          </div>
          <div>
            <span className="text-slate-400">Echeance :</span>{' '}
            <span className="font-bold text-red-600">{fmtDate(invoice.due_date)}</span>
          </div>
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-auto p-4">
          <iframe
            srcDoc={emailHtml}
            className="w-full h-[400px] rounded-xl border border-slate-200"
            title="Email preview"
            sandbox=""
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
          <button onClick={copyEmail}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors
              ${copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copie !' : 'Copier HTML'}
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Fermer
          </button>
          <button onClick={markAsRelancee}
            className="h-9 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 transition-colors">
            Marquer comme relancee
          </button>
        </div>
      </div>
    </div>
  )
}
