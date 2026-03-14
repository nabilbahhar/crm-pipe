'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import {
  ArrowLeft, Upload, Loader2, Plus, Trash2, Save, Download,
  FileText, AlertCircle, CheckCircle2, AlertTriangle,
  ShieldCheck, X, RefreshCw, Package,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Deal = {
  id: string; title: string; amount: number
  accounts?: { name?: string } | null
  bu?: string | null; po_number?: string | null
}
type Fournisseur = { id: string; name: string; contact?: string; email?: string; tel?: string }
type SupplierContact = {
  id: string; supplier_id: string; contact_name: string
  email?: string; tel?: string; role?: string; brands?: string
}
type PurchaseLine = {
  id?: string; ref: string; designation: string
  qty: number; pu_vente: number; pt_vente: number; pu_achat: number
  fournisseur_id: string | null; fournisseur?: string
  contact_fournisseur?: string; email_fournisseur?: string; tel_fournisseur?: string
  warranty_months?: number; license_months?: number
  warranty_expiry?: string; license_expiry?: string
  selected_contact_ids?: string[]
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
  ref: '', designation: '', qty: 1, pu_vente: 0, pt_vente: 0, pu_achat: 0,
  fournisseur_id: null, contact_fournisseur: '', email_fournisseur: '', tel_fournisseur: '',
  warranty_months: 0, license_months: 0,
  warranty_expiry: '', license_expiry: '',
  selected_contact_ids: [],
})

// ─── Format Excel : 57.500,00 MAD ────────────────────────────
const numFmt = (n: number | null | undefined) => {
  if (n == null) return '—'
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

// ─── Render bold markdown ─────────────────────────────────────
function renderDesignation(text: string) {
  if (!text) return ''
  // Convert **text** to <strong>text</strong>, \n to <br/>
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\\n/g, '<br/>').replace(/\n/g, '<br/>')
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
  const [paymentTerms, setPaymentTerms] = useState('')
  const [paymentTermsCustom, setPaymentTermsCustom] = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState<string | null>(null)
  const [extracted, setExtracted]   = useState(false)
  const [existingInfo, setExistingInfo] = useState<any>(null)
  const [draftAge, setDraftAge]         = useState<string | null>(null)
  const [editingIdx, setEditingIdx]     = useState<number | null>(null)
  const [viewMode, setViewMode]         = useState<'cards' | 'table' | 'devis'>('cards')

  // Files
  const [bcFile, setBcFile]         = useState<File | null>(null)
  const [devisFile, setDevisFile]   = useState<File | null>(null)
  const [autreFiles, setAutreFiles] = useState<File[]>([])
  const [dbFiles, setDbFiles]       = useState<DBFile[]>([])

  // Supplier contacts (multi-contacts par fournisseur)
  const [supplierContacts, setSupplierContacts] = useState<SupplierContact[]>([])

  // New fournisseur modal
  const [showFournModal, setShowFournModal] = useState(false)
  const [newFourn, setNewFourn] = useState({ name:'', contact:'', email:'', tel:'' })
  const [addingFourn, setAddingFourn] = useState(false)
  const [fournErr, setFournErr] = useState<string | null>(null)

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
    const [dealRes, fournsRes, contactsRes] = await Promise.all([
      supabase.from('opportunities')
        .select('id, title, amount, bu, po_number, accounts(name)')
        .eq('id', id).single(),
      supabase.from('suppliers')
        .select('id, name, contact, email, tel')
        .order('name'),
      supabase.from('supplier_contacts')
        .select('id, supplier_id, contact_name, email, tel, role, brands')
        .order('contact_name'),
    ])
    if (dealRes.data) {
      setDeal({ ...dealRes.data, accounts: dealRes.data.accounts as any })
      document.title = `Achat · ${dealRes.data.title} · CRM-PIPE`
    }
    if (fournsRes.data) setFourns(fournsRes.data)
    if (contactsRes && !contactsRes.error && contactsRes.data) {
      setSupplierContacts(contactsRes.data as SupplierContact[])
    }

    // Existing purchase info
    const { data: info } = await supabase
      .from('purchase_info').select('*, purchase_lines(*)')
      .eq('opportunity_id', id).maybeSingle()

    // Existing files — via server route (service role → bypasses RLS)
    try {
      const filesRes = await authFetch(`/api/upload?opportunity_id=${id}`)
      if (filesRes.ok) {
        const { files } = await filesRes.json()
        if (files) setDbFiles(files)
      }
    } catch { /* silent */ }

    if (info) {
      setExistingInfo(info)
      setFrais(info.frais_engagement || 0)
      setNotes(info.notes || '')
      if (info.payment_terms) {
        const known = ['a_la_livraison','30j','60j','90j']
        if (known.includes(info.payment_terms)) { setPaymentTerms(info.payment_terms) }
        else { setPaymentTerms('autre'); setPaymentTermsCustom(info.payment_terms) }
      }
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
          contact_fournisseur: l.contact_fournisseur || '',
          email_fournisseur: l.email_fournisseur || '',
          tel_fournisseur: l.tel_fournisseur || '',
          warranty_months: l.warranty_months || 0,
          license_months: l.license_months || 0,
          warranty_expiry: l.warranty_expiry || '',
          license_expiry: l.license_expiry || '',
          selected_contact_ids: l.selected_contact_ids ? (typeof l.selected_contact_ids === 'string' ? JSON.parse(l.selected_contact_ids) : l.selected_contact_ids) : [],
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
      const res = await authFetch('/api/extract-devis', {
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
    setFournErr(null)
    const tel = newFourn.tel ? normalizePhone(newFourn.tel) : ''
    const { data, error } = await supabase.from('suppliers')
      .insert({ ...newFourn, tel, created_by: userEmail })
      .select('id, name, contact, email, tel').single()
    if (error) {
      setFournErr(error.message || 'Erreur lors de la création')
      setAddingFourn(false)
      return
    }
    if (data) {
      setFourns(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewFourn({ name:'', contact:'', email:'', tel:'' })
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
  const canSave     = hasBcClient && hasDevis && totalMatch

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

    // "Enregistrer" (partial) : sauvegarde sans validation stricte
    // "Placer commande" (!partial) : validations strictes
    if (!partial) {
      if (validLines.length === 0) {
        setErr('Ajoute au moins une ligne avec une désignation.'); return
      }
      if (!hasBcClient) { setErr('BC Client est obligatoire pour finaliser.'); return }
      if (!hasDevis)    { setErr('Devis Compucom est obligatoire pour finaliser.'); return }
      if (!totalMatch)  { setErr(`Total (${mad(totalVente)}) ≠ montant deal (${mad(dealAmount)}). Écart : ${mad(Math.abs(totalDiff))}`); return }
      // Validate each line: designation, qty, pu_vente, supplier are mandatory
      const lineErrors: string[] = []
      validLines.forEach((l, idx) => {
        const n = idx + 1
        if (!l.designation.trim()) lineErrors.push(`Ligne ${n} : désignation manquante`)
        if (!l.qty || l.qty <= 0) lineErrors.push(`Ligne ${n} : quantité invalide`)
        if (!l.pu_vente || l.pu_vente <= 0) lineErrors.push(`Ligne ${n} : PU vente manquant`)
        if (!l.fournisseur_id) lineErrors.push(`Ligne ${n} : fournisseur non sélectionné`)
      })
      if (lineErrors.length > 0) {
        setErr(`Champs obligatoires manquants :\n${lineErrors.join(' · ')}`)
        return
      }
    }

    setSaving(true)
    try {
      let infoId = existingInfo?.id
      const ptValue = paymentTerms === 'autre' ? paymentTermsCustom : paymentTerms
      const payload: any = {
        opportunity_id: id, frais_engagement: frais, notes,
        filled_by: userEmail, updated_at: new Date().toISOString(),
        payment_terms: ptValue || null,
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
            fournisseur: fourn?.name || l.fournisseur || null,
            fournisseur_id: l.fournisseur_id || null,
            contact_fournisseur: l.contact_fournisseur || fourn?.contact || null,
            email_fournisseur: l.email_fournisseur || fourn?.email || null,
            tel_fournisseur: l.tel_fournisseur || fourn?.tel || null,
            warranty_months: l.warranty_months || null,
            license_months: l.license_months || null,
            warranty_expiry: l.warranty_expiry || null,
            license_expiry: l.license_expiry || null,
            selected_contact_ids: l.selected_contact_ids?.length ? JSON.stringify(l.selected_contact_ids) : null,
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
      await uploadFileNow(u.file as File, u.type as 'bc_client' | 'devis_compucom' | 'autre')
    }
  }

  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [uploadError, setUploadError]     = useState<string | null>(null)

  // Upload immédiat via server-side route (bypasse RLS) → persistance après refresh
  async function uploadFileNow(file: File, type: 'bc_client' | 'devis_compucom' | 'autre') {
    setUploadingFile(type)
    setUploadError(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const email = authData?.user?.email || userEmail || 'unknown'

      const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')
      const path = `${id}/${type}/${Date.now()}_${safeName}`

      // Supprimer l'ancien fichier du même type (sauf 'autre')
      if (type !== 'autre') {
        const old = dbFiles.find(f => f.file_type === type)
        if (old?.file_url) {
          await authFetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: [old.file_url], fileIds: [old.id] }) })
          setDbFiles(p => p.filter(f => f.file_type !== type))
        }
      }

      // Upload via server route (service role key → no RLS issues on storage + deal_files)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)
      formData.append('bucket', 'deal-files')
      formData.append('opportunity_id', id as string)
      formData.append('file_type', type)
      formData.append('uploaded_by', email)

      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok || result.error) {
        setUploadError(`Erreur upload : ${result.error || 'Upload échoué'}`)
        setUploadingFile(null)
        return
      }

      // Mettre à jour dbFiles depuis la réponse serveur (pas de re-query anon key)
      if (result.dbRecord) {
        setDbFiles(prev => [...prev.filter(f => !(type !== 'autre' && f.file_type === type)), result.dbRecord])
      }
    } catch (e: any) {
      setUploadError(`Erreur inattendue : ${e?.message || 'inconnue'}`)
    }
    setUploadingFile(null)
  }

  async function deleteDbFile(fileId: string, fileUrl: string) {
    try {
      await authFetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: [fileUrl], fileIds: [fileId] }) })
      setDbFiles(p => p.filter(f => f.id !== fileId))
    } catch (e: any) {
      setErr(`Erreur suppression : ${e?.message}`)
    }
  }

  const inp = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-50 transition placeholder:text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

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
        {uploadError && (
          <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
            <div><strong>Erreur upload :</strong> {uploadError}
              <div className="mt-1 text-xs text-orange-600">Vérifie que le bucket <code>deal-files</code> existe dans Supabase Storage et que les politiques RLS autorisent INSERT.</div>
            </div>
          </div>
        )}

        {/* ── Documents ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <SecTitle>📄 Documents</SecTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">

            {/* BC Client */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-600">BC Client</span>
                <span className="text-xs font-bold text-red-500">*</span>
                {dbFiles.some(f=>f.file_type==='bc_client') && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              </div>
              {dbFiles.filter(f=>f.file_type==='bc_client').map(f => (
                <div key={f.id} className="mb-2 flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="flex-1 text-xs font-semibold text-blue-700 truncate">{f.file_name}</span>
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" download title="Télécharger"
                    className="flex h-5 w-5 items-center justify-center rounded text-blue-400 hover:text-blue-700 transition">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => deleteDbFile(f.id!, f.file_url!)} title="Supprimer"
                    className="flex h-5 w-5 items-center justify-center rounded text-blue-300 hover:text-red-500 transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => bcRef.current?.click()} disabled={uploadingFile==='bc_client'}
                className={`relative flex h-[60px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition
                  ${dbFiles.some(f=>f.file_type==='bc_client') ? 'border-blue-100 bg-white text-blue-400 hover:bg-blue-50' : 'border-dashed border-red-300 bg-red-50 hover:bg-red-100'}`}>
                {uploadingFile==='bc_client'
                  ? <><Loader2 className="h-4 w-4 animate-spin text-blue-500" /><span className="text-xs text-blue-500">Upload…</span></>
                  : <><Upload className={`h-4 w-4 ${dbFiles.some(f=>f.file_type==='bc_client')?'text-blue-300':'text-red-400'}`} />
                     <span className={`text-xs font-semibold ${dbFiles.some(f=>f.file_type==='bc_client')?'text-blue-300':'text-red-500'}`}>
                       {dbFiles.some(f=>f.file_type==='bc_client') ? 'Remplacer' : 'Obligatoire'}
                     </span></>}
              </button>
              <input ref={bcRef} type="file" accept=".pdf,.png,.jpg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFileNow(f, 'bc_client') }} />
            </div>

            {/* Devis Compucom */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-600">Devis Compucom</span>
                <span className="text-xs font-bold text-red-500">*</span>
                {dbFiles.some(f=>f.file_type==='devis_compucom') && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              </div>
              {dbFiles.filter(f=>f.file_type==='devis_compucom').map(f => (
                <div key={f.id} className="mb-2 flex items-center gap-2 rounded-xl border-2 border-violet-200 bg-violet-50/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-violet-600 shrink-0" />
                  <span className="flex-1 text-xs font-semibold text-violet-700 truncate">{f.file_name}</span>
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" download title="Télécharger"
                    className="flex h-5 w-5 items-center justify-center rounded text-violet-400 hover:text-violet-700 transition">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => deleteDbFile(f.id!, f.file_url!)} title="Supprimer"
                    className="flex h-5 w-5 items-center justify-center rounded text-violet-300 hover:text-red-500 transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => devisRef.current?.click()} disabled={uploadingFile==='devis_compucom'}
                className={`relative flex h-[60px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition
                  ${dbFiles.some(f=>f.file_type==='devis_compucom') ? 'border-violet-100 bg-white text-violet-400 hover:bg-violet-50' : 'border-dashed border-red-300 bg-red-50 hover:bg-red-100'}`}>
                {uploadingFile==='devis_compucom'
                  ? <><Loader2 className="h-4 w-4 animate-spin text-violet-500" /><span className="text-xs text-violet-500">Upload…</span></>
                  : <><Upload className={`h-4 w-4 ${dbFiles.some(f=>f.file_type==='devis_compucom')?'text-violet-300':'text-red-400'}`} />
                     <span className={`text-xs font-semibold ${dbFiles.some(f=>f.file_type==='devis_compucom')?'text-violet-300':'text-red-500'}`}>
                       {dbFiles.some(f=>f.file_type==='devis_compucom') ? 'Remplacer' : 'Obligatoire'}
                     </span></>}
              </button>
              <input ref={devisRef} type="file" accept=".pdf" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { setDevisFile(f); setExtracted(false); setExtractErr(null); uploadFileNow(f, 'devis_compucom') }
                }} />
              {(devisFile || dbFiles.some(f => f.file_type === 'devis_compucom')) && !extracted && (
                <button onClick={extractDevis} disabled={extracting || !devisFile}
                  title={!devisFile ? 'Re-sélectionne le PDF pour extraire (le fichier est en DB mais pas en mémoire)' : ''}
                  className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60 transition">
                  {extracting ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraction…</> : '✨ Extraire les lignes'}
                </button>
              )}
              {!devisFile && dbFiles.some(f => f.file_type === 'devis_compucom') && !extracted && (
                <p className="mt-1.5 text-xs text-slate-400 text-center">Re-sélectionne le PDF Devis pour activer l'extraction IA</p>
              )}
              {extracted && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><CheckCircle2 className="h-4 w-4" />{lines.length} ligne{lines.length>1?'s':''} extraite{lines.length>1?'s':''}</p>}
              {extractErr && <p className="mt-2 text-sm text-red-600">{extractErr}</p>}
            </div>

            {/* Autres docs */}
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-600">Autres docs</p>
              {dbFiles.filter(f=>f.file_type==='autre').map(f => (
                <div key={f.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="flex-1 truncate text-xs text-slate-600">{f.file_name}</span>
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" download title="Télécharger"
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-700 transition">
                    <Download className="h-3 w-3" />
                  </a>
                  <button onClick={() => deleteDbFile(f.id!, f.file_url!)} title="Supprimer"
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:text-red-500 transition">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => autreRef.current?.click()} disabled={!!uploadingFile}
                className="flex h-[60px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 transition">
                {uploadingFile==='autre'
                  ? <><Loader2 className="h-4 w-4 animate-spin text-slate-400" /><span className="text-xs text-slate-400">Upload…</span></>
                  : <><Upload className="h-4 w-4 text-slate-400" /><span className="text-xs font-medium text-slate-400">Ajouter…</span></>}
              </button>
              <input ref={autreRef} type="file" multiple className="hidden"
                onChange={async e => {
                  const files = Array.from(e.target.files||[])
                  for (const f of files) await uploadFileNow(f, 'autre')
                }} />
            </div>
          </div>
        </div>

        {/* ── Table lignes ── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <SecTitle>📋 Lignes produits · {lines.length} article{lines.length>1?'s':''}</SecTitle>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
              {([['cards','Cartes'],['table','Tableau'],['devis','Devis Pro']] as const).map(([k,label]) => (
                <button key={k} onClick={() => setViewMode(k)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${viewMode===k?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
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

          {viewMode === 'cards' && (<>
          {/* ── Product Line Cards ── */}
          <div className="space-y-3">
            {lines.map((l, i) => {
              const ptVente = Number(l.pt_vente) || Number(l.qty)*Number(l.pu_vente)
              const ptAchat = Number(l.qty)*Number(l.pu_achat)
              const marge   = ptVente - ptAchat
              const margePc = ptVente > 0 ? (marge/ptVente)*100 : 0
              return (
                <div key={i} className="group rounded-xl border border-slate-200 bg-white overflow-hidden transition-shadow hover:shadow-md">
                  {/* Card Header */}
                  <div className="flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 border-b border-slate-100">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white shrink-0">{i+1}</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input value={l.ref} onChange={e => updateLine(i,'ref',e.target.value)}
                        placeholder="Réf…"
                        className="h-8 w-[140px] shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono font-semibold text-slate-700 outline-none focus:border-slate-400 placeholder:text-slate-300 transition" />
                      {l.designation.trim() && (
                        <span className="text-xs text-slate-400 truncate hidden sm:block">{l.designation.slice(0, 60)}{l.designation.length > 60 ? '…' : ''}</span>
                      )}
                    </div>
                    {ptVente > 0 && <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">{numFmt(ptVente)}</span>}
                    <button onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Designation — formatted display / edit on click */}
                  <div className="px-4 pt-3 pb-2">
                    {editingIdx === i ? (
                      <textarea value={l.designation}
                        autoFocus spellCheck={false}
                        onChange={e => { updateLine(i,'designation',e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                        onFocus={e => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                        onBlur={() => setEditingIdx(null)}
                        placeholder="Description du produit *"
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none resize-none overflow-hidden transition focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        style={{ minHeight: 80 }} />
                    ) : (
                      <div onClick={() => setEditingIdx(i)}
                        className={`w-full min-h-[40px] rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed cursor-text transition hover:border-slate-300
                          ${!l.designation.trim()
                            ? 'border-red-200 bg-red-50/40 text-red-300 italic'
                            : 'border-slate-200 bg-slate-50/30 text-slate-700'}`}>
                        {l.designation.trim()
                          ? <div dangerouslySetInnerHTML={{ __html: renderDesignation(l.designation) }} />
                          : 'Cliquer pour saisir la désignation…'}
                      </div>
                    )}
                  </div>

                  {/* Numbers grid — 6 columns */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2 px-4 pb-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Qté</label>
                      <input type="number" min={1} value={Number(l.qty)||1} onChange={e => updateLine(i,'qty',Number(e.target.value)||1)}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-right font-semibold outline-none focus:border-slate-400 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">PU Vente</label>
                      <input type="number" min={0} value={l.pu_vente||''} onChange={e => updateLine(i,'pu_vente',Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-right outline-none focus:border-slate-400 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">PT Vente</label>
                      <div className="flex h-9 items-center justify-end rounded-lg bg-slate-100 px-2.5 text-sm font-bold text-slate-800">
                        {ptVente > 0 ? numFmt(ptVente) : <span className="text-slate-300 font-normal">—</span>}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-500">PU Achat ★</label>
                      <input type="number" min={0} value={l.pu_achat||''} onChange={e => updateLine(i,'pu_achat',Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-sm text-right font-bold outline-none focus:border-amber-400 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">PT Achat</label>
                      <div className="flex h-9 items-center justify-end rounded-lg bg-slate-100 px-2.5 text-sm font-bold text-slate-800">
                        {ptAchat > 0 ? numFmt(ptAchat) : <span className="text-slate-300 font-normal">—</span>}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Marge</label>
                      <div className="flex h-9 items-center justify-center">
                        {l.pu_achat > 0 && ptVente > 0 ? (
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${margePc>=20?'bg-emerald-100 text-emerald-700':margePc>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>
                            {pct(margePc)}
                          </span>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </div>
                    </div>
                  </div>

                  {/* Fournisseur & Détails (collapsible) */}
                  <div className="border-t border-slate-100">
                    <details className="group/det" {...(l.fournisseur_id ? { open: true } : {})}>
                      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition select-none list-none [&::-webkit-details-marker]:hidden">
                        <span className="text-[10px] transition-transform group-open/det:rotate-90">▶</span>
                        Fournisseur & Détails
                        {l.fournisseur_id && <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{fourns.find(f=>f.id===l.fournisseur_id)?.name}</span>}
                      </summary>
                      <div className="px-4 pb-4 pt-1 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Fournisseur</label>
                            <div className="flex gap-1.5">
                              <select value={l.fournisseur_id||''} onChange={e => {
                                const fid = e.target.value || null
                                setLines(prev => prev.map((ln, idx) => idx !== i ? ln : {
                                  ...ln, fournisseur_id: fid, selected_contact_ids: [],
                                  contact_fournisseur: '', email_fournisseur: '', tel_fournisseur: '',
                                }))
                              }}
                                className={`h-9 flex-1 rounded-lg border px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-slate-100
                                  ${l.fournisseur_id?'border-slate-300 bg-white text-slate-700 font-medium':'border-slate-200 bg-slate-50 text-slate-400'}`}>
                                <option value="">Choisir…</option>
                                <option value="__stock__">📦 Notre Stock</option>
                                {fourns.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                              </select>
                              <button onClick={() => setShowFournModal(true)} title="Nouveau fournisseur"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Fin garantie</label>
                            <input type="month" value={l.warranty_expiry||''} onChange={e => updateLine(i,'warranty_expiry',e.target.value)}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-slate-400 transition" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Fin licence</label>
                            <input type="month" value={l.license_expiry||''} onChange={e => updateLine(i,'license_expiry',e.target.value)}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-slate-400 transition" />
                          </div>
                        </div>
                        {/* Contacts fournisseur */}
                        {l.fournisseur_id && (() => {
                          const contacts = supplierContacts.filter(c => c.supplier_id === l.fournisseur_id)
                          const fourn = fourns.find(f => f.id === l.fournisseur_id)
                          const options: { id: string; label: string; contact: string; email: string; tel: string }[] = []
                          if (fourn?.contact) options.push({ id: `main_${fourn.id}`, label: `${fourn.contact} (principal)`, contact: fourn.contact, email: fourn.email || '', tel: fourn.tel || '' })
                          contacts.forEach(c => options.push({ id: c.id, label: `${c.contact_name}${c.brands ? ` · ${c.brands}` : ''}`, contact: c.contact_name, email: c.email || '', tel: c.tel || '' }))
                          const selectedIds = l.selected_contact_ids || []
                          const toggleContact = (optId: string) => {
                            setLines(prev => prev.map((ln, idx) => {
                              if (idx !== i) return ln
                              const curIds = ln.selected_contact_ids || []
                              const isSelected = curIds.includes(optId)
                              const newIds = isSelected ? curIds.filter((sid: string) => sid !== optId) : [...curIds, optId]
                              const contactNames = newIds.map(sid => options.find(o => o.id === sid)?.contact).filter(Boolean).join(', ')
                              const emails = newIds.map(sid => options.find(o => o.id === sid)?.email).filter(Boolean).join(', ')
                              const tels = newIds.map(sid => options.find(o => o.id === sid)?.tel).filter(Boolean).join(', ')
                              return { ...ln, selected_contact_ids: newIds, contact_fournisseur: contactNames, email_fournisseur: emails, tel_fournisseur: tels }
                            }))
                          }
                          return (
                            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 space-y-2">
                              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                                <span>👤</span> Contacts fournisseur {selectedIds.length > 0 && <span className="ml-1 rounded-full bg-blue-500 text-white px-1.5 text-[9px]">{selectedIds.length}</span>}
                              </div>
                              {options.length >= 1 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {options.map(opt => {
                                    const checked = selectedIds.includes(opt.id)
                                    return (
                                      <label key={opt.id}
                                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer transition text-xs
                                          ${checked ? 'bg-blue-100 border border-blue-300 shadow-sm' : 'bg-white border border-blue-100 hover:bg-blue-50'}`}>
                                        <input type="checkbox" checked={checked} onChange={() => toggleContact(opt.id)}
                                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 accent-blue-600" />
                                        <div className="min-w-0">
                                          <div className="font-semibold text-slate-700">{opt.label}</div>
                                          {(opt.email || opt.tel) && (
                                            <div className="text-[10px] text-slate-400 truncate">{opt.email}{opt.email && opt.tel ? ' · ' : ''}{opt.tel}</div>
                                          )}
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              ) : (
                                <input value={l.contact_fournisseur||''} onChange={e => updateLine(i,'contact_fournisseur',e.target.value)}
                                  placeholder="Nom du contact…"
                                  className="h-8 w-full rounded-lg border border-blue-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400 transition" />
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </details>
                  </div>
                </div>
              )
            })}
          </div>
          </>)}

          {/* ═══ VIEW: TABLEAU COMPACT (Proposal A) ═══ */}
          {viewMode === 'table' && (<>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[60px_100px_1fr_65px_100px_110px_40px] bg-slate-50 border-b border-slate-200 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>#</span><span>Réf</span><span>Désignation</span><span className="text-right">Qté</span><span className="text-right">PU/HT</span><span className="text-right">PT/HT</span><span></span>
            </div>
            {/* Rows */}
            {lines.map((l, i) => {
              const ptVente = Number(l.pt_vente) || Number(l.qty)*Number(l.pu_vente)
              const ptAchat = Number(l.qty)*Number(l.pu_achat)
              const marge = ptVente - ptAchat
              const margePc = ptVente > 0 ? (marge/ptVente)*100 : 0
              const isOpen = editingIdx === i
              return (
                <div key={i} className={`border-b border-slate-100 last:border-0 ${isOpen?'bg-blue-50/30':i%2===0?'bg-white':'bg-slate-50/50'}`}>
                  {/* Main row — click to expand */}
                  <div onClick={() => setEditingIdx(isOpen ? null : i)}
                    className="grid grid-cols-[60px_100px_1fr_65px_100px_110px_40px] items-center px-3 py-3 cursor-pointer hover:bg-slate-50 transition group">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white">{i+1}</span>
                    <span className="text-xs font-mono text-slate-500 truncate">{l.ref || '—'}</span>
                    <div className="pr-3 min-w-0">
                      {l.designation.trim() ? (
                        <div className="text-sm text-slate-800 line-clamp-2" dangerouslySetInnerHTML={{ __html: renderDesignation(l.designation) }} />
                      ) : (
                        <span className="text-xs text-red-300 italic">Saisir désignation…</span>
                      )}
                    </div>
                    <span className="text-sm text-right font-semibold text-slate-700">{l.qty}</span>
                    <span className="text-sm text-right text-slate-600">{l.pu_vente ? numFmt(l.pu_vente) : '—'}</span>
                    <span className="text-sm text-right font-bold text-slate-800">{ptVente > 0 ? numFmt(ptVente) : '—'}</span>
                    <span className={`text-[10px] transition-transform ${isOpen?'rotate-180':''}`}>▾</span>
                  </div>
                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-3 pb-4 pt-1 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-1">
                      {/* Designation edit */}
                      <div className="grid grid-cols-[100px_1fr] gap-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Réf</label>
                          <input value={l.ref} onChange={e => updateLine(i,'ref',e.target.value)} spellCheck={false}
                            placeholder="Réf…" className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono outline-none focus:border-slate-400" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Désignation</label>
                          <textarea value={l.designation} spellCheck={false}
                            onChange={e => { updateLine(i,'designation',e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                            onFocus={e => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none resize-none overflow-hidden focus:border-slate-400"
                            style={{ minHeight: 60 }} />
                        </div>
                      </div>
                      {/* Numbers + Fournisseur */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Qté</label>
                          <input type="number" min={1} value={Number(l.qty)||1} onChange={e => updateLine(i,'qty',Number(e.target.value)||1)} spellCheck={false}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-right font-semibold outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">PU Vente</label>
                          <input type="number" min={0} value={l.pu_vente||''} onChange={e => updateLine(i,'pu_vente',Number(e.target.value))}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-right outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-amber-500">PU Achat ★</label>
                          <input type="number" min={0} value={l.pu_achat||''} onChange={e => updateLine(i,'pu_achat',Number(e.target.value))}
                            className="h-8 w-full rounded-lg border border-amber-200 bg-amber-50 px-2 text-sm text-right font-bold outline-none focus:border-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">PT Achat</label>
                          <div className="flex h-8 items-center justify-end rounded-lg bg-slate-100 px-2 text-sm font-bold">{ptAchat > 0 ? numFmt(ptAchat) : '—'}</div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Marge</label>
                          <div className="flex h-8 items-center justify-center">
                            {l.pu_achat > 0 && ptVente > 0 ? (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${margePc>=20?'bg-emerald-100 text-emerald-700':margePc>=10?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{pct(margePc)}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </div>
                        </div>
                      </div>
                      {/* Fournisseur row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Fournisseur</label>
                          <div className="flex gap-1.5">
                            <select value={l.fournisseur_id||''} onChange={e => {
                              const fid = e.target.value || null
                              setLines(prev => prev.map((ln, idx) => idx !== i ? ln : { ...ln, fournisseur_id: fid, selected_contact_ids: [], contact_fournisseur: '', email_fournisseur: '', tel_fournisseur: '' }))
                            }}
                              className={`h-8 flex-1 rounded-lg border px-2 text-xs outline-none ${l.fournisseur_id?'border-slate-300 bg-white font-medium':'border-slate-200 bg-slate-50 text-slate-400'}`}>
                              <option value="">Choisir…</option>
                              <option value="__stock__">📦 Notre Stock</option>
                              {fourns.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <button onClick={() => setShowFournModal(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-slate-600"><Plus className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Fin garantie</label>
                          <input type="month" value={l.warranty_expiry||''} onChange={e => updateLine(i,'warranty_expiry',e.target.value)}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Fin licence</label>
                          <input type="month" value={l.license_expiry||''} onChange={e => updateLine(i,'license_expiry',e.target.value)}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">
                          <Trash2 className="h-3 w-3" /> Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </>)}

          {/* ═══ VIEW: DEVIS PRO (VF) ═══ */}
          {viewMode === 'devis' && (<>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {/* Devis header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-sm tracking-tight">Fiche Achat</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">{deal?.accounts?.name} · {deal?.title}</p>
              </div>
              <div className="text-right">
                <span className="text-white text-lg font-bold tracking-tight">{mad(dealAmount)}</span>
                <p className="text-slate-500 text-[10px] mt-0.5">{lines.filter(l=>l.designation.trim()).length} article{lines.filter(l=>l.designation.trim()).length>1?'s':''}</p>
              </div>
            </div>
            {/* Column header */}
            <div className="grid grid-cols-[44px_1fr_70px_105px_115px] bg-slate-50/80 border-b border-slate-200 px-5 py-2.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
              <span>N°</span><span>Désignation</span><span className="text-right">Qté</span><span className="text-right">PU HT</span><span className="text-right">PT HT</span>
            </div>
            {/* Lines */}
            <div className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const ptVente = Number(l.pt_vente) || Number(l.qty)*Number(l.pu_vente)
                const ptAchat = Number(l.qty)*Number(l.pu_achat)
                const marge = ptVente - ptAchat
                const margePc = ptVente > 0 ? (marge/ptVente)*100 : 0
                const isOpen = editingIdx === i
                const fournName = l.fournisseur_id === '__stock__' ? 'Notre Stock' : l.fournisseur_id ? fourns.find(f=>f.id===l.fournisseur_id)?.name : null
                const isStock = l.fournisseur_id === '__stock__'
                const lineComplete = !!(l.designation.trim() && l.qty > 0 && l.pu_vente > 0 && l.pu_achat > 0 && l.fournisseur_id && (isStock || l.contact_fournisseur))
                return (
                  <div key={i}>
                    {isOpen ? (
                      /* ═══ EDIT MODE ═══ */
                      <div className="border-l-[3px] border-slate-400 bg-white">
                        {/* Compact header */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${lineComplete ? 'bg-emerald-500' : 'bg-slate-700'}`}>{i+1}</span>
                          <input value={l.ref} onChange={e => updateLine(i,'ref',e.target.value)} spellCheck={false}
                            placeholder="Réf…" className="h-6 w-20 rounded border-0 border-b border-b-slate-300 bg-transparent px-1 text-[10px] font-mono text-slate-500 outline-none focus:border-b-slate-500" />
                          <div className="flex-1" />
                          {ptVente > 0 && <span className="text-[12px] font-semibold text-slate-600">{numFmt(ptVente)} MAD</span>}
                          {l.pu_achat > 0 && ptVente > 0 && (
                            <span className={`rounded-full px-2 py-px text-[10px] font-bold ${margePc>=20?'bg-emerald-100 text-emerald-700':margePc>=10?'bg-slate-100 text-slate-600':'bg-red-100 text-red-700'}`}>{pct(margePc)}</span>
                          )}
                          <button onClick={() => setEditingIdx(null)}
                            className="flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 transition">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </button>
                        </div>

                        <div className="px-3 py-2 space-y-2">
                          {/* Designation */}
                          <textarea value={l.designation} spellCheck={false} autoFocus
                            onChange={e => { updateLine(i,'designation',e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                            onFocus={e => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
                            rows={2} placeholder="Description du produit…"
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] leading-[1.6] text-slate-700 outline-none resize-none overflow-hidden focus:border-slate-400 focus:ring-1 focus:ring-slate-200 placeholder:text-slate-300"
                            style={{ minHeight: 48 }} />

                          {/* Prix — une seule ligne */}
                          <div className="grid grid-cols-6 gap-1.5">
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Qté</label>
                              <input type="number" min={1} value={Number(l.qty)||1} onChange={e => updateLine(i,'qty',Number(e.target.value)||1)}
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-right font-bold text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">PU Vente</label>
                              <input type="number" min={0} value={l.pu_vente||''} onChange={e => updateLine(i,'pu_vente',Number(e.target.value))}
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-right text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">PT Vente</label>
                              <div className="flex h-7 items-center justify-end rounded-md bg-slate-50 px-2 text-[12px] font-bold text-slate-700">{ptVente > 0 ? numFmt(ptVente) : '—'}</div>
                            </div>
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-500">PU Achat</label>
                              <input type="number" min={0} value={l.pu_achat||''} onChange={e => updateLine(i,'pu_achat',Number(e.target.value))}
                                className="h-7 w-full rounded-md border border-slate-300 bg-slate-50 px-2 text-[12px] text-right font-bold text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-500">PT Achat</label>
                              <div className="flex h-7 items-center justify-end rounded-md bg-slate-50 px-2 text-[12px] font-bold text-slate-600">{ptAchat > 0 ? numFmt(ptAchat) : '—'}</div>
                            </div>
                            <div>
                              <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Marge</label>
                              <div className="flex h-7 items-center justify-center rounded-md bg-slate-50">
                                {l.pu_achat > 0 && ptVente > 0 ? (
                                  <span className={`rounded-full px-2 py-px text-[10px] font-bold ${margePc>=20?'bg-emerald-100 text-emerald-700':margePc>=10?'bg-slate-200 text-slate-600':'bg-red-100 text-red-700'}`}>{pct(margePc)}</span>
                                ) : <span className="text-slate-300 text-[10px]">—</span>}
                              </div>
                            </div>
                          </div>

                          {/* Fournisseur + Contact + dates */}
                          {(() => {
                            const scContacts = l.fournisseur_id ? supplierContacts.filter(c => c.supplier_id === l.fournisseur_id) : []
                            const fourn = l.fournisseur_id ? fourns.find(f => f.id === l.fournisseur_id) : null
                            const contactOptions: { id: string; label: string; contact: string; email: string; tel: string }[] = []
                            /* Contacts individuels depuis supplier_contacts */
                            scContacts.forEach(c => contactOptions.push({ id: c.id, label: `${c.contact_name}${c.role ? ` (${c.role})` : ''}${c.brands ? ` · ${c.brands}` : ''}`, contact: c.contact_name, email: c.email || '', tel: c.tel || '' }))
                            /* Fallback: split fourn.contact par virgule si pas de supplier_contacts */
                            if (contactOptions.length === 0 && fourn?.contact) {
                              const names = fourn.contact.split(',').map(n => n.trim()).filter(Boolean)
                              names.forEach((name, ci) => contactOptions.push({ id: `main_${fourn.id}_${ci}`, label: name, contact: name, email: ci === 0 ? (fourn.email || '') : '', tel: ci === 0 ? (fourn.tel || '') : '' }))
                            }
                            const selectedIds = l.selected_contact_ids || []
                            const toggleContact = (optId: string) => {
                              setLines(prev => prev.map((ln, idx) => {
                                if (idx !== i) return ln
                                const curIds = ln.selected_contact_ids || []
                                const isSelected = curIds.includes(optId)
                                const newIds = isSelected ? curIds.filter((sid: string) => sid !== optId) : [...curIds, optId]
                                const contactNames = newIds.map(sid => contactOptions.find(o => o.id === sid)?.contact).filter(Boolean).join(', ')
                                const emails = newIds.map(sid => contactOptions.find(o => o.id === sid)?.email).filter(Boolean).join(', ')
                                const tels = newIds.map(sid => contactOptions.find(o => o.id === sid)?.tel).filter(Boolean).join(', ')
                                return { ...ln, selected_contact_ids: newIds, contact_fournisseur: contactNames, email_fournisseur: emails, tel_fournisseur: tels }
                              }))
                            }
                            return (
                              <>
                                {/* Row: Fournisseur + Dates */}
                                <div className="grid grid-cols-[1fr_auto_110px_110px] gap-1.5 items-end">
                                  <div>
                                    <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Fournisseur</label>
                                    <div className="flex gap-1">
                                      <select value={l.fournisseur_id||''} onChange={e => {
                                        const fid = e.target.value || null
                                        setLines(prev => prev.map((ln, idx) => idx !== i ? ln : { ...ln, fournisseur_id: fid, selected_contact_ids: [], contact_fournisseur: '', email_fournisseur: '', tel_fournisseur: '' }))
                                      }}
                                        className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] outline-none focus:border-slate-400 font-medium text-slate-700">
                                        <option value="">Choisir…</option>
                                        <option value="__stock__">📦 Notre Stock</option>
                                        {fourns.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                      </select>
                                      <button onClick={() => setShowFournModal(true)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition"><Plus className="h-3 w-3" /></button>
                                    </div>
                                  </div>
                                  <div />
                                  <div>
                                    <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Garantie</label>
                                    <select value={l.warranty_expiry||''} onChange={e => updateLine(i,'warranty_expiry',e.target.value)}
                                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] outline-none focus:border-slate-400 text-slate-600">
                                      <option value="">—</option>
                                      {Array.from({length: 60}, (_, m) => { const d = new Date(); d.setMonth(d.getMonth()+m); const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return <option key={v} value={v}>{d.toLocaleDateString('fr-FR',{month:'short',year:'numeric'})}</option> })}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Licence</label>
                                    <select value={l.license_expiry||''} onChange={e => updateLine(i,'license_expiry',e.target.value)}
                                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] outline-none focus:border-slate-400 text-slate-600">
                                      <option value="">—</option>
                                      {Array.from({length: 60}, (_, m) => { const d = new Date(); d.setMonth(d.getMonth()+m); const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return <option key={v} value={v}>{d.toLocaleDateString('fr-FR',{month:'short',year:'numeric'})}</option> })}
                                    </select>
                                  </div>
                                </div>
                                {/* Contacts — chips individuels avec email/tel (pas pour stock) */}
                                {l.fournisseur_id && l.fournisseur_id !== '__stock__' && contactOptions.length > 0 && (
                                  <div>
                                    <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Contact {selectedIds.length > 0 && <span className="text-emerald-500">({selectedIds.length})</span>}</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {contactOptions.map(opt => {
                                        const checked = selectedIds.includes(opt.id)
                                        return (
                                          <button key={opt.id} type="button" onClick={() => toggleContact(opt.id)}
                                            className={`rounded-lg px-2.5 py-1.5 text-left transition border
                                              ${checked ? 'bg-slate-700 text-white border-slate-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}>
                                            <div className="text-[11px] font-semibold">{opt.contact}{checked && ' ✓'}</div>
                                            {opt.email && <div className={`text-[9px] ${checked ? 'text-slate-300' : 'text-slate-400'}`}>{opt.email}</div>}
                                            {opt.tel && <div className={`text-[9px] ${checked ? 'text-slate-300' : 'text-slate-400'}`}>{opt.tel}</div>}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* Contact manual — quand fournisseur choisi (pas stock) mais aucun contact en base */}
                                {l.fournisseur_id && l.fournisseur_id !== '__stock__' && contactOptions.length === 0 && (
                                  <div>
                                    <label className="mb-px block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Contact</label>
                                    <input value={l.contact_fournisseur||''} onChange={e => updateLine(i,'contact_fournisseur',e.target.value)}
                                      placeholder="Nom du contact…" className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] outline-none focus:border-slate-400" />
                                  </div>
                                )}
                              </>
                            )
                          })()}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-1">
                            <button onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                              className="flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-600 transition">
                              <Trash2 className="h-3 w-3" /> Supprimer
                            </button>
                            <button onClick={() => setEditingIdx(null)}
                              className="flex items-center gap-1 rounded-md bg-slate-700 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 transition">
                              <CheckCircle2 className="h-3 w-3" /> Terminé
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ═══ READ MODE ═══ */
                      <div onClick={() => setEditingIdx(i)}
                        className={`grid grid-cols-[44px_1fr_70px_105px_115px] items-start px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition group ${i%2===1?'bg-slate-50/40':''}`}>
                        {/* # */}
                        <div className="pt-0.5">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition ${lineComplete ? 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-500 group-hover:text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-800 group-hover:text-white'}`}>{i+1}</span>
                          {l.ref && <p className="mt-1 text-[10px] font-mono text-slate-400">{l.ref}</p>}
                        </div>
                        {/* Designation */}
                        <div className="pr-4 min-w-0">
                          {l.designation.trim() ? (
                            <div className="text-[12.5px] text-slate-700 leading-[1.65]" dangerouslySetInnerHTML={{ __html: renderDesignation(l.designation) }} />
                          ) : (
                            <span className="text-xs text-red-300 italic">Cliquer pour saisir la désignation…</span>
                          )}
                          {(fournName || (l.pu_achat > 0 && ptVente > 0)) && (
                            <div className="flex items-center gap-2 mt-2">
                              {fournName && <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${isStock ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{isStock ? '📦 Notre Stock' : fournName}</span>}
                              {l.pu_achat > 0 && ptVente > 0 && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${margePc>=20?'bg-emerald-50 text-emerald-600':margePc>=10?'bg-amber-50 text-amber-600':'bg-red-50 text-red-600'}`}>Marge {pct(margePc)}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Qté */}
                        <span className="text-right text-[13px] font-semibold text-slate-700 pt-0.5">{l.qty}</span>
                        {/* PU */}
                        <span className="text-right text-[13px] text-slate-600 pt-0.5">{l.pu_vente ? numFmt(l.pu_vente) : '—'}</span>
                        {/* PT */}
                        <span className="text-right text-[13px] font-bold text-slate-800 pt-0.5">{ptVente > 0 ? numFmt(ptVente) : '—'}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Devis footer */}
              {(() => {
                const activeLines = lines.filter(l => l.designation.trim())
                const completeLines = lines.filter(l => !!(l.designation.trim() && l.qty > 0 && l.pu_vente > 0 && l.pu_achat > 0 && l.fournisseur_id && (l.fournisseur_id === '__stock__' || l.contact_fournisseur)))
                const allComplete = activeLines.length > 0 && completeLines.length === activeLines.length
                return (
            <div className="border-t-2 border-slate-800 bg-slate-900">
              <div className="grid grid-cols-[44px_1fr_70px_105px_115px] px-5 py-3.5 items-center">
                <span></span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">Total HT</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${allComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                    {completeLines.length}/{activeLines.length} {allComplete ? '✓' : 'lignes'}
                  </span>
                </div>
                <span className="text-right text-xs text-slate-500">{activeLines.length} art.</span>
                <span></span>
                <span className="text-right text-base font-black text-white">{numFmt(totalVente)}</span>
              </div>
              {totalAchat > 0 && (
                <div className="px-5 pb-3.5 flex justify-end gap-6 items-center">
                  <span className="text-xs text-slate-500">Achat: <strong className="text-slate-400">{numFmt(totalAchat)}</strong></span>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${margePctBrute>=20?'bg-emerald-500/20 text-emerald-400':margePctBrute>=10?'bg-slate-600 text-slate-300':'bg-red-500/20 text-red-400'}`}>Marge {pct(margePctBrute)}</span>
                </div>
              )}
            </div>)
              })()}
          </div>
          </>)}


          {/* Totals bar (hidden for devis view which has its own footer) */}
          {viewMode !== 'devis' && lines.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-3.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Totaux · {lines.filter(l=>l.designation.trim()).length} ligne{lines.filter(l=>l.designation.trim()).length>1?'s':''}</span>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div><span className="text-slate-500 text-[10px] uppercase tracking-wide mr-1.5">Vente</span><span className="text-sm font-bold text-white">{mad(totalVente)}</span></div>
                <div><span className="text-slate-500 text-[10px] uppercase tracking-wide mr-1.5">Achat</span><span className="text-sm font-bold text-white">{totalAchat>0?mad(totalAchat):'—'}</span></div>
                {totalAchat > 0 && (
                  <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${margePctBrute>=20?'bg-emerald-500/20 text-emerald-400':margePctBrute>=10?'bg-amber-500/20 text-amber-400':'bg-red-500/20 text-red-400'}`}>
                    Marge {pct(margePctBrute)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Ajouter une ligne */}
          <button onClick={() => setLines(l => [...l, emptyLine()])}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <Plus className="h-4 w-4" /> Ajouter une ligne
          </button>


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
            {/* Payment Terms */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Modalités de paiement</label>
              <div className="flex items-center gap-2">
                <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                  className={`${inp} max-w-[200px] appearance-none`}>
                  <option value="">— Choisir —</option>
                  <option value="a_la_livraison">À la livraison</option>
                  <option value="30j">30 jours</option>
                  <option value="60j">60 jours</option>
                  <option value="90j">90 jours</option>
                  <option value="autre">Autre</option>
                </select>
                {paymentTerms === 'autre' && (
                  <input value={paymentTermsCustom} onChange={e => setPaymentTermsCustom(e.target.value)}
                    placeholder="Préciser…" className={`${inp} max-w-[200px]`} />
                )}
              </div>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} spellCheck={false}
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

        {/* ── Justif marge (informatif — ne bloque PAS la commande) ── */}
        {margeFaible && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800">Marge nette &lt; 10% — Justification recommandée</p>
                <p className="text-sm text-amber-600 mt-0.5">Supply se chargera de la validation <strong>Achraf</strong>. Tu peux placer la commande normalement.</p>
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
            <textarea value={justifText} onChange={e => setJustifText(e.target.value)} rows={3} spellCheck={false}
              placeholder="Ex : Client stratégique, remise accordée pour signature avant fin trimestre…"
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${justifText.trim().length>=10?'border-amber-300 bg-white':'border-red-300 bg-red-50'}`} />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-amber-600">{justifText.trim().length} car.</span>
              <span className="flex items-center gap-1.5 text-sm text-amber-600"><ShieldCheck className="h-4 w-4" /> Supply gère la validation Achraf</span>
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

            {/* Partial save (Enregistrer) — always available, no strict validation */}
            <button onClick={() => handleSave(true)} disabled={saving || success}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40">
              <Save className="h-4 w-4" /> Enregistrer
            </button>

            {/* Full save = "Placer la commande" — toujours disponible si BC + Devis + totalMatch */}
            <button onClick={() => handleSave(false)} disabled={saving || success || !canSave}
              className={`flex flex-1 sm:flex-none sm:min-w-[260px] h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50
                ${!canSave?'bg-slate-300 cursor-not-allowed':'bg-slate-900 hover:bg-slate-800 shadow-slate-200 shadow-lg'}`}>
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde…</>
                : <><Package className="h-4 w-4" /> Placer la commande</>}
            </button>
          </div>
        </div>

      </div>

      {/* ── Modal nouveau fournisseur ── */}
      {showFournModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="presentation" onKeyDown={e => { if (e.key === 'Escape') setShowFournModal(false) }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Nouveau fournisseur">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h2 className="text-base font-bold text-slate-900">🏭 Nouveau fournisseur</h2>
              <button onClick={() => setShowFournModal(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { f:'name',    l:'Nom *',     p:'Dell, HP, Lenovo…' },
                { f:'contact', l:'Contact *', p:'Nom du commercial' },
                { f:'email',   l:'Email *',   p:'contact@fournisseur.com' },
                { f:'tel',     l:'Tél *',     p:'06XXXXXXXX / +212…' },
              ].map(({ f, l, p }) => (
                <div key={f}>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-600">{l}</label>
                  <input value={(newFourn as any)[f]} onChange={e => setNewFourn(prev => ({ ...prev, [f]: e.target.value }))}
                    placeholder={p} className={`${inp} ${!(newFourn as any)[f]?.trim() ? 'border-red-200 bg-red-50/30' : ''}`} />
                </div>
              ))}
              <p className="text-xs text-slate-400">Tous les champs sont obligatoires. Détails complets dans <strong>Supply → Fournisseurs</strong>.</p>
              {fournErr && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {fournErr}</p>}
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => { setShowFournModal(false); setFournErr(null) }} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Annuler</button>
              <button onClick={addFournisseur} disabled={addingFourn || !newFourn.name.trim() || !newFourn.contact.trim() || !newFourn.email.trim() || !newFourn.tel.trim()}
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


//  a
