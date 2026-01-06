'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'

type Account = {
  id: string
  name: string
  region: string | null
  segment: string | null
  created_at: string
}

export default function AccountsPage() {
  const [items, setItems] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [segment, setSegment] = useState('')

  const [q, setQ] = useState('')

  async function load() {
    setErr(null)
    setLoading(true)
    const { data, error } = await supabase
      .from('accounts')
      .select('id,name,region,segment,created_at')
      .order('name', { ascending: true })

    setLoading(false)
    if (error) return setErr(error.message)
    setItems((data ?? []) as Account[])
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return items
    return items.filter(a => a.name.toLowerCase().includes(qq))
  }, [items, q])

  async function addAccount(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    const n = name.trim()
    if (!n) return setErr('Le nom du compte est obligatoire.')

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        name: n,
        region: region.trim() || null,
        segment: segment.trim() || null,
      })
      .select('id,name,region,segment,created_at')
      .single()

    if (error) return setErr(error.message)

    setItems(prev => {
      const next = [data as Account, ...prev]
      next.sort((a, b) => a.name.localeCompare(b.name))
      return next
    })

    setName('')
    setRegion('')
    setSegment('')
  }

  return (
    <AppShell>
      <h1 style={{ marginTop: 0 }}>Comptes</h1>

      <form onSubmit={addAccount} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        <b>Ajouter un compte</b>
        <input placeholder="Nom (ex: APTIV)" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Région (ex: Rabat / Casa / Nord…)" value={region} onChange={e => setRegion(e.target.value)} />
        <input placeholder="Segment (ex: Industrie / Banque…)" value={segment} onChange={e => setSegment(e.target.value)} />
        <button>Créer</button>
      </form>

      <div style={{ height: 16 }} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          placeholder="Rechercher un compte…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ width: 320 }}
        />
        <button onClick={load} type="button">Rafraîchir</button>
      </div>

      {err && <div style={{ color: 'crimson', marginTop: 10 }}>{err}</div>}
      {loading && <div style={{ marginTop: 10 }}>Chargement…</div>}

      <div style={{ marginTop: 12, borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <b>{filtered.length}</b> compte(s)
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {filtered.map(a => (
            <div key={a.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700 }}>{a.name}</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Région: {a.region ?? '-'} | Segment: {a.segment ?? '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
