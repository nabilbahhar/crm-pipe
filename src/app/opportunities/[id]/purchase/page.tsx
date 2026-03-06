'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import {
  ArrowLeft, Upload, Loader2, Plus, Trash2, Save,
  FileText, AlertCircle, CheckCircle2, AlertTriangle,
  ShieldCheck, X, RefreshCw, Package,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number
  accounts?: { name?: string } | null
  bu?: string | null; po_number?: string | null
}
type Fournisseur = { id: string; name: string; contact_name?: string; email?: string; tel?: string }
type PurchaseLine = {
  id?: string; ref: string; designation: string
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur_id: string | null; fournisseur?: string
}
type DBFile = { id?: string; file_type: string; file_name: string; file_url?: string }

const REASONS = [
  'Alignement concurrent (prix imposé par le marché)',
  'Investissement compte stratégique',
  'Pénétration nouveau compte',
  'Accord cadre / prix négocié',
  'Autre',
]

const emptyLine = (): PurchaseLine => ({
  ref: '', designation: '', qty: 1, pu_vente: 0, pt_vente: 0, pu_achat: 0, fournisseur_id: null,
})

// ─── Format professionnel : 523 760 MAD (regex fiable en build Vercel) ───
const numFmt = (n: number | null | undefined) => {
  if (n == null) return '—'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}
const mad    = (n: number | null | undefined) => n == null ? '—' : `${numFmt(n)} MAD`
const pct    = (n: number) => `${n.toFixed(1)} %`

// ─── Draft localStorage ───────────────────────────────────────
const DRAFT_KEY = (id: string) => `crm_purchase_draft_${id}`

function saveDraft(id: string, data: object) {
  try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify({ ...data, _t: Date.now() })) } catch {}
}
function loadDraft(id: string) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id))
    if (!raw) return null
    const d = JSON.parse(raw)
    if (Date.now() - d._t > 7 * 86400000) { localStorage.removeItem(DRAFT_KEY(id)); return null }
    return d
  } catch { return null }
}
function clearDraft(id: string) { try { localStorage.removeItem(DRAFT_KEY(id)) } catch {} }

// ─── Phone ────────────────────────────────────────────────────
function normalizePhone(raw: string) {
  if (!raw.trim()) return raw
  const d = raw.replace(/[\s\-\(\)\+\.]/g, '')
  let local: string | null = null
  if (/^00212/.test(d)) local = d.slice(5)
  else if (/^212/.test(d)) local = d.slice(3)
  else if (/^0[5-7]/.test(d) && d.length === 10) local = d.slice(1)
  else if (/^[5-7]/.test(d) && d.length === 9) local = d
  if (local?.length === 9) return `+212 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`
  return raw
}

// ─── Page ─────────────────────────────────────────────────────
export default function PurchasePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [deal, setDeal]     = useState<Deal | null>(null)
  const [fourns, setFourns] = useState<Fournisseur[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lines, setLines]   = useState<PurchaseLine[]>([emptyLine()])
  const [frais, setFrais]   = useState(0)
  const [notes, setNotes]   = useState('')
  const [justifReason, setJustifReason] = useState(REASONS[0])
  const [justifText, setJustifText]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState<string | null>(null)
  const [extracted, setExtracted]   = useState(false)
  const [existingInfo, setExistingInfo] = useState<any>(null)
  const [draftAge, setDraftAge]         = useState<string | null>(null)

  // Files
  const [bcFile, setBcFile]         = useState<File | null>(null)
  const [devisFile, setDevisFile]   = useState<File | null>(null)
  const [autreFiles, setAutreFiles] = useState<File[]>([])
  const [dbFiles, setDbFiles]       = useState<DBFile[]>([])

  // New fournisseur modal
  const [showFournModal, setShowFournModal] = useState(false)
  const [newFourn, setNewFourn] = useState({ name:'', contact_name:'', email:'', tel:'' })
  const [addingFourn, setAddingFourn] = useState(false)

  const bcRef    = useRef<HTMLInputElement>(null!)
  const devisRef = useRef<HTMLInputElement>(null!)
  const autreRef = useRef<HTMLInputElement>(null!)
  const draftRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    if (id) loadAll()
  }, [id])

  // Auto-save draft
  useEffect(() => {
    if (!id || loading) return
    if (draftRef.current) clearTimeout(draftRef.current)
    draftRef.current = setTimeout(() => {
      saveDraft(id, { lines, frais, notes, justifReason, justifText })
    }, 2000)
    return () => { if (draftRef.current) clearTimeout(draftRef.current) }
  }, [lines, frais, notes, justifReason, justifText, id, loading])

  async function loadAll() {
    setLoading(true)
    const [dealRes, fournsRes] = await Promise.all([
      supabase.from('opportunities')
        .select('id, title, amount, bu, po_number, accounts(name)')
        .eq('id', id).single(),
      supabase.from('fournisseurs')
        .select('id, name, contact_name, email, tel')
        .eq('is_active', true).order('name'),
    ])
    if (dealRes.data) setDeal({ ...dealRes.data, accounts: dealRes.data.accounts as any })
    if (fournsRes.data) setFourns(fournsRes.data)

    // Existing purchase info
    const { data: info } = await supabase
      .from('purchase_info').select('*, purchase_lines(*)')
      .eq('opportunity_id', id).maybeSingle()

    // Existing files (always load from DB to persist across sessions)
    const { data: files } = await supabase
      .from('deal_files').select('id, file_type, file_name, file_url')
      .eq('opportunity_id', id)
    if (files) setDbFiles(files)

    if (info) {
      setExistingInfo(info)
      setFrais(info.frais_engagement || 0)
      setNotes(info.notes || '')
      if (info.justif_reason) setJustifReason(info.justif_reason)
      if (info.justif_text)   setJustifText(info.justif_text)
      if (info.purchase_lines?.length > 0) {
        const sorted = [...info.purchase_lines].sort((a: any, b: any) => a.sort_order - b.sort_order)
        setLines(sorted.map((l: any) => ({
          id: l.id, ref: l.ref || '', designation: l.designation || '',
          qty: l.qty || 1, pu_vente: l.pu_vente || 0,
          pt_vente: l.pt_vente || 0, pu_achat: l.pu_achat || 0,
          fournisseur_id: l.fournisseur_id || null,
          fournisseur: l.fournisseur || '',
        })))
        setExtracted(true)
        setLoading(false)
        return
      }
    }
    // Restore draft if no DB lines
    const draft = loadDraft(id)
    if (draft?.lines?.length > 0) {
      setLines(draft.lines)
      if (draft.frais)        setFrais(draft.frais)
      if (draft.notes)        setNotes(draft.notes)
      if (draft.justifReason) setJustifReason(draft.justifReason)
      if (draft.justifText)   setJustifText(draft.justifText)
      const mins = Math.round((Date.now() - draft._t) / 60000)
      setDraftAge(mins < 1 ? "à l'instant" : mins < 60 ? `il y a ${mins} min` : `il y a ${Math.floor(mins/60)}h`)
    }
    setLoading(false)
  }

  // ── Extract devis ─────────────────────────────────────────────
  async function extractDevis() {
    if (!devisFile) return
    setExtracting(true); setExtractErr(null)
    try {
      const base64 = await fileToBase64(devisFile)
      const res = await fetch('/api/extract-devis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      if (data.lines?.length > 0) {
        setLines(data.lines.map((l: any) => ({
          ref: l.ref||'', designation: l.designation||'',
          qty: Number(l.qty)||1, pu_vente: Number(l.pu_vente)||0,
          pt_vente: Number(l.pt_vente)||0, pu_achat: 0, fournisseur_id: null,
        })))
        setExtracted(true)
      } else setExtractErr('Aucune ligne détectée. Saisis manuellement.')
    } catch (e: any) { setExtractErr(e?.message || 'Erreur extraction')
    } finally { setExtracting(false) }
  }

  // ── Add fournisseur ───────────────────────────────────────────
  async function addFournisseur() {
    if (!newFourn.name.trim()) return
    setAddingFourn(true)
    const tel = newFourn.tel ? normalizePhone(newFourn.tel) : ''
    const { data, error } = await supabase.from('fournisseurs')
      .insert({ ...newFourn, tel, is_active: true })
      .select('id, name, contact_name, email, tel').single()
    if (!error && data) {
      setFourns(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewFourn({ name:'', contact_name:'', email:'', tel:'' })
      setShowFournModal(false)
    }
    setAddingFourn(false)
  }

  // ── Totals ────────────────────────────────────────────────────
  const totalVente    = lines.reduce((s,l) => s + (Number(l.pt_vente) || Number(l.qty)*Number(l.pu_vente)), 0)
  const totalAchat    = lines.reduce((s,l) => s + Number(l.pu_achat)*Number(l.qty), 0)
  const margeBrute    = totalVente - totalAchat
  const margeNette    = margeBrute - frais
  const margePctBrute = totalVente > 0 ? (margeBrute/totalVente)*100 : 0
  const margePctNette = totalVente > 0 ? (margeNette/totalVente)*100 : 0
  const margeFaible   = totalAchat > 0 && margePctNette < 10
  const dealAmount    = deal?.amount || 0
  const totalPct      = dealAmount > 0 ? Math.min((totalVente/dealAmount)*100, 100) : 0
  const totalMatch    = dealAmount > 0 && Math.abs(totalVente - dealAmount) < 1
  const totalDiff     = totalVente - dealAmount

  // ── Validation ────────────────────────────────────────────────
  const hasBcClient = !!bcFile || dbFiles.some(f => f.file_type === 'bc_client')
  const hasDevis    = !!devisFile || dbFiles.some(f => f.file_type === 'devis_compucom')
  const justifOk    = !margeFaible || justifText.trim().length >= 10
  const canSave     = hasBcClient && hasDevis && justifOk && totalMatch

  // ── Line update ───────────────────────────────────────────────
  const updateLine = (i: number, field: keyof PurchaseLine, val: any) =>
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const u = { ...l, [field]: val }
      if (field==='qty' || field==='pu_vente') u.pt_vente = Number(u.qty)*Number(u.pu_vente)
      return u
    }))

  // ── Save (partiel OU complet) ─────────────────────────────────
  async function handleSave(partial = false) {
    setErr(null)
    // Pour save partiel : on filtre les lignes sans désignation (on ne bloque pas)
    const validLines = lines.filter(l => l.designation.trim())
    if (validLines.length === 0) {
      setErr('Ajoute au moins une ligne avec une désignation.'); return
    }
    // Pour save complet : validations strictes
    if (!partial) {
      if (!hasBcClient) { setErr('BC Client est obligatoire pour finaliser.'); return }
      if (!hasDevis)    { setErr('Devis Compucom est obligatoire pour finaliser.'); return }
      if (!totalMatch)  { setErr(`Total (${mad(totalVente)}) ≠ montant deal (${mad(dealAmount)}). Écart : ${mad(Math.abs(totalDiff))}`); return }
      if (margeFaible && justifText.trim().length < 10) { setErr('Justification obligatoire (min. 10 car.) pour marge < 10%.'); return }
    }

    setSaving(true)
    try {
      let infoId = existingInfo?.id
      const payload: any = {
        opportunity_id: id, frais_engagement: frais, notes,
        filled_by: userEmail, updated_at: new Date().toISOString(),
        ...(margeFaible
          ? { justif_reason: justifReason, justif_text: justifText, approved_by: null }
          : { justif_reason: null, justif_text: null }),
      }
      if (!infoId) {
        const { data: d, error: e } = await supabase.from('purchase_info').insert(payload).select('id').single()
        if (e) throw e
        infoId = d.id
      } else {
        await supabase.from('purchase_info').update(payload).eq('id', infoId)
      }
      await supabase.from('purchase_lines').delete().eq('purchase_info_id', infoId)
      const { error: e2 } = await supabase.from('purchase_lines').insert(
        validLines.map((l, i) => {
          const fourn = fourns.find(f => f.id === l.fournisseur_id)
          return {
            purchase_info_id: infoId, sort_order: i,
            ref: l.ref||null, designation: l.designation,
            qty: l.qty, pu_vente: l.pu_vente,
            pt_vente: l.pt_vente || l.qty*l.pu_vente, pu_achat: l.pu_achat,
            fournisseur_id: l.fournisseur_id || null,
            fournisseur: fourn?.name || l.fournisseur || null,
            contact_fournisseur: fourn?.contact_name || null,
            email_fournisseur: fourn?.email || null,
            tel_fournisseur: fourn?.tel || null,
          }
        })
      )
      if (e2) throw e2
      await uploadNewFiles()
      // Save complet = "Placer la commande" → status 'place'
      // Save partiel = créer supply_order en 'a_commander' si n'existe pas encore
      await supabase.from('supply_orders').upsert(
        {
          opportunity_id: id,
          status: partial ? 'a_commander' : 'place',
          ...(partial ? {} : { placed_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'opportunity_id', ignoreDuplicates: partial }
      )
      if (!partial) {
        // Full save : mettre à jour le statut même si la commande existait déjà
        await supabase.from('supply_orders')
          .update({ status: 'place', placed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('opportunity_id', id)
      }
      await logActivity({
        action_type: existingInfo?.id ? 'update' : 'create',
        entity_type: 'deal', entity_id: id,
        entity_name: deal?.accounts?.name || deal?.title || '',
        detail: partial
          ? `Fiche achat (partielle) · ${validLines.length} ligne(s)`
          : `Fiche achat · ${validLines.length} ligne(s) · Marge ${margePctNette.toFixed(1)}% · Commande placée`,
      })
      clearDraft(id)
      setSuccess(true)
      setTimeout(() => router.push(`/opportunities/${id}`), 1300)
    } catch (e: any) { setErr(e?.message || 'Erreur sauvegarde')
    } finally { setSaving(false) }
  }

  async function uploadNewFiles() {
    const toUpload = [
      ...(bcFile    ? [{ file:bcFile,    type:'bc_client'      }] : []),
      ...(devisFile ? [{ file:devisFile, type:'devis_compucom' }] : []),
      ...autreFiles.map(f => ({ file: f, type: 'autre' })),
    ]
    for (const u of toUpload) {
      const path = `${id}/${u.type}/${Date.now()}_${u.file.name}`
      const { data: stored, error } = await supabase.storage
        .from('deal-files').upload(path, u.file, { upsert: true })
      if (!error && stored) {
        if (u.type !== 'autre') {
          await supabase.from('deal_files').delete()
            .eq('opportunity_id', id).eq('file_type', u.type)
        }
        await supabase.from('deal_files').insert({
          opportunity_id: id, file_type: u.type,
          file_name: u.file.name, file_url: stored.path, uploaded_by: userEmail,
        })
      }
    }
    const { data: files } = await supabase
      .from('deal_files').select('id, file_type, file_name, file_url')
      .eq('opportunity_id', id)
    if (files) setDbFiles(files)
  }

  const inp = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-50 transition placeholder:text-slate-300'

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  )
  if (!deal) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Deal introuvable.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto px-6 py-6 space-y-5" style={{ maxWidth: 1480 }}>

        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/opportunities/${id}`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-slate-900">Fiche Achat</h1>
            <p className="text-sm text-slate-500 truncate">
              {deal.accounts?.name || deal.title}
              {deal.po_number && <span className="ml-2 font-medium">· PO {deal.po_number}</span>}
              <span className="ml-2 font-bold text-slate-800">· {mad(dealAmount)}</span>
            </p>
          </div>
          {draftAge && !success && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
              <RefreshCw className="h-3 w-3" /> Brouillon · {draftAge}
            </span>
          )}
          {existingInfo && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Modification
            </span>
          )}
        </div>

        {success && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" /> Sauvegardée — retour au deal…
          </div>
        )}
        {err && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}

        {/* ── Documents ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <SecTitle>📄 Documents</SecTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <FileSlot label="BC Client" required accept=".pdf,.png,.jpg"
              file={bcFile} dbFile={dbFiles.find(f=>f.file_type==='bc_client')}
              onFile={setBcFile} inputRef={bcRef} color="blue" />
            <div>
              <FileSlot label="Devis Compucom" required accept=".pdf"
                file={devisFile} dbFile={dbFiles.find(f=>f.file_type==='devis_compucom')}
                onFile={f => { setDevisFile(f); setExtracted(false); setExtractErr(null) }}
                inputRef={devisRef} color="violet" />
              {devisFile && !extracted && (
                <button onClick={extractDevis} disabled={extracting}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60 transition">
                  {extracting ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraction en cours…</> : '✨ Extraire les lignes automatiquement'}
                </button>
              )}
              {extracted && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><CheckCircle2 className="h-4 w-4" />{lines.length} ligne{lines.length>1?'s':''} extraite{lines.length>1?'s':''}</p>}
              {extractErr && <p className="mt-2 text-sm text-red-600">{extractErr}</p>}
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-600">Autres docs</p>
              <button onClick={() => autreRef.current?.click()}
                className="flex h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 transition">
                <Upload className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-400">{autreFiles.length > 0 ? `${autreFiles.length} nouveau(x)` : 'Ajouter…'}</span>
              </button>
              <input ref={autreRef} type="file" multiple className="hidden" onChange={e => setAutreFiles(Array.from(e.target.files||[]))} />
              {[...dbFiles.filter(f=>f.file_type==='autre'), ...autreFiles.map(f => ({ file_name: f.name, isNew: true }))].map((f: any, i) => (
                <div key={i} className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate flex-1">{f.file_name}</span>
                  {f.isNew && <button onClick={() => setAutreFiles(a => a.filter(x => x.name!==f.file_name))}><X className="h-3 w-3 text-slate-300 hover:text-red-500" /></button>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table lignes ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <SecTitle>📋 Lignes produits · {lines.length} article{lines.length>1?'s':''}</SecTitle>
          </div>

          {/* Progress */}
          {dealAmount > 0 && (
            <div className={`mb-5 rounded-xl border px-5 py-4 ${totalMatch?'border-emerald-200 bg-emerald-50':totalVente>dealAmount?'border-red-200 bg-red-50':'border-amber-200 bg-amber-50'}`}>
              <div className="mb-2 flex items-center justify-between font-semibold">
                <span className={`text-sm ${totalMatch?'text-emerald-700':totalVente>dealAmount?'text-red-700':'text-amber-700'}`}>
                  {totalMatch ? '✓ Total conforme au deal' : totalVente>dealAmount ? '⚠ Total dépasse le deal' : '⚠ Total inférieur au deal'}
                </span>
                <span className={`text-sm ${totalMatch?'text-emerald-700':totalVente>dealAmount?'text-red-700':'text-amber-700'}`}>
                  {mad(totalVente)} / {mad(dealAmount)}
                  {!totalMatch && totalVente > 0 && <span className="ml-2 font-normal text-xs opacity-70">({totalDiff>0?'+':''}{mad(totalDiff)})</span>}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/60">
                <div className={`h-full rounded-full transition-all duration-500 ${totalMatch?'bg-emerald-500':totalVente>dealAmount?'bg-red-400':'bg-amber-400'}`}
                  style={{ width: `${totalPct}%` }} />
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full" style={{ minWidth: 1120 }}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {[
                    { l:'Réf',        w:100, r:false },
                    { l:'Désignation *', w:0, r:false },
                    { l:'Qté',        w:90,  r:true  },
                    { l:'PU Vente',   w:145, r:true  },
                    { l:'PT Vente',   w:155, r:true  },
                    { l:'PU Achat ★', w:155, r:true, amber:true },
                    { l:'PT Achat',   w:155, r:true  },
                    { l:'Marge',      w:100, r:true  },
                    { l:'Fournisseur',w:220, r:false },
                    { l:'',           w:44,  r:false },
                  ].map(({ l, w, r, amber }, i) => (
                    <th key={i} style={w ? { width: w } : {}} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wide ${r?'text-right':'text-left'} ${amber?'text-amber-500':'text-slate-400'}`}>
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const ptVente = Number(l.pt_vente) || Number(l.qty)*Number(l.pu_vente)
                  const ptAchat = Number(l.qty)*Number(l.pu_achat)
                  const marge   = ptVente - ptAchat
                  const margePc = ptVente > 0 ? (marge/ptVente)*100 : 0
                  return (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <input value={l.ref} onChange={e => updateLine(i,'ref',e.target.value)}
                          placeholder="C1300…" className={inp} />
                      </td>
                      <td className="px-4 py-3">
                        <input value={l.designation} onChange={e => updateLine(i,'designation',e.target.value)}
                          placeholder="Description du produit *"
                          className={`${inp} ${!l.designation.trim()?'border-red-300 bg-red-50 focus:border-red-400':''}`} />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={1} value={Number(l.qty) || 1} onChange={e => updateLine(i,'qty',Number(e.target.value)||1)}
                          className={`${inp} text-right font-semibold`} style={{ minWidth: 72 }} />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={l.pu_vente||''} onChange={e => updateLine(i,'pu_vente',Number(e.target.value))}
                          className={`${inp} text-right`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-800 text-sm">
                          {ptVente > 0 ? numFmt(ptVente) : <span className="text-slate-300 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={l.pu_achat||''} onChange={e => updateLine(i,'pu_achat',Number(e.target.value))}
                          className={`${inp} text-right font-bold bg-amber-50 border-amber-200 focus:border-amber-500`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-800 text-sm">
                          {ptAchat > 0 ? numFmt(ptAchat) : <span className="text-slate-300 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {l.pu_achat > 0 && ptVente > 0 ? (
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${margePc>=20?'bg-emerald-100 text-emerald-700':margePc>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>
                            {pct(margePc)}
                          </span>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <select value={l.fournisseur_id||''} onChange={e => updateLine(i,'fournisseur_id', e.target.value||null)}
                            className={`h-10 flex-1 rounded-lg border px-3 text-sm outline-none transition focus:ring-2 focus:ring-slate-50
                              ${l.fournisseur_id?'border-slate-300 bg-white text-slate-800 font-medium':'border-slate-200 bg-slate-50 text-slate-400'}`}>
                            <option value="">Choisir…</option>
                            {fourns.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <button onClick={() => setShowFournModal(true)} title="Nouveau fournisseur"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {lines.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-400">Totaux</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{mad(totalVente)}</td>
                    <td />
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{totalAchat>0?mad(totalAchat):'—'}</td>
                    <td className="px-4 py-3 text-right">
                      {totalAchat > 0 && (
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${margePctBrute>=20?'bg-emerald-100 text-emerald-700':margePctBrute>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>
                          {pct(margePctBrute)}
                        </span>
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

              {/* Row "Ajouter ligne" — dans le tableau, proche des lignes */}
              <tr>
                <td colSpan={10} className="px-4 py-2 border-t border-dashed border-slate-200">
                  <button onClick={() => setLines(l => [...l, emptyLine()])}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                    <Plus className="h-4 w-4" /> Ajouter une ligne
                  </button>
                </td>
              </tr>

          {fourns.length === 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Aucun fournisseur dans la base — clique sur <strong className="mx-0.5">+</strong> pour en créer un, ou va dans <strong className="ml-0.5">Supply → Fournisseurs</strong>.
            </div>
          )}
        </div>

        {/* ── Frais + Récap ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SecTitle>💼 Frais & Notes</SecTitle>
            <div className="mb-4 flex items-center gap-3">
              <input type="number" min={0} value={frais||''} onChange={e => setFrais(Number(e.target.value))}
                placeholder="0" className={`${inp} max-w-[180px]`} />
              <span className="text-sm text-slate-500">MAD — Frais d'engagement</span>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Notes internes, contexte, remarques…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50 resize-none placeholder:text-slate-300" />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SecTitle>📊 Récap financier</SecTitle>
            <div className="space-y-3.5">
              <RRow label="Total vente HT"   value={mad(totalVente)} bold />
              <RRow label="Total achat HT"   value={totalAchat>0?mad(totalAchat):'—'} />
              <RRow label="Marge brute"
                value={totalAchat>0?`${mad(margeBrute)} (${pct(margePctBrute)})`:'—'}
                color={margeBrute>=0?'emerald':'red'} />
              {frais > 0 && <><div className="border-t border-slate-100 pt-1"/><RRow label="Frais engagement" value={`− ${mad(frais)}`} color="amber" /></>}
              <div className="border-t border-slate-100 pt-1">
                <RRow label="Marge nette"
                  value={totalAchat>0?`${mad(margeNette)} (${pct(margePctNette)})`:'—'}
                  color={margePctNette<10?'red':'emerald'} bold />
              </div>
            </div>
          </div>
        </div>

        {/* ── Justif marge ── */}
        {margeFaible && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800">Marge nette &lt; 10% — Justification obligatoire</p>
                <p className="text-sm text-amber-600 mt-0.5">Ce deal sera soumis à validation par <strong>Achraf Lahkim</strong> avant commande Supply.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {REASONS.map(r => (
                <button key={r} type="button" onClick={() => setJustifReason(r)}
                  className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition ${justifReason===r?'border-amber-500 bg-amber-500 text-white':'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'}`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={justifText} onChange={e => setJustifText(e.target.value)} rows={3}
              placeholder="Ex : Client stratégique, remise accordée pour signature avant fin trimestre…"
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${justifText.trim().length>=10?'border-amber-300 bg-white':'border-red-300 bg-red-50'}`} />
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-sm ${justifText.trim().length>=10?'text-amber-600':'text-red-500 font-semibold'}`}>{justifText.trim().length} / 10 min.</span>
              <span className="flex items-center gap-1.5 text-sm text-amber-600"><ShieldCheck className="h-4 w-4" /> Validation Achraf requise</span>
            </div>
          </div>
        )}

        {/* ── Footer Save ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
          {(!hasBcClient || !hasDevis) && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Documents manquants :
              {!hasBcClient && <span className="ml-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs">BC Client</span>}
              {!hasDevis    && <span className="ml-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs">Devis Compucom</span>}
            </div>
          )}
          {hasBcClient && hasDevis && !totalMatch && totalVente > 0 && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Total lignes ({mad(totalVente)}) ≠ montant deal ({mad(dealAmount)}) — écart : {mad(Math.abs(totalDiff))}
            </div>
          )}
          {canSave && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Fiche complète — prête à sauvegarder ✓
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => router.push(`/opportunities/${id}`)}
              className="h-11 rounded-xl border border-slate-200 px-6 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>

            {/* Partial save — always available as long as lines have designations */}
            <button onClick={() => handleSave(true)} disabled={saving || success || lines.every(l => !l.designation.trim())}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40">
              <Save className="h-4 w-4" /> Sauvegarder (partiel)
            </button>

            {/* Full save = "Placer la commande" */}
            <button onClick={() => handleSave(false)} disabled={saving || success || !canSave}
              className={`flex flex-1 sm:flex-none sm:min-w-[260px] h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50
                ${!canSave?'bg-slate-300 cursor-not-allowed':margeFaible?'bg-amber-600 hover:bg-amber-700 shadow-amber-200 shadow-lg':'bg-slate-900 hover:bg-slate-800 shadow-slate-200 shadow-lg'}`}>
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde…</>
                : margeFaible
                  ? <><ShieldCheck className="h-4 w-4" /> Enregistrer (validation Achraf)</>
                  : <><Package className="h-4 w-4" /> Placer la commande</>}
            </button>
          </div>
        </div>

      </div>

      {/* ── Modal nouveau fournisseur ── */}
      {showFournModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h2 className="text-base font-bold text-slate-900">🏭 Nouveau fournisseur</h2>
              <button onClick={() => setShowFournModal(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { f:'name',         l:'Nom *',   p:'Dell, HP, Lenovo…' },
                { f:'contact_name', l:'Contact', p:'Nom du commercial' },
                { f:'email',        l:'Email',   p:'contact@fournisseur.com' },
                { f:'tel',          l:'Tél',     p:'06XXXXXXXX / +212…' },
              ].map(({ f, l, p }) => (
                <div key={f}>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-600">{l}</label>
                  <input value={(newFourn as any)[f]} onChange={e => setNewFourn(prev => ({ ...prev, [f]: e.target.value }))}
                    placeholder={p} className={inp} />
                </div>
              ))}
              <p className="text-xs text-slate-400">Les informations complètes se gèrent dans <strong>Supply → Fournisseurs</strong>.</p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setShowFournModal(false)} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Annuler</button>
              <button onClick={addFournisseur} disabled={addingFourn || !newFourn.name.trim()}
                className="flex-1 h-10 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition">
                {addingFourn ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Créer le fournisseur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────
function SecTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">{children}</div>
}

function FileSlot({ label, required, accept, file, dbFile, onFile, inputRef, color }: {
  label: string; required?: boolean; accept: string
  file: File|null; dbFile?: DBFile
  onFile: (f:File)=>void; inputRef: React.MutableRefObject<HTMLInputElement>
  color: 'blue'|'violet'
}) {
  const c = {
    blue:   { border:'border-blue-200',   bg:'bg-blue-50/60',   text:'text-blue-700',   },
    violet: { border:'border-violet-200', bg:'bg-violet-50/60', text:'text-violet-700', },
  }[color]
  const name      = file?.name || dbFile?.file_name
  const isExisting = !file && !!dbFile
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        {required && <span className="text-xs font-bold text-red-500">*</span>}
        {name && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`relative flex h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition
          ${name?`${c.border} ${c.bg}`:required?'border-dashed border-red-300 bg-red-50 hover:bg-red-100':'border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
        {name ? (
          <>
            <FileText className={`h-5 w-5 ${c.text}`} />
            <span className={`text-xs font-semibold ${c.text} max-w-[170px] truncate px-2`}>{name}</span>
            {isExisting && <span className="absolute bottom-1 right-2 text-[9px] text-slate-400">Cliquer pour remplacer</span>}
          </>
        ) : (
          <>
            <Upload className={`h-5 w-5 ${required?'text-red-400':'text-slate-400'}`} />
            <span className={`text-xs font-semibold ${required?'text-red-500':'text-slate-400'}`}>{required?'Obligatoire':'Sélectionner…'}</span>
          </>
        )}
      </button>
      {isExisting && (
        <p className="mt-1 text-xs text-emerald-600 font-medium">✓ Fichier déjà uploadé</p>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function RRow({ label, value, color, bold }: { label:string; value:string; color?:'emerald'|'red'|'amber'; bold?:boolean }) {
  const cls = color==='emerald'?'text-emerald-700':color==='red'?'text-red-600':color==='amber'?'text-amber-600':'text-slate-700'
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm ${bold?'font-bold':'font-medium'} ${cls}`}>{value}</span>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
