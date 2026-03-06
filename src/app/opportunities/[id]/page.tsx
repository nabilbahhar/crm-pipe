'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  ArrowLeft, Package, Mail, Edit2, Loader2, X,
  Copy, Check, ExternalLink, FileText, Building2,
  Clock, ShieldCheck, AlertTriangle, CheckCircle2,
  TrendingUp, Download, Phone, Globe, MapPin,
  ChevronRight, Activity, Target, Calendar, Zap,
  BarChart2, User, Tag, Flag,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Opp = {
  id: string; title: string; amount: number; status: string; stage: string
  prob?: number; bu?: string; po_number?: string; vendor?: string
  next_step?: string; contact_name?: string; contact_email?: string
  closing_date?: string; booking_month?: string; closing_month?: string
  closing?: string; created_at?: string; updated_at?: string
  owner_email?: string; notes?: string; description?: string
  multi_bu?: boolean; forecast?: string
  accounts?: { id?: string; name?: string; sector?: string; segment?: string; region?: string } | null
}
type PurchaseLine = {
  id: string; ref: string; designation: string; sort_order: number
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur?: string; contact_fournisseur?: string
  email_fournisseur?: string; tel_fournisseur?: string
}
type PurchaseInfo = {
  id: string; frais_engagement: number; notes: string
  filled_by: string; justif_reason?: string; justif_text?: string
  approved_by?: string; created_at: string; updated_at?: string
  purchase_lines: PurchaseLine[]
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

// ─── Formatters ───────────────────────────────────────────────
const mad = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD'
const pct = (n: number) => `${n.toFixed(1)} %`
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const closingDate = (o: Opp) =>
  o.booking_month || o.closing_month || o.closing_date || o.closing

// ─── Supply status config ─────────────────────────────────────
type SupplyStatus = 'a_commander' | 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'
const STATUS_CFG: Record<string, { label: string; icon: string; color: string; bg: string; dot: string }> = {
  a_commander: { label: 'À commander', icon: '📋', color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-400'   },
  place:       { label: 'Placé',        icon: '📤', color: 'text-blue-700',   bg: 'bg-blue-50',    dot: 'bg-blue-500'    },
  commande:    { label: 'Commandé',     icon: '🔄', color: 'text-violet-700', bg: 'bg-violet-50',  dot: 'bg-violet-500'  },
  en_stock:    { label: 'En stock',     icon: '📦', color: 'text-orange-700', bg: 'bg-orange-50',  dot: 'bg-orange-400'  },
  livre:       { label: 'Livré',        icon: '🚚', color: 'text-emerald-700',bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',  bg: 'bg-slate-100',  dot: 'bg-slate-400'   },
}
const STATUS_ORDER: SupplyStatus[] = ['a_commander','place','commande','en_stock','livre','facture']

const STAGE_CFG: Record<string, { bg: string; text: string }> = {
  'Lead':             { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  'Discovery':        { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  'Qualified':        { bg: 'bg-cyan-50',     text: 'text-cyan-700'    },
  'Solutioning':      { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  'Proposal Sent':    { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  'Negotiation':      { bg: 'bg-orange-50',   text: 'text-orange-700'  },
  'Commit':           { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  'Won':              { bg: 'bg-green-100',   text: 'text-green-800'   },
  'Lost / No decision':{ bg: 'bg-red-50',    text: 'text-red-600'     },
}

const ACTION_ICON: Record<string, string> = {
  create: '✨', update: '✏️', delete: '🗑️', view: '👁️',
  won: '🏆', lost: '❌', stage_change: '📊', note: '📝',
  upload: '📎', email: '📧', call: '📞',
}
const ACTION_COLOR: Record<string, string> = {
  create: '#10b981', update: '#3b82f6', won: '#f59e0b', lost: '#ef4444',
  stage_change: '#8b5cf6', note: '#64748b', upload: '#06b6d4', email: '#8b5cf6',
}

// ─── HTML email builder ───────────────────────────────────────
function buildEmailHtml(deal: Opp, info: PurchaseInfo): string {
  const client     = deal.accounts?.name || deal.title
  const totalVente = info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0)
  const totalAchat = info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
  const margeNette = totalVente - totalAchat - (info.frais_engagement||0)
  const margePct   = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const today      = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' })
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
    const first = lines[0]
    const subT  = lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
    const rows  = lines.map((l,i) => `
      <tr style="background:${i%2?'#f8fafc':'#fff'}">
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9">
          ${l.ref?`<span style="color:#94a3b8;font-size:11px;margin-right:6px">[${l.ref}]</span>`:''}${l.designation}
        </td>
        <td style="padding:10px 16px;font-size:13px;text-align:center;font-weight:600;border-bottom:1px solid #f1f5f9">${l.qty}</td>
        <td style="padding:10px 16px;font-size:13px;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9">${mad(l.pu_achat)}</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:700;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9">${mad(l.qty*l.pu_achat)}</td>
      </tr>`).join('')
    return `<div style="margin-bottom:16px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:${col};padding:12px 20px">
        <table width="100%"><tr>
          <td><div style="color:#fff;font-size:14px;font-weight:800">🏭 ${name}</div>
            <div style="color:rgba(255,255,255,.8);font-size:11px;margin-top:2px">
              ${first.contact_fournisseur||''}${first.email_fournisseur?` · ${first.email_fournisseur}`:''}${first.tel_fournisseur?` · ${first.tel_fournisseur}`:''}
            </div></td>
          <td align="right"><span style="background:rgba(255,255,255,.2);border-radius:6px;padding:3px 10px;color:#fff;font-size:12px;font-weight:700">${mad(subT)}</span></td>
        </tr></table>
      </div>
      <table width="100%" style="border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:left;border-bottom:2px solid #e2e8f0">Désignation</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:center;border-bottom:2px solid #e2e8f0">Qté</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0">PU Achat</th>
          <th style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0">Total HT</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')
  const mc = margePct >= 20 ? '#16a34a' : margePct >= 10 ? '#d97706' : '#dc2626'
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px"><tr><td align="center">
<table width="660" style="max-width:660px;width:100%">
  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:16px 16px 0 0;padding:24px 28px">
    <div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Commande Supply Chain · ${today}</div>
    <div style="color:#fff;font-size:20px;font-weight:900;line-height:1.2">📦 ${deal.title}</div>
    <div style="color:#cbd5e1;font-size:13px;margin-top:6px">🏢 <strong style="color:#e2e8f0">${client}</strong>${deal.po_number?` · PO <strong style="color:#e2e8f0">${deal.po_number}</strong>`:''}${deal.bu?` · ${deal.bu}`:''}</div>
  </td></tr>
  <tr><td style="background:#fff;padding:24px 28px">
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7">Bonjour,<br><br>Merci de traiter la commande ci-dessous pour le client <strong>${client}</strong>. Merci de confirmer la prise en charge et le délai prévisionnel.</p>
    ${blocks}
    <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-top:4px">
      <div style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0"><span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">📊 Récapitulatif financier</span></div>
      <table width="100%" style="border-collapse:collapse">
        <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f8fafc">Total vente HT</td><td style="padding:10px 16px;font-size:13px;font-weight:700;text-align:right;font-family:monospace;border-bottom:1px solid #f8fafc">${mad(totalVente)}</td></tr>
        <tr style="background:#fafafa"><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9">Total achat HT</td><td style="padding:10px 16px;font-size:13px;font-weight:700;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9">${mad(totalAchat)}</td></tr>
        ${info.frais_engagement>0?`<tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9">Frais d'engagement</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#d97706;text-align:right;font-family:monospace;border-bottom:1px solid #f1f5f9">− ${mad(info.frais_engagement)}</td></tr>`:''}
        <tr style="background:#f0fdf4"><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#166534">Marge nette</td><td style="padding:12px 16px;text-align:right"><span style="font-size:16px;font-weight:900;color:${mc};font-family:monospace">${mad(margeNette)}</span><span style="margin-left:8px;background:${mc};color:#fff;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700">${pct(margePct)}</span></td></tr>
      </table>
    </div>
    ${info.notes?`<div style="margin-top:12px;border-radius:8px;border:1px solid #fde68a;background:#fffbeb;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px">📝 Notes</div><div style="font-size:13px;color:#78350f">${info.notes}</div></div>`:''}
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:16px 28px">
    <table width="100%"><tr>
      <td style="font-size:12px;color:#94a3b8">Merci de <strong style="color:#64748b">confirmer la réception</strong> et d'indiquer le délai estimé.</td>
      <td align="right"><span style="background:#0f172a;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700">Compucom · Supply Chain</span></td>
    </tr></table>
  </td></tr>
</table></td></tr></table></body></html>`
}

// ─── Email Modal ──────────────────────────────────────────────
function EmailModal({ deal, info, onClose }: { deal: Opp; info: PurchaseInfo; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const html    = buildEmailHtml(deal, info)
  const client  = deal.accounts?.name || deal.title
  const today   = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' })
  const subject = `Commande ${client}${deal.po_number ? ` – PO ${deal.po_number}` : ''} – ${mad(deal.amount)} – ${today}`
  const mailto  = `mailto:supplychain@compucom.ma?cc=n.bahhar@compucom.ma&subject=${encodeURIComponent(subject)}`

  async function copyHtml() {
    await navigator.clipboard.writeText(html).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4">
      <div className="flex w-full flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ maxHeight: '92vh', maxWidth: 800 }}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lg shrink-0">📧</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-900 text-sm">Email commande Supply Chain</div>
            <div className="text-xs text-slate-400 truncate">À : supplychain@compucom.ma · CC : n.bahhar@compucom.ma</div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5 shrink-0">Objet</span>
            <span className="text-xs font-semibold text-slate-700 leading-relaxed">{subject}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[#e8edf3] p-3">
          <iframe srcDoc={html} title="Aperçu email" className="w-full rounded-xl bg-white shadow border border-slate-200" style={{ minHeight: 480, height: '100%' }} />
        </div>
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 space-y-2.5">
          <div className="flex flex-wrap gap-2.5">
            <button onClick={() => { window.location.href = mailto }}
              className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> Étape 1 — Ouvrir Outlook
            </button>
            <button onClick={copyHtml}
              className={`flex h-9 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors ${copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
              {copied ? <><Check className="h-3.5 w-3.5" /> Copié !</> : <><Copy className="h-3.5 w-3.5" /> Étape 2 — Copier le HTML</>}
            </button>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Mode d'emploi :</strong> Ouvrir Outlook → cliquer dans le corps → Ctrl+V → Envoyer
          </div>
        </div>
      </div>
    </div>
  )
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
  const [loading, setLoading]     = useState(true)
  const [showEmail, setShowEmail] = useState(false)

  useEffect(() => { if (id) loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const [oppRes, infoRes, filesRes, supplyRes, actRes] = await Promise.all([
      supabase.from('opportunities')
        .select('*, accounts(id,name,sector,segment,region)')
        .eq('id', id).single(),
      supabase.from('purchase_info')
        .select('*, purchase_lines(*)')
        .eq('opportunity_id', id).maybeSingle(),
      supabase.from('deal_files')
        .select('id,file_type,file_name,file_url')
        .eq('opportunity_id', id),
      supabase.from('supply_orders')
        .select('*').eq('opportunity_id', id).maybeSingle(),
      supabase.from('activity_log')
        .select('id,action_type,entity_type,entity_name,detail,created_at,user_email')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (oppRes.data) setOpp({ ...oppRes.data, accounts: oppRes.data.accounts as any })

    if (infoRes.data) setInfo({
      ...infoRes.data,
      purchase_lines: (infoRes.data.purchase_lines || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    })

    const f = filesRes.data || []
    setFiles(f)
    const urls: Record<string, string> = {}
    await Promise.all(f.map(async (fi: DealFile) => {
      const { data } = await supabase.storage.from('deal-files').createSignedUrl(fi.file_url, 3600)
      if (data?.signedUrl) urls[fi.id] = data.signedUrl
    }))
    setFileUrls(urls)

    if (supplyRes.data) setSupply(supplyRes.data)
    setActivities(actRes.data || [])
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
  const margePctNette = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const linesOk       = info ? info.purchase_lines.filter(l => Number(l.pu_achat) > 0 && l.fournisseur?.trim()).length : 0
  const ficheComplete = !!(info && info.purchase_lines.length > 0 && linesOk === info.purchase_lines.length)
  const canEmail      = ficheComplete && isWon
  const supIdx        = supply ? STATUS_ORDER.indexOf(supply.status as SupplyStatus) : -1
  const supCfg        = supply ? STATUS_CFG[supply.status] : null
  const cDate         = closingDate(opp)
  const stageCfg      = STAGE_CFG[opp.stage] || { bg: 'bg-slate-100', text: 'text-slate-600' }

  const uniqueSuppliers = info
    ? Array.from(new Map(info.purchase_lines.filter(l => l.fournisseur).map(l => [l.fournisseur, l])).values())
    : []

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <button onClick={() => router.back()}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">{opp.title}</h1>
              <StatusPill status={opp.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {opp.accounts?.name && (
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Building2 className="h-3.5 w-3.5 shrink-0" /> {opp.accounts.name}
                </span>
              )}
              {opp.bu   && <><span className="text-slate-300">·</span><span>{opp.bu}</span></>}
              {opp.vendor && <><span className="text-slate-300">·</span><span>{opp.vendor}</span></>}
              {opp.po_number && <><span className="text-slate-300">·</span><span className="font-medium">PO {opp.po_number}</span></>}
            </p>
          </div>
          {isWon && (
            <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
              className={`shrink-0 inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-colors ${info ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
              <Package className="h-4 w-4" />
              {info ? 'Modifier fiche' : 'Remplir fiche'}
            </button>
          )}
        </div>

        {/* ══ SECTION 1 : INFOS PIPELINE / DEAL ══ */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Informations Deal</span>
          </div>
          <div className="p-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
              <div className="rounded-xl bg-slate-900 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Montant Deal</div>
                <div className="text-base font-black text-white tabular-nums">{mad(opp.amount)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Stage</div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${stageCfg.bg} ${stageCfg.text}`}>{opp.stage || '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Probabilité</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${opp.prob||0}%` }} />
                  </div>
                  <span className="text-sm font-black text-slate-800">{opp.prob||0}%</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Clôture</div>
                <div className="text-sm font-bold text-slate-800">{fmtDate(cDate)}</div>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {opp.accounts?.sector && <DetailRow icon={<Tag className="h-3.5 w-3.5"/>} label="Secteur" value={opp.accounts.sector} />}
              {opp.accounts?.segment && <DetailRow icon={<Target className="h-3.5 w-3.5"/>} label="Segment" value={opp.accounts.segment} />}
              {opp.accounts?.region && <DetailRow icon={<MapPin className="h-3.5 w-3.5"/>} label="Région" value={opp.accounts.region} />}
              {opp.contact_name && <DetailRow icon={<User className="h-3.5 w-3.5"/>} label="Contact" value={opp.contact_name} />}
              {opp.contact_email && <DetailRow icon={<Mail className="h-3.5 w-3.5"/>} label="Email contact" value={opp.contact_email} />}
              {opp.vendor && <DetailRow icon={<Building2 className="h-3.5 w-3.5"/>} label="Vendor / Constructeur" value={opp.vendor} />}
              {opp.po_number && <DetailRow icon={<Tag className="h-3.5 w-3.5"/>} label="N° PO" value={opp.po_number} />}
              {opp.forecast && <DetailRow icon={<TrendingUp className="h-3.5 w-3.5"/>} label="Forecast" value={opp.forecast} />}
              <DetailRow icon={<Calendar className="h-3.5 w-3.5"/>} label="Créé le" value={fmtDate(opp.created_at)} />
              {opp.updated_at && <DetailRow icon={<Clock className="h-3.5 w-3.5"/>} label="Mis à jour" value={fmtDate(opp.updated_at)} />}
            </div>

            {/* Next step */}
            {opp.next_step && (
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500 mb-1.5">🎯 Prochaine étape</div>
                <p className="text-sm text-blue-800 leading-relaxed">{opp.next_step}</p>
              </div>
            )}

            {/* Notes / description */}
            {(opp.notes || opp.description) && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">📝 Notes</div>
                <p className="text-sm text-slate-600 leading-relaxed">{opp.notes || opp.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 2 : SUPPLY ORDER TRACKER (si existe) ══ */}
        {supply && supCfg && (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📦 Statut commande Supply</span>
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
          </div>
        )}

        {/* ══ SECTION 3 : FICHE ACHAT (Won uniquement) ══ */}
        {isWon && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {/* Header fiche */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${ficheComplete ? 'bg-emerald-50 border-emerald-100' : info ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${ficheComplete ? 'bg-emerald-500' : info ? 'bg-blue-500' : 'bg-amber-500'} text-white`}>📋</div>
                <div>
                  <div className={`text-sm font-black ${ficheComplete ? 'text-emerald-900' : info ? 'text-blue-900' : 'text-amber-900'}`}>
                    Fiche Achat
                    {ficheComplete && <span className="ml-2 text-xs font-normal text-emerald-600">Complète ✓</span>}
                    {info && !ficheComplete && <span className="ml-2 text-xs font-normal text-blue-600">En cours · {linesOk}/{info.purchase_lines.length} lignes</span>}
                    {!info && <span className="ml-2 text-xs font-normal text-amber-600">À remplir</span>}
                  </div>
                  {info && (
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Par <span className="font-medium">{info.filled_by}</span>
                      {info.updated_at && <> · {fmtDate(info.updated_at)}</>}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors ${ficheComplete ? 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50' : info ? 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50' : 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'}`}>
                <Edit2 className="h-3.5 w-3.5" />
                {ficheComplete ? 'Modifier' : info ? 'Compléter' : 'Remplir'}
              </button>
            </div>

            {info && info.purchase_lines.length > 0 ? (
              <div className="p-5 space-y-4">
                {/* Lines table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm" style={{ minWidth: 680 }}>
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Désignation</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-16">Qté</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-36">PT Vente HT</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-36">PT Achat HT</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-24">Marge</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-36">Fournisseur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.purchase_lines.map((l, i) => {
                        const ptV   = l.pt_vente || l.qty*l.pu_vente
                        const ptA   = l.qty*l.pu_achat
                        const mg    = ptV - ptA
                        const mgPct = ptV > 0 ? (mg/ptV)*100 : 0
                        return (
                          <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              {l.ref && <span className="text-[11px] text-slate-400 mr-1.5">[{l.ref}]</span>}
                              <span className="font-medium text-slate-800">{l.designation}</span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-600">{l.qty}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">{ptV > 0 ? mad(ptV) : '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.pu_achat > 0 ? <span className="font-semibold text-slate-700">{mad(ptA)}</span>
                                : <span className="text-[11px] font-bold text-amber-500">⚠ manquant</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {l.pu_achat > 0 && ptV > 0
                                ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${mgPct>=20?'bg-emerald-100 text-emerald-700':mgPct>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}`}>{pct(mgPct)}</span>
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-700">{l.fournisseur || <span className="text-[11px] font-bold text-amber-500">⚠</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={2} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Totaux</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">{mad(totalVente)}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">{totalAchat > 0 ? mad(totalAchat) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {totalAchat > 0 && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${margePctNette>=20?'bg-emerald-100 text-emerald-700':margePctNette>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600'}`}>
                              {pct(margePctNette)}
                            </span>
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* 3-col: recap + suppliers + files */}
                <div className="grid gap-4 lg:grid-cols-3">
                  {/* Recap */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">📊 Récap financier</div>
                    <RRow label="Total vente HT"  value={mad(totalVente)} bold />
                    <RRow label="Total achat HT"  value={totalAchat > 0 ? mad(totalAchat) : '—'} />
                    <RRow label="Marge brute"     value={totalAchat > 0 ? mad(margeBrute) : '—'}
                      sub={totalAchat > 0 ? pct(totalVente > 0 ? (margeBrute/totalVente)*100 : 0) : undefined}
                      color={margeBrute >= 0 ? 'emerald' : 'red'} />
                    {info.frais_engagement > 0 && (
                      <div className="border-t border-slate-200 pt-2">
                        <RRow label="Frais engagement" value={`− ${mad(info.frais_engagement)}`} color="amber" />
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-2">
                      <RRow label="Marge nette" value={totalAchat > 0 ? mad(margeNette) : '—'}
                        sub={totalAchat > 0 ? pct(margePctNette) : undefined}
                        color={margePctNette < 10 ? 'red' : 'emerald'} bold />
                    </div>
                    {info.justif_reason && (
                      <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[10px] font-bold text-amber-700 uppercase mb-1">⚠ Marge faible</div>
                        <div className="text-xs font-medium text-amber-800">{info.justif_reason}</div>
                        <div className="mt-1 text-[10px] font-bold">
                          {info.approved_by
                            ? <span className="text-emerald-600">✓ Validé par {info.approved_by}</span>
                            : <span className="text-amber-500 flex items-center gap-1"><Clock className="h-3 w-3" /> En attente Achraf</span>}
                        </div>
                      </div>
                    )}
                    {info.notes && <p className="border-t border-slate-200 pt-2 text-xs text-slate-500 italic">{info.notes}</p>}
                  </div>

                  {/* Suppliers */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">🏭 Fournisseurs ({uniqueSuppliers.length})</div>
                    <div className="space-y-2">
                      {uniqueSuppliers.length === 0
                        ? <p className="text-xs text-slate-400 italic">Aucun fournisseur</p>
                        : uniqueSuppliers.map((s, i) => (
                          <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="font-bold text-sm text-slate-800">{s.fournisseur}</div>
                            {s.contact_fournisseur && <div className="text-xs text-slate-500 mt-0.5">{s.contact_fournisseur}</div>}
                            {s.email_fournisseur && <a href={`mailto:${s.email_fournisseur}`} className="text-xs text-blue-600 hover:underline block truncate">{s.email_fournisseur}</a>}
                            {s.tel_fournisseur && <a href={`tel:${s.tel_fournisseur}`} className="text-xs text-slate-500 block">{s.tel_fournisseur}</a>}
                            <div className="mt-1 text-[10px] text-slate-400">{info.purchase_lines.filter(l => l.fournisseur === s.fournisseur).length} ligne(s)</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Files */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">📄 Documents ({files.length})</div>
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
                        {canEmail ? '✅ Fiche complète — prête à envoyer à Supply Chain' : '⏳ Complétez la fiche pour activer la commande'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">À : supplychain@compucom.ma · CC : n.bahhar@compucom.ma</div>
                    </div>
                    <button onClick={() => setShowEmail(true)} disabled={!canEmail}
                      className={`shrink-0 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors shadow-sm ${canEmail ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                      <Mail className="h-4 w-4" /> Commander via Outlook
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl border border-amber-100">📦</div>
                <p className="text-base font-black text-slate-800">Aucune fiche achat</p>
                <p className="text-sm text-slate-400 mt-1 mb-4 max-w-xs leading-relaxed">Remplis la fiche achat pour déclencher le processus de commande Supply Chain.</p>
                <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-white hover:bg-amber-600 transition-colors">
                  <Package className="h-4 w-4" /> Remplir la fiche achat
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ SECTION 4 : HISTORIQUE ACTIVITÉ ══ */}
        {activities.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-50 bg-slate-50/50 px-5 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🕐 Historique ({activities.length})</span>
            </div>
            <div className="divide-y divide-slate-50">
              {activities.map(a => {
                const icon  = ACTION_ICON[a.action_type] || '📌'
                const color = ACTION_COLOR[a.action_type] || '#64748b'
                return (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm mt-0.5" style={{ backgroundColor: color + '15' }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">
                        <span className="font-semibold">{a.entity_name}</span>
                        {a.detail && <span className="text-slate-500"> · {a.detail}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">{fmtDateTime(a.created_at)}</span>
                        {a.user_email && <span className="text-[11px] text-slate-400">· {a.user_email}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {showEmail && opp && info && (
        <EmailModal deal={opp} info={info} onClose={() => setShowEmail(false)} />
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
