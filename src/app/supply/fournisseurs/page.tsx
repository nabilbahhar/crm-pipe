'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { mad } from '@/lib/utils'
import Link from 'next/link'
import {
  Plus, Search, Edit2, Trash2, X, Save, Loader2, Download,
  Phone, Mail, Users, ChevronUp, ChevronDown, ChevronsUpDown,
  RefreshCw, ExternalLink, Star, Building2, BarChart2, TrendingUp,
  ShoppingCart, Layers, Clock, Eye,
  MapPin,
} from 'lucide-react'
import Toast from '@/components/Toast'

// ─── Types ────────────────────────────────────────────────────
type Supplier = {
  id: string; name: string; contact: string | null; email: string | null
  tel: string | null; address: string | null; category: string | null
  notes: string | null; created_at: string; created_by: string | null
}
type SupplierStats = {
  supplier_name: string; total_orders: number; total_lines: number
  total_achat_ht: number; total_vente_ht: number
  last_order_date: string | null; nb_clients: number; avg_marge_pct: number | null
}
type SupplierContact = {
  id: string; supplier_id: string; contact_name: string
  email: string | null; tel: string | null; role: string | null
  brands: string | null; is_primary: boolean
}
type SupplierRow = Supplier & Partial<SupplierStats>

const CATEGORIES = [
  'Distributeur IT', 'VAD Cybersécurité', 'Distributeur Réseau',
  'Distributeur Apple', 'Distributeur Audiovisuel', 'Grossiste local',
  'Matériel IT', 'Logiciels', 'Réseau & Infra', 'Périphériques',
  'Fournisseur SSL/Téléphonie', 'Services', 'Autre',
]

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Distributeur IT':       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100' },
  'VAD Cybersécurité':     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-100' },
  'Distributeur Réseau':   { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-100' },
  'Distributeur Apple':    { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
  'Logiciels':             { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-100' },
  'Réseau & Infra':        { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-100' },
  'Services':              { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  'Grossiste local':       { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
}

function CatBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-xs text-slate-300">—</span>
  const c = CAT_COLORS[cat] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.text.replace('text-', 'bg-')}`} />{cat}
    </span>
  )
}

function MargeBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-xs text-slate-300">--</span>
  const v = Number(pct)
  const cls = v >= 20 ? 'bg-emerald-100 text-emerald-700' : v >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{v.toFixed(1)}%</span>
}

// ─── Modal Edition ────────────────────────────────────────────
function SupplierModal({
  supplier, onClose, onSaved, userEmail,
}: {
  supplier: Partial<Supplier> | null
  onClose: () => void; onSaved: () => void; userEmail: string | null
}) {
  const [form, setForm] = useState({
    name: supplier?.name || '', contact: supplier?.contact || '',
    email: supplier?.email || '', tel: supplier?.tel || '',
    address: supplier?.address || '', category: supplier?.category || '',
    notes: supplier?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inp = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors'

  async function handleSave() {
    if (!form.name.trim()) { setErr('Le nom est obligatoire.'); return }
    setSaving(true); setErr(null)
    try {
      const payload = { ...form, name: form.name.trim() }
      if (supplier?.id) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', supplier.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, created_by: userEmail })
        if (error) throw error
      }
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Erreur sauvegarde')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="text-lg">{supplier?.id ? '✏️' : '🏭'}</span>
            <div>
              <div className="text-sm font-bold text-white">{supplier?.id ? 'Modifier' : 'Nouveau'} fournisseur</div>
              {supplier?.id && <div className="text-xs text-slate-300">{supplier.name}</div>}
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Nom fournisseur <span className="text-red-400">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dell Technologies, HP, Cisco…" className={inp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Contact principal</label>
              <input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Nom du contact" className={inp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Catégorie</label>
              <input list="cat-list" value={form.category} onChange={e => set('category', e.target.value)} placeholder="Ex: Distributeur IT" className={inp} />
              <datalist id="cat-list">
                {CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@fournisseur.com" className={inp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Téléphone</label>
              <input value={form.tel} onChange={e => set('tel', e.target.value)} placeholder="+212 6XX XXX XXX" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Adresse</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Casablanca, Maroc…" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Délais livraison, conditions tarifaires…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-colors" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          <button onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors shadow-sm">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sauvegarde…</> : <><Save className="h-3.5 w-3.5" />Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contacts Modal ──────────────────────────────────────────
function SupplierContactsModal({
  supplier, onClose, onCountChange,
}: {
  supplier: Supplier
  onClose: () => void
  onCountChange: () => void
}) {
  const [contacts, setContacts]  = useState<SupplierContact[]>([])
  const [loading, setLoading]    = useState(true)
  const [err, setErr]            = useState<string | null>(null)
  const [form, setForm]          = useState({ contact_name: '', email: '', tel: '', role: '', brands: '', is_primary: false })
  const inp = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors'

  async function loadContacts() {
    setLoading(true)
    const { data, error } = await supabase.from('supplier_contacts')
      .select('*').eq('supplier_id', supplier.id)
      .order('is_primary', { ascending: false }).order('contact_name')
    if (error) setErr(error.message)
    else setContacts((data || []) as SupplierContact[])
    setLoading(false)
  }
  useEffect(() => { loadContacts() }, [supplier.id])

  async function addContact(e: React.FormEvent) {
    e.preventDefault()
    if (!form.contact_name.trim()) return
    setLoading(true); setErr(null)
    try {
      if (form.is_primary) {
        await supabase.from('supplier_contacts').update({ is_primary: false }).eq('supplier_id', supplier.id)
      }
      const { error } = await supabase.from('supplier_contacts').insert({
        supplier_id: supplier.id,
        contact_name: form.contact_name.trim(),
        email: form.email.trim() || null,
        tel: form.tel.trim() || null,
        role: form.role.trim() || null,
        brands: form.brands.trim() || null,
        is_primary: form.is_primary,
      })
      if (error) throw error
      setForm({ contact_name: '', email: '', tel: '', role: '', brands: '', is_primary: false })
      await loadContacts()
      onCountChange()
    } catch (e: any) { setErr(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }

  async function setPrimary(id: string) {
    setLoading(true)
    await supabase.from('supplier_contacts').update({ is_primary: false }).eq('supplier_id', supplier.id)
    await supabase.from('supplier_contacts').update({ is_primary: true }).eq('id', id)
    await loadContacts()
    setLoading(false)
  }

  async function deleteContact(id: string) {
    if (!confirm('Supprimer ce contact ?')) return
    setLoading(true)
    await supabase.from('supplier_contacts').delete().eq('id', id)
    await loadContacts()
    onCountChange()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-white" />
            <div>
              <div className="text-sm font-bold text-white">Contacts — {supplier.name}</div>
              <div className="text-xs text-blue-100">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</div>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}

          {/* Add contact form */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="mb-3 text-xs font-bold text-blue-700 uppercase tracking-wide">Ajouter un contact</div>
            <form onSubmit={addContact} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder="Nom du contact *" className={inp} />
              <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Rôle (commercial, technique…)" className={inp} />
              <input value={form.brands} onChange={e => setForm(f => ({ ...f, brands: e.target.value }))}
                placeholder="Marques (Fortinet, Dell…)" className={inp} />
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email" className={inp} />
              <input value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))}
                placeholder="Téléphone" className={inp} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.is_primary}
                    onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} />
                  Principal
                </label>
                <button type="submit" disabled={loading || !form.contact_name.trim()}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                </button>
              </div>
            </form>
          </div>

          {/* Contacts list */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
              <span className="text-3xl mb-2 block">👥</span>
              <p className="text-sm text-slate-500">Aucun contact pour ce fournisseur</p>
              <p className="text-xs text-slate-400 mt-1">Ajoutez des contacts ci-dessus</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Contact</th>
                    <th className="px-4 py-2.5 text-left">Rôle / Marques</th>
                    <th className="px-4 py-2.5 text-left">Coordonnées</th>
                    <th className="px-4 py-2.5 text-left">Statut</th>
                    <th className="px-4 py-2.5 w-[100px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-900 text-xs">{c.contact_name}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs text-slate-600">{c.role || '—'}</div>
                        {c.brands && <div className="text-[10px] text-slate-400 mt-0.5">{c.brands}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                              <Mail className="h-2.5 w-2.5" />{c.email}
                            </a>
                          )}
                          {c.tel && (
                            <a href={`tel:${c.tel}`} className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline">
                              <Phone className="h-2.5 w-2.5" />{c.tel}
                            </a>
                          )}
                          {!c.email && !c.tel && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {c.is_primary ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Principal
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {!c.is_primary && (
                            <button onClick={() => setPrimary(c.id)}
                              className="inline-flex h-6 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors"
                              title="Définir comme principal">
                              <Star className="h-2.5 w-2.5" />
                            </button>
                          )}
                          <button onClick={() => deleteContact(c.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Supplier Detail Panel (fiche) ──────────────────────────────
function SupplierDetail({
  supplier, onClose, onEdit, onContacts,
}: {
  supplier: SupplierRow
  onClose: () => void
  onEdit: () => void
  onContacts: () => void
}) {
  const hasOrders = Number(supplier.total_orders) > 0
  const marge = Number(supplier.avg_marge_pct || 0)

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden sticky top-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-white">
              {supplier.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-bold text-white">{supplier.name}</div>
              {supplier.address && <div className="flex items-center gap-1 text-xs text-slate-300 mt-0.5"><MapPin className="h-3 w-3" />{supplier.address}</div>}
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <CatBadge cat={supplier.category} />
          {supplier.created_at && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />Créé le {new Date(supplier.created_at).toLocaleDateString('fr-MA')}
            </span>
          )}
        </div>
      </div>

      {/* Contact info */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Contact principal</div>
        <div className="text-sm font-semibold text-slate-900">{supplier.contact || '—'}</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {supplier.email && (
            <a href={`mailto:${supplier.email}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors">
              <Mail className="h-3 w-3" />{supplier.email}
            </a>
          )}
          {supplier.tel && (
            <a href={`tel:${supplier.tel}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors">
              <Phone className="h-3 w-3" />{supplier.tel}
            </a>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Statistiques</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[10px] font-semibold text-slate-400 uppercase">Commandes</div>
            <div className="text-xl font-black text-slate-900">{supplier.total_orders || 0}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[10px] font-semibold text-slate-400 uppercase">Lignes</div>
            <div className="text-xl font-black text-slate-900">{supplier.total_lines || 0}</div>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <div className="text-[10px] font-semibold text-blue-500 uppercase">Volume achat</div>
            <div className="text-lg font-black text-blue-800">{mad(supplier.total_achat_ht || 0)}</div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-[10px] font-semibold text-emerald-500 uppercase">Volume vente</div>
            <div className="text-lg font-black text-emerald-800">{mad(supplier.total_vente_ht || 0)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[10px] font-semibold text-slate-400 uppercase">Marge moy.</div>
            <div className="flex items-center gap-2 mt-0.5">
              <MargeBadge pct={supplier.avg_marge_pct} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[10px] font-semibold text-slate-400 uppercase">Clients servis</div>
            <div className="text-xl font-black text-slate-900">{supplier.nb_clients || 0}</div>
          </div>
        </div>
        {supplier.last_order_date && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3 w-3" />Dernière commande : <span className="font-semibold">{new Date(supplier.last_order_date).toLocaleDateString('fr-MA')}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {supplier.notes && (
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Notes</div>
          <div className="text-xs text-slate-600 leading-relaxed">{supplier.notes}</div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-4 flex flex-col gap-2">
        {hasOrders && (
          <Link href={`/supply?vendor=${encodeURIComponent(supplier.name)}`}
            className="flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-sm">
            <ExternalLink className="h-3.5 w-3.5" /> Voir commandes
          </Link>
        )}
        <div className="flex gap-2">
          <button onClick={onContacts}
            className="flex-1 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
            <Users className="h-3.5 w-3.5" /> Contacts
          </button>
          <button onClick={onEdit}
            className="flex-1 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <Edit2 className="h-3.5 w-3.5" /> Modifier
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
type SortKey = 'name' | 'total_orders' | 'total_achat_ht'

export default function SuppliersPage() {
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [stats, setStats]           = useState<SupplierStats[]>([])
  const [loading, setLoading]       = useState(true)
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [modal, setModal]           = useState<Partial<Supplier> | null | false>(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('total_achat_ht')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [contactsModal, setContactsModal] = useState<Supplier | null>(null)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [info, setInfo]             = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    document.title = 'Fournisseurs · CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null))
    loadAll()
  }, [])

  function toast(msg: string, ok = true) { setInfo({ msg, ok }) }

  async function loadAll() {
    setLoading(true)
    const [{ data: sups }, { data: statsData }, contactsRes] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('supplier_stats').select('*'),
      supabase.from('supplier_contacts').select('supplier_id'),
    ])
    setSuppliers(sups || [])
    setStats(statsData || [])
    if (contactsRes && !contactsRes.error && contactsRes.data) {
      const counts: Record<string, number> = {}
      for (const c of contactsRes.data) {
        counts[c.supplier_id] = (counts[c.supplier_id] || 0) + 1
      }
      setContactCounts(counts)
    }
    setLoading(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer le fournisseur "${name}" ?`)) return
    setDeleting(id)
    await supabase.from('suppliers').delete().eq('id', id)
    if (selectedId === id) setSelectedId(null)
    setDeleting(null)
    toast(`${name} supprimé`)
    loadAll()
  }

  // Merge suppliers + stats
  const rows: SupplierRow[] = useMemo(() => suppliers.map(s => ({
    ...s,
    ...(stats.find(st => st.supplier_name?.toLowerCase() === s.name?.toLowerCase()) || {}),
  })), [suppliers, stats])

  // KPIs
  const totalSuppliers = rows.length
  const totalAchat     = stats.reduce((s, r) => s + (Number(r.total_achat_ht) || 0), 0)
  const totalVente     = stats.reduce((s, r) => s + (Number(r.total_vente_ht) || 0), 0)
  const totalOrders    = stats.reduce((s, r) => s + (Number(r.total_orders)    || 0), 0)
  const avgMarge       = stats.filter(r => r.avg_marge_pct != null).length > 0
    ? stats.filter(r => r.avg_marge_pct != null).reduce((s, r) => s + (Number(r.avg_marge_pct) || 0), 0) / stats.filter(r => r.avg_marge_pct != null).length
    : 0

  // Category breakdown for chart
  const catBreakdown = useMemo(() => {
    const map = new Map<string, { cat: string; achat: number; count: number }>()
    rows.forEach(r => {
      const cat = r.category || 'Non catégorisé'
      const prev = map.get(cat) || { cat, achat: 0, count: 0 }
      prev.achat += Number(r.total_achat_ht || 0)
      prev.count++
      map.set(cat, prev)
    })
    return [...map.values()].sort((a, b) => b.achat - a.achat).slice(0, 6)
  }, [rows])

  // Filter
  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
  }), [rows, search])

  // Sort
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av: any = a[sortKey as keyof SupplierRow], bv: any = b[sortKey as keyof SupplierRow]
    if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
    if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? av - bv : bv - av
  }), [filtered, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 text-slate-300" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-blue-600" /> : <ChevronDown className="h-3 w-3 text-blue-600" />
  }

  const selectedRow = selectedId ? sorted.find(s => s.id === selectedId) || null : null

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAchat = sorted.reduce((s,x) => s+(x.total_achat_ht||0), 0)
      const totalVente = sorted.reduce((s,x) => s+(x.total_vente_ht||0), 0)
      const totalOrders = sorted.reduce((s,x) => s+(x.total_orders||0), 0)
      const avgMarge = sorted.length > 0 ? sorted.reduce((s,x) => s+(x.avg_marge_pct||0), 0) / sorted.length : 0

      const catMap = new Map<string, { count: number; achat: number }>()
      sorted.forEach(s => {
        const cat = s.category || 'Non catégorisé'
        const prev = catMap.get(cat) || { count: 0, achat: 0 }
        catMap.set(cat, { count: prev.count + 1, achat: prev.achat + (s.total_achat_ht||0) })
      })

      const spec = {
        filename: `fournisseurs_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Fournisseurs',
          title: `Fournisseurs · ${sorted.length} · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Nom','Contact','Email','Téléphone','Catégorie','Commandes','Lignes','Achat HT (MAD)','Vente HT (MAD)','Marge %','Clients'],
          rows: sorted.map(s => [
            s.name, s.contact||'—', s.email||'—', s.tel||'—', s.category||'—',
            s.total_orders||0, s.total_lines||0,
            s.total_achat_ht||0, s.total_vente_ht||0,
            s.avg_marge_pct!=null ? Number(s.avg_marge_pct.toFixed(1)) : 0,
            s.nb_clients||0,
          ]),
          totalsRow: ['TOTAL', `${sorted.length}`, '', '', '', totalOrders, sorted.reduce((s,x)=>s+(x.total_lines||0),0), totalAchat, totalVente, '', ''],
        }],
        summary: {
          title: `Résumé Fournisseurs · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Total fournisseurs', value: sorted.length, detail: `${totalOrders} commandes au total` },
            { label: 'Total achat HT', value: totalAchat, detail: 'Montant total des achats' },
            { label: 'Total vente HT', value: totalVente, detail: 'Montant total des ventes' },
            { label: 'Marge moyenne', value: `${avgMarge.toFixed(1)}%`, detail: 'Marge brute moyenne' },
          ],
          breakdownTitle: 'Répartition par catégorie',
          breakdownHeaders: ['Catégorie', 'Achat HT (MAD)', 'Nb fournisseurs', '% du total'],
          breakdown: [...catMap.entries()].sort((a,b) => b[1].achat - a[1].achat).map(([cat, v]) => [
            cat, v.achat, v.count, totalAchat > 0 ? `${Math.round(v.achat / totalAchat * 100)}%` : '0%',
          ]),
        },
      }
      const res = await authFetch('/api/excel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message||'Erreur export') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-600 text-white shadow-lg">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Fournisseurs</h1>
              <p className="text-xs text-slate-500 mt-0.5">Base de données achats · {totalSuppliers} fournisseur{totalSuppliers > 1 ? 's' : ''} · {totalOrders} commandes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={exporting}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60">
              <Download className="h-4 w-4" />{exporting ? 'Export…' : 'Excel'}
            </button>
            <button onClick={() => loadAll()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setModal({})}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>

        {/* ── Toast ── */}
        {info && <Toast message={info.msg} type={info.ok ? 'success' : 'error'} onClose={() => setInfo(null)} />}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Building2 className="h-4 w-4"/></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fournisseurs</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{totalSuppliers}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ShoppingCart className="h-4 w-4"/></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Commandes</span>
            </div>
            <div className="text-2xl font-black text-blue-700">{totalOrders}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><TrendingUp className="h-4 w-4"/></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vol. Achat</span>
            </div>
            <div className="text-xl font-black text-slate-900">{mad(totalAchat)}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><BarChart2 className="h-4 w-4"/></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vol. Vente</span>
            </div>
            <div className="text-xl font-black text-emerald-700">{mad(totalVente)}</div>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Layers className="h-4 w-4"/></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Marge moy.</span>
            </div>
            <div className="flex items-center gap-2">
              <MargeBadge pct={avgMarge > 0 ? avgMarge : null} />
            </div>
          </div>
        </div>

        {/* ── Category Breakdown Bar ── */}
        {catBreakdown.length > 0 && totalAchat > 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
              <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500 shrink-0"/>
              <span className="text-sm font-bold text-slate-900">Répartition par catégorie</span>
              <span className="text-xs text-slate-400">Volume achat</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-end gap-2 h-24">
                {catBreakdown.map((c, i) => {
                  const maxAchat = Math.max(...catBreakdown.map(x => x.achat), 1)
                  const h = Math.max(8, (c.achat / maxAchat) * 100)
                  const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']
                  return (
                    <div key={c.cat} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="text-[10px] font-bold text-slate-600 tabular-nums">{mad(c.achat)}</div>
                      <div className="w-full rounded-t-lg transition-all group-hover:opacity-80"
                        style={{ height: `${h}%`, background: COLORS[i % COLORS.length], minHeight: 8 }} />
                      <div className="text-[9px] font-semibold text-slate-500 text-center leading-tight truncate w-full max-w-[90px]" title={c.cat}>{c.cat}</div>
                      <div className="text-[10px] text-slate-400">{c.count} frs</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Search ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un fournisseur…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 shadow-sm" />
          </div>
          <div className="text-xs font-semibold text-slate-400">{sorted.length} résultat{sorted.length > 1 ? 's' : ''}</div>
        </div>

        {/* ── Main Content: Table + Detail Panel ── */}
        <div className="flex gap-5">
          {/* Table */}
          <div className={`rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden transition-all ${selectedId ? 'flex-1 min-w-0' : 'w-full'}`}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="h-10 w-10 text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-700">Aucun fournisseur trouvé</p>
                <p className="text-xs text-slate-400 mt-1">Ajoute ton premier fournisseur pour commencer</p>
                <button onClick={() => setModal({})} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 shadow-sm">
                  <Plus className="h-4 w-4" /> Ajouter fournisseur
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: selectedId ? 650 : 850 }}>
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                        <span className="inline-flex items-center gap-1">Fournisseur <SortIcon k="name" /></span>
                      </th>
                      {!selectedId && <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Domaine</th>}
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Téléphone</th>
                      <th onClick={() => toggleSort('total_orders')} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                        <span className="inline-flex items-center gap-1">Cmd <SortIcon k="total_orders" /></span>
                      </th>
                      <th onClick={() => toggleSort('total_achat_ht')} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                        <span className="inline-flex items-center gap-1">Montant <SortIcon k="total_achat_ht" /></span>
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Contacts</th>
                      <th className="px-4 py-3 w-[120px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(s => {
                      const hasOrders = Number(s.total_orders) > 0
                      const isSelected = selectedId === s.id
                      const cc = contactCounts[s.id] || 0
                      return (
                        <tr key={s.id}
                          onClick={() => setSelectedId(isSelected ? null : s.id)}
                          className={`border-b border-slate-50 transition-colors cursor-pointer
                            ${isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/60'}`}>
                          {/* Nom + Région */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold
                                ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {s.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900 text-sm truncate block">{s.name}</span>
                                {s.address && <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{s.address}</div>}
                              </div>
                            </div>
                          </td>
                          {/* Domaine / Spécialité (category) */}
                          {!selectedId && (
                            <td className="px-4 py-3">
                              {s.category ? <span className="text-xs text-slate-600">{s.category}</span> : <span className="text-xs text-slate-300">--</span>}
                            </td>
                          )}
                          {/* Email */}
                          <td className="px-4 py-3">
                            {s.email ? (
                              <a href={`mailto:${s.email}`} onClick={e => e.stopPropagation()}
                                className="text-xs text-blue-600 hover:underline truncate block max-w-[180px]">
                                {s.email}
                              </a>
                            ) : <span className="text-xs text-slate-300">--</span>}
                          </td>
                          {/* Téléphone */}
                          <td className="px-4 py-3">
                            {s.tel ? (
                              <a href={`tel:${s.tel}`} onClick={e => e.stopPropagation()}
                                className="text-xs text-slate-700 hover:text-emerald-600 transition-colors">
                                {s.tel}
                              </a>
                            ) : <span className="text-xs text-slate-300">--</span>}
                          </td>
                          {/* Commandes */}
                          <td className="px-4 py-3 text-right">
                            {hasOrders ? <span className="font-bold text-slate-800 tabular-nums">{s.total_orders}</span>
                              : <span className="text-slate-300 text-xs">--</span>}
                          </td>
                          {/* Montant achat */}
                          <td className="px-4 py-3 text-right">
                            {hasOrders ? <span className="font-semibold text-slate-700 tabular-nums">{mad(s.total_achat_ht || 0)}</span>
                              : <span className="text-slate-300 text-xs">--</span>}
                          </td>
                          {/* Contacts count badge */}
                          <td className="px-4 py-3 text-center">
                            {cc > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                <Users className="h-3 w-3" />{cc}
                              </span>
                            ) : <span className="text-xs text-slate-300">0</span>}
                          </td>
                          {/* Actions: Fiche (eye), Edit (pencil), Delete (trash) */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setSelectedId(s.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                title="Fiche détail">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setModal(s)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                                title="Modifier">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDelete(s.id, s.name)} disabled={deleting === s.id}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                                title="Supprimer">
                                {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Panel (fiche fournisseur) */}
          {selectedRow && (
            <div className="w-[380px] flex-shrink-0 hidden xl:block">
              <SupplierDetail
                supplier={selectedRow}
                onClose={() => setSelectedId(null)}
                onEdit={() => setModal(selectedRow)}
                onContacts={() => setContactsModal(selectedRow)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal !== false && (
        <SupplierModal
          supplier={modal}
          userEmail={userEmail}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); toast('Fournisseur enregistré'); loadAll() }}
        />
      )}

      {contactsModal && (
        <SupplierContactsModal
          supplier={contactsModal}
          onClose={() => setContactsModal(null)}
          onCountChange={loadAll}
        />
      )}
    </div>
  )
}
