'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'

type Account = { id: string; name: string }
type Opp = { id: string; title: string; account_id: string }

type Ticket = {
  id: string
  opportunity_id: string
  priority: 'P1' | 'P2' | 'P3'
  vendor: string | null
  request_summary: string
  status: 'NEW' | 'IN PROGRESS' | 'WAITING VENDOR' | 'PRICING RECEIVED' | 'READY TO SEND' | 'BOOKING PENDING' | 'DONE' | 'BLOCKED'
  deadline: string | null
  last_update: string | null
  created_at: string
}

const STATUSES: Ticket['status'][] = [
  'NEW',
  'IN PROGRESS',
  'WAITING VENDOR',
  'PRICING RECEIVED',
  'READY TO SEND',
  'BOOKING PENDING',
  'DONE',
  'BLOCKED',
]

export default function InsidePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [opps, setOpps] = useState<Opp[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // form
  const [oppId, setOppId] = useState('')
  const [priority, setPriority] = useState<Ticket['priority']>('P2')
  const [vendor, setVendor] = useState('')
  const [summary, setSummary] = useState('')
  const [deadline, setDeadline] = useState('')

  const [filterStatus, setFilterStatus] = useState<string>('')

  async function load() {
    setErr(null)
    setLoading(true)

    const a = await supabase.from('accounts').select('id,name').order('name')
    const o = await supabase.from('opportunities').select('id,title,account_id').order('updated_at', { ascending: false })
    const t = await supabase
      .from('inside_tickets')
      .select('id,opportunity_id,priority,vendor,request_summary,status,deadline,last_update,created_at')
      .order('created_at', { ascending: false })

    setLoading(false)

    if (a.error) return setErr(a.error.message)
    if (o.error) return setErr(o.error.message)
    if (t.error) return setErr(t.error.message)

    setAccounts((a.data ?? []) as Account[])
    setOpps((o.data ?? []) as Opp[])
    setTickets((t.data ?? []) as Ticket[])
  }

  useEffect(() => {
    load()
  }, [])

  const accountNameById = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, a.name] as const))
    return (id: string) => m.get(id) ?? id
  }, [accounts])

  const oppById = useMemo(() => {
    const m = new Map(opps.map(o => [o.id, o] as const))
    return (id: string) => m.get(id)
  }, [opps])

  const filtered = useMemo(() => {
    if (!filterStatus) return tickets
    return tickets.filter(t => t.status === filterStatus)
  }, [tickets, filterStatus])

  async function addTicket(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    if (!oppId) return setErr('Choisis un deal.')
    if (!summary.trim()) return setErr('Résumé obligatoire.')

    const { data, error } = await supabase
      .from('inside_tickets')
      .insert({
        opportunity_id: oppId,
        priority,
        vendor: vendor.trim() || null,
        request_summary: summary.trim(),
        status: 'NEW',
        deadline: deadline || null,
      })
      .select('id,opportunity_id,priority,vendor,request_summary,status,deadline,last_update,created_at')
      .single()

    if (error) return setErr(error.message)

    // synchroniser le statut "inside_status" sur l'opportunité (MVP)
    await supabase.from('opportunities').update({ inside_status: 'NEW' }).eq('id', oppId)

    setTickets(prev => [data as Ticket, ...prev])
    setOppId('')
    setPriority('P2')
    setVendor('')
    setSummary('')
    setDeadline('')
  }

  async function updateTicket(id: string, patch: Partial<Ticket>) {
    setErr(null)
    const { data, error } = await supabase
      .from('inside_tickets')
      .update(patch)
      .eq('id', id)
      .select('id,opportunity_id,priority,vendor,request_summary,status,deadline,last_update,created_at')
      .single()

    if (error) return setErr(error.message)

    // sync statut opportunité (on suppose 1 ticket principal par deal)
    if (patch.status && data?.opportunity_id) {
      await supabase.from('opportunities').update({ inside_status: patch.status }).eq('id', data.opportunity_id)
    }

    setTickets(prev => prev.map(t => (t.id === id ? (data as Ticket) : t)))
  }

  function isOverdue(d: string | null) {
    if (!d) return false
    const today = new Date()
    const dd = new Date(d + 'T00:00:00')
    return dd.getTime() < new Date(today.toDateString()).getTime()
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ marginTop: 0 }}>Inside (Salim)</h1>
        <button type="button" onClick={load}>Rafraîchir</button>
      </div>

      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      {loading && <div>Chargement…</div>}

      <form onSubmit={addTicket} style={{ display: 'grid', gap: 8, maxWidth: 820, marginTop: 10 }}>
        <b>Créer un ticket Inside</b>

        <select value={oppId} onChange={e => setOppId(e.target.value)}>
          <option value="">— Choisir un deal —</option>
          {opps.map(o => (
            <option key={o.id} value={o.id}>
              {accountNameById(o.account_id)} — {o.title}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>Priorité&nbsp;
            <select value={priority} onChange={e => setPriority(e.target.value as any)}>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </label>

          <input style={{ width: 260 }} placeholder="Vendor (ex: Dell / Fortinet…)" value={vendor} onChange={e => setVendor(e.target.value)} />

          <label>Deadline&nbsp;
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </label>
        </div>

        <input placeholder="Résumé (ex: Demande pricing + booking number)" value={summary} onChange={e => setSummary(e.target.value)} />

        <button>Créer ticket</button>
      </form>

      <div style={{ height: 16 }} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <b>Filtrer</b>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">— Tous —</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 12, borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <b>{filtered.length}</b> ticket(s)
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {filtered.map(t => {
            const o = oppById(t.opportunity_id)
            const accName = o ? accountNameById(o.account_id) : '(deal inconnu)'
            const overdue = isOverdue(t.deadline)

            return (
              <div key={t.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {accName} — {o?.title ?? t.opportunity_id}
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.9 }}>
                      <b>{t.priority}</b> | Vendor: {t.vendor ?? '-'} | Deadline:{' '}
                      <b style={{ color: overdue ? 'crimson' : 'inherit' }}>{t.deadline ?? '-'}</b>
                    </div>
                    <div style={{ marginTop: 6 }}>{t.request_summary}</div>
                  </div>

                  <div style={{ minWidth: 240 }}>
                    <label>Statut&nbsp;
                      <select
                        value={t.status}
                        onChange={e => updateTicket(t.id, { status: e.target.value as any })}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>

                    <div style={{ marginTop: 10 }}>
                      <input
                        placeholder="Dernière maj (note courte)"
                        defaultValue={t.last_update ?? ''}
                        onBlur={e => updateTicket(t.id, { last_update: e.target.value || null })}
                        style={{ width: '100%' }}
                      />
                      <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>
                        (écris puis clique ailleurs pour sauvegarder)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
