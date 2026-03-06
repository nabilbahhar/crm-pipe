'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { logActivity } from '@/lib/logActivity'
import {
  ArrowLeft, Upload, Loader2, Plus, Trash2, Save,
  FileText, AlertCircle, CheckCircle2, AlertTriangle,
  ShieldCheck, ChevronDown, Users, Copy, Check, X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number
  accounts?: { name?: string } | null
  vendor?: string | null; bu?: string | null
  po_number?: string | null
}
type Supplier = {
  uid: string; name: string; contact: string; email: string; tel: string
}
type PurchaseLine = {
  id?: string; ref: string; designation: string
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  supplier_uid: string | null
}

const JUSTIFICATION_REASONS = [
  'Alignement concurrent (prix imposé par le marché)',
  'Investissement compte stratégique',
  'Pénétration nouveau compte',
  'Accord cadre / prix négocié',
  'Autre',
]

const emptyLine = (): PurchaseLine => ({
  ref: '', designation: '', qty: 1, pu_vente: 0, pt_vente: 0, pu_achat: 0, supplier_uid: null,
})
const newSupplier = (): Supplier => ({
  uid: Math.random().toString(36).slice(2), name: '', contact: '', email: '', tel: '',
})

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)
const pct = (n: number) => `${n.toFixed(1)}%`

// ─── Phone ────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  if (!raw.trim()) return raw
  const d = raw.replace(/[\s\-\(\)\+\.]/g, '')
  let local: string | null = null
  if (/^00212/.test(d))      local = d.slice(5)
  else if (/^212/.test(d))   local = d.slice(3)
  else if (/^0[5-7]/.test(d) && d.length === 10) local = d.slice(1)
  else if (/^[5-7]/.test(d)  && d.length === 9)  local = d
  if (local?.length === 9) return `+212 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`
  return raw
}
function isValidPhone(t: string) {
  if (!t.trim()) return true
  return /^\+212\s[5-7]\d{2}\s\d{3}\s\d{3}$/.test(normalizePhone(t))
}

// ─── Supplier colors ──────────────────────────────────────────
const SUP_COLORS = [
  { bg:'bg-blue-100',    text:'text-blue-700',    border:'border-blue-300',    dot:'bg-blue-500'    },
  { bg:'bg-violet-100',  text:'text-violet-700',  border:'border-violet-300',  dot:'bg-violet-500'  },
  { bg:'bg-emerald-100', text:'text-emerald-700', border:'border-emerald-300', dot:'bg-emerald-500' },
  { bg:'bg-amber-100',   text:'text-amber-700',   border:'border-amber-300',   dot:'bg-amber-500'   },
  { bg:'bg-rose-100',    text:'text-rose-700',    border:'border-rose-300',    dot:'bg-rose-500'    },
  { bg:'bg-cyan-100',    text:'text-cyan-700',    border:'border-cyan-300',    dot:'bg-cyan-500'    },
]
const sc = (i: number) => SUP_COLORS[i % SUP_COLORS.length]

// ─── Page ─────────────────────────────────────────────────────
export default function PurchasePage() {
  const params = useParams()
  const router = useRouter()
  const id     = params?.id as string

  const [deal, setDeal]             = useState<Deal | null>(null)
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [lines, setLines]           = useState<PurchaseLine[]>([emptyLine()])
  const [suppliers, setSuppliers]   = useState<Supplier[]>([newSupplier()])
  const [frais, setFrais]           = useState(0)
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)
  const [justifReason, setJustifReason] = useState(JUSTIFICATION_REASONS[0])
  const [justifText, setJustifText] = useState('')
  const [bcFile, setBcFile]         = useState<File | null>(null)
  const [devisFile, setDevisFile]   = useState<File | null>(null)
  const [autreFiles, setAutreFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState<string | null>(null)
  const [extracted, setExtracted]   = useState(false)
  const [existingFiles, setExistingFiles] = useState<{file_type:string; file_name:string}[]>([])
  const [existingInfo, setExistingInfo]   = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [openDrop, setOpenDrop]     = useState<number | null>(null)
  const [copiedUid, setCopiedUid]   = useState<string | null>(null)

  const bcRef    = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>
  const devisRef = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>
  const autreRef = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    if (id) loadAll()
    const h = () => setOpenDrop(null)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [id])

  async function loadAll() {
    setLoading(true)
    // Load deal
    const { data: d } = await supabase
      .from('opportunities')
      .select('id, title, amount, bu, po_number, vendor, accounts(name)')
      .eq('id', id).single()
    if (d) setDeal({ ...d, accounts: d.accounts as any })

    // Load existing purchase info
    const { data: info } = await supabase
      .from('purchase_info')
      .select('*, purchase_lines(*)')
      .eq('opportunity_id', id)
      .maybeSingle()

    if (info) {
      setExistingInfo(info)
      setFrais(info.frais_engagement || 0)
      setNotes(info.notes || '')
      if (info.justif_reason) setJustifReason(info.justif_reason)
      if (info.justif_text)   setJustifText(info.justif_text)
      if (info.purchase_lines?.length > 0) {
        const sorted = [...info.purchase_lines].sort((a:any,b:any) => a.sort_order - b.sort_order)
        const supMap = new Map<string, Supplier>()
        sorted.forEach((l:any) => {
          if (l.fournisseur && !supMap.has(l.fournisseur)) {
            supMap.set(l.fournisseur, {
              uid: Math.random().toString(36).slice(2),
              name: l.fournisseur||'', contact: l.contact_fournisseur||'',
              email: l.email_fournisseur||'', tel: l.tel_fournisseur||'',
            })
          }
        })
        const rebuilt = Array.from(supMap.values())
        if (rebuilt.length) setSuppliers(rebuilt)
        setLines(sorted.map((l:any) => ({
          id: l.id, ref: l.ref||'', designation: l.designation||'',
          qty: l.qty||1, pu_vente: l.pu_vente||0,
          pt_vente: l.pt_vente||0, pu_achat: l.pu_achat||0,
          supplier_uid: rebuilt.find(s => s.name === l.fournisseur)?.uid || null,
        })))
        setExtracted(true)
      }
    }

    const { data: files } = await supabase
      .from('deal_files').select('file_type, file_name').eq('opportunity_id', id)
    if (files) setExistingFiles(files)

    setLoading(false)
  }

  async function extractDevis() {
    if (!devisFile) return
    setExtracting(true); setExtractErr(null)
    try {
      const base64 = await fileToBase64(devisFile)
      const res = await fetch('/api/extract-devis', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      if (data.lines?.length > 0) {
        setLines(data.lines.map((l:any) => ({
          ref: l.ref||'', designation: l.designation||'',
          qty: Number(l.qty)||1, pu_vente: Number(l.pu_vente)||0,
          pt_vente: Number(l.pt_vente)||0, pu_achat: 0, supplier_uid: null,
        })))
        setExtracted(true)
      } else setExtractErr('Aucune ligne trouvée. Saisis manuellement.')
    } catch(e:any) { setExtractErr(e?.message||'Erreur extraction')
    } finally { setExtracting(false) }
  }

  // ── Totals ────────────────────────────────────────────────
  const totalVente    = lines.reduce((s,l) => s + (Number(l.pt_vente)||Number(l.qty)*Number(l.pu_vente)), 0)
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

  // ── Validation ────────────────────────────────────────────
  const incompleteLines = lines.filter(l => !l.designation.trim() || !Number(l.pu_achat) || !l.supplier_uid)
  const unassignedLines = lines.filter(l => !l.supplier_uid)
  const isComplete      = lines.length > 0 && incompleteLines.length === 0 && totalMatch
  const hasBcClient     = !!bcFile || existingFiles.some(f => f.file_type==='bc_client')
  const hasDevis        = !!devisFile || existingFiles.some(f => f.file_type==='devis_compucom')
  const justifOk        = !margeFaible || justifText.trim().length >= 10
  const phoneOk         = !suppliers.some(s => s.tel && !isValidPhone(s.tel))
  const canSave         = hasBcClient && hasDevis && justifOk && totalMatch && phoneOk

  // ── Supplier helpers ──────────────────────────────────────
  function updateSup(uid:string, field:keyof Supplier, val:string) {
    setSuppliers(prev => prev.map(s => s.uid!==uid ? s : { ...s, [field]: val }))
  }
  function normalizeSup(uid:string) {
    setSuppliers(prev => prev.map(s => s.uid!==uid ? s : { ...s, tel: normalizePhone(s.tel) }))
  }
  function applyToUnassigned(uid:string) {
    setLines(prev => prev.map(l => l.supplier_uid ? l : { ...l, supplier_uid: uid }))
    setCopiedUid(uid); setTimeout(() => setCopiedUid(null), 1800)
  }
  function applyToAll(uid:string) {
    setLines(prev => prev.map(l => ({ ...l, supplier_uid: uid })))
    setCopiedUid(uid); setTimeout(() => setCopiedUid(null), 1800)
  }
  function removeSup(uid:string) {
    setSuppliers(prev => prev.filter(s => s.uid!==uid))
    setLines(prev => prev.map(l => l.supplier_uid===uid ? { ...l, supplier_uid:null } : l))
  }
  const updateLine = (i:number, field:keyof PurchaseLine, val:any) =>
    setLines(prev => prev.map((l,idx) => {
      if (idx!==i) return l
      const u = { ...l, [field]: val }
      if (field==='qty'||field==='pu_vente') u.pt_vente = Number(u.qty)*Number(u.pu_vente)
      return u
    }))

  // ── Save ──────────────────────────────────────────────────
  async function handleSave() {
    setErr(null)
    if (!lines.length)                               { setErr('Ajoute au moins une ligne.'); return }
    if (lines.some(l => !l.designation.trim()))      { setErr('Toutes les lignes doivent avoir une désignation.'); return }
    if (!hasBcClient)                                { setErr('Le BC Client est obligatoire.'); return }
    if (!hasDevis)                                   { setErr('Le Devis Compucom est obligatoire.'); return }
    if (!totalMatch)                                 { setErr(`Total (${mad(totalVente)}) ≠ montant deal (${mad(dealAmount)}). Écart : ${mad(Math.abs(totalDiff))}`); return }
    if (margeFaible && justifText.trim().length < 10){ setErr('Marge < 10% : justification obligatoire.'); return }
    if (!phoneOk)                                    { setErr('Numéro de téléphone invalide.'); return }

    setSaving(true)
    try {
      let infoId = existingInfo?.id
      const payload:any = {
        opportunity_id: id, frais_engagement: frais, notes, filled_by: userEmail,
        ...(margeFaible ? { justif_reason:justifReason, justif_text:justifText, approved_by:null }
                        : { justif_reason:null, justif_text:null }),
      }
      if (!infoId) {
        const { data:d, error:e } = await supabase.from('purchase_info').insert(payload).select('id').single()
        if (e) throw e; infoId = d.id
      } else {
        await supabase.from('purchase_info').update({ ...payload, updated_at:new Date().toISOString() }).eq('id', infoId)
      }
      await supabase.from('purchase_lines').delete().eq('purchase_info_id', infoId)
      const { error:e2 } = await supabase.from('purchase_lines').insert(
        lines.map((l,i) => {
          const sup = suppliers.find(s => s.uid===l.supplier_uid)
          return {
            purchase_info_id:infoId, sort_order:i, ref:l.ref||null,
            designation:l.designation, qty:l.qty, pu_vente:l.pu_vente,
            pt_vente:l.pt_vente||l.qty*l.pu_vente, pu_achat:l.pu_achat,
            fournisseur:sup?.name||null, contact_fournisseur:sup?.contact||null,
            email_fournisseur:sup?.email||null, tel_fournisseur:sup?.tel||null,
          }
        })
      )
      if (e2) throw e2
      await uploadFiles()
      await supabase.from('supply_orders').upsert({
        opportunity_id:id, status:'a_commander', updated_at:new Date().toISOString(),
      }, { onConflict:'opportunity_id', ignoreDuplicates:true })
      await logActivity({
        action_type: !existingInfo?.id ? 'create' : 'update',
        entity_type:'deal', entity_id:id,
        entity_name: deal?.accounts?.name||deal?.title||'',
        detail: isComplete
          ? `Fiche achat complète · ${lines.length} ligne(s) · Marge ${(totalVente>0?margeNette/totalVente*100:0).toFixed(1)}%${margeFaible?' ⚠️ validation Achraf':''}`
          : `Fiche achat ${!existingInfo?.id?'créée':'modifiée'} · ${lines.length} ligne(s)`,
      })
      setSuccess(true)
      setTimeout(() => router.push(`/opportunities/${id}`), 1200)
    } catch(e:any) { setErr(e?.message||'Erreur sauvegarde')
    } finally { setSaving(false) }
  }

  async function uploadFiles() {
    const ups = [
      ...(bcFile    ? [{ file:bcFile,    type:'bc_client'      }] : []),
      ...(devisFile ? [{ file:devisFile, type:'devis_compucom' }] : []),
      ...autreFiles.map(f => ({ file:f, type:'autre' })),
    ]
    for (const u of ups) {
      const path = `${id}/${u.type}/${Date.now()}_${u.file.name}`
      const { data:stored, error } = await supabase.storage.from('deal-files').upload(path, u.file, { upsert:true })
      if (!error && stored) await supabase.from('deal_files').insert({
        opportunity_id:id, file_type:u.type, file_name:u.file.name,
        file_url:stored.path, uploaded_by:userEmail,
      })
    }
  }

  const inp = 'h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-slate-400 transition-colors placeholder:text-slate-300'

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

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/opportunities/${id}`)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Fiche Achat</h1>
            <p className="text-xs text-slate-500">
              {deal.accounts?.name || deal.title} · <span className="font-semibold text-slate-700">{mad(dealAmount)}</span>
              {deal.po_number && <> · PO {deal.po_number}</>}
            </p>
          </div>
          {existingInfo && (
            <span className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Fiche en cours
            </span>
          )}
        </div>

        {success && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" /> Fiche achat sauvegardée — retour au deal…
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}

        {/* ── Documents ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">📄 Documents</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FileZone label="BC Client" required accept=".pdf,.png,.jpg,.jpeg"
              file={bcFile} existingName={!bcFile ? existingFiles.find(f=>f.file_type==='bc_client')?.file_name : undefined}
              onFile={setBcFile} inputRef={bcRef} color="blue" />
            <div>
              <FileZone label="Devis Compucom" required accept=".pdf"
                file={devisFile} existingName={!devisFile ? existingFiles.find(f=>f.file_type==='devis_compucom')?.file_name : undefined}
                onFile={f => { setDevisFile(f); setExtracted(false); setExtractErr(null) }}
                inputRef={devisRef} color="violet" />
              {devisFile && !extracted && (
                <button onClick={extractDevis} disabled={extracting}
                  className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors">
                  {extracting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extraction…</> : '✨ Extraire les lignes'}
                </button>
              )}
              {extracted && <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-violet-700"><CheckCircle2 className="h-3 w-3" />{lines.length} ligne{lines.length>1?'s':''} extraite{lines.length>1?'s':''}</div>}
              {extractErr && <div className="mt-1 text-[10px] text-red-600">{extractErr}</div>}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-600">Autres docs</div>
              <button onClick={() => autreRef.current?.click()}
                className="flex h-16 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400 hover:border-slate-300 hover:bg-slate-100 transition-colors">
                <Upload className="mb-1 h-4 w-4" />
                {autreFiles.length > 0 ? `${autreFiles.length} fichier(s)` : 'Ajouter…'}
              </button>
              <input ref={autreRef} type="file" multiple className="hidden" onChange={e => setAutreFiles(Array.from(e.target.files||[]))} />
              {autreFiles.map((f,i) => (
                <div key={i} className="mt-1 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-600 border border-slate-100">
                  <span className="truncate max-w-[130px]">{f.name}</span>
                  <button onClick={() => setAutreFiles(a => a.filter((_,j) => j!==i))} className="ml-1 text-slate-300 hover:text-red-500"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Lignes produits ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              📋 Lignes produits · {lines.length} article{lines.length>1?'s':''}
            </div>
            <button onClick={() => setLines(l => [...l, emptyLine()])}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Ajouter ligne
            </button>
          </div>

          {/* Progress bar */}
          {dealAmount > 0 && (
            <div className={`mb-4 rounded-xl border px-4 py-3 ${totalMatch?'border-emerald-200 bg-emerald-50':totalVente>dealAmount?'border-red-200 bg-red-50':'border-amber-200 bg-amber-50'}`}>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className={totalMatch?'text-emerald-700':totalVente>dealAmount?'text-red-700':'text-amber-700'}>
                  {totalMatch ? '✓ Total conforme au deal' : totalVente>dealAmount ? '⚠ Total supérieur au deal' : '⚠ Total inférieur au deal'}
                </span>
                <span className={totalMatch?'text-emerald-700':totalVente>dealAmount?'text-red-700':'text-amber-700'}>
                  {mad(totalVente)} / {mad(dealAmount)}
                  {!totalMatch && totalVente>0 && <span className="ml-1.5 font-normal opacity-70">({totalDiff>0?'+':''}{mad(totalDiff)})</span>}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/70">
                <div className={`h-full rounded-full transition-all duration-500 ${totalMatch?'bg-emerald-500':totalVente>dealAmount?'bg-red-400':'bg-amber-400'}`}
                  style={{ width:`${totalPct}%` }} />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth:720 }}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[70px]">Réf</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Désignation <span className="text-red-400">*</span></th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[52px]">Qté</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[90px]">PU Vente</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[84px]">PT Vente</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-amber-500 w-[90px]">PU Achat <span className="text-red-400">*</span></th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[78px]">Marge</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[148px]">Fournisseur</th>
                    <th className="px-3 py-3 w-[32px]" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l,i) => {
                    const ptVente = Number(l.pt_vente)||Number(l.qty)*Number(l.pu_vente)
                    const ptAchat = Number(l.qty)*Number(l.pu_achat)
                    const marge   = ptVente - ptAchat
                    const margePc = ptVente>0 ? (marge/ptVente)*100 : 0
                    const supIdx  = suppliers.findIndex(s => s.uid===l.supplier_uid)
                    const sup     = supIdx>=0 ? suppliers[supIdx] : null
                    const c       = sup ? sc(supIdx) : null
                    return (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <input value={l.ref} onChange={e => updateLine(i,'ref',e.target.value)} placeholder="C1300…" className={inp} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input value={l.designation} onChange={e => updateLine(i,'designation',e.target.value)}
                            placeholder="Description *"
                            className={`${inp} ${!l.designation.trim()?'border-red-300 bg-red-50':''}`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min={1} value={l.qty} onChange={e => updateLine(i,'qty',Number(e.target.value))} className={inp+' text-right'} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min={0} value={l.pu_vente} onChange={e => updateLine(i,'pu_vente',Number(e.target.value))} className={inp+' text-right'} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-slate-700">
                            {ptVente>0 ? (ptVente>=1000 ? `${(ptVente/1000).toFixed(0)}K` : ptVente.toLocaleString('fr')) : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min={0} value={l.pu_achat} onChange={e => updateLine(i,'pu_achat',Number(e.target.value))}
                            className={`${inp} text-right font-semibold bg-amber-50 border-amber-200 focus:border-amber-400`} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {l.pu_achat>0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-bold text-xs ${marge>=0?'text-emerald-700':'text-red-600'}`}>
                                {Math.abs(marge)>=1000?`${(marge/1000).toFixed(0)}K`:marge.toLocaleString('fr')}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 rounded-full ${margePc>=20?'bg-emerald-100 text-emerald-600':margePc>=10?'bg-amber-100 text-amber-600':'bg-red-100 text-red-600'}`}>
                                {margePc.toFixed(1)}%
                              </span>
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Fournisseur dropdown */}
                        <td className="px-3 py-2.5 relative" onMouseDown={e => e.stopPropagation()}>
                          <button type="button" onClick={() => setOpenDrop(openDrop===i?null:i)}
                            className={`flex h-7 w-full items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors
                              ${sup&&c ? `${c.border} ${c.bg} ${c.text}` : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                            {sup&&c && <span className={`h-2 w-2 rounded-full shrink-0 ${c.dot}`} />}
                            <span className="truncate flex-1 text-left">{sup ? sup.name : 'Assigner…'}</span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                          </button>
                          {openDrop===i && (
                            <div className="absolute left-0 top-9 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                              {suppliers.filter(s => s.name.trim()).length===0
                                ? <div className="px-3 py-2 text-[11px] text-slate-400">Aucun fournisseur défini ci-dessous</div>
                                : suppliers.filter(s => s.name.trim()).map(s => {
                                  const si  = suppliers.findIndex(x => x.uid===s.uid)
                                  const col = sc(si)
                                  return (
                                    <button key={s.uid} type="button"
                                      onClick={() => { updateLine(i,'supplier_uid',s.uid); setOpenDrop(null) }}
                                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50 ${l.supplier_uid===s.uid?col.text:'text-slate-700'}`}>
                                      <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
                                      {s.name}
                                      {l.supplier_uid===s.uid && <Check className="ml-auto h-3 w-3" />}
                                    </button>
                                  )
                                })}
                              {l.supplier_uid && (
                                <button type="button" onClick={() => { updateLine(i,'supplier_uid',null); setOpenDrop(null) }}
                                  className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-400 hover:bg-slate-50">
                                  <X className="h-3 w-3" /> Retirer
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setLines(prev => prev.filter((_,j) => j!==i))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {lines.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={4} className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Totaux</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-800">{mad(totalVente)}</td>
                      <td />
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-xs font-bold text-slate-800">{mad(margeBrute)}</div>
                        <span className={`text-[10px] font-bold px-1.5 rounded-full inline-block mt-0.5 ${margePctBrute>=20?'bg-emerald-100 text-emerald-600':margePctBrute>=10?'bg-amber-100 text-amber-600':'bg-red-100 text-red-600'}`}>
                          {pct(margePctBrute)}
                        </span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* ── Fournisseurs ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              🏭 Fournisseurs · {suppliers.filter(s=>s.name.trim()).length} défini{suppliers.filter(s=>s.name.trim()).length>1?'s':''}
            </div>
            <button onClick={() => setSuppliers(s => [...s, newSupplier()])}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Ajouter fournisseur
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s,si) => {
              const c             = sc(si)
              const assignedCount = lines.filter(l => l.supplier_uid===s.uid).length
              const isCopied      = copiedUid===s.uid
              const telInvalid    = s.tel.trim() && !isValidPhone(s.tel)
              const normalized    = normalizePhone(s.tel)
              return (
                <div key={s.uid} className={`rounded-xl border-2 bg-slate-50 p-4 ${c.border}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${c.dot}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${c.text}`}>Fournisseur {si+1}</span>
                      {assignedCount>0 && (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${c.bg} ${c.text}`}>
                          {assignedCount} ligne{assignedCount>1?'s':''}
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeSup(s.uid)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <input value={s.name} onChange={e => updateSup(s.uid,'name',e.target.value)}
                      placeholder="Nom fournisseur *"
                      className={`${inp} font-semibold bg-white ${!s.name.trim()?'border-red-300 bg-red-50':''}`} />
                    <input value={s.contact} onChange={e => updateSup(s.uid,'contact',e.target.value)} placeholder="Nom contact" className={`${inp} bg-white`} />
                    <input type="email" value={s.email} onChange={e => updateSup(s.uid,'email',e.target.value)} placeholder="Email" className={`${inp} bg-white`} />
                    <div>
                      <input value={s.tel} onChange={e => updateSup(s.uid,'tel',e.target.value)}
                        onBlur={() => normalizeSup(s.uid)}
                        placeholder="Tél : 06… / +212… / 00212…"
                        className={`${inp} bg-white ${telInvalid?'border-red-300 bg-red-50':''}`} />
                      {s.tel && !telInvalid && normalized!==s.tel && (
                        <div className="mt-0.5 text-[10px] text-emerald-600 font-medium">→ {normalized}</div>
                      )}
                      {telInvalid && <div className="mt-0.5 text-[10px] text-red-500">Format invalide (ex: +212 6XX XXX XXX)</div>}
                    </div>
                  </div>
                  {s.name.trim() && (
                    <div className="mt-3 flex gap-2">
                      {unassignedLines.length>0 && (
                        <button onClick={() => applyToUnassigned(s.uid)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${c.border} ${c.bg} ${c.text} hover:opacity-80`}>
                          {isCopied ? <><Check className="h-3 w-3" /> Appliqué !</> : <><Copy className="h-3 w-3" />{unassignedLines.length} non assignée{unassignedLines.length>1?'s':''}</>}
                        </button>
                      )}
                      <button onClick={() => applyToAll(s.uid)} title="Assigner à toutes les lignes"
                        className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${c.border} ${c.bg} ${c.text} hover:opacity-80`}>
                        <Users className="h-3 w-3" /> Toutes
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Frais + Récap ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">💼 Frais d'engagement commercial</div>
            <div className="flex items-center gap-3">
              <input type="number" min={0} value={frais} onChange={e => setFrais(Number(e.target.value))} placeholder="0"
                className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400" />
              <span className="text-sm text-slate-500">MAD</span>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Notes internes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Contexte, remarques…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">📊 Récap financier</div>
            <div className="space-y-2.5">
              <Row label="Total vente HT"      value={mad(totalVente)} bold />
              <Row label="Total achat HT"      value={mad(totalAchat)} />
              <Row label="Marge brute"          value={`${mad(margeBrute)} (${pct(margePctBrute)})`} color={margeBrute>=0?'emerald':'red'} />
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Frais d'engagement" value={`− ${mad(frais)}`} color="amber" />
              </div>
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Marge nette" value={`${mad(margeNette)} (${pct(margePctNette)})`}
                  color={margePctNette<10?'red':'emerald'} bold />
              </div>
            </div>
          </div>
        </div>

        {/* ── Justification marge faible ── */}
        {margeFaible && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <div className="mb-3 flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-800">Marge nette &lt; 10% — Justification obligatoire</div>
                <div className="text-xs text-amber-600 mt-0.5">Ce deal sera soumis à validation par <strong>Achraf Lahkim</strong> avant production Supply.</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {JUSTIFICATION_REASONS.map(r => (
                  <button key={r} type="button" onClick={() => setJustifReason(r)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${justifReason===r?'border-amber-500 bg-amber-500 text-white':'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-amber-800">
                  Détail <span className="text-red-500">*</span> <span className="font-normal text-amber-600">(min. 10 caractères)</span>
                </label>
                <textarea value={justifText} onChange={e => setJustifText(e.target.value)} rows={3}
                  placeholder="Ex : Client stratégique, remise accordée pour signature avant fin trimestre…"
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none resize-none transition-colors ${justifText.trim().length>=10?'border-amber-300 bg-white':'border-red-300 bg-red-50'}`} />
                <div className="mt-1 flex justify-between">
                  <span className={`text-[10px] ${justifText.trim().length>=10?'text-amber-600':'text-red-500'}`}>{justifText.trim().length} / 10 min.</span>
                  <span className="flex items-center gap-1 text-[10px] text-amber-600"><ShieldCheck className="h-3 w-3" /> Validation Achraf requise</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
          {(!hasBcClient || !hasDevis) && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> Documents manquants :
              {!hasBcClient && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5">BC Client</span>}
              {!hasDevis    && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5">Devis Compucom</span>}
            </div>
          )}
          {hasBcClient && hasDevis && !totalMatch && totalVente>0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Total lignes ({mad(totalVente)}) ≠ montant deal ({mad(dealAmount)}) — écart : {mad(Math.abs(totalDiff))}
            </div>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Fiche complète — total conforme, tous les fournisseurs assignés ✓
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => router.push(`/opportunities/${id}`)}
              className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || success || !canSave}
              className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white transition-colors sm:flex-none sm:min-w-[240px] disabled:opacity-60
                ${!canSave?'bg-slate-300 cursor-not-allowed':margeFaible?'bg-amber-600 hover:bg-amber-700':'bg-slate-900 hover:bg-slate-800'}`}>
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde…</>
                : margeFaible
                  ? <><ShieldCheck className="h-4 w-4" /> Enregistrer (Validation Achraf)</>
                  : <><Save className="h-4 w-4" /> {isComplete?'Enregistrer (Complet ✓)':'Enregistrer (Partiel)'}</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────
function FileZone({ label, accept, file, existingName, onFile, inputRef, color, required }: {
  label:string; accept:string; file:File|null; existingName?:string
  onFile:(f:File)=>void; inputRef:React.MutableRefObject<HTMLInputElement>
  color:'blue'|'violet'|'slate'; required?:boolean
}) {
  const c = {
    blue:   { border:'border-blue-200',   bg:'bg-blue-50',   text:'text-blue-700'   },
    violet: { border:'border-violet-200', bg:'bg-violet-50', text:'text-violet-700' },
    slate:  { border:'border-slate-200',  bg:'bg-slate-50',  text:'text-slate-600'  },
  }[color]
  const name = file?.name || existingName
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {required && <span className="text-[10px] font-bold text-red-500">*</span>}
        {name && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border transition-colors
          ${name ? `${c.border} ${c.bg}` : required ? 'border-dashed border-red-300 bg-red-50 hover:bg-red-100' : 'border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
        {name
          ? <><FileText className={`h-4 w-4 ${c.text}`} /><span className={`text-[10px] font-semibold ${c.text} max-w-[130px] truncate px-1`}>{name}</span></>
          : <><Upload className={`h-4 w-4 ${required?'text-red-400':'text-slate-400'}`} /><span className={`text-[10px] font-semibold ${required?'text-red-500':'text-slate-400'}`}>{required?'Obligatoire':'Sélectionner…'}</span></>}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) onFile(f) }} />
    </div>
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

function fileToBase64(file:File): Promise<string> {
  return new Promise((resolve,reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
