'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'

type StageDef = { stage: string; sort_order: number }
type Account = { id: string; name: string }
type Opp = {
  id: string
  title: string
  stage: string
  probability: number
  amount_mad: number
  close_date: string | null
  account_id: string
}

export default function PipelinePage() {
  const [stages, setStages] = useState<StageDef[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [items, setItems] = useState<Opp[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    const s = await supabase.from('stage_definitions').select('stage,sort_order').order('sort_order')
    const a = await supabase.from('accounts').select('id,name').order('name')
    const o = await supabase
      .from('opportunities')
      .select('id,title,stage,probability,amount_mad,close_date,account_id')
      .order('updated_at', { ascending: false })

    if (s.error) return setErr(s.error.message)
    if (a.error) return setErr(a.error.message)
    if (o.error) return setErr(o.error.message)

    setStages((s.data ?? []) as StageDef[])
    setAccounts((a.data ?? []) as Account[])
    setItems((o.data ?? []) as Opp[])
  }

  useEffect(() => {
    load()
  }, [])

  const accountNameById = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, a.name] as const))
    return (id: string) => m.get(id) ?? id
  }, [accounts])

  const byStage = useMemo(() => {
    const m = new Map<string, Opp[]>()
    for (const st of stages) m.set(st.stage, [])
    for (const o of items) {
      if (!m.has(o.stage)) m.set(o.stage, [])
      m.get(o.stage)!.push(o)
    }
    return m
  }, [items, stages])

  async function updateStage(id: string, newStage: string) {
    setErr(null)
    const { error } = await supabase.from('opportunities').update({ stage: newStage }).eq('id', id)
    if (error) return setErr(error.message)
    setItems(prev => prev.map(o => (o.id === id ? { ...o, stage: newStage } : o)))
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ marginTop: 0 }}>Pipeline</h1>
        <button type="button" onClick={load}>Rafraîchir</button>
      </div>

      {err && <div style={{ color: 'crimson' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
        {stages.map(s => {
          const list = byStage.get(s.stage) ?? []
          const total = list.reduce((acc, x) => acc + Number(x.amount_mad || 0), 0)

          return (
            <div key={s.stage} style={{ minWidth: 320, border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b>{s.stage}</b>
                <span style={{ opacity: 0.8 }}>{list.length} | {total.toLocaleString()} MAD</span>
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {list.map(o => (
                  <div key={o.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{o.title}</div>
                    <div style={{ opacity: 0.85, marginTop: 4 }}>{accountNameById(o.account_id)}</div>
                    <div style={{ opacity: 0.9, marginTop: 6 }}>
                      <b>{Number(o.amount_mad).toLocaleString()}</b> MAD — Close: {o.close_date ?? '-'}
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <select value={o.stage} onChange={e => updateStage(o.id, e.target.value)}>
                        {stages.map(ss => (
                          <option key={ss.stage} value={ss.stage}>{ss.stage}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
