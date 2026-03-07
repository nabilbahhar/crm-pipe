'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  ArrowLeft, Package, Mail, Edit2, Loader2, X,
  Copy, Check, ExternalLink, FileText, Building2,
  ChevronRight, Clock, ShieldCheck, AlertTriangle,
  CheckCircle2, TrendingUp, Download,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number; status: string
  stage?: string; bu?: string; po_number?: string; vendor?: string
  close_date?: string; created_at?: string
  accounts?: { id?: string; name?: string } | null
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
type SupplyStatus = 'a_commander' | 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'

// ─── Formatters ───────────────────────────────────────────────
const mad  = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} MAD`
const pct  = (n: number) => `${n.toFixed(1)} %`
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'

// ─── Supply status config ─────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; icon: string; color: string; bg: string; dot: string }> = {
  a_commander: { label: 'À commander', icon: '📋', color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-400'   },
  place:       { label: 'Placé',        icon: '📤', color: 'text-blue-700',   bg: 'bg-blue-50',    dot: 'bg-blue-500'    },
  commande:    { label: 'Commandé',     icon: '🔄', color: 'text-violet-700', bg: 'bg-violet-50',  dot: 'bg-violet-500'  },
  en_stock:    { label: 'En stock',     icon: '📦', color: 'text-orange-700', bg: 'bg-orange-50',  dot: 'bg-orange-400'  },
  livre:       { label: 'Livré',        icon: '🚚', color: 'text-emerald-700',bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',  bg: 'bg-slate-100',  dot: 'bg-slate-400'   },
}
const STATUS_ORDER: SupplyStatus[] = ['a_commander','place','commande','en_stock','livre','facture']

// ─── HTML email builder ───────────────────────────────────────
function buildEmailHtml(deal: Deal, info: PurchaseInfo): string {
  const client     = deal.accounts?.name || deal.title
  const totalVente = info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0)
  const totalAchat = info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
  const margeNette = totalVente - totalAchat - (info.frais_engagement||0)
  const margePct   = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const today      = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' })
  const COLORS     = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']

  const supGroups = new Map<string, PurchaseLine[]>()
  info.purchase_lines.forEach(l => {
    const k = l.fournisseur || 'Non spécifié'
    if (!supGroups.has(k)) supGroups.set(k, [])
    supGroups.get(k)!.push(l)
  })

  let si = 0
  const blocks = Array.from(supGroups.entries()).map(([name, lines]) => {
    const col    = COLORS[si++ % COLORS.length]
    const first  = lines[0]
    const subTot = lines.reduce((s,l) => s + l.qty*l.pu_achat, 0)
    const rows   = lines.map((l,i) => `
      <tr style="background:${i%2?'#f8fafc':'#fff'}">
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9">
          ${l.ref?`<span style="color:#94a3b8;font-size:11px;margin-right:6px">[${l.ref}]</span>`:''}${l.designation}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600">${l.qty}</td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;text-align:right;font-family:monospace">${mad(l.pu_achat)}</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#111827;border-bottom:1px solid #f1f5f9;text-align:right;font-family:monospace">${mad(l.qty*l.pu_achat)}</td>
      </tr>`).join('')
    return `
    <div style="margin-bottom:20px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
      <div style="background:${col};padding:14px 20px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><div style="color:#fff;font-size:15px;font-weight:800">🏭 ${name}</div>
            <div style="color:rgba(255,255,255,.8);font-size:12px;margin-top:3px">
              ${first.contact_fournisseur?`${first.contact_fournisseur} · `:''}
              ${first.email_fournisseur?`${first.email_fournisseur}`:''}
              ${first.tel_fournisseur?` · ${first.tel_fournisseur}`:''}
            </div>
          </td>
          <td align="right"><span style="background:rgba(255,255,255,.2);border-radius:8px;padding:4px 12px;color:#fff;font-size:13px;font-weight:700;font-family:monospace">${mad(subTot)}</span></td>
        </tr></table>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;text-align:left;border-bottom:2px solid #e2e8f0">Désignation</th>
          <th style="padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;text-align:center;border-bottom:2px solid #e2e8f0">Qté</th>
          <th style="padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0">PU Achat</th>
          <th style="padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0">Total HT</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')

  const margeColor = margePct >= 20 ? '#16a34a' : margePct >= 10 ? '#d97706' : '#dc2626'

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Commande ${client}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f1f5f9"><tr><td align="center">
<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%">

  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border-radius:16px 16px 0 0;padding:28px 32px">
    <table width="100%"><tr>
      <td>
        <div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Commande Supply Chain · ${today}</div>
        <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-.5px;line-height:1.2">📦 ${deal.title}</div>
        <div style="color:#cbd5e1;font-size:13px;margin-top:8px">
          🏢 <strong style="color:#e2e8f0">${client}</strong>
          ${deal.po_number ? `&nbsp;·&nbsp;PO <strong style="color:#e2e8f0">${deal.po_number}</strong>` : ''}
          ${deal.bu ? `&nbsp;·&nbsp;${deal.bu}` : ''}
        </div>
      </td>
      <td align="right" style="vertical-align:top">
        <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 20px;text-align:center">
          <div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Montant Deal</div>
          <div style="color:#fff;font-size:20px;font-weight:900;margin-top:4px;font-family:monospace">${mad(deal.amount)}</div>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;padding:28px 32px">
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7">
      Bonjour,<br><br>
      Merci de traiter la commande ci-dessous pour le client <strong style="color:#0f172a">${client}</strong>.
      Merci de confirmer la prise en charge et d'indiquer le délai prévisionnel de livraison.
    </p>
    ${blocks}
    <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;margin-top:8px">
      <div style="background:#f8fafc;padding:12px 20px;border-bottom:1px solid #e2e8f0">
        <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">📊 Récapitulatif financier</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f8fafc">Total vente HT</td>
            <td style="padding:12px 20px;font-size:13px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #f8fafc;font-family:monospace">${mad(totalVente)}</td></tr>
        <tr style="background:#fafafa"><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9">Total achat HT</td>
            <td style="padding:12px 20px;font-size:13px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #f1f5f9;font-family:monospace">${mad(totalAchat)}</td></tr>
        ${info.frais_engagement>0?`<tr><td style="padding:12px 20px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9">Frais d'engagement</td>
            <td style="padding:12px 20px;font-size:13px;font-weight:700;color:#d97706;text-align:right;border-bottom:1px solid #f1f5f9;font-family:monospace">− ${mad(info.frais_engagement)}</td></tr>`:''}
        <tr style="background:#f0fdf4"><td style="padding:14px 20px;font-size:14px;font-weight:700;color:#166534">Marge nette</td>
            <td style="padding:14px 20px;text-align:right">
              <span style="font-size:18px;font-weight:900;color:${margeColor};font-family:monospace">${mad(margeNette)}</span>
              <span style="margin-left:8px;background:${margeColor};color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${pct(margePct)}</span>
            </td></tr>
      </table>
    </div>
    ${info.notes?`<div style="margin-top:16px;border-radius:10px;border:1px solid #fde68a;background:#fffbeb;padding:14px 18px">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📝 Notes</div>
      <div style="font-size:13px;color:#78350f;line-height:1.6">${info.notes}</div></div>`:''}
  </td></tr>

  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:18px 32px">
    <table width="100%"><tr>
      <td style="font-size:12px;color:#94a3b8;line-height:1.6">
        Merci de <strong style="color:#64748b">confirmer la réception</strong> de cette demande<br>et d'indiquer le délai de traitement estimé.
      </td>
      <td align="right"><span style="background:#0f172a;color:#fff;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;white-space:nowrap">Compucom · Supply Chain</span></td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}

// ─── Email Modal ──────────────────────────────────────────────
function EmailModal({ deal, info, onClose }: { deal: Deal; info: PurchaseInfo; onClose: () => void }) {
  const [copiedHtml, setCopiedHtml] = useState(false)
  const html    = buildEmailHtml(deal, info)
  const client  = deal.accounts?.name || deal.title
  const today   = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' })
  const subject = `Commande ${client}${deal.po_number ? ` – PO ${deal.po_number}` : ''} – ${mad(deal.amount)} – ${today}`
  const mailto  = `mailto:supplychain@compucom.ma?cc=n.bahhar@compucom.ma&subject=${encodeURIComponent(subject)}`

  async function copyHtml() {
    await navigator.clipboard.writeText(html).catch(() => {})
    setCopiedHtml(true); setTimeout(() => setCopiedHtml(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4">
      <div className="flex w-full flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ maxHeight: '95vh', maxWidth: 800 }}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xl shrink-0">📧</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-900">Email commande Supply Chain</div>
            <div className="text-xs text-slate-400 truncate mt-0.5">À : supplychain@compucom.ma · CC : n.bahhar@compucom.ma</div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subject line */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5 shrink-0 w-10">Objet</span>
            <span className="text-sm font-semibold text-slate-700 leading-relaxed">{subject}</span>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto bg-[#e8edf3] p-4">
          <iframe srcDoc={html} title="Aperçu email"
            className="w-full rounded-xl bg-white shadow-lg border border-slate-200"
            style={{ minHeight: 520, height: '100%' }} />
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { window.location.href = mailto }}
              className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
              Étape 1 — Ouvrir Outlook
            </button>
            <button onClick={copyHtml}
              className={`flex h-9 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors ${copiedHtml ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
              {copiedHtml ? <><Check className="h-3.5 w-3.5" /> Copié !</> : <><Copy className="h-3.5 w-3.5" /> Étape 2 — Copier le HTML</>}
            </button>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Mode d'emploi :</strong> Ouvrir Outlook (objet + destinataires pré-remplis) → cliquer dans le corps → coller (Ctrl+V) → vérifier → <strong>Envoyer</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function OpportunityDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const id      = params?.id as string

  const [deal, setDeal]           = useState<Deal | null>(null)
  const [info, setInfo]           = useState<PurchaseInfo | null>(null)
  const [files, setFiles]         = useState<DealFile[]>([])
  const [fileUrls, setFileUrls]   = useState<Record<string, string>>({})
  const [supply, setSupply]       = useState<SupplyOrder | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showEmail, setShowEmail] = useState(false)

  useEffect(() => { if (id) loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const [dealRes, infoRes, filesRes, supplyRes] = await Promise.all([
      supabase.from('opportunities')
        .select('id, title, amount, status, stage, bu, po_number, vendor, close_date, created_at, accounts(id, name)')
        .eq('id', id).single(),
      supabase.from('purchase_info')
        .select('*, purchase_lines(*)')
        .eq('opportunity_id', id).maybeSingle(),
      supabase.from('deal_files')
        .select('id, file_type, file_name, file_url')
        .eq('opportunity_id', id),
      supabase.from('supply_orders')
        .select('*').eq('opportunity_id', id).maybeSingle(),
    ])

    if (dealRes.data) setDeal({ ...dealRes.data, accounts: dealRes.data.accounts as any })

    if (infoRes.data) setInfo({
      ...infoRes.data,
      purchase_lines: (infoRes.data.purchase_lines || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    })

    const f = filesRes.data || []
    setFiles(f)
    // Signed URLs for download
    const urls: Record<string, string> = {}
    await Promise.all(f.map(async (fi: DealFile) => {
      const { data } = await supabase.storage.from('deal-files').createSignedUrl(fi.file_url, 3600)
      if (data?.signedUrl) urls[fi.id] = data.signedUrl
    }))
    setFileUrls(urls)

    if (supplyRes.data) setSupply(supplyRes.data)
    setLoading(false)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
    </div>
  )
  if (!deal) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <p className="text-slate-500">Deal introuvable.</p>
    </div>
  )

  // ── Computed ─────────────────────────────────────────────────
  const totalVente    = info ? info.purchase_lines.reduce((s,l) => s + (l.pt_vente || l.qty*l.pu_vente), 0) : 0
  const totalAchat    = info ? info.purchase_lines.reduce((s,l) => s + l.qty*l.pu_achat, 0) : 0
  const margeBrute    = totalVente - totalAchat
  const margeNette    = margeBrute - (info?.frais_engagement || 0)
  const margePct      = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const isWon         = deal.status === 'Won'
  const linesOk       = info ? info.purchase_lines.filter(l => Number(l.pu_achat) > 0 && l.fournisseur?.trim()).length : 0
  const ficheComplete = !!(info && info.purchase_lines.length > 0 && linesOk === info.purchase_lines.length)
  const canEmail      = ficheComplete && isWon

  const uniqueSuppliers = info
    ? Array.from(new Map(
        info.purchase_lines
          .filter(l => l.fournisseur)
          .map(l => [l.fournisseur, l])
      ).values())
    : []

  const bcClient  = files.filter(f => f.file_type === 'bc_client')
  const devisComp = files.filter(f => f.file_type === 'devis_compucom')
  const autresDocs= files.filter(f => f.file_type === 'autre')

  const supCfg    = supply ? STATUS_CFG[supply.status] : null
  const supIdx    = supply ? STATUS_ORDER.indexOf(supply.status as SupplyStatus) : -1

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight truncate">{deal.title}</h1>
              <StatusPill status={deal.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {deal.accounts?.name && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-slate-700">{deal.accounts.name}</span>
                </span>
              )}
              {deal.bu && <><span className="text-slate-300">·</span><span>{deal.bu}</span></>}
              {deal.vendor && <><span className="text-slate-300">·</span><span>{deal.vendor}</span></>}
              {deal.po_number && <><span className="text-slate-300">·</span><span className="font-medium">PO {deal.po_number}</span></>}
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

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Montant deal" value={mad(deal.amount)} accent />
          <KpiCard label="Statut"       value={deal.status} color={deal.status==='Won'?'emerald':deal.status==='Lost'?'red':'amber'} />
          <KpiCard label="Stage"        value={deal.stage || '—'} />
          <KpiCard label="Clôture"      value={fmtDate(deal.close_date)} />
        </div>

        {/* ── Supply order progress bar ── */}
        {supply && supCfg && (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">📦 Statut commande Supply</div>
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${supCfg.bg} ${supCfg.color} border-current/20`}>
                <span className={`h-2 w-2 rounded-full ${supCfg.dot}`} />
                {supCfg.label}
              </div>
            </div>
            {/* Progress steps */}
            <div className="flex items-center gap-1">
              {STATUS_ORDER.map((s, i) => {
                const cfg   = STATUS_CFG[s]
                const done  = i <= supIdx
                const active= i === supIdx
                return (
                  <div key={s} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm transition-all ${active ? 'border-slate-900 bg-slate-900 text-white scale-110 shadow-md' : done ? 'border-slate-300 bg-slate-200 text-slate-500' : 'border-slate-200 bg-white text-slate-300'}`}>
                        {done && !active ? <Check className="h-4 w-4" /> : <span>{cfg.icon}</span>}
                      </div>
                      <span className={`text-[9px] font-bold text-center leading-tight ${active ? 'text-slate-900' : 'text-slate-400'}`}>{cfg.label}</span>
                    </div>
                    {i < STATUS_ORDER.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 rounded-full mb-4 transition-all ${i < supIdx ? 'bg-slate-400' : 'bg-slate-200'}`} />
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

        {/* ── Fiche achat section ── */}
        {isWon && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">

            {/* Section header bar */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${ficheComplete ? 'bg-emerald-50 border-emerald-100' : info ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${ficheComplete ? 'bg-emerald-500' : info ? 'bg-blue-500' : 'bg-amber-500'} text-white`}>
                  📋
                </div>
                <div>
                  <div className={`text-sm font-black ${ficheComplete ? 'text-emerald-900' : info ? 'text-blue-900' : 'text-amber-900'}`}>
                    Fiche Achat
                    {ficheComplete && <span className="ml-2 font-normal text-emerald-600 text-xs">Complète ✓</span>}
                    {info && !ficheComplete && (
                      <span className="ml-2 font-normal text-blue-600 text-xs">
                        En cours · {linesOk}/{info.purchase_lines.length} lignes remplies
                      </span>
                    )}
                    {!info && <span className="ml-2 font-normal text-amber-600 text-xs">À remplir</span>}
                  </div>
                  {info && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Par <span className="font-medium">{info.filled_by}</span>
                      {info.updated_at && <> · Mis à jour {fmtDate(info.updated_at)}</>}
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
              <div className="p-5 space-y-5">

                {/* Lines table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm" style={{ minWidth: 720 }}>
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Désignation</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16">Qté</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-36">PT Vente HT</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-36">PT Achat HT</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-24">Marge</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 w-36">Fournisseur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.purchase_lines.map((l, i) => {
                        const ptV   = l.pt_vente || l.qty*l.pu_vente
                        const ptA   = l.qty*l.pu_achat
                        const mg    = ptV - ptA
                        const mgPct = ptV > 0 ? (mg/ptV)*100 : 0
                        const warn  = !l.pu_achat || !l.fournisseur
                        return (
                          <tr key={l.id} className={`border-b border-slate-50 last:border-0 transition-colors ${warn ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}>
                            <td className="px-4 py-3">
                              {l.ref && <span className="text-[11px] text-slate-400 mr-1.5">[{l.ref}]</span>}
                              <span className="font-medium text-slate-800">{l.designation}</span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600 font-semibold">{l.qty}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">{ptV > 0 ? mad(ptV) : '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.pu_achat > 0
                                ? <span className="font-semibold text-slate-700">{mad(ptA)}</span>
                                : <span className="text-[11px] font-bold text-amber-500">⚠ manquant</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {l.pu_achat > 0
                                ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${mgPct >= 20 ? 'bg-emerald-100 text-emerald-700' : mgPct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>{pct(mgPct)}</span>
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {l.fournisseur
                                ? <span className="font-medium text-slate-700">{l.fournisseur}</span>
                                : <span className="text-[11px] font-bold text-amber-500">⚠ manquant</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400" colSpan={2}>Totaux</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">{mad(totalVente)}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">{totalAchat > 0 ? mad(totalAchat) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {totalAchat > 0 && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${margePct >= 20 ? 'bg-emerald-100 text-emerald-700' : margePct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                              {pct(margePct)}
                            </span>
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Recap + Suppliers + Files */}
                <div className="grid gap-4 lg:grid-cols-3">

                  {/* Financial recap */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">📊 Récap financier</div>
                    <RecapRow label="Total vente HT"    value={mad(totalVente)} bold />
                    <RecapRow label="Total achat HT"    value={totalAchat > 0 ? mad(totalAchat) : '—'} />
                    <RecapRow label="Marge brute"       value={totalAchat > 0 ? `${mad(margeBrute)}` : '—'}
                      sub={totalAchat > 0 ? pct(totalVente > 0 ? (margeBrute/totalVente)*100 : 0) : undefined}
                      color={margeBrute >= 0 ? 'emerald' : 'red'} />
                    {info.frais_engagement > 0 && (
                      <div className="border-t border-slate-200 pt-2.5">
                        <RecapRow label="Frais engagement" value={`− ${mad(info.frais_engagement)}`} color="amber" />
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-2.5">
                      <RecapRow label="Marge nette"   value={totalAchat > 0 ? `${mad(margeNette)}` : '—'}
                        sub={totalAchat > 0 ? pct(margePct) : undefined}
                        color={margePct < 10 ? 'red' : 'emerald'} bold />
                    </div>
                    {info.justif_reason && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">⚠ Marge faible</div>
                        <div className="text-xs font-medium text-amber-800">{info.justif_reason}</div>
                        {info.justif_text && <div className="text-xs text-amber-700 mt-0.5">{info.justif_text}</div>}
                        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold">
                          {info.approved_by
                            ? <span className="text-emerald-600">✓ Validé par {info.approved_by}</span>
                            : <span className="flex items-center gap-1 text-amber-500"><Clock className="h-3 w-3" /> Attente validation Achraf</span>}
                        </div>
                      </div>
                    )}
                    {info.notes && (
                      <div className="border-t border-slate-200 pt-2.5 text-xs text-slate-500 italic">{info.notes}</div>
                    )}
                  </div>

                  {/* Suppliers */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">🏭 Fournisseurs ({uniqueSuppliers.length})</div>
                    <div className="space-y-2.5">
                      {uniqueSuppliers.length === 0
                        ? <p className="text-xs text-slate-400 italic">Aucun fournisseur renseigné</p>
                        : uniqueSuppliers.map((s, i) => (
                          <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="font-bold text-sm text-slate-800">{s.fournisseur}</div>
                            {s.contact_fournisseur && <div className="text-xs text-slate-500 mt-0.5">{s.contact_fournisseur}</div>}
                            <div className="mt-1 flex flex-col gap-0.5">
                              {s.email_fournisseur && (
                                <a href={`mailto:${s.email_fournisseur}`} className="text-xs text-blue-600 hover:underline truncate">{s.email_fournisseur}</a>
                              )}
                              {s.tel_fournisseur && (
                                <a href={`tel:${s.tel_fournisseur}`} className="text-xs text-slate-500">{s.tel_fournisseur}</a>
                              )}
                            </div>
                            <div className="mt-1.5 text-[10px] text-slate-400">
                              {info.purchase_lines.filter(l => l.fournisseur === s.fournisseur).length} ligne{info.purchase_lines.filter(l => l.fournisseur === s.fournisseur).length > 1 ? 's' : ''}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">📄 Documents ({files.length})</div>
                    <div className="space-y-2">
                      {files.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Aucun document</p>
                      ) : (
                        <>
                          {bcClient.map(f => <FileRow key={f.id} file={f} url={fileUrls[f.id]} label="BC Client" color="blue" />)}
                          {devisComp.map(f => <FileRow key={f.id} file={f} url={fileUrls[f.id]} label="Devis Compucom" color="violet" />)}
                          {autresDocs.map(f => <FileRow key={f.id} file={f} url={fileUrls[f.id]} label="Autre" color="slate" />)}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Commander button ── */}
                <div className={`rounded-xl border-2 p-4 transition-colors ${canEmail ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className={`text-sm font-bold ${canEmail ? 'text-slate-900' : 'text-slate-400'}`}>
                        {canEmail ? '✅ Fiche complète — prête à envoyer à Supply Chain' : '⏳ Complétez la fiche avant de pouvoir commander'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Email HTML personnalisé · À : supplychain@compucom.ma · CC : n.bahhar@compucom.ma
                      </div>
                    </div>
                    <button onClick={() => setShowEmail(true)} disabled={!canEmail}
                      className={`shrink-0 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors shadow-sm ${canEmail ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                      <Mail className="h-4 w-4" />
                      Commander via Outlook
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl border border-amber-100">📦</div>
                <p className="text-base font-black text-slate-800">Aucune fiche achat pour ce deal</p>
                <p className="text-sm text-slate-400 mt-1.5 mb-5 max-w-xs leading-relaxed">
                  Commence par remplir la fiche pour déclencher le processus de commande Supply Chain.
                </p>
                <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-white hover:bg-amber-600 transition-colors shadow-sm">
                  <Package className="h-4 w-4" /> Remplir la fiche achat
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {showEmail && deal && info && (
        <EmailModal deal={deal} info={info} onClose={() => setShowEmail(false)} />
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

function KpiCard({ label, value, color, accent }: { label: string; value: string; color?: string; accent?: boolean }) {
  const textColor = color === 'emerald' ? 'text-emerald-700' : color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-900'
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? 'border-slate-200 bg-slate-900' : 'border-slate-100 bg-white'}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${accent ? 'text-slate-400' : 'text-slate-400'}`}>{label}</div>
      <div className={`text-sm font-black truncate tabular-nums ${accent ? 'text-white' : textColor}`}>{value}</div>
    </div>
  )
}

function RecapRow({ label, value, color, sub, bold }: {
  label: string; value: string; color?: 'emerald' | 'red' | 'amber'; sub?: string; bold?: boolean
}) {
  const vc = color === 'emerald' ? 'text-emerald-700' : color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-700'
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        {sub && (
          <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : color === 'red' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{sub}</span>
        )}
        <span className={`text-xs tabular-nums ${bold ? 'font-black' : 'font-semibold'} ${vc}`}>{value}</span>
      </div>
    </div>
  )
}

function FileRow({ file, url, label, color }: { file: DealFile; url?: string; label: string; color: 'blue' | 'violet' | 'slate' }) {
  const c = {
    blue:   'border-blue-100 bg-blue-50 text-blue-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
    slate:  'border-slate-200 bg-slate-50 text-slate-600',
  }[color]
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${c}`}>
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-60">{label}</div>
        <div className="text-xs font-semibold truncate">{file.file_name}</div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}
