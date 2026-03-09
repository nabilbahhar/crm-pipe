'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  mad, madFull, fmt, fmtDate,
  EXPENSE_STATUS_CFG, type ExpenseStatus,
  isAE, ownerName, COMPUCOM_EMAILS,
} from '@/lib/utils'
import { buildExpenseEmail } from '@/lib/emailTemplates'
import {
  RefreshCw, Plus, Download, Search, Pencil, Eye, X,
  Check, Copy, ExternalLink, Trash2, Upload, FileText,
  Receipt, ChevronDown, Paperclip,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type ExpenseLine = {
  id?: string
  expense_report_id?: string
  date: string
  description: string
  amount_ttc: number
  file_name: string | null
  file_url: string | null
  sort_order: number
  _tempId?: string          // local-only identifier for new lines
  _uploading?: boolean      // upload in progress
}

type ExpenseReport = {
  id: string
  user_email: string
  month: number
  year: number
  status: ExpenseStatus
  total_ttc: number
  submitted_at: string | null
  notes: string | null
  created_at: string
  expense_lines?: ExpenseLine[]
}

const MONTH_NAMES = [
  'Janvier','Fevrier','Mars','Avril','Mai','Juin',
  'Juillet','Aout','Septembre','Octobre','Novembre','Decembre',
]

const STATUS_FLOW: Record<ExpenseStatus, ExpenseStatus | null> = {
  brouillon: 'soumise',
  soumise: 'remboursee',
  remboursee: 'encaissee',
  encaissee: null,
}

// ─── Main Page ───────────────────────────────────────────────
export default function ExpensesPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userChecked, setUserChecked] = useState(false)
  const [reports, setReports]     = useState<ExpenseReport[]>([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  // Form state
  const [mode, setMode]           = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<string | null>(null) // null = new
  const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1)
  const [formYear, setFormYear]   = useState(new Date().getFullYear())
  const [formLines, setFormLines] = useState<ExpenseLine[]>([])
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving]       = useState(false)

  // Email preview
  const [emailModal, setEmailModal] = useState<{ html: string; subject: string } | null>(null)
  const [copied, setCopied]         = useState(false)

  // View modal
  const [viewReport, setViewReport] = useState<ExpenseReport | null>(null)

  // Status dropdown
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null)

  // Search
  const [search, setSearch] = useState('')

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    document.title = 'Notes de frais \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email ?? null
      setUserEmail(email)
      setUserChecked(true)
      if (email && isAE(email)) load(email)
      else setLoading(false)
    })
  }, [])

  async function load(email?: string) {
    setLoading(true); setErr(null)
    const mail = email || userEmail
    if (!mail) { setLoading(false); return }

    const { data, error } = await supabase
      .from('expense_reports')
      .select('*, expense_lines(*)')
      .eq('user_email', mail)
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (error) { setErr(error.message); setLoading(false); return }
    setReports((data || []) as ExpenseReport[])
    setLoading(false)
  }

  // ── AE-only guard ─────────────────────────────────────────
  if (userChecked && !isAE(userEmail)) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="mx-auto max-w-[1500px] px-4 py-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <Receipt className="mb-4 h-12 w-12 text-slate-300" />
            <div className="text-lg font-bold text-slate-700">Acces restreint</div>
            <div className="mt-2 text-sm text-slate-500">Cette page est reservee aux Account Executives.</div>
          </div>
        </div>
      </div>
    )
  }

  // ── KPI computations ──────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const yearReports = reports.filter(r => r.year === currentYear)

  const totalAnnuel   = yearReports.reduce((s, r) => s + (r.total_ttc || 0), 0)
  const notesSoumises = yearReports.filter(r => r.status !== 'brouillon').length
  const enAttente     = yearReports.filter(r => r.status === 'soumise').length
  const remboursees   = yearReports.filter(r => r.status === 'remboursee' || r.status === 'encaissee').length

  const kpis = [
    { label: 'Total annuel', value: madFull(totalAnnuel), sub: `${currentYear}`, color: 'text-slate-900' },
    { label: 'Notes soumises', value: String(notesSoumises), sub: 'hors brouillons', color: 'text-blue-700' },
    { label: 'En attente', value: String(enAttente), sub: 'remboursement', color: 'text-amber-700' },
    { label: 'Remboursees', value: String(remboursees), sub: 'encaissees', color: 'text-emerald-700' },
  ]

  // ── Filtered reports ──────────────────────────────────────
  const filtered = reports.filter(r => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const period = `${MONTH_NAMES[r.month - 1]} ${r.year}`.toLowerCase()
    const statusLabel = EXPENSE_STATUS_CFG[r.status]?.label?.toLowerCase() || ''
    return period.includes(q) || statusLabel.includes(q) || (r.notes || '').toLowerCase().includes(q)
  })

  // ── Form helpers ──────────────────────────────────────────
  function openNewForm() {
    setEditingId(null)
    setFormMonth(new Date().getMonth() + 1)
    setFormYear(new Date().getFullYear())
    setFormLines([emptyLine(0)])
    setFormNotes('')
    setMode('form')
  }

  function openEditForm(report: ExpenseReport) {
    setEditingId(report.id)
    setFormMonth(report.month)
    setFormYear(report.year)
    setFormLines(
      (report.expense_lines || [])
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((l, i) => ({ ...l, _tempId: `existing-${l.id}`, sort_order: i }))
    )
    setFormNotes(report.notes || '')
    setMode('form')
  }

  function emptyLine(order: number): ExpenseLine {
    return {
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount_ttc: 0,
      file_name: null,
      file_url: null,
      sort_order: order,
      _tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
  }

  function updateLine(idx: number, patch: Partial<ExpenseLine>) {
    setFormLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function removeLine(idx: number) {
    setFormLines(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, sort_order: i })))
  }

  function addLine() {
    setFormLines(prev => [...prev, emptyLine(prev.length)])
  }

  const formTotal = formLines.reduce((s, l) => s + (Number(l.amount_ttc) || 0), 0)

  // ── File upload ───────────────────────────────────────────
  async function handleFileUpload(idx: number, file: File, reportId: string) {
    updateLine(idx, { _uploading: true })

    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')
    const path = `expenses/${reportId}/${Date.now()}_${safeName}`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', 'expense-files')
    formData.append('path', path)

    try {
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok || result.error) {
        showToast(`Erreur upload : ${result.error || 'Upload echoue'}`)
        updateLine(idx, { _uploading: false })
        return
      }

      updateLine(idx, {
        file_name: file.name,
        file_url: result.path,
        _uploading: false,
      })
      showToast(`PJ ajoutee : ${file.name}`)
    } catch (e: any) {
      showToast(`Erreur upload : ${e?.message || 'inconnue'}`)
      updateLine(idx, { _uploading: false })
    }
  }

  // ── Save / Submit ─────────────────────────────────────────
  async function saveReport(asStatus: ExpenseStatus) {
    if (!userEmail) return
    setSaving(true)

    try {
      const total = formLines.reduce((s, l) => s + (Number(l.amount_ttc) || 0), 0)

      let reportId = editingId

      if (reportId) {
        // Update existing report
        const { error } = await supabase.from('expense_reports').update({
          month: formMonth,
          year: formYear,
          status: asStatus,
          total_ttc: total,
          notes: formNotes || null,
          submitted_at: asStatus === 'soumise' ? new Date().toISOString() : undefined,
        }).eq('id', reportId)

        if (error) throw new Error(error.message)

        // Delete old lines and re-insert
        await supabase.from('expense_lines').delete().eq('expense_report_id', reportId)
      } else {
        // Create new report
        const { data, error } = await supabase.from('expense_reports').insert({
          user_email: userEmail,
          month: formMonth,
          year: formYear,
          status: asStatus,
          total_ttc: total,
          notes: formNotes || null,
          submitted_at: asStatus === 'soumise' ? new Date().toISOString() : null,
        }).select('id').single()

        if (error || !data) throw new Error(error?.message || 'Erreur creation')
        reportId = data.id

        await logActivity({
          action_type: 'create',
          entity_type: 'expense' as any,
          entity_name: `Note ${formMonth}/${formYear}`,
        })
      }

      // Insert lines
      if (formLines.length > 0 && reportId) {
        const linesToInsert = formLines.map((l, i) => ({
          expense_report_id: reportId!,
          date: l.date,
          description: l.description,
          amount_ttc: Number(l.amount_ttc) || 0,
          file_name: l.file_name,
          file_url: l.file_url,
          sort_order: i,
        }))

        const { error: lineErr } = await supabase.from('expense_lines').insert(linesToInsert)
        if (lineErr) throw new Error(lineErr.message)
      }

      if (asStatus === 'soumise') {
        await logActivity({
          action_type: 'update',
          entity_type: 'expense' as any,
          entity_name: `Note ${formMonth}/${formYear}`,
          detail: 'Soumise',
        })

        // Show email preview
        const emailHtml = buildExpenseEmail({
          month: formMonth,
          year: formYear,
          lines: formLines.map(l => ({
            date: fmtDate(l.date),
            description: l.description,
            amount: Number(l.amount_ttc) || 0,
          })),
          total,
          senderName: ownerName(userEmail),
        })
        const subject = `Note de frais ${MONTH_NAMES[formMonth - 1]} ${formYear} - ${ownerName(userEmail)}`
        setEmailModal({ html: emailHtml, subject })
      }

      showToast(asStatus === 'soumise' ? 'Note soumise avec succes' : 'Note enregistree')
      setMode('list')
      await load()
    } catch (e: any) {
      setErr(e?.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // ── Status change ─────────────────────────────────────────
  async function changeStatus(report: ExpenseReport, newStatus: ExpenseStatus) {
    const { error } = await supabase.from('expense_reports').update({
      status: newStatus,
      submitted_at: newStatus === 'soumise' ? new Date().toISOString() : report.submitted_at,
    }).eq('id', report.id)

    if (error) { showToast(`Erreur : ${error.message}`); return }

    await logActivity({
      action_type: 'update',
      entity_type: 'expense' as any,
      entity_name: `Note ${report.month}/${report.year}`,
      detail: EXPENSE_STATUS_CFG[newStatus].label,
    })

    setStatusDropdown(null)
    showToast(`Statut mis a jour : ${EXPENSE_STATUS_CFG[newStatus].label}`)
    await load()
  }

  // ── Delete report ─────────────────────────────────────────
  async function deleteReport(report: ExpenseReport) {
    if (!confirm(`Supprimer la note de ${MONTH_NAMES[report.month - 1]} ${report.year} ?`)) return

    // Delete lines first
    await supabase.from('expense_lines').delete().eq('expense_report_id', report.id)
    const { error } = await supabase.from('expense_reports').delete().eq('id', report.id)
    if (error) { showToast(`Erreur : ${error.message}`); return }

    showToast('Note supprimee')
    await load()
  }

  // ── Excel export ──────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = filtered.reduce((s, r) => s + (r.total_ttc || 0), 0)

      const statusMap = new Map<string, { count: number; amount: number }>()
      filtered.forEach(r => {
        const label = EXPENSE_STATUS_CFG[r.status]?.label || r.status
        const prev = statusMap.get(label) || { count: 0, amount: 0 }
        statusMap.set(label, { count: prev.count + 1, amount: prev.amount + (r.total_ttc || 0) })
      })

      // Flatten all lines for detail sheet
      const allLines: any[][] = []
      for (const r of filtered) {
        const period = `${MONTH_NAMES[r.month - 1]} ${r.year}`
        const lines = (r.expense_lines || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        for (const l of lines) {
          allLines.push([
            period,
            fmtDate(l.date),
            l.description || '—',
            l.amount_ttc || 0,
            l.file_name || '—',
            EXPENSE_STATUS_CFG[r.status]?.label || r.status,
          ])
        }
      }

      const spec = {
        filename: `notes_frais_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [
          {
            name: 'Notes de frais',
            title: `Notes de frais - ${ownerName(userEmail)} - ${new Date().toLocaleDateString('fr-MA')}`,
            headers: ['Periode', 'Nb lignes', 'Total TTC (MAD)', 'Statut', 'Notes'],
            rows: filtered.map(r => [
              `${MONTH_NAMES[r.month - 1]} ${r.year}`,
              (r.expense_lines || []).length,
              r.total_ttc || 0,
              EXPENSE_STATUS_CFG[r.status]?.label || r.status,
              r.notes || '—',
            ]),
            totalsRow: ['TOTAL', `${filtered.length} notes`, totalAmt, '', ''],
            notes: `Total : ${madFull(totalAmt)}`,
          },
          {
            name: 'Detail lignes',
            title: `Detail des depenses - ${ownerName(userEmail)}`,
            headers: ['Periode', 'Date', 'Detail depense', 'Montant TTC (MAD)', 'PJ', 'Statut'],
            rows: allLines,
            totalsRow: ['', '', 'TOTAL', totalAmt, '', ''],
          },
        ],
        summary: {
          title: `Resume Notes de frais - ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total notes', value: filtered.length, detail: `Montant total : ${madFull(totalAmt)}` },
            { label: 'Brouillons', value: filtered.filter(r => r.status === 'brouillon').length, detail: 'Non soumises' },
            { label: 'Soumises', value: filtered.filter(r => r.status === 'soumise').length, detail: 'En attente remboursement' },
            { label: 'Remboursees', value: filtered.filter(r => r.status === 'remboursee' || r.status === 'encaissee').length, detail: 'Traitees' },
          ],
          breakdownTitle: 'Repartition par statut',
          breakdownHeaders: ['Statut', 'Montant (MAD)', 'Nb notes', '% du total'],
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
      const a = document.createElement('a'); a.href = url; a.download = spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.message || 'Erreur export')
    } finally {
      setExporting(false)
    }
  }

  // ── Toast helper ──────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Email copy ────────────────────────────────────────────
  async function copyEmailHtml() {
    if (!emailModal) return
    try {
      const blob = new Blob([emailModal.html], { type: 'text/html' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': new Blob([emailModal.html], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(emailModal.html).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── View report email preview ─────────────────────────────
  function previewEmail(report: ExpenseReport) {
    const lines = (report.expense_lines || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const html = buildExpenseEmail({
      month: report.month,
      year: report.year,
      lines: lines.map(l => ({
        date: fmtDate(l.date),
        description: l.description,
        amount: Number(l.amount_ttc) || 0,
      })),
      total: report.total_ttc,
      senderName: ownerName(userEmail),
    })
    const subject = `Note de frais ${MONTH_NAMES[report.month - 1]} ${report.year} - ${ownerName(userEmail)}`
    setEmailModal({ html, subject })
  }

  // ── Input class ───────────────────────────────────────────
  const inp = 'w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50 transition placeholder:text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Notes de frais</h1>
              <p className="text-xs text-slate-500">
                Suivi depenses &middot; {reports.length} note{reports.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {mode === 'list' && (
              <>
                <button onClick={openNewForm}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-sm">
                  <Plus className="h-4 w-4" /> Nouvelle note
                </button>
                <button onClick={exportExcel} title="Export Excel" disabled={exporting || filtered.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
                  <Download className="h-4 w-4" />
                </button>
              </>
            )}
            {mode === 'form' && (
              <button onClick={() => setMode('list')}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <X className="h-4 w-4" /> Annuler
              </button>
            )}
            <button onClick={() => load()} disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{k.label}</div>
              <div className={`mt-1 text-2xl font-black ${k.color}`}>{k.value}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ═══════════════════ FORM VIEW ═══════════════════ */}
        {mode === 'form' && (
          <div className="space-y-4">
            {/* Period selectors */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-400" />
                <h2 className="text-base font-bold text-slate-900">
                  {editingId ? 'Modifier la note' : 'Nouvelle note de frais'}
                </h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Mois</label>
                  <select value={formMonth} onChange={e => setFormMonth(Number(e.target.value))}
                    className="h-9 rounded-xl border bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none">
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Annee</label>
                  <select value={formYear} onChange={e => setFormYear(Number(e.target.value))}
                    className="h-9 rounded-xl border bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none">
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expense lines table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                      <th className="px-3 py-2.5 text-left w-[140px]">Date</th>
                      <th className="px-3 py-2.5 text-left">Detail depense</th>
                      <th className="px-3 py-2.5 text-right w-[140px]">Montant TTC</th>
                      <th className="px-3 py-2.5 text-center w-[120px]">PJ</th>
                      <th className="px-3 py-2.5 text-center w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {formLines.map((line, idx) => {
                      const lineKey = line._tempId || line.id || `line-${idx}`
                      return (
                        <tr key={lineKey} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-3 py-2">
                            <input type="date" value={line.date}
                              onChange={e => updateLine(idx, { date: e.target.value })}
                              className={inp} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={line.description}
                              onChange={e => updateLine(idx, { description: e.target.value })}
                              placeholder="Description de la depense..."
                              className={inp} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={line.amount_ttc || ''}
                              onChange={e => updateLine(idx, { amount_ttc: Number(e.target.value) || 0 })}
                              placeholder="0.00"
                              step="0.01" min="0"
                              className={`${inp} text-right font-semibold`} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {line.file_name ? (
                              <div className="flex items-center justify-center gap-1">
                                <Paperclip className="h-3 w-3 text-blue-500 shrink-0" />
                                <span className="text-[10px] text-blue-600 font-semibold truncate max-w-[80px]" title={line.file_name}>
                                  {line.file_name}
                                </span>
                                <button onClick={() => updateLine(idx, { file_name: null, file_url: null })}
                                  className="text-slate-300 hover:text-red-500 transition-colors">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : line._uploading ? (
                              <span className="text-[10px] text-slate-400">Upload...</span>
                            ) : (
                              <>
                                <input type="file" ref={el => { fileRefs.current[lineKey] = el }}
                                  className="hidden"
                                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.csv,.pptx,.ppt"
                                  onChange={e => {
                                    const f = e.target.files?.[0]
                                    if (!f) return
                                    // Need a report ID for upload path. If editing, use that ID.
                                    // If new, we upload after first save. For now, queue upload.
                                    if (editingId) {
                                      handleFileUpload(idx, f, editingId)
                                    } else {
                                      // Store file reference for post-save upload
                                      // For new reports, we save as draft first then upload
                                      showToast('Enregistrez d\'abord la note pour ajouter des PJ')
                                    }
                                    e.target.value = ''
                                  }} />
                                <button onClick={() => fileRefs.current[lineKey]?.click()}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                                  <Upload className="h-3 w-3" /> PJ
                                </button>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {formLines.length > 1 && (
                              <button onClick={() => removeLine(idx)}
                                className="text-slate-300 hover:text-red-500 transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                      <td colSpan={2} className="px-3 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Total TTC
                      </td>
                      <td className="px-3 py-3 text-right text-lg font-black text-slate-900">
                        {madFull(formTotal)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <button onClick={addLine}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
              </button>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Notes (optionnel)</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)}
                  placeholder="Commentaires, precisions..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50 transition placeholder:text-slate-300 resize-none" />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button onClick={() => saveReport('brouillon')} disabled={saving || formLines.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-600 px-5 text-sm font-bold text-white hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-sm">
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Enregistrer
                </button>
                <button onClick={() => saveReport('soumise')}
                  disabled={saving || formLines.length === 0 || formLines.every(l => !l.description.trim())}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm">
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Soumettre la note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ LIST VIEW ═══════════════════ */}
        {mode === 'list' && (
          <>
            {/* Search bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher par periode, statut..."
                  className="w-52 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </div>
              <div className="ml-auto text-xs text-slate-400">
                {filtered.length} note{filtered.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                <Receipt className="mb-3 h-10 w-10 text-slate-300" />
                <div className="text-sm font-semibold text-slate-500">Aucune note de frais</div>
                <div className="mt-1 text-xs text-slate-400">Cliquez sur "Nouvelle note" pour commencer.</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                        <th className="px-5 py-3 text-left">Periode</th>
                        <th className="px-5 py-3 text-center">Lignes</th>
                        <th className="px-5 py-3 text-right">Total TTC</th>
                        <th className="px-5 py-3 text-center">Statut</th>
                        <th className="px-5 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map(report => {
                        const cfg = EXPENSE_STATUS_CFG[report.status]
                        const lineCount = (report.expense_lines || []).length
                        const nextStatus = STATUS_FLOW[report.status]

                        return (
                          <tr key={report.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3">
                              <div className="font-bold text-slate-900">
                                {MONTH_NAMES[report.month - 1]} {report.year}
                              </div>
                              {report.submitted_at && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Soumise le {fmtDate(report.submitted_at)}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {lineCount}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-slate-900">
                              {madFull(report.total_ttc)}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.color}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}></span>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Edit (only brouillon) */}
                                {report.status === 'brouillon' && (
                                  <button onClick={() => openEditForm(report)} title="Modifier"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {/* View */}
                                <button onClick={() => setViewReport(report)} title="Voir"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>

                                {/* Email preview (soumise+) */}
                                {report.status !== 'brouillon' && (
                                  <button onClick={() => previewEmail(report)} title="Apercu email"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-100 hover:text-blue-600 transition-colors">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {/* Status change */}
                                {nextStatus && (
                                  <div className="relative">
                                    <button onClick={() => setStatusDropdown(statusDropdown === report.id ? null : report.id)}
                                      title="Changer statut"
                                      className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                                      <ChevronDown className="h-3 w-3" />
                                    </button>
                                    {statusDropdown === report.id && (
                                      <>
                                        <div className="fixed inset-0 z-[150]" onClick={() => setStatusDropdown(null)} />
                                        <div className="absolute right-0 top-8 z-[200] w-44 rounded-xl border border-slate-200 bg-white shadow-xl py-1">
                                          {(Object.keys(EXPENSE_STATUS_CFG) as ExpenseStatus[])
                                            .filter(s => s !== report.status)
                                            .map(s => {
                                              const sc = EXPENSE_STATUS_CFG[s]
                                              return (
                                                <button key={s} onClick={() => changeStatus(report, s)}
                                                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center gap-2">
                                                  <span className={`h-2 w-2 rounded-full ${sc.dot}`}></span>
                                                  <span className={`font-semibold ${sc.color}`}>{sc.label}</span>
                                                </button>
                                              )
                                            })}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Delete (brouillon only) */}
                                {report.status === 'brouillon' && (
                                  <button onClick={() => deleteReport(report)} title="Supprimer"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
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
          </>
        )}
      </div>

      {/* ═══════════════════ VIEW MODAL ═══════════════════ */}
      {viewReport && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4"
          onClick={() => setViewReport(null)}>
          <div className="flex w-full flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
            style={{ maxHeight: '90vh', maxWidth: 800 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lg shrink-0">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm">
                  Note de frais - {MONTH_NAMES[viewReport.month - 1]} {viewReport.year}
                </div>
                <div className="text-xs text-slate-400">
                  {ownerName(viewReport.user_email)}
                  {viewReport.submitted_at && ` - Soumise le ${fmtDate(viewReport.submitted_at)}`}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${EXPENSE_STATUS_CFG[viewReport.status].bg} ${EXPENSE_STATUS_CFG[viewReport.status].color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${EXPENSE_STATUS_CFG[viewReport.status].dot}`}></span>
                {EXPENSE_STATUS_CFG[viewReport.status].label}
              </span>
              <button onClick={() => setViewReport(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
                      <th className="px-3 py-2.5 text-left">Date</th>
                      <th className="px-3 py-2.5 text-left">Detail depense</th>
                      <th className="px-3 py-2.5 text-right">Montant TTC</th>
                      <th className="px-3 py-2.5 text-center">PJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(viewReport.expense_lines || [])
                      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                      .map((line, i) => (
                        <tr key={line.id || i} className="hover:bg-slate-50/40">
                          <td className="px-3 py-2.5 text-slate-600">{fmtDate(line.date)}</td>
                          <td className="px-3 py-2.5 text-slate-900 font-medium">{line.description || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{madFull(line.amount_ttc)}</td>
                          <td className="px-3 py-2.5 text-center">
                            {line.file_name ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                                <Paperclip className="h-3 w-3" />
                                <span className="truncate max-w-[80px]" title={line.file_name}>{line.file_name}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={2} className="px-3 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Total TTC
                      </td>
                      <td className="px-3 py-3 text-right text-base font-black text-slate-900">
                        {madFull(viewReport.total_ttc)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {viewReport.notes && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Notes</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{viewReport.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ EMAIL PREVIEW MODAL ═══════════════════ */}
      {emailModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4">
          <div className="flex w-full flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
            style={{ maxHeight: '92vh', maxWidth: 800 }}>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lg shrink-0">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm">Email note de frais</div>
                <div className="text-xs text-slate-400 truncate">
                  A : {COMPUCOM_EMAILS.hanane} &middot; CC : {COMPUCOM_EMAILS.achraf}
                </div>
              </div>
              <button onClick={() => { setEmailModal(null); setCopied(false) }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-2.5">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5 shrink-0">Objet</span>
                <span className="text-xs font-semibold text-slate-700 leading-relaxed">{emailModal.subject}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#e8edf3] p-3">
              <iframe srcDoc={emailModal.html} sandbox="allow-popups" title="Apercu email"
                className="w-full rounded-xl bg-white shadow border border-slate-200"
                style={{ minHeight: 480, height: '100%' }} />
            </div>
            <div className="shrink-0 border-t border-slate-100 px-5 py-4 space-y-2.5">
              <div className="flex flex-wrap gap-2.5">
                <button onClick={() => {
                  const subject = encodeURIComponent(emailModal.subject)
                  const mailto = `mailto:${COMPUCOM_EMAILS.hanane}?cc=${encodeURIComponent(COMPUCOM_EMAILS.achraf)}&subject=${subject}`
                  window.location.href = mailto
                }}
                  className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Etape 1 - Ouvrir Outlook
                </button>
                <button onClick={copyEmailHtml}
                  className={`flex h-9 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors ${copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copie !</> : <><Copy className="h-3.5 w-3.5" /> Etape 2 - Copier le HTML</>}
                </button>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Mode d&apos;emploi :</strong> Ouvrir Outlook &rarr; cliquer dans le corps &rarr; Ctrl+V &rarr; Envoyer
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TOAST ═══════════════════ */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
