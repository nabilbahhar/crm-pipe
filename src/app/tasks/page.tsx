'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { mad, fmt, fmtDate, getAnnualTarget, INVOICE_STATUS_CFG, type InvoiceStatus } from '@/lib/utils'
import {
  CheckCircle2, RefreshCw, ChevronRight, Package, Phone,
  Search, ArrowUp, ArrowDown, ChevronsUpDown, X, Download,
  Clock, AlertCircle, PlayCircle, CircleDashed, CalendarClock,
  FileText, AlertTriangle, TrendingUp, Users, Target, Zap, Sun,
  Shield, Key, BookOpen, Receipt, Crosshair, Mail, Banknote,
} from 'lucide-react'

type TaskType   = 'relance_retard' | 'relance_semaine' | 'achat_manquant' | 'closing_retard' | 'eta_manquante' | 'relance_fournisseur' | 'deal_relance' | 'compte_incomplet' | 'echeance_paiement'

// ── Types for new sections ──
type WarrantyItem = {
  id: string
  designation: string
  client: string
  warrantyMonths: number
  expiryDate: Date
  daysLeft: number
  opportunityId: string
}

type LicenseItem = {
  id: string
  designation: string
  client: string
  licenseMonths: number
  expiryDate: Date
  daysLeft: number
  opportunityId: string
}

type DRItem = {
  id: string
  drNumber: string
  card: string
  bu: string
  dealTitle: string
  expiryDate: string
  daysLeft: number
  opportunityId: string
}

type InvoiceItem = {
  id: string
  invoiceNumber: string
  dealTitle: string
  amount: number
  dueDate: string
  daysOverdue: number
  status: InvoiceStatus
  opportunityId: string
}
type PaymentReminderItem = {
  id: string
  dealTitle: string
  client: string
  accountId: string
  opportunityId: string
  milestoneLabel: string
  milestonePct: number
  amount: number       // deal amount * pct / 100
  dueDate: string      // ISO date
  daysUntil: number    // negative = overdue
  trigger: string
  totalDealAmount: number
  clientEmails: string[]
  clientContacts: string[]
}

type Priority   = 'high' | 'medium'
type FicheStatus = 'a_faire' | 'en_cours' | 'complete'
type SortKey    = 'priority' | 'title' | 'amount' | 'daysLate' | 'ficheStatus'

type Task = {
  id: string
  type: TaskType
  priority: Priority
  title: string
  subtitle: string
  detail: string
  amount: number
  daysLate: number
  ficheStatus: FicheStatus
  ficheProgress: number
  linesTotal: number
  linesComplete: number
  entity_id: string
  entity?: any
}

const TYPE_LABELS: Record<TaskType, string> = {
  relance_retard: 'Relance retard',
  relance_semaine: 'Relance semaine',
  achat_manquant: 'Commande à placer',
  closing_retard: 'Closing retard',
  eta_manquante: 'ETA manquante',
  relance_fournisseur: 'Relance fournisseur',
  deal_relance: 'Suivi deal',
  compte_incomplet: 'Fiche compte',
  echeance_paiement: 'Échéance paiement',
}

const STATUS_CFG: Record<FicheStatus, { label: string; icon: React.ReactNode; badge: string; row: string }> = {
  a_faire:  {
    label: 'À faire',
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    badge: 'bg-slate-100 text-slate-500 border border-slate-200',
    row: '',
  },
  en_cours: {
    label: 'En cours',
    icon: <PlayCircle className="h-3.5 w-3.5" />,
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    row: '',
  },
  complete: {
    label: 'Complet',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    row: '',
  },
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]       = useState<string | null>(null)

  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<'Tous' | TaskType>('Tous')
  const [prioFilter, setPrioFilter]     = useState<'Tous' | Priority>('Tous')
  const [statusFilter, setStatusFilter] = useState<'Tous' | FicheStatus>('Tous')
  const [sortKey, setSortKey]           = useState<SortKey>('priority')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')
  const [wonYTD, setWonYTD]             = useState(0)
  const [openPipeline, setOpenPipeline] = useState(0)

  // New section state
  const [warranties, setWarranties]     = useState<WarrantyItem[]>([])
  const [licenses, setLicenses]         = useState<LicenseItem[]>([])
  const [drs, setDrs]                   = useState<DRItem[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceItem[]>([])
  const [paymentReminders, setPaymentReminders] = useState<PaymentReminderItem[]>([])

  useEffect(() => { document.title = 'Tâches · CRM-PIPE'; load() }, [])

  const loadingRef = { current: false }
  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true); setErr(null)
    try {
      const year = new Date().getFullYear()
      const [a, b, c, d, e, e2, f, g, wonRes, openRes, warr, lic, drItems, invItems, payReminders] = await Promise.all([
        loadRelances(), loadAchats(), loadClosingRetards(), loadRelancesSemaine(), loadEtaManquante(), loadRelanceFournisseur(), loadDealRelances(), loadComptesIncomplets(),
        supabase.from('opportunities').select('amount').eq('status', 'Won').gte('booking_month', `${year}-01`),
        supabase.from('opportunities').select('amount').eq('status', 'Open'),
        loadWarranties(), loadLicenses(), loadDRs(), loadOverdueInvoices(), loadPaymentReminders(),
      ])
      setTasks([...a, ...b, ...c, ...d, ...e, ...e2, ...f, ...g])
      if (wonRes.error) console.warn('tasks wonRes error:', wonRes.error.message)
      if (openRes.error) console.warn('tasks openRes error:', openRes.error.message)
      setWonYTD((wonRes.data || []).reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0))
      setOpenPipeline((openRes.data || []).reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0))
      setWarranties(warr)
      setLicenses(lic)
      setDrs(drItems)
      setOverdueInvoices(invItems)
      setPaymentReminders(payReminders)
    } catch (e: any) { setErr(e?.message || 'Erreur chargement') }
    finally { setLoading(false); loadingRef.current = false }
  }

  // ── Relances ────────────────────────────────────────────────
  async function loadRelances(): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('prospects')
      .select('id, company_name, contact_name, contact_phone, status, next_date, next_action')
      .is('converted_at', null)
      .neq('status', 'Qualifié ✓')
      .neq('status', 'Non qualifié ✗')
      .lt('next_date', today)
      .order('next_date', { ascending: true })
    if (error) throw error
    return (data || []).map(p => {
      const daysLate = Math.floor((Date.now() - new Date(p.next_date).getTime()) / 86400000)
      return {
        id: `relance_${p.id}`, type: 'relance_retard', priority: daysLate > 3 ? 'high' : 'medium',
        title: p.company_name, subtitle: p.contact_name || '',
        detail: `${p.next_action || 'Relancer'} · ${p.status}`,
        amount: 0, daysLate, ficheStatus: 'a_faire', ficheProgress: 0,
        linesTotal: 0, linesComplete: 0, entity_id: p.id, entity: p,
      } as Task
    })
  }

  async function loadRelancesSemaine(): Promise<Task[]> {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const endOfWeek = new Date(today)
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
    const endStr = endOfWeek.toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('prospects')
      .select('id, company_name, contact_name, contact_phone, status, next_date, next_action')
      .is('converted_at', null)
      .neq('status', 'Qualifié ✓')
      .neq('status', 'Non qualifié ✗')
      .gte('next_date', todayStr)
      .lte('next_date', endStr)
      .order('next_date', { ascending: true })
    if (error) throw error
    return (data || []).map(p => {
      const daysUntil = Math.max(0, Math.ceil((new Date(p.next_date).getTime() - Date.now()) / 86400000))
      return {
        id: `rsem_${p.id}`, type: 'relance_semaine' as TaskType,
        priority: (daysUntil === 0 ? 'high' : 'medium') as Priority,
        title: p.company_name, subtitle: p.contact_name || '',
        detail: `${p.next_action || 'Relancer'} · ${p.status} · ${p.next_date}`,
        amount: 0, daysLate: -daysUntil, ficheStatus: 'a_faire' as FicheStatus,
        ficheProgress: 0, linesTotal: 0, linesComplete: 0,
        entity_id: p.id, entity: p,
      } as Task
    })
  }

  async function loadAchats(): Promise<Task[]> {
    const { data: won, error } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, po_number, accounts(name)')
      .eq('status', 'Won')
      .order('amount', { ascending: false })
    if (error) throw error
    if (!won?.length) return []

    const wonIds = won.map((d: any) => d.id)

    // Fetch purchase_info (via server API to bypass RLS) + supply_orders in parallel
    const infoPromises = wonIds.map(wid =>
      authFetch(`/api/purchase-save?opportunity_id=${wid}`).then(r => r.ok ? r.json() : { info: null }).catch(() => ({ info: null }))
    )
    const [supplyRaw, ...infoResults] = await Promise.all([
      authFetch('/api/supply').then(r => r.json()).catch(() => ({ orders: [] })),
      ...infoPromises,
    ])

    // Build set of opportunity_ids that already have a supply_order (commande placée)
    const supplyOrders: any[] = supplyRaw?.orders || []
    const placedOppIds = new Set(supplyOrders.map((o: any) => o.opportunity_id))

    const infoMap = new Map<string, { total: number; complete: number }>()
    wonIds.forEach((wid, idx) => {
      const info = infoResults[idx]?.info
      if (!info) return
      const lines: any[] = info.purchase_lines || []
      const complete = lines.filter((ln: any) => {
        const isPresta = ln.ref?.toUpperCase().includes('PRESTA')
        return Number(ln.pu_achat) > 0 && (isPresta || ln.fournisseur?.trim())
      }).length
      infoMap.set(wid, { total: lines.length, complete })
    })

    return won
      .filter((d: any) => {
        // Exclude deals that already have a supply_order (commande already placed)
        if (placedOppIds.has(d.id)) return false
        return true
      })
      .map((d: any) => {
        const info = infoMap.get(d.id)
        let ficheStatus: FicheStatus = 'a_faire'
        let ficheProgress = 0, linesTotal = 0, linesComplete = 0

        if (info) {
          linesTotal = info.total
          linesComplete = info.complete
          ficheProgress = info.total > 0 ? Math.round((info.complete / info.total) * 100) : 0
          if (info.total > 0 && info.complete === info.total) {
            ficheStatus = 'complete'  // Fiche complete, ready to place order
          } else {
            ficheStatus = 'en_cours'
          }
        }

        return {
          id: `achat_${d.id}`, type: 'achat_manquant' as TaskType,
          priority: 'high' as Priority,
          title: (d.accounts as any)?.name || d.title,
          subtitle: d.title,
          detail: `PO ${d.po_number || '—'} · ${d.bu || '—'}`,
          amount: d.amount || 0, daysLate: 0,
          ficheStatus, ficheProgress, linesTotal, linesComplete,
          entity_id: d.id, entity: { ...d, accounts: d.accounts },
        } as Task
      })
  }

  async function loadClosingRetards(): Promise<Task[]> {
    const now = new Date()
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, booking_month, stage, accounts(name)')
      .eq('status', 'Open')
      .not('booking_month', 'is', null)
      .lt('booking_month', thisM)
      .order('booking_month', { ascending: true })
    if (error) throw error
    return (data || []).map((d: any) => {
      const bm = d.booking_month || ''
      const bmDate = new Date(bm + '-01')
      const daysLate = Math.max(0, Math.floor((now.getTime() - bmDate.getTime()) / 86400000))
      return {
        id: `closing_${d.id}`, type: 'closing_retard' as TaskType,
        priority: (daysLate > 60 ? 'high' : 'medium') as Priority,
        title: (d.accounts as any)?.name || d.title,
        subtitle: d.title,
        detail: `${d.stage} · ${d.bu || '—'} · Closing: ${bm}`,
        amount: d.amount || 0, daysLate,
        ficheStatus: 'a_faire' as FicheStatus,
        ficheProgress: 0, linesTotal: 0, linesComplete: 0,
        entity_id: d.id, entity: d,
      } as Task
    })
  }

  // ── ETA manquante (lignes commandées sans ETA) ────────────
  async function loadEtaManquante(): Promise<Task[]> {
    try {
      const { data: lines, error } = await supabase
        .from('purchase_lines')
        .select('id, designation, qty, fournisseur, contact_fournisseur, eta, line_status, purchase_info!inner(opportunity_id, opportunities!inner(id, title, amount, accounts(name)))')
        .in('line_status', ['commande', 'sous_douane'])
        .is('eta', null)
      if (error || !lines) return []
      return lines.map((l: any) => {
        const opp = l.purchase_info?.opportunities
        return {
          id: `eta_missing_${l.id}`, type: 'eta_manquante' as TaskType,
          priority: 'high' as Priority,
          title: opp?.accounts?.name || opp?.title || '—',
          subtitle: (l.designation || '—').slice(0, 60),
          detail: `📦 ${l.fournisseur || '—'} · ${l.contact_fournisseur || ''} · ETA non définie`,
          amount: opp?.amount || 0, daysLate: 0,
          ficheStatus: 'a_faire' as FicheStatus,
          ficheProgress: 0, linesTotal: 1, linesComplete: 0,
          entity_id: opp?.id || '', entity: opp,
        } as Task
      })
    } catch { return [] }
  }

  // ── Relance fournisseur (ETA ≤ 5 jours ou dépassée) ────────────
  async function loadRelanceFournisseur(): Promise<Task[]> {
    try {
      const today = new Date()
      const fiveDaysOut = new Date(today)
      fiveDaysOut.setDate(today.getDate() + 5)
      const fiveDaysStr = fiveDaysOut.toISOString().split('T')[0]
      const { data: lines, error } = await supabase
        .from('purchase_lines')
        .select('id, designation, qty, fournisseur, contact_fournisseur, email_fournisseur, tel_fournisseur, eta, line_status, status_note, purchase_info!inner(opportunity_id, opportunities!inner(id, title, amount, accounts(name)))')
        .in('line_status', ['commande', 'sous_douane'])
        .not('eta', 'is', null)
        .lte('eta', fiveDaysStr)
      if (error || !lines) return []
      return lines.map((l: any) => {
        const opp = l.purchase_info?.opportunities
        const daysUntil = Math.floor((new Date(l.eta).getTime() - Date.now()) / 86400000)
        const daysLate = daysUntil < 0 ? Math.abs(daysUntil) : 0
        const urgency = daysUntil < 0 ? `${daysLate}j en retard` : daysUntil === 0 ? "aujourd'hui" : `dans ${daysUntil}j`
        return {
          id: `relance_f_${l.id}`, type: 'relance_fournisseur' as TaskType,
          priority: (daysUntil < 0 ? 'high' : 'medium') as Priority,
          title: opp?.accounts?.name || opp?.title || '—',
          subtitle: (l.designation || '—').slice(0, 60),
          detail: `📦 ${l.fournisseur || '—'} · ${l.contact_fournisseur || ''} · ETA: ${l.eta} · ${urgency}${l.status_note ? ` · ${l.status_note}` : ''}`,
          amount: opp?.amount || 0, daysLate,
          ficheStatus: 'en_cours' as FicheStatus,
          ficheProgress: 0, linesTotal: 1, linesComplete: 0,
          entity_id: opp?.id || '', entity: { ...opp, email_fournisseur: l.email_fournisseur, tel_fournisseur: l.tel_fournisseur, fournisseur: l.fournisseur },
        } as Task
      })
    } catch { return [] }
  }

  // ── Deal relances (next_step_date) ────────────────────────
  async function loadDealRelances(): Promise<Task[]> {
    try {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      // Load Open deals with next_step_date set (overdue + upcoming 7 days)
      const endOfWeek = new Date(today)
      endOfWeek.setDate(today.getDate() + 7)
      const endStr = endOfWeek.toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, title, amount, bu, stage, next_step, next_step_date, accounts(name)')
        .eq('status', 'Open')
        .not('next_step_date', 'is', null)
        .lte('next_step_date', endStr)
        .order('next_step_date', { ascending: true })
      if (error || !data) return []
      return data.map((d: any) => {
        const stepDate = new Date(d.next_step_date)
        const daysLate = Math.floor((today.getTime() - stepDate.getTime()) / 86400000)
        const isOverdue = d.next_step_date < todayStr
        const isToday = d.next_step_date === todayStr
        return {
          id: `deal_rel_${d.id}`, type: 'deal_relance' as TaskType,
          priority: (isOverdue || isToday ? 'high' : 'medium') as Priority,
          title: (d.accounts as any)?.name || d.title,
          subtitle: d.title,
          detail: `${d.next_step || 'Suivre'} · ${d.stage || '—'} · ${d.bu || '—'}`,
          amount: d.amount || 0, daysLate: isOverdue ? daysLate : -daysLate,
          ficheStatus: 'a_faire' as FicheStatus,
          ficheProgress: 0, linesTotal: 0, linesComplete: 0,
          entity_id: d.id, entity: d,
        } as Task
      })
    } catch { return [] }
  }

  // ── Comptes incomplets (créés récemment, infos manquantes) ────
  async function loadComptesIncomplets(): Promise<Task[]> {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffStr = cutoff.toISOString()
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, name, sector, region, segment, created_at')
        .gte('created_at', cutoffStr)
      if (error || !accounts) return []

      // Get contacts for these accounts
      const accIds = accounts.map(a => a.id)
      if (accIds.length === 0) return []
      const { data: contacts } = await supabase
        .from('account_contacts')
        .select('account_id, email, phone')
        .in('account_id', accIds)

      const contactInfo: Record<string, { hasEmail: boolean; hasPhone: boolean; count: number }> = {}
      for (const c of (contacts || [])) {
        if (!contactInfo[c.account_id]) contactInfo[c.account_id] = { hasEmail: false, hasPhone: false, count: 0 }
        contactInfo[c.account_id].count++
        if (c.email) contactInfo[c.account_id].hasEmail = true
        if (c.phone) contactInfo[c.account_id].hasPhone = true
      }

      return accounts
        .filter(a => {
          const missing: string[] = []
          if (!a.sector) missing.push('secteur')
          if (!a.region) missing.push('région')
          if (!a.segment) missing.push('segment')
          const ci = contactInfo[a.id]
          if (!ci || ci.count === 0) missing.push('contact')
          else {
            if (!ci.hasEmail) missing.push('email contact')
            if (!ci.hasPhone) missing.push('tél contact')
          }
          return missing.length > 0
        })
        .map(a => {
          const missing: string[] = []
          if (!a.sector) missing.push('secteur')
          if (!a.region) missing.push('région')
          if (!a.segment) missing.push('segment')
          const ci = contactInfo[a.id]
          if (!ci || ci.count === 0) missing.push('contact')
          else {
            if (!ci.hasEmail) missing.push('email')
            if (!ci.hasPhone) missing.push('tél')
          }
          return {
            id: `compte_${a.id}`, type: 'compte_incomplet' as TaskType,
            priority: 'medium' as Priority,
            title: a.name, subtitle: 'Fiche incomplète',
            detail: `Manque : ${missing.join(', ')}`,
            amount: 0, daysLate: 0,
            ficheStatus: 'a_faire' as FicheStatus,
            ficheProgress: 0, linesTotal: missing.length, linesComplete: 0,
            entity_id: a.id,
          } as Task
        })
    } catch { return [] }
  }

  // ── Renouvellements garantie ────────────────────────────
  async function loadWarranties(): Promise<WarrantyItem[]> {
    try {
      const { data: lines, error } = await supabase
        .from('purchase_lines')
        .select('id, designation, warranty_months, purchase_info!inner(opportunity_id, opportunities!inner(id, title, po_date, accounts(name)))')
        .gt('warranty_months', 0)
      if (error || !lines) return []
      const now = new Date()
      const items: WarrantyItem[] = []
      for (const l of lines as any[]) {
        const opp = l.purchase_info?.opportunities
        if (!opp?.po_date) continue
        const poDate = new Date(opp.po_date)
        const expiryDate = new Date(poDate)
        expiryDate.setMonth(expiryDate.getMonth() + Number(l.warranty_months))
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000)
        if (daysLeft > 90) continue // only show within 90 days
        items.push({
          id: l.id,
          designation: l.designation || '—',
          client: opp?.accounts?.name || opp?.title || '—',
          warrantyMonths: l.warranty_months,
          expiryDate,
          daysLeft,
          opportunityId: opp?.id || '',
        })
      }
      return items.sort((a, b) => a.daysLeft - b.daysLeft)
    } catch { return [] }
  }

  // ── Renouvellements licence ────────────────────────────
  async function loadLicenses(): Promise<LicenseItem[]> {
    try {
      const { data: lines, error } = await supabase
        .from('purchase_lines')
        .select('id, designation, license_months, purchase_info!inner(opportunity_id, opportunities!inner(id, title, po_date, accounts(name)))')
        .gt('license_months', 0)
      if (error || !lines) return []
      const now = new Date()
      const items: LicenseItem[] = []
      for (const l of lines as any[]) {
        const opp = l.purchase_info?.opportunities
        if (!opp?.po_date) continue
        const poDate = new Date(opp.po_date)
        const expiryDate = new Date(poDate)
        expiryDate.setMonth(expiryDate.getMonth() + Number(l.license_months))
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000)
        if (daysLeft > 90) continue
        items.push({
          id: l.id,
          designation: l.designation || '—',
          client: opp?.accounts?.name || opp?.title || '—',
          licenseMonths: l.license_months,
          expiryDate,
          daysLeft,
          opportunityId: opp?.id || '',
        })
      }
      return items.sort((a, b) => a.daysLeft - b.daysLeft)
    } catch { return [] }
  }

  // ── DR à renouveler ────────────────────────────
  async function loadDRs(): Promise<DRItem[]> {
    try {
      const now = new Date()
      const in30 = new Date(now)
      in30.setDate(in30.getDate() + 30)
      const in30Str = in30.toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('deal_registrations')
        .select('id, dr_number, bu, card, expiry_date, opportunity_id, opportunities(id, title)')
        .lte('expiry_date', in30Str)
        .order('expiry_date', { ascending: true })
      if (error || !data) return []
      return data.map((d: any) => {
        const daysLeft = Math.ceil((new Date(d.expiry_date).getTime() - now.getTime()) / 86400000)
        return {
          id: d.id,
          drNumber: d.dr_number || '—',
          card: d.card || '—',
          bu: d.bu || '—',
          dealTitle: d.opportunities?.title || '—',
          expiryDate: d.expiry_date,
          daysLeft,
          opportunityId: d.opportunity_id || d.opportunities?.id || '',
        }
      })
    } catch { return [] }
  }

  // ── Factures échues ────────────────────────────
  async function loadOverdueInvoices(): Promise<InvoiceItem[]> {
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, due_date, status, opportunity_id, opportunities(id, title)')
        .lt('due_date', todayStr)
        .neq('status', 'payee')
        .order('due_date', { ascending: true })
      if (error || !data) return []
      const now = new Date()
      return data.map((d: any) => ({
        id: d.id,
        invoiceNumber: d.invoice_number || '—',
        dealTitle: d.opportunities?.title || '—',
        amount: Number(d.amount) || 0,
        dueDate: d.due_date,
        daysOverdue: Math.floor((now.getTime() - new Date(d.due_date).getTime()) / 86400000),
        status: d.status as InvoiceStatus,
        opportunityId: d.opportunity_id || d.opportunities?.id || '',
      }))
    } catch { return [] }
  }

  // ── Échéances paiement (rappels 7j avant) ────────────
  async function loadPaymentReminders(): Promise<PaymentReminderItem[]> {
    try {
      // Get all Won deals that have payment_terms set
      const { data: infos, error } = await supabase
        .from('purchase_info')
        .select('opportunity_id, payment_terms, opportunities!inner(id, title, amount, po_date, accounts(id, name))')
        .not('payment_terms', 'is', null)
      if (error || !infos) return []

      // Get supply orders for delivery dates
      const oppIds = infos.map((i: any) => i.opportunity_id)
      if (oppIds.length === 0) return []
      const supplyRes = await authFetch('/api/supply').then(r => r.ok ? r.json() : { orders: [] }).catch(() => ({ orders: [] }))
      const allOrders = (supplyRes?.orders || []) as any[]
      const orderMap = new Map<string, any>()
      for (const o of allOrders) if (oppIds.includes(o.opportunity_id)) orderMap.set(o.opportunity_id, o)

      // Get account contacts for emails
      const accountIds = [...new Set(infos.map((i: any) => i.opportunities?.accounts?.id).filter(Boolean))]
      const { data: contacts } = accountIds.length > 0
        ? await supabase.from('account_contacts').select('account_id, full_name, email').in('account_id', accountIds)
        : { data: [] }
      const contactMap = new Map<string, { names: string[]; emails: string[] }>()
      for (const c of (contacts || [])) {
        if (!contactMap.has(c.account_id)) contactMap.set(c.account_id, { names: [], emails: [] })
        const entry = contactMap.get(c.account_id)!
        if (c.full_name) entry.names.push(c.full_name)
        if (c.email) entry.emails.push(c.email)
      }

      const now = new Date()
      const items: PaymentReminderItem[] = []

      for (const info of infos as any[]) {
        const opp = info.opportunities
        if (!opp) continue
        let parsed: any
        try { parsed = JSON.parse(info.payment_terms) } catch { continue }
        if (!parsed?.milestones) continue
        const dealAmount = Number(opp.amount) || 0
        const poDate = opp.po_date ? new Date(opp.po_date) : null
        const order = orderMap.get(info.opportunity_id)
        const accountId = opp.accounts?.id || ''
        const clientName = opp.accounts?.name || opp.title
        const ci = contactMap.get(accountId)

        for (const ms of parsed.milestones) {
          let dueDate: Date | null = null
          const trigger = ms.trigger as string

          if (trigger === 'commande' && poDate) {
            dueDate = new Date(poDate)
          } else if (trigger === 'livraison' && order?.delivered_at) {
            dueDate = new Date(order.delivered_at)
          } else if (trigger === '30j' && poDate) {
            dueDate = new Date(poDate); dueDate.setDate(dueDate.getDate() + 30)
          } else if (trigger === '60j' && poDate) {
            dueDate = new Date(poDate); dueDate.setDate(dueDate.getDate() + 60)
          } else if (trigger === '90j' && poDate) {
            dueDate = new Date(poDate); dueDate.setDate(dueDate.getDate() + 90)
          } else if (trigger === 'pv_final') {
            // No automatic date — skip for now
            continue
          } else if (trigger === 'fin_garantie') {
            // Would need warranty end date — skip for now
            continue
          } else {
            continue
          }

          if (!dueDate) continue
          const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
          // Show if within 7 days from now or overdue (up to 60 days overdue)
          if (daysUntil > 7 || daysUntil < -60) continue

          items.push({
            id: `pay_${info.opportunity_id}_${trigger}_${ms.pct}`,
            dealTitle: opp.title || '—',
            client: clientName,
            accountId,
            opportunityId: opp.id,
            milestoneLabel: ms.label || trigger,
            milestonePct: ms.pct || 0,
            amount: Math.round(dealAmount * (ms.pct || 0) / 100),
            dueDate: dueDate.toISOString().split('T')[0],
            daysUntil,
            trigger,
            totalDealAmount: dealAmount,
            clientEmails: ci?.emails || [],
            clientContacts: ci?.names || [],
          })
        }
      }

      return items.sort((a, b) => a.daysUntil - b.daysUntil)
    } catch (e) {
      console.warn('loadPaymentReminders error:', e)
      return []
    }
  }

  // ── Filtered & sorted ────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let res = tasks.filter(t => {
      if (q && !t.title.toLowerCase().includes(q) && !t.subtitle.toLowerCase().includes(q)) return false
      if (typeFilter !== 'Tous' && t.type !== typeFilter) return false
      if (prioFilter !== 'Tous' && t.priority !== prioFilter) return false
      if (statusFilter !== 'Tous' && t.ficheStatus !== statusFilter) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    const statusOrder: Record<FicheStatus, number> = { en_cours: 0, a_faire: 1, complete: 2 }
    return [...res].sort((a, b) => {
      if (sortKey === 'priority')    return dir * ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      if (sortKey === 'amount')      return dir * (b.amount - a.amount)
      if (sortKey === 'daysLate')    return dir * (b.daysLate - a.daysLate)
      if (sortKey === 'title')       return dir * a.title.localeCompare(b.title, 'fr')
      if (sortKey === 'ficheStatus') return dir * (statusOrder[a.ficheStatus] - statusOrder[b.ficheStatus])
      return 0
    })
  }, [tasks, search, typeFilter, prioFilter, statusFilter, sortKey, sortDir])

  const relances        = useMemo(() => visible.filter(t => t.type === 'relance_retard'), [visible])
  const relancesSemaine = useMemo(() => visible.filter(t => t.type === 'relance_semaine'), [visible])
  const achats          = useMemo(() => visible.filter(t => t.type === 'achat_manquant'), [visible])
  const closingRetards  = useMemo(() => visible.filter(t => t.type === 'closing_retard'), [visible])
  const etaManquantes       = useMemo(() => visible.filter(t => t.type === 'eta_manquante'), [visible])
  const relanceFournisseur  = useMemo(() => visible.filter(t => t.type === 'relance_fournisseur'), [visible])
  const dealRelances    = useMemo(() => visible.filter(t => t.type === 'deal_relance'), [visible])
  const comptesIncomplets = useMemo(() => visible.filter(t => t.type === 'compte_incomplet'), [visible])

  // Global counts for KPIs (unfiltered)
  const allRelances = useMemo(() => tasks.filter(t => t.type === 'relance_retard'), [tasks])
  const allAchats   = useMemo(() => tasks.filter(t => t.type === 'achat_manquant'), [tasks])
  const allClosing  = useMemo(() => tasks.filter(t => t.type === 'closing_retard'), [tasks])
  const allSemaine  = useMemo(() => tasks.filter(t => t.type === 'relance_semaine'), [tasks])
  const allDealRel  = useMemo(() => tasks.filter(t => t.type === 'deal_relance'), [tasks])
  const allComptes    = useMemo(() => tasks.filter(t => t.type === 'compte_incomplet'), [tasks])
  const allEtaManq    = useMemo(() => tasks.filter(t => t.type === 'eta_manquante'), [tasks])
  const allRelanceF   = useMemo(() => tasks.filter(t => t.type === 'relance_fournisseur'), [tasks])
  const totalAchatAmt = allAchats.reduce((s, t) => s + t.amount, 0)
  const closingAmt    = allClosing.reduce((s, t) => s + t.amount, 0)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  function SI({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 shrink-0" />
    return sortDir === 'desc' ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />
  }
  function TH({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap
          ${right ? 'text-right' : 'text-left'}
          ${sortKey === col ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
        <span className="inline-flex items-center gap-1">{!right && label}<SI col={col} />{right && label}</span>
      </th>
    )
  }

  const hasActiveFilters = search || typeFilter !== 'Tous' || prioFilter !== 'Tous' || statusFilter !== 'Tous'
  function resetFilters() { setSearch(''); setTypeFilter('Tous'); setPrioFilter('Tous'); setStatusFilter('Tous') }

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const spec = {
        filename: `taches_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Tâches',
          title: `Tâches CRM · ${visible.length} tâches · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Type','Priorité','Titre','Détail','Montant (MAD)','Retard (j)','Statut fiche'],
          rows: visible.map(t => [
            TYPE_LABELS[t.type] || t.type,
            t.priority === 'high' ? 'Haute' : 'Moyenne',
            t.title, t.detail, t.amount, t.daysLate,
            STATUS_CFG[t.ficheStatus]?.label || t.ficheStatus,
          ]),
          totalsRow: ['TOTAL', `${visible.length} tâches`, '', '', visible.reduce((s,t)=>s+t.amount,0), '', ''],
          notes: `Commandes à placer: ${allAchats.length} · Relances retard: ${allRelances.length} · Closing retard: ${allClosing.length} · Relances semaine: ${allSemaine.length}`,
        }],
        summary: {
          title: `Résumé Tâches · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total tâches', value: tasks.length, detail: `${allAchats.length} commandes + ${allRelances.length} relances + ${allClosing.length} closing + ${allSemaine.length} semaine` },
            { label: 'Urgentes (haute priorité)', value: tasks.filter(t => t.priority === 'high').length, detail: 'Nécessitent une action immédiate' },
            { label: 'CA commandes à placer', value: totalAchatAmt, detail: `${allAchats.length} commandes en attente` },
            { label: 'CA closing retard', value: closingAmt, detail: `${allClosing.length} deals en retard` },
          ],
          breakdownTitle: 'Répartition par type',
          breakdownHeaders: ['Type', 'Nombre', 'Urgentes', 'Montant (MAD)'],
          breakdown: [
            ['Commandes à placer', allAchats.length, allAchats.filter(t=>t.priority==='high').length, totalAchatAmt],
            ['Relances retard', allRelances.length, allRelances.filter(t=>t.priority==='high').length, 0],
            ['Closing retard', allClosing.length, allClosing.filter(t=>t.priority==='high').length, closingAmt],
            ['Relances semaine', allSemaine.length, allSemaine.filter(t=>t.priority==='high').length, 0],
          ],
        },
      }
      const res = await authFetch('/api/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message || 'Erreur export') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Centre de tâches</h1>
              <p className="text-xs text-slate-500">{visible.length} affichées · {tasks.length} total</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={exporting}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export…' : 'Excel'}
            </button>
          </div>
        </div>

        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KPICard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Total tâches"
            value={String(tasks.length)}
            sub={`${tasks.filter(t => t.priority === 'high').length} urgentes`}
            color="slate"
            active={typeFilter === 'Tous'}
            onClick={() => setTypeFilter('Tous')}
          />
          <KPICard
            icon={<Crosshair className="h-4 w-4" />}
            label="Suivi deals"
            value={String(allDealRel.length)}
            sub={allDealRel.filter(t => t.daysLate > 0).length + ' en retard'}
            color="indigo"
            active={typeFilter === 'deal_relance'}
            onClick={() => setTypeFilter(typeFilter === 'deal_relance' ? 'Tous' : 'deal_relance')}
          />
          <KPICard
            icon={<FileText className="h-4 w-4" />}
            label="Commandes à placer"
            value={String(allAchats.length)}
            sub={totalAchatAmt > 0 ? `${fmt(totalAchatAmt)} MAD` : '0 MAD'}
            color="amber"
            active={typeFilter === 'achat_manquant'}
            onClick={() => setTypeFilter(typeFilter === 'achat_manquant' ? 'Tous' : 'achat_manquant')}
          />
          <KPICard
            icon={<Clock className="h-4 w-4" />}
            label="Relances retard"
            value={String(allRelances.length)}
            sub={allRelances.filter(t => t.daysLate > 7).length + ' > 7 jours'}
            color="red"
            active={typeFilter === 'relance_retard'}
            onClick={() => setTypeFilter(typeFilter === 'relance_retard' ? 'Tous' : 'relance_retard')}
          />
          <KPICard
            icon={<CalendarClock className="h-4 w-4" />}
            label="Relances semaine"
            value={String(allSemaine.length)}
            sub={allSemaine.filter(t => t.daysLate === 0).length + " aujourd'hui"}
            color="blue"
            active={typeFilter === 'relance_semaine'}
            onClick={() => setTypeFilter(typeFilter === 'relance_semaine' ? 'Tous' : 'relance_semaine')}
          />
          <KPICard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Closing retard"
            value={String(allClosing.length)}
            sub={closingAmt > 0 ? `${fmt(closingAmt)} MAD` : '0 MAD'}
            color="orange"
            active={typeFilter === 'closing_retard'}
            onClick={() => setTypeFilter(typeFilter === 'closing_retard' ? 'Tous' : 'closing_retard')}
          />
          <KPICard
            icon={<Users className="h-4 w-4" />}
            label="Fiches compte"
            value={String(allComptes.length)}
            sub="infos à compléter"
            color="violet"
            active={typeFilter === 'compte_incomplet'}
            onClick={() => setTypeFilter(typeFilter === 'compte_incomplet' ? 'Tous' : 'compte_incomplet')}
          />
          <KPICard
            icon={<Package className="h-4 w-4" />}
            label="ETA manquante"
            value={String(allEtaManq.length)}
            sub="à renseigner"
            color="orange"
            active={typeFilter === 'eta_manquante'}
            onClick={() => setTypeFilter(typeFilter === 'eta_manquante' ? 'Tous' : 'eta_manquante')}
          />
          <KPICard
            icon={<Phone className="h-4 w-4" />}
            label="Relance fourn."
            value={String(allRelanceF.length)}
            sub={allRelanceF.filter(t => t.daysLate > 0).length + ' en retard'}
            color="amber"
            active={typeFilter === 'relance_fournisseur'}
            onClick={() => setTypeFilter(typeFilter === 'relance_fournisseur' ? 'Tous' : 'relance_fournisseur')}
          />
        </div>

        {/* ── KPI STRIP 2 — Renewals, Invoices & Payments ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard
            icon={<Shield className="h-4 w-4" />}
            label="Garanties"
            value={String(warranties.length)}
            sub={warranties.filter(w => w.daysLeft < 30).length + ' < 30 jours'}
            color="emerald"
            active={false}
            onClick={() => {
              const el = document.getElementById('section-warranties')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <KPICard
            icon={<Key className="h-4 w-4" />}
            label="Licences"
            value={String(licenses.length)}
            sub={licenses.filter(l => l.daysLeft < 30).length + ' < 30 jours'}
            color="violet"
            active={false}
            onClick={() => {
              const el = document.getElementById('section-licenses')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <KPICard
            icon={<BookOpen className="h-4 w-4" />}
            label="DR a renouveler"
            value={String(drs.length)}
            sub={drs.filter(d => d.daysLeft < 0).length + ' expirees'}
            color="teal"
            active={false}
            onClick={() => {
              const el = document.getElementById('section-drs')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <KPICard
            icon={<Receipt className="h-4 w-4" />}
            label="Factures echues"
            value={String(overdueInvoices.length)}
            sub={overdueInvoices.length > 0 ? mad(overdueInvoices.reduce((s, i) => s + i.amount, 0)) : '0 MAD'}
            color="rose"
            active={false}
            onClick={() => {
              const el = document.getElementById('section-invoices')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <KPICard
            icon={<Banknote className="h-4 w-4" />}
            label="Echeances paiem."
            value={String(paymentReminders.length)}
            sub={paymentReminders.filter(p => p.daysUntil < 0).length + ' en retard'}
            color="amber"
            active={false}
            onClick={() => {
              const el = document.getElementById('section-payments')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
        </div>

        {/* ── PLAN DU JOUR ── */}
        {!loading && tasks.length > 0 && (() => {
          const annualTarget = getAnnualTarget()
          const now = new Date()
          const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
          const pctYear = dayOfYear / 365
          const expectedWon = annualTarget * pctYear
          const gap = expectedWon - wonYTD
          const todayRelances = allSemaine.filter(t => t.daysLate === 0).length
          const urgentCount = tasks.filter(t => t.priority === 'high').length
          const monthlyTarget = annualTarget / 12
          const monthProgress = wonYTD > 0 ? Math.min(100, Math.round((wonYTD / annualTarget) * 100)) : 0

          // Smart recommendations
          const tips: string[] = []
          const dealRelOverdue = allDealRel.filter(t => t.daysLate > 0).length
          const dealRelToday = allDealRel.filter(t => t.daysLate === 0).length
          if (dealRelToday > 0) tips.push(`🎯 ${dealRelToday} deal${dealRelToday > 1 ? 's' : ''} à suivre aujourd'hui`)
          if (dealRelOverdue > 0) tips.push(`⚠️ ${dealRelOverdue} suivi${dealRelOverdue > 1 ? 's' : ''} deal en retard — rappelle tes prospects !`)
          if (allRelances.length > 5) tips.push(`🔴 ${allRelances.length} relances en retard — priorise les plus anciennes`)
          if (allAchats.length > 0) tips.push(`📋 ${allAchats.length} commande${allAchats.length > 1 ? 's' : ''} à placer (${fmt(totalAchatAmt)} MAD)`)
          if (allClosing.length > 3) tips.push(`⏰ ${allClosing.length} deals avec closing dépassé — requalifie ou relance`)
          if (gap > 0) tips.push(`📈 Retard vs objectif annuel : ${fmt(gap)} MAD — accélère le closing`)
          if (gap <= 0) tips.push(`🏆 En avance sur l'objectif annuel de ${fmt(Math.abs(gap))} MAD — continue !`)
          if (todayRelances > 0) tips.push(`📞 ${todayRelances} prospect${todayRelances > 1 ? 's' : ''} à appeler aujourd'hui`)
          if (openPipeline > monthlyTarget * 3) tips.push(`💰 Pipeline solide (${fmt(openPipeline)} MAD) — focus sur le taux de conversion`)

          return (
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Sun className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-black text-slate-900">Plan du jour</span>
                <span className="text-xs text-slate-500">· {now.toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>

              {/* Target progress */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
                <div className="rounded-xl bg-white/80 border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Objectif annuel</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 tabular-nums">{fmt(wonYTD)} <span className="text-xs font-medium text-slate-400">/ {fmt(annualTarget)} MAD</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${monthProgress >= 80 ? 'bg-emerald-500' : monthProgress >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${monthProgress}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">{monthProgress}% atteint · Attendu : {Math.round(pctYear * 100)}%</div>
                </div>
                <div className="rounded-xl bg-white/80 border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions du jour</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <div>
                      <span className="text-2xl font-black text-slate-900">{todayRelances + urgentCount}</span>
                      <span className="text-xs text-slate-400 ml-1">actions</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{todayRelances} appels · {urgentCount} urgentes</div>
                </div>
                <div className="rounded-xl bg-white/80 border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pipeline Open</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 tabular-nums">{fmt(openPipeline)} <span className="text-xs font-medium text-slate-400">MAD</span></div>
                  <div className="mt-1 text-[10px] text-slate-500">{tasks.length} tâches en attente</div>
                </div>
              </div>

              {/* Smart tips */}
              {tips.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-400">Recommandations</div>
                  {tips.slice(0, 4).map((tip, i) => (
                    <div key={i} className="text-xs text-slate-600 leading-relaxed">{tip}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── TOOLBAR ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')}><X className="h-3.5 w-3.5 text-slate-300 hover:text-slate-600" /></button>}
          </div>

          {/* Priority filter */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['Tous', 'high', 'medium'] as const).map(p => (
              <button key={p} onClick={() => setPrioFilter(p)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
                  ${prioFilter === p ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {p === 'Tous' ? 'Toutes priorités' : p === 'high' ? '🔴 Urgent' : '🟡 Normal'}
              </button>
            ))}
          </div>

          {/* Fiche status filter (only for achat type) */}
          {(typeFilter === 'Tous' || typeFilter === 'achat_manquant') && (
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
              {([
                { key: 'Tous',     label: 'Tout statut' },
                { key: 'a_faire',  label: 'À faire' },
                { key: 'en_cours', label: 'En cours' },
                { key: 'complete', label: 'Prêt à placer' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setStatusFilter(key as any)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
                    ${statusFilter === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-500 hover:text-red-500 transition-colors">
                <X className="h-3 w-3" /> Réinitialiser
              </button>
            )}
            <span className="text-xs text-slate-400">{visible.length} tâche{visible.length > 1 ? 's' : ''}</span>
          </div>
        </div>

        {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{err}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Chargement des tâches…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <CheckCircle2 className="mb-3 h-14 w-14 text-emerald-400" />
            <div className="text-lg font-bold text-slate-700">
              {tasks.length === 0 ? 'Tout est à jour !' : 'Aucun résultat pour ces filtres'}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {tasks.length === 0 ? 'Aucune tâche en attente' : 'Essayez de modifier vos filtres'}
            </p>
            {tasks.length > 0 && (
              <button onClick={resetFilters} className="mt-3 text-sm text-blue-600 hover:underline font-semibold">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Commandes à placer ── */}
            {achats.length > 0 && (typeFilter === 'Tous' || typeFilter === 'achat_manquant') && (
              <TaskSection
                icon={<FileText className="h-4 w-4" />}
                title="Commandes à placer"
                count={achats.length}
                colorScheme="amber"
                amount={achats.reduce((s,t)=>s+t.amount,0)}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Deal</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Info</th>
                      <TH col="amount" label="Montant" right />
                      <TH col="ficheStatus" label="Avancement" />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {achats.map(t => {
                      const cfg = STATUS_CFG[t.ficheStatus]
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                              <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px]">
                            <span className="truncate block">{t.subtitle}</span>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-slate-400">{t.detail}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                            {t.amount > 0 ? mad(t.amount) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${cfg.badge}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                              {t.ficheStatus === 'en_cours' && t.linesTotal > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${t.ficheProgress}%` }} />
                                  </div>
                                  <span className="text-[10px] font-semibold text-slate-500">{t.linesComplete}/{t.linesTotal}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button onClick={() => router.push(`/opportunities/${t.entity_id}/purchase`)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white transition-colors shadow-sm
                                  ${t.ficheStatus === 'complete' ? 'bg-emerald-600 hover:bg-emerald-700' : t.ficheStatus === 'en_cours' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                                <Package className="h-3.5 w-3.5" />
                                {t.ficheStatus === 'complete' ? 'Prêt à placer' : t.ficheStatus === 'en_cours' ? 'Continuer' : 'Remplir fiche'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Suivi deals (next_step_date) ── */}
            {dealRelances.length > 0 && (typeFilter === 'Tous' || typeFilter === 'deal_relance') && (
              <TaskSection
                icon={<Crosshair className="h-4 w-4" />}
                title="Suivi deals — prochaines actions"
                count={dealRelances.length}
                colorScheme="indigo"
                amount={dealRelances.reduce((s,t)=>s+t.amount,0)}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Action / Etape</th>
                      <TH col="amount" label="Montant" right />
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Quand</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dealRelances.map(t => {
                      const isOverdue = t.daysLate > 0
                      const isToday = t.daysLate === 0
                      const daysAbs = Math.abs(t.daysLate)
                      const dayLabel = isOverdue ? `${daysAbs}j retard` : isToday ? "Aujourd'hui" : daysAbs === 1 ? 'Demain' : `Dans ${daysAbs}j`
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${isOverdue || isToday ? 'bg-red-500' : 'bg-indigo-400'} ${isToday ? 'animate-pulse' : ''}`} />
                              <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px]">
                            <span className="truncate block">{t.subtitle}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px]">
                            <span className="truncate block">{t.detail}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                            {t.amount > 0 ? mad(t.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                              ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-600'}`}>
                              {dayLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button onClick={() => router.push(`/opportunities/${t.entity_id}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm">
                                Suivre <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Relances retard ── */}
            {relances.length > 0 && (typeFilter === 'Tous' || typeFilter === 'relance_retard') && (
              <TaskSection
                icon={<Clock className="h-4 w-4" />}
                title="Relances en retard"
                count={relances.length}
                colorScheme="red">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Prospect" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Action prévue</th>
                      <TH col="daysLate" label="Retard" right />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {relances.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.subtitle || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{t.entity?.next_action || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                            ${t.daysLate > 7 ? 'bg-red-100 text-red-700' : t.daysLate > 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {t.daysLate}j
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {t.entity?.contact_phone && (
                              <a href={`tel:${t.entity.contact_phone}`} title={t.entity.contact_phone}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <a href="/prospection"
                              className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              Voir <ChevronRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Relances cette semaine ── */}
            {relancesSemaine.length > 0 && (typeFilter === 'Tous' || typeFilter === 'relance_semaine') && (
              <TaskSection
                icon={<CalendarClock className="h-4 w-4" />}
                title="Relances cette semaine"
                count={relancesSemaine.length}
                colorScheme="blue">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Prospect" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Action prévue</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Quand</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {relancesSemaine.map(t => {
                      const daysUntil = Math.abs(t.daysLate)
                      const dayLabel = daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? 'Demain' : `Dans ${daysUntil}j`
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${daysUntil === 0 ? 'bg-red-500 animate-pulse' : 'bg-blue-400'}`} />
                              <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{t.subtitle || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{t.entity?.next_action || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                              ${daysUntil === 0 ? 'bg-red-100 text-red-700' : daysUntil <= 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                              {dayLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {t.entity?.contact_phone && (
                                <a href={`tel:${t.entity.contact_phone}`} title={t.entity.contact_phone}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                  <Phone className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <a href="/prospection"
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                Voir <ChevronRight className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Closing en retard ── */}
            {closingRetards.length > 0 && (typeFilter === 'Tous' || typeFilter === 'closing_retard') && (
              <TaskSection
                icon={<TrendingUp className="h-4 w-4" />}
                title="Deals — closing dépassé"
                count={closingRetards.length}
                colorScheme="orange"
                amount={closingRetards.reduce((s,t)=>s+t.amount,0)}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal · Étape</th>
                      <TH col="amount" label="Montant" right />
                      <TH col="daysLate" label="Retard" right />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {closingRetards.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-xs text-slate-700 truncate block">{t.subtitle}</span>
                          <span className="text-[10px] text-slate-400">{t.detail}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                          {t.amount > 0 ? mad(t.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                            ${t.daysLate > 60 ? 'bg-red-100 text-red-700' : t.daysLate > 30 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {t.daysLate}j
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <button onClick={() => router.push(`/opportunities/${t.entity_id}`)}
                              className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                              Voir <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── ETA manquante ── */}
            {etaManquantes.length > 0 && (typeFilter === 'Tous' || typeFilter === 'eta_manquante') && (
              <TaskSection
                icon={<Package className="h-4 w-4" />}
                title="ETA manquante — à renseigner"
                count={etaManquantes.length}
                colorScheme="orange"
                amount={etaManquantes.reduce((s,t)=>s+t.amount,0)}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Ligne · Fournisseur</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Statut</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {etaManquantes.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-orange-500" />
                            <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="text-xs text-slate-700 truncate block">{t.subtitle}</span>
                          <span className="text-[10px] text-slate-400">{t.detail}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-orange-100 text-orange-700">ETA manquante</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            {t.entity_id && (
                              <button onClick={() => router.push(`/opportunities/${t.entity_id}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors">
                                Ajouter ETA <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Relance fournisseur ── */}
            {relanceFournisseur.length > 0 && (typeFilter === 'Tous' || typeFilter === 'relance_fournisseur') && (
              <TaskSection
                icon={<Phone className="h-4 w-4" />}
                title="Relance fournisseur"
                count={relanceFournisseur.length}
                colorScheme="amber"
                amount={relanceFournisseur.reduce((s,t)=>s+t.amount,0)}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <TH col="title" label="Compte" />
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Ligne · Fournisseur</th>
                      <TH col="amount" label="Montant" right />
                      <TH col="daysLate" label="Délai" right />
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {relanceFournisseur.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${t.daysLate > 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="text-xs text-slate-700 truncate block">{t.subtitle}</span>
                          <span className="text-[10px] text-slate-400">{t.detail}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                          {t.amount > 0 ? mad(t.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                            ${t.daysLate > 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {t.daysLate > 0 ? `${t.daysLate}j retard` : t.detail?.match(/dans \d+j/)?.[0] || 'bientôt'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            {t.entity?.tel_fournisseur && (
                              <a href={`tel:${t.entity.tel_fournisseur}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                                title={`Appeler ${t.entity.fournisseur}`}>
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {t.entity?.email_fournisseur && (
                              <a href={`mailto:${t.entity.email_fournisseur}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title={`Email ${t.entity.fournisseur}`}>
                                <Mail className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {t.entity_id && (
                              <button onClick={() => router.push(`/opportunities/${t.entity_id}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                Voir <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Fiches compte incomplètes ── */}
            {comptesIncomplets.length > 0 && (typeFilter === 'Tous' || typeFilter === 'compte_incomplet') && (
              <TaskSection
                icon={<Users className="h-4 w-4" />}
                title="Fiches compte à compléter"
                count={comptesIncomplets.length}
                colorScheme="violet">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-xs text-slate-500">
                      <th className="px-4 py-2.5 text-left font-semibold">Compte</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Infos manquantes</th>
                      <th className="px-4 py-2.5 text-center font-semibold w-[120px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comptesIncomplets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{t.title}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.detail}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <button onClick={() => router.push(`/accounts/${t.entity_id}`)}
                              className="inline-flex h-8 items-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 transition-colors shadow-sm">
                              Compléter <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TaskSection>
            )}

            {/* ── Renouvellements Garantie ── */}
            {warranties.length > 0 && typeFilter === 'Tous' && (
              <div id="section-warranties">
                <TaskSection
                  icon={<Shield className="h-4 w-4" />}
                  title="Renouvellements garantie"
                  count={warranties.length}
                  colorScheme="emerald">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Client</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Garantie</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiration</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Jours restants</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {warranties.map(w => (
                        <tr key={w.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 text-xs">{w.designation}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{w.client}</td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{w.warrantyMonths} mois</td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{fmtDate(w.expiryDate.toISOString())}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                              ${w.daysLeft < 0 ? 'bg-red-100 text-red-700' : w.daysLeft < 30 ? 'bg-red-100 text-red-700' : w.daysLeft < 60 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {w.daysLeft < 0 ? `${Math.abs(w.daysLeft)}j expire` : `${w.daysLeft}j`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button onClick={() => router.push(`/opportunities/${w.opportunityId}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                Voir <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TaskSection>
              </div>
            )}

            {/* ── Renouvellements Licence ── */}
            {licenses.length > 0 && typeFilter === 'Tous' && (
              <div id="section-licenses">
                <TaskSection
                  icon={<Key className="h-4 w-4" />}
                  title="Renouvellements licence"
                  count={licenses.length}
                  colorScheme="violet">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Client</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Licence</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiration</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Jours restants</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {licenses.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 text-xs">{l.designation}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{l.client}</td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{l.licenseMonths} mois</td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{fmtDate(l.expiryDate.toISOString())}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                              ${l.daysLeft < 0 ? 'bg-red-100 text-red-700' : l.daysLeft < 30 ? 'bg-red-100 text-red-700' : l.daysLeft < 60 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {l.daysLeft < 0 ? `${Math.abs(l.daysLeft)}j expire` : `${l.daysLeft}j`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button onClick={() => router.push(`/opportunities/${l.opportunityId}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                Voir <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TaskSection>
              </div>
            )}

            {/* ── DR à Renouveler ── */}
            {drs.length > 0 && typeFilter === 'Tous' && (
              <div id="section-drs">
                <TaskSection
                  icon={<BookOpen className="h-4 w-4" />}
                  title="DR à renouveler"
                  count={drs.length}
                  colorScheme="teal">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">N° DR</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Card / BU</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiration</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Jours restants</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {drs.map(d => (
                        <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 text-xs">{d.drNumber}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{d.card} / {d.bu}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 max-w-[200px]">
                            <span className="truncate block">{d.dealTitle}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{fmtDate(d.expiryDate)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                              ${d.daysLeft < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {d.daysLeft < 0 ? `Expire ${Math.abs(d.daysLeft)}j` : `${d.daysLeft}j`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button onClick={() => router.push(`/opportunities/${d.opportunityId}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                Voir <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TaskSection>
              </div>
            )}

            {/* ── Factures Échues ── */}
            {overdueInvoices.length > 0 && typeFilter === 'Tous' && (
              <div id="section-invoices">
                <TaskSection
                  icon={<Receipt className="h-4 w-4" />}
                  title="Factures échues"
                  count={overdueInvoices.length}
                  colorScheme="rose"
                  amount={overdueInvoices.reduce((s, i) => s + i.amount, 0)}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">N° Facture</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Montant</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Echeance</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Retard</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Statut</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {overdueInvoices.map(inv => {
                        const invCfg = INVOICE_STATUS_CFG[inv.status]
                        return (
                          <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-900 text-xs">{inv.invoiceNumber}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-700 max-w-[200px]">
                              <span className="truncate block">{inv.dealTitle}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                              {mad(inv.amount)}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">{fmtDate(inv.dueDate)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                                ${inv.daysOverdue > 30 ? 'bg-red-100 text-red-700' : inv.daysOverdue > 15 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {inv.daysOverdue}j
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${invCfg?.bg || 'bg-slate-50'} ${invCfg?.color || 'text-slate-600'} border ${invCfg?.border || 'border-slate-200'}`}>
                                  {invCfg?.icon} {invCfg?.label || inv.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <button onClick={() => router.push(`/opportunities/${inv.opportunityId}`)}
                                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                  Voir <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TaskSection>
              </div>
            )}

            {/* ── Échéances de paiement ── */}
            {paymentReminders.length > 0 && typeFilter === 'Tous' && (
              <div id="section-payments">
                <TaskSection
                  icon={<Banknote className="h-4 w-4" />}
                  title="Échéances de paiement — rappels client"
                  count={paymentReminders.length}
                  colorScheme="amber"
                  amount={paymentReminders.reduce((s, p) => s + p.amount, 0)}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Client</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Échéance</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Montant</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Délai</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {paymentReminders.map(p => {
                        const isOverdue = p.daysUntil < 0
                        const isToday = p.daysUntil === 0
                        const dayLabel = isOverdue ? `${Math.abs(p.daysUntil)}j retard` : isToday ? "Aujourd'hui" : `Dans ${p.daysUntil}j`

                        // Build Outlook mailto link
                        const triggerLabels: Record<string, string> = {
                          commande: 'la commande', livraison: 'la livraison', '30j': '30 jours',
                          '60j': '60 jours', '90j': '90 jours', pv_final: 'le PV final', fin_garantie: 'la fin de garantie',
                        }
                        const triggerLabel = triggerLabels[p.trigger] || p.trigger
                        const ccList = ['supply@compucom.ma', 'salim@compucom.ma', 'FinanceHub@compucom.ma'].join(',')
                        const subject = encodeURIComponent(`Rappel échéance — ${p.client} — ${p.milestoneLabel} (${mad(p.amount)})`)
                        const dueDateFmt = new Date(p.dueDate).toLocaleDateString('fr-MA', { day: 'numeric', month: 'long', year: 'numeric' })
                        const contactName = p.clientContacts.length > 0 ? p.clientContacts[0].split(' ')[0] : 'Monsieur, Madame'
                        const body = encodeURIComponent(
                          `Bonjour ${contactName},\n\n` +
                          `Nous nous permettons de vous rappeler que l'échéance de paiement relative à ${triggerLabel} pour le projet « ${p.dealTitle} » est prévue le ${dueDateFmt}.\n\n` +
                          `Détails :\n` +
                          `• Montant : ${mad(p.amount)}\n` +
                          `• Échéance : ${p.milestoneLabel} (${p.milestonePct}%)\n` +
                          `• Montant total du projet : ${mad(p.totalDealAmount)}\n\n` +
                          `Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les délais convenus.\n\n` +
                          `Nous restons à votre entière disposition pour toute question.\n\n` +
                          `Cordialement,\nNabil Bahhar\nBusiness Development Manager\nCompucom Morocco`
                        )
                        const toEmails = p.clientEmails.length > 0 ? p.clientEmails.join(',') : ''
                        const mailtoUrl = `mailto:${encodeURIComponent(toEmails)}?cc=${encodeURIComponent(ccList)}&subject=${subject}&body=${body}`

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${isOverdue ? 'bg-red-500' : isToday ? 'bg-amber-500 animate-pulse' : 'bg-emerald-400'}`} />
                                <span className="font-bold text-slate-900 text-xs">{p.client}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px]">
                              <span className="truncate block">{p.dealTitle}</span>
                              <span className="text-[10px] text-slate-400">{p.milestoneLabel} · {p.milestonePct}%</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.dueDate)}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                              {mad(p.amount)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                                ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {dayLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <a href={mailtoUrl} target="_blank" rel="noopener noreferrer"
                                  title="Envoyer un rappel par email"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm">
                                  <Mail className="h-3.5 w-3.5" /> Relancer
                                </a>
                                <button onClick={() => router.push(`/opportunities/${p.opportunityId}`)}
                                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                  Voir <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TaskSection>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, color, active, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub: string
  color: 'slate' | 'amber' | 'red' | 'blue' | 'orange' | 'emerald' | 'violet' | 'teal' | 'rose' | 'indigo'
  active: boolean; onClick: () => void
}) {
  const colorMap: Record<string, { ring: string; icon: string; val: string }> = {
    slate:   { ring: active ? 'ring-slate-400'   : 'ring-slate-200', icon: 'bg-slate-100 text-slate-600',     val: 'text-slate-900'   },
    amber:   { ring: active ? 'ring-amber-400'   : 'ring-slate-200', icon: 'bg-amber-100 text-amber-600',     val: 'text-amber-700'   },
    red:     { ring: active ? 'ring-red-400'     : 'ring-slate-200', icon: 'bg-red-100 text-red-600',         val: 'text-red-700'     },
    blue:    { ring: active ? 'ring-blue-400'    : 'ring-slate-200', icon: 'bg-blue-100 text-blue-600',       val: 'text-blue-700'    },
    orange:  { ring: active ? 'ring-orange-400'  : 'ring-slate-200', icon: 'bg-orange-100 text-orange-600',   val: 'text-orange-700'  },
    emerald: { ring: active ? 'ring-emerald-400' : 'ring-slate-200', icon: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
    violet:  { ring: active ? 'ring-violet-400'  : 'ring-slate-200', icon: 'bg-violet-100 text-violet-600',   val: 'text-violet-700'  },
    teal:    { ring: active ? 'ring-teal-400'    : 'ring-slate-200', icon: 'bg-teal-100 text-teal-600',       val: 'text-teal-700'    },
    rose:    { ring: active ? 'ring-rose-400'    : 'ring-slate-200', icon: 'bg-rose-100 text-rose-600',       val: 'text-rose-700'    },
    indigo:  { ring: active ? 'ring-indigo-400'  : 'ring-slate-200', icon: 'bg-indigo-100 text-indigo-600',   val: 'text-indigo-700'  },
  }
  const colors = colorMap[color] || colorMap.blue

  return (
    <button onClick={onClick}
      className={`rounded-2xl bg-white ring-1 ${colors.ring} shadow-sm p-4 text-left transition-all hover:shadow-md ${active ? 'ring-2' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors.icon}`}>{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-black ${colors.val}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </button>
  )
}

// ── TaskSection ────────────────────────────────────────────────
function TaskSection({ icon, title, count, colorScheme, amount, children }: {
  icon: React.ReactNode; title: string; count: number
  colorScheme: 'amber' | 'red' | 'blue' | 'orange' | 'emerald' | 'violet' | 'teal' | 'rose' | 'indigo'
  amount?: number; children: React.ReactNode
}) {
  const cfgMap: Record<string, { border: string; bg: string; text: string; badge: string; icon: string }> = {
    amber:   { border: 'border-amber-200',   bg: 'bg-amber-50',   text: 'text-amber-800',   badge: 'bg-amber-200 text-amber-800',     icon: 'text-amber-600'   },
    red:     { border: 'border-red-200',     bg: 'bg-red-50',     text: 'text-red-800',     badge: 'bg-red-200 text-red-800',         icon: 'text-red-600'     },
    blue:    { border: 'border-blue-200',    bg: 'bg-blue-50',    text: 'text-blue-800',    badge: 'bg-blue-200 text-blue-800',       icon: 'text-blue-600'    },
    orange:  { border: 'border-orange-200',  bg: 'bg-orange-50',  text: 'text-orange-800',  badge: 'bg-orange-200 text-orange-800',   icon: 'text-orange-600'  },
    emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800', badge: 'bg-emerald-200 text-emerald-800', icon: 'text-emerald-600' },
    violet:  { border: 'border-violet-200',  bg: 'bg-violet-50',  text: 'text-violet-800',  badge: 'bg-violet-200 text-violet-800',   icon: 'text-violet-600'  },
    teal:    { border: 'border-teal-200',    bg: 'bg-teal-50',    text: 'text-teal-800',    badge: 'bg-teal-200 text-teal-800',       icon: 'text-teal-600'    },
    rose:    { border: 'border-rose-200',    bg: 'bg-rose-50',    text: 'text-rose-800',    badge: 'bg-rose-200 text-rose-800',       icon: 'text-rose-600'    },
    indigo:  { border: 'border-indigo-200',  bg: 'bg-indigo-50',  text: 'text-indigo-800',  badge: 'bg-indigo-200 text-indigo-800',   icon: 'text-indigo-600'  },
  }
  const cfg = cfgMap[colorScheme] || cfgMap.blue

  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
      <div className={`flex items-center justify-between px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
        <div className="flex items-center gap-2">
          <span className={cfg.icon}>{icon}</span>
          <span className={`text-sm font-bold ${cfg.text}`}>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>{count}</span>
        </div>
        {amount != null && amount > 0 && (
          <span className="text-xs font-semibold text-slate-500">{mad(amount)}</span>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
