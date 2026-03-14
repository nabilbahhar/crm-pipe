'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  mad, fmt, fmtDate, normStatus, normSBU, normMainBU,
  BU_BADGE_CLS, SBU_COLORS, MAIN_BU_COLORS,
  PRESCRIPTION_STATUS_CFG, type PrescriptionStatus,
  PROJECT_SERVICE_STATUS_CFG, type ProjectServiceStatus,
  LINE_STATUS_CFG,
  ownerName, COMPUCOM_EMAILS, getDeploySbuEmails,
  hasPrestation,
  DEPLOY_STATUS_CFG, type DeployStatus, computeDeployStatus,
} from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { buildKaderEmail, buildDeployEmail } from '@/lib/emailTemplates'
import {
  RefreshCw, Search, Download, ChevronDown, ChevronUp,
  Plus, Trash2, Mail, X, Copy, Check, ExternalLink,
  FolderKanban, Wrench, ClipboardList, Users, TrendingUp,
  Package, AlertCircle, Clock, ShieldCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type BuLine = { bu: string; card?: string; amount?: number }

type ProjectService = {
  id: string
  opportunity_id: string
  title: string
  description: string | null
  assigned_to: string | null
  bu: string | null
  status: ProjectServiceStatus
  start_date: string | null
  end_date: string | null
  notes: string | null
  sort_order: number
  prescription_status: PrescriptionStatus | null
  created_at: string
  updated_at: string | null
}

type PurchaseLine = {
  id: string; ref: string; designation: string
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur: string | null
  line_status: string | null; eta: string | null
  warranty_months: number | null; license_months: number | null
}

type PurchaseInfo = {
  id: string; frais_engagement: number; notes: string
  purchase_lines: PurchaseLine[]
}

type DealRegistration = {
  id: string
  opportunity_id: string
  bu: string | null
  card: string | null
  platform: string | null
  dr_number: string | null
  expiry_date: string | null
  status: string | null
  notes: string | null
  created_at: string
}

type Opportunity = {
  id: string; title: string; amount: number; status: string; stage: string
  bu: string | null; vendor: string | null; multi_bu: boolean | null
  bu_lines: BuLine[] | null; owner_email: string | null
  po_number: string | null; booking_month: string | null
  notes: string | null
  created_at: string | null
  accounts: { id?: string; name?: string } | null
  purchase_info: PurchaseInfo[] | null
  project_services: ProjectService[] | null
  deal_registrations: DealRegistration[] | null
}

type Tab = 'prescription' | 'deploiement'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRESCRIPTION_ORDER: PrescriptionStatus[] = ['en_attente', 'en_cours', 'prescrit', 'soutenu']
const SERVICE_STATUS_ORDER: ProjectServiceStatus[] = ['planifie', 'en_cours', 'termine', 'bloque']

/* hasPrestation is now imported from @/lib/utils */

/** Extracts all BU labels from a deal */
function getBUs(opp: Opportunity): string[] {
  if (opp.multi_bu && Array.isArray(opp.bu_lines) && opp.bu_lines.length > 0) {
    return [...new Set(opp.bu_lines.map(l => l.bu || l.card || '').filter(Boolean))]
  }
  return opp.bu ? [opp.bu] : []
}

/** Returns the prescription status for a deal (from its project_services with type 'Prescription') */
function getPrescriptionStatus(opp: Opportunity): PrescriptionStatus {
  const svc = opp.project_services?.find(s => s.title === 'Prescription')
  return (svc?.prescription_status as PrescriptionStatus) || 'en_attente'
}

/** Returns the presales assigned for a deal */
function getPresalesAssigned(opp: Opportunity): string {
  const svc = opp.project_services?.find(s => s.title === 'Prescription')
  return svc?.assigned_to || ''
}

/** Computes deployment progress */
function getDeploymentProgress(opp: Opportunity): number {
  let total = 0
  let done = 0
  // Count purchase_lines
  const lines = opp.purchase_info?.[0]?.purchase_lines || []
  total += lines.length
  done += lines.filter(l => l.line_status === 'livre').length
  // Count project_services (exclude 'Prescription' type)
  const services = (opp.project_services || []).filter(s => s.title !== 'Prescription')
  total += services.length
  done += services.filter(s => s.status === 'termine').length
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

/** Checks if all services are terminated */
function isProjectComplete(opp: Opportunity): boolean {
  const services = (opp.project_services || []).filter(s => s.title !== 'Prescription')
  const lines = opp.purchase_info?.[0]?.purchase_lines || []
  if (services.length === 0 && lines.length === 0) return false
  const allServsDone = services.length === 0 || services.every(s => s.status === 'termine')
  const allLinesDone = lines.length === 0 || lines.every(l => l.line_status === 'livre')
  return allServsDone && allLinesDone
}

/** DR badge color based on expiry */
function drExpiryInfo(dr: DealRegistration): { label: string; cls: string } {
  if (!dr.expiry_date) return { label: 'DR actif', cls: 'bg-emerald-50 text-emerald-700' }
  const daysLeft = Math.floor((new Date(dr.expiry_date).getTime() - Date.now()) / 86400000)
  if (daysLeft < 0) return { label: `Expire (${Math.abs(daysLeft)}j)`, cls: 'bg-red-50 text-red-600' }
  if (daysLeft <= 30) return { label: `${daysLeft}j restants`, cls: 'bg-amber-50 text-amber-700' }
  return { label: `${daysLeft}j restants`, cls: 'bg-emerald-50 text-emerald-700' }
}

// ─── BU Badge component ───────────────────────────────────────────────────────

function BUBadges({ bus }: { bus: string[] }) {
  if (bus.length === 0) return <span className="text-slate-300 text-xs">--</span>
  return (
    <div className="flex flex-wrap gap-1">
      {bus.map(b => {
        const n = normSBU(b)
        const cls = BU_BADGE_CLS[n] || 'bg-slate-100 text-slate-600'
        return (
          <span key={b} className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${cls}`}>
            {b}
          </span>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [tab, setTab] = useState<Tab>('prescription')
  const [deals, setDeals] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('Tous')

  // Prescription inline edit states
  const [editingPresales, setEditingPresales] = useState<string | null>(null)
  const [presalesText, setPresalesText] = useState('')

  // Deployment expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Service form
  const [addingService, setAddingService] = useState<string | null>(null)
  const [svcForm, setSvcForm] = useState({ title: '', assigned_to: '', start_date: '', end_date: '', notes: '' })

  // Slide panel for deployment details
  const [slidePanel, setSlidePanel] = useState<string | null>(null) // opp.id
  const [slidePanelTab, setSlidePanelTab] = useState<'materiel' | 'prestations'>('materiel')

  // Email modal
  const [emailModal, setEmailModal] = useState<{ html: string; to: string; cc: string; subject: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // ─── Load data ───────────────────────────────────────────────

  useEffect(() => {
    document.title = 'Projets \u00b7 CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    load()
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          id, title, amount, status, stage, bu, vendor, multi_bu, bu_lines,
          owner_email, po_number, booking_month, notes, created_at,
          accounts(id, name),
          purchase_info(id, frais_engagement, notes, purchase_lines(*)),
          project_services(*),
          deal_registrations(*)
        `)
        .in('status', ['Open', 'Won'])
        .order('amount', { ascending: false })

      if (error) throw error
      setDeals((data || []) as Opportunity[])
    } catch (e: any) {
      // If project_services or deal_registrations table doesn't exist, try without
      console.warn('Full query failed, trying fallback:', e.message)
      try {
        const { data, error } = await supabase
          .from('opportunities')
          .select(`
            id, title, amount, status, stage, bu, vendor, multi_bu, bu_lines,
            owner_email, po_number, booking_month, notes, created_at,
            accounts(id, name),
            purchase_info(id, frais_engagement, notes, purchase_lines(*))
          `)
          .in('status', ['Open', 'Won'])
          .order('amount', { ascending: false })

        if (error) throw error
        setDeals((data || []).map((d: any) => ({
          ...d,
          project_services: [],
          deal_registrations: [],
        })) as Opportunity[])
      } catch (e2: any) {
        setErr(e2.message)
      }
    }
    setLoading(false)
  }, [])

  // ─── Filtered lists ──────────────────────────────────────────

  const q = search.trim().toLowerCase()

  const prescriptionDeals = useMemo(() => {
    return deals.filter(d => {
      if (normStatus(d) !== 'Open') return false
      if (!hasPrestation(d)) return false
      if (buFilter !== 'Tous') {
        const mainBu = normMainBU(d.bu)
        if (mainBu !== buFilter) return false
      }
      if (q) {
        const name = d.accounts?.name || d.title || ''
        if (!name.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [deals, q, buFilter])

  const deploymentDeals = useMemo(() => {
    return deals.filter(d => {
      if (normStatus(d) !== 'Won') return false
      if (!hasPrestation(d)) return false
      if (buFilter !== 'Tous') {
        const mainBu = normMainBU(d.bu)
        if (mainBu !== buFilter) return false
      }
      if (q) {
        const name = d.accounts?.name || d.title || ''
        if (!name.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [deals, q, buFilter])

  // ─── KPI computations ───────────────────────────────────────

  // Prescription KPIs
  const prescKpis = useMemo(() => {
    const count = prescriptionDeals.length
    const totalAmt = prescriptionDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const awaitingPresales = prescriptionDeals.filter(d => !getPresalesAssigned(d)).length
    return { count, totalAmt, awaitingPresales }
  }, [prescriptionDeals])

  // Deployment KPIs
  const deployKpis = useMemo(() => {
    const active = deploymentDeals.filter(d => !isProjectComplete(d))
    const completed = deploymentDeals.filter(d => isProjectComplete(d))
    const activeAmt = active.reduce((s, d) => s + (d.amount || 0), 0)
    return {
      activeCount: active.length,
      completedCount: completed.length,
      activeAmt,
    }
  }, [deploymentDeals])

  // ─── Prescription actions ────────────────────────────────────

  async function savePresales(oppId: string, name: string) {
    // Upsert a project_service record with title='Prescription'
    const existing = deals.find(d => d.id === oppId)?.project_services?.find(s => s.title === 'Prescription')

    if (existing) {
      await supabase.from('project_services').update({
        assigned_to: name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('project_services').insert({
        opportunity_id: oppId,
        title: 'Prescription',
        assigned_to: name || null,
        status: 'planifie',
        prescription_status: 'en_attente',
      })
    }

    await logActivity({
      action_type: 'update', entity_type: 'project_service',
      entity_id: oppId,
      entity_name: existing ? deals.find(d => d.id === oppId)?.title || '' : 'Nouveau',
      detail: `Presales assigne: ${name || '(retire)'}`,
    })

    setEditingPresales(null)
    load()
  }

  async function updatePrescriptionStatus(oppId: string, newStatus: PrescriptionStatus) {
    const deal = deals.find(d => d.id === oppId)
    const existing = deal?.project_services?.find(s => s.title === 'Prescription')

    if (existing) {
      await supabase.from('project_services').update({
        prescription_status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('project_services').insert({
        opportunity_id: oppId,
        title: 'Prescription',
        status: 'planifie',
        prescription_status: newStatus,
      })
    }

    await logActivity({
      action_type: 'update', entity_type: 'project_service',
      entity_id: oppId,
      entity_name: deal?.title || '',
      detail: `Statut prescription: ${PRESCRIPTION_STATUS_CFG[newStatus].label}`,
    })

    load()
  }

  // ─── Deployment service actions ──────────────────────────────

  async function addService(oppId: string) {
    if (!svcForm.title.trim()) return

    const { error } = await supabase.from('project_services').insert({
      opportunity_id: oppId,
      title: svcForm.title.trim(),
      description: null,
      assigned_to: svcForm.assigned_to.trim() || null,
      bu: null,
      status: 'planifie' as ProjectServiceStatus,
      start_date: svcForm.start_date || null,
      end_date: svcForm.end_date || null,
      notes: svcForm.notes.trim() || null,
      sort_order: 0,
    })

    if (error) { alert('Erreur: ' + error.message); return }

    const deal = deals.find(d => d.id === oppId)
    await logActivity({
      action_type: 'create', entity_type: 'project_service',
      entity_id: oppId,
      entity_name: deal?.title || '',
      detail: `Prestation ajoutee: ${svcForm.title}`,
    })

    setSvcForm({ title: '', assigned_to: '', start_date: '', end_date: '', notes: '' })
    setAddingService(null)
    load()
  }

  async function updateServiceStatus(svcId: string, newStatus: ProjectServiceStatus, oppId: string) {
    const { error } = await supabase.from('project_services').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', svcId)
    if (error) { alert('Erreur: ' + error.message); return }

    const deal = deals.find(d => d.id === oppId)
    const svc = deal?.project_services?.find(s => s.id === svcId)
    await logActivity({
      action_type: 'update', entity_type: 'project_service',
      entity_id: oppId,
      entity_name: deal?.title || '',
      detail: `Prestation "${svc?.title}": ${PROJECT_SERVICE_STATUS_CFG[newStatus].label}`,
    })

    load()
  }

  async function deleteService(svcId: string, oppId: string) {
    if (!confirm('Supprimer cette prestation ?')) return
    const deal = deals.find(d => d.id === oppId)
    const svc = deal?.project_services?.find(s => s.id === svcId)

    const { error } = await supabase.from('project_services').delete().eq('id', svcId)
    if (error) { alert('Erreur: ' + error.message); return }

    await logActivity({
      action_type: 'delete', entity_type: 'project_service',
      entity_id: oppId,
      entity_name: deal?.title || '',
      detail: `Prestation supprimee: ${svc?.title || ''}`,
    })

    load()
  }

  // ─── Email helpers ───────────────────────────────────────────

  function openPrescriptionEmail(opp: Opportunity) {
    const bus = getBUs(opp)
    const presales = getPresalesAssigned(opp)
    const html = buildKaderEmail({
      type: 'prescription',
      dealTitle: opp.title,
      accountName: opp.accounts?.name || opp.title,
      amount: opp.amount,
      bus,
      presalesAssigned: presales || undefined,
      senderName: userEmail ? ownerName(userEmail) : 'Compucom',
    })
    setEmailModal({
      html,
      to: COMPUCOM_EMAILS.kader,
      cc: '',
      subject: `Prescription - ${opp.title} (${opp.accounts?.name || ''})`,
    })
  }

  function openDeploymentEmail(opp: Opportunity) {
    const bus = getBUs(opp)
    const senderName = userEmail ? ownerName(userEmail) : 'Compucom'
    const accountName = opp.accounts?.name || opp.title

    // Get PRESTA lines from purchase_info
    const allLines = opp.purchase_info?.[0]?.purchase_lines || []
    const prestaLines = allLines.filter(l => (l.ref || '').toUpperCase().includes('PRESTA'))

    // If there are PRESTA lines, use the deploy email template
    // Otherwise, fall back to Kader deployment email
    if (prestaLines.length > 0) {
      const html = buildDeployEmail({
        dealTitle: opp.title,
        accountName,
        amount: opp.amount,
        poNumber: opp.po_number || '',
        bus,
        prestaLines: prestaLines.map(l => ({ ref: l.ref, designation: l.designation, qty: l.qty })),
        notes: opp.notes || '',
        senderName,
      })
      const nabilEmail = 'n.bahhar@compucom.ma'
      const salimEmail = 's.chitachny@compucom.ma'
      const crossCC = userEmail === nabilEmail ? salimEmail : nabilEmail
      const sbuEmails = getDeploySbuEmails(bus)
      const deployTo = [COMPUCOM_EMAILS.belabar, COMPUCOM_EMAILS.si_infras].join(', ')
      const deployCC = [crossCC, ...sbuEmails].join(', ')

      setEmailModal({
        html,
        to: deployTo,
        cc: deployCC,
        subject: `Suivi projet déploiement — ${opp.title} (${accountName})`,
      })
    } else {
      // Fallback to original Kader email
      const services = (opp.project_services || [])
        .filter(s => s.title !== 'Prescription')
        .map(s => ({
          title: s.title,
          assignedTo: s.assigned_to || '--',
          status: PROJECT_SERVICE_STATUS_CFG[s.status]?.label || s.status,
        }))
      const deliveryLines = allLines.map(l => ({
        designation: l.designation,
        status: (LINE_STATUS_CFG as any)[l.line_status || 'pending']?.label || l.line_status || 'En attente',
        eta: l.eta || undefined,
      }))
      const html = buildKaderEmail({
        type: 'deployment',
        dealTitle: opp.title,
        accountName,
        amount: opp.amount,
        bus,
        services,
        deliveryLines,
        senderName,
      })
      setEmailModal({
        html,
        to: COMPUCOM_EMAILS.kader,
        cc: '',
        subject: `Suivi projet - ${opp.title} (${accountName})`,
      })
    }
  }

  function copyEmailHtml() {
    if (!emailModal) return
    navigator.clipboard.writeText(emailModal.html)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── Expand toggle ──────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Excel export ────────────────────────────────────────────

  const [exporting, setExporting] = useState(false)

  async function exportExcel(opp: Opportunity) {
    setExporting(true)
    try {
      const lines = opp.purchase_info?.[0]?.purchase_lines || []
      const services = (opp.project_services || []).filter(s => s.title !== 'Prescription')

      const spec = {
        filename: `projet_${opp.title.replace(/\s+/g, '_').slice(0, 30)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [
          {
            name: 'Materiel',
            title: `Lignes materiel - ${opp.title}`,
            headers: ['Designation', 'Fournisseur', 'Statut', 'ETA', 'Garantie (mois)', 'Licence (mois)', 'Qte', 'PU Achat', 'PT Achat'],
            rows: lines.map(l => [
              l.designation || '--',
              l.fournisseur || '--',
              (LINE_STATUS_CFG as any)[l.line_status || 'pending']?.label || l.line_status || 'En attente',
              l.eta || '--',
              l.warranty_months ?? '--',
              l.license_months ?? '--',
              l.qty,
              l.pu_achat,
              l.qty * l.pu_achat,
            ]),
            totalsRow: ['TOTAL', '', '', '', '', '', lines.reduce((s, l) => s + l.qty, 0), '', lines.reduce((s, l) => s + l.qty * l.pu_achat, 0)],
          },
          {
            name: 'Prestations',
            title: `Prestations - ${opp.title}`,
            headers: ['Titre', 'Ingenieur', 'Statut', 'Debut', 'Fin', 'Notes'],
            rows: services.map(s => [
              s.title,
              s.assigned_to || '--',
              PROJECT_SERVICE_STATUS_CFG[s.status]?.label || s.status,
              s.start_date ? fmtDate(s.start_date) : '--',
              s.end_date ? fmtDate(s.end_date) : '--',
              s.notes || '--',
            ]),
          },
        ],
        summary: {
          title: `Projet ${opp.title} - ${opp.accounts?.name || ''} - ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Montant deal', value: mad(opp.amount) },
            { label: 'Lignes materiel', value: lines.length, detail: `${lines.filter(l => l.line_status === 'livre').length} livrees` },
            { label: 'Prestations', value: services.length, detail: `${services.filter(s => s.status === 'termine').length} terminees` },
            { label: 'Avancement', value: `${getDeploymentProgress(opp)}%` },
          ],
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
      a.href = url; a.download = spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.message || 'Erreur export')
    }
    setExporting(false)
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Gestion des Projets</h1>
              <p className="text-xs text-slate-500">
                Prescription & deploiement des projets Service
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}

        {/* ── Tab Selector ── */}
        <div className="flex border-b border-slate-200">
          {([
            { key: 'prescription' as Tab, label: 'Prescription', icon: <ClipboardList className="h-4 w-4" /> },
            { key: 'deploiement' as Tab, label: 'Deploiement', icon: <Wrench className="h-4 w-4" /> },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors
                ${tab === t.key
                  ? 'text-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
                }`}>
              {t.icon}
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-t" />
              )}
              {/* Counts */}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
                ${tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {t.key === 'prescription' ? prescriptionDeals.length : deploymentDeals.length}
              </span>
            </button>
          ))}
        </div>

        {/* ── Search + BU filter ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un deal, client..."
              className="w-56 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none">
            <option value="Tous">BU: Tous</option>
            <option value="CSG">CSG</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Cyber Sécurité">Cyber Sécurité</option>
          </select>
        </div>

        {/* ── Mini pie chart — Projets par BU ── */}
        {deals.length > 0 && (() => {
          const buMap: Record<string, number> = {}
          const serviceDeals = deals.filter(d => hasPrestation(d))
          serviceDeals.forEach(d => {
            const bu = normMainBU(d.bu) || 'Autre'
            buMap[bu] = (buMap[bu] || 0) + 1
          })
          const pieData = Object.entries(buMap)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({
              name, value,
              fill: MAIN_BU_COLORS[name]?.color || '#94a3b8',
            }))
          if (pieData.length === 0) return null
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Projets Service par Main BU</h3>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={75} innerRadius={38}
                      strokeWidth={2} stroke="#fff">
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                      formatter={(v: any, name: any) => [`${v} projet${Number(v) > 1 ? 's' : ''}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                      <span className="text-xs font-semibold text-slate-700">{d.name}</span>
                      <span className="text-xs text-slate-400">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement...
          </div>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: PRESCRIPTION                                                 */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {tab === 'prescription' && (
              <div className="space-y-5">

                {/* KPI cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <ClipboardList className="mb-1 inline h-3.5 w-3.5" /> Dossiers en prescription
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{prescKpis.count}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <TrendingUp className="mb-1 inline h-3.5 w-3.5" /> Montant total
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{fmt(prescKpis.totalAmt)} MAD</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{mad(prescKpis.totalAmt)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <Users className="mb-1 inline h-3.5 w-3.5" /> En attente presales
                    </div>
                    <div className="mt-1 text-2xl font-black text-amber-600">{prescKpis.awaitingPresales}</div>
                    {prescKpis.awaitingPresales > 0 && (
                      <div className="mt-0.5 text-[10px] text-amber-500">Non assignes</div>
                    )}
                  </div>
                </div>

                {/* Table */}
                {prescriptionDeals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                    <ClipboardList className="mb-3 h-10 w-10 text-slate-300" />
                    <div className="text-sm font-semibold text-slate-500">Aucun dossier en prescription</div>
                    <div className="mt-1 text-xs text-slate-400">Les deals Open avec BU Service apparaissent ici.</div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                            <th className="px-4 py-2.5 text-left">Deal</th>
                            <th className="px-4 py-2.5 text-left">Client</th>
                            <th className="px-4 py-2.5 text-right">Montant</th>
                            <th className="px-4 py-2.5 text-left">BU</th>
                            <th className="px-4 py-2.5 text-left">Presales assigne</th>
                            <th className="px-4 py-2.5 text-center">Statut</th>
                            <th className="px-4 py-2.5 text-center">DR</th>
                            <th className="px-4 py-2.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {prescriptionDeals.map(opp => {
                            const bus = getBUs(opp)
                            const presales = getPresalesAssigned(opp)
                            const prescStatus = getPrescriptionStatus(opp)
                            const prescCfg = PRESCRIPTION_STATUS_CFG[prescStatus]
                            const drs = opp.deal_registrations || []

                            return (
                              <tr key={opp.id} className="hover:bg-slate-50/60 transition-colors">
                                {/* Deal */}
                                <td className="px-4 py-3">
                                  <Link href={`/opportunities/${opp.id}`}
                                    className="font-bold text-slate-900 hover:text-blue-600 transition-colors">
                                    {opp.title}
                                  </Link>
                                </td>
                                {/* Client */}
                                <td className="px-4 py-3 text-slate-600 text-xs">
                                  {opp.accounts?.name || '--'}
                                </td>
                                {/* Montant */}
                                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                                  {mad(opp.amount)}
                                </td>
                                {/* BU */}
                                <td className="px-4 py-3">
                                  <BUBadges bus={bus} />
                                </td>
                                {/* Presales assigne */}
                                <td className="px-4 py-3 max-w-[160px]">
                                  {editingPresales === opp.id ? (
                                    <div className="flex items-center gap-1">
                                      <input value={presalesText}
                                        onChange={e => setPresalesText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') savePresales(opp.id, presalesText) }}
                                        autoFocus placeholder="Nom presales..."
                                        className="h-7 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-slate-400" />
                                      <button onClick={() => savePresales(opp.id, presalesText)}
                                        className="h-7 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white shrink-0">
                                        <Check className="h-3 w-3" />
                                      </button>
                                      <button onClick={() => setEditingPresales(null)}
                                        className="h-7 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-400 shrink-0">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setEditingPresales(opp.id); setPresalesText(presales) }}
                                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors truncate max-w-[150px] text-left">
                                      {presales || (
                                        <span className="text-slate-300 italic">+ assigner</span>
                                      )}
                                    </button>
                                  )}
                                </td>
                                {/* Statut prescription */}
                                <td className="px-4 py-3 text-center">
                                  <select
                                    value={prescStatus}
                                    onChange={e => updatePrescriptionStatus(opp.id, e.target.value as PrescriptionStatus)}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold border-0 outline-none cursor-pointer ${prescCfg.bg} ${prescCfg.color}`}>
                                    {PRESCRIPTION_ORDER.map(s => (
                                      <option key={s} value={s}>{PRESCRIPTION_STATUS_CFG[s].label}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* DR */}
                                <td className="px-4 py-3 text-center">
                                  {drs.length > 0 ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      {drs.map(dr => {
                                        const info = drExpiryInfo(dr)
                                        return (
                                          <span key={dr.id}
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${info.cls}`}
                                            title={dr.expiry_date ? `Expire: ${fmtDate(dr.expiry_date)}` : ''}>
                                            <ShieldCheck className="h-2.5 w-2.5" />
                                            {info.label}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-300">--</span>
                                  )}
                                </td>
                                {/* Actions */}
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button onClick={() => openPrescriptionEmail(opp)}
                                      title="Email Kader"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition-colors">
                                      <Mail className="h-3.5 w-3.5" />
                                    </button>
                                    <Link href={`/opportunities/${opp.id}`}
                                      title="Voir le deal"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
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
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* TAB 2: DEPLOIEMENT                                                  */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {tab === 'deploiement' && (
              <div className="space-y-5">

                {/* KPI cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <Wrench className="mb-1 inline h-3.5 w-3.5" /> Projets en cours
                    </div>
                    <div className="mt-1 text-2xl font-black text-blue-700">{deployKpis.activeCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <Check className="mb-1 inline h-3.5 w-3.5" /> Termines
                    </div>
                    <div className="mt-1 text-2xl font-black text-emerald-700">{deployKpis.completedCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <TrendingUp className="mb-1 inline h-3.5 w-3.5" /> CA en deploiement
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{fmt(deployKpis.activeAmt)} MAD</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{mad(deployKpis.activeAmt)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <Clock className="mb-1 inline h-3.5 w-3.5" /> Taux completion moyen
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-900">
                      {deploymentDeals.length > 0
                        ? `${Math.round(deploymentDeals.reduce((s, d) => s + getDeploymentProgress(d), 0) / deploymentDeals.length)}%`
                        : '0%'}
                    </div>
                  </div>
                </div>

                {/* Deployment table (supply-style) */}
                {deploymentDeals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                    <Wrench className="mb-3 h-10 w-10 text-slate-300" />
                    <div className="text-sm font-semibold text-slate-500">Aucun projet en deploiement</div>
                    <div className="mt-1 text-xs text-slate-400">Les deals Won avec BU Service apparaissent ici.</div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-400">
                            <th className="px-4 py-2.5 text-left w-[25%]">Compte / Deal</th>
                            <th className="px-4 py-2.5 text-center w-[8%]">BU</th>
                            <th className="px-4 py-2.5 text-right w-[12%]">Montant</th>
                            <th className="px-4 py-2.5 text-center w-[20%]">Progression</th>
                            <th className="px-4 py-2.5 text-center w-[10%]">Statut</th>
                            <th className="px-4 py-2.5 text-center w-[10%]">Lignes</th>
                            <th className="px-4 py-2.5 text-center w-[15%]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {deploymentDeals.map(opp => {
                            const progress = getDeploymentProgress(opp)
                            const complete = isProjectComplete(opp)
                            const bus = getBUs(opp)
                            const lines = opp.purchase_info?.[0]?.purchase_lines || []
                            const services = (opp.project_services || []).filter(s => s.title !== 'Prescription')
                            const deployStatus = computeDeployStatus(services)
                            const dCfg = DEPLOY_STATUS_CFG[deployStatus]

                            return (
                              <tr key={opp.id}
                                onClick={() => { setSlidePanel(opp.id); setSlidePanelTab('materiel') }}
                                className={`hover:bg-slate-50/60 transition-colors cursor-pointer
                                  ${complete ? 'bg-emerald-50/30' : ''}`}>
                                {/* Compte / Deal */}
                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-900 truncate">{opp.title}</div>
                                  <div className="text-[11px] text-slate-400 truncate">{opp.accounts?.name || '--'}</div>
                                </td>
                                {/* BU */}
                                <td className="px-4 py-3 text-center">
                                  <BUBadges bus={bus} />
                                </td>
                                {/* Montant */}
                                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                                  {mad(opp.amount)}
                                </td>
                                {/* Progression */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                      <div className={`h-full rounded-full transition-all duration-500
                                        ${complete ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
                                        style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className={`text-[10px] font-bold tabular-nums w-8 text-right
                                      ${complete ? 'text-emerald-600' : 'text-slate-500'}`}>
                                      {progress}%
                                    </span>
                                  </div>
                                </td>
                                {/* Statut */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${dCfg.bg} ${dCfg.color}`}>
                                    {dCfg.icon} {dCfg.label}
                                  </span>
                                </td>
                                {/* Lignes */}
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] text-slate-500" title="Materiel">
                                      <Package className="inline h-3 w-3 mr-0.5" />{lines.length}
                                    </span>
                                    <span className="text-slate-200">|</span>
                                    <span className="text-[10px] text-slate-500" title="Prestations">
                                      <Wrench className="inline h-3 w-3 mr-0.5" />{services.length}
                                    </span>
                                  </div>
                                </td>
                                {/* Actions */}
                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-1">
                                    <button onClick={() => openDeploymentEmail(opp)}
                                      title="Email Deploy"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                                      <Mail className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => exportExcel(opp)} disabled={exporting}
                                      title="Excel"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors disabled:opacity-40">
                                      <Download className="h-3.5 w-3.5" />
                                    </button>
                                    <Link href={`/opportunities/${opp.id}`}
                                      title="Voir le deal"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
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

                {/* ── Slide Panel (deploy detail) ── */}
                {slidePanel && (() => {
                  const opp = deploymentDeals.find(d => d.id === slidePanel)
                  if (!opp) return null
                  const lines = opp.purchase_info?.[0]?.purchase_lines || []
                  const services = (opp.project_services || []).filter(s => s.title !== 'Prescription')
                  const progress = getDeploymentProgress(opp)
                  const complete = isProjectComplete(opp)
                  const deployStatus = computeDeployStatus(services)
                  const dCfg = DEPLOY_STATUS_CFG[deployStatus]

                  return (
                    <div className="fixed inset-0 z-[200] flex justify-end" role="presentation">
                      {/* Backdrop */}
                      <div className="absolute inset-0 bg-black/30" onClick={() => setSlidePanel(null)} />
                      {/* Panel */}
                      <div className="relative w-full max-w-[680px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
                        {/* Panel header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-bold text-slate-900 truncate">{opp.title}</h2>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${dCfg.bg} ${dCfg.color}`}>
                                {dCfg.icon} {dCfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {opp.accounts?.name || '--'} · {mad(opp.amount)} · {progress}% complete
                            </p>
                          </div>
                          <button onClick={() => setSlidePanel(null)}
                            className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Progress bar */}
                        <div className="px-6 pt-3 pb-2">
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700
                              ${complete ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
                              style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 px-6">
                          {([
                            { key: 'materiel' as const, label: `Materiel (${lines.length})`, icon: <Package className="h-3.5 w-3.5" /> },
                            { key: 'prestations' as const, label: `Prestations (${services.length})`, icon: <Wrench className="h-3.5 w-3.5" /> },
                          ]).map(t => (
                            <button key={t.key} onClick={() => setSlidePanelTab(t.key)}
                              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors
                                ${slidePanelTab === t.key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                              {t.icon} {t.label}
                              {slidePanelTab === t.key && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-t" />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Panel body */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                          {/* Materiel tab */}
                          {slidePanelTab === 'materiel' && (
                            <>
                              {lines.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                                  Aucune ligne materiel
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-100">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/80 text-[10px] font-semibold text-slate-400 uppercase">
                                        <th className="px-3 py-2 text-left">Designation</th>
                                        <th className="px-3 py-2 text-left">Fournisseur</th>
                                        <th className="px-3 py-2 text-center">Statut</th>
                                        <th className="px-3 py-2 text-center">ETA</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {lines.map(l => {
                                        const statusKey = (l.line_status || 'pending') as keyof typeof LINE_STATUS_CFG
                                        const lineCfg = LINE_STATUS_CFG[statusKey] || LINE_STATUS_CFG.pending
                                        return (
                                          <tr key={l.id} className="hover:bg-slate-50/50">
                                            <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate">{l.designation || '--'}</td>
                                            <td className="px-3 py-2 text-slate-500">{l.fournisseur || '--'}</td>
                                            <td className="px-3 py-2 text-center">
                                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${lineCfg.bg} ${lineCfg.color}`}>
                                                {lineCfg.icon} {lineCfg.label}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-center text-slate-500">
                                              {l.eta ? fmtDate(l.eta) : '--'}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}

                          {/* Prestations tab */}
                          {slidePanelTab === 'prestations' && (
                            <>
                              {/* Add service button */}
                              <div className="flex justify-end">
                                <button onClick={() => {
                                  setAddingService(addingService === opp.id ? null : opp.id)
                                  setSvcForm({ title: '', assigned_to: '', start_date: '', end_date: '', notes: '' })
                                }}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                  <Plus className="h-3 w-3" /> Ajouter prestation
                                </button>
                              </div>

                              {/* Add service form */}
                              {addingService === opp.id && (
                                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input value={svcForm.title}
                                      onChange={e => setSvcForm({ ...svcForm, title: e.target.value })}
                                      placeholder="Titre *"
                                      className="col-span-2 h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400" />
                                    <input value={svcForm.assigned_to}
                                      onChange={e => setSvcForm({ ...svcForm, assigned_to: e.target.value })}
                                      placeholder="Ingenieur"
                                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400" />
                                    <input value={svcForm.notes}
                                      onChange={e => setSvcForm({ ...svcForm, notes: e.target.value })}
                                      placeholder="Notes..."
                                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400" />
                                    <input type="date" value={svcForm.start_date}
                                      onChange={e => setSvcForm({ ...svcForm, start_date: e.target.value })}
                                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400" />
                                    <input type="date" value={svcForm.end_date}
                                      onChange={e => setSvcForm({ ...svcForm, end_date: e.target.value })}
                                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400" />
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => addService(opp.id)}
                                      disabled={!svcForm.title.trim()}
                                      className="h-7 rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white disabled:opacity-40 hover:bg-slate-800 transition-colors">
                                      Enregistrer
                                    </button>
                                    <button onClick={() => setAddingService(null)}
                                      className="h-7 rounded-lg border border-slate-200 px-3 text-[10px] text-slate-500 hover:bg-slate-50 transition-colors">
                                      Annuler
                                    </button>
                                  </div>
                                </div>
                              )}

                              {services.length === 0 && addingService !== opp.id ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                                  Aucune prestation. Cliquez sur &quot;Ajouter&quot; pour en creer une.
                                </div>
                              ) : services.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-slate-100">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/80 text-[10px] font-semibold text-slate-400 uppercase">
                                        <th className="px-3 py-2 text-left">Titre</th>
                                        <th className="px-3 py-2 text-left">Ingenieur</th>
                                        <th className="px-3 py-2 text-center">Statut</th>
                                        <th className="px-3 py-2 text-center">Debut</th>
                                        <th className="px-3 py-2 text-center">Fin</th>
                                        <th className="px-3 py-2 text-center w-10"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {services.map(svc => {
                                        const sCfg = PROJECT_SERVICE_STATUS_CFG[svc.status] || PROJECT_SERVICE_STATUS_CFG.planifie
                                        return (
                                          <tr key={svc.id} className="hover:bg-slate-50/50">
                                            <td className="px-3 py-2 font-semibold text-slate-700">{svc.title}</td>
                                            <td className="px-3 py-2 text-slate-500">{svc.assigned_to || '--'}</td>
                                            <td className="px-3 py-2 text-center">
                                              <select
                                                value={svc.status}
                                                onChange={e => updateServiceStatus(svc.id, e.target.value as ProjectServiceStatus, opp.id)}
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold border-0 outline-none cursor-pointer ${sCfg.bg} ${sCfg.color}`}>
                                                {SERVICE_STATUS_ORDER.map(s => (
                                                  <option key={s} value={s}>{PROJECT_SERVICE_STATUS_CFG[s].label}</option>
                                                ))}
                                              </select>
                                            </td>
                                            <td className="px-3 py-2 text-center text-slate-500">
                                              {svc.start_date ? fmtDate(svc.start_date) : '--'}
                                            </td>
                                            <td className="px-3 py-2 text-center text-slate-500">
                                              {svc.end_date ? fmtDate(svc.end_date) : '--'}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <button onClick={() => deleteService(svc.id, opp.id)}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Panel footer */}
                        <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-3">
                          <button onClick={() => openDeploymentEmail(opp)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
                            <Mail className="h-3.5 w-3.5" /> Email Deploy
                          </button>
                          <button onClick={() => exportExcel(opp)} disabled={exporting}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">
                            <Download className="h-3.5 w-3.5" /> Excel
                          </button>
                          <Link href={`/opportunities/${opp.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" /> Voir le deal
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EMAIL PREVIEW MODAL                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {emailModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          role="presentation" onClick={e => { if (e.target === e.currentTarget) setEmailModal(null) }} onKeyDown={e => { if (e.key === 'Escape') setEmailModal(null) }}>
          <div className="relative w-full max-w-[700px] max-h-[85vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="Aperçu email projet">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <div className="text-sm font-bold text-slate-900">Apercu email</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Destinataire: <span className="font-semibold text-slate-600">{emailModal.to}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copyEmailHtml}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copie !' : 'Copier HTML'}
                </button>
                <a href={`mailto:${emailModal.to}?${emailModal.cc ? `cc=${encodeURIComponent(emailModal.cc)}&` : ''}subject=${encodeURIComponent(emailModal.subject)}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
                  <Mail className="h-3.5 w-3.5" /> Ouvrir mail
                </a>
                <button onClick={() => { setEmailModal(null); setCopied(false) }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Email iframe */}
            <div className="flex-1 overflow-auto p-4 bg-slate-50">
              <iframe
                srcDoc={emailModal.html}
                className="w-full min-h-[400px] rounded-xl border border-slate-200 bg-white"
                style={{ height: '500px' }}
                sandbox="allow-same-origin"
                title="Email preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
