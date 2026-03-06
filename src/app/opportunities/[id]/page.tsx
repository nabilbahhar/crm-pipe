'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  ArrowLeft, Edit2, Package, Mail, CheckCircle2,
  AlertCircle, AlertTriangle, Loader2, ExternalLink,
  Building2, Tag, FileText, TrendingUp, ShieldCheck,
  ChevronRight, Clock,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number; status: string
  stage?: string; bu?: string; po_number?: string; vendor?: string
  close_date?: string; created_at?: string
  accounts?: { name?: string; id?: string } | null
}
type PurchaseLine = {
  id: string; ref: string; designation: string
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur?: string; contact_fournisseur?: string
  email_fournisseur?: string; tel_fournisseur?: string
  sort_order: number
}
type PurchaseInfo = {
  id: string; frais_engagement: number; notes: string
  filled_by: string; justif_reason?: string; justif_text?: string
  approved_by?: string; created_at: string; updated_at?: string
  purchase_lines: PurchaseLine[]
}

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)
const pct = (n: number) => `${n.toFixed(1)}%`

// ─── Build Outlook mailto ─────────────────────────────────────
function buildMailto(deal: Deal, info: PurchaseInfo): string {
  const client      = deal.accounts?.name || deal.title
  const totalVente  = info.purchase_lines.reduce((s, l) => s + (l.pt_vente || l.qty * l.pu_vente), 0)
  const totalAchat  = info.purchase_lines.reduce((s, l) => s + l.qty * l.pu_achat, 0)
  const margeNette  = totalVente - totalAchat - (info.frais_engagement || 0)
  const margePct    = totalVente > 0 ? ((margeNette / totalVente) * 100).toFixed(1) : '0'

  // Group lines by supplier
  const supGroups = new Map<string, PurchaseLine[]>()
  info.purchase_lines.forEach(l => {
    const key = l.fournisseur || 'Non spécifié'
    if (!supGroups.has(key)) supGroups.set(key, [])
    supGroups.get(key)!.push(l)
  })

  const today = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' })

  const subject = `Commande ${client} – ${deal.po_number ? `PO ${deal.po_number} – ` : ''}${mad(deal.amount)} – ${today}`

  let body = `Bonjour,\r\n\r\n`
  body += `Veuillez trouver ci-dessous le détail de la commande à traiter :\r\n\r\n`
  body += `────────────────────────────────────────\r\n`
  body += `DEAL : ${deal.title}\r\n`
  body += `CLIENT : ${client}\r\n`
  if (deal.po_number) body += `PO CLIENT : ${deal.po_number}\r\n`
  if (deal.bu)        body += `BU : ${deal.bu}\r\n`
  body += `MONTANT : ${mad(deal.amount)}\r\n`
  body += `────────────────────────────────────────\r\n\r\n`

  body += `LIGNES À COMMANDER :\r\n\r\n`

  supGroups.forEach((lines, supplier) => {
    const firstLine = lines[0]
    body += `▶ Fournisseur : ${supplier}\r\n`
    if (firstLine.contact_fournisseur) body += `  Contact : ${firstLine.contact_fournisseur}\r\n`
    if (firstLine.email_fournisseur)   body += `  Email   : ${firstLine.email_fournisseur}\r\n`
    if (firstLine.tel_fournisseur)     body += `  Tél     : ${firstLine.tel_fournisseur}\r\n`
    body += `\r\n`
    lines.forEach((l, i) => {
      body += `  ${i + 1}. ${l.ref ? `[${l.ref}] ` : ''}${l.designation}\r\n`
      body += `     Qté : ${l.qty}   |   PU Achat : ${mad(l.pu_achat)}   |   Total : ${mad(l.qty * l.pu_achat)}\r\n`
    })
    body += `\r\n`
  })

  body += `────────────────────────────────────────\r\n`
  body += `RÉCAP FINANCIER :\r\n`
  body += `  Total vente  : ${mad(totalVente)}\r\n`
  body += `  Total achat  : ${mad(totalAchat)}\r\n`
  body += `  Marge nette  : ${mad(margeNette)} (${margePct}%)\r\n`
  if (info.frais_engagement > 0) body += `  Frais engagement : ${mad(info.frais_engagement)}\r\n`
  body += `────────────────────────────────────────\r\n\r\n`

  if (info.notes) {
    body += `Notes : ${info.notes}\r\n\r\n`
  }

  body += `Merci de confirmer la réception et le délai de traitement.\r\n\r\n`
  body += `Cordialement,\r\n`

  const to  = 'supplychain@compucom.ma'
  const cc  = 'n.bahhar@compucom.ma'

  return `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ─── Page ─────────────────────────────────────────────────────
export default function OpportunityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params?.id as string

  const [deal, setDeal]         = useState<Deal | null>(null)
  const [info, setInfo]         = useState<PurchaseInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [mailSent, setMailSent] = useState(false)

  useEffect(() => { if (id) loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const [dealRes, infoRes] = await Promise.all([
      supabase.from('opportunities')
        .select('id, title, amount, status, stage, bu, po_number, vendor, close_date, created_at, accounts(name, id)')
        .eq('id', id).single(),
      supabase.from('purchase_info')
        .select('*, purchase_lines(*)')
        .eq('opportunity_id', id)
        .maybeSingle(),
    ])
    if (dealRes.data) setDeal({ ...dealRes.data, accounts: dealRes.data.accounts as any })
    if (infoRes.data) {
      setInfo({
        ...infoRes.data,
        purchase_lines: (infoRes.data.purchase_lines || [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
      })
    }
    setLoading(false)
  }

  function handleSendEmail() {
    if (!deal || !info) return
    const mailto = buildMailto(deal, info)
    window.location.href = mailto
    setSending(true)
    setTimeout(() => { setSending(false); setMailSent(true) }, 800)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  )
  if (!deal) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <p className="text-slate-500">Deal introuvable.</p>
    </div>
  )

  // Compute purchase stats
  const totalVente   = info ? info.purchase_lines.reduce((s, l) => s + (l.pt_vente || l.qty * l.pu_vente), 0) : 0
  const totalAchat   = info ? info.purchase_lines.reduce((s, l) => s + l.qty * l.pu_achat, 0) : 0
  const margeBrute   = totalVente - totalAchat
  const margeNette   = margeBrute - (info?.frais_engagement || 0)
  const margePctNet  = totalVente > 0 ? (margeNette / totalVente) * 100 : 0
  const isWon        = deal.status === 'Won'

  const linesComplete = info ? info.purchase_lines.filter(l => Number(l.pu_achat) > 0 && l.fournisseur?.trim()).length : 0
  const ficheComplete = info && info.purchase_lines.length > 0 && linesComplete === info.purchase_lines.length
  const canSendEmail  = ficheComplete && isWon

  // Unique suppliers
  const suppliers = info
    ? Array.from(new Map(
        info.purchase_lines
          .filter(l => l.fournisseur)
          .map(l => [l.fournisseur, l])
      ).values())
    : []

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-sm mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{deal.title}</h1>
              <StatusBadge status={deal.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {deal.accounts?.name && <><Building2 className="inline h-3.5 w-3.5 mr-1" />{deal.accounts.name} · </>}
              {deal.bu && <><Tag className="inline h-3.5 w-3.5 mr-1" />{deal.bu} · </>}
              {mad(deal.amount)}
            </p>
          </div>
          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            {isWon && (
              <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white transition-colors shadow-sm
                  ${info ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                <Package className="h-4 w-4" />
                {info ? 'Modifier fiche achat' : 'Remplir fiche achat'}
              </button>
            )}
          </div>
        </div>

        {/* Deal info cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Montant',   value: mad(deal.amount),       color: 'text-slate-800' },
            { label: 'Statut',    value: deal.status,            color: deal.status==='Won'?'text-emerald-700':deal.status==='Lost'?'text-red-600':'text-amber-600' },
            { label: 'Stage',     value: deal.stage || '—',      color: 'text-slate-700' },
            { label: 'PO Client', value: deal.po_number || '—',  color: 'text-slate-700' },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</div>
              <div className={`mt-1 text-sm font-bold truncate ${c.color}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* ── Section Fiche Achat ── */}
        {isWon && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">

            {/* Section header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              ficheComplete ? 'bg-emerald-50 border-emerald-100' :
              info          ? 'bg-blue-50 border-blue-100' :
                              'bg-amber-50 border-amber-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-white text-sm
                  ${ficheComplete ? 'bg-emerald-500' : info ? 'bg-blue-500' : 'bg-amber-500'}`}>
                  📦
                </div>
                <div>
                  <div className={`text-sm font-bold ${ficheComplete?'text-emerald-800':info?'text-blue-800':'text-amber-800'}`}>
                    Fiche Achat
                    {ficheComplete && <span className="ml-2 text-emerald-600">· Complète ✓</span>}
                    {info && !ficheComplete && <span className="ml-2 text-blue-600">· En cours ({linesComplete}/{info.purchase_lines.length} lignes)</span>}
                    {!info && <span className="ml-2 text-amber-600">· À remplir</span>}
                  </div>
                  {info && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Remplie par <span className="font-medium">{info.filled_by}</span>
                      {info.updated_at && <> · Mise à jour le {new Date(info.updated_at).toLocaleDateString('fr-MA')}</>}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors
                  ${ficheComplete
                    ? 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                    : info
                      ? 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                      : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                <Edit2 className="h-3.5 w-3.5" />
                {ficheComplete ? 'Modifier' : info ? 'Compléter' : 'Remplir'}
              </button>
            </div>

            {info && info.purchase_lines.length > 0 ? (
              <div className="p-5 space-y-5">

                {/* Lines table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs" style={{ minWidth: 640 }}>
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Réf</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Désignation</th>
                        <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[50px]">Qté</th>
                        <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[90px]">PT Vente</th>
                        <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[90px]">PT Achat</th>
                        <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[80px]">Marge</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[130px]">Fournisseur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.purchase_lines.map((l, i) => {
                        const ptVente = l.pt_vente || l.qty * l.pu_vente
                        const ptAchat = l.qty * l.pu_achat
                        const marge   = ptVente - ptAchat
                        const margePc = ptVente > 0 ? (marge / ptVente) * 100 : 0
                        const incomplete = !l.pu_achat || !l.fournisseur
                        return (
                          <tr key={l.id} className={`border-b border-slate-50 last:border-0 ${incomplete ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'} transition-colors`}>
                            <td className="px-3 py-2.5 text-slate-400">{l.ref || '—'}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">{l.designation}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{l.qty}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                              {ptVente > 0 ? mad(ptVente) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {l.pu_achat > 0
                                ? <span className="font-semibold text-slate-700">{mad(ptAchat)}</span>
                                : <span className="text-amber-500 text-[10px] font-bold">⚠ manquant</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {l.pu_achat > 0 ? (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${margePc>=20?'bg-emerald-100 text-emerald-600':margePc>=10?'bg-amber-100 text-amber-600':'bg-red-100 text-red-600'}`}>
                                  {pct(margePc)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              {l.fournisseur
                                ? <span className="font-medium text-slate-700">{l.fournisseur}</span>
                                : <span className="text-amber-500 text-[10px] font-bold">⚠ manquant</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Totaux</td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-800">{mad(totalVente)}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-800">{totalAchat > 0 ? mad(totalAchat) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {totalAchat > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${margePctNet>=20?'bg-emerald-100 text-emerald-600':margePctNet>=10?'bg-amber-100 text-amber-600':'bg-red-100 text-red-600'}`}>
                              {pct(margePctNet)}
                            </span>
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Financial recap + Suppliers */}
                <div className="grid gap-4 sm:grid-cols-2">

                  {/* Recap */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Récap financier</div>
                    <div className="space-y-2">
                      <Row label="Total vente HT"      value={mad(totalVente)} bold />
                      <Row label="Total achat HT"      value={totalAchat > 0 ? mad(totalAchat) : '—'} />
                      <Row label="Marge brute"          value={totalAchat > 0 ? `${mad(margeBrute)} (${pct(totalVente>0?(margeBrute/totalVente)*100:0)})` : '—'} color="emerald" />
                      {info.frais_engagement > 0 && (
                        <div className="border-t border-slate-200 pt-2">
                          <Row label="Frais d'engagement" value={`− ${mad(info.frais_engagement)}`} color="amber" />
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-2">
                        <Row label="Marge nette" value={totalAchat > 0 ? `${mad(margeNette)} (${pct(margePctNet)})` : '—'}
                          color={margePctNet < 10 ? 'red' : 'emerald'} bold />
                      </div>
                    </div>
                    {info.justif_reason && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">⚠ Marge faible — justification</div>
                        <div className="text-xs text-amber-700 font-medium">{info.justif_reason}</div>
                        {info.justif_text && <div className="text-xs text-amber-600 mt-1">{info.justif_text}</div>}
                        {info.approved_by
                          ? <div className="mt-1 text-[10px] text-emerald-600 font-bold">✓ Validé par {info.approved_by}</div>
                          : <div className="mt-1 text-[10px] text-amber-500 font-bold flex items-center gap-1"><Clock className="h-3 w-3" /> En attente validation Achraf</div>}
                      </div>
                    )}
                    {info.notes && (
                      <div className="mt-3 text-xs text-slate-500 italic border-t border-slate-100 pt-2">
                        Notes : {info.notes}
                      </div>
                    )}
                  </div>

                  {/* Suppliers */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      🏭 Fournisseurs ({suppliers.length})
                    </div>
                    <div className="space-y-2.5">
                      {suppliers.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Aucun fournisseur renseigné</p>
                      ) : suppliers.map((s, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="font-semibold text-slate-800 text-xs">{s.fournisseur}</div>
                          {s.contact_fournisseur && <div className="text-[11px] text-slate-500 mt-0.5">{s.contact_fournisseur}</div>}
                          <div className="flex flex-wrap gap-x-3 mt-1">
                            {s.email_fournisseur && (
                              <a href={`mailto:${s.email_fournisseur}`} className="text-[11px] text-blue-600 hover:underline">{s.email_fournisseur}</a>
                            )}
                            {s.tel_fournisseur && (
                              <a href={`tel:${s.tel_fournisseur}`} className="text-[11px] text-slate-600">{s.tel_fournisseur}</a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Bouton Commander ── */}
                <div className={`rounded-xl border-2 p-4 ${canSendEmail ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className={`text-sm font-bold ${canSendEmail ? 'text-emerald-800' : 'text-slate-500'}`}>
                        {canSendEmail ? '✅ Fiche complète — prête à commander' : '⏳ Compléter la fiche avant de commander'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Envoie la commande à <span className="font-medium">supplychain@compucom.ma</span> avec tous les détails pré-remplis
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={handleSendEmail}
                        disabled={!canSendEmail || sending}
                        className={`inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition-colors shadow-sm
                          ${canSendEmail
                            ? mailSent
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-slate-900 hover:bg-slate-800'
                            : 'bg-slate-300 cursor-not-allowed'}
                          disabled:opacity-60`}>
                        {sending
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Ouverture…</>
                          : mailSent
                            ? <><CheckCircle2 className="h-4 w-4" /> Email ouvert ✓</>
                            : <><Mail className="h-4 w-4" /> Commander via Outlook</>}
                      </button>
                      {mailSent && (
                        <p className="text-[10px] text-emerald-600 font-medium">
                          Outlook s'est ouvert — vérifie et clique Envoyer
                        </p>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-5">
                <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl mb-3">📦</div>
                <p className="text-sm font-semibold text-slate-700">Aucune fiche achat pour ce deal</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">Commence par remplir la fiche pour déclencher la commande Supply Chain</p>
                <button onClick={() => router.push(`/opportunities/${id}/purchase`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 transition-colors">
                  <Package className="h-4 w-4" /> Remplir la fiche achat
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── StatusBadge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === 'Won'  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    status === 'Lost' ? 'bg-red-100 text-red-700 border-red-200' :
                        'bg-amber-100 text-amber-700 border-amber-200'
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${cfg}`}>{status}</span>
  )
}

function Row({ label, value, color, bold }: { label:string; value:string; color?:'emerald'|'red'|'amber'; bold?:boolean }) {
  const cls = color==='emerald'?'text-emerald-700':color==='red'?'text-red-600':color==='amber'?'text-amber-600':'text-slate-700'
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs ${bold?'font-bold':'font-medium'} ${cls}`}>{value}</span>
    </div>
  )
}
