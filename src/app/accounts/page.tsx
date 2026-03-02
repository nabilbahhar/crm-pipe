'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type AccountRow = {
  id: string
  name: string
  sector: string | null // Segment client: Public / Semi-public / Privé
  segment: string | null // Secteur d’activité: Industrie, Banque, Assurance...
  region: string | null
}

type ContactRow = {
  id: string
  account_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
}

const SEGMENT_CLIENT_OPTIONS = ['Public', 'Semi-public', 'Privé'] as const
const REGION_OPTIONS = ['Rabat', 'Casablanca', 'Nord Ma', 'Sud Ma'] as const

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-600">{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400 ${props.className || ''}`}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400 ${props.className || ''}`}
    />
  )
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
) {
  const v = props.variant || 'ghost'
  const cls =
    v === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-800'
      : v === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-500'
        : 'bg-white hover:bg-slate-100'
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm ${cls} ${props.className || ''}`}
    />
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{children}</span>
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      {/* plus large + hauteur contrôlée */}
      <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(85vh-64px)]">{children}</div>
      </div>
    </div>
  )
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Add form
  const [name, setName] = useState('')
  const [segmentClient, setSegmentClient] = useState<(typeof SEGMENT_CLIENT_OPTIONS)[number]>('Privé')
  const [sectorActivite, setSectorActivite] = useState('') // accounts.segment
  const [region, setRegion] = useState<(typeof REGION_OPTIONS)[number]>('Rabat')

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<AccountRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editSegmentClient, setEditSegmentClient] = useState<(typeof SEGMENT_CLIENT_OPTIONS)[number]>('Privé')
  const [editSectorActivite, setEditSectorActivite] = useState('')
  const [editRegion, setEditRegion] = useState<(typeof REGION_OPTIONS)[number]>('Rabat')
  const [busyEdit, setBusyEdit] = useState(false)

  // Contacts modal
  const [contactsOpen, setContactsOpen] = useState(false)
  const [contactsAccount, setContactsAccount] = useState<AccountRow | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  const [cFullName, setCFullName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cRole, setCRole] = useState('')
  const [cPrimary, setCPrimary] = useState(false)

  const uniqueSectorActivite = useMemo(() => {
    const s = new Set<string>()
    for (const a of accounts) {
      if (a.segment && a.segment.trim()) s.add(a.segment.trim())
    }
    return Array.from(s).sort((x, y) => x.localeCompare(y))
  }, [accounts])

  const loadAccounts = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id,name,sector,segment,region')
        .order('name', { ascending: true })

      if (error) throw error
      setAccounts((data || []) as AccountRow[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement comptes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const existsExactName = (n: string, excludeId?: string) => {
    const x = n.trim().toLowerCase()
    if (!x) return false
    return accounts.some(a => a.id !== excludeId && (a.name || '').trim().toLowerCase() === x)
  }

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)

    const n = name.trim()
    if (!n) return setErr('Client obligatoire.')
    if (!sectorActivite.trim()) return setErr('Secteur d’activité obligatoire.')
    if (!region) return setErr('Région obligatoire.')

    if (existsExactName(n)) {
      return setErr('Ce client existe déjà (même nom). Utilise l’autocomplete pour éviter les doublons.')
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('accounts').insert({
        name: n,
        sector: segmentClient,
        segment: sectorActivite.trim(),
        region,
      })
      if (error) throw error

      setName('')
      setSectorActivite('')
      setSegmentClient('Privé')
      setRegion('Rabat')
      await loadAccounts()
    } catch (e: any) {
      setErr(e?.message || 'Erreur ajout compte')
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (row: AccountRow) => {
    setErr(null)
    setEditRow(row)
    setEditName(row.name || '')
    setEditSegmentClient((row.sector as any) || 'Privé')
    setEditSectorActivite(row.segment || '')
    setEditRegion((row.region as any) || 'Rabat')
    setEditOpen(true)
  }

  const onSaveEdit = async () => {
    if (!editRow) return
    setErr(null)

    const n = editName.trim()
    if (!n) return setErr('Client obligatoire.')
    if (!editSectorActivite.trim()) return setErr('Secteur d’activité obligatoire.')
    if (!editRegion) return setErr('Région obligatoire.')

    if (existsExactName(n, editRow.id)) {
      return setErr('Un autre compte existe déjà avec ce nom.')
    }

    setBusyEdit(true)
    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: n,
          sector: editSegmentClient,
          segment: editSectorActivite.trim(),
          region: editRegion,
        })
        .eq('id', editRow.id)

      if (error) throw error
      setEditOpen(false)
      setEditRow(null)
      await loadAccounts()
    } catch (e: any) {
      setErr(e?.message || 'Erreur modification')
    } finally {
      setBusyEdit(false)
    }
  }

  const friendlyDeleteError = (message: string) => {
    const m = (message || '').toLowerCase()

    // FK opportunities -> on interdit suppression si deals existent
    if (m.includes('violates foreign key constraint') || m.includes('foreign key')) {
      return (
        `Suppression impossible : ce client a des deals liés.\n` +
        `Action : supprime / réaffecte d’abord les deals de ce client, puis réessaie.`
      )
    }

    if (m.includes('row-level security')) {
      return (
        `Suppression bloquée par la sécurité (RLS).\n` +
        `Si tu veux, on met une policy qui autorise Nabil + Salim.`
      )
    }

    return message || 'Erreur suppression'
  }

  const deleteAccount = async (row: AccountRow) => {
    const ok = window.confirm(
      `Supprimer le compte "${row.name}" ?\n\nSi ce client a des deals liés, la suppression sera refusée.`
    )
    if (!ok) return

    setErr(null)
    setLoading(true)
    try {
      const { error } = await supabase.from('accounts').delete().eq('id', row.id)
      if (error) throw error

      if (editRow?.id === row.id) {
        setEditOpen(false)
        setEditRow(null)
      }
      if (contactsAccount?.id === row.id) {
        setContactsOpen(false)
        setContactsAccount(null)
        setContacts([])
      }

      await loadAccounts()
    } catch (e: any) {
      setErr(friendlyDeleteError(e?.message || 'Erreur suppression'))
    } finally {
      setLoading(false)
    }
  }

  // ---------------- Contacts modal ----------------

  const loadContacts = async (accountId: string) => {
    setContactsLoading(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('account_contacts')
        .select('id,account_id,full_name,email,phone,role,is_primary')
        .eq('account_id', accountId)
        .order('is_primary', { ascending: false })
        .order('full_name', { ascending: true })

      if (error) throw error
      setContacts((data || []) as ContactRow[])
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement contacts')
    } finally {
      setContactsLoading(false)
    }
  }

  const openContacts = async (row: AccountRow) => {
    setContactsAccount(row)
    setContactsOpen(true)
    setCFullName('')
    setCEmail('')
    setCPhone('')
    setCRole('')
    setCPrimary(false)
    await loadContacts(row.id)
  }

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactsAccount) return
    setErr(null)

    const fn = cFullName.trim()
    if (!fn) return setErr('Nom du contact obligatoire.')

    setContactsLoading(true)
    try {
      if (cPrimary) {
        const r0 = await supabase
          .from('account_contacts')
          .update({ is_primary: false })
          .eq('account_id', contactsAccount.id)
        if (r0.error) throw r0.error
      }

      const { error } = await supabase.from('account_contacts').insert({
        account_id: contactsAccount.id,
        full_name: fn,
        email: cEmail.trim() || null,
        phone: cPhone.trim() || null,
        role: cRole.trim() || null,
        is_primary: cPrimary,
      })
      if (error) throw error

      setCFullName('')
      setCEmail('')
      setCPhone('')
      setCRole('')
      setCPrimary(false)

      await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur ajout contact')
    } finally {
      setContactsLoading(false)
    }
  }

  const setPrimary = async (contactId: string) => {
    if (!contactsAccount) return
    setErr(null)
    setContactsLoading(true)
    try {
      const r1 = await supabase
        .from('account_contacts')
        .update({ is_primary: false })
        .eq('account_id', contactsAccount.id)
      if (r1.error) throw r1.error

      const r2 = await supabase.from('account_contacts').update({ is_primary: true }).eq('id', contactId)
      if (r2.error) throw r2.error

      await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur set principal')
    } finally {
      setContactsLoading(false)
    }
  }

  const deleteContact = async (row: ContactRow) => {
    const ok = window.confirm(`Supprimer le contact "${row.full_name || ''}" ?`)
    if (!ok) return
    setErr(null)
    setContactsLoading(true)
    try {
      const { error } = await supabase.from('account_contacts').delete().eq('id', row.id)
      if (error) throw error
      if (contactsAccount) await loadContacts(contactsAccount.id)
    } catch (e: any) {
      setErr(e?.message || 'Erreur suppression contact')
    } finally {
      setContactsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Comptes</div>
            <div className="text-sm text-slate-500">Créer / modifier les clients (base CRM).</div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={loadAccounts} disabled={loading}>
              {loading ? 'Chargement…' : 'Rafraîchir'}
            </Button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {/* Ajouter */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">Ajouter un client</div>

          <form onSubmit={onAdd} className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <FieldLabel>Client *</FieldLabel>
              <Input
                placeholder="Ex: BKAM / APTIV"
                value={name}
                onChange={(e) => setName(e.target.value)}
                list="accounts_names"
              />
              <datalist id="accounts_names">
                {accounts.map(a => <option key={a.id} value={a.name} />)}
              </datalist>
              <div className="mt-1 text-[11px] text-slate-500">
                Tape “B”, “BK” pour retrouver le nom exact et éviter les doublons.
              </div>
            </div>

            <div>
              <FieldLabel>Segment client *</FieldLabel>
              <Select value={segmentClient} onChange={(e) => setSegmentClient(e.target.value as any)}>
                {SEGMENT_CLIENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>

            <div>
              <FieldLabel>Secteur d’activité *</FieldLabel>
              <Input
                placeholder="Industrie / Banque / Assurance…"
                value={sectorActivite}
                onChange={(e) => setSectorActivite(e.target.value)}
                list="sectors_list"
              />
              <datalist id="sectors_list">
                {uniqueSectorActivite.map(x => <option key={x} value={x} />)}
              </datalist>
              <div className="mt-1 text-[11px] text-slate-500">
                Si tu ajoutes un nouveau secteur, il deviendra disponible ensuite.
              </div>
            </div>

            <div>
              <FieldLabel>Région *</FieldLabel>
              <Select value={region} onChange={(e) => setRegion(e.target.value as any)}>
                {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>

            <div className="flex items-end">
              <Button variant="primary" type="submit" disabled={loading} className="w-full">
                Ajouter
              </Button>
            </div>
          </form>
        </div>

        {/* Liste */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Liste des clients</div>
            <div className="text-xs text-slate-500">{accounts.length} clients</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-slate-500">
                <tr className="border-b">
                  <th className="py-2">Client</th>
                  <th className="py-2">Segment client</th>
                  <th className="py-2">Secteur d’activité</th>
                  <th className="py-2">Région</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="py-2 font-medium text-slate-900">{a.name}</td>
                    <td className="py-2">{a.sector || '—'}</td>
                    <td className="py-2">{a.segment || '—'}</td>
                    <td className="py-2">{a.region || '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => openEdit(a)}>Modifier</Button>
                        <Button onClick={() => openContacts(a)}>Contacts</Button>
                        <Button variant="danger" onClick={() => deleteAccount(a)}>Supprimer</Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Aucun client pour l’instant.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit modal */}
        <Modal
          open={editOpen}
          title={editRow ? `Modifier : ${editRow.name}` : 'Modifier'}
          onClose={() => setEditOpen(false)}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Client *</FieldLabel>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div>
              <FieldLabel>Segment client *</FieldLabel>
              <Select value={editSegmentClient} onChange={(e) => setEditSegmentClient(e.target.value as any)}>
                {SEGMENT_CLIENT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>

            <div>
              <FieldLabel>Région *</FieldLabel>
              <Select value={editRegion} onChange={(e) => setEditRegion(e.target.value as any)}>
                {REGION_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            </div>

            <div className="md:col-span-2">
              <FieldLabel>Secteur d’activité *</FieldLabel>
              <Input
                value={editSectorActivite}
                onChange={(e) => setEditSectorActivite(e.target.value)}
                list="sectors_list_edit"
              />
              <datalist id="sectors_list_edit">
                {uniqueSectorActivite.map(x => <option key={x} value={x} />)}
              </datalist>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button variant="primary" onClick={onSaveEdit} disabled={busyEdit}>
                {busyEdit ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>

            {editRow ? (
              <Button variant="danger" onClick={() => deleteAccount(editRow)} disabled={busyEdit}>
                Supprimer le compte
              </Button>
            ) : null}
          </div>
        </Modal>

        {/* Contacts modal */}
        <Modal
          open={contactsOpen}
          title={contactsAccount ? `Contacts — ${contactsAccount.name}` : 'Contacts'}
          onClose={() => {
            setContactsOpen(false)
            setContactsAccount(null)
            setContacts([])
          }}
        >
          {!contactsAccount ? null : (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                {contactsAccount.sector ? <Chip>{contactsAccount.sector}</Chip> : null}
                {contactsAccount.segment ? <Chip>{contactsAccount.segment}</Chip> : null}
                {contactsAccount.region ? <Chip>{contactsAccount.region}</Chip> : null}
                <div className="flex-1" />
                <Button onClick={() => loadContacts(contactsAccount.id)} disabled={contactsLoading}>
                  {contactsLoading ? '...' : 'Rafraîchir'}
                </Button>
              </div>

              <div className="rounded-2xl border bg-white p-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">Ajouter un contact</div>

                <form onSubmit={addContact} className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <FieldLabel>Nom *</FieldLabel>
                    <Input value={cFullName} onChange={(e) => setCFullName(e.target.value)} placeholder="Ex: Bounab Ikram" />
                  </div>
                  <div>
                    <FieldLabel>Email</FieldLabel>
                    <Input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="ex@client.com" />
                  </div>
                  <div>
                    <FieldLabel>Téléphone</FieldLabel>
                    <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="06..." />
                  </div>

                  <div className="md:col-span-3">
                    <FieldLabel>Rôle</FieldLabel>
                    <Input value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="Responsable compte / Acheteur / DSI..." />
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={cPrimary} onChange={(e) => setCPrimary(e.target.checked)} />
                      Principal
                    </label>
                    <Button variant="primary" type="submit" disabled={contactsLoading}>
                      Ajouter
                    </Button>
                  </div>
                </form>
              </div>

              <div className="mt-4 rounded-2xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Liste des contacts</div>
                  <div className="text-xs text-slate-500">{contacts.length} contacts</div>
                </div>

                {/* plus de min-width + table-fixed + truncate => moins besoin de slider */}
                <div className="overflow-x-hidden">
                  <table className="w-full table-fixed text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b">
                        <th className="py-2 w-[22%]">Nom</th>
                        <th className="py-2 w-[20%]">Rôle</th>
                        <th className="py-2 w-[26%]">Email</th>
                        <th className="py-2 w-[14%]">Téléphone</th>
                        <th className="py-2 w-[8%]">Principal</th>
                        <th className="py-2 w-[10%]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id} className="border-b last:border-b-0">
                          <td className="py-2 font-medium text-slate-900 truncate" title={c.full_name || ''}>{c.full_name || '—'}</td>
                          <td className="py-2 truncate" title={c.role || ''}>{c.role || '—'}</td>
                          <td className="py-2 truncate" title={c.email || ''}>{c.email || '—'}</td>
                          <td className="py-2 truncate" title={c.phone || ''}>{c.phone || '—'}</td>
                          <td className="py-2">{c.is_primary ? <Chip>Oui</Chip> : <span className="text-slate-400">Non</span>}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              {!c.is_primary ? <Button onClick={() => setPrimary(c.id)}>Définir</Button> : null}
                              <Button variant="danger" onClick={() => deleteContact(c)}>Suppr.</Button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {contacts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            Aucun contact pour l’instant.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  )
}
