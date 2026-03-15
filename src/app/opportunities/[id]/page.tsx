'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { getSignedUrls } from '@/lib/getSignedUrls'
import { mad, pct, fmtDate, fmtDateTime, STAGE_CFG, SUPPLY_STATUS_CFG, SUPPLY_STATUS_ORDER, type SupplyStatus, LINE_STATUS_CFG, LINE_STATUS_ORDER, type LineStatus, ownerName, paymentTermLabel, PRESCRIPTION_STATUS_CFG, type PrescriptionStatus, PROJECT_SERVICE_STATUS_CFG, type ProjectServiceStatus, INVOICE_STATUS_CFG, type InvoiceStatus } from '@/lib/utils'

import {
  ArrowLeft, Package, Mail, Edit2, Loader2, X,
  Check, ExternalLink, FileText, Building2,
  Clock, ShieldCheck, AlertTriangle, CheckCircle2,
  TrendingUp, Download, Phone, MapPin,
  ChevronRight, Target, Calendar,
  User, Tag, Truck, Save,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Opp = {
  id: string; title: string; amount: number; status: string; stage: string
  prob?: number; bu?: string; po_number?: string; vendor?: string
  next_step?: string; contact_name?: string; contact_email?: string
  closing_date?: string; booking_month?: string
  created_at?: string; updated_at?: string
  owner_email?: string; notes?: string; description?: string
  multi_bu?: boolean; forecast?: string; bu_lines?: any[]
  accounts?: { id?: string; name?: string; sector?: string; segment?: string; region?: string } | null
}
type PurchaseLine = {
  id: string; ref: string; designation: string; sort_order: number
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur?: string; contact_fournisseur?: string
  email_fournisseur?: string; tel_fournisseur?: string
  line_status?: string; eta?: string; eta_updated_at?: string; status_note?: string
  warranty_months?: number; license_months?: number
  warranty_expiry?: string; license_expiry?: string
}
type PurchaseInfo = {
  id: string; frais_engagement: number; notes: string; payment_terms?: string
  filled_by: string; justif_reason?: string; justif_text?: string
  approved_by?: string; created_at: string; updated_at?: string
  purchase_lines: PurchaseLine[]
}
type DealRegistration = {
  id: string; bu?: string; card?: string; platform?: string
  dr_number?: string; expiry_date?: string; status?: string
}
type DealFile = { id: string; file_type: string; file_name: string; file_url: string }
type SupplyOrder = {
  id: string; status: string; supply_notes?: string
  placed_at?: string; ordered_at?: string; received_at?: string
  delivered_at?: string; invoiced_at?: string; updated_at?: string
}
type Activity = {
  id: string; action_type: string; entity_type: string
  entity_name: string; detail: string; created_at: string; user_email?: string
}
type ProjectService = {
  id: string; opportunity_id: string; title: string; description: string | null
  assigned_to: string | null; bu: string | null
  status: ProjectServiceStatus; start_date: string | null; end_date: string | null
  notes: string | null; sort_order: number
  prescription_status: PrescriptionStatus | null
  created_at: string; updated_at: string | null
}
type InvoiceLine = {
  purchase_line_id: string
  purchase_lines?: { ref: string | null; designation: string | null; qty: number; pt_vente: number; fournisseur: string | null } | null
}
type Invoice = {
  id: string; opportunity_id: string; invoice_number: string | null
  amount: number; issue_date: string | null; due_date: string | null
  status: InvoiceStatus; payment_terms: string | null; notes: string | null
  created_at: string
  invoice_lines?: InvoiceLine[]
}

// ─── Formatters ───────────────────────────────────────────────

/** booking_month est le champ canonique. Fallbacks pour données legacy. */
const closingDate = (o: Opp) =>
  o.booking_month || o.closing_date || null

// ─── Supply & Stage config imported from @/lib/utils ──────────
const STATUS_CFG = SUPPLY_STATUS_CFG
const STATUS_ORDER = SUPPLY_STATUS_ORDER

const ACTION_ICON: Record<string, string> = {
  create: '✨', update: '✏️', delete: '🗑️', view: '👁️',
  won: '🏆', lost: '❌', stage_change: '📊', note: '📝',
  upload: '📎', email: '📧', call: '📞',
}
const ACTION_COLOR: Record<string, string> = {
  create: '#10b981', update: '#3b82f6', won: '#f59e0b', lost: '#ef4444',
  stage_change: '#8b5cf6', note: '#64748b', upload: '#06b6d4', email: '#8b5cf6',
}

// ─── Team job titles ─────────────────────────────────────────
const JOB_TITLES: Record<string, string> = {
  'nabil.imdh@gmail.com': 'Regional Sales Manager',
  's.chitachny@compucom.ma': 'Supply Chain Manager',
}
function ownerTitle(email: string | null | undefined): string {
  if (!email) return ''
  return JOB_TITLES[email] || ''
}

// HTML escape helper
function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// ─── Build HTML email for clipboard ──────────────────────────
function buildEmailHtml(deal: Opp, info: PurchaseInfo, senderEmail?: string | null): string {
  const client     = deal.accounts?.name || deal.title
  const totalVente = info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0)
  const totalAchat = info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
  const margeBrute = totalVente - totalAchat
  const margeNette = margeBrute - (info.frais_engagement||0)
  const margeBrutePct = totalVente > 0 ? (margeBrute/totalVente)*100 : 0
  const margeNettePct = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const today      = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' })
  const sender     = senderEmail ? ownerName(senderEmail) : 'Compucom'
  const senderTitle = senderEmail ? ownerTitle(senderEmail) : ''
  const COLORS     = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']
  const supGroups  = new Map<string, PurchaseLine[]>()
  info.purchase_lines.forEach(l => {
    const k = l.fournisseur || 'Non spécifié'
    if (!supGroups.has(k)) supGroups.set(k, [])
    supGroups.get(k)!.push(l)
  })
  let si = 0
  const blocks = Array.from(supGroups.entries()).map(([name, lines]) => {
    const col   = COLORS[si++ % COLORS.length]
    const subT  = lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
    const contactGroups = new Map<string, PurchaseLine[]>()
    lines.forEach(l => {
      const ck = l.contact_fournisseur || ''
      if (!contactGroups.has(ck)) contactGroups.set(ck, [])
      contactGroups.get(ck)!.push(l)
    })
    const contactBadges = Array.from(contactGroups.entries())
      .filter(([c]) => c)
      .map(([c, cls]) => {
        const first = cls[0]
        return `<span style="display:inline-block;background:rgba(255,255,255,.15);border-radius:4px;padding:2px 8px;font-size:11px;color:#fff;margin-right:4px">
          ${esc(c)}${first.email_fournisseur ? ` · ${esc(first.email_fournisseur)}` : ''}${first.tel_fournisseur ? ` · ${esc(first.tel_fournisseur)}` : ''}</span>`
      }).join('')
    const rows  = lines.map((l,i) => {
      const rowBg = i%2 ? '#f8fafc' : '#ffffff'
      return `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;background-color:${rowBg}">
          ${l.ref?`<span style="color:#94a3b8;font-size:11px;margin-right:6px">[${esc(l.ref)}]</span>`:''}${esc(l.designation)}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:center;font-weight:600;border-bottom:1px solid #f1f5f9;background-color:${rowBg}">${l.qty}</td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9;background-color:${rowBg}">${mad(l.pu_achat)}</td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:700;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9;background-color:${rowBg}">${mad(l.qty*l.pu_achat)}</td>
      </tr>`}).join('')
    return `<div style="margin-bottom:16px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background-color:${col};padding:14px 20px">
        <table width="100%"><tr>
          <td>
            <div style="color:#fff;font-size:15px;font-weight:800;margin-bottom:4px">${esc(name)}</div>
            <div style="margin-top:4px">${contactBadges || '<span style="color:#cbd5e1;font-size:11px">Aucun contact</span>'}</div>
          </td>
          <td align="right" style="vertical-align:top"><span style="background-color:rgba(255,255,255,.2);border-radius:8px;padding:5px 14px;color:#fff;font-size:13px;font-weight:800">${mad(subT)}</span></td>
        </tr></table>
      </div>
      <table width="100%" style="border-collapse:collapse;background-color:#ffffff">
        <thead><tr>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:left;border-bottom:2px solid #e2e8f0;background-color:#f8fafc">Désignation</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:center;border-bottom:2px solid #e2e8f0;background-color:#f8fafc">Qté</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0;background-color:#f8fafc">PU Achat</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0;background-color:#f8fafc">Total HT</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')
  const mcB = margeBrutePct >= 20 ? '#16a34a' : margeBrutePct >= 10 ? '#d97706' : '#dc2626'
  const mcN = margeNettePct >= 20 ? '#16a34a' : margeNettePct >= 10 ? '#d97706' : '#dc2626'
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<style>:root{color-scheme:light only}body,table,td,div,p,span{color:#1e293b}[data-ogsc] body,[data-ogsb] body{background-color:#ffffff!important;color:#1e293b!important}</style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;background-color:#f1f5f9"><tr><td align="center">
<table width="660" style="max-width:660px;width:100%">
  <tr><td style="background-color:#0f172a;border-radius:16px 16px 0 0;padding:28px 32px">
    <table width="100%"><tr>
      <td>
        <div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Commande · ${today}</div>
        <div style="color:#fff;font-size:22px;font-weight:900;line-height:1.2">${esc(deal.title)}</div>
        <div style="color:#cbd5e1;font-size:13px;margin-top:8px;line-height:1.5">${esc(client)}${deal.po_number?` · PO <strong style="color:#e2e8f0">${esc(deal.po_number)}</strong>`:''}</div>
      </td>
      <td align="right" style="vertical-align:top">
        <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px 16px;text-align:center">
          <div style="color:#94a3b8;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Achat</div>
          <div style="color:#fff;font-size:18px;font-weight:900;font-family:monospace">${mad(totalAchat)}</div>
        </div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background-color:#ffffff;padding:28px 32px;color:#1e293b">
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7">Bonjour,<br><br>Merci de traiter la commande ci-dessous pour le client <strong style="color:#1e293b">${esc(client)}</strong>.<br>Merci de confirmer la prise en charge et le délai prévisionnel.</p>
    ${blocks}
    <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;margin-top:8px">
      <div style="background-color:#f8fafc;padding:12px 20px;border-bottom:1px solid #e2e8f0">
        <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Récapitulatif financier</span>
      </div>
      <table width="100%" style="border-collapse:collapse;background-color:#ffffff">
        <tr><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;background-color:#ffffff">Total vente HT</td>
          <td style="padding:12px 20px;font-size:14px;font-weight:700;color:#1e293b;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9;background-color:#ffffff">${mad(totalVente)}</td></tr>
        <tr><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;background-color:#fafafa">Total achat HT</td>
          <td style="padding:12px 20px;font-size:14px;font-weight:700;color:#1e293b;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9;background-color:#fafafa">${mad(totalAchat)}</td></tr>
        ${info.frais_engagement>0?`<tr><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;background-color:#ffffff">Frais engagement</td>
          <td style="padding:12px 20px;font-size:14px;font-weight:700;color:#d97706;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9;background-color:#ffffff">− ${mad(info.frais_engagement)}</td></tr>`:''}
        <tr><td style="padding:12px 20px;font-size:13px;font-weight:700;color:#166534;background-color:#f0fdf4">Marge brute</td>
          <td style="padding:12px 20px;text-align:right;background-color:#f0fdf4">
            <span style="font-size:15px;font-weight:800;color:${mcB};font-family:monospace">${mad(margeBrute)}</span>
            <span style="margin-left:6px;background-color:${mcB};color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">${pct(margeBrutePct)}</span>
          </td></tr>
        ${info.frais_engagement > 0 ? `<tr><td style="padding:14px 20px;font-size:14px;font-weight:800;color:#065f46;background-color:#ecfdf5">Marge nette</td>
          <td style="padding:14px 20px;text-align:right;background-color:#ecfdf5">
            <span style="font-size:17px;font-weight:900;color:${mcN};font-family:monospace">${mad(margeNette)}</span>
            <span style="margin-left:6px;background-color:${mcN};color:#fff;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700">${pct(margeNettePct)}</span>
          </td></tr>` : ''}
      </table>
    </div>
    ${info.payment_terms ? (() => {
      let ptLabel = paymentTermLabel(info.payment_terms)
      // If stored as JSON, parse and extract template + milestones
      try {
        const parsed = JSON.parse(info.payment_terms)
        if (parsed.template) {
          ptLabel = paymentTermLabel(parsed.template)
          if (Array.isArray(parsed.milestones) && parsed.milestones.length > 0) {
            ptLabel += '<br>' + parsed.milestones.map((m: any) => `${m.pct}% — ${esc(m.label)}`).join('<br>')
          }
        }
      } catch {}
      return `<div style="margin-top:14px;border-radius:10px;border:1px solid #dbeafe;background-color:#eff6ff;padding:14px 20px">
      <div style="font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;margin-bottom:4px">Modalités de paiement</div>
      <div style="font-size:13px;color:#1e40af;font-weight:600;line-height:1.6">${ptLabel}</div>
    </div>`
    })() : ''}
    ${margeBrutePct < 10 && totalAchat > 0 ? `<div style="margin-top:14px;border-radius:10px;border:2px solid #fbbf24;background-color:#fffbeb;padding:16px 20px">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">⚠️ Validation requise — Marge brute &lt; 10%</div>
      <div style="font-size:13px;color:#78350f;line-height:1.6">
        <strong>@Achraf Lahkim</strong> — Merci de valider cette commande (marge brute : <strong style="color:${mcB}">${pct(margeBrutePct)}</strong>).
        ${info.justif_reason ? `<br>Raison : <em>${esc(info.justif_reason)}</em>` : ''}
        ${info.justif_text ? `<br>Détail : ${esc(info.justif_text)}` : ''}
      </div>
    </div>` : ''}
    ${info.notes?`<div style="margin-top:14px;border-radius:10px;border:1px solid #fde68a;background-color:#fffbeb;padding:14px 20px">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:4px">Notes</div>
      <div style="font-size:13px;color:#78350f;line-height:1.5">${esc(info.notes)}</div>
    </div>`:''}
  </td></tr>
  <tr><td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 32px">
    <table width="100%"><tr>
      <td style="font-size:12px;color:#94a3b8;line-height:1.5">Merci de <strong style="color:#64748b">confirmer la réception</strong><br>et d'indiquer le délai estimé.</td>
      <td align="right">
        <div style="display:inline-block;background-color:#0f172a;border-radius:10px;padding:10px 18px;text-align:center">
          <div style="color:#fff;font-size:13px;font-weight:800">${esc(sender)}</div>
          ${senderTitle ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px">${esc(senderTitle)}</div>` : ''}
        </div>
      </td>
    </tr></table>
  </td></tr>
</table></td></tr></table></body></html>`
}

// ─── 1-clic : copie HTML + ouvre Outlook ─────────────────────
async function openSupplyEmail(deal: Opp, info: PurchaseInfo, senderEmail?: string | null) {
  const client  = deal.accounts?.name || deal.title
  const today   = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' })
  const subject = `Commande ${client}${deal.po_number ? ` – PO ${deal.po_number}` : ''} – ${mad(deal.amount)} – ${today}`
  const totalVente = info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0)
  const totalAchat = info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
  const margeBrute = totalVente - totalAchat
  const margeBrutePct = totalVente > 0 ? (margeBrute/totalVente)*100 : 0
  const margeFaible = margeBrutePct < 10 && totalAchat > 0
  const ccList = margeFaible
    ? 'n.bahhar@compucom.ma,A.lahkim@compucom.ma'
    : 'n.bahhar@compucom.ma'
  const html = buildEmailHtml(deal, info, senderEmail)

  // 1) Copier le HTML formaté dans le presse-papier
  try {
    const blob = new Blob([html], { type: 'text/html' })
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([html], { type: 'text/plain' }) })])
  } catch {
    await navigator.clipboard.writeText(html).catch(() => {})
  }

  // 2) Ouvrir Outlook avec To/CC/Objet pré-remplis (corps vide — on colle avec Ctrl+V)
  const mailto = `mailto:supplychain@compucom.ma?cc=${encodeURIComponent(ccList)}&subject=${encodeURIComponent(subject)}`
  window.location.href = mailto
}

// ─── Main Page ────────────────────────────────────────────────
export default function OpportunityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params?.id as string

  const [opp, setOpp]             = useState<Opp | null>(null)
  const [info, setInfo]           = useState<PurchaseInfo | null>(null)
  const [files, setFiles]         = useState<DealFile[]>([])
  const [fileUrls, setFileUrls]   = useState<Record<string, string>>({})
  const [supply, setSupply]       = useState<SupplyOrder | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [drs, setDrs]             = useState<DealRegistration[]>([])
  const [services, setServices]   = useState<ProjectService[]>([])
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [expandedInv, setExpandedInv] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set())
  const [contacts, setContacts]   = useState<any[]>([])
  const [meetings, setMeetings]   = useState<any[]>([])
  const [tickets, setTickets]     = useState<any[]>([])

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null)) }, [])
  useEffect(() => { if (id) loadAll() }, [id])
  useEffect(() => { if (opp) document.title = `${opp.title} \· CRM-PIPE` }, [opp])

  async function loadAll() {
    setLoading(true)
    const [oppRes, infoApiRes, filesRes, supplyRes, actRes] = await Promise.all([
      supabase.from('opportunities')
        .select('*, accounts(id,name,sector,segment,region)')
        .eq('id', id).single(),
      authFetch(`/api/purchase-save?opportunity_id=${id}`).then(r => r.ok ? r.json() : { info: null }).catch(() => ({ info: null })),
      supabase.from('deal_files')
        .select('id,file_type,file_name,file_url')
        .eq('opportunity_id', id),
      authFetch('/api/supply').then(r => r.ok ? r.json() : { orders: [] }).catch(() => ({ orders: [] })),
      supabase.from('activity_log')
        .select('id,action_type,entity_type,entity_name,detail,created_at,user_email')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (oppRes.data) setOpp({ ...oppRes.data, accounts: oppRes.data.accounts as any })

    if (infoApiRes.info) setInfo({
      ...infoApiRes.info,
      purchase_lines: (infoApiRes.info.purchase_lines || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    })

    const f = filesRes.data || []
    setFiles(f)
    const urls = await getSignedUrls('deal-files', f)
    setFileUrls(urls)

    // supplyRes is { orders: [...] } — find this deal's order
    const mySupply = (supplyRes?.orders || []).find((o: any) => o.opportunity_id === id)
    if (mySupply) setSupply(mySupply)
    setActivities(actRes.data || [])

    // Load Deal Registrations, Project Services, Invoices, Contacts, Meetings, Tickets
    try {
      const [drRes, svcRes, invRes, contactsRes, meetingsRes, ticketsRes] = await Promise.all([
        supabase.from('deal_registrations').select('*').eq('opportunity_id', id),
        supabase.from('project_services').select('*').eq('opportunity_id', id).order('sort_order'),
        supabase.from('invoices').select('*, invoice_lines(purchase_line_id, purchase_lines(ref, designation, qty, pt_vente, fournisseur))').eq('opportunity_id', id).order('issue_date', { ascending: false }),
        Promise.resolve(supabase.from('account_contacts').select('*').eq('account_id', oppRes.data?.accounts?.id || '')).catch(() => ({ data: [] })),
        Promise.resolve(supabase.from('account_meetings').select('*').eq('account_id', oppRes.data?.accounts?.id || '').order('meeting_date', { ascending: false }).limit(3)).catch(() => ({ data: [] })),
        Promise.resolve(supabase.from('support_tickets').select('*').eq('opportunity_id', id)).catch(() => ({ data: [] })),
      ])
      setDrs(drRes.data || [])
      setServices(svcRes.data || [])
      setInvoices(invRes.data || [])
      setContacts((contactsRes as any)?.data || [])
      setMeetings((meetingsRes as any)?.data || [])
      setTickets((ticketsRes as any)?.data || [])
    } catch {} // tables may not exist yet

    setLoading(false)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
    </div>
  )
  if (!opp) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <p className="text-slate-500">Deal introuvable.</p>
    </div>
  )

  // ── Computed ─────────────────────────────────────────────────
  const isWon         = opp.status === 'Won'
  const isOpen        = opp.status === 'Open'
  const totalVente    = info ? info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0) : 0
  const totalAchat    = info ? info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0) : 0
  const margeBrute    = totalVente - totalAchat
  const margeNette    = margeBrute - (info?.frais_engagement || 0)
  const margePctBrute = totalVente > 0 ? (margeBrute/totalVente)*100 : 0
  const margePctNette = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const linesOk       = info ? info.purchase_lines.filter(l => Number(l.pu_achat) > 0 && l.fournisseur?.trim()).length : 0
  const ficheComplete = !!(info && info.purchase_lines.length > 0 && linesOk === info.purchase_lines.length)
  const canEmail      = ficheComplete && isWon
  const supIdx        = supply ? STATUS_ORDER.indexOf(supply.status as SupplyStatus) : -1
  const supCfg        = supply ? STATUS_CFG[supply.status as SupplyStatus] : null
  const commandePlacee = supIdx >= 1 // status is 'commande' or beyond — fiche locked once supplier confirmed
  const cDate         = closingDate(opp)
  const stageCfg      = STAGE_CFG[opp.stage] || { bg: 'bg-slate-100', text: 'text-slate-600' }

  const uniqueSuppliers = info
    ? Array.from(new Map(info.purchase_lines.filter(l => l.fournisseur).map(l => [l.fournisseur, l])).values())
    : []

  const prescription = services.find(s => s.title === 'Prescription')
  const deployServices = services.filter(s => s.title !== 'Prescription')
  const lateDeliveries = info ? info.purchase_lines.filter(l => l.eta && new Date(l.eta) < new Date() && l.line_status !== 'livre').length : 0
  const openTickets = tickets.filter((t: any) => t.status === 'ouvert' || t.status === 'en_cours').length

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-600 transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/opportunities" className="hover:text-slate-600 transition-colors">Deals</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600 font-medium truncate max-w-[200px]">{opp.title}</span>
        </nav>

        {/* ── Hero Header ── */}
        <div className="flex items-start gap-3">
          <button onClick={() => router.back()}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">{opp.title}</h1>
              <StatusPill status={opp.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {opp.accounts?.name && (
                <Link href={`/accounts/${opp.accounts?.id}`} className="flex items-center gap-1 font-medium text-slate-700 hover:text-blue-700 hover:underline transition-colors">
                  <Building2 className="h-3.5 w-3.5 shrink-0" /> {opp.accounts?.name}
                </Link>
              )}
              {opp.bu && <><span className="text-slate-300">·</span><span>{opp.multi_bu && Array.isArray(opp.bu_lines) && opp.bu_lines.length > 0 ? [...new Set(opp.bu_lines.map((l: any) => l.card || l.bu).filter(Boolean))].join(' + ') : opp.bu}</span></>}
              {opp.vendor && !opp.multi_bu && <><span className="text-slate-300">·</span><span>{opp.vendor}</span></>}
              {opp.po_number && <><span className="text-slate-300">·</span><span className="font-medium">PO {opp.po_number}</span></>}
            </p>
          </div>
          {isWon && !commandePlacee && (
            <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
              className="shrink-0 inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-colors bg-slate-900 hover:bg-slate-800">
              <Package className="h-4 w-4" />
              {ficheComplete ? 'Modifier fiche' : info ? 'Compléter fiche' : 'Remplir fiche'}
            </button>
          )}
        </div>

        {/* ── Contextual KPI Strip ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* ALWAYS: Montant Deal (dark card) */}
          <div className="rounded-xl bg-slate-900 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Montant Deal</div>
            <div className="text-base font-black text-white tabular-nums">{mad(opp.amount)}</div>
          </div>

          {/* CONTEXTUAL cards based on status */}
          {isWon ? (
            <>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">N° PO</div>
                <div className="text-sm font-bold text-slate-800">{opp.po_number || '\—'}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Cl\ôture</div>
                <div className="text-sm font-bold text-slate-800">{fmtDate(cDate)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Owner</div>
                <div className="text-sm font-bold text-slate-800">{ownerName(opp.owner_email)}</div>
              </div>
            </>
          ) : opp.status === 'Lost' ? (
            <>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Stage</div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${stageCfg.bg} ${stageCfg.text}`}>{opp.stage || '\—'}</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Cl\ôture</div>
                <div className="text-sm font-bold text-slate-800">{fmtDate(cDate)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Owner</div>
                <div className="text-sm font-bold text-slate-800">{ownerName(opp.owner_email)}</div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Stage</div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${stageCfg.bg} ${stageCfg.text}`}>{opp.stage || '\—'}</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Probabilit\é</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${opp.prob||0}%` }} />
                  </div>
                  <span className="text-sm font-black text-slate-800">{opp.prob||0}%</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Cl\ôture</div>
                <div className="text-sm font-bold text-slate-800">{fmtDate(cDate)}</div>
              </div>
            </>
          )}
        </div>

        {/* ── Sticky Nav Bar ── */}
        <nav className="sticky top-[57px] z-10 -mx-4 px-4 py-2 bg-white/80 backdrop-blur-sm border-b border-slate-100">
          <div className="flex items-center gap-1 overflow-x-auto">
            <NavPill href="#section-commercial" label="Commercial" active />
            {isWon && <NavPill href="#section-achat" label="Achat" alert={!!(info && !ficheComplete)} />}
            {supply && <NavPill href="#section-supply" label="Supply" alert={lateDeliveries > 0} />}
            {prescription && <NavPill href="#section-prescription" label="Prescription" />}
            {deployServices.length > 0 && <NavPill href="#section-deploiement" label="D\éploiement" />}
            {isWon && <NavPill href="#section-facturation" label="Facturation" />}
            {tickets.length > 0 && <NavPill href="#section-support" label="Support" alert={openTickets > 0} />}
            {activities.length > 0 && <NavPill href="#section-historique" label="Historique" />}
          </div>
        </nav>

        {/* ══ SECTION: FICHE COMMERCIALE ══ */}
        <Section id="commercial" title="Fiche Commerciale" icon="💼">
          {/* Details grid */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {opp.accounts?.sector && <DetailRow icon={<Tag className="h-3.5 w-3.5"/>} label="Secteur" value={opp.accounts.sector} />}
            {opp.accounts?.segment && <DetailRow icon={<Target className="h-3.5 w-3.5"/>} label="Segment" value={opp.accounts.segment} />}
            {opp.accounts?.region && <DetailRow icon={<MapPin className="h-3.5 w-3.5"/>} label="R\égion" value={opp.accounts.region} />}
            {opp.contact_name && <DetailRow icon={<User className="h-3.5 w-3.5"/>} label="Contact" value={opp.contact_name} />}
            {opp.contact_email && <DetailRow icon={<Mail className="h-3.5 w-3.5"/>} label="Email contact" value={opp.contact_email} />}
            {opp.vendor && !opp.multi_bu && <DetailRow icon={<Building2 className="h-3.5 w-3.5"/>} label="Vendor / Constructeur" value={opp.vendor} />}
            {opp.po_number && <DetailRow icon={<Tag className="h-3.5 w-3.5"/>} label="N\° PO" value={opp.po_number} />}
            {opp.forecast && <DetailRow icon={<TrendingUp className="h-3.5 w-3.5"/>} label="Forecast" value={opp.forecast} />}
            {opp.owner_email && <DetailRow icon={<User className="h-3.5 w-3.5"/>} label="Owner" value={ownerName(opp.owner_email)} />}
            <DetailRow icon={<Calendar className="h-3.5 w-3.5"/>} label="Cr\é\é le" value={fmtDate(opp.created_at)} />
            {opp.updated_at && <DetailRow icon={<Clock className="h-3.5 w-3.5"/>} label="Mis \à jour" value={fmtDate(opp.updated_at)} />}
          </div>

          {/* Contacts Compte */}
          {contacts.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'👥'} Contacts compte</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {contacts.map((c: any) => (
                  <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {(c.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          {c.full_name}
                          {c.is_primary && <span className="text-[9px] rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 font-bold">Principal</span>}
                        </div>
                        {c.role && <div className="text-[10px] text-slate-500">{c.role}</div>}
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {c.email && <div className="text-[11px] text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</div>}
                      {c.phone && <div className="text-[11px] text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BU breakdown (multi-BU deals) */}
          {opp.multi_bu && Array.isArray(opp.bu_lines) && opp.bu_lines.length > 0 && (() => {
            const total = opp.bu_lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
            const COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-purple-500']
            const TEXT_COLORS = ['text-indigo-700', 'text-emerald-700', 'text-amber-700', 'text-rose-700', 'text-cyan-700', 'text-purple-700']
            const BG_COLORS = ['bg-indigo-50', 'bg-emerald-50', 'bg-amber-50', 'bg-rose-50', 'bg-cyan-50', 'bg-purple-50']
            return (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 mb-3">{'🏢'} R\épartition par Business Unit</div>
                {/* Progress bar */}
                <div className="h-3 rounded-full overflow-hidden flex mb-3">
                  {opp.bu_lines.map((l: any, i: number) => {
                    const pctVal = total > 0 ? (Number(l.amount || 0) / total) * 100 : 0
                    return <div key={i} className={`${COLORS[i % COLORS.length]} first:rounded-l-full last:rounded-r-full`} style={{ width: `${pctVal}%` }} />
                  })}
                </div>
                {/* Lines */}
                <div className="space-y-2">
                  {opp.bu_lines.map((l: any, i: number) => {
                    const amt = Number(l.amount || 0)
                    const pctVal = total > 0 ? (amt / total) * 100 : 0
                    return (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${BG_COLORS[i % BG_COLORS.length]} ${TEXT_COLORS[i % TEXT_COLORS.length]}`}>{l.card || l.bu}</span>
                          {l.bu && l.card && l.bu !== l.card && <span className="text-xs text-slate-400">{l.bu}</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-bold text-slate-700 tabular-nums">{mad(amt)}</span>
                          <span className="text-xs text-slate-400 tabular-nums w-10 text-right">{pctVal.toFixed(0)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Deal Registration */}
          {drs.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'🛡️'} Deal Registration ({drs.length})</div>
              <div className="space-y-2">
                {drs.map(dr => {
                  const daysLeft = dr.expiry_date ? Math.ceil((new Date(dr.expiry_date).getTime() - Date.now()) / 86400000) : null
                  const isExpired = daysLeft !== null && daysLeft < 0
                  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
                  return (
                    <div key={dr.id} className={`rounded-xl border p-3 flex items-center justify-between gap-4 ${isExpired ? 'border-red-200 bg-red-50' : expiringSoon ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <ShieldCheck className={`h-5 w-5 shrink-0 ${isExpired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-emerald-500'}`} />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-800">
                            {dr.dr_number || 'DR'}
                            {dr.card && <span className="ml-2 text-xs text-slate-500">{dr.card}</span>}
                            {dr.bu && <span className="ml-1 text-xs text-slate-400">({dr.bu})</span>}
                          </div>
                          {dr.platform && <div className="text-[10px] text-slate-500">Plateforme : {dr.platform}</div>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {dr.expiry_date ? (
                          <div>
                            <div className={`text-xs font-bold ${isExpired ? 'text-red-600' : expiringSoon ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {isExpired ? `Expir\é (${Math.abs(daysLeft!)}j)` : expiringSoon ? `Expire dans ${daysLeft}j` : `Valide (${daysLeft}j)`}
                            </div>
                            <div className="text-[10px] text-slate-400">{fmtDate(dr.expiry_date)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 font-bold">Actif</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Next step */}
          {opp.next_step && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500 mb-1.5">{'🎯'} Prochaine \étape</div>
              <p className="text-sm text-blue-800 leading-relaxed">{opp.next_step}</p>
            </div>
          )}

          {/* Notes / description */}
          {(opp.notes || opp.description) && (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{'📝'} Notes</div>
              <p className="text-sm text-slate-600 leading-relaxed">{opp.notes || opp.description}</p>
            </div>
          )}

          {/* Meetings */}
          {meetings.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'📅'} Derniers rendez-vous</div>
              <div className="space-y-2">
                {meetings.map((m: any) => (
                  <div key={m.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{m.title}</div>
                      {m.summary && <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{m.summary}</div>}
                    </div>
                    <div className="text-xs text-slate-400 shrink-0 ml-3">{fmtDate(m.meeting_date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ══ SECTION: FICHE ACHAT ══ */}
        {isWon && (
          <Section id="achat" title="Fiche Achat" icon="📋"
            badge={
              commandePlacee ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Commande plac\ée
                </span>
              ) : undefined
            }>
            {/* Header fiche status */}
            <div className={`-m-5 mb-4 flex items-center gap-3 px-5 py-4 border-b ${ficheComplete ? 'bg-emerald-50 border-emerald-100' : info ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${ficheComplete ? 'bg-emerald-500' : info ? 'bg-blue-500' : 'bg-amber-500'} text-white`}>{'📋'}</div>
              <div>
                <div className={`text-sm font-black ${ficheComplete ? 'text-emerald-900' : info ? 'text-blue-900' : 'text-amber-900'}`}>
                  Fiche Achat
                  {ficheComplete && <span className="ml-2 text-xs font-normal text-emerald-600">Compl\ète {'\✓'}</span>}
                  {info && !ficheComplete && <span className="ml-2 text-xs font-normal text-blue-600">En cours {'\·'} {linesOk}/{info.purchase_lines.length} lignes</span>}
                  {!info && <span className="ml-2 text-xs font-normal text-amber-600">{'\À'} remplir</span>}
                </div>
                {info && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Par <span className="font-medium">{info.filled_by}</span>
                    {info.updated_at && <> {'\·'} {fmtDate(info.updated_at)}</>}
                  </div>
                )}
              </div>
            </div>

            {info && info.purchase_lines.length > 0 ? (
              <div className="space-y-4">
                {/* Lines table — Devis Pro style */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  {/* Dark header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold text-sm tracking-tight">Récapitulatif commande</h3>
                      <p className="text-slate-400 text-[11px] mt-0.5">{opp.accounts?.name} · {info.purchase_lines.length} article{info.purchase_lines.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Vente HT</div>
                        <span className="text-white text-sm font-bold">{mad(totalVente)}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Marge</div>
                        <span className={`text-sm font-bold ${margePctBrute >= 15 ? 'text-emerald-400' : margePctBrute >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{mad(margeBrute)} <span className="text-[10px]">({margePctBrute.toFixed(1)}%)</span></span>
                      </div>
                    </div>
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-[40px_1fr_60px_100px_100px_90px_110px_100px_80px] bg-slate-50/80 border-b border-slate-200 px-4 py-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                    <span>N°</span><span>Désignation</span><span className="text-right">Qté</span><span className="text-right">PT Vente</span><span className="text-right">PT Achat</span><span className="text-right">Marge</span><span className="text-center">Fournisseur</span><span className="text-center">Statut</span><span className="text-center">ETA</span>
                  </div>
                  {/* Lines */}
                  <div className="divide-y divide-slate-100">
                    {info.purchase_lines.map((l, i) => {
                      const ptV = l.pt_vente || l.qty * l.pu_vente
                      const ptA = l.qty * l.pu_achat
                      const marge = ptV - ptA
                      const margePct = ptV > 0 ? (marge / ptV) * 100 : 0
                      const status = (l.line_status || 'pending') as LineStatus
                      const sCfg = LINE_STATUS_CFG[status] || LINE_STATUS_CFG.pending
                      const etaDate = l.eta ? new Date(l.eta) : null
                      const today = new Date()
                      const isLate = etaDate && etaDate < today && status !== 'livre'
                      const daysLeft = etaDate ? Math.ceil((etaDate.getTime() - today.getTime()) / 86400000) : null
                      return (
                        <div key={l.id} className={`grid grid-cols-[40px_1fr_60px_100px_100px_90px_110px_100px_80px] items-center px-4 py-2.5 text-[12px] hover:bg-slate-50/50 transition-colors ${isLate ? 'bg-red-50/30' : ''}`}>
                          {/* N° */}
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${l.pu_achat > 0 && l.fournisseur ? 'bg-emerald-500' : 'bg-slate-400'}`}>{i + 1}</span>
                          {/* Désignation — compact, 1 line truncated */}
                          <div className="min-w-0 pr-2">
                            <div className="truncate font-medium text-slate-800 cursor-pointer" title={l.designation}
                              onClick={() => setExpandedLines(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })}>
                              {l.ref && <span className="text-[10px] text-slate-400 mr-1 font-mono">[{l.ref}]</span>}
                              {expandedLines.has(l.id) ? l.designation : (l.designation.length > 60 ? l.designation.slice(0, 60) + '…' : l.designation)}
                            </div>
                            {l.fournisseur && <div className="text-[10px] text-slate-400 truncate">{l.fournisseur}{l.contact_fournisseur ? ` · ${l.contact_fournisseur}` : ''}</div>}
                          </div>
                          {/* Qté */}
                          <span className="text-right tabular-nums font-semibold text-slate-600">{l.qty}</span>
                          {/* PT Vente */}
                          <span className="text-right tabular-nums font-semibold text-slate-700">{ptV > 0 ? mad(ptV) : '—'}</span>
                          {/* PT Achat */}
                          <span className="text-right tabular-nums font-semibold text-slate-600">{l.pu_achat > 0 ? mad(ptA) : '—'}</span>
                          {/* Marge */}
                          <div className="text-right">
                            {l.pu_achat > 0 ? (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${margePct >= 15 ? 'bg-emerald-100 text-emerald-700' : margePct >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{margePct.toFixed(0)}%</span>
                            ) : <span className="text-slate-300">—</span>}
                          </div>
                          {/* Fournisseur — moved to designation line, just show badge here */}
                          <div className="text-center">
                            {l.fournisseur ? (
                              <span className="text-[10px] font-medium text-slate-500 truncate block">{l.fournisseur.split(' ').slice(0, 2).join(' ')}</span>
                            ) : <span className="text-[10px] text-amber-500 font-bold">⚠</span>}
                          </div>
                          {/* Statut */}
                          <div className="text-center">
                            <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${sCfg.bg} ${sCfg.color} border ${sCfg.border}`}>
                              {sCfg.icon} {sCfg.label}
                            </span>
                          </div>
                          {/* ETA */}
                          <div className="text-center">
                            {etaDate ? (
                              <span className={`text-[11px] font-bold tabular-nums ${isLate ? 'text-red-600' : daysLeft! <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {isLate && '⚠ '}{etaDate.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Footer totals */}
                  <div className="grid grid-cols-[40px_1fr_60px_100px_100px_90px_110px_100px_80px] items-center px-4 py-3 bg-slate-50 border-t-2 border-slate-200 text-[12px]">
                    <span />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Totaux</span>
                    <span />
                    <span className="text-right font-black text-slate-900 tabular-nums">{mad(totalVente)}</span>
                    <span className="text-right font-black text-slate-900 tabular-nums">{totalAchat > 0 ? mad(totalAchat) : '—'}</span>
                    <div className="text-right">
                      {totalAchat > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${margePctBrute >= 15 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{margePctBrute.toFixed(1)}%</span>}
                    </div>
                    <span />
                    <div className="text-center">
                      {(() => {
                        const delivered = info.purchase_lines.filter(l => l.line_status === 'livre').length
                        const total = info.purchase_lines.length
                        return <span className={`text-[10px] font-bold ${delivered === total ? 'text-emerald-600' : 'text-slate-500'}`}>{delivered}/{total} livré{delivered > 1 ? 's' : ''}</span>
                      })()}
                    </div>
                    <span />
                  </div>
                </div>

                {/* Line status update section (Supply management) */}
                <LineStatusManager lines={info.purchase_lines} opportunityId={id} onUpdate={loadAll} />

                {/* 3-col: recap + suppliers + files */}
                <div className="grid gap-4 lg:grid-cols-3">
                  {/* Recap */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'📊'} R\écap financier</div>
                    <RRow label="Total vente HT"  value={mad(totalVente)} bold />
                    <RRow label="Total achat HT"  value={totalAchat > 0 ? mad(totalAchat) : '\—'} />
                    <RRow label="Marge brute"     value={totalAchat > 0 ? mad(margeBrute) : '\—'}
                      sub={totalAchat > 0 ? pct(totalVente > 0 ? (margeBrute/totalVente)*100 : 0) : undefined}
                      color={margeBrute >= 0 ? 'emerald' : 'red'} />
                    {info.frais_engagement > 0 && (
                      <div className="border-t border-slate-200 pt-2">
                        <RRow label="Frais engagement" value={`\− ${mad(info.frais_engagement)}`} color="amber" />
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-2">
                      <RRow label="Marge nette" value={totalAchat > 0 ? mad(margeNette) : '\—'}
                        sub={totalAchat > 0 ? pct(margePctNette) : undefined}
                        color={margePctNette < 10 ? 'red' : 'emerald'} bold />
                    </div>
                    {info.justif_reason && (
                      <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[10px] font-bold text-amber-700 uppercase mb-1">{'\⚠'} Marge faible</div>
                        <div className="text-xs font-medium text-amber-800">{info.justif_reason}</div>
                        <div className="mt-1 text-[10px] font-bold">
                          {info.approved_by
                            ? <span className="text-emerald-600">{'\✓'} Valid\é par {info.approved_by}</span>
                            : <span className="text-amber-500 flex items-center gap-1"><Clock className="h-3 w-3" /> En attente Achraf</span>}
                        </div>
                      </div>
                    )}
                    {info.payment_terms && (
                      <div className="border-t border-slate-200 pt-2">
                        <RRow label="Modalit\és paiement" value={(() => {
                          try {
                            const parsed = JSON.parse(info.payment_terms!)
                            return parsed.template ? paymentTermLabel(parsed.template) : paymentTermLabel(info.payment_terms!)
                          } catch { return paymentTermLabel(info.payment_terms!) }
                        })()} />
                      </div>
                    )}
                    {info.notes && <p className="border-t border-slate-200 pt-2 text-xs text-slate-500 italic">{info.notes}</p>}
                  </div>

                  {/* Suppliers */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'🏭'} Fournisseurs ({uniqueSuppliers.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {uniqueSuppliers.length === 0
                        ? <p className="text-xs text-slate-400 italic">Aucun fournisseur</p>
                        : uniqueSuppliers.map((s, i) => (
                          <div key={i}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-default transition-colors"
                            title={[s.contact_fournisseur, s.email_fournisseur, s.tel_fournisseur].filter(Boolean).join(' \· ')}>
                            {s.fournisseur}
                            <span className="text-slate-400 font-normal ml-1">{'\·'} {info.purchase_lines.filter(l => l.fournisseur === s.fournisseur).length}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Files */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{'📄'} Documents ({files.length})</div>
                    <div className="space-y-1.5">
                      {files.length === 0
                        ? <p className="text-xs text-slate-400 italic">Aucun document</p>
                        : files.map(f => (
                          <div key={f.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${f.file_type==='bc_client'?'border-blue-100 bg-blue-50':f.file_type==='devis_compucom'?'border-violet-100 bg-violet-50':'border-slate-200 bg-white'}`}>
                            <FileText className={`h-3.5 w-3.5 shrink-0 ${f.file_type==='bc_client'?'text-blue-600':f.file_type==='devis_compucom'?'text-violet-600':'text-slate-400'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wide opacity-60">{f.file_type==='bc_client'?'BC Client':f.file_type==='devis_compucom'?'Devis':'Autre'}</div>
                              <div className="text-xs font-semibold truncate">{f.file_name}</div>
                            </div>
                            {fileUrls[f.id] && (
                              <a href={fileUrls[f.id]} target="_blank" rel="noreferrer" className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Send button */}
                <div className={`rounded-xl border-2 p-4 transition-colors ${canEmail ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className={`text-sm font-bold ${canEmail ? 'text-slate-900' : 'text-slate-400'}`}>
                        {canEmail ? '\✅ Fiche compl\ète \— pr\ête \à envoyer \à Supply Chain' : '\⏳ Compl\étez la fiche pour activer la commande'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        À : supplychain@compucom.ma · CC : n.bahhar@compucom.ma
                        {margePctBrute < 10 && totalAchat > 0 && <>, A.lahkim@compucom.ma <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700">{'\⚠'} Achraf</span></>}
                      </div>
                    </div>
                    <button onClick={async () => {
                        if (opp && info) {
                          await openSupplyEmail(opp, info, userEmail)
                          setEmailCopied(true)
                          setTimeout(() => setEmailCopied(false), 8000)
                        }
                      }} disabled={!canEmail}
                      className={`shrink-0 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors shadow-sm ${emailCopied ? 'bg-emerald-600 text-white' : canEmail ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                      {emailCopied ? <><Check className="h-4 w-4" /> Copi\é ! Ctrl+V dans Outlook</> : <><Mail className="h-4 w-4" /> Commander via Outlook</>}
                    </button>
                  </div>
                  {emailCopied && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">
                      {'\✅'} Email copi\é dans le presse-papier \— <strong>Collez (Ctrl+V)</strong> dans le corps du mail Outlook puis Envoyer
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl border border-amber-100">{'📦'}</div>
                <p className="text-base font-black text-slate-800">Aucune fiche achat</p>
                <p className="text-sm text-slate-400 mt-1 mb-4 max-w-xs leading-relaxed">Remplis la fiche achat pour d\éclencher le processus de commande Supply Chain.</p>
                <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-white hover:bg-amber-600 transition-colors">
                  <Package className="h-4 w-4" /> Remplir la fiche achat
                </button>
              </div>
            )}
          </Section>
        )}

        {/* ══ SECTION: SUPPLY / LOGISTIQUE ══ */}
        {supply && supCfg && (
          <Section id="supply" title="Logistique" icon="🚚">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{'📦'} Statut commande Supply</span>
              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${supCfg.bg} ${supCfg.color}`}>
                <span className={`h-2 w-2 rounded-full ${supCfg.dot}`} />
                {supCfg.label}
              </div>
            </div>
            <div className="flex items-center">
              {STATUS_ORDER.map((s, i) => {
                const cfg    = STATUS_CFG[s]
                const done   = i <= supIdx
                const active = i === supIdx
                return (
                  <div key={s} className="flex flex-1 items-center">
                    <div className="flex flex-1 flex-col items-center gap-1">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm transition-all ${active ? 'border-slate-900 bg-slate-900 text-white scale-110 shadow-md' : done ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white text-slate-300'}`}>
                        {done && !active ? <Check className="h-4 w-4" /> : <span className="text-base">{cfg.icon}</span>}
                      </div>
                      <span className={`text-[9px] font-bold text-center leading-tight ${active ? 'text-slate-900' : 'text-slate-400'}`}>{cfg.label}</span>
                    </div>
                    {i < STATUS_ORDER.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 rounded-full mb-4 ${i < supIdx ? 'bg-slate-400' : 'bg-slate-100'}`} />
                    )}
                  </div>
                )
              })}
            </div>
            {supply.supply_notes && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Note Supply : </span>{supply.supply_notes}
              </div>
            )}

            {/* Supply key dates */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
              {[
                { label: 'Plac\é le', date: supply.placed_at },
                { label: 'Command\é le', date: supply.ordered_at },
                { label: 'Re\çu le', date: supply.received_at },
                { label: 'Livr\é le', date: supply.delivered_at },
                { label: 'Factur\é le', date: supply.invoiced_at },
              ].map(d => (
                <div key={d.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{d.label}</div>
                  <div className={`text-xs font-bold mt-0.5 ${d.date ? 'text-slate-700' : 'text-slate-300'}`}>
                    {d.date ? fmtDate(d.date) : '\—'}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ══ SECTION: PRESCRIPTION ══ */}
        {(() => {
          if (!prescription) return null
          const psCfg = PRESCRIPTION_STATUS_CFG[(prescription.prescription_status || 'en_attente') as PrescriptionStatus]
          return (
            <Section id="prescription" title="Prescription" icon="📋"
              badge={
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${psCfg.bg} ${psCfg.color}`}>
                  {psCfg.icon} {psCfg.label}
                </span>
              }>
              <div className="flex items-center gap-6">
                {prescription.assigned_to && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Ing\énieur presales</div>
                    <div className="text-sm font-semibold text-slate-700">{prescription.assigned_to}</div>
                  </div>
                )}
                {prescription.bu && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">BU</div>
                    <div className="text-sm font-semibold text-slate-700">{prescription.bu}</div>
                  </div>
                )}
                {prescription.description && (
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Description</div>
                    <div className="text-xs text-slate-600">{prescription.description}</div>
                  </div>
                )}
                {prescription.notes && (
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Notes</div>
                    <div className="text-xs text-slate-500 italic">{prescription.notes}</div>
                  </div>
                )}
              </div>
            </Section>
          )
        })()}

        {/* ══ SECTION: PROJET & DEPLOIEMENT ══ */}
        {(() => {
          if (deployServices.length === 0) return null
          const done = deployServices.filter(s => s.status === 'termine').length
          const pctDeploy = Math.round((done / deployServices.length) * 100)
          return (
            <Section id="deploiement" title="Projet & D\éploiement" icon="🚀"
              badge={
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pctDeploy === 100 ? 'bg-emerald-500' : pctDeploy >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                      style={{ width: `${pctDeploy}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-600">{pctDeploy}%</span>
                  <span className="text-[10px] text-slate-400">{done}/{deployServices.length}</span>
                </div>
              }>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-2 text-left">Titre</th>
                      <th className="px-4 py-2 text-left">Ing\énieur</th>
                      <th className="px-4 py-2 text-center">Statut</th>
                      <th className="px-4 py-2 text-left">D\ébut</th>
                      <th className="px-4 py-2 text-left">Fin</th>
                      <th className="px-4 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {deployServices.map(svc => {
                      const cfg = PROJECT_SERVICE_STATUS_CFG[svc.status]
                      return (
                        <tr key={svc.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-2.5 font-semibold text-slate-800">{svc.title}</td>
                          <td className="px-4 py-2.5 text-slate-600">{svc.assigned_to || '\—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(svc.start_date)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(svc.end_date)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[150px] truncate" title={svc.notes || ''}>{svc.notes || '\—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )
        })()}

        {/* ══ SECTION: FACTURATION ══ */}
        {isWon && (
          <Section id="facturation" title="Facturation" icon="💰"
            badge={
              invoices.length > 0 ? (() => {
                const totalFacture = invoices.reduce((s, inv) => s + (inv.amount || 0), 0)
                const dealAmt = opp.amount || 1
                const factPct = Math.min(100, Math.round((totalFacture / dealAmt) * 100))
                return (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-slate-200 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${factPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${factPct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{mad(totalFacture)}</span>
                    <span className="text-[10px] text-slate-400">/ {mad(opp.amount)}</span>
                  </div>
                )
              })() : undefined
            }>
            {invoices.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-400">Aucune facture pour ce deal</p>
                <Link href="/invoices" className="text-xs text-blue-600 hover:underline font-semibold mt-1 inline-block">
                  G\érer les factures {'\→'}
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-2 text-left">N\° Facture</th>
                      <th className="px-4 py-2 text-right">Montant</th>
                      <th className="px-4 py-2 text-center">Lignes</th>
                      <th className="px-4 py-2 text-left">\Émise le</th>
                      <th className="px-4 py-2 text-left">\Éch\éance</th>
                      <th className="px-4 py-2 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoices.map(inv => {
                      const cfg = INVOICE_STATUS_CFG[inv.status]
                      const isOverdue = inv.due_date && inv.status !== 'payee' && new Date(inv.due_date) < new Date()
                      const lines = inv.invoice_lines || []
                      return (
                        <React.Fragment key={inv.id}>
                        <tr className={`hover:bg-slate-50/50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                          <td className="px-5 py-2.5 font-semibold text-slate-800">{inv.invoice_number || '\—'}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{mad(inv.amount)}</td>
                          <td className="px-4 py-2.5 text-center">
                            {lines.length > 0 ? (
                              <button
                                onClick={() => setExpandedInv(expandedInv === inv.id ? null : inv.id)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${
                                  expandedInv === inv.id
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-600'
                                }`}
                              >
                                {lines.length} ligne{lines.length > 1 ? 's' : ''}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">{'\—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(inv.issue_date)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">
                            {fmtDate(inv.due_date)}
                            {isOverdue && <span className="ml-1 text-[9px] font-bold text-red-600">en retard</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                        </tr>
                        {expandedInv === inv.id && lines.length > 0 && (
                          <tr className="bg-blue-50/30">
                            <td colSpan={6} className="px-5 py-2">
                              <div className="rounded-lg bg-white border border-blue-100 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-[9px] font-bold uppercase text-slate-400">
                                      <th className="px-3 py-1.5 text-left">Ref</th>
                                      <th className="px-3 py-1.5 text-left">D\ésignation</th>
                                      <th className="px-3 py-1.5 text-right">Qt\é</th>
                                      <th className="px-3 py-1.5 text-right">Pt Vente</th>
                                      <th className="px-3 py-1.5 text-left">Fournisseur</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {lines.map((ln, i) => {
                                      const pl = ln.purchase_lines
                                      return (
                                        <tr key={ln.purchase_line_id || i}>
                                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">{pl?.ref || '\—'}</td>
                                          <td className="px-3 py-1.5 text-[11px] text-slate-600 max-w-[200px] truncate">{pl?.designation || '\—'}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800">{pl?.qty ?? '\—'}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800">{pl?.pt_vente ? mad(pl.pt_vente) : '\—'}</td>
                                          <td className="px-3 py-1.5 text-slate-500">{pl?.fournisseur || '\—'}</td>
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
          </Section>
        )}

        {/* ══ SECTION: SUPPORT ══ */}
        {tickets.length > 0 && (
          <Section id="support" title="Support / SAV" icon="🛟">
            <div className="space-y-2">
              {tickets.map((t: any) => {
                const isOpen = t.status === 'ouvert' || t.status === 'en_cours'
                return (
                  <div key={t.id} className={`rounded-xl border p-3 flex items-center justify-between ${isOpen ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100'}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.type && <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{t.type}</span>}
                        {t.assigned_to && <span className="text-[10px] text-slate-400">{'\→'} {t.assigned_to}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isOpen ? 'bg-amber-100 text-amber-700' : t.status === 'resolu' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>{t.status}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(t.created_at)}</div>
                    </div>
                  </div>
                )
              })}
              <Link href="/support" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold mt-1">
                Voir sur la page support <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </Section>
        )}

        {/* ══ SECTION: HISTORIQUE ══ */}
        {activities.length > 0 && (
          <Section id="historique" title={`Historique (${activities.length})`} icon="🕐" defaultOpen={true}>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50 -m-5 p-5">
              {activities.map(a => {
                const icon  = ACTION_ICON[a.action_type] || '📌'
                const color = ACTION_COLOR[a.action_type] || '#64748b'
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ backgroundColor: color + '15' }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 truncate">{a.entity_name}</span>
                      {a.detail && <span className="text-xs text-slate-400 truncate">{a.detail}</span>}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{fmtDateTime(a.created_at)}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

// ─── Section component ──────────────────────────────────────
function Section({ id, title, icon, badge, children, defaultOpen = true }: {
  id: string; title: string; icon: string; badge?: React.ReactNode
  children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div id={`section-${id}`} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full border-b border-slate-50 bg-slate-50/50 px-5 py-3 flex items-center justify-between hover:bg-slate-100/50 transition-colors">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <span>{icon}</span> {title}
        </span>
        <div className="flex items-center gap-2">
          {badge}
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

// ─── NavPill component ──────────────────────────────────────
function NavPill({ href, label, active, alert }: { href: string; label: string; active?: boolean; alert?: boolean }) {
  return (
    <a href={href}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
      }`}>
      {label}
      {alert && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
    </a>
  )
}

// ─── Line Status Manager ─────────────────────────────────────
function LineStatusManager({ lines, opportunityId, onUpdate }: {
  lines: PurchaseLine[]; opportunityId: string; onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, { status: string; eta: string; note: string }>>({})

  const initEdit = (l: PurchaseLine) => {
    if (!edits[l.id]) {
      setEdits(prev => ({
        ...prev,
        [l.id]: {
          status: l.line_status || 'pending',
          eta: l.eta || '',
          note: l.status_note || '',
        }
      }))
    }
  }

  const updateEdit = (id: string, field: string, value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const saveLineStatus = async (lineId: string) => {
    const edit = edits[lineId]
    if (!edit) return
    setSaving(lineId)
    try {
      await supabase.from('purchase_lines').update({
        line_status: edit.status,
        eta: edit.eta || null,
        status_note: edit.note || null,
        eta_updated_at: new Date().toISOString(),
      }).eq('id', lineId)
      onUpdate()
    } catch (e) {
      console.error('Error updating line status:', e)
    }
    setSaving(null)
  }

  // Count delays
  const today = new Date()
  const lateLines = lines.filter(l => {
    if (l.line_status === 'livre') return false
    if (!l.eta) return false
    return new Date(l.eta) < today
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">Suivi ligne par ligne</span>
          {lateLines.length > 0 && (
            <span className="rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {lateLines.length} retard{lateLines.length > 1 ? 's' : ''}
            </span>
          )}
          {(() => {
            const delivered = lines.filter(l => l.line_status === 'livre').length
            return delivered > 0 && (
              <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                {delivered}/{lines.length} livré{delivered > 1 ? 's' : ''}
              </span>
            )
          })()}
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {lines.map((l) => {
            const edit = edits[l.id]
            const isEditing = !!edit
            const status = (l.line_status || 'pending') as LineStatus
            const sCfg = LINE_STATUS_CFG[status] || LINE_STATUS_CFG.pending
            const etaDate = l.eta ? new Date(l.eta) : null
            const isLate = etaDate && etaDate < today && status !== 'livre'

            return (
              <div key={l.id} className={`px-4 py-3 ${isLate ? 'bg-red-50/50' : 'bg-white'}`}>
                <div className="flex items-start gap-3">
                  {/* Line info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {l.ref && <span className="text-[10px] text-slate-400 font-mono">[{l.ref}]</span>}
                      <span className="text-sm font-semibold text-slate-800 truncate">{l.designation}</span>
                      <span className="text-[10px] text-slate-400">×{l.qty}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {l.fournisseur && <span className="text-[10px] font-medium text-slate-500">📦 {l.fournisseur}</span>}
                      {l.contact_fournisseur && <span className="text-[10px] text-slate-400">· {l.contact_fournisseur}</span>}
                    </div>
                  </div>

                  {/* Status + ETA display */}
                  {!isEditing && (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${sCfg.bg} ${sCfg.color} border ${sCfg.border}`}>
                        {sCfg.icon} {sCfg.label}
                      </span>
                      {etaDate && (
                        <span className={`text-xs font-bold tabular-nums ${isLate ? 'text-red-600' : 'text-slate-600'}`}>
                          {isLate && '⚠ '}{etaDate.toLocaleDateString('fr-MA', { day:'2-digit', month:'short' })}
                        </span>
                      )}
                      <button onClick={() => initEdit(l)}
                        className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                        <Edit2 className="h-3 w-3" /> Mettre à jour
                      </button>
                    </div>
                  )}

                  {/* Edit mode */}
                  {isEditing && (
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <select value={edit.status} onChange={e => updateEdit(l.id, 'status', e.target.value)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-400">
                        {LINE_STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{LINE_STATUS_CFG[s].icon} {LINE_STATUS_CFG[s].label}</option>
                        ))}
                      </select>
                      <input type="date" value={edit.eta} onChange={e => updateEdit(l.id, 'eta', e.target.value)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400" />
                      <input value={edit.note} onChange={e => updateEdit(l.id, 'note', e.target.value)}
                        placeholder="Note…"
                        className="h-8 w-32 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400 placeholder:text-slate-300" />
                      <button onClick={() => saveLineStatus(l.id)} disabled={saving === l.id}
                        className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition">
                        {saving === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </button>
                      <button onClick={() => setEdits(prev => { const n = { ...prev }; delete n[l.id]; return n })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {l.status_note && !isEditing && (
                  <div className="mt-1 text-[10px] text-slate-400 italic pl-1">💬 {l.status_note}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const c = status === 'Won'  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
            status === 'Lost' ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-amber-100 text-amber-700 border-amber-200'
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${c}`}>{status}</span>
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm font-medium text-slate-700">{value}</div>
      </div>
    </div>
  )
}

function RRow({ label, value, color, sub, bold }: {
  label: string; value: string; color?: 'emerald' | 'red' | 'amber'; sub?: string; bold?: boolean
}) {
  const vc = color==='emerald'?'text-emerald-700':color==='red'?'text-red-600':color==='amber'?'text-amber-600':'text-slate-700'
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        {sub && (
          <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${color==='emerald'?'bg-emerald-100 text-emerald-600':color==='red'?'bg-red-100 text-red-600':'bg-amber-100 text-amber-600'}`}>{sub}</span>
        )}
        <span className={`text-xs tabular-nums ${bold?'font-black':'font-semibold'} ${vc}`}>{value}</span>
      </div>
    </div>
  )
}
