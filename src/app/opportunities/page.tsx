'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'

type Account = { id: string; name: string }
type StageDef = { stage: string; sort_order: number }

type OpportunityRow = {
  id: string
  title: string
  bu: 'INFRA' | 'CSG' | 'CYBER' | 'SERVICE'
  deal_type: 'AO' | 'Run' | 'Projet' | 'Renouvellement'
  stage: string
  probability: number
  amount_mad: number
  margin_pct: number
  close_date: string | null
  next_step: string | null
  next_step_due: string | null
  inside_status: string
  account_id: string
}

export default function OpportunitiesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stages, setStages] = useState<StageDef[]>([])
  const [items, setItems] = useState<OpportunityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // form
  const [accountId, setAccountId] = useState('')
  const [title, setTitle] = useState('')
  const [bu, setBu] = useState<'INFRA' | 'CSG' | 'CYBER' | 'SERVICE'>('INFRA')
  const [dealType, setDealType] = useState<'AO' | 'Run' | 'Projet' | 'Renouvellement'>('AO')
  const [stage, setStage] = useState('Lead')
  const [amount, setAmount] = useState('0')
  const [marginPct, setMarginPct] = useState('10')
  const [closeDate, setCloseDate] = useState('')

  const [q, setQ] = useState('')

  async function loadAll() {
    setErr(null)
    setLoading(true)

    const a = await supabase.from('accounts').select('id,name').order('name')
    const s = await supabase.from('stage_definitions').select('stage,sort_order').order('sort_order')
    const o = await supabase
      .from('opportunities')
      .select('id,title,bu,deal_type,stage,probability,amount_mad,margin_pct,close_date,next_step,next_step_due,inside_status,account_id')
      .order('created_at', { ascending: false })

    setLoading(false)

    if (a.error) return setErr(a.error.message)
    if (s.error) return setErr(s.error.message)
    if (o.error) return setErr(o.error.message)

    setAccounts((a.data ?? []) as Account[])
    setStages((s.data ?? []) as StageDef[])
    setItems((o.data ?? []) as OpportunityRow[])
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (!stages.length) return
    if (!stages.find(x => x.stage === stage)) setStage(stages[0].stage)
  }, [stages]) // eslint-disable-line

  const accountNameById = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, a.name] as const))
    return (id: string) => m.get(id) ?? id
  }, [accounts])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return items
    return items.filter(o => (o.title + ' ' + accountNameById(o.account_id)).toLowerCase().includes(qq))
  }, [items, q, accountNameById])

  async function addDeal(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    if (!accountId) return setErr('Choisis un compte.')
    if (!title.trim()) return setErr('Titre obligatoire.')

    const amountNum = Number(amount.replace(',', '.')) || 0
    const marginNum = Number(marginPct.replace(',', '.')) || 0

    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        account_id: accountId,
        title: title.trim(),
        bu,
        deal_type: dealType,
        stage,
        amount_mad: amountNum,
        margin_pct: marginNum,
        close_date: closeDate || null,
      })
      .select('id,title,bu,deal_type,stage,probability,amount_mad,margin_pct,close_date,next_step,next_step_due,inside_status,account_id')
      .single()

    if (error) return setErr(error.message)

    setItems(prev => [data as OpportunityRow, ...prev])

    setTitle('')
    setAmount('0')
    setMarginPct('10')
    setCloseDate('')
    setStage('Lead')
  }

  return (
    <AppShell>
      <h1 style={{ marginTop: 0 }}>Deals</h1>

      <form onSubmit={addDeal} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
        <b>Créer un deal</b>

        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">— Choisir un compte —</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <input placeholder="Titre (ex: 50 laptops Dell Latitude)" value={title} onChange={e => setTitle(e.target.value)} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>BU&nbsp;
            <select value={bu} onChange={e => setBu(e.target.value as any)}>
              <option value="INFRA">INFRA</option>
              <option value="CSG">CSG</option>
              <option value="CYBER">CYBER</option>
              <option value="SERVICE">SERVICE</option>
            </select>
          </label>

          <label>Type&nbsp;
            <select value={dealType} onChange={e => setDealType(e.target.value as any)}>
              <option value="AO">AO</option>
              <option value="Run">Run</option>
              <option value="Projet">Projet</option>
              <option value="Renouvellement">Renouvellement</option>
            </select>
          </label>

          <label>Stage&nbsp;
            <select value={stage} onChange={e => setStage(e.target.value)}>
              {stages.map(s => (
                <option key={s.stage} value={s.stage}>{s.stage}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input style={{ width: 200 }} placeholder="Montant MAD" value={amount} onChange={e => setAmount(e.target.value)} />
          <input style={{ width: 200 }} placeholder="Marge % (ex 10)" value={marginPct} onChange={e => setMarginPct(e.target.value)} />
          <label>Close date&nbsp;
            <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
          </label>
        </div>

        <button>Créer</button>
      </form>

      <div style={{ height: 16 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          placeholder="Rechercher (compte ou titre)…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ width: 360 }}
        />
        <button type="button" onClick={loadAll}>Rafraîchir</button>
      </div>

      {err && <div style={{ color: 'crimson', marginTop: 10 }}>{err}</div>}
      {loading && <div style={{ marginTop: 10 }}>Chargement…</div>}

      <div style={{ marginTop: 12, borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <b>{filtered.length}</b> deal(s)
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {filtered.map(o => (
            <div key={o.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{o.title}</div>
                  <div style={{ opacity: 0.85, marginTop: 4 }}>
                    {accountNameById(o.account_id)} — {o.bu} — {o.deal_type}
                  </div>
                </div>
                <div style={{ textAlign: 'right', opacity: 0.9 }}>
                  <div><b>{Number(o.amount_mad).toLocaleString()}</b> MAD</div>
                  <div>Marge: {o.margin_pct}%</div>
                </div>
              </div>

              <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', opacity: 0.9 }}>
                <span>Stage: <b>{o.stage}</b> ({o.probability}%)</span>
                <span>Close: <b>{o.close_date ?? '-'}</b></span>
                <span>Inside: <b>{o.inside_status}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
