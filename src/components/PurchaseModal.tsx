'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import { mad, pct } from '@/lib/utils'
import {
  X, Upload, Loader2, Plus, Trash2, Save,
  FileText, AlertCircle, CheckCircle2, AlertTriangle, ShieldCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number
  accounts?: { name?: string } | null
  vendor?: string | null; bu?: string | null
  po_number?: string | null
}

type PurchaseLine = {
  id?: string
  ref: string
  designation: string
  qty: number
  pu_vente: number
  pt_vente: number
  pu_achat: number
  fournisseur: string
  contact_fournisseur: string
  email_fournisseur: string
  tel_fournisseur: string
}

const JUSTIFICATION_REASONS = [
  'Alignement concurrent (prix imposé par le marché)',
  'Investissement compte stratégique',
  'Pénétration nouveau compte',
  'Accord cadre / prix négocié',
  'Autre',
]

const emptyLine = (): PurchaseLine => ({
  ref: '', designation: '', qty: 1,
  pu_vente: 0, pt_vente: 0, pu_achat: 0,
  fournisseur: '', contact_fournisseur: '',
  email_fournisseur: '', tel_fournisseur: '',
})

// ─── Main Component ───────────────────────────────────────────
export default function PurchaseModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: Deal
  onClose: () => void
  onSaved?: () => void
}) {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lines, setLines]         = useState<PurchaseLine[]>([emptyLine()])
  const [frais, setFrais]         = useState(0)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  // Marge faible — justification
  const [justifReason, setJustifReason] = useState(JUSTIFICATION_REASONS[0])
  const [justifText, setJustifText]     = useState('')

  // File states
  const [bcFile, setBcFile]         = useState<File | null>(null)
  const [devisFile, setDevisFile]   = useState<File | null>(null)
  const [autreFiles, setAutreFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState<string | null>(null)
  const [extracted, setExtracted]   = useState(false)

  // Existing data
  const [existingInfo, setExistingInfo] = useState<any>(null)
  const [loading, setLoading]           = useState(true)

  // Existing uploaded files from DB
  const [existingFiles, setExistingFiles] = useState<{file_type: string; file_name: string}[]>([])

  const bcRef    = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>
  const devisRef = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>
  const autreRef = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    loadExisting()
  }, [])

  async function loadExisting() {
    setLoading(true)
    const { data: info } = await supabase
      .from('purchase_info')
      .select('*, purchase_lines(*)')
      .eq('opportunity_id', deal.id)
      .maybeSingle()

    if (info) {
      setExistingInfo(info)
      setFrais(info.frais_engagement || 0)
      setNotes(info.notes || '')
      if (info.justif_reason) setJustifReason(info.justif_reason)
      if (info.justif_text)   setJustifText(info.justif_text)
      if (info.purchase_lines?.length > 0) {
        setLines(info.purchase_lines.sort((a: any, b: any) => a.sort_order - b.sort_order))
        setExtracted(true)
      }
    }

    // Load existing uploaded files
    const { data: files } = await supabase
      .from('deal_files')
      .select('file_type, file_name')
      .eq('opportunity_id', deal.id)
    if (files) setExistingFiles(files)

    setLoading(false)
  }

  // ── PDF extraction ─────────────────────────────────────────
  async function extractDevis() {
    if (!devisFile) return
    setExtracting(true); setExtractErr(null)
    try {
      const base64 = await fileToBase64(devisFile)
      const res = await fetch('/api/extract-devis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()

      if (data.lines?.length > 0) {
        setLines(data.lines.map((l: any) => ({
          ref: l.ref || '',
          designation: l.designation || '',
          qty: Number(l.qty) || 1,
          pu_vente: Number(l.pu_vente) || 0,
          pt_vente: Number(l.pt_vente) || 0,
          pu_achat: 0,
          fournisseur: '',
          contact_fournisseur: '',
          email_fournisseur: '',
          tel_fournisseur: '',
        })))
        setExtracted(true)
      } else {
        setExtractErr('Aucune ligne trouvée. Vérifie le PDF ou saisis manuellement.')
      }
    } catch (e: any) {
      setExtractErr(e?.message || 'Erreur extraction')
    } finally {
      setExtracting(false)
    }
  }

  // ── Computed totals ────────────────────────────────────────
  const totalVente      = lines.reduce((s, l) => s + (Number(l.pt_vente) || l.qty * l.pu_vente), 0)
  const totalAchat      = lines.reduce((s, l) => s + (Number(l.pu_achat) * Number(l.qty) || 0), 0)
  const margeBrute      = totalVente - totalAchat
  const margeNette      = margeBrute - frais
  const margePctBrute   = totalVente > 0 ? (margeBrute / totalVente) * 100 : 0
  const margePctNette   = totalVente > 0 ? (margeNette / totalVente) * 100 : 0
  const margeFaible     = totalAchat > 0 && margePctNette < 10

  // ── Completeness check ────────────────────────────────────
  const incompleteLines = lines.filter(l => !l.designation.trim() || !(Number(l.pu_achat) > 0) || !l.fournisseur?.trim())
  const isComplete      = lines.length > 0 && incompleteLines.length === 0

  const hasBcClient    = !!bcFile || existingFiles.some(f => f.file_type === 'bc_client')
  const hasDevis       = !!devisFile || existingFiles.some(f => f.file_type === 'devis_compucom')
  const justifComplete = !margeFaible || (justifText.trim().length >= 10)

  // ── Save ───────────────────────────────────────────────────
  async function handleSave() {
    setErr(null)

    if (lines.length === 0) { setErr('Ajoute au moins une ligne.'); return }
    if (lines.some(l => !l.designation.trim())) { setErr('Toutes les lignes doivent avoir une désignation.'); return }
    if (!hasBcClient)  { setErr('Le BC Client est obligatoire avant de valider.'); return }
    if (!hasDevis)     { setErr('Le Devis Compucom est obligatoire avant de valider.'); return }
    if (margeFaible && justifText.trim().length < 10) {
      setErr('La marge est < 10% : une justification détaillée est obligatoire.'); return
    }

    setSaving(true)
    try {
      let infoId = existingInfo?.id

      const infoPayload: any = {
        opportunity_id: deal.id,
        frais_engagement: frais,
        notes,
        filled_by: userEmail,
        ...(margeFaible
          ? { justif_reason: justifReason, justif_text: justifText, approved_by: null }
          : { justif_reason: null, justif_text: null }),
      }

      if (!infoId) {
        const { data: info, error: e1 } = await supabase
          .from('purchase_info')
          .insert(infoPayload)
          .select('id')
          .single()
        if (e1) throw e1
        infoId = info.id
      } else {
        await supabase.from('purchase_info').update({
          ...infoPayload,
          updated_at: new Date().toISOString(),
        }).eq('id', infoId)
      }

      // Delete existing lines and reinsert
      await supabase.from('purchase_lines').delete().eq('purchase_info_id', infoId)

      const linesToInsert = lines.map((l, i) => ({
        purchase_info_id: infoId,
        ref: l.ref || null,
        designation: l.designation,
        qty: l.qty,
        pu_vente: l.pu_vente,
        pt_vente: l.pt_vente || l.qty * l.pu_vente,
        pu_achat: l.pu_achat,
        fournisseur: l.fournisseur || null,
        contact_fournisseur: l.contact_fournisseur || null,
        email_fournisseur: l.email_fournisseur || null,
        tel_fournisseur: l.tel_fournisseur || null,
        sort_order: i,
      }))
      const { error: e2 } = await supabase.from('purchase_lines').insert(linesToInsert)
      if (e2) throw e2

      // Upload files
      await uploadFiles(deal.id)

      // Create supply_order if not exists
      await supabase.from('supply_orders').upsert({
        opportunity_id: deal.id,
        status: 'a_commander',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'opportunity_id', ignoreDuplicates: true })

      const clientName  = deal.accounts?.name || deal.title
      const margePctStr = totalVente > 0 ? ((margeNette / totalVente) * 100).toFixed(1) : '0'
      const isNew       = !existingInfo?.id

      await logActivity({
        action_type: isNew ? 'create' : 'update',
        entity_type: 'deal',
        entity_id: deal.id,
        entity_name: clientName,
        detail: isComplete
          ? `Fiche achat complète · ${lines.length} ligne(s) · Marge ${margePctStr}%${margeFaible ? ' ⚠️ < 10% — en attente validation Achraf' : ''}`
          : `Fiche achat ${isNew ? 'créée' : 'modifiée'} (incomplète) · ${lines.length} ligne(s)`,
      })

      setSuccess(true)
      setTimeout(() => { onSaved?.(); onClose() }, 1200)
    } catch (e: any) {
      setErr(e?.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function uploadFiles(oppId: string) {
    const uploads: { file: File; type: string }[] = []
    if (bcFile)    uploads.push({ file: bcFile,    type: 'bc_client' })
    if (devisFile) uploads.push({ file: devisFile, type: 'devis_compucom' })
    autreFiles.forEach(f => uploads.push({ file: f, type: 'autre' }))

    for (const u of uploads) {
      const path = `${oppId}/${u.type}/${Date.now()}_${u.file.name}`
      const { data: stored, error } = await supabase.storage
        .from('deal-files')
        .upload(path, u.file, { upsert: true })
      if (!error && stored) {
        await supabase.from('deal_files').insert({
          opportunity_id: oppId,
          file_type: u.type,
          file_name: u.file.name,
          file_url: stored.path,
          uploaded_by: userEmail,
        })
      }
    }
  }

  const updateLine = (i: number, field: keyof PurchaseLine, val: any) => {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: val }
      if (field === 'qty' || field === 'pu_vente') {
        updated.pt_vente = Number(updated.qty) * Number(updated.pu_vente)
      }
      return updated
    }))
  }

  const inp = 'h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 transition-colors'

  if (loading) return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="rounded-2xl bg-white p-8"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
    </div>,
    document.body
  )

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: 'calc(100dvh - 72px)' }}>

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <h2 className="text-base font-bold text-white">Fiche Achat</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                {deal.accounts?.name || deal.title}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Deal: {deal.title} · {mad(deal.amount)}
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">

          {success && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-5 w-5" /> Fiche achat sauvegardée ✓
            </div>
          )}
          {err && (
            <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          {/* ── Section 1 : Documents ── */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">📄 Documents</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

              {/* BC Client — obligatoire */}
              <div>
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-600">BC Client</span>
                  <span className="text-[10px] font-bold text-red-500">*</span>
                  {hasBcClient && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <FileUploadZone
                  label=""
                  accept=".pdf,.png,.jpg,.jpeg"
                  file={bcFile}
                  existingName={!bcFile ? existingFiles.find(f => f.file_type === 'bc_client')?.file_name : undefined}
                  onFile={setBcFile}
                  inputRef={bcRef}
                  color="blue"
                  required={!hasBcClient}
                />
              </div>

              {/* Devis Compucom — obligatoire */}
              <div>
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-600">Devis Compucom</span>
                  <span className="text-[10px] font-bold text-red-500">*</span>
                  {hasDevis && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <FileUploadZone
                  label=""
                  accept=".pdf"
                  file={devisFile}
                  existingName={!devisFile ? existingFiles.find(f => f.file_type === 'devis_compucom')?.file_name : undefined}
                  onFile={f => { setDevisFile(f); setExtracted(false); setExtractErr(null) }}
                  inputRef={devisRef}
                  color="violet"
                  required={!hasDevis}
                />
                {devisFile && !extracted && (
                  <button onClick={extractDevis} disabled={extracting}
                    className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors">
                    {extracting
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extraction…</>
                      : '✨ Extraire les lignes'}
                  </button>
                )}
                {extracted && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-violet-700">
                    <CheckCircle2 className="h-3 w-3" /> {lines.length} ligne{lines.length > 1 ? 's' : ''} extraite{lines.length > 1 ? 's' : ''}
                  </div>
                )}
                {extractErr && <div className="mt-1 text-[10px] text-red-600">{extractErr}</div>}
              </div>

              {/* Autres docs */}
              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-600">Autres docs</div>
                <button onClick={() => autreRef.current?.click()}
                  className="flex h-16 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <Upload className="mb-1 h-4 w-4" />
                  {autreFiles.length > 0 ? `${autreFiles.length} fichier(s)` : 'Ajouter…'}
                </button>
                <input ref={autreRef} type="file" multiple className="hidden"
                  onChange={e => setAutreFiles(Array.from(e.target.files || []))} />
                {autreFiles.map((f, i) => (
                  <div key={i} className="mt-1 flex items-center justify-between rounded-lg bg-white px-2 py-1 text-[10px] text-slate-600 border border-slate-100">
                    <span className="truncate max-w-[120px]">{f.name}</span>
                    <button onClick={() => setAutreFiles(a => a.filter((_, j) => j !== i))}
                      className="ml-1 text-slate-300 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 2 : Lignes produits ── */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                📋 Lignes produits · {lines.length} article{lines.length > 1 ? 's' : ''}
              </div>
              <button onClick={() => setLines(l => [...l, emptyLine()])}
                className="inline-flex h-7 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter ligne
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[70px]">Réf</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Désignation <span className="text-red-400">*</span></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[55px]">Qté</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[85px]">PU Vente</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[85px]">PT Vente</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-amber-500 w-[85px]">PU Achat <span className="text-red-400">*</span></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[80px]">Marge</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[105px]">Fournisseur <span className="text-red-400">*</span></th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[95px]">Contact</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[110px]">Email</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[95px]">Tél</th>
                    <th className="px-3 py-2.5 w-[32px]" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const ptVente = l.pt_vente || l.qty * l.pu_vente
                    const ptAchat = l.qty * l.pu_achat
                    const marge   = ptVente - ptAchat
                    const margePc = ptVente > 0 ? (marge / ptVente) * 100 : 0
                    const rowErr  = !l.designation.trim() || (l.pu_achat > 0 && !l.fournisseur.trim())
                    return (
                      <tr key={i}
                        className={`border-b border-slate-50 last:border-0 transition-colors ${rowErr ? 'bg-red-50/40' : 'hover:bg-slate-50/60'}`}>
                        <td className="px-3 py-2">
                          <input value={l.ref} onChange={e => updateLine(i, 'ref', e.target.value)}
                            placeholder="C1300-12XS" className={inp} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={l.designation} onChange={e => updateLine(i, 'designation', e.target.value)}
                            placeholder="Description produit *"
                            className={`${inp} min-w-[160px] ${!l.designation.trim() ? 'border-red-300 bg-red-50' : ''}`} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={l.qty}
                            onChange={e => updateLine(i, 'qty', Number(e.target.value))}
                            className={inp + ' text-right'} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={l.pu_vente}
                            onChange={e => updateLine(i, 'pu_vente', Number(e.target.value))}
                            className={inp + ' text-right'} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="font-semibold text-slate-700">
                            {ptVente > 0 ? (ptVente >= 1000 ? `${(ptVente / 1000).toFixed(0)}K` : ptVente.toLocaleString('fr')) : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={l.pu_achat}
                            onChange={e => updateLine(i, 'pu_achat', Number(e.target.value))}
                            className={`${inp} text-right font-semibold bg-amber-50 border-amber-200 focus:border-amber-400`} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {l.pu_achat > 0 ? (
                            <div>
                              <div className={`font-bold text-xs ${marge >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {Math.abs(marge) >= 1000 ? `${(marge / 1000).toFixed(0)}K` : marge.toLocaleString('fr')}
                              </div>
                              <div className={`text-[10px] font-semibold rounded-full px-1 inline-block mt-0.5
                                ${margePc >= 20 ? 'text-emerald-600 bg-emerald-50'
                                  : margePc >= 10 ? 'text-amber-600 bg-amber-50'
                                  : 'text-red-600 bg-red-50'}`}>
                                {margePc.toFixed(1)}%
                              </div>
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input value={l.fournisseur} onChange={e => updateLine(i, 'fournisseur', e.target.value)}
                            placeholder="Arrow, Dell…"
                            className={`${inp} ${l.pu_achat > 0 && !l.fournisseur.trim() ? 'border-red-300 bg-red-50' : ''}`} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={l.contact_fournisseur} onChange={e => updateLine(i, 'contact_fournisseur', e.target.value)}
                            placeholder="Hiba…" className={inp} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="email" value={l.email_fournisseur} onChange={e => updateLine(i, 'email_fournisseur', e.target.value)}
                            placeholder="hiba@arrow.ma" className={inp} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={l.tel_fournisseur} onChange={e => updateLine(i, 'tel_fournisseur', e.target.value)}
                            placeholder="+212…" className={inp} />
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 3 : Frais + Récap ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">💼 Frais d'engagement commercial</div>
              <div className="flex items-center gap-3">
                <input type="number" min={0} value={frais}
                  onChange={e => setFrais(Number(e.target.value))}
                  placeholder="0"
                  className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400" />
                <span className="text-sm text-slate-500">MAD</span>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Notes internes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Contexte, remarques sur l'achat…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Récap financier</div>
              <div className="space-y-2">
                <Row label="Total vente HT"    value={mad(totalVente)}  bold />
                <Row label="Total achat HT"    value={mad(totalAchat)}  />
                <Row label="Marge brute"        value={`${mad(margeBrute)} (${pct(margePctBrute)})`}
                  color={margeBrute >= 0 ? 'emerald' : 'red'} />
                <div className="border-t border-slate-200 pt-2">
                  <Row label="Frais d'engagement" value={`- ${mad(frais)}`} color="amber" />
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <Row label="Marge nette" value={`${mad(margeNette)} (${pct(margePctNette)})`}
                    color={margeNette >= 0 ? (margePctNette < 10 ? 'red' : 'emerald') : 'red'} bold />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 4 : Justification marge faible ── */}
          {margeFaible && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-amber-800">
                    Marge nette &lt; 10% — Justification obligatoire
                  </div>
                  <div className="text-xs text-amber-600 mt-0.5">
                    Ce deal sera soumis à validation par <strong>Achraf Lahkim</strong> avant mise en production Supply.
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-amber-800">Raison principale</label>
                  <div className="flex flex-wrap gap-2">
                    {JUSTIFICATION_REASONS.map(r => (
                      <button key={r} type="button"
                        onClick={() => setJustifReason(r)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors
                          ${justifReason === r
                            ? 'border-amber-500 bg-amber-500 text-white'
                            : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    Détail <span className="text-red-500">*</span>
                    <span className="ml-1 font-normal text-amber-600">(min. 10 caractères)</span>
                  </label>
                  <textarea
                    value={justifText}
                    onChange={e => setJustifText(e.target.value)}
                    rows={3}
                    placeholder="Ex : Client stratégique, remise accordée pour signature avant fin trimestre…"
                    className={`w-full rounded-xl border px-3 py-2 text-xs outline-none resize-none transition-colors
                      ${justifText.trim().length >= 10
                        ? 'border-amber-300 bg-white focus:border-amber-500'
                        : 'border-red-300 bg-red-50 focus:border-red-400'}`}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`text-[10px] ${justifText.trim().length >= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                      {justifText.trim().length} / 10 caractères minimum
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-amber-600">
                      <ShieldCheck className="h-3 w-3" />
                      Validation Achraf requise
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-6 py-4">

          {/* Checklist docs obligatoires */}
          {(!hasBcClient || !hasDevis) && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Documents obligatoires manquants :
              {!hasBcClient && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5">BC Client</span>}
              {!hasDevis    && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5">Devis Compucom</span>}
            </div>
          )}

          {/* Completeness indicator */}
          {lines.length > 0 && hasBcClient && hasDevis && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold
              ${isComplete
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
              {isComplete ? (
                <><CheckCircle2 className="h-4 w-4 shrink-0" /> Fiche complète — toutes les lignes ont un prix achat et un fournisseur ✓</>
              ) : (
                <><AlertCircle className="h-4 w-4 shrink-0" />
                  {incompleteLines.length} ligne{incompleteLines.length > 1 ? 's' : ''} sans prix achat ou fournisseur — restera dans Tasks jusqu'à complétion
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose}
              className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave}
              disabled={saving || success || !hasBcClient || !hasDevis || !justifComplete}
              className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white transition-colors sm:flex-none sm:min-w-[220px]
                ${(!hasBcClient || !hasDevis || !justifComplete)
                  ? 'bg-slate-300 cursor-not-allowed'
                  : margeFaible
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-slate-900 hover:bg-slate-800'}
                disabled:opacity-60`}>
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde…</>
                : margeFaible
                  ? <><ShieldCheck className="h-4 w-4" /> Enregistrer (Validation Achraf)</>
                  : <><Save className="h-4 w-4" /> {isComplete ? 'Enregistrer (Complet ✓)' : 'Enregistrer (Partiel)'}</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}

// ─── Sub-components ───────────────────────────────────────────
function FileUploadZone({
  label, accept, file, existingName, onFile, inputRef, color, required,
}: {
  label: string; accept: string; file: File | null
  existingName?: string
  onFile: (f: File) => void; inputRef: React.MutableRefObject<HTMLInputElement>
  color: 'blue' | 'violet' | 'slate'
  required?: boolean
}) {
  const colors = {
    blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   text: 'text-blue-700'   },
    violet: { border: 'border-violet-200', bg: 'bg-violet-50', text: 'text-violet-700' },
    slate:  { border: 'border-slate-200',  bg: 'bg-slate-50',  text: 'text-slate-600'  },
  }[color]

  const displayName = file?.name || existingName
  const hasFile     = !!displayName

  return (
    <div>
      {label && <div className="mb-1.5 text-xs font-semibold text-slate-600">{label}</div>}
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border transition-colors
          ${hasFile
            ? `${colors.border} ${colors.bg}`
            : required
              ? 'border-dashed border-red-300 bg-red-50 hover:bg-red-100'
              : 'border-dashed border-slate-200 bg-white hover:bg-slate-50'}`}>
        {hasFile ? (
          <>
            <FileText className={`h-4 w-4 ${colors.text}`} />
            <span className={`text-[10px] font-semibold ${colors.text} max-w-[120px] truncate px-1`}>{displayName}</span>
          </>
        ) : (
          <>
            <Upload className={`h-4 w-4 ${required ? 'text-red-400' : 'text-slate-400'}`} />
            <span className={`text-[10px] ${required ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              {required ? 'Obligatoire' : 'Sélectionner…'}
            </span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function Row({ label, value, color, bold }: {
  label: string; value: string
  color?: 'emerald' | 'red' | 'amber'
  bold?: boolean
}) {
  const colorCls = color === 'emerald' ? 'text-emerald-700' : color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-700'
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-${bold ? '700' : '500'} ${colorCls}`}>{value}</span>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
